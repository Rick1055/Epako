"""
Epako Voice AI API (FastAPI): dysarthric speech in, corrected text and speech in the patient's chosen voice out,
plus sessions, server-measured biomarkers and the clinician's PDF report. Routes and tables: docs/contract.md.
"""

import os
import io
import time
import json
import re
import base64
import tempfile
from datetime import datetime, timezone
import threading
import functools
import asyncio
import collections
from typing import Optional, Dict, Any, List
from uuid import UUID

import numpy as np
import librosa
import soundfile as sf
import local_tts
from speech_gate import contains_speech

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request, Response, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Epako Voice AI API",
    description="Dysarthric speech correction and session telemetry",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
_MAX_WS_CHUNK_BYTES = 256 * 1024
_MAX_VOICE_NOTES = 10
_MAX_SOCKETS_PER_USER = 2   # each live socket holds a 30 s audio buffer
_open_sockets = collections.Counter()   # shortcut: per worker process; move to Postgres if you run several workers
_MAX_BODY_BYTES = {"/api/voice/bank": (_MAX_VOICE_NOTES + 1) * _MAX_UPLOAD_BYTES}   # elsewhere: one upload as base64, 2x


class BodyLimit:
    """Stops reading a request body past its route's cap as it arrives. A chunked upload has no Content-Length, and
    FastAPI reads or spools a whole body to disk before any route can check its size."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        cap, seen = _MAX_BODY_BYTES.get(scope["path"], 2 * _MAX_UPLOAD_BYTES), 0

        async def bounded():
            nonlocal seen
            message = await receive()
            seen += len(message.get("body", b""))
            if seen > cap:
                raise HTTPException(status_code=413, detail="Upload too large.")
            return message
        await self.app(scope, bounded, send)


app.add_middleware(BodyLimit)

# CORS Middleware - origins come from CORS_ALLOWED_ORIGINS (comma-separated); default is none
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Lazy-Loaded Model Singletons (the API starts without waiting for models; warm_models loads them in the background)
# ---------------------------------------------------------------------------
_asr_engine = None
_restoration_engine = None
_ASR_LOAD_LOCK = threading.Lock()


@app.on_event("startup")
def warm_models():
    """The recognizer loads in ~60 s, a voice in ~10 s and the first pitch shift in ~3 s; do it before a patient is waiting."""
    def run():
        try:
            get_asr_engine()
        except Exception as e:
            print(f"[!] Recognizer warm-up failed: {e}")
        from voice_restoration import VoiceRestorationEngine
        names = dict.fromkeys([local_tts.DEFAULT_VOICE, *VoiceRestorationEngine().voice_palette.values()])
        for i, name in enumerate(names):
            try:
                local_tts.synthesize("Ready.", name, pitch="+1Hz" if i == 0 else "+0Hz")
            except Exception as e:
                print(f"[!] Voice warm-up failed for {name}: {e}")
    threading.Thread(target=run, daemon=True).start()


def get_repair_engine(token, user_id):
    """Repair engine seeded with this patient's learned corrections (read under their own JWT), plus their vocabulary
    for snapping only while their recent confirmed texts show they are repeating words (on new words it does harm)."""
    try:
        from feedback_engine import FeedbackEngine
        from intent_repair import IntentRepair
        from vocabulary import REPEAT_WINDOW, Vocabulary
        # one round trip: the profile with its newest confirmed sentences nested in it
        rows = user_client(token).table("patient_profiles").select(
            "id, phonetic_corrections, vocabulary, session_utterances(corrected_text, created_at)").eq("user_id", user_id) \
            .order("created_at", desc=True, foreign_table="session_utterances").limit(REPEAT_WINDOW, foreign_table="session_utterances").execute().data
        row = rows[0] if rows else {}
        vocab = Vocabulary(row.get("vocabulary") or {})
        recent = [u["corrected_text"] or "" for u in reversed(row.get("session_utterances") or [])]
        return IntentRepair(FeedbackEngine(row.get("phonetic_corrections") or {}), vocab if vocab.repeating(recent) else None)
    except Exception as e:
        raise fail(503, "Repair engine unavailable.", e)


def get_restoration_engine():
    global _restoration_engine
    if _restoration_engine is None:
        try:
            from voice_restoration import VoiceRestorationEngine
            _restoration_engine = VoiceRestorationEngine(sample_rate=16000)
            print("[+] VoiceRestorationEngine loaded.")
        except Exception as e:
            print(f"[!] Warning: Could not load VoiceRestorationEngine: {e}")
            _restoration_engine = None
    return _restoration_engine


def get_asr_engine():
    global _asr_engine
    with _ASR_LOAD_LOCK:
        if _asr_engine is None:
            try:
                from speech_recognizer import DysarthriaSpeechRecognizer
                _asr_engine = DysarthriaSpeechRecognizer()
                print("[+] DysarthriaSpeechRecognizer loaded successfully.")
            except Exception as e:
                raise fail(503, "Speech recognizer unavailable.", e)
        return _asr_engine


def verify_token(token: str):
    try:
        client = _auth_client()
    except Exception as e:
        raise fail(503, "Auth unavailable.", e)
    try:
        res = client.auth.get_user(token)
    except Exception:
        res = None
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return res.user


def _connections():
    """A pool of open HTTP/1.1 connections. Over long-lived HTTP/2 ones, 21 of 240 requests failed with "Server
    disconnected" when Supabase dropped a connection; over HTTP/1.1, 0 (measured 2026-10-25)."""
    import httpx
    from postgrest.constants import DEFAULT_POSTGREST_CLIENT_TIMEOUT
    return httpx.Client(http2=False, follow_redirects=True, timeout=DEFAULT_POSTGREST_CLIENT_TIMEOUT)


@functools.lru_cache(maxsize=1)
def _query_connections():
    """One pool for every patient query: a new Supabase client per query cost ~0.7 s (measured 2026-10-25)."""
    return _connections()


def user_client(token: str):
    """Database client acting as the caller, so RLS applies to every query. The token travels in this client's own
    headers with each request; the shared connections carry no one's token."""
    from postgrest import SyncPostgrestClient
    from postgrest.constants import DEFAULT_POSTGREST_CLIENT_HEADERS
    url, key = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/"), (os.getenv("SUPABASE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(status_code=503, detail="Database access is not configured.")
    return SyncPostgrestClient(f"{url}/rest/v1", headers={**DEFAULT_POSTGREST_CLIENT_HEADERS, "apikey": key, "Authorization": f"Bearer {token}"},
                               http_client=_query_connections())


@functools.lru_cache(maxsize=1)
def service_client():
    """Server-only writer for tables clients may not write (biomarker_logs). Never expose this key."""
    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Server write access is not configured.")
    return create_client(url, key, options=SyncClientOptions(httpx_client=_connections()))   # its own pool, not the patients'


def fail(status: int, public: str, exc: Exception) -> HTTPException:
    """Logs the real error server-side and returns a message that leaks no internals."""
    print(f"[!] {public} {exc}")
    return HTTPException(status_code=status, detail=public)


@functools.lru_cache(maxsize=1)
def _auth_client():
    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions
    url, key = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/"), (os.getenv("SUPABASE_KEY") or "").strip()
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")   # verify_token turns this into a 503
    return create_client(url, key, options=SyncClientOptions(httpx_client=_connections()))


def _password_ok(email, password, captcha_token) -> bool:
    """Re-authentication before destructive actions: a real sign-in, so Supabase's CAPTCHA needs the delete screen's token.
    shortcut: accounts without a password (magic link/OAuth) cannot pass yet."""
    from supabase_manager import SupabaseManager
    try:
        return bool(SupabaseManager().client.auth.sign_in_with_password(
            {"email": email, "password": password, "options": {"captcha_token": captcha_token}}).user)
    except Exception as e:
        print(f"[!] Re-authentication refused: {e}")   # e.g. a wrong password or a missing/invalid CAPTCHA token
        return False


def _reauth_ok(user, token, password, captcha_token=None) -> bool:
    """Password accounts must re-enter the password; passwordless accounts (magic link / OAuth) must have signed in within 5 minutes."""
    if "email" in (user.app_metadata or {}).get("providers", []):
        return bool(password) and _password_ok(user.email, password, captcha_token)
    claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    return any(time.time() - a.get("timestamp", 0) < 300 for a in claims.get("amr", []))  # time of the last real sign-in, not of a token refresh


def hit(name: str, user_id, limit: int, per: float = 60.0) -> None:
    """Per-user sliding-window limit kept in Postgres (rate_limit_hit), so it is shared by every worker and survives restarts."""
    try:
        allowed = service_client().rpc("rate_limit_hit", {"p_name": name, "p_user": str(user_id), "p_limit": limit, "p_seconds": int(per)}).execute().data
    except Exception as e:
        raise fail(503, "Rate limiter unavailable.", e)  # fail closed: if the database is down, auth is down too
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests.", headers={"Retry-After": str(int(per))})


async def require_user(authorization: Optional[str] = Header(None)):
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return await asyncio.to_thread(verify_token, token)


def rate_limit(name: str, limit: int, per: float = 60.0):
    """Dependency: authenticates the caller, then applies hit()."""
    async def dep(user=Depends(require_user)):
        await asyncio.to_thread(hit, name, user.id, limit, per)
        return user
    return dep


# ---------------------------------------------------------------------------
# Helper: Audio Conversions & Signal Processing
# ---------------------------------------------------------------------------
def decode_audio_bytes(audio_bytes: bytes, target_sr: int = 16000) -> np.ndarray:
    """Reads raw audio bytes (WAV, MP3, OGG, WebM) into a 16kHz float32 numpy array.
    Anything that is not decodable audio at a real sample rate is refused with 400, never a crash."""
    try:
        with sf.SoundFile(io.BytesIO(audio_bytes)) as f:
            sr = f.samplerate
            if not 8000 <= sr <= 192000:   # a forged header (1 Hz, 2 GHz) would otherwise reach the engines
                raise HTTPException(status_code=400, detail="Unsupported sample rate.")
            data = f.read(frames=(MAX_AUDIO_SECONDS + 1) * sr, dtype="float32")  # bounded: never decode more than needed to see it is too long
    except HTTPException:
        raise
    except Exception:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            data, sr = librosa.load(tmp_path, sr=target_sr, mono=True, duration=MAX_AUDIO_SECONDS + 1)
        except Exception as e:
            raise fail(400, "Unsupported or corrupt audio.", e)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    if len(data) > MAX_AUDIO_SECONDS * sr:
        raise HTTPException(status_code=413, detail=f"Audio longer than {MAX_AUDIO_SECONDS} seconds.")

    if data.ndim > 1:
        data = np.mean(data, axis=1)

    if sr != target_sr:
        data = librosa.resample(data, orig_sr=sr, target_sr=target_sr)

    return np.asarray(data, dtype=np.float32)


def audio_to_base64_wav(audio: np.ndarray, sample_rate: int = 16000) -> str:
    """Encodes float32 numpy array into base64 Data URL (data:audio/wav;base64,...)."""
    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_16")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:audio/wav;base64,{b64_str}"


async def synthesize_neural_async(
    text: str,
    voice: str = local_tts.DEFAULT_VOICE,
    pitch: str = "+0Hz",
    rate: str = "+0%",
    volume: str = "+0%",
    warmth: int = 0,
    roughness: int = 0,
) -> Dict[str, Any]:
    """On-device neural voice synthesis (Piper); the text never leaves this machine."""
    try:
        return await asyncio.to_thread(local_tts.synthesize, text, voice, pitch, rate, volume, 16000, warmth, roughness)
    except FileNotFoundError as e:
        print(f"[!] {e}")
        raise HTTPException(status_code=503, detail="Voice model not installed.")


# ---------------------------------------------------------------------------
# Pydantic Request Models
# ---------------------------------------------------------------------------
class VoiceProfile(BaseModel):
    """The saved voice (patient_profiles.voice_profile); the ranges are what synthesis can honour."""
    template: str = "male_smooth_warm"
    pitch_hz: int = Field(default=0, ge=-100, le=100)
    rate_pct: int = Field(default=0, ge=-50, le=100)
    volume_pct: int = Field(default=0, ge=-50, le=50)
    warmth_pct: int = Field(default=0, ge=-20, le=20)
    roughness_pct: int = Field(default=0, ge=0, le=20)

    @field_validator("template")
    @classmethod
    def known_template(cls, v):
        engine = get_restoration_engine()
        if engine is None:
            raise HTTPException(status_code=503, detail="Voice engine unavailable.")   # a server fault, not a bad profile: not a ValueError
        if v not in engine.voice_palette:
            raise ValueError("unknown voice template")
        return v


class VoiceSculptRequest(VoiceProfile):
    sample_phrase: str = Field(default="The morning sun gently illuminates the quiet cedar grove.", max_length=300)


class ClinicalPdfReportRequest(BaseModel):
    session_id: UUID
    inline: bool = True


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {"status": "online"}


@app.post("/api/rectify")
async def rectify_speech(
    request: Request,
    file: Optional[UploadFile] = File(None),
    authorization: str = Header(...),
    user=Depends(rate_limit("rectify", 30)),
):
    """
    Speech correction: audio (multipart file or JSON base64) -> speech gate -> recogniser -> repair -> the patient's saved voice
    """
    start_total = time.time()
    raw_bytes = None

    if int(request.headers.get("content-length") or 0) > 2 * _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            b64_str = body.get("audio_base64", "").split(",")[-1]
            if b64_str:
                raw_bytes = base64.b64decode(b64_str)
        except HTTPException:
            raise   # 413 from BodyLimit
        except Exception as e:
            raise fail(400, "Invalid JSON payload.", e)
    elif file is not None:
        raw_bytes = await file.read()
    else:
        # Check form data
        try:
            form = await request.form()
            if "file" in form and hasattr(form["file"], "read"):
                raw_bytes = await form["file"].read()
            elif "audio_base64" in form:
                raw_bytes = base64.b64decode(str(form["audio_base64"]).split(",")[-1])
        except HTTPException:
            raise   # 413 from BodyLimit
        except Exception:
            pass

    if raw_bytes and len(raw_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Missing audio payload. Provide audio file or audio_base64.")

    audio = await asyncio.to_thread(decode_audio_bytes, raw_bytes, target_sr=16000)
    if len(audio) < 1600:
        raise HTTPException(status_code=400, detail="Audio sample too short (<100ms).")

    # 0. Silence and noise must never become a sentence: the recogniser invents one if asked
    if not await asyncio.to_thread(contains_speech, audio):
        return {
            "success": True,
            "speech_detected": False,
            "raw_transcript": "",
            "repaired_text": "",
            "rectified_audio": None,
            "voice_error": None,
            "latency": {"asr_ms": 0.0, "repair_ms": 0.0, "synthesis_ms": 0.0, "total_ms": round((time.time() - start_total) * 1000.0, 1)},
            "telemetry": None,
        }

    # 1. Transcribe using Dysarthria ASR, reading the patient's learning and voice from the database meanwhile
    asr = await asyncio.to_thread(get_asr_engine)
    asr_res, repair_eng, (voice, voice_failure) = await asyncio.gather(
        asyncio.to_thread(asr.transcribe, audio, sample_rate=16000),
        asyncio.to_thread(get_repair_engine, authorization.partition(' ')[2], user.id),
        attempt(get_voice, authorization.partition(' ')[2], user.id))
    raw_transcript = asr_res.get("text", "")
    asr_latency = asr_res.get("latency_ms", 0.0)

    # 2. Intent & Dysfluency Repair
    repair_res = await asyncio.to_thread(repair_eng.repair, raw_transcript, asr_res.get("words"))   # snapping calls espeak: seconds on a cold cache
    repaired_text = repair_res.get("repaired_text", raw_transcript)
    repair_latency = repair_res.get("latency_ms", 1.0)

    # 3. Neural Voice Synthesis
    synth_latency = 0.0
    audio_output_b64 = None
    voice_error = None

    if repaired_text:
        if voice_failure is not None:
            if voice_failure.status_code != 422:
                raise voice_failure
            voice_error = voice_failure.detail   # broken saved voice: the text still goes back, spoken in no other voice
        else:
            synth_res = await synthesize_neural_async(text=repaired_text, **voice)
            synth_latency = synth_res.get("latency_ms", 0.0)
            audio_output_b64 = audio_to_base64_wav(synth_res["audio"], 16000)
    # nothing understood: say so (no audio), never hand the patient's own recording back as "rectified"

    # 4. Fast Clinical Telemetry
    try:
        from biomarker_engine import compute_articulation_velocity
        telemetry = await asyncio.to_thread(compute_articulation_velocity, audio, sample_rate=16000)
    except Exception as e:
        raise fail(503, "Biomarker engine unavailable.", e)

    total_latency = (time.time() - start_total) * 1000.0

    return {
        "success": True,
        "speech_detected": True,
        "raw_transcript": raw_transcript,
        "repaired_text": repaired_text,
        "rectified_audio": audio_output_b64,
        "voice_error": voice_error,
        "latency": {
            "asr_ms": round(asr_latency, 1),
            "repair_ms": round(repair_latency, 1),
            "synthesis_ms": round(synth_latency, 1),
            "total_ms": round(total_latency, 1),
        },
        "telemetry": telemetry,
    }


@app.post("/api/biomarkers", dependencies=[Depends(rate_limit("biomarkers", 20))])
async def extract_clinical_biomarkers(file: UploadFile = File(...)):
    """
    Speech Gym: Extracts deep objective clinical biomarkers from speech audio.
    Used for SLP longitudinal tracking and patient practice monitoring.
    """
    raw_bytes = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(raw_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")
    audio = await asyncio.to_thread(decode_audio_bytes, raw_bytes, target_sr=16000)

    results = {}
    try:
        from biomarker_engine import (
            compute_articulation_velocity,
            compute_phonatory_instability,
            compute_formant_centralization,
        )
        results["velocity"] = await asyncio.to_thread(compute_articulation_velocity, audio, sample_rate=16000)
        results["instability"] = await asyncio.to_thread(compute_phonatory_instability, audio, sample_rate=16000)
        results["formant_compression"] = await asyncio.to_thread(compute_formant_centralization, audio, sample_rate=16000)
    except Exception as e:
        raise fail(503, "Biomarker engine unavailable.", e)

    return {"success": True, "biomarkers": results}


async def attempt(fn, *args):
    """(result, None) or (None, HTTPException) from fn in a worker thread: the failure is acted on only if the result is needed."""
    try:
        return await asyncio.to_thread(fn, *args), None
    except HTTPException as e:
        return None, e


def voice_settings(p: Dict[str, Any]) -> Dict[str, Any]:
    """synthesize_neural_async arguments for a sculpted profile (VoiceRestorationEngine.create_sculpted_profile)."""
    return {"voice": p["voice_id"], "pitch": p["pitch"], "rate": p["rate"], "volume": p["volume"],
            "warmth": p["warmth_pct"], "roughness": p["roughness_pct"]}


def get_voice(token, user_id) -> Dict[str, Any]:
    """The patient's saved voice ({} until they save one: the default voice). Never taken from the request."""
    try:
        rows = user_client(token).table("patient_profiles").select("voice_profile").eq("user_id", user_id).execute().data
    except Exception as e:
        raise fail(503, "Voice profile unavailable.", e)
    try:
        profile = VoiceProfile(**((rows[0].get("voice_profile") if rows else None) or {}))
    except (ValidationError, TypeError) as e:   # TypeError: not even an object (written around the API)
        raise fail(422, "The saved voice profile is invalid; please save it again.", e)
    return voice_settings(get_restoration_engine().create_sculpted_profile(**profile.model_dump()))


@app.put("/api/voice/profile")
def save_voice_profile(profile: VoiceProfile, authorization: str = Header(...), user=Depends(rate_limit("voice_profile", 20))):
    """Saves the voice /api/rectify and /ws/rectify speak with (from /api/voice/sculpt or /api/voice/bank)."""
    saved = user_client(authorization.partition(" ")[2]).table("patient_profiles") \
        .update({"voice_profile": profile.model_dump()}).eq("user_id", user.id).execute().data
    if not saved:
        raise HTTPException(status_code=404, detail="No patient profile.")
    return {"success": True, "profile": profile.model_dump()}


@app.post("/api/voice/sculpt", dependencies=[Depends(rate_limit("sculpt", 20))])
async def sculpt_voice_timbre(request: VoiceSculptRequest):
    """
    Voice Identity Studio: Real-time preview of sculpted voice parameters.
    """
    restoration_eng = await asyncio.to_thread(get_restoration_engine)
    if not restoration_eng:
        raise HTTPException(status_code=500, detail="Voice restoration engine unavailable.")

    profile = restoration_eng.create_sculpted_profile(**request.model_dump(include=set(VoiceProfile.model_fields)))
    synth_res = await synthesize_neural_async(text=request.sample_phrase, **voice_settings(profile))

    audio_b64 = audio_to_base64_wav(synth_res["audio"], 16000)

    return {
        "success": True,
        "profile": profile,
        "audio_base64": audio_b64,
        "latency_ms": round(synth_res["latency_ms"], 1),
    }


@app.post("/api/voice/bank", dependencies=[Depends(rate_limit("bank", 5))])
async def bank_premorbid_voice(files: List[UploadFile] = File(...)):
    """
    Voice banking: estimates voice settings (closest stock voice, pitch, rate, warmth, roughness) from recordings
    made before the illness. It does not clone the voice.
    """
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 clean voice notes.")
    if len(files) > _MAX_VOICE_NOTES:   # each is written to disk and analysed: an unbounded list fills the disk
        raise HTTPException(status_code=400, detail=f"Please upload at most {_MAX_VOICE_NOTES} voice notes.")

    restoration_eng = await asyncio.to_thread(get_restoration_engine)
    temp_paths = []
    try:
        for f in files:
            data = await f.read(_MAX_UPLOAD_BYTES + 1)
            if len(data) > _MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Upload too large.")
            # only a plain extension from the client's file name: ".w:av" is an NTFS stream, a long one cannot be created
            ext = os.path.splitext(os.path.basename(f.filename or ""))[1]
            with tempfile.NamedTemporaryFile(suffix=ext if re.fullmatch(r"\.[A-Za-z0-9]{1,8}", ext) else "", delete=False) as buffer:
                buffer.write(data)
                temp_paths.append(buffer.name)

        try:
            profile = await asyncio.to_thread(restoration_eng.create_profile_from_voice_notes, temp_paths, min_notes=2)
        except ValueError as e:   # no clear speech in enough of the notes
            raise fail(422, "No clear speech found in the voice notes; please upload recordings of the person talking.", e)
        except Exception as e:
            raise fail(400, "Unsupported or corrupt audio.", e)
        return {
            "success": True,
            "profile": profile,
            "message": "Voice settings estimated from your recordings. Save them to use them, or adjust them first.",
        }
    finally:
        for p in temp_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


class DeleteDataRequest(BaseModel):
    confirm: str
    password: Optional[str] = Field(default=None, max_length=256)
    captcha_token: Optional[str] = Field(default=None, max_length=4096)   # Turnstile token from the delete screen


def _purge_audio(writer, uid: str) -> None:
    """Removes every stored audio object under the user's folder; raises if any remain."""
    bucket = writer.storage.from_("patient_audio")

    def files_under(prefix):
        found = []
        for entry in bucket.list(prefix, {"limit": 1000}):
            path = f"{prefix}/{entry['name']}"
            found += files_under(path) if entry.get("id") is None else [path]  # id is None for folders
        return found

    paths = files_under(uid)
    if paths:
        bucket.remove(paths)
    if files_under(uid):
        raise RuntimeError("audio objects remain after deletion")


@app.delete("/api/me/data")
def delete_my_data(req: DeleteDataRequest, authorization: str = Header(...), user=Depends(rate_limit("delete", 3, 3600))):
    """
    Permanently erases the caller's account: stored audio, then the auth user,
    whose deletion cascades to profile, sessions, biomarkers, utterances, grants and link codes.
    Audio goes first so a failure leaves the account intact and the request can be retried.
    """
    if req.confirm != "DELETE":
        raise HTTPException(status_code=400, detail='Send {"confirm": "DELETE"} to proceed.')
    if not _reauth_ok(user, authorization.partition(" ")[2], req.password, req.captcha_token):
        raise HTTPException(status_code=403, detail="Re-authentication failed.")
    uid = str(UUID(str(user.id)))
    writer = service_client()
    try:
        _purge_audio(writer, uid)
    except Exception as e:
        raise fail(500, "Audio deletion failed; nothing else was deleted.", e)
    try:
        writer.auth.admin.delete_user(uid)
    except Exception as e:
        # shortcut: clinicians who authored assessments hit a foreign key here; hand-over flow comes later
        raise fail(409, "Account could not be deleted.", e)
    return {"success": True}


class UtteranceIn(BaseModel):
    raw_transcript: str = Field(max_length=1000)
    shown_text: str = Field(max_length=1000)
    final_text: str = Field(min_length=1, max_length=1000)
    latency_ms: float = Field(default=0, ge=0, le=60000)


def own_session(client, user_id, session_id: str) -> str:
    """Returns the caller's patient id if the session is theirs; 404 otherwise."""
    prof = client.table("patient_profiles").select("id").eq("user_id", user_id).execute().data
    sess = client.table("therapy_sessions").select("patient_id").eq("id", session_id).execute().data
    if not (prof and sess and sess[0]["patient_id"] == prof[0]["id"]):
        raise HTTPException(status_code=404, detail="Session not found.")
    return prof[0]["id"]


@app.post("/api/sessions")
def start_session(authorization: str = Header(...), user=Depends(rate_limit("sessions", 30))):
    client = user_client(authorization.partition(" ")[2])
    prof = client.table("patient_profiles").select("id").eq("user_id", user.id).execute().data
    if not prof:
        raise HTTPException(status_code=404, detail="No patient profile.")
    row = service_client().table("therapy_sessions").insert({"patient_id": prof[0]["id"]}).execute().data
    return {"session_id": row[0]["id"]}


@app.post("/api/sessions/{session_id}/utterances")
def save_utterance(session_id: UUID, req: UtteranceIn, authorization: str = Header(...), user=Depends(rate_limit("utterance", 120))):
    """The patient's yes/no (final_text == shown_text means yes) is stored and teaches their correction table and vocabulary."""
    from feedback_engine import FeedbackEngine, words
    from vocabulary import Vocabulary
    client = user_client(authorization.partition(" ")[2])
    patient_id = own_session(client, user.id, str(session_id))
    confirmed = words(req.shown_text) == words(req.final_text)
    profile = client.table("patient_profiles").select("phonetic_corrections, vocabulary").eq("id", patient_id).execute().data[0]
    engine, vocab = FeedbackEngine(profile["phonetic_corrections"] or {}), Vocabulary(profile.get("vocabulary") or {})
    reward = engine.learn(req.raw_transcript, req.shown_text, req.final_text)
    vocab.add(req.final_text)
    service_client().table("session_utterances").insert({
        "session_id": str(session_id), "patient_id": patient_id,
        "transcribed_text": req.raw_transcript, "corrected_text": req.final_text,
        "confirmed": confirmed, "latency_ms": req.latency_ms,
    }).execute()
    # shortcut: read-modify-write, so two simultaneous saves can lose one lesson; use an RPC if that matters
    # server key: patients cannot write what the server learns (migration 20261031); patient_id was checked by own_session
    try:
        service_client().table("patient_profiles").update({"phonetic_corrections": engine.table, "vocabulary": vocab.counts}).eq("id", patient_id).execute()
    except Exception as e:
        raise fail(503, "Your sentence was saved, but learning from it failed.", e)
    return {"confirmed": confirmed, "reward": round(reward, 3)}


@app.post("/api/sessions/{session_id}/finish")
def finish_session(session_id: UUID, authorization: str = Header(...), user=Depends(rate_limit("finish", 30))):
    """Accuracy, count and duration are computed here from stored rows, not taken from the client."""
    client = user_client(authorization.partition(" ")[2])
    sid = str(session_id)
    own_session(client, user.id, sid)
    started = client.table("therapy_sessions").select("created_at").eq("id", sid).execute().data[0]["created_at"]
    utts = client.table("session_utterances").select("confirmed").eq("session_id", sid).execute().data
    accuracy = 100.0 * sum(u["confirmed"] for u in utts) / len(utts) if utts else 0.0
    duration = (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds()
    update = {"duration_seconds": round(duration, 2), "utterances_count": len(utts), "accuracy_rate": round(accuracy, 2)}
    service_client().table("therapy_sessions").update(update).eq("id", sid).execute()
    return update


@app.post("/api/session/analyze")
async def analyze_session_audio(
    session_id: UUID = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(...),
    user=Depends(rate_limit("analyze", 20)),
):
    """Measures biomarkers on the server and stores them; clients cannot write biomarker_logs."""
    raw_bytes = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(raw_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")

    token = authorization.partition(" ")[2]
    patient_id = await asyncio.to_thread(lambda: own_session(user_client(token), user.id, str(session_id)))
    writer = service_client()

    audio = await asyncio.to_thread(decode_audio_bytes, raw_bytes, target_sr=16000)
    try:
        from biomarker_engine import (compute_articulation_velocity, compute_phonatory_instability,
                                      compute_formant_centralization, compute_composite_score)
        art = await asyncio.to_thread(compute_articulation_velocity, audio, sample_rate=16000)
        pho = await asyncio.to_thread(compute_phonatory_instability, audio, sample_rate=16000)
        frm = await asyncio.to_thread(compute_formant_centralization, audio, sample_rate=16000)
    except Exception as e:
        raise fail(503, "Biomarker engine unavailable.", e)

    voiced = pho["mean_f0"] > 0  # the engine returns 0.0 when too little voiced speech; that is "not measured"
    record = {
        "session_id": str(session_id),
        "patient_id": patient_id,
        "articulation_velocity": art["articulation_velocity"],
        "speaking_rate": art["speaking_rate"],
        "pause_ratio": art["pause_ratio"],
        "formant_compression_index": frm["formant_compression_index"],
        "vocal_jitter_pct": pho["jitter_percent"] if voiced else None,
        "vocal_shimmer_pct": pho["shimmer_percent"] if voiced else None,
        "mean_f0_hz": pho["mean_f0"] if voiced else None,
        "stability_index": compute_composite_score(art, pho, frm) if voiced else None,
        "metrics": {"articulation": art, "phonatory_instability": pho, "vowel_space": frm},
    }
    try:
        saved = await asyncio.to_thread(lambda: writer.table("biomarker_logs").insert(record).execute().data)
    except Exception as e:
        raise fail(500, "Could not store biomarkers.", e)
    return {"success": True, "biomarkers": saved[0] if saved else record}


# ---------------------------------------------------------------------------
# Clinical PDF report, built only from stored rows
# ---------------------------------------------------------------------------
@app.post("/api/session/report/pdf")
def create_clinical_pdf_report(
    req: ClinicalPdfReportRequest,
    authorization: str = Header(...),
    user=Depends(rate_limit("report", 20)),
):
    """
    Everything in the report comes from the database under the caller's JWT (RLS applies):
    server-measured biomarkers, stored utterances and the assessment written by a verified,
    patient-authorised clinician. Nothing clinical is accepted from the request body.
    """
    try:
        from pdf_generator import generate_clinical_pdf
    except ImportError:
        from src.pdf_generator import generate_clinical_pdf

    session_id = str(req.session_id)
    client = user_client(authorization.partition(" ")[2])
    sessions = client.table("therapy_sessions").select("patient_id").eq("id", session_id).execute().data
    if not sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    assessments = client.table("clinical_assessments").select("*").eq("session_id", session_id).order("updated_at", desc=True).limit(1).execute().data
    if not assessments:
        raise HTTPException(status_code=422, detail="No clinician assessment exists for this session.")
    assessment = assessments[0]
    clinicians = client.table("clinicians").select("display_name").eq("user_id", assessment["clinician_id"]).execute().data
    if not clinicians:
        raise HTTPException(status_code=422, detail="Assessing clinician is not visible to you.")
    bios = client.table("biomarker_logs").select("*").eq("session_id", session_id).order("created_at", desc=True).limit(1).execute().data
    if not bios:
        raise HTTPException(status_code=422, detail="Session has no biomarkers.")
    utts = client.table("session_utterances").select("*").eq("session_id", session_id).order("created_at").execute().data
    row = bios[0]
    biomarkers = {k: row.get(k) for k in (
        "articulation_velocity", "speaking_rate", "pause_ratio", "formant_compression_index",
        "vocal_jitter_pct", "vocal_shimmer_pct", "mean_f0_hz", "stability_index")}
    missing = [k for k, v in biomarkers.items() if v is None and k != "formant_compression_index"]
    if missing:
        raise HTTPException(status_code=422, detail=f"Session lacks measured values: {missing}")
    vowels = (row.get("metrics") or {}).get("vowel_space") or {}   # the vowel-space chart's points, stored by /api/session/analyze
    biomarkers.update({k: vowels.get(k) for k in ("mean_f1", "mean_f2", "f1_dispersion", "f2_dispersion")})

    report_data = {
        "session_id": session_id,
        "evaluation_date": time.strftime("%B %d, %Y"),
        "patient": {
            "name": "De-identified",
            "id": sessions[0]["patient_id"],
            "condition": assessment["condition"],
            "clinician": clinicians[0]["display_name"],
        },
        "biomarkers": biomarkers,
        "utterances": [
            {"original_text": u["transcribed_text"], "repaired_text": u["corrected_text"] or u["transcribed_text"],
             "latency_ms": float(u["latency_ms"] or 0)}
            for u in utts],
        "slp_assessment": {k: assessment[k] for k in ("impression", "home_plan", "frequency")},
    }

    try:
        pdf_bytes = generate_clinical_pdf(report_data)
    except KeyError as e:
        raise fail(422, "Report data incomplete.", e)
    except Exception as e:
        raise fail(500, "Failed to generate clinical PDF.", e)

    disposition_type = "inline" if req.inline else "attachment"
    headers = {
        "Content-Disposition": f"{disposition_type}; filename=epako_clinical_report_{session_id}.pdf",
        "Content-Type": "application/pdf"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


# ---------------------------------------------------------------------------
# 3. LIVE CONVERSATION STREAMING WEBSOCKET (measured /api/rectify 2026-10-25, RTX 3050 on mains power, live Supabase,
#    warm: the patient waits median 772 ms, p90 1190 ms; ~480 ms of it is the sign-in check and rate limit, two ~220 ms
#    database round trips; ASR median ~140 ms. On battery the GPU is up to 10x slower)
# ---------------------------------------------------------------------------
@app.websocket("/ws/rectify")
async def websocket_speech_rectifier(websocket: WebSocket):
    """
    Full-Duplex Streaming Speech Rectification.
    The client streams audio frames in real time.
    The server returns live loudness telemetry while the patient speaks, and the corrected
    text and speech when a pause is detected.
    """
    await websocket.accept()
    try:
        auth_msg = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=10))
        if auth_msg.get("type") != "auth" or auth_msg.get("sample_rate") != 16000 or auth_msg.get("encoding") != "pcm_s16le":
            raise ValueError("first message must be auth with sample_rate 16000 and encoding pcm_s16le")
        user = await asyncio.to_thread(verify_token, auth_msg.get("token") or "")
        await asyncio.to_thread(hit, "ws", user.id, 10)
    except Exception:
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return
    if _open_sockets[user.id] >= _MAX_SOCKETS_PER_USER:
        await websocket.close(code=1008)
        return
    _open_sockets[user.id] += 1
    print("[+] WebSocket client connected to /ws/rectify")

    max_buffer = 30 * 16000
    audio_buffer = np.zeros(max_buffer, dtype=np.float32)
    buffered = 0
    is_speaking = False
    silence_frames = 0
    silence_threshold = 0.015
    min_speech_frames = 5
    max_silence_frames = 7
    last_auth = time.monotonic()

    try:
        while True:
            message = await websocket.receive()
            if time.monotonic() - last_auth > 300:  # a long-lived socket must not outlive an expired or revoked token
                try:
                    await asyncio.to_thread(verify_token, auth_msg["token"])
                except HTTPException:
                    await websocket.close(code=1008)
                    return
                last_auth = time.monotonic()
            raw_bytes = None

            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    if payload.get("type") == "audio_chunk" and payload.get("data"):
                        raw_bytes = base64.b64decode(payload["data"].split(",")[-1])
                    elif payload.get("type") == "ping":
                        await websocket.send_json({"type": "pong", "time": time.time()})
                        continue
                except Exception:
                    continue

            if not raw_bytes:
                continue
            if len(raw_bytes) > _MAX_WS_CHUNK_BYTES:
                await websocket.close(code=1009)
                return

            try:
                chunk = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            except Exception:
                continue

            rms = float(np.sqrt(np.mean(chunk**2))) if len(chunk) > 0 else 0.0

            if rms > silence_threshold:
                is_speaking = True
                silence_frames = 0
            elif is_speaking:
                silence_frames += 1
            if is_speaking:
                n = min(len(chunk), max_buffer - buffered)
                audio_buffer[buffered:buffered + n] = chunk[:n]
                buffered += n

            # Send immediate live telemetry back to animate frontend oscilloscope
            await websocket.send_json({
                "type": "telemetry",
                "rms": round(rms, 4),
                "is_speaking": is_speaking,
                "buffer_len": buffered,
            })

            # When speech ends, run rectification
            if is_speaking and (buffered >= max_buffer or (silence_frames >= max_silence_frames and buffered >= (min_speech_frames * len(chunk)))):
                utterance_audio = audio_buffer[:buffered].copy()
                buffered = 0
                is_speaking = False
                silence_frames = 0

                start_rectify = time.time()

                try:   # every utterance costs recogniser time: same budget as POST /api/rectify
                    await asyncio.to_thread(hit, "rectify", user.id, 30)
                except HTTPException as e:
                    await websocket.send_json({"type": "error", "detail": e.detail})
                    continue

                if not await asyncio.to_thread(contains_speech, utterance_audio):
                    await websocket.send_json({"type": "no_speech"})
                    continue

                asr = await asyncio.to_thread(get_asr_engine)
                asr_res, repair, (voice, voice_failure) = await asyncio.gather(   # database reads run while the recogniser does
                    asyncio.to_thread(asr.transcribe, utterance_audio, sample_rate=16000),
                    asyncio.to_thread(get_repair_engine, auth_msg['token'], user.id),
                    attempt(get_voice, auth_msg['token'], user.id))
                raw_text = asr_res.get("text", "")
                repaired = (await asyncio.to_thread(repair.repair, raw_text, asr_res.get("words"))).get("repaired_text", raw_text)

                audio_b64, voice_error = None, None  # nothing understood: no audio, never the patient's own recording as "rectified"
                if repaired:
                    if voice_failure is not None:
                        if voice_failure.status_code != 422:
                            await websocket.send_json({"type": "error", "detail": voice_failure.detail})
                            continue
                        voice_error = voice_failure.detail   # broken saved voice: the text still goes out, spoken in no other voice
                    else:
                        synth = await synthesize_neural_async(repaired, **voice)
                        audio_b64 = audio_to_base64_wav(synth["audio"], 16000)

                latency_ms = (time.time() - start_rectify) * 1000.0

                await websocket.send_json({
                    "type": "rectified_output",
                    "raw_text": raw_text,
                    "repaired_text": repaired,
                    "audio_base64": audio_b64,
                    "voice_error": voice_error,
                    "latency_ms": round(latency_ms, 1),
                })

    except WebSocketDisconnect:
        print("[-] WebSocket client disconnected.")
    except Exception as e:
        print(f"[!] WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        _open_sockets[user.id] -= 1
        if _open_sockets[user.id] <= 0:
            del _open_sockets[user.id]


# ---------------------------------------------------------------------------
# Direct Run (Standalone Server on port 8000)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print("\n[+] Starting Epako Voice AI Speech Gateway on http://localhost:8000 ...")
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False, log_level="info")

