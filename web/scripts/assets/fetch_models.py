"""Fetch the garden's scanned and modelled plants and props (CC0, polyhaven.com) as glTF with 1K textures.

    python scripts/assets/fetch_models.py      (from web/)

Each model goes to .cache/polyhaven/<id>/ (git-ignored); build-models.mjs decimates them with Blender into three
levels of detail. Writes public/models/CREDITS.txt.
"""
import json
import pathlib
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpakoVoice-asset-pipeline"}
WEB = pathlib.Path(__file__).resolve().parents[2]
CACHE = WEB / ".cache" / "polyhaven"
# What each model is in the garden.
MODELS = {
    "fir_sapling_medium": "firs in the misty distance",
    "fern_02": "ferns",
    "rock_moss_set_01": "mossy stones",
    "rock_moss_set_02": "mossy stones",
    "tree_stump_01": "a stump",
    "street_lamp_01": "park lamps along the walk",
    "celandine_01": "lesser celandine, the first yellow flowers of the year",
    "island_tree_01": "the full old tree in the clearing",
    "island_tree_02": "the living tree at the start of the walk",
    "searsia_lucida": "leafy shrubs filling the lawns",
    "wooden_picnic_table": "a picnic table in the clearing",
}


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()


credits = ["Models from polyhaven.com, licensed CC0 1.0 (public domain).", ""]
for model, role in MODELS.items():
    files = json.loads(fetch(f"https://api.polyhaven.com/files/{model}"))["gltf"]["1k"]["gltf"]
    folder = CACHE / model
    gltf = folder / f"{model}.gltf"
    if not gltf.exists():
        for rel, info in files.get("include", {}).items():
            target = folder / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(fetch(info["url"]))
        folder.mkdir(parents=True, exist_ok=True)
        gltf.write_bytes(fetch(files["url"]))
    size = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
    print(f"{model:22} {size / 1e6:6.1f} MB  {role}")
    credits.append(f"{model}: {role}  https://polyhaven.com/a/{model}")
out = WEB / "public" / "models"
out.mkdir(parents=True, exist_ok=True)
(out / "CREDITS.txt").write_text("\n".join(credits) + "\n", encoding="utf-8")
