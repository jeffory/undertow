#!/usr/bin/env python3
"""keeper_retopo.py — retopologise a Tripo keeper GLB and bake its albedo down.

  blender --background --python tools/blender/keeper_retopo.py -- \
      --in assets/candidates/keeper-c.glb \
      --out /tmp/keeper-c-low.glb \
      --faces 60000 --res 2048 [--method collapse|voxel] \
      [--extrusion 0.03] [--ray-distance 0.06] [--margin 12]

Why a bake at all: the Tripo mesh is 501k tris with a single 2048 colour atlas
whose UV islands are per-region; any decimation collapses vertices across the
island seams and the texture smears into confetti. So we decimate a DUPLICATE,
re-unwrap it from scratch, and Cycles-bake the high mesh's DIFFUSE COLOR onto
the new UVs.

Known failure mode this script exists to avoid (a previous attempt in this repo
produced a black-with-speckles bake): the bake must run in CYCLES, the low mesh
must have a material whose Image Texture node is the ACTIVE node, the high mesh
must be selected with the low mesh ACTIVE, and max_ray_distance must be set —
left at 0 it is treated as infinite and rays that miss the surface pick up the
world background (black).
"""
import argparse, math, os, sys

import bpy


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--faces", type=int, default=60000)
    ap.add_argument("--res", type=int, default=2048)
    ap.add_argument("--method", default="voxel", choices=("collapse", "voxel"))
    ap.add_argument("--voxel", type=float, default=0.018)
    ap.add_argument("--adaptivity", type=float, default=0.0)
    ap.add_argument("--extrusion", type=float, default=0.03)
    ap.add_argument("--ray-distance", dest="ray", type=float, default=0.06)
    ap.add_argument("--margin", type=int, default=12)
    ap.add_argument("--samples", type=int, default=4)
    ap.add_argument("--uv-margin", dest="uv_margin", type=float, default=0.002)
    ap.add_argument("--angle", type=float, default=89.0)
    return ap.parse_args(argv)


def only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def tris(obj):
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


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


def retopo(high, a):
    """Duplicate the high mesh and cut it down to <= a.faces triangles."""
    only(high)
    bpy.ops.object.duplicate()
    low = bpy.context.object
    low.name = "keeper_low"

    if a.method == "voxel":
        # Voxel remesh gives uniform topology (good for skinning) but eats thin
        # features; follow it with a collapse pass to land on the tri budget.
        m = low.modifiers.new("remesh", "REMESH")
        m.mode = "VOXEL"
        m.voxel_size = a.voxel
        m.adaptivity = a.adaptivity
        bpy.ops.object.modifier_apply(modifier=m.name)
        print(f"[retopo] after voxel {a.voxel}: {tris(low)} tris")

    n = tris(low)
    if n > a.faces:
        d = low.modifiers.new("decimate", "DECIMATE")
        d.decimate_type = "COLLAPSE"
        d.ratio = a.faces / n
        bpy.ops.object.modifier_apply(modifier=d.name)
    # Smooth shading: the low mesh has to fake the high mesh's curvature.
    bpy.ops.object.shade_smooth()
    print(f"[retopo] low mesh: {tris(low)} tris ({len(low.data.vertices)} verts)")
    return low


def unwrap(low, a):
    only(low)
    # Drop the inherited Tripo UVs — they are meaningless after the collapse.
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(a.angle),
        island_margin=a.uv_margin,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[uv] smart-projected, {len(low.data.uv_layers)} layer(s)")


def bake_material(low, res, name="keeper_baked"):
    """Give the low mesh a fresh material whose ACTIVE node is the bake target."""
    img = bpy.data.images.new(name, width=res, height=res, alpha=False)
    # Non-Color, NOT sRGB. This Blender's OCIO config fails to load (see the
    # comment in keeper_review.py), so colour management is off: the source
    # atlas's sRGB bytes are handed to the shader undecoded. Tagging the bake
    # target sRGB would then re-encode them on save and the albedo comes back
    # washed out (measured: source median 98,78,56 -> baked 177,156,126).
    # Non-Color makes the bake a byte-for-byte passthrough, so the exported
    # texture matches the Tripo original and three's sRGB decode lands right.
    img.colorspace_settings.name = "Non-Color"
    # Mid-grey fill: a bake that silently does nothing then reads as flat grey
    # rather than black, which is much easier to spot in the verification render.
    img.generated_color = (0.5, 0.5, 0.5, 1.0)

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.75
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-400, 0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.nodes.active = tex   # <- the bake target
    tex.select = True

    low.data.materials.clear()
    low.data.materials.append(mat)
    return img


def bake(high, low, a):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = a.samples
    scn.cycles.use_denoising = False
    # A DIFFUSE/COLOR bake is unlit by definition, but pin the transforms anyway
    # so nothing in colour management touches the written pixels.
    try:
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.exposure = 0.0
        scn.view_settings.look = "None"
    except (TypeError, AttributeError):
        pass

    bs = scn.render.bake
    bs.use_selected_to_active = True
    bs.cage_extrusion = a.extrusion
    bs.max_ray_distance = a.ray   # 0 == infinite == rays that miss return black
    bs.use_cage = False
    bs.margin = a.margin
    try:
        bs.margin_type = "ADJACENT_FACES"
    except (TypeError, AttributeError):
        pass
    bs.use_clear = True

    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low   # active == bake TARGET

    print(f"[bake] extrusion={a.extrusion} ray={a.ray} margin={a.margin} res={a.res}")
    bpy.ops.object.bake(
        type="DIFFUSE",
        pass_filter={"COLOR"},
        use_selected_to_active=True,
        cage_extrusion=a.extrusion,
        max_ray_distance=a.ray,
        margin=a.margin,
        use_clear=True,
    )
    print("[bake] done")


def stats(img):
    """Cheap health check: how much of the bake is black / how varied is it."""
    px = list(img.pixels)
    n = len(px) // 4
    step = max(1, n // 200000)
    black = 0
    total = 0
    lo, hi = 1e9, -1e9
    acc = 0.0
    for i in range(0, n, step):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        v = (r + g + b) / 3.0
        if v < 0.004:
            black += 1
        lo = min(lo, v)
        hi = max(hi, v)
        acc += v
        total += 1
    print(f"[stats] sampled={total} black={black} ({100.0*black/total:.1f}%) "
          f"min={lo:.4f} max={hi:.4f} mean={acc/total:.4f}")
    return black / total


def main():
    a = parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)

    high = import_join(a.src, "keeper_high")
    print(f"[high] {tris(high)} tris")

    low = retopo(high, a)
    unwrap(low, a)
    img = bake_material(low, a.res)
    bake(high, low, a)

    png = os.path.splitext(a.out)[0] + "_albedo.png"
    img.filepath_raw = os.path.abspath(png)
    img.file_format = "PNG"
    img.save()
    print(f"[bake] wrote {png}")
    frac = stats(img)

    # Export the low mesh alone, with the texture packed into the GLB.
    img.pack()
    bpy.data.objects.remove(high, do_unlink=True)
    only(low)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(a.out),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_image_format="AUTO",
    )
    print(f"[out] {a.out} tris={tris(low)} blackfrac={frac:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
