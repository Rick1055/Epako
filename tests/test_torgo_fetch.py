import functools
import http.server
import io
import os
import sys
import tarfile
import threading
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fetch_torgo_full import audit, download, extract_verified, inventory, progress_bar


def _wav_bytes(seconds=0.2):
    buf = io.BytesIO()
    sf.write(buf, np.zeros(int(16000 * seconds), dtype="float32"), 16000, format="WAV")
    return buf.getvalue()


def _make_archive(path, files):
    with tarfile.open(path, "w:bz2") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))


# ---------- extraction ----------

def test_extract_verified_extracts_everything_and_checks_sizes(tmp_path):
    arc = tmp_path / "F.tar.bz2"
    _make_archive(arc, {"F01/Session1/prompts/0001.txt": b"meat", "F01/Session1/wav_headMic/0001.wav": _wav_bytes()})
    out = tmp_path / "out"
    kept, skipped = extract_verified(arc, out)
    assert kept == 2 and skipped == {}
    assert (out / "F01/Session1/prompts/0001.txt").read_bytes() == b"meat"


def test_unneeded_folders_are_read_but_not_written_and_are_reported(tmp_path):
    arc = tmp_path / "F.tar.bz2"
    ema = os.urandom(40_000)
    _make_archive(arc, {"F01/Session1/prompts/0001.txt": b"meat", "F01/Session1/wav_arrayMic/0001.wav": _wav_bytes(),
                        "F01/Session1/phn_headMic/0001.phn": b"0 100 m", "F01/Session1/pos/0001.pos": ema})
    out = tmp_path / "out"
    kept, skipped = extract_verified(arc, out)
    assert kept == 3 and skipped == {"pos": {"files": 1, "bytes": len(ema)}}
    assert not (out / "F01/Session1/pos").exists() and (out / "F01/Session1/phn_headMic/0001.phn").exists()


def test_truncated_archive_is_detected(tmp_path):
    arc = tmp_path / "F.tar.bz2"
    _make_archive(arc, {f"F01/S1/wav_headMic/{i:04d}.wav": os.urandom(50_000) for i in range(5)})
    data = arc.read_bytes()
    arc.write_bytes(data[: len(data) // 2])     # simulate a cut-off download
    with pytest.raises((EOFError, tarfile.ReadError, OSError)):
        extract_verified(arc, tmp_path / "out")


def test_path_traversal_members_are_refused(tmp_path):
    arc = tmp_path / "evil.tar.bz2"
    _make_archive(arc, {"../escaped.txt": b"x"})
    with pytest.raises(tarfile.FilterError):
        extract_verified(arc, tmp_path / "out")
    assert not (tmp_path / "escaped.txt").exists()


# ---------- audit ----------

def test_audit_reports_every_kind_of_gap(tmp_path):
    s = tmp_path / "F01" / "Session1"
    for d in ("prompts", "wav_headMic", "wav_arrayMic"):
        (s / d).mkdir(parents=True)
    for utt, text in (("0001", "meat"), ("0002", "swarm"), ("0003", "no")):
        (s / "prompts" / f"{utt}.txt").write_text(text)
    (s / "wav_headMic" / "0001.wav").write_bytes(_wav_bytes())
    (s / "wav_headMic" / "0002.wav").write_bytes(b"RIFF not really a wav")   # corrupt
    (s / "wav_headMic" / "0004.wav").write_bytes(_wav_bytes())               # audio with no prompt
    (s / "wav_arrayMic" / "0001.wav").write_bytes(_wav_bytes())

    report, rows = audit(tmp_path)
    assert report["unreadable"] == ["F01/Session1/wav_headMic/0002.wav"]
    assert report["wav_without_prompt"] == ["F01/Session1/wav_headMic/0004.wav"]
    assert report["prompt_without_wav"] == ["F01/Session1/prompts/0003.txt"]
    assert report["speakers"]["F01"] == {"prompts": 3, "wav_headMic": 3, "wav_arrayMic": 1, "paired_headMic": 1, "paired_arrayMic": 1}
    assert {(r["mic"], r["utt_id"], r["prompt"]) for r in rows} == {("wav_headMic", "0001", "meat"), ("wav_arrayMic", "0001", "meat")}


# ---------- download ----------

@pytest.fixture
def file_server(tmp_path):
    served = tmp_path / "served"
    served.mkdir()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(served))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield served, f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_download_matches_the_source_byte_for_byte(tmp_path, file_server):
    served, base = file_server
    payload = os.urandom(3 * 1024 * 1024 + 17)
    (served / "F.tar.bz2").write_bytes(payload)
    dest = tmp_path / "F.tar.bz2"
    download(f"{base}/F.tar.bz2", dest)
    assert dest.read_bytes() == payload and not Path(str(dest) + ".part").exists()


def test_resume_restarts_cleanly_when_the_server_ignores_ranges(tmp_path, file_server):
    """A server that answers 200 instead of 206 must not have its body appended to the partial file."""
    served, base = file_server
    payload = os.urandom(2 * 1024 * 1024)
    (served / "M.tar.bz2").write_bytes(payload)
    dest = tmp_path / "M.tar.bz2"
    Path(str(dest) + ".part").write_bytes(payload[:700_000])   # an earlier, interrupted attempt
    download(f"{base}/M.tar.bz2", dest)                        # SimpleHTTPRequestHandler ignores Range
    assert dest.read_bytes() == payload


# ---------- listing and progress ----------

def test_inventory_groups_every_member_by_folder(tmp_path):
    arc = tmp_path / "F.tar.bz2"
    _make_archive(arc, {"F01/Session1/prompts/0001.txt": b"meat", "F01/Session1/prompts/0002.txt": b"no",
                        "F01/Session1/pos/0001.pos": b"x" * 1000, "F01/Session1/notes.txt": b"hello"})
    inv = inventory(arc)
    assert inv["prompts"]["files"] == 2 and inv["prompts"]["bytes"] == 6
    assert inv["pos"] == {"files": 1, "bytes": 1000, "types": [".pos"], "example": "F01/Session1/pos/0001.pos"}
    assert inv["notes.txt"]["files"] == 1          # session-level files are grouped by their own name


def test_progress_bar_is_small_and_readable():
    assert progress_bar(0, 100) == "[--------------------]   0%"
    assert progress_bar(50, 100) == "[##########----------]  50%"
    assert progress_bar(100, 100) == "[####################] 100%"


def test_speaker_notes_and_alignment_are_kept_but_logs_and_markers_are_not(tmp_path):
    arc = tmp_path / "F.tar.bz2"
    _make_archive(arc, {"F01/Notes/F01.csv": b"speaker,notes", "F01/Session1/alignment.txt": b"0.012",
                        "F01/Session1/cpcmd.log": b"x" * 500, "F01/Session1/VIDEO": b"",
                        "F01/Session1/prompts/0001.txt": b"meat"})
    out = tmp_path / "out"
    kept, skipped = extract_verified(arc, out)
    assert kept == 3 and (out / "F01/Notes/F01.csv").exists() and (out / "F01/Session1/alignment.txt").exists()
    assert set(skipped) == {"cpcmd.log", "VIDEO"} and not (out / "F01/Session1/cpcmd.log").exists()
