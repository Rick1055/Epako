import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from simulate_learning import simulate


def _row(ref, raw):
    return {"speaker": "M04", "ref": ref, "raw": raw}


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
