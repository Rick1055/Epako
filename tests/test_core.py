import sys
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
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id=uid)
    try:
        with mock.patch.object(api, "service_client", return_value=writer):
            c = TestClient(api.app)
            assert c.request("DELETE", "/api/me/data", json={"confirm": "no"}).status_code == 400
            assert order == []
            assert c.request("DELETE", "/api/me/data", json={"confirm": "DELETE"}).status_code == 200
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
