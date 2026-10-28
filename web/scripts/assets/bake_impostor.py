"""Blender step: bake an impostor of a full-detail model (run by build-models.mjs).
   blender -b -P bake_impostor.py -- <source.gltf> <out-prefix> <pixels>

Renders the model, undecimated, from the front and from the side with an orthographic camera and a transparent
background (Cycles), to <out-prefix>-front.png and <out-prefix>-side.png, and writes <out-prefix>.json with the
model's width, depth and height in metres. Distant trees are then two crossed cards carrying these pictures:
they look like the real model at a tiny fraction of its triangles. Blender is z-up; the card's up is z.
"""
import json
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, prefix, pixels = argv[0], argv[1], int(argv[2])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
size = hi - lo
centre = (lo + hi) / 2

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"  # plain colours, so the card lights like the rest of the scene
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9  # soft sky fill

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
cam.data.type = "ORTHO"
scene.collection.objects.link(cam)
scene.camera = cam

out = {"height": size.z, "front": size.x, "side": size.y}
for view, width, angle in [("front", size.x, 0.0), ("side", size.y, math.pi / 2)]:
    margin = 1.04
    aspect = width / size.z
    scene.render.resolution_y = pixels
    scene.render.resolution_x = max(16, round(pixels * aspect))
    cam.data.ortho_scale = max(width, size.z) * margin
    # Look horizontally at the model's middle from in front (-y) or from the side (+x).
    d = max(size.x, size.y, size.z) * 3
    offset = Vector((math.sin(angle), -math.cos(angle), 0)) * d
    cam.location = centre + offset
    cam.rotation_euler = (math.radians(90), 0, angle)
    scene.render.filepath = f"{prefix}-{view}.png"
    bpy.ops.render.render(write_still=True)
    out[f"{view}Scale"] = cam.data.ortho_scale
with open(f"{prefix}.json", "w") as f:
    json.dump(out, f)
print(f"impostor {prefix} {out}")
