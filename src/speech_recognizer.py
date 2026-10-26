import threading
import time
import torch
import numpy as np
import librosa
from transformers import pipeline


def word_confidences(pieces):
    """[(word piece, probability)] -> [{"word", "confidence"}]; "▁" starts a word, and a word is as unsure as its least sure piece."""
    out = []
    for piece, p in pieces:
        if piece.startswith("▁") or not out:
            out.append({"word": piece.lstrip("▁"), "confidence": p})
        else:
            out[-1]["word"] += piece
            out[-1]["confidence"] = min(out[-1]["confidence"], p)
    return [w for w in out if w["word"]]


class DysarthriaSpeechRecognizer:
    """
    Dysarthric speech recogniser: Parakeet-TDT (FastConformer), the dys-asr checkpoint, which its authors describe as
    trained with Speech Accessibility Project data. On full TORGO (2026-10-25): 41.9% WER on dysarthric speech, 12.0% on control.
    Runs in FP16 on NVIDIA GPUs (measured 2026-10-25 on an RTX 3050, real TORGO clips: median 187 ms, p90 326 ms).
    """

    def __init__(self, model_name="dys-asr/parakeet-tdt-0.6b-unconstrained-soup", device=None):
        self.device = device if device is not None else ("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.model_name = model_name

        print(f"[+] Initializing Dysarthria Recognizer on: {self.device.upper()} ({self.dtype})")
        if self.device == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")

        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=self.model_name,
            device=0 if self.device == "cuda" else -1,
            dtype=self.dtype,
        )
        self._lock, self._steps = threading.Lock(), []
        model, update = self.pipe.model, self.pipe.model._update_model_kwargs_for_generation

        def record(outputs, *args, **kwargs):
            # shortcut: Parakeet's generate() drops per-step scores, so they are read through this transformers internal;
            # transcribe() cross-checks them against the text and reports words=None if a transformers upgrade breaks it
            logits = outputs.logits[0, -1, :model.config.vocab_size].float()
            token = int(logits.argmax())
            self._steps.append((token, float(torch.softmax(logits, -1)[token])))
            return update(outputs, *args, **kwargs)
        model._update_model_kwargs_for_generation = record
        print("[+] Model loaded successfully!")

        # Warm-up pass: compile CUDA kernels now so the first patient does not pay for it
        if self.device == "cuda":
            print("[+] Warming up GPU CUDA kernels...")
            dummy_audio = np.zeros(16000, dtype=np.float32)  # 1 second of silence
            with torch.inference_mode():
                _ = self.pipe(
                    {"raw": dummy_audio, "sampling_rate": 16000},
                    generate_kwargs={"max_new_tokens": 16},
                )
                torch.cuda.empty_cache()
            print("[+] GPU warm-up complete.")

    def transcribe(self, audio, sample_rate=16000, max_new_tokens=128):
        """
        Transcribes a speech audio array into clear text.
        
        Args:
            audio: numpy array or torch Tensor of raw PCM audio.
            sample_rate: sampling rate of input audio (resampled to 16kHz if needed).
            max_new_tokens: maximum tokens to generate (avoids default max_length warning).
            
        Returns:
            dict: { "text": str, "words": [{"word": str, "confidence": float}] | None, "latency_ms": float, "device": str }
        """
        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()
        audio = np.asarray(audio, dtype=np.float32).squeeze()

        if sample_rate != 16000:
            audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=16000)

        start_time = time.time()
        with self._lock, torch.inference_mode():   # one utterance at a time: the step record is shared
            self._steps = []
            result = self.pipe(
                {"raw": audio, "sampling_rate": 16000},
                generate_kwargs={"max_new_tokens": max_new_tokens},
            )
            steps = self._steps
        latency_ms = (time.time() - start_time) * 1000.0

        tok = self.pipe.tokenizer
        skip = set(tok.all_special_ids) | {self.pipe.model.config.blank_token_id}   # decode() drops blank, all_special_ids lacks it
        emitted = [(t, p) for t, p in steps if t not in skip]
        words = word_confidences([(tok.convert_ids_to_tokens(t), round(p, 3)) for t, p in emitted])
        if tok.decode([t for t, _ in emitted], skip_special_tokens=True, group_tokens=False).strip() != result["text"].strip():
            print("[!] Word confidences do not match the transcript; reporting none.")
            words = None

        return {
            "text": result["text"].strip(),
            "words": words,   # [{"word", "confidence"}] or None; snapping only acts on words the recogniser was unsure of
            "latency_ms": float(latency_ms),
            "device": self.device,
        }


if __name__ == "__main__":
    import os

    print("=" * 65)
    print("DYSARTHRIC SPEECH RECOGNITION (PARAKEET-TDT / FP16 GPU)")
    print("=" * 65)

    recognizer = DysarthriaSpeechRecognizer()

    # Priority 1: Authentic TORGO Dysarthric Sample (Speaker F01, Cerebral Palsy)
    torgo_sample = os.path.join("data", "TORGO", "F01", "Session1", "wav_headMic", "0011.wav")
    synthetic_sample = "test_dysarthric_moderate.wav"

    test_audio_path = torgo_sample if os.path.exists(torgo_sample) else synthetic_sample

    if os.path.exists(test_audio_path):
        print(f"\n[>] Benchmark Target: {test_audio_path}")
        audio, sr = librosa.load(test_audio_path, sr=16000)
        print(f"    Audio Duration: {len(audio) / sr:.2f} seconds")

        print("\n[>] Running GPU-accelerated transcription...")
        result = recognizer.transcribe(audio, sample_rate=16000)

        print("\n" + "=" * 65)
        print("RESULTS:")
        print(f"  Transcribed Text : \"{result['text']}\"")
        print(f"  Inference Latency: {result['latency_ms']:.2f} ms")
        print(f"  Device           : {result['device']}")
        print("=" * 65)
    else:
        print(f"[!] Neither {torgo_sample} nor {synthetic_sample} was found.")
