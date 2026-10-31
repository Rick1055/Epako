"""
Zero-shot evaluation of the whole pipeline (speech gate -> recogniser -> repair) on real TORGO speech.

    python scripts/eval_torgo.py [data dir] [--mic wav_headMic] [--limit N]

A data dir holding manifest.csv is from fetch_torgo_full.py. Nothing here is trained on TORGO, so every speaker is held out. WER is total errors / total
reference words with 95% bootstrap intervals over utterances. An utterance the gate refuses is scored as an empty
transcript: that is what the patient would get. Rows are saved as they finish, so a stopped run resumes.
"""
import argparse
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
src_dir = os.path.join(ROOT, "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

try:
    from src.eval_metrics import summarize
except ImportError:
    from eval_metrics import summarize


def manifest_samples(root, mic):
    """Utterances with real reference words on one mic (not instructions, 'xxx', picture prompts or empty takes)."""
    out = []
    for r in csv.DictReader(open(os.path.join(root, "manifest.csv"), encoding="utf-8")):
        p = re.sub(r"\[.*?\]", "", r["prompt"]).strip()   # "read [as in ...]": the note is for the speaker, not said
        if r["mic"] != mic or not p or p.lower() == "xxx" or "input/images" in p or "\x1b" in p:
            continue
        out.append({"speaker_id": r["speaker"], "is_dysarthric": not r["speaker"].upper().startswith(("FC", "MC")),
                    "severity": "-", "text": p, "wav_path": os.path.join(root, r["wav"])})
    return out


def main(data_dir, mic, limit):
    import librosa
    import soundfile as sf

    try:
        from src.data_ingestion import TorgoDataset
        from src.intent_repair import IntentRepair
        from src.speech_gate import contains_speech
        from src.speech_recognizer import DysarthriaSpeechRecognizer
    except ImportError:
        from data_ingestion import TorgoDataset
        from intent_repair import IntentRepair
        from speech_gate import contains_speech
        from speech_recognizer import DysarthriaSpeechRecognizer

    if os.path.exists(os.path.join(data_dir, "manifest.csv")):
        samples = manifest_samples(data_dir, mic)
    else:
        samples = TorgoDataset(data_dir, filter_unintelligible=True).samples
    samples = samples[:limit] if limit else samples

    os.makedirs(os.path.join(ROOT, "outputs"), exist_ok=True)
    cache = os.path.join(ROOT, "outputs", "eval_torgo_rows.jsonl")
    done = {}
    if os.path.exists(cache):
        done = {r["wav"]: r for r in map(json.loads, open(cache, encoding="utf-8"))}
    asr, repair = DysarthriaSpeechRecognizer(), IntentRepair()
    rows = []
    with open(cache, "a", encoding="utf-8") as out:
        for i, s in enumerate(samples, 1):
            if "words" in done.get(s["wav_path"], {}):   # rows saved before word confidences were recorded are redone
                rows.append({**done[s["wav_path"]], "ref": s["text"]})   # recogniser output is cached; the reference is not
                continue
            audio, sr = sf.read(s["wav_path"], dtype="float32")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            if sr != 16000:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
            heard = asr.transcribe(audio, sample_rate=16000)
            ungated = heard["text"]
            gated = not contains_speech(audio)
            raw = "" if gated else ungated
            row = {"wav": s["wav_path"], "speaker": s["speaker_id"], "dysarthric": s["is_dysarthric"], "severity": s["severity"],
                   "ref": s["text"], "ungated": ungated, "words": heard["words"], "gated": gated, "raw": raw,
                   "repaired": repair.repair(raw)["repaired_text"] if raw else ""}
            out.write(json.dumps(row) + "\n")
            out.flush()
            rows.append(row)
            print(f"\r[{i}/{len(samples)}]", end="", flush=True)

    result = summarize(rows)
    pct = lambda t: f"{t[0] * 100:5.1f}% [{t[1] * 100:5.1f}, {t[2] * 100:5.1f}]"
    print(f"\n\n{'speaker':18s}{'utts':>6s}{'words':>7s}{'gated':>6s}   {'raw WER [95% CI]':26s}{'repaired WER [95% CI]':26s}{'raw - repaired':22s}")
    for r in result:
        print(f"{r['name']:18s}{r['n']:6d}{r['words']:7d}{r['gated']:6d}   {pct(r['raw']):26s}{pct(r['repaired']):26s}{pct(r['gain'])}")

    ungated = {r["name"]: r for r in summarize([{**r, "raw": r["ungated"], "repaired": r["ungated"]} for r in rows])}
    print("\nWER without the gate (recogniser alone):")
    for name in ("dysarthric (all)", "control (all)"):
        if name in ungated:
            print(f"  {name:18s}{pct(ungated[name]['raw'])}")

    with open(os.path.join(ROOT, "outputs", "eval_torgo.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "summary": result}, f, indent=2)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", nargs="?", default=os.path.join(ROOT, "data", "TORGO"))
    ap.add_argument("--mic", default="wav_headMic")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    main(a.data_dir, a.mic, a.limit)
