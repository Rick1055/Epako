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


@pytest.fixture(autouse=True)
def fake_limiter():
    import api
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


def test_pdf_report_comes_from_stored_session():
    from fastapi.testclient import TestClient
    import api
    sid = "11111111-1111-1111-1111-111111111111"
    rows = {"therapy_sessions": [{"patient_id": "pseudonym-1"}],
            "clinical_assessments": [{"clinician_id": "c1", "condition": "Ataxic dysarthria",
                                      "impression": "i", "home_plan": "h", "frequency": "f"}],
            "clinicians": [{"display_name": "Dr Real"}],
            "biomarker_logs": [{"articulation_velocity": 3.0, "speaking_rate": 2.0, "pause_ratio": 0.3,
                                "vocal_jitter_pct": 1.0, "vocal_shimmer_pct": 3.0, "mean_f0_hz": 140.0,
                                "formant_compression_index": None, "stability_index": 90.0}],
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


def test_repair_uses_learned_table():
    from feedback_engine import FeedbackEngine
    table = {"wun": {"to": "one", "ok": 3, "bad": 0}}
    assert IntentRepair(FeedbackEngine(table)).repair("wun wun cat")["repaired_text"] == "One cat."


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
    for f in [*(ROOT / "src").glob("*.py"), ROOT / "run_benchmark.py", ROOT / "requirements.txt"]:
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
    """Catches the NameError class of bug (a missing import) in code no test executes, e.g. run_benchmark.py."""
    check = pytest.importorskip("pyflakes.api").check
    from pyflakes.reporter import Reporter
    import io
    files = [*ROOT.glob("src/*.py"), *ROOT.glob("tests/*.py"), *ROOT.glob("scripts/*.py"), ROOT / "run_benchmark.py", ROOT / "test_api_e2e.py"]
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
        self.tables, self.writes = tables, []

    def table(self, name):
        return _FakeQuery(self, name)

    def rpc(self, fn, params):
        return mock.Mock(execute=lambda: mock.Mock(data=True))  # the rate limiter always allows


class _FakeQuery:
    def __init__(self, db, name):
        self.db, self.name, self.filters, self.op, self.payload = db, name, [], "select", None

    def select(self, *_):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def order(self, *_, **__):
        return self

    def limit(self, _):
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
        return mock.Mock(data=[dict(r) for r in matched])


def _session_world():
    tables = {
        "patient_profiles": [{"id": "p1", "user_id": USER, "phonetic_corrections": {}}],
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
    assert done.json()["utterances_count"] == 3 and done.json()["accuracy_rate"] == pytest.approx(33.33, abs=0.01)
    assert set(user_db.writes) == {"patient_profiles"}                           # the patient's own client never writes scores
    assert set(server_db.writes) == {"therapy_sessions", "session_utterances"}   # only the server key does


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
        with mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr),              mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()):
            r = TestClient(api.app).post("/api/rectify", json={"audio_base64": _wav_b64()}, headers=AUTH)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 200 and r.json()["speech_detected"] is True
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
            for chunk in [loud] * 6 + [quiet] * 8:
                ws.send_bytes(chunk)
            seen = []
            while not seen or seen[-1]["type"] == "telemetry":
                seen.append(ws.receive_json())
    assert seen[-1]["type"] == "no_speech"
    asr_loader.assert_not_called()
