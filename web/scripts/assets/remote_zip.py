"""Read a few files out of a big remote zip without downloading all of it (the server must support byte ranges).

    python scripts/assets/remote_zip.py list  <url> [filter]
    python scripts/assets/remote_zip.py get   <url> <out-dir> <member-prefix> [<member-prefix> ...]

Used for the MakeHuman asset packs (CC0), whose mirror serves about 10 KB/s: the system-assets pack is 281 MB but the
visitors need a few megabytes of it. Reads are cached in 256 KB blocks.
"""
import io
import pathlib
import subprocess
import sys
import zipfile

UA = "Mozilla/5.0 EpakoVoice-asset-pipeline"
BLOCK = 256 * 1024


class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        head = subprocess.run(["curl", "-s", "-L", "-I", "-A", UA, url], capture_output=True, text=True).stdout
        self.size = int([l for l in head.splitlines() if l.lower().startswith("content-length")][-1].split(":")[1])
        self.pos = 0
        self.blocks = {}

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def _block(self, k):
        if k not in self.blocks:
            lo, hi = k * BLOCK, min(self.size, (k + 1) * BLOCK) - 1
            for attempt in range(6):
                out = subprocess.run(["curl", "-s", "-L", "-m", "120", "-A", UA, "-r", f"{lo}-{hi}", self.url], capture_output=True).stdout
                if len(out) == hi - lo + 1:
                    break
            else:
                raise IOError(f"could not read bytes {lo}-{hi}")
            self.blocks[k] = out
        return self.blocks[k]

    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        out = bytearray()
        while n > 0:
            k, off = divmod(self.pos, BLOCK)
            chunk = self._block(k)[off : off + n]
            out += chunk
            self.pos += len(chunk)
            n -= len(chunk)
        return bytes(out)

    readinto = None


if __name__ == "__main__":
    cmd, url = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(RangeFile(url))
    if cmd == "list":
        word = sys.argv[3] if len(sys.argv) > 3 else ""
        for i in z.infolist():
            if word in i.filename:
                print(f"{i.file_size:10} {i.compress_size:10} {i.filename}")
    else:
        out = pathlib.Path(sys.argv[3])
        skip = ("_normal", "_ao", ".thumb", "_specular", "_bump")  # not needed for people seen at a distance
        for i in z.infolist():
            if any(i.filename.startswith(p) for p in sys.argv[4:]) and not i.is_dir() and not any(k in i.filename for k in skip):
                target = out / i.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(i))
                print("got", i.filename, i.file_size)
