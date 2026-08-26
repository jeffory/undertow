#!/usr/bin/env python3
"""keeper_vs.py — render two keeper GLBs on the SAME night stage with the SAME
camera, so a retopo/rig round can be judged honestly against what ships.

  blender --background --python tools/blender/keeper_vs.py -- \
      --a public/assets/keeper.glb --b assets/candidates/keeper-c-rigged.glb \
      --out /tmp/vs [--res 720] [--samples 48] [--frame N]

The camera is framed once, on --a, and reused verbatim for --b: two renders of
the same figure at the same size under the same lights, which is the only way a
side-by-side means anything. Writes <out>-a.png and <out>-b.png; montage them
outside Blender. Rigged inputs render at their rest pose unless --frame is
given, in which case the first NLA strip is evaluated at that frame.
"""
import argparse, math, os, sys

import bpy
import mathutils

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keeper_review import build_stage  # noqa: E402


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", type=int, default=720)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--yaw", type=float, default=-90.0)
    ap.add_argument("--frame", type=int, default=0)
    ap.add_argument("--clip", default="")
    return ap.parse_args(argv)


def load(path, yaw, clip, frame):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    # Spin about WORLD Z (the importer parents everything under a Y-up -> Z-up
    # correction, so touching rotation_euler.z would rotate in the wrong frame).
    rot = mathutils.Matrix.Rotation(math.radians(yaw), 4, "Z")
    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.matrix_world = rot @ o.matrix_world
    bpy.context.view_layer.update()

    if clip:
        for arm in [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]:
            ad = arm.animation_data
            for t in (ad.nla_tracks if ad else []):
                if t.name == clip and t.strips:
                    t.mute = False
                    ad.action = t.strips[0].action
        bpy.context.scene.frame_set(frame)
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def bounds(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ mathutils.Vector(c) for c in ev.bound_box]
    center = sum(pts, mathutils.Vector()) / len(pts)
    return center, max((p - center).length for p in pts)


def render(out, res, samples, cam_loc, cam_rot):
    scn = bpy.context.scene
    bpy.ops.object.camera_add(location=cam_loc, rotation=cam_rot)
    cam = bpy.context.object
    cam.data.lens = 55
    scn.camera = cam
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.exposure = -0.6
        scn.view_settings.look = "None"
    except (TypeError, AttributeError):
        pass
    scn.render.engine = "CYCLES"
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.render.resolution_x = res
    scn.render.resolution_y = res
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = os.path.abspath(out)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"[render] {out}")


def tri_total(meshes):
    return sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes)


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])

    meshes = load(a.a, a.yaw, "", 0)
    center, radius = bounds(meshes)
    print(f"[a] {a.a} tris={tri_total(meshes)} radius={radius:.3f}")
    look = mathutils.Vector((0.78, -0.60, 0.34)).normalized()
    fov = 2 * math.atan(18.0 / 55.0)
    cam_loc = center + look * (radius / math.tan(fov / 2) * 1.08)
    cam_rot = (center - cam_loc).to_track_quat("-Z", "Y").to_euler()
    build_stage()
    render(f"{a.out}-a.png", a.res, a.samples, cam_loc, cam_rot)

    meshes = load(a.b, a.yaw, a.clip, a.frame)
    print(f"[b] {a.b} tris={tri_total(meshes)}")
    build_stage()
    render(f"{a.out}-b.png", a.res, a.samples, cam_loc, cam_rot)
    return 0


if __name__ == "__main__":
    sys.exit(main())
