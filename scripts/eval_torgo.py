"""
Zero-shot evaluation of the ASR (+ the repair step) on real TORGO speech, per speaker and per group.

    python scripts/eval_torgo.py [data/TORGO]

Nothing here is trained on TORGO, so every speaker is held out. Leave-one-speaker-out only matters once a model
is fine-tuned. WER is total errors / total reference words, with 95% bootstrap intervals over utterances.
"""
import json
import os
import sys

import librosa
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

from data_ingestion import TorgoDataset
from eval_metrics import summarize
from intent_repair import IntentRepair
from speech_recognizer import DysarthriaSpeechRecognizer


def main(data_dir):
    samples = TorgoDataset(data_dir, filter_unintelligible=True).samples
    asr, repair = DysarthriaSpeechRecognizer(), IntentRepair()
    rows = []
    for i, s in enumerate(samples, 1):
        audio, sr = sf.read(s["wav_path"], dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        raw = asr.transcribe(audio, sample_rate=16000)["text"]
        rows.append({"speaker": s["speaker_id"], "dysarthric": s["is_dysarthric"], "severity": s["severity"],
                     "ref": s["text"], "raw": raw, "repaired": repair.repair(raw)["repaired_text"]})
        print(f"\r[{i}/{len(samples)}]", end="", flush=True)

    result = summarize(rows)
    pct = lambda t: f"{t[0] * 100:5.1f}% [{t[1] * 100:5.1f}, {t[2] * 100:5.1f}]"
    print(f"\n\n{'speaker':18s}{'severity':10s}{'utts':>5s}{'words':>6s}   {'raw WER [95% CI]':26s}{'repaired WER [95% CI]':26s}{'raw - repaired':22s}")
    for r in result:
        print(f"{r['name']:18s}{r['severity']:10s}{r['n']:5d}{r['words']:6d}   {pct(r['raw']):26s}{pct(r['repaired']):26s}{pct(r['gain'])}")
    print("\nSeverity labels come from scripts/fetch_mini_torgo.py and are unverified against the TORGO documentation.")

    os.makedirs(os.path.join(ROOT, "outputs"), exist_ok=True)
    with open(os.path.join(ROOT, "outputs", "eval_torgo.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "summary": result}, f, indent=2)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "TORGO"))
