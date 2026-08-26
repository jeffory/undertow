#!/usr/bin/env python3
"""town_review.py — one night-stage contact sheet for the eight town buildings.

  blender --background --python tools/blender/town_review.py -- \
      --dir public/assets/town --out tools/town-candidates.png [--res 512]

Adapted from tools/blender/keeper_review.py (keeper candidate round): the same
near-black night stage, the same lantern-key / moon-rim / soft-fill rig, and the
same OCIO 'Standard' view-transform guard — this Blender ships an OCIO config
its library cannot load, so without the guard every cell blows out to white.

Each building is rendered ALONE, framed on its own bounding sphere from a 3/4
front-low angle (the street's read: you meet these buildings on foot, from the
gravel), then the cells are assembled into a 2 x 4 grid and labelled with the
building id and its bounding box. Rendering one building per scene — rather
than lining eight up in one shot — is what keeps every cell the same size on
the page whatever the building's real height, which is the point of a
consistency sheet.

Also prints '[bbox] <id> x=.. y=.. z=.. tris=..' per building, so the sheet run
doubles as the shipped-asset measurement pass.
"""
import argparse
import math
import os
import sys

import bpy
import mathutils

# Ledger order (content/buildings.ts) — the order the street stands in.
ORDER = [
    "smokehouse",
    "chandlery",
    "post-office",
    "bell-tower",
    "chapel",
    "apothecary",
    "bakery",
    "schoolhouse",
]


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="public/assets/town", help="directory of <id>.glb")
    ap.add_argument("--out", default="tools/town-candidates.png")
    ap.add_argument("--res", type=int, default=512)
    ap.add_argument("--samples", type=int, default=32)
    return ap.parse_args(argv)


def import_join(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in set(bpy.context.scene.objects) - before if o.type == "MESH"]
    if not new:
        sys.exit(f"error: no mesh in {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in new:
        o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    if len(new) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def world_bbox(obj):
    pts = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    lo = mathutils.Vector((min(p[i] for p in pts) for i in range(3)))
    hi = mathutils.Vector((max(p[i] for p in pts) for i in range(3)))
    return lo, hi


def tri_count(obj):
    import bmesh

    me = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    n = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    bm.free()
    return n


def build_stage():
    """The keeper/boat round's night stage, verbatim in spirit: near-black world,
    warm lantern key, cool moon rim, soft fill."""
    scn = bpy.context.scene
    scn.world = bpy.data.worlds.new("review")
    scn.world.use_nodes = True
    scn.world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.016, 0.022, 1)

    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.002))
    mat = bpy.data.materials.new("stage")
    mat.use_nodes = True
    p = mat.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.02, 0.025, 0.032, 1)
    p.inputs["Roughness"].default_value = 0.55
    bpy.context.object.data.materials.append(mat)

    # The rig is sized for a ~2 m subject in the keeper round; these buildings
    # are 4-9 m, so the lamps are pushed out and up by the same factor. The
    # energies do NOT get the full inverse-square (k**2) compensation: the
    # town's plaster and pale stone are far brighter albedos than the keeper's
    # oilskin, and at k**2 every cell clipped to bone white. k**1 lands the
    # street back in the game's night read.
    k = 3.0
    e = k
    bpy.ops.object.light_add(type="AREA", location=(2.2 * k, -1.8 * k, 2.6 * k))
    key = bpy.context.object
    key.data.energy = 110 * e
    key.data.size = 2.5 * k
    key.data.color = (1.0, 0.78, 0.46)
    key.rotation_euler = (0.85, 0.0, 0.9)

    bpy.ops.object.light_add(type="AREA", location=(-2.8 * k, 2.6 * k, 2.2 * k))
    rim = bpy.context.object
    rim.data.energy = 55 * e
    rim.data.size = 3.0 * k
    rim.data.color = (0.48, 0.62, 1.0)
    rim.rotation_euler = (-0.95, 0.0, 2.5)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.0 * k, 0.9 * k))
    fill = bpy.context.object
    fill.data.energy = 18 * e
    fill.data.size = 5.0 * k
    fill.data.color = (0.6, 0.72, 0.9)
    fill.rotation_euler = (1.45, 0, 0)


def render_one(obj, out, res, samples):
    scn = bpy.context.scene
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    cam.data.lens = 55
    scn.camera = cam

    pts = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    center = sum(pts, mathutils.Vector()) / len(pts)
    radius = max((p - center).length for p in pts)

    # 3/4 front, LOW — the buildings are met on foot from the gravel street, and
    # the prepped meshes present their door to +X (see render/town.ts
    # MODEL_FACING), which is the axis this camera looks down.
    look = mathutils.Vector((0.82, -0.52, 0.30)).normalized()
    fov = 2 * math.atan(18.0 / 55.0)
    dist = radius / math.tan(fov / 2) * 1.12
    cam.location = center + look * dist
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

    # This Blender ships an OCIO config its library cannot load, so colour
    # management falls back to raw linear and highlights clip. Pin Standard +
    # a little negative exposure so the review renders read like the game's
    # night lighting instead of a blown-out white blob.
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.exposure = -0.6
        scn.view_settings.look = "None"
    except (TypeError, AttributeError):
        pass

    scn.render.engine = "CYCLES"
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.render.film_transparent = False
    scn.render.resolution_x = res
    scn.render.resolution_y = res
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = os.path.abspath(out)
    bpy.ops.render.render(write_still=True)


def label_font(size):
    import PIL.ImageFont as PFont

    for path in (
        "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            return PFont.truetype(path, size)
    return PFont.load_default()


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])
    import tempfile

    import PIL.Image as PImage
    import PIL.ImageDraw as PDraw

    cells = []
    captions = []
    scratch = tempfile.mkdtemp(prefix="town_review_")

    for bid in ORDER:
        src = os.path.join(a.dir, f"{bid}.glb")
        if not os.path.exists(src):
            sys.exit(f"error: missing {src}")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        obj = import_join(src, bid)
        lo, hi = world_bbox(obj)
        d = hi - lo
        tris = tri_count(obj)
        print(f"[bbox] {bid} x={d.x:.3f} y={d.y:.3f} z={d.z:.3f} tris={tris}")
        build_stage()
        cell = os.path.join(scratch, f"{bid}.png")
        render_one(obj, cell, a.res, a.samples)
        cells.append(cell)
        captions.append(f"{bid}   {d.x:.1f} x {d.y:.1f} x {d.z:.1f} m   {tris} tris")

    # 2 rows x 4 columns, each cell captioned along its bottom edge.
    band = max(18, a.res // 18)
    sheet = PImage.new("RGBA", (a.res * 4, (a.res + band) * 2), (8, 10, 14, 255))
    draw = PDraw.Draw(sheet)
    font = label_font(max(11, a.res // 32))
    for i, (cell, caption) in enumerate(zip(cells, captions)):
        col = i % 4
        row = i // 4
        x = col * a.res
        y = row * (a.res + band)
        sheet.paste(PImage.open(cell).convert("RGBA"), (x, y))
        draw.text((x + 6, y + a.res + 3), caption, fill=(226, 219, 205, 255), font=font)

    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    sheet.save(a.out)
    print(f"[render] wrote {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
