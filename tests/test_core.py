import sys
import uuid
from pathlib import Path
from unittest import mock

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from intent_repair import IntentRepair
from biomarker_engine import compute_formant_centralization
from supabase_manager import SupabaseManager
from pdf_generator import generate_clinical_pdf


class _FakeLimiterDb:
    """Stands in for Postgres rate_limit_hit; the real SQL is attacked in test_rls.py."""

    def __init__(self):
        self.seen = {}

    def rpc(self, fn, params):
        assert fn == "rate_limit_hit"
        import time
        q = self.seen.setdefault((params["p_name"], params["p_user"]), [])
        now = time.monotonic()
        q[:] = [t for t in q if now - t <= params["p_seconds"]]
        allowed = len(q) < params["p_limit"]
        if allowed:
            q.append(now)
        return mock.Mock(execute=lambda: mock.Mock(data=allowed))


@pytest.fixture
def real_service_client():
    """Opts a test out of fake_limiter, to inspect the real server-key client (it is never called)."""


@pytest.fixture(autouse=True)
def fake_limiter(request):
    import api
    if "real_service_client" in request.fixturenames:
        yield
        return
    with mock.patch.object(api, "service_client", return_value=_FakeLimiterDb()):
        yield


rng = np.random.default_rng(0)


def repaired(text):
    return IntentRepair().repair(text)["repaired_text"]


def test_repeat_words():
    assert repaired("he he nailed it") == "He nailed it."


@pytest.mark.xfail(strict=True, reason="clean_dysfluencies deletes every repeated word, including real ones")
def test_real_repeats_survive():
    assert "that that" in repaired("He said that that was true")
    assert "had had" in repaired("She had had enough")


def test_biomarker_key_agrees_and_low_audio_is_none():
    key = "formant_compression_index"
    assert key in (ROOT / "supabase/migrations/20261024000001_rename_fcr_column.sql").read_text()
    low = compute_formant_centralization(np.zeros(8000, dtype="float32"), 16000)
    assert low[key] is None
    bio = {"articulation_velocity": 3.0, "speaking_rate": 2.0, "pause_ratio": 0.3, "vocal_jitter_pct": 1.0,
           "vocal_shimmer_pct": 3.0, "mean_f0_hz": 140.0, "stability_index": 90.0, **low}
    pdf = generate_clinical_pdf({
        "session_id": "S", "patient": {"name": "A", "id": "P", "condition": "c", "clinician": "D"},
        "biomarkers": bio, "utterances": [{"original_text": "a", "repaired_text": "a", "latency_ms": 1.0}],
        "slp_assessment": {"impression": "i", "home_plan": "h", "frequency": "f"}})
    assert pdf.startswith(b"%PDF")


@pytest.mark.parametrize("bio", [{"articulation_velocity": 3.4, "pause_ratio": 0.3, "vocal_jitter_pct": 2.0, "vocal_shimmer_pct": 5.0},
                                 {"articulation_velocity": 2.5, "pause_ratio": 0.4, "vocal_jitter_pct": 4.8, "vocal_shimmer_pct": 2.0}],
                         ids=["mild", "severe"])
def test_the_pdf_reports_measurements_against_references_without_diagnosing(monkeypatch, bio):
    # unvalidated frame-level measures with uncited cut-offs must not print diagnoses or an invented clinic (2026-10-26)
    from reportlab import rl_config
    monkeypatch.setattr(rl_config, "pageCompression", 0)   # keep the PDF's text readable in its bytes
    bio = {"speaking_rate": 2.0, "mean_f0_hz": 140.0, "stability_index": 70.0, "formant_compression_index": None, **bio}
    pdf = generate_clinical_pdf({
        "session_id": "S", "patient": {"name": "A", "id": "P", "condition": "c", "clinician": "D"},
        "biomarkers": bio, "utterances": [{"original_text": "a", "repaired_text": "a", "latency_ms": 1.0}],
        "slp_assessment": {"impression": "i", "home_plan": "h", "frequency": "f"}})
    for invented in (b"Bradykinesia", b"Ataxic", b"Freezing", b"Tremor", b"Deficit", b"Hesitation", b"Perturbation",
                     b"Sanctuary", b"Medical Record", b"Normative"):
        assert invented not in pdf, invented
    assert b"diagnosis" in pdf and b"frame-level" in pdf and b"Below reference" in pdf and b"Above reference" in pdf


def test_failed_save_is_not_swallowed():
    from fastapi.testclient import TestClient
    import api
    assert TestClient(api.app).post("/api/session/save", json={}).status_code == 404
    mgr = SupabaseManager.__new__(SupabaseManager)
    mgr.client, mgr.current_profile = mock.MagicMock(), {"id": "p"}
    mgr.bucket_name, mgr.current_user = "b", mock.Mock(id="u")
    mgr.client.storage.from_.return_value.upload.side_effect = RuntimeError("storage down")
    with pytest.raises(RuntimeError):
        mgr.upload_audio(b"x", "a.wav")


MEASURED_VOWELS = {"mean_f1": 520.0, "mean_f2": 1480.0, "f1_dispersion": 90.0, "f2_dispersion": 260.0,
                   "vowel_space_area": 73513.0, "formant_compression_index": 0.136}   # as /api/session/analyze stores them


@pytest.mark.parametrize("formants", [{"formant_compression_index": None, "metrics": {}},
                                      {"formant_compression_index": 0.136, "metrics": {"vowel_space": MEASURED_VOWELS}}],
                         ids=["no-vowel-space", "measured-vowel-space"])
def test_pdf_report_comes_from_stored_session(formants):
    from fastapi.testclient import TestClient
    import api
    sid = "11111111-1111-1111-1111-111111111111"
    rows = {"therapy_sessions": [{"patient_id": "pseudonym-1"}],
            "clinical_assessments": [{"clinician_id": "c1", "condition": "Ataxic dysarthria",
                                      "impression": "i", "home_plan": "h", "frequency": "f"}],
            "clinicians": [{"display_name": "Dr Real"}],
            "biomarker_logs": [{"articulation_velocity": 3.0, "speaking_rate": 2.0, "pause_ratio": 0.3,
                                "vocal_jitter_pct": 1.0, "vocal_shimmer_pct": 3.0, "mean_f0_hz": 140.0,
                                "stability_index": 90.0, **formants}],
            "session_utterances": [{"transcribed_text": "a a b", "corrected_text": "A b.", "latency_ms": 5}]}
    client = mock.MagicMock()
    client.table.side_effect = lambda t: mock.MagicMock(**{
        "select.return_value.eq.return_value.execute.return_value.data": rows[t],
        "select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data": rows[t],
        "select.return_value.eq.return_value.order.return_value.execute.return_value.data": rows[t]})
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock()
    body = {"session_id": sid, "biomarkers": {"jitter": 99}, "clinician": "Dr Fake"}  # forged extras must be ignored
    h = {"Authorization": "Bearer t"}
    try:
        with mock.patch.object(api, "user_client", return_value=client):
            ok = TestClient(api.app).post("/api/session/report/pdf", json=body, headers=h)
            rows["therapy_sessions"] = []  # RLS hides someone else's session
            nope = TestClient(api.app).post("/api/session/report/pdf", json=body, headers=h)
    finally:
        api.app.dependency_overrides.clear()
    assert ok.status_code == 200 and ok.content.startswith(b"%PDF")
    assert b"Dr Fake" not in ok.content
    assert nope.status_code == 404


def test_the_delete_screens_captcha_token_reaches_supabases_password_check():
    # with CAPTCHA on, Supabase refuses a password sign-in without a token, so deletion could never pass (live 2026-10-26)
    from fastapi.testclient import TestClient
    import api
    import supabase_manager
    auth = mock.Mock()
    auth.sign_in_with_password.return_value = mock.Mock(user=mock.Mock())
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id="22222222-2222-2222-2222-222222222222", email="p@example.com",
                                                                       app_metadata={"providers": ["email"]})
    try:
        with mock.patch.object(supabase_manager, "SupabaseManager", return_value=mock.Mock(client=mock.Mock(auth=auth))), \
                mock.patch.object(api, "service_client", return_value=mock.MagicMock()), mock.patch.object(api, "_purge_audio"):
            r = TestClient(api.app).request("DELETE", "/api/me/data", headers=AUTH,
                                            json={"confirm": "DELETE", "password": "pw", "captcha_token": "turnstile-token"})
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 200
    auth.sign_in_with_password.assert_called_once_with({"email": "p@example.com", "password": "pw", "options": {"captcha_token": "turnstile-token"}})


def test_delete_my_data_wipes_audio_then_account():
    from fastapi.testclient import TestClient
    import api
    uid = "22222222-2222-2222-2222-222222222222"
    order = []
    stored = {uid: [{"name": "raw", "id": None}], f"{uid}/raw": [{"name": "a.wav", "id": "x"}]}
    bucket = mock.MagicMock()
    bucket.list.side_effect = lambda prefix, opts=None: stored.get(prefix, [])
    def remove(paths):
        order.append(("remove", paths)); stored.clear()
    bucket.remove.side_effect = remove
    writer = mock.MagicMock()
    writer.storage.from_.return_value = bucket
    writer.auth.admin.delete_user.side_effect = lambda u: order.append(("delete_user", u))
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id=uid, email="p@example.com", app_metadata={"providers": ["email"]})
    try:
        with mock.patch.object(api, "service_client", return_value=writer), mock.patch.object(api, "_password_ok", return_value=True):
            c = TestClient(api.app)
            assert c.request("DELETE", "/api/me/data", json={"confirm": "no", "password": "pw"}, headers=AUTH).status_code == 400
            assert order == []
            assert c.request("DELETE", "/api/me/data", json={"confirm": "DELETE", "password": "pw"}, headers=AUTH).status_code == 200
    finally:
        api.app.dependency_overrides.clear()
    assert order == [("remove", [f"{uid}/raw/a.wav"]), ("delete_user", uid)]


def test_feedback_learns_rewards_and_penalises():
    from feedback_engine import FeedbackEngine
    fb = FeedbackEngine()
    assert fb.apply("a yard less") == "a yard less"  # nothing is trusted after zero lessons
    reward = fb.learn("a yard less", "a yard less", "a yard loss")
    assert reward == pytest.approx(2 / 3)  # one of three words wrong
    assert fb.apply("a yard less") == "a yard less"  # one lesson is still not enough
    fb.learn("a yard less", "a yard less", "a yard loss")
    assert fb.apply("A yard less") == "A yard loss"
    # the rule fires and the patient rejects its output twice: confidence falls to 50%, so it stops being applied
    fb.learn("less", "loss", "lace")
    fb.learn("less", "loss", "lace")
    assert fb.table["less"]["bad"] == 2 and fb.apply("less") == "less"
    assert FeedbackEngine().learn("x", "same", "same") == 1.0


def test_feedback_learns_nothing_from_words_no_dictionary_has():
    from feedback_engine import MAX_WORD_LETTERS, FeedbackEngine
    junk = "a" * (MAX_WORD_LETTERS + 1)
    fb = FeedbackEngine()
    fb.learn(f"{junk} cat", f"{junk} cat", "ship cat")   # heard too long
    fb.learn("sip cat", "sip cat", f"{junk} cat")        # meant too long
    assert fb.table == {}
    fb.learn("pneumonoultramicroscopicsilicovolcanoconiosis", "x", "silicosis")   # 45 letters: a real word, still learned
    assert "pneumonoultramicroscopicsilicovolcanoconiosis" in fb.table


def test_a_full_correction_table_drops_its_least_confirmed_oldest_rules_first():
    from feedback_engine import MAX_CORRECTIONS, FeedbackEngine
    table = {"wun": {"to": "one", "ok": 5, "bad": 0}}   # learned long ago and in real use
    table.update({f"noise{i}": {"to": f"x{i}", "ok": 1, "bad": 0} for i in range(MAX_CORRECTIONS)})
    fb = FeedbackEngine(table)
    fb.learn("sip", "sip", "ship")   # one more new lesson
    assert len(fb.table) == MAX_CORRECTIONS
    assert fb.apply("wun") == "one" and "sip" in fb.table          # the trusted rule and the newest lesson stay
    assert "noise0" not in fb.table and "noise1" not in fb.table   # the oldest one-off rules go


def test_both_learned_tables_fit_their_database_limits_even_full_of_the_longest_words():
    import json
    from feedback_engine import MAX_CORRECTIONS, MAX_WORD_LETTERS
    from vocabulary import MAX_WORDS
    word = lambda i: f"{i:06d}".rjust(MAX_WORD_LETTERS, "w")
    big = 10**9   # counts far beyond any real use
    corrections = {word(i): {"to": word(i), "ok": big, "bad": big} for i in range(MAX_CORRECTIONS)}
    vocabulary = {word(i): big for i in range(MAX_WORDS)}
    # migration 20261031 measures octet_length(jsonb::text), which is formatted like json.dumps
    assert len(json.dumps(corrections)) <= 1_000_000 and len(json.dumps(vocabulary)) <= 200_000


def test_repair_uses_learned_table():
    from feedback_engine import FeedbackEngine
    table = {"wun": {"to": "one", "ok": 3, "bad": 0}}
    assert IntentRepair(FeedbackEngine(table)).repair("wun wun cat")["repaired_text"] == "One cat."


def test_repair_snaps_to_the_patients_words_after_repeats_and_learned_swaps():
    from feedback_engine import FeedbackEngine
    from vocabulary import Vocabulary
    heard = [{"word": "sip", "confidence": 0.3}, {"word": "sip", "confidence": 0.4}]
    assert IntentRepair(vocabulary=Vocabulary({"ship": 2})).repair("sip sip", heard)["repaired_text"] == "Ship."
    assert IntentRepair(vocabulary=Vocabulary({"ship": 2})).repair("sip sip")["repaired_text"] == "Sip."   # no confidence, no snap
    # a swap learned from this exact mistake wins over a sound-alike guess
    swaps = FeedbackEngine({"sip": {"to": "zip", "ok": 2, "bad": 0}})
    assert IntentRepair(swaps, Vocabulary({"ship": 9, "zip": 1})).repair("sip", heard[:1])["repaired_text"] == "Zip."


def test_api_has_no_duplicate_routes_or_functions():
    import ast, collections
    tree = ast.parse((ROOT / "src/api.py").read_text(encoding="utf-8"))
    names, routes = collections.Counter(), collections.Counter()
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names[n.name] += 1
            for d in n.decorator_list:
                if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in ("get", "post", "delete", "websocket"):
                    routes[(d.func.attr, d.args[0].value)] += 1
    assert not {k: v for k, v in {**names, **routes}.items() if v > 1}


def test_no_cloud_tts_anywhere():
    for f in [*(ROOT / "src").glob("*.py"), *(ROOT / "scripts").glob("*.py"), ROOT / "requirements.txt"]:
        assert "edge_tts" not in f.read_text(encoding="utf-8") and "edge-tts" not in f.read_text(encoding="utf-8"), f.name


class _FakeVoice:
    config = mock.Mock(sample_rate=22050)

    def synthesize(self, text, syn_config=None):
        self.scale = syn_config.length_scale
        return [mock.Mock(audio_float_array=np.full(2205, 0.9, dtype="float32"))]


def test_local_tts_applies_rate_volume_and_resamples():
    import local_tts
    fake = _FakeVoice()
    with mock.patch.object(local_tts, "_load", return_value=fake):
        out = local_tts.synthesize("hi", rate="+100%", volume="+50%")
    assert fake.scale == pytest.approx(0.5)                 # twice as fast -> half the length
    assert out["sample_rate"] == 16000 and out["audio"].dtype == np.float32
    assert out["audio"].max() <= 1.0                        # 0.9 * 1.5 is clipped, not wrapped
    assert out["audio"].shape[0] == pytest.approx(1600, abs=2)


def _voice_like(sr=16000, seconds=1.0, f0=150):
    t = np.arange(int(sr * seconds)) / sr
    harmonics = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 30) if f0 * k < sr / 2)
    return (0.3 * harmonics * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t) ** 2)).astype("float32")   # a voice at f0, 4 syllables/s


def test_warmth_darkens_or_brightens_and_roughness_adds_texture_measured_as_voice_banking_measures_them():
    import librosa
    from local_tts import shape_voice
    x = _voice_like()
    centroid = lambda a: librosa.feature.spectral_centroid(y=a, sr=16000).mean()
    flatness = lambda a: librosa.feature.spectral_flatness(y=a).mean()
    assert centroid(shape_voice(x, 16000, 20, 0)) < centroid(x) < centroid(shape_voice(x, 16000, -20, 0))
    assert flatness(shape_voice(x, 16000, 0, 20)) > 2 * flatness(x)
    assert np.array_equal(shape_voice(x, 16000, 0, 0), x)                                       # neutral is untouched
    assert np.array_equal(shape_voice(x, 16000, 10, 10), shape_voice(x, 16000, 10, 10))           # same voice every time
    for w, r in ((20, 0), (-20, 0), (0, 20), (20, 20)):
        assert np.abs(shape_voice(x, 16000, w, r)).max() <= np.abs(x).max() + 1e-6               # never louder than the voice


def test_local_tts_passes_warmth_and_roughness_to_the_audio():
    import local_tts
    fake = _FakeVoice()
    fake.synthesize = lambda text, syn_config: [mock.Mock(audio_float_array=_voice_like(22050))]
    with mock.patch.object(local_tts, "_load", return_value=fake):
        neutral = local_tts.synthesize("hi")["audio"]
        shaped = local_tts.synthesize("hi", warmth=15, roughness=10)["audio"]
    assert neutral.shape == shaped.shape and not np.allclose(neutral, shaped)


def test_local_tts_rejects_path_tricks_and_missing_models():
    import local_tts
    with pytest.raises(ValueError):
        local_tts.synthesize("hi", voice="../../etc/passwd")
    with pytest.raises(FileNotFoundError):
        local_tts.synthesize("hi", voice="no-such-voice")


@pytest.mark.skipif(not (ROOT / "models/piper/en_US-ryan-medium.onnx").exists(), reason="Piper voices not downloaded")
def test_real_voices_speak_and_rate_changes_duration():
    import local_tts
    from voice_restoration import VoiceRestorationEngine
    for voice in VoiceRestorationEngine().voice_palette.values():
        assert (ROOT / f"models/piper/{voice}.onnx").exists(), voice
    slow = local_tts.synthesize("The morning sun rises.", rate="-30%")["duration_sec"]
    fast = local_tts.synthesize("The morning sun rises.", rate="+50%")["duration_sec"]
    assert 0.5 < fast < slow < 10


AUTH = {"Authorization": "Bearer t"}


def _as(uid, providers=("email",)):
    import api
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id=uid, email="p@example.com", app_metadata={"providers": list(providers)})


def test_delete_requires_the_password():
    from fastapi.testclient import TestClient
    import api
    writer = mock.MagicMock()
    _as("33333333-3333-3333-3333-333333333333")
    try:
        with mock.patch.object(api, "service_client", return_value=writer), mock.patch.object(api, "_password_ok", return_value=False):
            r = TestClient(api.app).request("DELETE", "/api/me/data", json={"confirm": "DELETE", "password": "wrong"}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 403
    writer.auth.admin.delete_user.assert_not_called()


def test_hit_maps_database_answers():
    import api
    svc = mock.MagicMock()
    result = svc.rpc.return_value.execute.return_value
    with mock.patch.object(api, "service_client", return_value=svc):
        result.data = True
        api.hit("n", "u", 5, 60)
        svc.rpc.assert_called_with("rate_limit_hit", {"p_name": "n", "p_user": "u", "p_limit": 5, "p_seconds": 60})
        result.data = False
        with pytest.raises(api.HTTPException) as e:
            api.hit("n", "u", 5, 60)
        assert e.value.status_code == 429
        svc.rpc.return_value.execute.side_effect = RuntimeError("db down")
        with pytest.raises(api.HTTPException) as e:
            api.hit("n", "u", 5, 60)
        assert e.value.status_code == 503   # fails closed
        import httpx
        svc.rpc.return_value.execute.side_effect = [httpx.RemoteProtocolError("Server disconnected"), mock.Mock(data=True)]
        api.hit("n", "u", 5, 60)   # one dropped connection is retried once
        svc.rpc.return_value.execute.side_effect = httpx.RemoteProtocolError("Server disconnected")
        with pytest.raises(api.HTTPException) as e:
            api.hit("n", "u", 5, 60)
        assert e.value.status_code == 503   # but not forever


def test_delete_is_throttled_over_http():
    from fastapi.testclient import TestClient
    import api
    _as("44444444-4444-4444-4444-444444444444")
    try:
        c = TestClient(api.app)
        codes = [c.request("DELETE", "/api/me/data", json={"confirm": "no", "password": "x"}, headers=AUTH).status_code for _ in range(4)]
    finally:
        api.app.dependency_overrides.clear()
    assert codes == [400, 400, 400, 429]


def test_overlong_audio_is_rejected_cheaply():
    import io
    import soundfile as sf
    import api

    def wav(seconds):
        b = io.BytesIO()
        sf.write(b, np.zeros(16000 * seconds, dtype="float32"), 16000, format="WAV")
        return b.getvalue()

    assert len(api.decode_audio_bytes(wav(2))) == 32000
    with pytest.raises(api.HTTPException) as e:
        api.decode_audio_bytes(wav(61))
    assert e.value.status_code == 413


def test_errors_and_health_leak_nothing():
    import re
    from fastapi.testclient import TestClient
    import api
    assert api.fail(500, "Nope.", RuntimeError("db password=hunter2")).detail == "Nope."
    assert not re.search(r'detail=f"[^"]*\{(e|str\(e\))\}', (ROOT / "src/api.py").read_text(encoding="utf-8"))
    assert TestClient(api.app).get("/health").json() == {"status": "online"}


def test_websocket_rejects_bad_auth_and_oversized_chunks():
    import json
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    import api
    c = TestClient(api.app)
    with c.websocket_connect("/ws/rectify") as ws:
        ws.send_text("{}")
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_text()
        assert e.value.code == 1008
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-user")):
        with c.websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            ws.send_bytes(b"\0" * (300 * 1024))
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 1009


def _jwt_with_sign_in_age(seconds_ago):
    import base64, json, time
    body = base64.urlsafe_b64encode(json.dumps({"amr": [{"method": "oauth", "timestamp": time.time() - seconds_ago}]}).encode()).decode().rstrip("=")
    return f"x.{body}.y"


def test_passwordless_accounts_need_a_fresh_sign_in_to_delete():
    from fastapi.testclient import TestClient
    import api
    writer = mock.MagicMock()
    _as("55555555-5555-5555-5555-555555555555", providers=("google",))
    try:
        with mock.patch.object(api, "service_client", return_value=writer):
            stale = TestClient(api.app).request("DELETE", "/api/me/data", json={"confirm": "DELETE"}, headers={"Authorization": f"Bearer {_jwt_with_sign_in_age(3600)}"})
            writer.auth.admin.delete_user.assert_not_called()
            fresh = TestClient(api.app).request("DELETE", "/api/me/data", json={"confirm": "DELETE"}, headers={"Authorization": f"Bearer {_jwt_with_sign_in_age(30)}"})
    finally:
        api.app.dependency_overrides.clear()
    assert stale.status_code == 403 and fresh.status_code == 200


def test_password_accounts_cannot_skip_the_password():
    from fastapi.testclient import TestClient
    import api
    _as("66666666-6666-6666-6666-666666666666")
    try:
        r = TestClient(api.app).request("DELETE", "/api/me/data", json={"confirm": "DELETE"}, headers={"Authorization": f"Bearer {_jwt_with_sign_in_age(1)}"})
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 403   # a fresh token alone is not enough when the account has a password


def test_no_undefined_names_in_project_code():
    """Catches the NameError class of bug (a missing import) in code no test executes, e.g. the live scripts."""
    check = pytest.importorskip("pyflakes.api").check
    from pyflakes.reporter import Reporter
    import io
    files = [*ROOT.glob("src/*.py"), *ROOT.glob("tests/*.py"), *ROOT.glob("scripts/*.py")]
    problems = []
    for f in files:
        out = io.StringIO()
        check(f.read_text(encoding="utf-8"), f.name, Reporter(out, out))
        problems += [line for line in out.getvalue().splitlines() if "undefined name" in line]
    assert not problems, problems


USER, MINE, THEIRS = "user-1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class _FakeDb:
    """In-memory stand-in for a Supabase client that records which tables it wrote."""

    def __init__(self, tables):
        self.tables, self.writes, self.reads = tables, [], 0

    def table(self, name):
        return _FakeQuery(self, name)

    def rpc(self, fn, params):
        return mock.Mock(execute=lambda: mock.Mock(data=True))  # the rate limiter always allows


class _FakeQuery:
    def __init__(self, db, name):
        self.db, self.name, self.filters, self.op, self.payload = db, name, [], "select", None
        self.columns, self.nested_limit = "*", None

    def select(self, columns="*", *_):
        self.columns = columns
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def order(self, *_, **__):
        return self

    def limit(self, n, foreign_table=None):
        if foreign_table:
            self.nested_limit = n
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def update(self, row):
        self.op, self.payload = "update", row
        return self

    def execute(self):
        rows = self.db.tables[self.name]
        matched = [r for r in rows if all(r.get(c) == v for c, v in self.filters)]
        if self.op == "insert":
            row = {"id": str(uuid.uuid4()), "created_at": "2026-10-24T10:00:00+00:00", **self.payload}
            rows.append(row)
            self.db.writes.append(self.name)
            return mock.Mock(data=[row])
        if self.op == "update":
            for r in matched:
                r.update(self.payload)
            self.db.writes.append(self.name)
            return mock.Mock(data=matched)
        self.db.reads += 1
        out = [dict(r) for r in matched]
        if "session_utterances(" in self.columns:   # a nested read: the row's sentences, newest first
            for r in out:
                r["session_utterances"] = [u for u in self.db.tables["session_utterances"] if u.get("patient_id") == r["id"]][::-1][:self.nested_limit]
        return mock.Mock(data=out)


def _session_world():
    tables = {
        "patient_profiles": [{"id": "p1", "user_id": USER, "phonetic_corrections": {}, "vocabulary": {}}],
        "therapy_sessions": [{"id": MINE, "patient_id": "p1", "created_at": "2026-10-24T10:00:00+00:00"},
                             {"id": THEIRS, "patient_id": "p2", "created_at": "2026-10-24T10:00:00+00:00"}],
        "session_utterances": [],
        "biomarker_logs": [],
    }
    return tables, _FakeDb(tables), _FakeDb(tables)


def test_session_routes_write_scores_with_the_server_key_only():
    from fastapi.testclient import TestClient
    import api
    tables, user_db, server_db = _session_world()
    _as(USER)
    say = lambda c, shown, final, raw="wun cat": c.post(f"/api/sessions/{MINE}/utterances", headers=AUTH,
                                                         json={"raw_transcript": raw, "shown_text": shown, "final_text": final})
    try:
        with mock.patch.object(api, "user_client", return_value=user_db), mock.patch.object(api, "service_client", return_value=server_db):
            c = TestClient(api.app)
            started = c.post("/api/sessions", headers=AUTH)
            foreign = c.post(f"/api/sessions/{THEIRS}/utterances", headers=AUTH, json={"raw_transcript": "a", "shown_text": "a", "final_text": "a"})
            no = say(c, "wun cat.", "one cat")
            say(c, "wun cat.", "one cat")
            yes = say(c, "One cat.", "one cat", raw="one cat")
            done = c.post(f"/api/sessions/{MINE}/finish", headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert started.status_code == 200 and foreign.status_code == 404
    assert no.json() == {"confirmed": False, "reward": 0.5} and yes.json() == {"confirmed": True, "reward": 1.0}
    assert tables["patient_profiles"][0]["phonetic_corrections"]["wun"] == {"to": "one", "ok": 2, "bad": 0}
    assert tables["patient_profiles"][0]["vocabulary"] == {"one": 3, "cat": 3}   # every answer adds the words meant
    assert done.json()["utterances_count"] == 3 and done.json()["accuracy_rate"] == pytest.approx(33.33, abs=0.01)
    assert set(user_db.writes) == set()   # the patient's own client writes neither scores nor what the server learned
    assert set(server_db.writes) == {"therapy_sessions", "session_utterances", "patient_profiles"}   # only the server key does


def test_patient_queries_reuse_one_connection_but_never_share_a_token(monkeypatch):
    # a new Supabase client per query cost ~0.7 s, twice per rectify (measured 2026-10-25)
    import api
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "anon-key")
    with mock.patch("supabase_manager.SupabaseManager", side_effect=AssertionError("no new Supabase client per query")):
        a, b = api.user_client("token-a"), api.user_client("token-b")
    assert a.session is b.session                                   # one pool of open connections
    assert a.headers["Authorization"] == "Bearer token-a" and b.headers["Authorization"] == "Bearer token-b"
    assert "Authorization" not in a.session.headers                 # the shared connections carry no one's token
    assert a.headers["apikey"] == "anon-key" and a.headers["Accept"] == "application/json"


def test_long_lived_database_connections_are_http1(monkeypatch, real_service_client):
    # over shared HTTP/2 connections 21 of 240 requests failed with "Server disconnected"; over HTTP/1.1, 0 (measured 2026-10-25)
    import api
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    api.service_client.cache_clear(), api._auth_client.cache_clear()
    try:
        pools = {"patient queries": api.user_client("t").session, "server key": api.service_client().postgrest.session,
                 "sign-in check": api._auth_client().auth._http_client}
        assert {name: s._transport._pool._http2 for name, s in pools.items()} == dict.fromkeys(pools, False)
        assert pools["server key"] is not pools["patient queries"]   # the service key never rides the patients' connections
    finally:
        api.service_client.cache_clear(), api._auth_client.cache_clear()


def test_a_failed_learning_save_says_the_sentence_was_kept():
    from fastapi.testclient import TestClient
    import api
    tables, user_db, server_db = _session_world()
    real_table = server_db.table

    def table(name):
        q = real_table(name)
        if name == "patient_profiles":
            q.update = mock.Mock(side_effect=RuntimeError("database briefly down"))
        return q
    server_db.table = table
    _as(USER)
    try:
        with mock.patch.object(api, "user_client", return_value=user_db), mock.patch.object(api, "service_client", return_value=server_db):
            r = TestClient(api.app, raise_server_exceptions=False).post(
                f"/api/sessions/{MINE}/utterances", headers=AUTH, json={"raw_transcript": "wun", "shown_text": "wun", "final_text": "one"})
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 503 and "saved" in r.json()["detail"] and "learning" in r.json()["detail"]
    assert len(tables["session_utterances"]) == 1   # true: the sentence itself is stored


def test_analyze_stores_biomarkers_with_the_server_key_for_own_sessions_only():
    import io
    import soundfile as sf
    from fastapi.testclient import TestClient
    import api
    tables, user_db, server_db = _session_world()
    t = np.arange(16000 * 2) / 16000
    wav = io.BytesIO()
    sf.write(wav, (0.3 * np.sin(2 * np.pi * 140 * t)).astype("float32"), 16000, format="WAV")
    _as(USER)
    send = lambda c, sid: c.post("/api/session/analyze", headers=AUTH, data={"session_id": sid}, files={"file": ("a.wav", wav.getvalue(), "audio/wav")})
    try:
        with mock.patch.object(api, "user_client", return_value=user_db), mock.patch.object(api, "service_client", return_value=server_db):
            c = TestClient(api.app)
            mine, theirs = send(c, MINE), send(c, THEIRS)
    finally:
        api.app.dependency_overrides.clear()
    assert mine.status_code == 200 and theirs.status_code == 404
    assert [r["patient_id"] for r in tables["biomarker_logs"]] == ["p1"]
    assert user_db.writes == [] and server_db.writes == ["biomarker_logs"]


def test_websocket_rechecks_the_token_after_five_minutes():
    import json
    import time as real_time
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    import api
    verify = mock.Mock(side_effect=[mock.Mock(id="ws-user-2"), api.HTTPException(status_code=401)])  # valid at connect, revoked later
    with mock.patch.object(api, "verify_token", verify), mock.patch.object(api, "time", wraps=real_time) as clock:
        clock.monotonic.side_effect = [0.0] + [1000.0] * 50
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            ws.send_bytes(b"\0" * 3200)
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
    assert e.value.code == 1008 and verify.call_count == 2


def _wav_b64(seconds=1.0):
    import base64, io
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, (0.2 * np.sin(2 * np.pi * 200 * np.arange(int(16000 * seconds)) / 16000)).astype("float32"), 16000, format="WAV")
    return base64.b64encode(buf.getvalue()).decode()


def test_rectify_says_nothing_heard_and_runs_no_recogniser_when_there_is_no_speech():
    from fastapi.testclient import TestClient
    import api
    asr = mock.Mock()
    _as("77777777-7777-7777-7777-777777777777")
    try:
        with mock.patch.object(api, "contains_speech", return_value=False), mock.patch.object(api, "get_asr_engine", return_value=asr),              mock.patch.object(api, "synthesize_neural_async", side_effect=AssertionError("must not speak")):
            r = TestClient(api.app).post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()["speech_detected"] is False and r.json()["raw_transcript"] == "" and r.json()["repaired_text"] == ""
    assert r.json()["rectified_audio"] is None
    asr.transcribe.assert_not_called()


def test_rectify_never_plays_the_input_back_as_rectified_when_nothing_was_understood():
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    asr = mock.Mock()
    asr.transcribe.return_value = {"text": "", "latency_ms": 1.0}
    _as("88888888-8888-8888-8888-888888888888")
    try:
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr),              mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()), \
                mock.patch.object(api, "get_voice", side_effect=api.HTTPException(status_code=503, detail="Voice profile unavailable.")):
            r = TestClient(api.app).post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 200 and r.json()["speech_detected"] is True   # a failed voice read does not matter when nothing is said
    assert r.json()["repaired_text"] == "" and r.json()["rectified_audio"] is None   # not the patient's own raw audio


def test_websocket_reports_no_speech_instead_of_transcribing_noise():
    import json
    from fastapi.testclient import TestClient
    import api
    asr_loader = mock.Mock(side_effect=AssertionError("recogniser must not run"))
    loud = (rng.standard_normal(1600) * 0.3 * 32767).astype("int16").tobytes()
    quiet = np.zeros(1600, dtype="int16").tobytes()
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-user-3")), mock.patch.object(api, "contains_speech", return_value=False),          mock.patch.object(api, "get_asr_engine", asr_loader):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for chunk in [loud] * 6 + [quiet] * 16:
                ws.send_bytes(chunk)
            seen = []
            while not seen or seen[-1]["type"] == "telemetry":
                seen.append(ws.receive_json())
    assert seen[-1]["type"] == "no_speech"
    asr_loader.assert_not_called()


def _heard(text, confidence):
    return {"text": text, "words": [{"word": w, "confidence": confidence} for w in text.split()], "latency_ms": 1.0}


def test_rectify_snaps_unsure_words_to_the_patients_words_only_while_they_are_repeating_words():
    from fastapi.testclient import TestClient
    import api
    from vocabulary import REPEAT_WINDOW
    tables, user_db, _ = _session_world()
    tables["patient_profiles"][0]["vocabulary"] = {"ship": REPEAT_WINDOW}
    asr = mock.Mock()
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    _as(USER)

    def say(c, heard):
        asr.transcribe.return_value = heard
        return c.post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH).json()

    try:
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr), \
                mock.patch.object(api, "user_client", return_value=user_db), mock.patch.object(api, "synthesize_neural_async", voice):
            c = TestClient(api.app)
            no_history = say(c, _heard("sip", 0.3))
            tables["session_utterances"] += [{"patient_id": "p1", "corrected_text": "ship"}] * REPEAT_WINDOW
            unsure, sure = say(c, _heard("sip", 0.3)), say(c, _heard("sip", 0.99))
    finally:
        api.app.dependency_overrides.clear()
    assert no_history["repaired_text"] == "Sip."   # not repeating words yet: snapping stays off
    assert unsure["raw_transcript"] == "sip" and unsure["repaired_text"] == "Ship."
    assert sure["repaired_text"] == "Sip."         # the recogniser was sure: left alone
    assert voice.await_args_list[1].kwargs["text"] == "Ship."   # the voice says the snapped word


def test_the_patients_learning_is_read_in_one_database_request():
    import api
    from vocabulary import REPEAT_WINDOW
    tables, user_db, _ = _session_world()
    tables["patient_profiles"][0]["vocabulary"] = {"ship": REPEAT_WINDOW}
    tables["session_utterances"] += [{"patient_id": "p2", "corrected_text": "zebra"}] * REPEAT_WINDOW \
        + [{"patient_id": "p1", "corrected_text": "ship"}] * REPEAT_WINDOW   # only this patient's sentences count
    with mock.patch.object(api, "user_client", return_value=user_db):
        engine = api.get_repair_engine("t", USER)
    assert user_db.reads == 1 and engine.vocabulary is not None   # one round trip, and it saw the repeats: snapping is on


def _stream_through_the_websocket(audio, real_stream_vad=None):
    """Streams float audio as 100 ms chunks, as a browser sends it, through the real handler and the real speech detector;
    the recogniser is a stand-in that records how much audio it was given. Returns (replies, seconds given to the recogniser)."""
    import json
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    given = []
    asr = mock.Mock()
    asr.transcribe.side_effect = lambda a, sample_rate=16000: given.append(len(a) / 16000) or {"text": "hello", "words": None, "latency_ms": 1.0}
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-stream")), mock.patch.object(api, "get_asr_engine", return_value=asr), \
            mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()), mock.patch.object(api, "get_voice", return_value={}), \
            mock.patch.object(api, "synthesize_neural_async", voice):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for i in range(0, len(pcm), 3200):
                ws.send_bytes(pcm[i:i + 3200])
            ws.send_text(json.dumps({"type": "ping"}))   # answered only after everything sent before it was handled
            replies = []
            while not replies or replies[-1]["type"] != "pong":
                replies.append(ws.receive_json())
    return [r for r in replies if r["type"] not in ("telemetry", "pong")], given


needs_voice = pytest.mark.skipif(not (ROOT / "models/piper/en_US-ryan-medium.onnx").exists(), reason="Piper voices not downloaded")


@needs_voice
@pytest.mark.parametrize("pause_s", [1.0, 1.4])
def test_a_pause_inside_a_sentence_does_not_cut_it_in_two(real_stream_vad, pause_s):
    # dysarthric speech pauses mid-sentence; ending the utterance at 0.7 s of quiet sent half of it (live, 2026-10-26)
    import local_tts
    said = local_tts.synthesize("The morning sun gently illuminates the quiet cedar grove.")["audio"]
    silence = lambda s: np.zeros(int(16000 * s), dtype="float32")
    audio = np.concatenate([silence(0.5), said, silence(pause_s), said, silence(2.5)])
    replies, given = _stream_through_the_websocket(audio)
    assert [r["type"] for r in replies] == ["rectified_output"] and len(given) == 1
    assert given[0] >= 2 * len(said) / 16000 + pause_s - 0.1   # the whole sentence, pause included, in one piece


@needs_voice
def test_soft_speech_is_heard_where_a_fixed_loudness_level_missed_it(real_stream_vad):
    import local_tts
    said = local_tts.synthesize("Please bring me a glass of water.")["audio"]
    soft = (said * 0.06).astype("float32")
    assert np.sqrt(np.mean(soft ** 2)) < 0.015   # below the old loudness cut-off, which never started listening
    replies, given = _stream_through_the_websocket(np.concatenate([np.zeros(8000, dtype="float32"), soft, np.zeros(16000 * 2, dtype="float32")]))
    assert [r["type"] for r in replies] == ["rectified_output"] and given[0] >= len(said) / 16000 - 0.2


@needs_voice
def test_the_start_of_a_sentence_is_not_clipped(real_stream_vad):
    import local_tts
    said = local_tts.synthesize("Please bring me a glass of water.")["audio"]
    replies, given = _stream_through_the_websocket(np.concatenate([np.zeros(16000, dtype="float32"), said, np.zeros(16000 * 2, dtype="float32")]))
    assert given[0] >= len(said) / 16000   # none of the speech is lost before the detector decides it is speech


def test_noise_and_silence_start_no_utterance(real_stream_vad):
    rng2 = np.random.default_rng(1)
    for audio in ((0.3 * rng2.standard_normal(16000 * 3)).astype("float32"),   # loud broadband noise: loud, but not speech
                  (0.3 * np.sin(2 * np.pi * 50 * np.arange(16000 * 3) / 16000)).astype("float32"),   # mains hum
                  np.zeros(16000 * 3, dtype="float32")):
        replies, given = _stream_through_the_websocket(audio)
        assert [r["type"] for r in replies] == [] and given == []


def test_websocket_snaps_unsure_words_too():
    import json
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    from vocabulary import Vocabulary
    asr = mock.Mock()
    asr.transcribe.return_value = _heard("sip", 0.3)
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    loud = (rng.standard_normal(1600) * 0.3 * 32767).astype("int16").tobytes()
    quiet = np.zeros(1600, dtype="int16").tobytes()
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-user-4")), mock.patch.object(api, "contains_speech", return_value=True),             mock.patch.object(api, "get_asr_engine", return_value=asr), mock.patch.object(api, "synthesize_neural_async", voice),             mock.patch.object(api, "get_repair_engine", return_value=IntentRepair(vocabulary=Vocabulary({"ship": 3}))), \
            mock.patch.object(api, "get_voice", return_value={}):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for chunk in [loud] * 6 + [quiet] * 16:
                ws.send_bytes(chunk)
            seen = []
            while not seen or seen[-1]["type"] == "telemetry":
                seen.append(ws.receive_json())
    assert seen[-1]["type"] == "rectified_output" and seen[-1]["repaired_text"] == "Ship."


def _all_at_once(n):
    """Each call blocks until n calls are in flight together; run one after another, the first times out (BrokenBarrierError)."""
    import threading
    barrier = threading.Barrier(n, timeout=5)
    return lambda value: (lambda *a, **k: (barrier.wait(), value)[1])


def test_rectify_reads_the_patients_learning_and_voice_while_the_recogniser_runs():
    # each read is a ~220 ms round trip to the database and none depends on what was heard (measured 2026-10-25)
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    together = _all_at_once(3)
    asr = mock.Mock()
    asr.transcribe.side_effect = together({"text": "hello", "words": None, "latency_ms": 1.0})
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    _as(USER)
    try:
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr), \
                mock.patch.object(api, "get_repair_engine", side_effect=together(IntentRepair())), \
                mock.patch.object(api, "get_voice", side_effect=together({})), mock.patch.object(api, "synthesize_neural_async", voice):
            r = TestClient(api.app).post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 200 and r.json()["repaired_text"] == "Hello." and voice.await_args.kwargs["text"] == "Hello."


def test_websocket_reads_the_patients_learning_and_voice_while_the_recogniser_runs():
    import json
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    together = _all_at_once(3)
    asr = mock.Mock()
    asr.transcribe.side_effect = together({"text": "hello", "words": None, "latency_ms": 1.0})
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    loud = (rng.standard_normal(1600) * 0.3 * 32767).astype("int16").tobytes()
    quiet = np.zeros(1600, dtype="int16").tobytes()
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-user-5")), mock.patch.object(api, "contains_speech", return_value=True), \
            mock.patch.object(api, "get_asr_engine", return_value=asr), mock.patch.object(api, "synthesize_neural_async", voice), \
            mock.patch.object(api, "get_repair_engine", side_effect=together(IntentRepair())), mock.patch.object(api, "get_voice", side_effect=together({})):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for chunk in [loud] * 6 + [quiet] * 16:
                ws.send_bytes(chunk)
            seen = []
            while not seen or seen[-1]["type"] == "telemetry":
                seen.append(ws.receive_json())
    assert seen[-1]["type"] == "rectified_output" and seen[-1]["repaired_text"] == "Hello." and seen[-1]["audio_base64"]


def test_a_slow_repair_does_not_freeze_other_requests():
    # snapping looks words up in espeak: 7 s with a cold cache and 1,440 known words (measured 2026-10-25)
    import asyncio
    import threading
    import httpx
    import api
    started, other_answered, waited = threading.Event(), threading.Event(), []

    class SlowRepair:
        def repair(self, text, recognised=None):
            started.set()
            waited.append(other_answered.wait(timeout=3))   # True only if the server answered /health meanwhile
            return {"repaired_text": text, "latency_ms": 1.0}

    asr = mock.Mock()
    asr.transcribe.return_value = {"text": "hello", "words": None, "latency_ms": 1.0}
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})

    async def both():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api.app), base_url="http://t") as c:
            async def other():
                while not started.is_set():
                    await asyncio.sleep(0.01)
                await c.get("/health")
                other_answered.set()
            await asyncio.gather(c.post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH), other())

    _as(USER)
    try:
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr), \
                mock.patch.object(api, "get_repair_engine", return_value=SlowRepair()), mock.patch.object(api, "get_voice", return_value={}), \
                mock.patch.object(api, "synthesize_neural_async", voice):
            asyncio.run(both())
    finally:
        api.app.dependency_overrides.clear()
    assert waited == [True]


SAVED_VOICE ={"template": "female_warm_gentle", "pitch_hz": 10, "rate_pct": -5, "volume_pct": 0, "warmth_pct": 12, "roughness_pct": 4}


def _voice_world(voice_profile):
    tables, user_db, _ = _session_world()
    tables["patient_profiles"][0]["voice_profile"] = voice_profile
    return tables, user_db


def test_a_voice_profile_is_saved_only_within_the_ranges_synthesis_can_honour():
    from fastapi.testclient import TestClient
    import api
    tables, user_db = _voice_world({})
    _as(USER)
    try:
        with mock.patch.object(api, "user_client", return_value=user_db):
            c = TestClient(api.app)
            bad = [c.put("/api/voice/profile", headers=AUTH, json={**SAVED_VOICE, **change}).status_code
                   for change in ({"warmth_pct": 68}, {"roughness_pct": -5}, {"template": "darth_vader"}, {"pitch_hz": 500})]
            assert tables["patient_profiles"][0]["voice_profile"] == {}
            ok = c.put("/api/voice/profile", headers=AUTH, json=SAVED_VOICE)
    finally:
        api.app.dependency_overrides.clear()
    assert bad == [422, 422, 422, 422]
    assert ok.status_code == 200 and tables["patient_profiles"][0]["voice_profile"] == SAVED_VOICE


def _rectify_voice(voice_profile, body_extra=None):
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    _, user_db = _voice_world(voice_profile)
    asr = mock.Mock()
    asr.transcribe.return_value = {"text": "hello", "words": None, "latency_ms": 1.0}
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    _as(USER)
    try:
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr), \
                mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()), mock.patch.object(api, "user_client", return_value=user_db), \
                mock.patch.object(api, "synthesize_neural_async", voice):
            r = TestClient(api.app).post("/api/rectify", json={"audio_base64": _wav_b64(), **(body_extra or {})}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    return r, voice


def test_rectify_speaks_with_the_saved_voice_not_settings_sent_in_the_request():
    r, voice = _rectify_voice(SAVED_VOICE, {"voice_template": "male_deep_gruff", "pitch_hz": -90, "warmth_pct": 68})
    assert r.status_code == 200
    assert voice.await_args.kwargs == {"text": "Hello.", "voice": "en_US-lessac-medium", "pitch": "+10Hz", "rate": "-5%",
                                       "volume": "+0%", "warmth": 12, "roughness": 4}


def test_rectify_uses_the_default_voice_until_one_is_saved_and_never_another_voice_for_a_corrupted_one():
    r, voice = _rectify_voice({})
    assert r.status_code == 200 and voice.await_args.kwargs["voice"] == "en_US-ryan-medium" and voice.await_args.kwargs["warmth"] == 0
    assert r.json()["voice_error"] is None
    bad, voice = _rectify_voice({**SAVED_VOICE, "warmth_pct": 68})   # written straight to the database, around the API
    assert bad.status_code == 200 and bad.json()["repaired_text"] == "Hello."   # the patient still gets their sentence
    assert bad.json()["rectified_audio"] is None and "voice profile" in bad.json()["voice_error"] and not voice.await_args_list


@pytest.mark.parametrize("saved", [SAVED_VOICE, {**SAVED_VOICE, "template": "removed_in_an_update"}], ids=["valid", "corrupted"])
def test_websocket_speaks_with_the_saved_voice_or_sends_the_text_alone(saved):
    import json
    from fastapi.testclient import TestClient
    import api
    from intent_repair import IntentRepair
    _, user_db = _voice_world(saved)
    asr = mock.Mock()
    asr.transcribe.return_value = {"text": "hello", "words": None, "latency_ms": 1.0}
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    loud = (rng.standard_normal(1600) * 0.3 * 32767).astype("int16").tobytes()
    quiet = np.zeros(1600, dtype="int16").tobytes()
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id=USER)), mock.patch.object(api, "contains_speech", return_value=True), \
            mock.patch.object(api, "get_asr_engine", return_value=asr), mock.patch.object(api, "synthesize_neural_async", voice), \
            mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()), mock.patch.object(api, "user_client", return_value=user_db):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for chunk in [loud] * 6 + [quiet] * 16:
                ws.send_bytes(chunk)
            seen = []
            while not seen or seen[-1]["type"] == "telemetry":
                seen.append(ws.receive_json())
    out = seen[-1]
    assert out["type"] == "rectified_output" and out["repaired_text"] == "Hello."
    if saved == SAVED_VOICE:
        assert out["voice_error"] is None and out["audio_base64"]
        assert voice.await_args.kwargs["voice"] == "en_US-lessac-medium" and voice.await_args.kwargs["warmth"] == 12
    else:
        assert "voice profile" in out["voice_error"] and out["audio_base64"] is None and not voice.await_args_list


def test_sculpt_preview_rejects_out_of_range_values_and_applies_warmth_and_roughness():
    from fastapi.testclient import TestClient
    import api
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    _as(USER)
    try:
        with mock.patch.object(api, "synthesize_neural_async", voice):
            c = TestClient(api.app)
            too_warm = c.post("/api/voice/sculpt", headers=AUTH, json={"warmth_pct": 68})
            ok = c.post("/api/voice/sculpt", headers=AUTH, json=SAVED_VOICE)
    finally:
        api.app.dependency_overrides.clear()
    assert too_warm.status_code == 422 and ok.status_code == 200
    assert voice.await_args.kwargs["warmth"] == 12 and voice.await_args.kwargs["roughness"] == 4


def test_a_missing_voice_engine_is_a_clear_503_not_a_crash():
    from fastapi.testclient import TestClient
    import api
    _, user_db = _voice_world(SAVED_VOICE)
    _as(USER)
    try:
        with mock.patch.object(api, "get_restoration_engine", return_value=None), mock.patch.object(api, "user_client", return_value=user_db):
            c = TestClient(api.app, raise_server_exceptions=False)
            put, sculpt = c.put("/api/voice/profile", headers=AUTH, json=SAVED_VOICE), c.post("/api/voice/sculpt", headers=AUTH, json=SAVED_VOICE)
            with pytest.raises(api.HTTPException) as e:   # rectify and the websocket read the voice through this
                api.get_voice("t", USER)
    finally:
        api.app.dependency_overrides.clear()
    assert put.status_code == sculpt.status_code == e.value.status_code == 503


def test_voice_banking_hears_the_voice_not_the_quiet_background(tmp_path):
    # real recordings: the pitch tracker called quiet background "voiced" at its 65 Hz floor, so a woman (TORGO FC02,
    # 198 Hz) was banked as a man; and a note without speech counted as an invented 150 Hz (measured 2026-10-26)
    import soundfile as sf
    from voice_restoration import VoiceRestorationEngine
    t = np.arange(16000 * 3) / 16000
    hum = (0.01 * np.sin(2 * np.pi * 66 * t)).astype("float32")   # quiet low rumble, longer than the speech
    notes = []
    for i, audio in enumerate([np.concatenate([_voice_like(seconds=1.0, f0=210), hum])] * 2 + [np.zeros(16000 * 2, dtype="float32")]):
        sf.write(tmp_path / f"n{i}.wav", audio, 16000)
        notes.append(str(tmp_path / f"n{i}.wav"))
    banked = VoiceRestorationEngine().create_profile_from_voice_notes(notes)
    assert banked["gender"] == "female" and banked["template"].startswith("female")
    assert 190 < banked["reconstructed_f0"] < 230 and banked["voice_notes_count"] == 2   # the silent note is skipped, not 150 Hz


def test_voice_banking_returns_a_profile_that_can_be_saved_as_is(tmp_path):
    import soundfile as sf
    import api
    from voice_restoration import VoiceRestorationEngine
    notes = []
    for i in range(3):
        sf.write(tmp_path / f"n{i}.wav", _voice_like(seconds=2.0), 16000)
        notes.append(str(tmp_path / f"n{i}.wav"))
    banked = VoiceRestorationEngine().create_profile_from_voice_notes(notes)
    api.VoiceProfile(**{k: banked[k] for k in api.VoiceProfile.model_fields})   # raises if out of range


def _contact(c, **over):
    body = {"topic": "voice", "email": "someone@example.com", "message": "The voice is quiet.", "captcha_token": "tok", **over}
    return c.post("/api/contact", json=body)


def test_contact_form_checks_everything_on_the_server(monkeypatch):
    from fastapi.testclient import TestClient
    import api
    c = TestClient(api.app)
    db = mock.MagicMock()
    db.table.return_value.insert.return_value.execute.return_value.data = [{"id": "m1"}]
    monkeypatch.setattr(api, "service_client", lambda: db)
    # A bot that fills in the hidden field is told all is well, and nothing is kept or sent.
    assert _contact(c, website="http://spam").json() == {"saved": True, "emailed": True}
    assert not db.table.called
    # Bad input never reaches the database.
    assert _contact(c, topic="sales").status_code == 422
    assert _contact(c, email="not-an-address").status_code == 422
    assert _contact(c, message="x" * 4001).status_code == 422
    # Without the CAPTCHA's server secret the form can't be protected, so it refuses (fails closed).
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    assert _contact(c).status_code == 503
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "secret")
    with mock.patch.object(api, "_captcha_ok", return_value=False):
        assert _contact(c, email="a@example.com").status_code == 403
    # A good message is saved; when mail isn't set up, the answer says it wasn't emailed (the page says so honestly).
    with mock.patch.object(api, "_captcha_ok", return_value=True), mock.patch.object(api, "_send_contact_email", return_value=False):
        r = _contact(c, email="b@example.com")
    assert r.status_code == 200 and r.json() == {"saved": True, "emailed": False}
    db.table.return_value.insert.assert_called_once()
    with mock.patch.object(api, "_captcha_ok", return_value=True), mock.patch.object(api, "_send_contact_email", return_value=True):
        assert _contact(c, email="c@example.com").json() == {"saved": True, "emailed": True}


def test_contact_form_limits_each_sender():
    from fastapi.testclient import TestClient
    import api
    c = TestClient(api.app)
    limiter = api.service_client()   # the fake rate limiter (fake_limiter); the message table is a plain stand-in
    rpc = limiter.rpc
    limiter.rpc = lambda fn, params: rpc(fn, params) if fn == "rate_limit_hit" else mock.MagicMock()
    limiter.table = mock.MagicMock()
    with mock.patch.object(api, "_captcha_ok", return_value=True), mock.patch.object(api, "_send_contact_email", return_value=True):
        codes = [_contact(c, email="same@example.com").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
