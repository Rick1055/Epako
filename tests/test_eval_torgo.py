import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from eval_metrics import summarize
from eval_torgo import manifest_samples

HEADER = "speaker,session,mic,utt_id,prompt,seconds,wav\n"


def _manifest(tmp_path, rows):
    (tmp_path / "manifest.csv").write_text(HEADER + "".join(",".join(r) + "\n" for r in rows), encoding="utf-8")


def test_only_real_prompts_on_the_chosen_mic_are_evaluated(tmp_path):
    _manifest(tmp_path, [
        ("F01", "Session1", "wav_headMic", "0001", "[say Ah-P-Eee repeatedly]", "9", "a.wav"),    # an instruction, not words
        ("F01", "Session1", "wav_headMic", "0002", "xxx", "1", "b.wav"),                          # unintelligible marker
        ("F01", "Session1", "wav_headMic", "0003", "input/images/12.jpg", "3", "c.wav"),          # describe-a-picture: no fixed text
        ("F01", "Session1", "wav_headMic", "0004", "", "1", "d.wav"),                             # take without text
        ("F01", "Session1", "wav_headMic", "0005", "Please call Stella.", "2", "e.wav"),
        ("F01", "Session1", "wav_arrayMic", "0005", "Please call Stella.", "2", "f.wav"),
        ("MC01", "Session1", "wav_headMic", "0006", "zip", "1", "g.wav"),
    ])
    got = manifest_samples(tmp_path, "wav_headMic")
    assert [(s["speaker_id"], s["text"], s["is_dysarthric"]) for s in got] == [("F01", "Please call Stella.", True), ("MC01", "zip", False)]
    assert got[0]["wav_path"] == str(tmp_path / "e.wav")


def test_summary_counts_utterances_the_gate_refused():
    rows = [{"speaker": "F01", "dysarthric": True, "severity": "-", "ref": "go", "raw": "", "repaired": "", "gated": True},
            {"speaker": "F01", "dysarthric": True, "severity": "-", "ref": "no", "raw": "no", "repaired": "no"}]
    f01 = {r["name"]: r for r in summarize(rows)}["F01"]
    assert f01["gated"] == 1 and f01["raw"][0] == 0.5   # a refused utterance costs all its words
