"""Is anyone speaking? Run before the recogniser so silence and noise are never "transcribed".

The recogniser invents plausible sentences from silence (it was trained partly on voice-assistant commands:
"how many refills are left on my...", "what is the weather on..."). In a voice app those would be spoken aloud
in the patient's voice. Silero VAD (MIT) tells speech from noise by structure, not loudness, so a steady
background hum does not hide real speech the way a volume threshold would.
"""
import functools
import importlib.util
import os
from pathlib import Path

import librosa
import numpy as np

# Stage 1 (Energy Floor) & Stage 2 (VAD Structure Gate)
# MIN_RMS = 0.001 rejects digital silence below -60 dBFS while allowing soft dysarthric speech.
# THRESHOLD = 0.20 is calibrated on TORGO benchmark to preserve quiet and slurred vocalizations.
MIN_RMS = 0.001
THRESHOLD = 0.20
_WINDOW, _CONTEXT = 512, 64   # the model reads 32 ms windows at 16 kHz plus the last 64 samples of the previous one


@functools.lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort
    path = os.getenv("SILERO_VAD_ONNX")
    if not path:
        # only the model file is used; the package itself is never imported, so it needs no torchaudio
        spec = importlib.util.find_spec("silero_vad")
        if spec is None:
            raise FileNotFoundError("silero-vad is not installed (pip install --no-deps silero-vad==6.2.3)")
        path = Path(list(spec.submodule_search_locations)[0]) / "data" / "silero_vad.onnx"
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def speech_probabilities(audio, sample_rate=16000):
    """Probability of speech for each 32 ms window."""
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    if sample_rate != 16000:
        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=16000)
    session, sr = _session(), np.array(16000, dtype=np.int64)
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros(_CONTEXT, dtype=np.float32)
    probs = []
    for i in range(0, len(audio) - _WINDOW + 1, _WINDOW):
        window = audio[i:i + _WINDOW]
        out, state = session.run(None, {"input": np.concatenate([context, window])[None, :], "state": state, "sr": sr})
        probs.append(float(out[0, 0]))
        context = window[-_CONTEXT:]
    return np.array(probs)


def contains_speech(audio, sample_rate=16000, threshold=THRESHOLD, min_rms=MIN_RMS):
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    if audio.size == 0:
        return False
    if min_rms is not None and float(np.sqrt(np.mean(audio**2))) < min_rms:
        return False
    probs = speech_probabilities(audio, sample_rate)
    return bool(len(probs) and probs.max() >= threshold)


# Live-stream endpointing, chosen on 56 real TORGO clips streamed as 100 ms chunks (2026-10-26):
# START_P = 0.55 prevents ambient noise spikes from triggering speech onset prematurely.
START_P = 0.55       # a chunk this likely to be speech starts an utterance
STOP_P = 0.35        # below this a chunk counts as quiet
END_QUIET_S = 1.5    # quiet this long ends it: dysarthric speech pauses mid-sentence
PRE_ROLL_S = 0.3     # audio kept from before the start, so a soft onset is not clipped
MIN_SPEECH_S = 0.3   # shorter than this in total is a click or a cough, not an utterance


class StreamVAD:
    """speech_probabilities for audio that arrives in chunks: keeps the model's state and the last few samples between
    chunks, so it gives the same per-window probabilities as the whole recording would."""

    def __init__(self):
        self.session = _session()
        self.state = np.zeros((2, 1, 128), dtype=np.float32)
        self.context = np.zeros(_CONTEXT, dtype=np.float32)
        self.rest = np.zeros(0, dtype=np.float32)

    def feed(self, chunk):
        """Highest speech probability over the complete 32 ms windows this chunk completes (0.0 if none)."""
        x = np.concatenate([self.rest, np.asarray(chunk, dtype=np.float32)])
        best, sr = 0.0, np.array(16000, dtype=np.int64)
        for i in range(0, len(x) - _WINDOW + 1, _WINDOW):
            window = x[i:i + _WINDOW]
            out, self.state = self.session.run(None, {"input": np.concatenate([self.context, window])[None, :], "state": self.state, "sr": sr})
            best = max(best, float(out[0, 0]))
            self.context = window[-_CONTEXT:]
        self.rest = x[len(x) // _WINDOW * _WINDOW:]
        return best
