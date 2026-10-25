import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from speech_recognizer import word_confidences


def test_word_pieces_join_into_words_and_a_word_is_as_unsure_as_its_least_sure_piece():
    pieces = [("▁the", 0.99), ("▁wa", 0.9), ("da", 0.4), ("▁please", 0.8)]
    assert word_confidences(pieces) == [{"word": "the", "confidence": 0.99},
                                        {"word": "wada", "confidence": 0.4},
                                        {"word": "please", "confidence": 0.8}]


def test_a_lone_word_start_marker_and_empty_input_make_no_empty_words():
    assert word_confidences([("▁", 0.7), ("yes", 0.9)]) == [{"word": "yes", "confidence": 0.7}]
    assert word_confidences([]) == []


def _model_cached():
    try:
        from huggingface_hub import try_to_load_from_cache
        from speech_recognizer import DysarthriaSpeechRecognizer
        name = DysarthriaSpeechRecognizer.__init__.__defaults__[0]
        return isinstance(try_to_load_from_cache(name, "config.json"), str)
    except Exception:
        return False


@pytest.mark.skipif(not (_model_cached() and (ROOT / "models/piper/en_US-ryan-medium.onnx").exists()),
                    reason="recogniser weights or Piper voice not downloaded")
def test_real_transcription_reports_a_confidence_for_every_word_it_wrote():
    import local_tts
    from feedback_engine import words
    from speech_recognizer import DysarthriaSpeechRecognizer
    speech = local_tts.synthesize("Please bring me a glass of water.")["audio"]
    out = DysarthriaSpeechRecognizer().transcribe(speech)
    assert out["words"] is not None, "confidence hook stopped matching the transcript (transformers changed?)"
    assert words(" ".join(w["word"] for w in out["words"])) == words(out["text"])
    assert all(0.0 <= w["confidence"] <= 1.0 for w in out["words"])
