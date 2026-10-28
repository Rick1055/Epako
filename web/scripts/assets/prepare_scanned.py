"""Blender step for scanned/modelled assets (run by build-models.mjs):
   blender -b -P prepare_scanned.py -- <source.gltf> <out-prefix> <split 0|1> <budget0,budget1,budget2> [keep,names]

split=1: the file is a set of separate variants (rocks, ferns, grass clumps...): each object becomes its own variant,
named v0, v1..., re-centred so its base sits at the origin. split=0: the objects are parts of one model (trunk and
branches), re-centred together. For each level of detail, every object is decimated (collapse) to its share of the
triangle budget; exports <out-prefix>-lod<i>.glb with the original textures (gltf-transform resizes them per tier
and converts them to WebP afterwards: Blender's own image saving fails on some 16-bit maps).

Leafy models (`leaves` = the share of leaves kept per tier, e.g. 1,0.5,0.22): collapse decimation tears thousands of
separate leaves apart, so each leaf (a connected island of a material named "leaves") is replaced by one flat card in
its own outline (the leaf's hull in texture space, simplified to five corners), carrying the same patch of the leaf
texture: 3 triangles instead of 20 or more. (These scans draw a leaf's shape with geometry over an opaque texture, so a
plain rectangle would show the whole patch.) Lower tiers keep fewer leaves, each enlarged so the crown stays as full. Only the wood (trunk,
branches, twigs) is decimated, to the budget.
"""
import random
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, prefix, split = argv[0], argv[1], argv[2] == "1"
budgets = [int(b) for b in argv[3].split(",")]
keep = [k for k in argv[4].split(",") if k] if len(argv) > 4 else []
leaves = [float(f) for f in argv[5].split(",")] if len(argv) > 5 and argv[5] else None
LEAF = re.compile(r"lea(f|ves)", re.I)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if keep:
    # Only the named objects (a set of modules may hold spare parts that aren't part of the model).
    # Exact names (or Blender's ".001" copies): a prefix would let "seat" also keep "seat_bench", a loose module.
    for o in [m for m in meshes if not any(m.name == k or m.name.startswith(k + ".") for k in keep)]:
        bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit(f"no mesh in {src}")

# Bake every transform into the meshes, unparent, so each object stands alone in world space.
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True)  # sets often share mesh data; applying needs each its own
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        bpy.data.objects.remove(o, do_unlink=True)


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def recentre(objs):
    """Move so the base (lowest point) sits at the origin, centred on x/y (Blender is z-up)."""
    lo, hi = bounds(objs)
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in objs:
        o.location += shift
        o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    for o in objs:
        o.select_set(False)


groups = [[o] for o in meshes] if split else [meshes]
for k, group in enumerate(groups):
    recentre(group)
    if split:
        group[0].name = f"v{k}"

def is_leaf(o, p):
    m = o.data.materials[p.material_index] if o.data.materials else None
    return bool(leaves) and m is not None and bool(LEAF.search(m.name))


def outline(points, keep=5):
    """The convex hull of 2D points, simplified to `keep` corners by repeatedly dropping the one adding least area."""
    pts = sorted(set(map(tuple, points)))
    if len(pts) < 3:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    while len(hull) > keep:
        n = len(hull)
        k = min(range(n), key=lambda i: abs(cross(hull[i - 1], hull[i], hull[(i + 1) % n])))
        hull.pop(k)
    return hull


def leaf_cards(o, kept, seed):
    """Every leaf island becomes one flat card in the leaf's own outline (its hull in texture space, five corners),
    placed by an affine fit from its UVs to its positions; `kept` of them stay, enlarged to keep the crown full."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uv = bm.loops.layers.uv.active
    leaf_mats = {i for i, m in enumerate(o.data.materials) if m and LEAF.search(m.name)}
    todo = {f for f in bm.faces if f.material_index in leaf_mats}
    old, grow = list(todo), 1 / max(kept, 1e-3) ** 0.5
    while todo:
        seed_face = todo.pop()
        island, stack = [seed_face], [seed_face]
        while stack:
            for e in stack.pop().edges:
                for g in e.link_faces:
                    if g in todo:
                        todo.discard(g)
                        island.append(g)
                        stack.append(g)
        if rnd.random() > kept:
            continue
        pts = np.array([[*l[uv].uv, 1.0, *l.vert.co] for f in island for l in f.loops])
        fit, *_ = np.linalg.lstsq(pts[:, :3], pts[:, 3:], rcond=None)
        corners = outline(np.round(pts[:, :2], 6))
        if len(corners) < 3:
            continue
        xyz = np.array([[u, v, 1.0] for u, v in corners]) @ fit
        mid = xyz.mean(0)
        verts = [bm.verts.new(Vector(mid + (c - mid) * grow)) for c in xyz]
        try:
            face = bm.faces.new(verts)
        except ValueError:
            continue
        face.material_index = island[0].material_index
        face.smooth = True
        for l, (u, v) in zip(face.loops, corners):
            l[uv].uv = (u, v)
    bmesh.ops.delete(bm, geom=old, context="FACES")
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(o.data)
    bm.free()


triangles = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons if not is_leaf(o, p)) for o in meshes}
per_variant = {o.name: sum(triangles[x.name] for x in g) for g in groups for o in g}

for i, budget in enumerate(budgets):
    copies, extra = [], []
    for o in meshes:
        copy = o.copy()
        copy.data = o.data.copy()
        copy.name = o.name + "-tier"  # renamed back below so the variant names survive export
        bpy.context.scene.collection.objects.link(copy)
        copies.append((o, copy))
        # Each variant gets the whole budget; parts of one model share it by their triangle counts.
        share = budget * triangles[o.name] / max(1, per_variant[o.name])
        ratio = min(1.0, share / max(1, triangles[o.name]))
        if leaves:
            # The leaves go to their own object (cards, below); only the wood stays to be decimated.
            leafy = copy.copy()
            leafy.data = copy.data.copy()
            leafy.name = o.name + ".leaves"  # keeps the variant's name prefix (v<k>) for the loader
            bpy.context.scene.collection.objects.link(leafy)
            for obj, drop_leaves in ((copy, True), (leafy, False)):
                bm = bmesh.new()
                bm.from_mesh(obj.data)
                gone = [f for f in bm.faces if is_leaf(obj, obj.data.polygons[f.index]) == drop_leaves]
                bmesh.ops.delete(bm, geom=gone, context="FACES")
                bm.to_mesh(obj.data)
                bm.free()
            leaf_cards(leafy, leaves[i], seed=i)
            extra.append(leafy)
        if ratio < 0.999 and triangles[o.name]:
            for x in bpy.context.scene.objects:
                x.select_set(False)
            copy.select_set(True)
            bpy.context.view_layer.objects.active = copy
            mod = copy.modifiers.new("Decimate", "DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for o, copy in copies:
        o.name = o.name + "-source"
        copy.name = o.name[: -len("-source")]
    for x in bpy.context.scene.objects:
        x.select_set(any(x is c for _, c in copies) or x in extra)
    bpy.ops.export_scene.gltf(
        filepath=f"{prefix}-lod{i}.glb",
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="AUTO",
    )
    for o, copy in copies:
        bpy.data.objects.remove(copy, do_unlink=True)
        o.name = o.name[: -len("-source")]
    for x in extra:
        bpy.data.objects.remove(x, do_unlink=True)
print(f"done {prefix} variants={len(groups)} triangles={sum(triangles.values())}")
