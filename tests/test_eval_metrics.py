import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from eval_metrics import corpus_errors, summarize, wer_ci, wer_diff_ci, word_errors


def test_word_errors_counts_substitutions_insertions_deletions():
    assert word_errors("the cat sat", "the cat sat") == (0, 3)
    assert word_errors("the cat sat", "the dog sat") == (1, 3)         # substitution
    assert word_errors("the cat sat", "the cat sat down") == (1, 3)    # insertion
    assert word_errors("the cat sat", "the sat") == (1, 3)             # deletion
    assert word_errors("the cat sat", "") == (3, 3)


def test_word_errors_ignores_case_and_punctuation_but_not_words():
    assert word_errors("Please call Stella.", "please call stella") == (0, 3)
    assert word_errors("Please call Stella.", "please call sala") == (1, 3)


def test_insertions_are_not_capped_at_one_hundred_percent():
    errors, n = word_errors("no", "no no no no")
    assert (errors, n) == (3, 1)   # 300%: the old per-utterance helper clipped this to 100%


def test_corpus_errors_pools_words_not_utterance_scores():
    errors, lens = corpus_errors([("a b c d", "a b c d"), ("x", "y")])
    assert (errors.tolist(), lens.tolist()) == ([0, 1], [4, 1])
    assert errors.sum() / lens.sum() == pytest.approx(0.2)   # 1 error in 5 words, not the mean of 0% and 100%


def test_wer_ci_brackets_the_point_estimate_and_is_reproducible():
    errors, lens = np.array([0, 1, 0, 1, 0, 0, 1, 0]), np.ones(8)
    wer, lo, hi = wer_ci(errors, lens, seed=3)
    assert wer == pytest.approx(3 / 8) and lo <= wer <= hi
    assert (wer, lo, hi) == wer_ci(errors, lens, seed=3)


def test_wer_ci_is_wider_with_less_data():
    big = wer_ci(np.tile([0, 1], 200), np.ones(400), seed=1)
    small = wer_ci(np.tile([0, 1], 4), np.ones(8), seed=1)
    assert (small[2] - small[1]) > (big[2] - big[1])


def test_paired_difference_is_exactly_zero_when_systems_agree():
    errors = np.array([0, 1, 1, 0, 2])
    diff, lo, hi = wer_diff_ci(errors, errors, np.array([1, 1, 2, 1, 3]), seed=0)
    assert (diff, lo, hi) == (0.0, 0.0, 0.0)


def test_paired_difference_detects_a_consistent_improvement():
    lens = np.ones(50)
    worse, better = np.ones(50), np.zeros(50)
    diff, lo, hi = wer_diff_ci(worse, better, lens, seed=0)
    assert diff == pytest.approx(1.0) and lo > 0.9


def test_empty_reference_corpus_is_an_error_not_a_zero():
    with pytest.raises(ValueError):
        wer_ci(np.array([0]), np.array([0]))


def _row(speaker, dys, ref, raw, repaired=None, severity="Moderate"):
    return {"speaker": speaker, "dysarthric": dys, "severity": severity, "ref": ref, "raw": raw, "repaired": repaired or raw}


def test_summarize_pools_words_per_speaker_and_per_group():
    rows = [_row("F01", True, "meat", "meat"), _row("F01", True, "swarm", "swore"),
            _row("M01", True, "no", "no"), _row("MC01", False, "yes", "yes", severity="Healthy")]
    out = {r["name"]: r for r in summarize(rows)}
    assert out["F01"]["n"] == 2 and out["F01"]["raw"][0] == pytest.approx(0.5)
    assert out["dysarthric (all)"]["n"] == 3 and out["dysarthric (all)"]["raw"][0] == pytest.approx(1 / 3)
    assert out["control (all)"]["raw"][0] == 0.0
    assert out["F01"]["gain"][0] == 0.0 and out["F01"]["severity"] == "Moderate"   # repair changed nothing


def test_summarize_reports_a_repair_gain_only_when_repair_helps():
    rows = [_row("F01", True, "he nailed it", "he he nailed it", "he nailed it"), _row("F01", True, "go", "go")]
    f01 = {r["name"]: r for r in summarize(rows)}["F01"]
    assert f01["raw"][0] > f01["repaired"][0] == 0.0 and f01["gain"][0] > 0   # gain = raw WER - repaired WER
