"""The API attacked the way outsiders and abusive accounts would. Routes are enumerated from the app, so a route
added later is attacked too. Database-level attacks (other patients' rows, unverified clinicians) are in test_rls.py."""
import sys
import uuid
from pathlib import Path
from unittest import mock

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import api

HTTP_ROUTES = [(m, r.path) for r in api.app.routes if isinstance(r, APIRoute) for m in r.methods if r.path != "/health"]
SID = str(uuid.uuid4())


def _call(c, method, path, headers):
    return c.request(method, path.replace("{session_id}", SID), headers=headers, json={})


@pytest.mark.parametrize("method,path", HTTP_ROUTES)
def test_no_route_but_health_answers_an_anonymous_or_forged_caller(method, path):
    c = TestClient(api.app)
    forged = mock.patch.object(api, "verify_token", side_effect=api.HTTPException(status_code=401, detail="Invalid or missing token"))
    with forged:
        for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer "}, {"Authorization": "Bearer forged.jwt.token"}):
            r = _call(c, method, path, headers)
            assert r.status_code in (401, 422), (method, path, headers, r.status_code)


@pytest.mark.parametrize("method,path", HTTP_ROUTES)
def test_every_signed_in_route_is_rate_limited(method, path):
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id="flooder", email="f@example.com", app_metadata={})
    try:
        with mock.patch.object(api, "hit", side_effect=api.HTTPException(status_code=429, detail="Too many requests.")):
            r = _call(TestClient(api.app), method, path, {"Authorization": "Bearer t"})
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 429, (method, path, r.status_code)


def _signed_in(uid="attacker"):
    api.app.dependency_overrides[api.require_user] = lambda: mock.Mock(id=uid, email="a@example.com", app_metadata={})


def _wav_header(sample_rate, n_samples=1600):
    import struct
    data = b"\x00\x01" * n_samples
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2 % 2**32, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)


@pytest.mark.parametrize("payload", [b"\x00garbage" * 500, _wav_header(2_000_000_000), _wav_header(1), b"RIFF" + b"\xff" * 100],
                         ids=["random-bytes", "2-GHz-sample-rate", "1-Hz-sample-rate", "broken-header"])
def test_poisoned_audio_gets_a_clean_refusal_not_a_crash(payload):
    _signed_in()
    try:
        with mock.patch.object(api, "hit"), mock.patch.object(api, "contains_speech", return_value=True), \
                mock.patch.object(api, "get_asr_engine", side_effect=AssertionError("must not reach the recogniser")):
            c = TestClient(api.app, raise_server_exceptions=False)
            rect = c.post("/api/rectify", headers={"Authorization": "Bearer t"}, files={"file": ("a.wav", payload, "audio/wav")})
            bio = c.post("/api/biomarkers", headers={"Authorization": "Bearer t"}, files={"file": ("a.wav", payload, "audio/wav")})
    finally:
        api.app.dependency_overrides.clear()
    assert 400 <= rect.status_code < 500 and 400 <= bio.status_code < 500, (rect.status_code, bio.status_code)


def test_voice_banking_refuses_a_flood_of_files():
    _signed_in()
    files = [("files", (f"n{i}.wav", _wav_header(16000), "audio/wav")) for i in range(50)]
    try:
        with mock.patch.object(api, "hit"):
            r = TestClient(api.app, raise_server_exceptions=False).post("/api/voice/bank", headers={"Authorization": "Bearer t"}, files=files)
    finally:
        api.app.dependency_overrides.clear()
    assert r.status_code == 400 and "at most" in r.json()["detail"]


def test_voice_notes_are_read_only_up_to_a_bounded_length(tmp_path):
    import numpy as np
    import soundfile as sf
    from voice_restoration import MAX_NOTE_SECONDS, VoiceRestorationEngine
    long_note = (0.2 * np.sin(2 * np.pi * 150 * np.arange(16000 * 280) / 16000)).astype("float32")   # 280 s fits in 10 MB
    paths = []
    for i in range(3):
        sf.write(tmp_path / f"n{i}.wav", long_note, 16000, subtype="PCM_16")
        paths.append(str(tmp_path / f"n{i}.wav"))
    profile = VoiceRestorationEngine().create_profile_from_voice_notes(paths)
    assert profile["total_duration_s"] <= 3 * MAX_NOTE_SECONDS


def _ws_utterances(n, hit):
    import json
    import numpy as np
    from intent_repair import IntentRepair
    asr = mock.Mock()
    asr.transcribe.return_value = {"text": "hello", "words": None, "latency_ms": 1.0}
    loud = (np.random.default_rng(0).standard_normal(1600) * 0.3 * 32767).astype("int16").tobytes()
    quiet = bytes(3200)
    voice = mock.AsyncMock(return_value={"audio": np.zeros(1600, dtype="float32"), "latency_ms": 1.0})
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="ws-flooder")), mock.patch.object(api, "hit", hit), \
            mock.patch.object(api, "contains_speech", return_value=True), mock.patch.object(api, "get_asr_engine", return_value=asr), \
            mock.patch.object(api, "get_repair_engine", return_value=IntentRepair()), mock.patch.object(api, "get_voice", return_value={}), \
            mock.patch.object(api, "synthesize_neural_async", voice):
        with TestClient(api.app).websocket_connect("/ws/rectify") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}))
            replies = []
            for _ in range(n):
                for chunk in [loud] * 6 + [quiet] * 8:
                    ws.send_bytes(chunk)
                while not replies or replies[-1]["type"] == "telemetry":
                    replies.append(ws.receive_json())
                replies.append({"type": "telemetry"})   # separator so the next utterance is awaited
    return [r for r in replies if r["type"] != "telemetry"], asr


def test_each_utterance_in_a_websocket_counts_against_the_same_limit_as_rectify():
    calls = []
    replies, _ = _ws_utterances(3, lambda name, *a, **k: calls.append(name))
    assert calls.count("rectify") == 3 and [r["type"] for r in replies] == ["rectified_output"] * 3


def test_a_websocket_over_its_limit_gets_an_error_and_no_recogniser_time():
    def hit(name, *a, **k):
        if name == "rectify":
            raise api.HTTPException(status_code=429, detail="Too many requests.")
    replies, asr = _ws_utterances(2, hit)
    assert [r["type"] for r in replies] == ["error", "error"] and asr.transcribe.call_count == 0


def test_one_account_cannot_hold_many_websockets_open():
    import json
    from starlette.websockets import WebSocketDisconnect
    auth, ping = (json.dumps(m) for m in ({"type": "auth", "token": "t", "sample_rate": 16000, "encoding": "pcm_s16le"}, {"type": "ping"}))
    c = TestClient(api.app)
    with mock.patch.object(api, "verify_token", return_value=mock.Mock(id="hoarder")), mock.patch.object(api, "hit"):
        with c.websocket_connect("/ws/rectify") as a, c.websocket_connect("/ws/rectify") as b:
            for ws in (a, b):
                ws.send_text(auth)
                ws.send_text(ping)
                assert ws.receive_json()["type"] == "pong"
            with c.websocket_connect("/ws/rectify") as third:
                third.send_text(auth)
                third.send_text(ping)   # an open socket would answer "pong"; a refused one is closed
                with pytest.raises(WebSocketDisconnect) as e:
                    third.receive_json()
    assert e.value.code == 1008


@pytest.mark.parametrize("stored", ["not a profile", ["a", "list"], {"template": {"nested": 1}}, {"pitch_hz": "loud"}])
def test_a_tampered_saved_voice_is_refused_cleanly(stored):
    tables = {"patient_profiles": [{"id": "p1", "user_id": "attacker", "voice_profile": stored}]}

    class Db:
        def table(self, name):
            q = mock.Mock()
            q.select.return_value.eq.return_value.execute.return_value.data = tables[name]
            return q
    with mock.patch.object(api, "user_client", return_value=Db()):
        with pytest.raises(api.HTTPException) as e:
            api.get_voice("t", "attacker")
    assert e.value.status_code == 422


def test_browsers_may_send_every_method_the_api_uses_and_nothing_more():
    cors = next(m for m in api.app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    used = {m for r in api.app.routes if isinstance(r, APIRoute) for m in r.methods} | {"OPTIONS"}
    assert set(cors.kwargs["allow_methods"]) == used and cors.kwargs["allow_credentials"] is False
