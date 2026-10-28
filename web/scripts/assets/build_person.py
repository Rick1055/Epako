"""Build one visitor for the park with MPFB (MakeHuman, CC0 assets) in headless Blender and write it as a static glTF.

    BLENDER_USER_CONFIG=<cache>/cfg BLENDER_USER_EXTENSIONS=<cache>/ext \
    blender -b --factory-startup -P build_person.py -- <spec.json> <assets-dir> <out-dir>

The spec says who: body shape (gender 0..1, age in years, weight, muscle, race shares), skin, outfit (with "shirt": a
colour for the T-shirt, since every casual suit in the packs has the same blue one; recolour.py), hair, and
the pose ("sit": thighs forward, shins down, hands on the lap; "stand": arms at the sides). The pose is solved, not
guessed: for each limb bone a rotation is searched so the next joint lands in the wanted direction, then the posed body
is baked (the rig and shape keys are dropped), each part gets a plain Principled material with its diffuse picture
(hair keeps its alpha), and the result is exported for scripts/assets/build-models.mjs to decimate into three tiers.
Export is Y-up; the person faces +Z.
"""
import itertools
import json
import math
import os
import sys

import addon_utils
import bpy
import numpy as np
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
spec = json.load(open(argv[0]))
ASSETS, OUT = argv[1], argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recolour import recolour_array  # noqa: E402

addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=False)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=False)

# ---- The body ----------------------------------------------------------------------------------------------------
macro = TargetService.get_default_macro_info_dict()
macro["gender"] = spec["gender"]
macro["age"] = 0.5 + (spec["age"] - 25) / 65 * 0.5 if spec["age"] >= 25 else 0.1875 + (spec["age"] - 11) / 14 * 0.3125
macro["weight"] = spec.get("weight", 0.5)
macro["muscle"] = spec.get("muscle", 0.5)
macro["proportions"] = spec.get("proportions", 0.5)
macro["height"] = spec.get("height", 0.5)
macro["race"] = spec["race"]
body = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(body, "default", import_weights=True)


def asset(kind, name, as_type):
    mhclo = os.path.join(ASSETS, kind, name, name + ".mhclo")
    return HumanService.add_mhclo_asset(mhclo, body, asset_type=as_type, subdiv_levels=0, set_up_rigging=True, interpolate_weights=True, import_weights=True)


parts = {"body": body}
parts["eyes"] = HumanService.add_mhclo_asset(os.path.join(ASSETS, "eyes", "low-poly", "low-poly.mhclo"), body, asset_type="Eyes", subdiv_levels=0)
for name in spec["clothes"]:
    parts[name] = asset("clothes", name, "Clothes")
if spec.get("hair"):
    parts["hair"] = asset("hair", spec["hair"], "Hair")

# ---- The pose ---------------------------------------------------------------------------------------------------
view = bpy.context.view_layer
rig_pose = rig.pose.bones


def head(name):
    """A bone's head in the world, read from the evaluated rig (the original's pose isn't refreshed in background mode)."""
    return rig.matrix_world @ rig.evaluated_get(bpy.context.evaluated_depsgraph_get()).pose.bones[name].head


def aim(bone, child, want, steps=range(-120, 121, 10)):
    """Bend `bone` (its own axes, parents already posed) so that `child`'s head lies along `want` from its head.
    Only bending (about the bone's X and Z): a bone's Y axis runs along it, and twisting about it wrings the mesh."""
    want = Vector(want).normalized()
    pb = rig_pose[bone]
    pb.rotation_mode = "XYZ"
    best = (9e9, (0, 0, 0))
    for rx, rz in itertools.product(steps, repeat=2):
        r = (rx, 0, rz)
        pb.rotation_euler = Euler([math.radians(a) for a in r])
        view.update()
        d = (head(child) - head(bone)).normalized()
        cost = (1 - d.dot(want)) * 100 + sum(abs(a) for a in r) * 0.002  # the smallest rotation that points the right way
        if cost < best[0]:
            best = (cost, r)
    pb.rotation_euler = Euler([math.radians(a) for a in best[1]])
    view.update()


def pose(kind):
    for side in "LR":
        if kind == "sit":
            aim(f"upperleg01.{side}", f"lowerleg01.{side}", (0, -1, 0))  # thighs forward (the person faces -Y)
            aim(f"lowerleg01.{side}", f"foot.{side}", (0, -0.1, -1))  # shins down
            aim(f"foot.{side}", f"toe3-1.{side}", (0, -1, -0.1))
            aim(f"upperarm01.{side}", f"lowerarm01.{side}", (0.12 if side == "L" else -0.12, -0.15, -1))
            aim(f"lowerarm01.{side}", f"wrist.{side}", (0.2 if side == "L" else -0.2, -1, -0.15))  # hands resting forward
        else:
            aim(f"upperarm01.{side}", f"lowerarm01.{side}", (0.15 if side == "L" else -0.15, 0, -1))
            aim(f"lowerarm01.{side}", f"wrist.{side}", (0.1 if side == "L" else -0.1, -0.2, -1))


pose(spec["pose"])

# ---- Bake: posed meshes with no rig, no shape keys ----------------------------------------------------------------
view.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
baked = {}
for role, obj in parts.items():
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    new = bpy.data.objects.new(role, mesh)
    new.matrix_world = obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(new)
    baked[role] = new

for obj in list(bpy.data.objects):
    if obj not in baked.values():
        bpy.data.objects.remove(obj, do_unlink=True)

# ---- Materials: one Principled material per part, from its diffuse picture -------------------------------------------


def diffuse_of(rel_dir, mhmat):
    for line in open(os.path.join(ASSETS, rel_dir, mhmat), encoding="utf-8"):
        if line.lower().startswith("diffusetexture"):
            return os.path.normpath(os.path.join(ASSETS, rel_dir, line.split(None, 1)[1].strip()))
    raise SystemExit(f"no diffuse texture in {mhmat}")


def material(name, picture, alpha=False, roughness=0.8, shirt=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(picture)
    if shirt:
        # Blender's pixel rows run bottom-up; recolour works top-down. The edited picture is packed so the export uses it.
        img = tex.image
        w, h = img.size
        px = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(px)
        img.pixels.foreach_set(recolour_array(px.reshape(h, w, 4)[::-1].copy(), shirt)[::-1].ravel())
        img.pack()
    m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        m.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    return m


skin = spec["skin"]
looks = {
    "body": material("skin", diffuse_of(f"skins/{skin}", f"{skin}.mhmat"), roughness=0.6),
    "eyes": material("eye", diffuse_of("eyes/materials", f"{spec['eyes']}.mhmat"), roughness=0.2),
}
for name in spec["clothes"]:
    looks[name] = material(name, diffuse_of(f"clothes/{name}", f"{name}.mhmat"), roughness=0.9, shirt=spec.get("shirt") if "suit" in name else None)
if spec.get("hair"):
    looks["hair"] = material("hair", diffuse_of(f"hair/{spec['hair']}", f"{spec['hair']}.mhmat"), alpha=True, roughness=0.5)
for role, obj in baked.items():
    obj.data.materials.clear()
    obj.data.materials.append(looks[role])
    for p in obj.data.polygons:
        p.use_smooth = True

# ---- Export --------------------------------------------------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in baked.values():
    obj.select_set(True)
tris = {role: sum(len(p.vertices) - 2 for p in obj.data.polygons) for role, obj in baked.items()}
height = max(v.co.z for obj in baked.values() for v in obj.data.vertices)
name = spec["name"]
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, name + ".gltf"),
    export_format="GLTF_SEPARATE",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_image_format="AUTO",
)
print("PERSON", name, "tris", tris, "highest point", round(height, 2))
