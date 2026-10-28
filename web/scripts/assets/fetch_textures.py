"""Fetch the garden's material textures (CC0, ambientCG.com) and convert them for the web.

    python scripts/assets/fetch_textures.py      (from web/)

Downloads each 1K set once into .cache/textures/, keeps the colour and normal maps, and writes
public/textures/<name>-color.webp and -normal.webp, plus public/textures/CREDITS.txt.
"""
import io
import json
import pathlib
import urllib.request
import zipfile

from PIL import Image

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpakoVoice-asset-pipeline"}
WEB = pathlib.Path(__file__).resolve().parents[2]
CACHE = WEB / ".cache" / "textures"
OUT = WEB / "public" / "textures"
# What each material is for in the garden (name in the app -> ambientCG asset, colour and normal-map sizes).
# Sizes follow how close the camera gets: the path and the lawn are seen at the walker's feet.
MATERIALS = {
    "paving": ("PavingStones138", 1024, 1024),  # the garden path: old pavers, moss in the joints
    "moss": ("Moss002", 512, 512),              # moss over the upward faces of wood and stone
    "rock": ("Rock058", 512, 512),              # stepping stones: plain grey stone
    "lawn": ("Grass004", 1024, 1024),           # the lawn, seen close at every stop
    "gravel": ("Gravel032", 1024, 512),         # the winding gravel side paths, as in Central Park
    "wood": ("Wood063", 512, 512),              # weathered slats of the park benches and the signposts
}


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
credits = ["Material textures from ambientCG.com, licensed CC0 1.0 (public domain).", ""]
for name, (asset, colour_size, normal_size) in MATERIALS.items():
    zpath = CACHE / f"{asset}_1K-JPG.zip"
    if not zpath.exists():
        zpath.write_bytes(fetch(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"))
    with zipfile.ZipFile(zpath) as z:
        files = {n.split("_")[-1].split(".")[0]: n for n in z.namelist() if n.lower().endswith(".jpg")}
        for kind, key, quality, size in [("color", "Color", 80, colour_size), ("normal", "NormalGL", 85, normal_size)]:
            image = Image.open(io.BytesIO(z.read(files[key]))).convert("RGB")
            if image.size[0] != size:
                image = image.resize((size, size), Image.LANCZOS)
            out = OUT / f"{name}-{kind}.webp"
            image.save(out, "WEBP", quality=quality, method=6)
            print(f"{out.name:22} {out.stat().st_size // 1024:4} KB  ({asset})")
    credits.append(f"{name}: {asset}  https://ambientcg.com/view?id={asset}")
(OUT / "CREDITS.txt").write_text("\n".join(credits) + "\n", encoding="utf-8")
print("total", sum(p.stat().st_size for p in OUT.glob("*.webp")) // 1024, "KB")
