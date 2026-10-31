"""
Does the feedback engine learn? Replay a speaker's real recogniser output as a stream of conversations.

    python scripts/simulate_learning.py [outputs/eval_torgo_rows.jsonl] [--seeds 10] [--min-repeats 3] [--vocabulary] [--sample]

Each utterance is shown once, in shuffled order. The simulated patient is perfect: they confirm a shown text that
matches what they meant and otherwise type what they meant. That is the best case for the engine; real patients
will give noisier feedback. --min-repeats N keeps only what the speaker said at least N times: TORGO reads
mostly one-off words, but a real patient repeats a core vocabulary daily. Compared on the same stream: the repair step alone vs repair with the learned table
(--vocabulary: and snapping to words the patient said earlier in the stream, never to words still to come).
"""
import argparse
import collections
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
src_dir = os.path.join(ROOT, "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

try:
    from src.eval_metrics import word_errors
    from src.feedback_engine import FeedbackEngine, words
    from src.intent_repair import IntentRepair
    from src.vocabulary import Vocabulary
except ImportError:
    from eval_metrics import word_errors
    from feedback_engine import FeedbackEngine, words
    from intent_repair import IntentRepair
    from vocabulary import Vocabulary


def generate_sample_rows():
    """Generates synthetic dysarthric evaluation rows for demonstration when no TORGO cache file is present."""
    sample_pairs = [
        ("good morning how are you", "good morning how are you"),
        ("could i have a cup of water", "could i have a cup of waiter"),
        ("please call the nurse", "please call the purse"),
        ("i would like to go for a walk", "i would like to go for a wok"),
        ("turn off the bedroom light", "turn off the bedroom night"),
        ("i need my medicine please", "i deed my medicine please"),
        ("thank you very much", "thank you very much"),
    ]
    rows = []
    for spk in ("F01_sample", "M01_sample"):
        for rep in range(4):
            for ref, raw in sample_pairs:
                raw_words = raw.split()
                ref_words = ref.split()
                word_confidences = [
                    {"word": w, "confidence": 0.95 if w in ref_words else 0.40}
                    for w in raw_words
                ]
                rows.append({
                    "wav": f"synth_{spk}_{rep}_{len(rows)}.wav",
                    "speaker": spk,
                    "dysarthric": True,
                    "ref": ref,
                    "raw": raw,
                    "words": word_confidences,
                })
    return rows


def simulate(rows, seed, vocabulary=False):
    """rows: dicts with ref and raw (one patient). Returns the stream order and, per step, whether the first
    answer was exactly right without and with learning; harmed counts steps learning broke."""
    order = list(range(len(rows)))
    if seed is not None:
        random.Random(seed).shuffle(order)
    plain, engine = IntentRepair(), FeedbackEngine()
    vocab, recent = (Vocabulary() if vocabulary else None), []
    learned = IntentRepair(feedback_engine=engine)
    out = {"order": order, "baseline_ok": [], "learned_ok": []}
    for i in order:
        ref, raw = rows[i]["ref"], rows[i]["raw"]
        learned.vocabulary = vocab if vocab and vocab.repeating(recent) else None   # as the API decides it
        shown = learned.repair(raw, rows[i].get("words"))["repaired_text"]
        out["baseline_ok"].append(word_errors(ref, plain.repair(raw)["repaired_text"])[0] == 0)
        out["learned_ok"].append(word_errors(ref, shown)[0] == 0)
        engine.learn(raw, shown, ref)
        if vocab:
            vocab.add(ref)   # what the patient confirmed or typed is what they meant
            recent.append(ref)
    out["harmed"] = sum(b and not l for b, l in zip(out["baseline_ok"], out["learned_ok"]))
    return out


def main(path, seeds, min_repeats, vocabulary, force_sample=False):
    by_speaker = collections.defaultdict(list)

    if force_sample or not os.path.exists(path):
        if not force_sample:
            print(f"[!] Notice: Benchmark file '{path}' not found.")
            print(f"    Running with built-in clinical repetition simulation.")
            print(f"    (To evaluate real TORGO speech, first run: python scripts/eval_torgo.py)\n")
        rows_list = generate_sample_rows()
    else:
        try:
            rows_list = []
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        rows_list.append(json.loads(line))
        except Exception as e:
            print(f"[!] Error reading '{path}': {e}")
            print(f"    Falling back to built-in clinical simulation.\n")
            rows_list = generate_sample_rows()

    latest = {r.get("wav", i): r for i, r in enumerate(rows_list)}   # last row wins
    for r in latest.values():
        if r.get("dysarthric", True):
            by_speaker[r.get("speaker", "unknown")].append(r)

    print(f"{'speaker':12s}{'utts':>6s}   first-try exact, 2nd half of stream (mean over {seeds} orders)   {'harmed/fixed per run':>22s}")
    for spk, rows in sorted(by_speaker.items()):
        said = collections.Counter(" ".join(words(r["ref"])) for r in rows)
        rows = [r for r in rows if said[" ".join(words(r["ref"]))] >= min_repeats]
        if len(rows) < 20:
            print(f"{spk:12s}{len(rows):6d}   too few to measure (needs >= 20 utterances with >={min_repeats} repeats)")
            continue
        base, learn, harmed, fixed = [], [], [], []
        seeds_count = max(1, seeds)
        for seed in range(seeds_count):
            o = simulate(rows, seed, vocabulary)
            h = len(rows) // 2
            denom = max(1, len(rows) - h)
            base.append(sum(o["baseline_ok"][h:]) / denom)
            learn.append(sum(o["learned_ok"][h:]) / denom)
            harmed.append(o["harmed"])
            fixed.append(sum(l and not b for b, l in zip(o["baseline_ok"], o["learned_ok"])))
        m = lambda x: sum(x) / len(x) if x else 0.0
        print(f"{spk:12s}{len(rows):6d}   without {m(base) * 100:5.1f}%  with {m(learn) * 100:5.1f}%  ({(m(learn) - m(base)) * 100:+.1f} pts)"
              f"{m(harmed):14.1f} / {m(fixed):.1f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Simulate personalized feedback learning across dysarthric speech streams.")
    ap.add_argument("rows", nargs="?", default=os.path.join(ROOT, "outputs", "eval_torgo_rows.jsonl"))
    ap.add_argument("--seeds", type=int, default=10, help="Number of random stream order seeds to average over")
    ap.add_argument("--min-repeats", type=int, default=1, help="Minimum times a phrase was uttered to be included")
    ap.add_argument("--vocabulary", action="store_true", help="Enable acoustic phonetic snapping to confirmed vocabulary")
    ap.add_argument("--sample", action="store_true", help="Force running on built-in sample dysarthric stream data")
    a = ap.parse_args()
    main(a.rows, a.seeds, a.min_repeats, a.vocabulary, force_sample=a.sample)
