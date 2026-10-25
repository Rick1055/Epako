"""On-device speech synthesis (Piper). Text never leaves this machine."""
import os
import re
import threading
import time

import librosa
import numpy as np
import scipy.signal

VOICES_DIR = os.getenv("PIPER_VOICES_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "piper")
DEFAULT_VOICE = "en_US-ryan-medium"

_voices = {}
_lock = threading.Lock()
ESPEAK_LOCK = threading.Lock()  # espeak-ng keeps global state: one phonemizer call at a time (Piper's and vocabulary.py's)


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


def shape_voice(audio, sr, warmth=0, roughness=0):
    """warmth -20..20 tilts the tone darker (+) or brighter (-); roughness 0..20 adds a breath-like texture that follows
    the voice. They move spectral centroid and flatness, which is how voice banking measures them (voice_restoration.py)."""
    if not warmth and not roughness:
        return audio
    peak, out = np.abs(audio).max(), audio.astype(np.float64)
    if warmth:
        b, a = scipy.signal.butter(1, 1000, btype="lowpass", fs=sr)
        low, g = scipy.signal.lfilter(b, a, out), 0.5 * np.clip(warmth, -20, 20) / 20
        out = (1 + g) * low + (1 - g) * (out - low)
    if roughness > 0:
        b, a = scipy.signal.butter(2, [800, 3500], btype="bandpass", fs=sr)
        noise = scipy.signal.lfilter(b, a, np.random.default_rng(0).standard_normal(len(out)))   # fixed seed: same voice every time
        win = max(1, int(0.025 * sr))
        envelope = np.sqrt(np.convolve(out ** 2, np.ones(win) / win, mode="same"))
        snr_db = 40.0 - 1.25 * min(roughness, 20)   # 0 -> 40 dB (inaudible) ... 20 -> 15 dB
        out = out + noise / (np.sqrt(np.mean(noise ** 2)) + 1e-12) * envelope * 10 ** (-snr_db / 20)
    top = np.abs(out).max()
    return (out * (peak / top) if top > 0 else out).astype(np.float32)   # same peak: shaping never changes loudness or clips


def synthesize(text, voice=DEFAULT_VOICE, pitch="+0Hz", rate="+0%", volume="+0%", sample_rate=16000, warmth=0, roughness=0):
    """pitch is a Hz offset, rate and volume are percent offsets (e.g. "+5Hz", "-10%"), warmth -20..20 and roughness
    0..20 shape the tone (shape_voice), as in the voice profiles."""
    from piper import SynthesisConfig
    start = time.time()
    v = _load(voice)
    length_scale = 1.0 / (1.0 + np.clip(_percent(rate), -50, 100) / 100.0)
    # shortcut: Piper phonemizes inside its synthesis generator, so the whole synthesis is serialised; split it if voices must run in parallel
    with ESPEAK_LOCK:
        chunks = list(v.synthesize(text, syn_config=SynthesisConfig(length_scale=length_scale)))
    sr = v.config.sample_rate
    audio = np.concatenate([c.audio_float_array for c in chunks]) if chunks else np.zeros(0, dtype=np.float32)

    pitch_hz = float(np.clip(float(pitch.strip().removesuffix("Hz")), -100, 100))
    if pitch_hz and len(audio):
        # shortcut: Hz offsets are converted to semitones against a nominal 150 Hz voice; use the voice's real F0 if this matters
        audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=12 * np.log2((150.0 + pitch_hz) / 150.0))
    audio = shape_voice(audio, sr, warmth, roughness)
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
