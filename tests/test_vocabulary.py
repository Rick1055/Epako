import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vocabulary import UNSURE_BELOW, Vocabulary, distance, phonemes, unsure


def test_words_become_sounds_ignoring_case_stress_and_length():
    assert phonemes("pat") == phonemes("Pat") == ("p", "æ", "t")
    assert phonemes("rake") == ("ɹ", "eɪ", "k")   # a diphthong is one sound, not two letters


def test_words_that_sound_the_same_are_zero_apart():
    assert distance("knew", "new") == 0.0
    assert distance("water", "water") == 0.0


def test_distance_counts_changed_sounds_not_changed_letters():
    assert distance("sip", "ship") == pytest.approx(1 / 3)   # s -> sh: one sound, though the spelling adds a letter
    assert distance("pat", "bath") == pytest.approx(2 / 3)   # p -> b and t -> th
    assert distance("pat", "elephant") > 0.6


def test_distance_is_symmetric_and_bounded():
    for a, b in (("rake", "week"), ("tile", "kilo"), ("yes", "no")):
        assert distance(a, b) == distance(b, a)
        assert 0.0 <= distance(a, b) <= 1.0


def test_a_misheard_word_snaps_to_the_close_word_the_patient_uses():
    assert Vocabulary({"ship": 1}).snap("sip", {"sip"}) == "ship"


def test_a_word_far_from_everything_the_patient_uses_is_left_alone():
    assert Vocabulary({"ship": 1}).snap("elephant", {"elephant"}) == "elephant"


def test_a_word_the_patient_already_uses_is_never_changed():
    assert Vocabulary({"sip": 1, "ship": 5}).snap("sip", {"sip"}) == "sip"


def test_equally_close_words_go_to_the_more_common_one_and_a_true_tie_is_left_alone():
    assert Vocabulary({"bat": 3, "cat": 1}).snap("pat", {"pat"}) == "bat"
    assert Vocabulary({"bat": 1, "cat": 1}).snap("pat", {"pat"}) == "pat"   # no way to tell: guessing would put words in their mouth


def test_an_empty_vocabulary_changes_nothing():
    assert Vocabulary().snap("he slowly takes a walk", {"slowly"}) == "he slowly takes a walk"


def test_snapping_keeps_capitals_and_punctuation():
    assert Vocabulary({"ship": 2}).snap("Sip, the sip.", {"sip"}) == "Ship, the ship."


def test_confirmed_text_is_counted_word_by_word():
    v = Vocabulary()
    v.add("The ship, the SHIP!")
    assert v.counts == {"the": 2, "ship": 2}


def test_a_word_the_recogniser_was_sure_of_is_never_snapped():
    assert Vocabulary({"ship": 5}).snap("chip and sip", {"sip"}) == "chip and ship"   # "chip" is as close, but was heard surely


def test_unsure_words_are_those_below_the_confidence_cut_off_and_none_means_none():
    heard = [{"word": "Sip,", "confidence": UNSURE_BELOW - 0.01}, {"word": "please", "confidence": UNSURE_BELOW}]
    assert unsure(heard) == {"sip"}   # normalised like the text it is matched against
    assert unsure(None) == set()      # no confidence from the recogniser: nothing is snapped


def test_snapping_turns_on_only_when_the_patient_keeps_saying_words_they_said_before():
    from vocabulary import REPEAT_SHARE, REPEAT_WINDOW
    v = Vocabulary()
    recent = []
    for _ in range(REPEAT_WINDOW):
        for w in ["water", "nurse", "pain"]:
            v.add(w)
            recent.append(w)
    assert v.repeating(recent[:REPEAT_WINDOW - 1]) is False   # too little history to judge
    assert v.repeating(recent) is True                        # all of it reuses known words
    fresh = [f"word{i}" for i in range(REPEAT_WINDOW)]
    for w in fresh:
        v.add(w)
    assert v.repeating(recent + fresh) is False               # the latest window is all new words: back off
    mixed = fresh[: int(REPEAT_WINDOW * (1 - REPEAT_SHARE))] + ["water"] * (REPEAT_WINDOW - int(REPEAT_WINDOW * (1 - REPEAT_SHARE)))
    assert v.repeating(mixed) is True                          # at the share needed, it turns on


def test_a_sentence_counts_as_repeated_only_if_every_word_was_said_before():
    from vocabulary import REPEAT_WINDOW
    v = Vocabulary({"i": 5, "want": 5, "water": 5, "a": 5})
    assert v.repeating(["i want water"] * REPEAT_WINDOW) is True
    v.add("i want a giraffe")
    assert v.repeating(["i want a giraffe"] * REPEAT_WINDOW) is False   # "giraffe" was said only once
