#!/usr/bin/env python3
"""keeper_rig.py — fit a minimal humanoid armature to the braced keeper and
bake two subtle loops onto it.

  blender --background --python tools/blender/keeper_rig.py -- \
      --in <keeper-low.glb> --out assets/candidates/keeper-c-rigged.glb \
      [--fps 30] [--no-anim]

The keeper's BRACED pose is the rest pose: the bone table below was fitted to
the mesh by slice/cluster analysis of the actual vertices (feet and hands are
measured; the spine chain is interpolated), so no rest-pose correction is
needed and the clips are small deltas off the sculpt.

The clips are deliberately small — this is a moody fishing game:
  idle  2.4s  breathing sway, chest/head a couple of degrees, weight shift
  reel  1.1s  rhythmic haul, hands travel ~8cm, torso rocks back against it
"""
import argparse, math, os, sys

import bpy
import mathutils
from mathutils import Matrix, Vector

# name, head, tail, parent, connected
BONES = [
    ("hips",       (0.00, -0.14, 0.90), (0.00, -0.11, 1.06), None,     False),
    ("spine",      (0.00, -0.11, 1.06), (0.00, -0.07, 1.20), "hips",   True),
    ("chest",      (0.00, -0.07, 1.20), (0.00, -0.02, 1.38), "spine",  True),
    ("head",       (0.00, -0.02, 1.38), (0.03,  0.09, 1.72), "chest",  True),

    ("upperarm.L", (-0.19, -0.04, 1.30), (-0.35, 0.00, 1.04), "chest",      False),
    ("forearm.L",  (-0.35,  0.00, 1.04), (-0.22, 0.42, 0.80), "upperarm.L", True),
    # hand.L runs the length of the gaff the keeper is gripping, so the shaft
    # rides with the hand instead of being left behind by the pull.
    ("hand.L",     (-0.22,  0.42, 0.80), (-0.21, 0.86, 0.74), "forearm.L",  True),

    ("upperarm.R", ( 0.19, -0.04, 1.30), ( 0.37, -0.02, 1.06), "chest",      False),
    ("forearm.R",  ( 0.37, -0.02, 1.06), ( 0.34,  0.32, 0.83), "upperarm.R", True),
    ("hand.R",     ( 0.34,  0.32, 0.83), ( 0.32,  0.46, 0.79), "forearm.R",  True),

    ("thigh.L",    (-0.13, -0.12, 0.90), (-0.19,  0.14, 0.52), "hips",    False),
    ("shin.L",     (-0.19,  0.14, 0.52), (-0.21,  0.03, 0.20), "thigh.L", True),
    ("foot.L",     (-0.21,  0.03, 0.20), (-0.19,  0.28, 0.06), "shin.L",  True),

    ("thigh.R",    ( 0.13, -0.16, 0.90), ( 0.07, -0.36, 0.52), "hips",    False),
    ("shin.R",     ( 0.07, -0.36, 0.52), ( 0.01, -0.63, 0.22), "thigh.R", True),
    ("foot.R",     ( 0.01, -0.63, 0.22), ( 0.05, -0.85, 0.07), "shin.R",  True),
]

X, Y, Z = "X", "Y", "Z"


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--no-anim", action="store_true")
    return ap.parse_args(argv)


def only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def import_mesh(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in set(bpy.context.scene.objects) - before if o.type == "MESH"]
    if not new:
        sys.exit(f"error: no mesh in {path}")
    only(new[0])
    for o in new[1:]:
        o.select_set(True)
    if len(new) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = "keeper"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Re-weld. glTF has no shared-vertex-with-two-UVs concept, so a round trip
    # splits the mesh at every UV seam: the baked keeper comes back in ~900
    # disconnected shells, and bone-heat weighting needs a connected surface
    # (without this it fails for every bone and every vertex falls through to
    # the nearest-bone fallback, which shears at the joints). Merging by
    # distance restores topological connectivity; per-loop UVs are untouched.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[mesh] {len(obj.data.vertices)} verts after weld, "
          f"{len(obj.data.polygons)} faces")
    return obj


def build_armature():
    arm_data = bpy.data.armatures.new("keeper_rig")
    arm = bpy.data.objects.new("keeper_rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    only(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for name, head, tail, parent, conn in BONES:
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = conn
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[rig] {len(arm_data.bones)} bones")
    return arm


def skin(mesh, arm):
    """Bone-heat weights, then a nearest-bone sweep for anything heat missed."""
    only(mesh)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    used_heat = True
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError as e:
        print(f"[skin] bone heat failed ({e}); falling back to envelopes")
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
        used_heat = False

    # Any vertex the solver left with no influence snaps to the nearest bone
    # segment. Without this the stragglers (hat brim tips, gaff end, coat hem)
    # stay pinned at the origin and shear across the model when a clip plays.
    seg = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones]
    groups = {vg.name: vg for vg in mesh.vertex_groups}
    for name, _h, _t in seg:
        if name not in groups:
            groups[name] = mesh.vertex_groups.new(name=name)
    fixed = 0
    for v in mesh.data.vertices:
        if sum(g.weight for g in v.groups) > 1e-4:
            continue
        best, bestd = None, 1e18
        for name, h, t in seg:
            d = t - h
            L2 = d.dot(d) or 1e-9
            u = max(0.0, min(1.0, (v.co - h).dot(d) / L2))
            dist = (v.co - (h + d * u)).length
            if dist < bestd:
                best, bestd = name, dist
        groups[best].add([v.index], 1.0, "REPLACE")
        fixed += 1
    print(f"[skin] heat={used_heat} orphan verts reweighted: {fixed}")
    return fixed


# --- posing helpers -----------------------------------------------------------

def world_rot(pbone, axis, deg):
    """Rotation about an ARMATURE-space axis, expressed in the bone's basis.

    Poses read much more clearly authored as 'lean back 3 degrees' than as a
    quaternion in some bone's roll frame, so convert: M^-1 * R * M, where M is
    the bone's rest rotation in armature space.
    """
    M = pbone.bone.matrix_local.to_3x3()
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    return (M.inverted() @ R @ M).to_quaternion()


def world_loc(pbone, vec):
    """An armature-space offset expressed in the bone's own basis space."""
    M = pbone.bone.matrix_local.to_3x3()
    return M.inverted() @ Vector(vec)


def key(arm, frame, pose):
    """pose: {bone: {'rot': [(axis, deg), ...], 'loc': (x,y,z)}}

    Both 'rot' axes and 'loc' are ARMATURE-space (X right, Y forward, Z up),
    converted into each bone's basis so the poses stay readable.
    """
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for name, spec in pose.items():
        pb = arm.pose.bones[name]
        q = mathutils.Quaternion((1, 0, 0, 0))
        for axis, deg in spec.get("rot", []):
            q = q @ world_rot(pb, axis, deg)
        pb.rotation_quaternion = q
        pb.location = world_loc(pb, spec.get("loc", (0, 0, 0)))
    bpy.context.view_layer.update()
    for name in pose:
        pb = arm.pose.bones[name]
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def new_action(arm, name):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    return act


def clear_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


# --- the two clips ------------------------------------------------------------

def build_idle(arm, fps):
    """2.4s breathing sway. Ribcage lifts, weight rolls off one hip, head drifts."""
    n = int(round(2.4 * fps))              # 72 @30
    clear_pose(arm)
    act = new_action(arm, "idle")
    NEUTRAL = {
        "hips": {}, "spine": {}, "chest": {}, "head": {},
        "upperarm.L": {}, "upperarm.R": {},
    }
    key(arm, 0, NEUTRAL)
    key(arm, n // 3, {
        "hips":  {"rot": [(Y, 0.9)], "loc": (0, 0, 0.010)},
        "spine": {"rot": [(X, -1.0)]},
        "chest": {"rot": [(X, -2.0)]},          # ribcage lifts on the inhale
        "head":  {"rot": [(X, 1.1), (Z, 1.6)]},
        "upperarm.L": {"rot": [(X, -1.2)]},
        "upperarm.R": {"rot": [(X, -1.0)]},
    })
    key(arm, 2 * n // 3, {
        "hips":  {"rot": [(Y, -0.7)], "loc": (0, 0, -0.007)},
        "spine": {"rot": [(X, 0.6)]},
        "chest": {"rot": [(X, 1.2)]},           # settle on the exhale
        "head":  {"rot": [(X, -1.3), (Z, -1.2)]},
        "upperarm.L": {"rot": [(X, 0.8)]},
        "upperarm.R": {"rot": [(X, 0.7)]},
    })
    key(arm, n, NEUTRAL)                        # == frame 0, so it loops clean
    return act, 0, n


def build_reel(arm, fps):
    """1.1s haul. Hands travel ~8cm back, torso rocks back against the pull."""
    n = int(round(1.1 * fps))              # 33 @30
    clear_pose(arm)
    act = new_action(arm, "reel")
    NEUTRAL = {
        "hips": {}, "spine": {}, "chest": {}, "head": {},
        "upperarm.L": {}, "upperarm.R": {}, "forearm.L": {}, "forearm.R": {},
    }
    key(arm, 0, NEUTRAL)
    # the pull — sharp, on the front of the beat. Amplitudes ~1.85x the first
    # cut: at gameplay distance the keeper is ~100px tall and the original
    # 2-6 deg haul read as "alive" but never as HAULING (QA round 2).
    key(arm, int(0.20 * n), {
        "hips":  {"rot": [(X, 4.4)], "loc": (0, -0.040, -0.018)},
        "spine": {"rot": [(X, 4.8)]},
        "chest": {"rot": [(X, 7.4)]},
        "head":  {"rot": [(X, -4.0)]},          # chin holds on the line
        "upperarm.L": {"rot": [(X, 9.6)]},
        "upperarm.R": {"rot": [(X, 9.2)]},
        "forearm.L":  {"rot": [(X, 12.0)]},
        "forearm.R":  {"rot": [(X, 11.1)]},
    })
    # the release — hands give a little forward, torso follows
    key(arm, int(0.62 * n), {
        "hips":  {"rot": [(X, -1.5)], "loc": (0, 0.015, 0.007)},
        "spine": {"rot": [(X, -1.7)]},
        "chest": {"rot": [(X, -2.6)]},
        "head":  {"rot": [(X, 1.5)]},
        "upperarm.L": {"rot": [(X, -3.3)]},
        "upperarm.R": {"rot": [(X, -3.1)]},
        "forearm.L":  {"rot": [(X, -4.1)]},
        "forearm.R":  {"rot": [(X, -3.7)]},
    })
    key(arm, n, NEUTRAL)
    return act, 0, n


def stash(arm, act, start, end):
    """Park the action on its own NLA track so the glTF exporter finds it."""
    ad = arm.animation_data
    track = ad.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, int(start), act)
    strip.action_frame_start = start
    strip.action_frame_end = end
    track.mute = True
    ad.action = None
    return track


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = a.fps

    mesh = import_mesh(a.src)
    arm = build_armature()
    skin(mesh, arm)

    if not a.no_anim:
        for build in (build_idle, build_reel):
            act, s, e = build(arm, a.fps)
            stash(arm, act, s, e)
            print(f"[clip] {act.name} frames {s}..{e} ({(e - s) / a.fps:.2f}s)")
        clear_pose(arm)

    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(a.out),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=True,
        export_bake_animation=False,
        export_optimize_animation_size=False,
        export_apply=False,
    )
    print(f"[out] {a.out} ({os.path.getsize(a.out)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
