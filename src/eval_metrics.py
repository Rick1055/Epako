"""Corpus word error rate with bootstrap confidence intervals (resampling utterances, not words)."""
import re

import numpy as np


def _tokens(text):
    return re.sub(r"[^\w\s]", "", text.lower()).split()


def word_errors(reference, hypothesis):
    """(edit distance, reference word count); insertions can push a single utterance above 100%."""
    ref, hyp = _tokens(reference), _tokens(hypothesis)
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j - 1] + (r != h), prev[j] + 1, cur[j - 1] + 1))
        prev = cur
    return prev[-1], len(ref)


def corpus_errors(pairs):
    """pairs of (reference, hypothesis) -> (errors per utterance, reference words per utterance)."""
    counted = [word_errors(r, h) for r, h in pairs]
    return np.array([e for e, _ in counted]), np.array([n for _, n in counted])


def _resample(n, n_boot, seed):
    return np.random.default_rng(seed).integers(0, n, size=(n_boot, n))


def wer_ci(errors, lens, n_boot=2000, seed=0, level=0.95):
    """(WER, low, high) as fractions; WER = total errors / total reference words."""
    errors, lens = np.asarray(errors, dtype=float), np.asarray(lens, dtype=float)
    if lens.sum() == 0:
        raise ValueError("no reference words")
    idx = _resample(len(errors), n_boot, seed)
    words = lens[idx].sum(axis=1)
    boot = errors[idx].sum(axis=1)[words > 0] / words[words > 0]
    tail = (1 - level) / 2 * 100
    return errors.sum() / lens.sum(), *np.percentile(boot, [tail, 100 - tail])


def wer_diff_ci(errors_a, errors_b, lens, n_boot=2000, seed=0, level=0.95):
    """(WER_a - WER_b, low, high) on the same utterances, resampled together so the comparison is paired."""
    a, b, lens = (np.asarray(x, dtype=float) for x in (errors_a, errors_b, lens))
    if lens.sum() == 0:
        raise ValueError("no reference words")
    idx = _resample(len(lens), n_boot, seed)
    words = lens[idx].sum(axis=1)
    keep = words > 0
    boot = (a[idx].sum(axis=1)[keep] - b[idx].sum(axis=1)[keep]) / words[keep]
    tail = (1 - level) / 2 * 100
    return (a.sum() - b.sum()) / lens.sum(), *np.percentile(boot, [tail, 100 - tail])


def summarize(rows):
    """rows: dicts with speaker, dysarthric, severity, ref, raw, repaired.
    One entry per speaker plus one per group; wer values are (estimate, low, high) fractions, gain = raw - repaired."""
    def stats(name, subset, severity):
        errs_raw, lens = corpus_errors([(r["ref"], r["raw"]) for r in subset])
        errs_rep, _ = corpus_errors([(r["ref"], r["repaired"]) for r in subset])
        return {"name": name, "severity": severity, "n": len(subset), "words": int(lens.sum()),
                "raw": wer_ci(errs_raw, lens), "repaired": wer_ci(errs_rep, lens), "gain": wer_diff_ci(errs_raw, errs_rep, lens)}

    speakers = sorted({r["speaker"] for r in rows})
    out = [stats(s, [r for r in rows if r["speaker"] == s], next(r["severity"] for r in rows if r["speaker"] == s)) for s in speakers]
    for label, flag in (("dysarthric (all)", True), ("control (all)", False)):
        subset = [r for r in rows if r["dysarthric"] == flag]
        if subset:
            out.append(stats(label, subset, "-"))
    return out
