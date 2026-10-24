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
    mgr = SupabaseManager.__new__(SupabaseManager)
    mgr.client, mgr.current_profile = mock.MagicMock(), {"id": "p"}
    mgr.client.table.return_value.insert.return_value.execute.return_value = mock.Mock(data=[])
    assert mgr.log_biomarkers("s", {**low, "articulation_velocity": 3.0})[key] is None
    sent = mgr.client.table.return_value.insert.call_args.args[0]
    assert sent[key] is None
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
    mgr.client.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db down")
    with pytest.raises(RuntimeError):
        mgr.log_biomarkers("s", {})
    mgr.bucket_name, mgr.current_user = "b", mock.Mock(id="u")
    mgr.client.storage.from_.return_value.upload.side_effect = RuntimeError("storage down")
    with pytest.raises(RuntimeError):
        mgr.upload_audio(b"x", "a.wav")
