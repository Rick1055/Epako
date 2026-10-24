"""
Epako Voice AI - Clinical Speech API & Low-Latency Streaming Gateway
FastAPI + WebSockets + Acoustic Telemetry + Supabase Integration

Endpoints:
- WS   /ws/rectify        : Full-duplex streaming audio rectification & real-time telemetry
- POST /api/rectify       : Batch audio speech rectification & neural voice restoration
- POST /api/biomarkers    : Clinical bio-acoustic telemetry extraction (Speech Gym)
- POST /api/voice/sculpt  : Real-time vocal parameter sculpting (Warmth, Cadence, Pitch)
- POST /api/voice/bank    : Pre-morbid voice note acoustic extraction & profile banking
- GET  /health            : Service health and GPU compute status
"""

import os
import io
import time
import json
import base64
import tempfile
import threading
import asyncio
from typing import Optional, Dict, Any, List

import numpy as np
import librosa
import soundfile as sf
import edge_tts

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Request, Response, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Epako Voice AI API",
    description="Compassionate Biological Speech Restoration & Clinical Telemetry Gateway",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# CORS Middleware - origins come from CORS_ALLOWED_ORIGINS (comma-separated); default is none
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy-Loaded Model Singletons (Ensures instant API startup < 500ms)
# ---------------------------------------------------------------------------
_asr_engine = None
_restoration_engine = None
_ASR_LOAD_LOCK = threading.Lock()


def get_repair_engine(patient_id):
    try:
        from feedback_engine import FeedbackEngine
        from intent_repair import IntentRepair
        return IntentRepair(feedback_engine=FeedbackEngine(patient_id=patient_id))
    except Exception as e:
        print(f"[!] Warning: Could not load IntentRepair: {e}")
        class FallbackRepair:
            def repair(self, text):
                import re
                cleaned = re.sub(r'(\w+)(?:\s+)+', r'', text, flags=re.IGNORECASE).strip()
                if cleaned:
                    cleaned = cleaned[0].upper() + cleaned[1:]
                    if cleaned[-1] not in ".!?":
                        cleaned += "."
                return {"original_text": text, "repaired_text": cleaned, "latency_ms": 2.0}
        return FallbackRepair()


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
                raise HTTPException(status_code=503, detail=f"Speech recognizer unavailable: {e}")
        return _asr_engine


def verify_token(token: str):
    try:
        from supabase_manager import SupabaseManager
        client = SupabaseManager().client
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Auth unavailable: {e}")
    try:
        res = client.auth.get_user(token)
    except Exception:
        res = None
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return res.user


async def require_user(authorization: Optional[str] = Header(None)):
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return await asyncio.to_thread(verify_token, token)


# ---------------------------------------------------------------------------
# Helper: Audio Conversions & Signal Processing
# ---------------------------------------------------------------------------
def decode_audio_bytes(audio_bytes: bytes, target_sr: int = 16000) -> np.ndarray:
    """Reads raw audio bytes (WAV, MP3, OGG, WebM) into a 16kHz float32 numpy array."""
    try:
        data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
    except Exception:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            data, sr = librosa.load(tmp_path, sr=target_sr, mono=True)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

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
    voice: str = "en-US-GuyNeural",
    pitch: str = "+0Hz",
    rate: str = "+0%",
) -> Dict[str, Any]:
    """Async neural voice synthesis with zero event-loop blocking."""
    start = time.time()
    communicate = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        output_path = tmp.name
    try:
        await communicate.save(output_path)
        audio, sr = sf.read(output_path, dtype="float32")
    finally:
        os.remove(output_path)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if sr != 16000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        sr = 16000
    latency_ms = (time.time() - start) * 1000.0
    return {
        "audio": audio,
        "sample_rate": sr,
        "latency_ms": latency_ms,
        "duration_sec": len(audio) / sr,
    }


# ---------------------------------------------------------------------------
# Pydantic Request Models
# ---------------------------------------------------------------------------
class VoiceSculptRequest(BaseModel):
    sample_phrase: Optional[str] = "The morning sun gently illuminates the quiet cedar grove."
    template: Optional[str] = "male_smooth_warm"
    pitch_hz: Optional[int] = 0
    rate_pct: Optional[int] = 0
    warmth_pct: Optional[int] = 68
    roughness_pct: Optional[int] = 0


class ClinicalPdfReportRequest(BaseModel):
    patient_id: str
    session_id: Optional[str] = None
    patient_name: str
    condition: str
    clinician: str
    biomarkers: Dict[str, Any]
    utterances: List[Dict[str, Any]]
    slp_assessment: Dict[str, Any]
    inline: Optional[bool] = True


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    """System status and compute availability."""
    import torch
    has_gpu = torch.cuda.is_available()
    return {
        "status": "online",
        "service": "Epako Voice AI Speech Gateway",
        "device": "cuda" if has_gpu else "cpu",
        "gpu_name": torch.cuda.get_device_name(0) if has_gpu else "None",
        "models": {
            "asr_engine": "Parakeet-TDT (FastConformer)",
            "intent_repair": "Acoustic Dysfluency Normalizer",
            "voice_restoration": "Neural Biological Formant Vocoder",
        },
    }


@app.post("/api/rectify")
async def rectify_speech(
    request: Request,
    file: Optional[UploadFile] = File(None),
    user=Depends(require_user),
):
    """
    Core Biological Voice Rectification Pipeline:
    Audio Input (Multipart File or JSON Base64) -> Dysarthria ASR -> Intent Repair -> Personalized Voice Restoration
    """
    start_total = time.time()
    raw_bytes = None
    voice_template = "male_smooth_warm"
    pitch_hz = 0
    rate_pct = 0
    warmth_pct = 68

    if int(request.headers.get("content-length") or 0) > 2 * _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            b64_str = body.get("audio_base64", "").split(",")[-1]
            if b64_str:
                raw_bytes = base64.b64decode(b64_str)
            voice_template = body.get("voice_template", "male_smooth_warm")
            pitch_hz = body.get("pitch_hz", 0)
            rate_pct = body.get("rate_pct", 0)
            warmth_pct = body.get("warmth_pct", 68)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")
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
        except Exception:
            pass

    if raw_bytes and len(raw_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large.")
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Missing audio payload. Provide audio file or audio_base64.")

    audio = await asyncio.to_thread(decode_audio_bytes, raw_bytes, target_sr=16000)
    if len(audio) < 1600:
        raise HTTPException(status_code=400, detail="Audio sample too short (<100ms).")

    # 1. Transcribe using Dysarthria ASR
    asr = await asyncio.to_thread(get_asr_engine)
    asr_res = await asyncio.to_thread(asr.transcribe, audio, sample_rate=16000)
    raw_transcript = asr_res.get("text", "")
    asr_latency = asr_res.get("latency_ms", 0.0)

    # 2. Intent & Dysfluency Repair
    repair_eng = get_repair_engine(user.id)
    repair_res = repair_eng.repair(raw_transcript)
    repaired_text = repair_res.get("repaired_text", raw_transcript)
    repair_latency = repair_res.get("latency_ms", 1.0)

    # 3. Neural Voice Synthesis
    synth_latency = 0.0
    audio_output_b64 = None

    if repaired_text:
        template = voice_template
        pitch = f"{pitch_hz:+d}Hz"
        rate = f"{rate_pct:+d}%"
        
        restoration_eng = await asyncio.to_thread(get_restoration_engine)
        voice_id = restoration_eng.voice_palette.get(template, "en-US-GuyNeural") if restoration_eng else "en-US-GuyNeural"

        synth_res = await synthesize_neural_async(
            text=repaired_text,
            voice=voice_id,
            pitch=pitch,
            rate=rate,
        )
        synth_latency = synth_res.get("latency_ms", 0.0)
        audio_output_b64 = audio_to_base64_wav(synth_res["audio"], 16000)
    else:
        audio_output_b64 = audio_to_base64_wav(audio, 16000)

    # 4. Fast Clinical Telemetry
    try:
        from biomarker_engine import compute_articulation_velocity
        telemetry = await asyncio.to_thread(compute_articulation_velocity, audio, sample_rate=16000)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Biomarker engine unavailable: {e}")

    total_latency = (time.time() - start_total) * 1000.0

    return {
        "success": True,
        "raw_transcript": raw_transcript,
        "repaired_text": repaired_text,
        "rectified_audio": audio_output_b64,
        "latency": {
            "asr_ms": round(asr_latency, 1),
            "repair_ms": round(repair_latency, 1),
            "synthesis_ms": round(synth_latency, 1),
            "total_ms": round(total_latency, 1),
        },
        "telemetry": telemetry,
    }


@app.post("/api/biomarkers", dependencies=[Depends(require_user)])
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
        raise HTTPException(status_code=503, detail=f"Biomarker engine unavailable: {e}")

    return {"success": True, "biomarkers": results}


@app.post("/api/voice/sculpt", dependencies=[Depends(require_user)])
async def sculpt_voice_timbre(request: VoiceSculptRequest):
    """
    Voice Identity Studio: Real-time preview of sculpted voice parameters.
    """
    restoration_eng = await asyncio.to_thread(get_restoration_engine)
    if not restoration_eng:
        raise HTTPException(status_code=500, detail="Voice restoration engine unavailable.")

    profile = restoration_eng.create_sculpted_profile(
        template=request.template,
        pitch_hz=request.pitch_hz,
        rate_pct=request.rate_pct,
        warmth_pct=request.warmth_pct,
        roughness_pct=request.roughness_pct,
    )

    synth_res = await synthesize_neural_async(
        text=request.sample_phrase,
        voice=profile["voice_id"],
        pitch=profile["pitch"],
        rate=profile["rate"],
    )

    audio_b64 = audio_to_base64_wav(synth_res["audio"], 16000)

    return {
        "success": True,
        "profile": profile,
        "audio_base64": audio_b64,
        "latency_ms": round(synth_res["latency_ms"], 1),
    }


@app.post("/api/voice/bank", dependencies=[Depends(require_user)])
async def bank_premorbid_voice(files: List[UploadFile] = File(...)):
    """
    Pre-Morbid Voice Banking: Reconstructs biological timbre from historical voice recordings.
    """
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 clean voice notes.")

    restoration_eng = await asyncio.to_thread(get_restoration_engine)
    temp_paths = []
    try:
        for f in files:
            data = await f.read(_MAX_UPLOAD_BYTES + 1)
            if len(data) > _MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Upload too large.")
            with tempfile.NamedTemporaryFile(suffix=os.path.splitext(os.path.basename(f.filename or ""))[1], delete=False) as buffer:
                buffer.write(data)
                temp_paths.append(buffer.name)

        profile = await asyncio.to_thread(restoration_eng.create_profile_from_voice_notes, temp_paths, min_notes=2)
        return {
            "success": True,
            "profile": profile,
            "message": "Biological timbre successfully banked and calibrated.",
        }
    finally:
        for p in temp_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# Clinical PDF Evaluation Report Generator (SLP / Insurance CPT Reimbursement)
# ---------------------------------------------------------------------------
@app.post("/api/session/report/pdf", dependencies=[Depends(require_user)])
def create_clinical_pdf_report(req: ClinicalPdfReportRequest):
    """
    Generates an authoritative, 1-page publication-grade Clinical SLP Evaluation Report PDF.
    Returns binary application/pdf stream with inline or attachment disposition.
    """
    try:
        from pdf_generator import generate_clinical_pdf
    except ImportError:
        from src.pdf_generator import generate_clinical_pdf

    session_id = req.session_id or f"EPK-{int(time.time()) % 1000000:06d}"

    report_data = {
        "session_id": session_id,
        "evaluation_date": time.strftime("%B %d, %Y"),
        "clinic_name": "Epako Bio-Acoustic Speech Sanctuary",
        "patient": {
            "name": req.patient_name,
            "id": req.patient_id,
            "condition": req.condition,
            "clinician": req.clinician,
        },
        "biomarkers": req.biomarkers,
        "utterances": req.utterances,
        "slp_assessment": req.slp_assessment,
    }

    try:
        pdf_bytes = generate_clinical_pdf(report_data)
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing report field: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate clinical PDF: {str(e)}")

    disposition_type = "inline" if req.inline else "attachment"
    headers = {
        "Content-Disposition": f"{disposition_type}; filename=epako_clinical_report_{session_id}.pdf",
        "Content-Type": "application/pdf"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


# ---------------------------------------------------------------------------
# 3. LIVE CONVERSATION STREAMING WEBSOCKET (Sub-300ms Audio Gateway)
# ---------------------------------------------------------------------------
@app.websocket("/ws/rectify")
async def websocket_speech_rectifier(websocket: WebSocket):
    """
    Full-Duplex Streaming Speech Rectification.
    The client streams audio frames in real time.
    The server returns live RMS/cadence telemetry while speaking, and instantly
    emits the rectified audio stream when a pause is detected.
    """
    await websocket.accept()
    try:
        auth_msg = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=10))
        if auth_msg.get("type") != "auth" or auth_msg.get("sample_rate") != 16000 or auth_msg.get("encoding") != "pcm_s16le":
            raise ValueError("first message must be auth with sample_rate 16000 and encoding pcm_s16le")
        user = await asyncio.to_thread(verify_token, auth_msg.get("token") or "")
    except Exception:
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return
    print("[+] WebSocket client connected to /ws/rectify")

    max_buffer = 30 * 16000
    audio_buffer = np.zeros(max_buffer, dtype=np.float32)
    buffered = 0
    is_speaking = False
    silence_frames = 0
    silence_threshold = 0.015
    min_speech_frames = 5
    max_silence_frames = 7

    try:
        while True:
            message = await websocket.receive()
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

                asr = await asyncio.to_thread(get_asr_engine)
                asr_res = await asyncio.to_thread(asr.transcribe, utterance_audio, sample_rate=16000)
                raw_text = asr_res.get("text", "")

                repair = get_repair_engine(user.id)
                repaired = repair.repair(raw_text).get("repaired_text", raw_text)

                if repaired:
                    synth = await synthesize_neural_async(repaired, voice="en-US-GuyNeural")
                    audio_b64 = audio_to_base64_wav(synth["audio"], 16000)
                else:
                    audio_b64 = audio_to_base64_wav(utterance_audio, 16000)

                latency_ms = (time.time() - start_rectify) * 1000.0

                await websocket.send_json({
                    "type": "rectified_output",
                    "raw_text": raw_text,
                    "repaired_text": repaired,
                    "audio_base64": audio_b64,
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


# ---------------------------------------------------------------------------
# Direct Run (Standalone Server on port 8000)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print("\n[+] Starting Epako Voice AI Speech Gateway on http://localhost:8000 ...")
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False, log_level="info")

