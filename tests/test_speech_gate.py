import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from speech_gate import contains_speech, speech_probabilities

rng = np.random.default_rng(0)
t16 = np.arange(16000) / 16000


def test_silence_noise_and_hum_are_not_speech():
    assert contains_speech(np.zeros(16000, dtype="float32")) is False
    assert contains_speech((0.01 * rng.standard_normal(16000)).astype("float32")) is False   # quiet background noise
    assert contains_speech((0.1 * rng.standard_normal(16000)).astype("float32")) is False    # loud broadband noise
    assert contains_speech((0.3 * np.sin(2 * np.pi * 50 * t16)).astype("float32")) is False  # mains hum


def test_audio_too_short_to_hold_speech_is_rejected_without_error():
    assert contains_speech(np.zeros(300, dtype="float32")) is False
    assert contains_speech(np.zeros(0, dtype="float32")) is False


def test_other_sample_rates_are_resampled_not_misread():
    assert contains_speech(np.zeros(44100, dtype="float32"), sample_rate=44100) is False


def test_probabilities_are_one_per_32ms_window_and_bounded():
    p = speech_probabilities((0.01 * rng.standard_normal(16000)).astype("float32"))
    assert len(p) == 16000 // 512 and ((p >= 0) & (p <= 1)).all()


@pytest.mark.skipif(not (ROOT / "models/piper/en_US-ryan-medium.onnx").exists(), reason="Piper voices not downloaded")
def test_real_speech_is_detected_alone_with_silence_around_it_and_over_hum():
    import local_tts
    speech = local_tts.synthesize("The morning sun gently illuminates the quiet cedar grove.")["audio"]
    assert contains_speech(speech) is True
    padded = np.concatenate([np.zeros(16000, dtype="float32"), speech, np.zeros(16000, dtype="float32")])
    assert contains_speech(padded) is True
    hum = 0.02 * np.sin(2 * np.pi * 50 * np.arange(len(speech)) / 16000)
    assert contains_speech((speech + hum).astype("float32")) is True
