"""
Does the feedback engine learn? Replay a speaker's real recogniser output as a stream of conversations.

    python scripts/simulate_learning.py [outputs/eval_torgo_rows.jsonl] [--seeds 10] [--min-repeats 3] [--vocabulary]

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
sys.path.insert(0, os.path.join(ROOT, "src"))

from eval_metrics import word_errors
from feedback_engine import FeedbackEngine, words
from intent_repair import IntentRepair
from vocabulary import Vocabulary


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


def main(path, seeds, min_repeats, vocabulary):
    by_speaker = collections.defaultdict(list)
    latest = {r["wav"]: r for r in map(json.loads, open(path, encoding="utf-8"))}   # the cache is append-only: last row wins
    for r in latest.values():
        if r["dysarthric"]:
            by_speaker[r["speaker"]].append(r)
    print(f"{'speaker':8s}{'utts':>6s}   first-try exact, 2nd half of stream (mean over {seeds} orders)   {'harmed/fixed per run':>22s}")
    for spk, rows in sorted(by_speaker.items()):
        said = collections.Counter(" ".join(words(r["ref"])) for r in rows)
        rows = [r for r in rows if said[" ".join(words(r["ref"]))] >= min_repeats]
        if len(rows) < 20:
            print(f"{spk:8s}{len(rows):6d}   too few to measure")
            continue
        base, learn, harmed, fixed = [], [], [], []
        for seed in range(seeds):
            o = simulate(rows, seed, vocabulary)
            h = len(rows) // 2
            base.append(sum(o["baseline_ok"][h:]) / (len(rows) - h))
            learn.append(sum(o["learned_ok"][h:]) / (len(rows) - h))
            harmed.append(o["harmed"])
            fixed.append(sum(l and not b for b, l in zip(o["baseline_ok"], o["learned_ok"])))
        m = lambda x: sum(x) / len(x)
        print(f"{spk:8s}{len(rows):6d}   without {m(base) * 100:5.1f}%  with {m(learn) * 100:5.1f}%  ({(m(learn) - m(base)) * 100:+.1f} pts)"
              f"{m(harmed):14.1f} / {m(fixed):.1f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="?", default=os.path.join(ROOT, "outputs", "eval_torgo_rows.jsonl"))
    ap.add_argument("--seeds", type=int, default=10)
    ap.add_argument("--min-repeats", type=int, default=1)
    ap.add_argument("--vocabulary", action="store_true")
    a = ap.parse_args()
    main(a.rows, a.seeds, a.min_repeats, a.vocabulary)
