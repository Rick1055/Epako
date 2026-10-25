"""
Full TORGO download, extraction and audit (all four archives, every file).

    python scripts/fetch_torgo_full.py download | list | extract [--keep a,b] [--dest] D:\\DysTTS_TORGO_dataset

Layout written under the destination:
    archives\\F.tar.bz2 ...      the original archives (kept, so extraction can be re-checked or redone)
    archives\\SHA256SUMS.txt     fingerprints of the archives for later re-verification
    TORGO\\<speaker>\\<session>\\...   prompts, both microphones and phoneme labels (see KEEP)
    TORGO/.extracted_<archive>   per-archive record of files written and bytes skipped
    TORGO\\manifest.csv          one row per readable wav that has a prompt
    TORGO\\audit.json            counts per speaker plus every gap or unreadable file

Stops at the first error. Re-running resumes: finished downloads and extractions are skipped.
There are no published checksums, so integrity rests on: exact byte size vs the server, bzip2's per-block
CRC during full decompression, every extracted file's size matching the archive, and every wav opening.
"""
import csv
import hashlib
import json
import os
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

import soundfile as sf

BASE_URL = "https://www.cs.toronto.edu/~complingweb/data/TORGO/"
ARCHIVES = ("F", "FC", "M", "MC")
MICS = ("wav_headMic", "wav_arrayMic")
# What the project uses (chosen 2026-10-25). Everything else (articulography in pos/, rawpos/, amps/, wavall/,
# cpcmd.log, empty VIDEO/EMA markers) is still read and CRC-checked, but not written.
KEEP = {"prompts", "wav_headMic", "wav_arrayMic", "phn_headMic", "phn_arrayMic", "Notes", "alignment.txt"}
_UA = {"User-Agent": "Mozilla/5.0"}


def progress_bar(done, total, width=20):
    filled = int(width * done / total) if total else width
    return f"[{'#' * filled}{'-' * (width - filled)}] {int(100 * done / total) if total else 100:3d}%"


def download(url, dest, retries=30, chunk=1 << 20):
    """Resumable download to dest; the result must be exactly the server's Content-Length."""
    dest, part = Path(dest), Path(str(dest) + ".part")
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers=_UA), timeout=60) as r:
        total = int(r.headers["Content-Length"])
    for attempt in range(retries):
        have = part.stat().st_size if part.exists() else 0
        if have == total:
            break
        if have > total:
            part.unlink()
            continue
        try:
            req = urllib.request.Request(url, headers={**_UA, "Range": f"bytes={have}-"})
            with urllib.request.urlopen(req, timeout=60) as r:
                mode = "ab" if r.status == 206 else "wb"   # a 200 means the server ignored Range: start over
                done = have if mode == "ab" else 0
                shown = -1
                with open(part, mode) as f:
                    while block := r.read(chunk):
                        f.write(block)
                        done += len(block)
                        step = int(50 * done / total)     # one line per 2%
                        if step != shown:
                            shown = step
                            print(f"  {dest.name:10s} {progress_bar(done, total)}  {done / 2**30:5.2f} / {total / 2**30:.2f} GB", flush=True)
        except OSError as e:
            print(f"  {dest.name}: interrupted ({e}); retry {attempt + 1}/{retries}", flush=True)
            time.sleep(min(60, 5 * (attempt + 1)))
    if not part.exists() or part.stat().st_size != total:
        raise RuntimeError(f"{dest.name}: incomplete download")
    os.replace(part, dest)


def sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def _folder(name):
    """Group of a member: its session sub-folder (wav_headMic, ...), "Notes" for speaker notes,
    or its own file name for files lying directly in a session (alignment.txt, cpcmd.log, VIDEO, EMA)."""
    parts = name.split("/")
    if len(parts) >= 4:
        return parts[2]
    if len(parts) == 3:
        return "Notes" if parts[1] == "Notes" else parts[2]
    return "(other)"


def inventory(archive):
    """{folder: {"files", "bytes", "types", "example"}} for every file in the archive; nothing is written."""
    inv = {}
    with tarfile.open(archive, "r:bz2") as tar:
        for m in tar:
            if not m.isfile():
                continue
            e = inv.setdefault(_folder(m.name), {"files": 0, "bytes": 0, "types": set(), "example": m.name})
            e["files"] += 1
            e["bytes"] += m.size
            e["types"].add(Path(m.name).suffix or "(none)")
    for e in inv.values():
        e["types"] = sorted(e["types"])
    return inv


def extract_verified(archive, out_dir, keep=KEEP):
    """Reads every member (bzip2 block CRCs are checked while decompressing) and refuses the whole archive if any
    path is unsafe. Writes only files inside `keep` folders and checks each written size.
    Returns (files written, {skipped folder: {"files": n, "bytes": n}})."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written, skipped = [], {}
    with tarfile.open(archive, "r:bz2") as tar:
        for member in tar:
            member = tarfile.data_filter(member, str(out_dir))   # raises FilterError on ../, absolute paths, links out
            if not member.isfile():
                continue                                          # folders are created as files are written
            folder = _folder(member.name)
            if folder not in keep:
                entry = skipped.setdefault(folder, {"files": 0, "bytes": 0})
                entry["files"] += 1
                entry["bytes"] += member.size
                continue
            tar.extract(member, out_dir, filter="data")
            written.append(member)
    bad = [m.name for m in written if (out_dir / m.name).stat().st_size != m.size]
    if bad:
        raise RuntimeError(f"{len(bad)} extracted files have the wrong size, e.g. {bad[:3]}")
    return len(written), skipped


def audit(root):
    """(report, manifest rows) for every speaker/session folder under root."""
    root = Path(root)
    report = {"speakers": {}, "unreadable": [], "wav_without_prompt": [], "prompt_without_wav": []}
    rows = []
    rel = lambda p: p.relative_to(root).as_posix()
    for session in sorted(p for p in root.glob("*/*") if (p / "prompts").is_dir()):
        speaker = session.parent.name
        counts = report["speakers"].setdefault(speaker, {"prompts": 0, **{m: 0 for m in MICS}, **{f"paired_{m[4:]}": 0 for m in MICS}})
        prompts = {p.stem: p for p in (session / "prompts").glob("*.txt")}
        counts["prompts"] += len(prompts)
        heard = set()
        for mic in MICS:
            for wav in sorted((session / mic).glob("*.wav")):
                counts[mic] += 1
                heard.add(wav.stem)
                try:
                    info = sf.info(str(wav))
                    if info.frames == 0:
                        raise ValueError("no audio frames")
                except Exception:
                    report["unreadable"].append(rel(wav))
                    continue
                if wav.stem not in prompts:
                    report["wav_without_prompt"].append(rel(wav))
                    continue
                counts[f"paired_{mic[4:]}"] += 1
                rows.append({"speaker": speaker, "session": session.name, "mic": mic, "utt_id": wav.stem,
                             "prompt": prompts[wav.stem].read_text(encoding="utf-8", errors="replace").strip(),
                             "seconds": round(info.frames / info.samplerate, 3), "wav": rel(wav)})
        report["prompt_without_wav"] += [rel(p) for stem, p in sorted(prompts.items()) if stem not in heard]
    return report, rows


def download_all(dest):
    arch_dir = Path(dest) / "archives"
    arch_dir.mkdir(parents=True, exist_ok=True)
    for name in ARCHIVES:
        path = arch_dir / f"{name}.tar.bz2"
        if path.exists():
            print(f"[download] {path.name} already complete")
            continue
        print(f"[download] {path.name}", flush=True)
        download(BASE_URL + path.name, path)
        print(f"[checksum] {path.name} sha256 {sha256(path)}", flush=True)
    sums = {f"{n}.tar.bz2": sha256(arch_dir / f"{n}.tar.bz2") for n in ARCHIVES}
    (arch_dir / "SHA256SUMS.txt").write_text("".join(f"{h}  {n}\n" for n, h in sums.items()))
    print("[download] all archives complete; SHA256SUMS.txt written", flush=True)


def list_all(dest):
    arch_dir = Path(dest) / "archives"
    report = {}
    for name in ARCHIVES:
        path = arch_dir / f"{name}.tar.bz2"
        if not path.exists():
            print(f"[list] {path.name} not downloaded yet, skipped")
            continue
        print(f"[list] reading {path.name} (full decompression)", flush=True)
        report[name] = inventory(path)
    (arch_dir / "inventory.json").write_text(json.dumps(report, indent=2))
    print(f"\n{'archive':8s}{'folder':22s}{'files':>8s}{'GB':>8s}  types / example")
    for name, inv in report.items():
        for folder, e in sorted(inv.items(), key=lambda kv: -kv[1]["bytes"]):
            print(f"{name:8s}{folder:22s}{e['files']:8d}{e['bytes'] / 2**30:8.2f}  {','.join(e['types'])}  e.g. {e['example']}")


def extract_all(dest, keep):
    arch_dir, out = Path(dest) / "archives", Path(dest) / "TORGO"
    for name in ARCHIVES:
        done = out / f".extracted_{name}"
        if done.exists():
            continue
        print(f"[extract] {name}.tar.bz2 keeping {sorted(keep)}", flush=True)
        n, skipped = extract_verified(arch_dir / f"{name}.tar.bz2", out, keep)
        done.write_text(json.dumps({"written": n, "kept": sorted(keep), "skipped": skipped}, indent=2))
        print(f"  {n} files written, sizes verified; skipped (read and CRC-checked, not written):")
        for folder, c in sorted(skipped.items(), key=lambda kv: -kv[1]["bytes"]):
            print(f"    {folder:20s}{c['files']:7d} files {c['bytes'] / 2**30:7.2f} GB")

    print("[audit] opening every wav", flush=True)
    report, rows = audit(out)
    (out / "audit.json").write_text(json.dumps(report, indent=2))
    with open(out / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["speaker", "session", "mic", "utt_id", "prompt", "seconds", "wav"])
        w.writeheader()
        w.writerows(rows)
    print(f"\n{'speaker':8s}{'prompts':>9s}{'headMic':>9s}{'arrayMic':>10s}{'paired head':>13s}{'paired array':>14s}")
    for spk, c in report["speakers"].items():
        print(f"{spk:8s}{c['prompts']:9d}{c['wav_headMic']:9d}{c['wav_arrayMic']:10d}{c['paired_headMic']:13d}{c['paired_arrayMic']:14d}")
    print(f"\nunreadable wavs: {len(report['unreadable'])} | wavs without prompt: {len(report['wav_without_prompt'])}"
          f" | prompts without any wav: {len(report['prompt_without_wav'])} | manifest rows: {len(rows)}")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["download", "list", "extract"])
    ap.add_argument("--dest", default=r"D:\DysTTS_TORGO_dataset")
    ap.add_argument("--keep", default=",".join(sorted(KEEP)), help="comma-separated folders to write (extract step)")
    args = ap.parse_args()
    {"download": lambda: download_all(args.dest), "list": lambda: list_all(args.dest),
     "extract": lambda: extract_all(args.dest, set(args.keep.split(",")))}[args.step]()
