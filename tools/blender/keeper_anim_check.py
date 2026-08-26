#!/usr/bin/env python3
"""keeper_anim_check.py — re-import a rigged keeper GLB, list its clips, and
render a contact sheet of sampled frames from each so the deformation can be
eyeballed. Uses the same night stage / OCIO guard as keeper_review.py.

  blender --background --python tools/blender/keeper_anim_check.py -- \
      --in assets/candidates/keeper-c-rigged.glb --out tools/keeper-clips.png \
      [--frames 4] [--res 480] [--samples 32]
"""
import argparse, math, os, sys

import bpy
import mathutils

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keeper_review import build_stage  # noqa: E402


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=4)
    ap.add_argument("--res", type=int, default=480)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--yaw", type=float, default=-90.0)
    return ap.parse_args(argv)


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.src)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"
               and o.find_armature() is not None]
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    print(f"[check] meshes={[o.name for o in meshes]} armatures={[o.name for o in arms]}")
    print(f"[check] actions={[act.name for act in bpy.data.actions]}")
    if not arms:
        sys.exit("error: no armature in the GLB — the rig did not survive export")
    arm = arms[0]
    ad = arm.animation_data
    tracks = list(ad.nla_tracks) if ad else []
    print(f"[check] nla tracks={[t.name for t in tracks]}")
    for t in tracks:
        for s in t.strips:
            print(f"[clip] {t.name}: strip '{s.name}' action='{s.action.name if s.action else None}' "
                  f"frames {s.frame_start:.0f}..{s.frame_end:.0f}")

    # Yaw the whole rig so the figure presents a 3/4 front, as in keeper_review.
    # Spin about WORLD Z. The glTF importer parents everything under a Y-up ->
    # Z-up correction, so nudging rotation_euler.z would rotate in that
    # corrected frame and swing the figure the wrong way; compose on the left
    # of matrix_world instead.
    rot = mathutils.Matrix.Rotation(math.radians(a.yaw), 4, "Z")
    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.matrix_world = rot @ o.matrix_world
    bpy.context.view_layer.update()

    build_stage()

    scn = bpy.context.scene
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    cam.data.lens = 55
    scn.camera = cam
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ mathutils.Vector(c) for c in ev.bound_box]
    center = sum(pts, mathutils.Vector()) / len(pts)
    radius = max((p - center).length for p in pts)
    look = mathutils.Vector((0.78, -0.60, 0.34)).normalized()
    fov = 2 * math.atan(18.0 / 55.0)
    cam.location = center + look * (radius / math.tan(fov / 2) * 1.08)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.exposure = -0.6
        scn.view_settings.look = "None"
    except (TypeError, AttributeError):
        pass
    scn.render.engine = "CYCLES"
    scn.cycles.samples = a.samples
    scn.cycles.use_denoising = True
    scn.render.resolution_x = a.res
    scn.render.resolution_y = a.res
    scn.render.image_settings.file_format = "PNG"

    stem = os.path.splitext(os.path.abspath(a.out))[0]
    os.makedirs(os.path.dirname(stem), exist_ok=True)
    shots = []
    for t in tracks:
        strip = t.strips[0]
        t.mute = False
        ad.action = strip.action
        lo, hi = int(strip.frame_start), int(strip.frame_end)
        for i in range(a.frames):
            f = lo + round((hi - lo) * i / a.frames)
            scn.frame_set(f)
            path = f"{stem}-{t.name}-{i}.png"
            scn.render.filepath = path
            bpy.ops.render.render(write_still=True)
            shots.append((f"{t.name} f{f}", path))
            print(f"[shot] {t.name} frame {f} -> {path}")
        t.mute = True
        ad.action = None
    print("[shots] " + "|".join(f"{n}={p}" for n, p in shots))
    return 0


if __name__ == "__main__":
    sys.exit(main())
