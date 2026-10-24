"""On-device speech synthesis (Piper). Text never leaves this machine."""
import os
import re
import threading
import time

import librosa
import numpy as np

VOICES_DIR = os.getenv("PIPER_VOICES_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "piper")
DEFAULT_VOICE = "en_US-ryan-medium"

_voices = {}
_lock = threading.Lock()


def _load(name):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise ValueError(f"Invalid voice name: {name!r}")
    with _lock:
        if name not in _voices:
            from piper import PiperVoice
            path = os.path.join(VOICES_DIR, f"{name}.onnx")
            if not os.path.isfile(path):
                raise FileNotFoundError(f"Voice model not installed: {path} (python -m piper.download_voices {name} --download-dir models/piper)")
            _voices[name] = PiperVoice.load(path)
        return _voices[name]


def _percent(text):
    return float(text.strip().rstrip("%"))


def synthesize(text, voice=DEFAULT_VOICE, pitch="+0Hz", rate="+0%", volume="+0%", sample_rate=16000):
    """pitch is a Hz offset, rate and volume are percent offsets (e.g. "+5Hz", "-10%"), as in the voice profiles."""
    from piper import SynthesisConfig
    start = time.time()
    v = _load(voice)
    length_scale = 1.0 / (1.0 + np.clip(_percent(rate), -50, 100) / 100.0)
    chunks = list(v.synthesize(text, syn_config=SynthesisConfig(length_scale=length_scale)))
    sr = v.config.sample_rate
    audio = np.concatenate([c.audio_float_array for c in chunks]) if chunks else np.zeros(0, dtype=np.float32)

    pitch_hz = float(np.clip(float(pitch.strip().removesuffix("Hz")), -100, 100))
    if pitch_hz and len(audio):
        # shortcut: Hz offsets are converted to semitones against a nominal 150 Hz voice; use the voice's real F0 if this matters
        audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=12 * np.log2((150.0 + pitch_hz) / 150.0))
    audio = audio * (1.0 + _percent(volume) / 100.0)
    if sr != sample_rate:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=sample_rate)
    audio = np.clip(audio, -1.0, 1.0)  # after resampling, which can overshoot

    return {
        "audio": audio.astype(np.float32),
        "sample_rate": sample_rate,
        "latency_ms": (time.time() - start) * 1000.0,
        "duration_sec": len(audio) / sample_rate,
    }
