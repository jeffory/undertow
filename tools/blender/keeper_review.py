#!/usr/bin/env python3
"""keeper_review.py — review renders for UNDERTOW keeper candidates.

  blender --background --python tools/blender/keeper_review.py -- \
      --keeper assets/candidates/keeper-a.glb \
      --out tools/keeper-a-alone.png [--boat public/assets/rowboat.glb] [--bbox-only]

Adapted from tools/blender/boat_review.py (boat candidate round): same
near-black night stage, same lantern-key / moon-rim / soft-fill rig, and the
same OCIO 'Standard' view-transform guard. Two modes:

  * keeper alone      — 3/4 LOW angle, framed on the figure.
  * --boat <glb>      — the keeper stood amidships on the boat's inner floor
                        (found by ray-casting up through the hull), framed on
                        both, for the in-scene scale read.

--keeper-yaw spins the keeper about the vertical axis before placement. The
prepped keepers face Blender +Y (matching public/assets/keeper.glb); -90 turns
that to +X, which is the boat's bow and the axis this camera looks down, so the
figure presents a 3/4 FRONT in both modes.

Always prints '[bbox] <name> x=.. y=.. z=.. tris=..' for the keeper.
"""
import argparse, math, os, sys

import bpy
import mathutils


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--keeper", required=True)
    ap.add_argument("--out", default="")
    ap.add_argument("--boat", default="")
    ap.add_argument("--keeper-yaw", type=float, default=-90.0)
    ap.add_argument("--bbox-only", action="store_true")
    ap.add_argument("--res", type=int, default=720)
    ap.add_argument("--samples", type=int, default=48)
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
    bm = bmesh.new(); bm.from_mesh(me)
    n = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    bm.free()
    return n


def spin(obj, yaw_deg):
    if abs(yaw_deg) < 1e-6:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.transform.rotate(value=math.radians(yaw_deg), orient_axis="Z")
    bpy.ops.object.transform_apply(rotation=True)
    bpy.context.view_layer.update()


def inner_floor_z(obj, lo, hi):
    """Inside of the bottom planking: first upward hit clear of the keel.

    Verbatim from boat_review.py — cast up at the hull centre and take the
    lowest hit at least 12% of the boat's height above the bbox floor, which
    skips the hull's exterior bottom (and, on image-mode candidates, the slab
    of sea Tripo reconstructs around the waterline).
    """
    mw_inv = obj.matrix_world.inverted()
    height = hi.z - lo.z
    floor_min = lo.z + 0.12 * height
    up = mathutils.Vector((0, 0, 1))
    best = None
    for dx, dy in ((0, 0), (0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05)):
        cur = mathutils.Vector(((lo.x + hi.x) / 2 + dx, (lo.y + hi.y) / 2 + dy, lo.z - 0.2))
        for _ in range(16):
            ok, loc, _n, _i = obj.ray_cast(mw_inv @ cur, up)
            if not ok:
                break
            world = obj.matrix_world @ loc
            if world.z >= floor_min:
                if best is None or world.z < best:
                    best = world.z
                break
            cur = world + mathutils.Vector((0, 0, 1e-4))
    return best if best is not None else lo.z + 0.3 * height


def build_stage():
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

    # warm lantern key, cool moon rim, soft fill (same rig as the boat round)
    bpy.ops.object.light_add(type="AREA", location=(2.2, -1.8, 2.6))
    k = bpy.context.object; k.data.energy = 110; k.data.size = 2.5
    k.data.color = (1.0, 0.78, 0.46)
    k.rotation_euler = (0.85, 0.0, 0.9)

    bpy.ops.object.light_add(type="AREA", location=(-2.8, 2.6, 2.2))
    r = bpy.context.object; r.data.energy = 55; r.data.size = 3.0
    r.data.color = (0.48, 0.62, 1.0)
    r.rotation_euler = (-0.95, 0.0, 2.5)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.0, 0.9))
    f = bpy.context.object; f.data.energy = 18; f.data.size = 5.0
    f.data.color = (0.6, 0.72, 0.9)
    f.rotation_euler = (1.45, 0, 0)


def render(subjects, out, res, samples, alone):
    scn = bpy.context.scene
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    cam.data.lens = 55
    scn.camera = cam

    pts = []
    for o in subjects:
        pts += [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    center = sum(pts, mathutils.Vector()) / len(pts)
    radius = max((p - center).length for p in pts)

    # 3/4 LOW angle. Alone, sit nearer eye height so the sou'wester brim and
    # the shadow it throws on the face still read; aboard, keep the boat
    # round's lower sheer-height framing.
    look = mathutils.Vector((0.78, -0.60, 0.34 if alone else 0.26)).normalized()
    fov = 2 * math.atan(18.0 / 55.0)
    dist = radius / math.tan(fov / 2) * (1.08 if alone else 1.18)
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
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"[render] wrote {out}")


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)

    kp = import_join(a.keeper, "keeper")
    spin(kp, a.keeper_yaw)
    klo, khi = world_bbox(kp)
    d = khi - klo
    print(f"[bbox] {a.keeper} x={d.x:.3f} y={d.y:.3f} z={d.z:.3f} tris={tri_count(kp)}")
    if a.bbox_only:
        return 0

    subjects = [kp]
    if a.boat:
        boat = import_join(a.boat, "boat")
        lo, hi = world_bbox(boat)
        fz = inner_floor_z(boat, lo, hi)
        kp.location = (
            (lo.x + hi.x) / 2 - (klo.x + khi.x) / 2,
            (lo.y + hi.y) / 2 - (klo.y + khi.y) / 2,
            fz - klo.z,
        )
        bpy.context.view_layer.update()
        print(f"[keeper] floor z={fz:.3f} height={d.z:.3f}")
        subjects.append(boat)

    build_stage()
    render(subjects, a.out, a.res, a.samples, alone=not a.boat)
    return 0


if __name__ == "__main__":
    sys.exit(main())
