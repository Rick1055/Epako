import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from simulate_learning import simulate


def _row(ref, raw, confidence=None):
    heard = None if confidence is None else [{"word": w, "confidence": confidence} for w in raw.split()]
    return {"speaker": "M04", "ref": ref, "raw": raw, "words": heard}


def test_a_patient_whose_rake_is_always_heard_as_week_is_understood_after_two_confirmations():
    rows = [_row("rake", "week")] * 6
    out = simulate(rows, seed=None)
    assert out["baseline_ok"] == [False] * 6
    assert out["learned_ok"] == [False, False, True, True, True, True]   # two confirmations, then the third try is right


def test_a_wrong_rule_is_penalised_until_it_stops_firing():
    rows = [_row("rake", "week")] * 2 + [_row("week", "week")] * 3
    out = simulate(rows, seed=None)   # None keeps the given order
    assert out["baseline_ok"] == [False, False, True, True, True]
    assert out["learned_ok"] == [False, False, False, False, True]   # the rule breaks "week" twice, then confidence drops below 0.6
    assert out["harmed"] == 2


def test_the_stream_order_is_shuffled_by_seed_but_never_loses_rows():
    rows = [_row(w, w) for w in "abcdefgh"]
    a, b = simulate(rows, seed=1), simulate(rows, seed=2)
    assert sorted(a["order"]) == sorted(b["order"]) == list(range(8)) and a["order"] != b["order"]


def test_snapping_fixes_a_known_word_misheard_once_the_patient_is_repeating_words():
    from vocabulary import REPEAT_WINDOW
    history = [_row("ship", "ship", 0.99), _row("shop", "shop", 0.99)] * REPEAT_WINDOW
    rows = history + [_row("ship", "sip", 0.3), _row("zip", "sip", 0.3)]
    assert simulate(rows, seed=None)["learned_ok"][-2:] == [False, False]
    snapped = simulate(rows, seed=None, vocabulary=True)
    assert snapped["learned_ok"][-2:] == [True, False]   # "zip" was never said before, so it cannot be known
    assert snapped["harmed"] == 0


def test_a_patient_saying_new_words_gets_no_snapping_even_when_unsure():
    from vocabulary import REPEAT_WINDOW
    rows = [_row(f"word{i}", f"word{i}", 0.99) for i in range(2 * REPEAT_WINDOW)] + [_row("ship", "ship", 0.99), _row("sip", "sip", 0.3)]
    out = simulate(rows, seed=None, vocabulary=True)
    assert out["learned_ok"][-1] is True and out["harmed"] == 0   # an unsure but correct new word is left alone
