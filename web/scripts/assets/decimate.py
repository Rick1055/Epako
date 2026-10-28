"""Blender step of the asset pipeline (run by build-models.mjs):
   blender -b -P decimate.py -- <source.glb> <out-prefix> <ratio0,ratio1,ratio2> <ao 0|1>

Imports one source model, optionally bakes ambient occlusion into its vertex colours (Cycles), then for each level
of detail applies the Decimate modifier (collapse) at that ratio and exports <out-prefix>-lod<i>.glb with its
vertex colours. Ratios >= 1 export the mesh unchanged."""
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, prefix, ratios, ao = argv[0], argv[1], [float(r) for r in argv[2].split(",")], argv[3] == "1"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit(f"no mesh in {src}")


def colour_attribute(mesh):
    attrs = mesh.color_attributes
    if not len(attrs):
        raise SystemExit(f"{src}: no vertex colours were imported")
    return attrs.active_color or attrs[0]


def select_only(obj):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


if ao:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = 0.35  # how far the occlusion reaches (metres): crevices, not whole sides
    for obj in meshes:
        select_only(obj)
        base = colour_attribute(obj.data)
        occlusion = obj.data.color_attributes.new("AO", "FLOAT_COLOR", base.domain)
        obj.data.color_attributes.active_color = occlusion
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        # Darken the existing colours by the occlusion, gently (never to black), then drop the bake layer.
        for b, a in zip(base.data, occlusion.data):
            k = 0.5 + 0.5 * a.color[0]
            c = b.color
            b.color = (c[0] * k, c[1] * k, c[2] * k, c[3])
        obj.data.color_attributes.active_color = base
        obj.data.color_attributes.remove(occlusion)

for i, ratio in enumerate(ratios):
    copies = []
    for obj in meshes:
        copy = obj.copy()
        copy.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(copy)
        copies.append(copy)
        if ratio < 0.999:
            select_only(copy)
            mod = copy.modifiers.new("Decimate", "DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in bpy.context.scene.objects:
        o.select_set(o in copies)
    bpy.ops.export_scene.gltf(
        filepath=f"{prefix}-lod{i}.glb",
        export_format="GLB",
        use_selection=True,
        export_vertex_color="ACTIVE",
        export_normals=True,
        export_apply=True,
        export_yup=True,
    )
    for copy in copies:
        bpy.data.objects.remove(copy, do_unlink=True)
print(f"done {prefix} ratios={ratios} ao={ao}")
