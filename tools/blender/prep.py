#!/usr/bin/env python3
"""prep.py — headless Blender post-process for generated GLB assets.

Invoked as:
  blender --background --python tools/blender/prep.py -- \
      --in <src.glb> \
      --out public/assets/<name>.glb \
      --review assets/review/<name>.png \
      [--height H] [--faces N] [--saturate-hue 45,0.85 ...]

Steps, in order:
  1. Import the GLB.
  2. Normalize: root at feet-center with height along Blender +Z (Blender's
     up), uniform scale so the bounding height == --height. Because Blender's
     glTF exporter (export_yup) maps Blender Z -> glTF +Y, the exported GLB
     stands +Y-up with origin at the feet — exactly what three expects.
  3. Decimate PLANAR first (angle ~8-12deg — re-creates intentional flat
     facets per art direction), then COLLAPSE only if still over --faces.
  4. Albedo correction: load the baked base-color texture, apply an HSV
     adjustment (--saturate flag: multiply saturation, optionally shift hue
     toward a target), re-pack <= 1024px.
  5. Export the optimized GLB.
  6. Render a 2x2 contact sheet (front / back / three-quarter / top-down,
     neutral grey world, one cool key + warm fill) to --review.

Plain argparse; exits nonzero on any failure.
"""

import argparse
import os
import sys
import tempfile


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Post-process a generated GLB for UNDERTOW")
    ap.add_argument("--in", dest="src", required=True, help="source .glb")
    ap.add_argument("--out", required=True, help="optimized output .glb")
    ap.add_argument("--review", required=True, help="contact-sheet PNG path")
    ap.add_argument("--height", type=float, default=1.8, help="target bounding height in m")
    ap.add_argument("--faces", type=int, default=5000, help="max face (triangle) budget")
    ap.add_argument(
        "--bake-decimate",
        type=int,
        default=0,
        help="Decimate heavy textured meshes WITHOUT scrambling their textures: "
        "duplicate the mesh, COLLAPSE the COPY to N faces, Smart UV Project it, "
        "bake DIFFUSE (color only) from the ORIGINAL onto the COPY, assign the "
        "baked image as baseColor, delete the original. 0 disables (falls back "
        "to in-place --faces decimation for untextured meshes).",
    )
    ap.add_argument("--yaw", type=float, default=0.0, help="spin about vertical axis (deg) to fix facing")
    ap.add_argument(
        "--planar-angle",
        type=float,
        default=10.0,
        help="PLANAR/DISSOLVE decimation angle in degrees (8-12 typical); "
        "re-creates intentional flat facets per art direction.",
    )
    ap.add_argument(
        "--saturate-hue",
        default="",
        help="HSV adjustment on the base-color texture, "
        "'hue_shift,saturation_mult[,value_mult]'. e.g. '4,1.6,1.1' shifts hue "
        "+4deg, multiplies saturation by 1.6 and value by 1.1.",
    )
    return ap.parse_args(argv)


def ensure_no_geometry_nodes(obj):
    # Remove any modifier stack that could fight the decimate/save (e.g. GN)
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)


def mesh_vertices(obj):
    """Read the object's mesh vertex positions as a (N,3) numpy array."""
    import numpy as np

    me = obj.data
    n = len(me.vertices)
    if n == 0:
        raise RuntimeError("mesh has no vertices")
    pts = np.zeros((n, 3), dtype=np.float64)
    me.vertices.foreach_get("co", pts.ravel())
    return pts


def normalize(obj, target_height, yaw_deg=0.0):
    """Root the asset at feet-center with height along +Z (Blender's up).

    Blender's glTF exporter (export_yup=True) maps Blender Z -> glTF +Y, so an
    asset standing along Blender +Z with its feet at the origin exports as a
    GLB standing along +Y with origin at the feet — exactly what three expects.
    """
    import numpy as np

    # Ensure single user (GLB import may share data).
    obj.data = obj.data.copy()

    # Flatten any inherited transforms into the mesh so we re-root cleanly.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # NO axis rotation: Blender's glTF importer already converts the source's
    # Y-up to Blender Z-up, so a correct Tripo GLB imports standing on +Z and
    # the Y-up exporter round-trips it. (A forced -90deg X roll here was the
    # bug that shipped every asset lying on its back.) Optional --yaw only
    # spins the asset about the vertical axis to fix its facing.
    if abs(yaw_deg) > 1e-6:
        bpy.ops.transform.rotate(value=np.radians(yaw_deg), orient_axis="Z")
        bpy.ops.object.transform_apply(rotation=True)

    pts = mesh_vertices(obj)
    zmin, zmax = pts[:, 2].min(), pts[:, 2].max()
    height = zmax - zmin
    if height <= 1e-6:
        raise RuntimeError("asset has zero height; cannot normalize")

    # Uniform scale so bounding height == target_height.
    s = target_height / height
    bpy.ops.transform.resize(value=(s, s, s))
    bpy.ops.object.transform_apply(scale=True)

    # Shift feet-center to the origin: center X and depth (Y), put min Z at 0.
    pts = mesh_vertices(obj)
    cx = (pts[:, 0].min() + pts[:, 0].max()) / 2
    cy = (pts[:, 1].min() + pts[:, 1].max()) / 2
    zmin = pts[:, 2].min()
    bpy.ops.transform.translate(value=(-cx, -cy, -zmin))
    bpy.ops.object.transform_apply(location=True)
    bpy.context.view_layer.update()

    return height, s


def decimate(obj, max_faces, planar_angle):
    """Planar collapse first (keeps intentional flat facets), then COLLAPSE.

    PLANAR/DISSOLVE runs with delimit={'UV'} so UV island boundaries are never
    dissolved — this preserves the baked texture islands and stops the keeper's
    coat from sampling neighbouring (pants) texels as a scrambled camo. COLLAPSE
    is only a fallback if PLANAR alone can't reach the budget.
    """
    if max_faces <= 0:
        return

    if count_tris(obj) <= max_faces:
        return  # already under budget

    # PLANAR: dissolve coplanar facets to reconstruct intentional flat planes
    # (Blender 5.x renamed Decimate.mode -> decimate_type; planar == DISSOLVE).
    # angle_limit is in RADIANS for DISSOLVE mode, so convert from degrees.
    import math

    plan = obj.modifiers.new("planar", "DECIMATE")
    plan.decimate_type = "DISSOLVE"
    plan.angle_limit = math.radians(planar_angle)
    plan.delimit = {"UV"}  # preserve UV island boundaries
    bpy.context.view_layer.update()

    after = count_tris(obj)
    if after <= max_faces:
        # PLANAR alone got us under budget — bake it and stop.
        apply_modifiers(obj)
        print(f"[prep] PLANAR dissolved {after} tris (<= {max_faces}); final triangle count: {count_tris(obj)}")
        return

    # COLLAPSE to reach the budget (only if still over after planar).
    apply_modifiers(obj)
    coll = obj.modifiers.new("collapse", "DECIMATE")
    coll.decimate_type = "COLLAPSE"
    coll.ratio = max(0.01, max_faces / after)
    bpy.context.view_layer.update()
    apply_modifiers(obj)

    print(f"[prep] PLANAR->{after} tris, COLLAPSE to budget; final triangle count: {count_tris(obj)}")


def bake_decimate(obj, max_faces):
    """Bake-based decimation for heavy textured Tripo meshes.

    In-place decimation collapses vertices, which drags neighbouring texture
    islands across each other and scrambles Tripo's hand-painted textures. The
    clean recipe is to re-make the UVs and re-sample the colour:
      1. Duplicate the mesh; the COPY is decimated to --bake-decimate (COLLAPSE).
      2. Smart UV Project the copy so its triangles get fresh, non-overlapping
         UV islands (in-place UVs are garbage after vertex collapse).
      3. Bake DIFFUSE (COLOR only — no direct/indirect light) from the ORIGINAL
         (selected) onto the COPY (active) with a small cage extrusion so the
         ray-cast reaches the original surface.
      4. Assign the baked image as the copy's baseColor, delete the original.
    """
    import math

    # Ensure single user so the duplicate is truly independent.
    obj.data = obj.data.copy()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.duplicate()
    copy = bpy.context.object  # the duplicate becomes the active object

    # 1. Decimate the COPY (COLLAPSE only — planar would fight the re-UV).
    if count_tris(copy) > max_faces:
        coll = copy.modifiers.new("bakedec", "DECIMATE")
        coll.decimate_type = "COLLAPSE"
        coll.ratio = max(0.01, max_faces / count_tris(copy))
        bpy.context.view_layer.update()
        apply_modifiers(copy)  # applies + triangulates (preserves UVs after we set them)
    print(f"[prep] bake-decimate: copy at {count_tris(copy)} tris (budget {max_faces})")

    # 2. Smart UV Project the copy so its triangles map cleanly to the new atlas.
    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    bpy.context.view_layer.objects.active = copy
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02, angle_limit=math.radians(66))
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    # 3. Give the copy an INDEPENDENT material. The exporter only embeds textures
    #    that hang off the original material's node structure (a brand-new material
    #    is silently dropped in this build), so we COPY the original material and
    #    later just repoint its base-color node at the baked image.
    import PIL.Image
    import numpy as np

    if copy.data.materials:
        orig_mat = copy.data.materials[0]
        copy.data.materials.clear()
        mat = orig_mat.copy()
        mat.name = (orig_mat.name or "mat") + "_baked"
        copy.data.materials.append(mat)
    else:
        mat = bpy.data.materials.new("baked_mat")
        mat.use_nodes = True
    nt = mat.node_tree
    # next() needs an explicit default: without it a material with no Principled
    # node raises StopIteration and the fallback below is dead code.
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

    # The base-color TEX_IMAGE node (present in Tripo materials: Color -> Base Color).
    color_node = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == "Base Color" and l.from_node.type == "TEX_IMAGE":
            color_node = l.from_node
            break
    if color_node is None:
        color_node = nt.nodes.new("ShaderNodeTexImage")

    # 4. New 1024 bake-target image, wired as the copy's base color (bake target).
    img = bpy.data.images.new("baked_diffuse", width=1024, height=1024, alpha=True)
    bake_tex = nt.nodes.new("ShaderNodeTexImage")
    bake_tex.image = img
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name == "Base Color":
            nt.links.remove(l)
    nt.links.new(bake_tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.nodes.active = bake_tex
    nt.nodes.update()

    # 5. Bake DIFFUSE (COLOR only) from ORIGINAL (selected) onto COPY (active).
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    copy.select_set(True)
    bpy.context.view_layer.objects.active = copy  # bake TARGET = active
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 8  # albedo needs no denoising; fast
    scn.render.bake.margin = 4
    scn.render.bake.use_pass_direct = False
    scn.render.bake.use_pass_indirect = False
    bpy.ops.object.bake(
        type="DIFFUSE",
        pass_filter={"COLOR"},
        use_selected_to_active=True,
        cage_extrusion=0.02,
    )

    # 6. The bake lives in an internal buffer; save it to a real JPEG and reload
    #    it so the glTF exporter's passthrough path embeds it (an internal or
    #    brand-new image is dropped in this build). Repoint the base-color node.
    tmp_jpg = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".prep_bake_tmp.jpg")
    w, h = img.size[:2]
    # img.pixels holds LINEAR (scene-referred) values. glTF baseColor textures are
    # sRGB, so convert linear -> sRGB before writing the JPEG, or the bytes read
    # far too dark once three.js decodes them as sRGB (matches the hand-painted
    # Tripo textures, which are already sRGB).
    def linear_to_srgb(v):
        return np.where(
            v <= 0.0031308,
            12.92 * v,
            1.055 * np.power(np.clip(v, 0, 1), 1.0 / 2.4) - 0.055,
        )

    px = np.array(img.pixels[: w * h * 4], dtype=np.float32).reshape(h, w, 4)
    srgb = linear_to_srgb(np.clip(px[..., :3], 0, 1))
    alpha = np.clip(px[..., 3], 0, 1)[..., None]
    rgb = np.concatenate([srgb, alpha], axis=-1)
    PIL.Image.fromarray((rgb * 255).astype("uint8"), "RGBA").convert("RGB").save(
        tmp_jpg, quality=92
    )
    baked = bpy.data.images.load(tmp_jpg)
    baked.name = "baked_diffuse_file"
    color_node.image = baked
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name == "Base Color":
            nt.links.remove(l)
    nt.links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
    nt.nodes.active = color_node
    nt.nodes.update()

    # 7. Delete the original; keep the baked copy.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.delete()
    bpy.context.view_layer.update()
    print(f"[prep] bake-decimate: final triangle count {count_tris(copy)}")
    return copy


def count_tris(obj):
    """Count the triangulated face count of an object's current mesh.

    Dissolve decimation leaves ngons; the GLTF export triangulates them, so the
    render-relevant triangle count is sum over faces of (len(verts) - 2).
    """
    import bmesh

    deps = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(deps)
    me = obj_eval.to_mesh()
    try:
        bm = bmesh.new()
        bm.from_mesh(me)
        total = sum(max(0, len(f.verts) - 2) for f in bm.faces)
        bm.free()
    finally:
        obj_eval.to_mesh_clear()
    return total


def apply_modifiers(obj):
    # Bake modifiers into the mesh using the canonical operator, so the result
    # is a proper original mesh (handles evaluated-data/ngon cases robustly).
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    # Triangulate so the exported GLTF tri count is exactly the face count and
    # matches the budget the caller measured (ngons -> triangles).
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    return obj


def albedo_correct(obj, hue_shift, sat_mult, val_mult=None):
    """Apply HSV to the baked base-color texture; re-pack <=1024px."""
    import PIL.Image
    import numpy as np

    if hue_shift is None and sat_mult is None and val_mult is None:
        return

    tmp_png = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".prep_albedo_tmp.png")

    def process(img):
        w = img.size[0]
        h = img.size[1]
        if w <= 0 or h <= 0:
            return
        if not img.pixels:
            return
        # cap at 1024
        if max(w, h) > 1024:
            scale = 1024 / max(w, h)
            nw = max(1, int(round(w * scale)))
            nh = max(1, int(round(h * scale)))
        else:
            nw, nh = w, h

        px = np.array(img.pixels[: w * h * 4], dtype=np.float32).reshape(h, w, 4)
        arr = np.ascontiguousarray(px)
        pil = PIL.Image.fromarray((arr * 255).astype("uint8"), "RGBA")
        if (nw, nh) != (w, h):
            pil = pil.resize((nw, nh), PIL.Image.LANCZOS)

        if sat_mult is not None or hue_shift is not None or val_mult is not None:
            hsv = np.asarray(pil.convert("HSV"), dtype=np.float32)
            if sat_mult is not None:
                hsv[..., 1] = np.clip(hsv[..., 1] * sat_mult, 0, 255)
            if hue_shift is not None:
                hsv[..., 0] = (hsv[..., 0] + hue_shift) % 256
            if val_mult is not None:
                hsv[..., 2] = np.clip(hsv[..., 2] * val_mult, 0, 255)
            rgb = PIL.Image.fromarray(hsv.astype("uint8"), "HSV").convert("RGB")
            out = rgb.convert("RGBA")
            out.putalpha(pil.getchannel("A"))
            pil = out

        pil.save(tmp_png, format="PNG")
        new = bpy.data.images.load(tmp_png)  # loaded from a real path for glTF export
        new.name = "albedo_corrected"
        return new

    def base_color_image(mat):
        # The image driving the Principled BSDF's Base Color socket.
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            # fall back to the first image named Color* (tripo convention)
            for n in nt.nodes:
                if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("Color"):
                    return n
            return None
        for link in nt.links:
            if link.to_node == bsdf and link.to_socket.name == "Base Color":
                if link.from_node.type == "TEX_IMAGE" and link.from_node.image:
                    return link.from_node
                # skip colour-space / mix nodes by following the chain
                n = link.from_node
                for _ in range(4):
                    if n.type == "TEX_IMAGE" and n.image:
                        return n
                    up = next((l for l in nt.links if l.to_node == n and l.to_socket.name == "Color"), None)
                    if up is None:
                        return None
                    n = up.from_node
        return None

    for mat in obj.data.materials:
        if not mat or not mat.node_tree:
            continue
        node = base_color_image(mat)
        if node is None:
            continue
        fixed = process(node.image)
        if fixed is not None:
            node.image = fixed


def export_glb(obj, out_path):
    if bpy.context.scene.unit_settings.system != "METRIC":
        bpy.context.scene.unit_settings.system = "METRIC"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Select only our object
    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_apply=True,
    )


def render_contact_sheet(obj, out_path):
    """2x2 sheet: front / back / three-quarter / top-down on a neutral grey stage."""
    import bpy as _b  # noqa

    scn = bpy.context.scene
    # Neutral grey world + cool key + warm fill to mimic the game's light pair.
    scn.world = bpy.data.worlds.new("review_world")
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.35, 0.35, 0.38, 1.0)

    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    cam.data.lens = 50
    scn.camera = cam

    # key + fill lights
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 0))
    sun = bpy.context.object
    sun.data.energy = 2.0
    sun.data.color = (0.55, 0.6, 0.95)  # cool key
    sun.rotation_euler = (0.9, 0.2, -0.5)

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 0))
    fill = bpy.context.object
    fill.data.energy = 1.0
    fill.data.color = (1.0, 0.75, 0.5)  # warm fill
    fill.rotation_euler = (-0.6, 0.1, 2.4)

    # stage
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -0.001))
    stage = bpy.context.object
    smat = bpy.data.materials.new("stage_mat")
    smat.use_nodes = True
    smat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.22, 0.22, 0.24, 1)
    stage.data.materials.append(smat)

    # center the camera on the object's base
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    import mathutils
    import math

    # Frame each view on the object's true world bounding box (the object is
    # upright along +Z after normalize, so the old Y-extent framing was wrong
    # and pushed two views half out of frame). We center on the bbox centroid
    # and pick the camera distance from the bounding-sphere radius so the whole
    # subject fits with ~15% margin.
    bbox = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    center = mathutils.Vector((0.0, 0.0, 0.0))
    for v in bbox:
        center += v
    center /= len(bbox)
    radius = max((v - center).length for v in bbox)

    # vertical FOV from a 50mm lens on a square sensor (36mm) — the contact
    # sheet renders 512x512 so the sensor is square.
    fov_y = 2.0 * math.atan((36.0 / 2.0) / 50.0)
    margin = 1.15  # 15% margin so the subject sits comfortably inside the frame
    dist = (radius / math.tan(fov_y / 2.0)) * margin

    # 4 distinct standard views of an upright (height along +Z) object: front,
    # back, three-quarter, and top-down. Each `look` is a unit-ish direction the
    # camera sits in relative to the centroid; the camera then tracks the centre.
    views = [
        ("front", (1.0, 0.0, 0.25)),
        ("back", (-1.0, 0.0, 0.25)),
        ("threeq", (0.7, 0.7, 0.3)),
        ("top", (0.0, 0.0, 1.0)),
    ]

    # Per-PROCESS scratch dir for the four cells: a batch round preps several
    # assets at once (eight buildings, task t20), and the shared /tmp path had
    # the parallel runs overwriting each other's cells — contact sheets that
    # showed four different assets. The pid keeps each run's cells its own.
    cell_dir = os.path.join(tempfile.gettempdir(), f"prep_cells_{os.getpid()}")
    os.makedirs(cell_dir, exist_ok=True)

    cell = 0
    for name, look in views:
        lookv = mathutils.Vector(look).normalized()
        cam.location = center + lookv * dist
        # point camera at center
        direction = center - cam.location
        rot = direction.to_track_quat("-Z", "Y")
        cam.rotation_euler = rot.to_euler()

        # render at position in a 2x2 grid
        sx = 0 if cell % 2 == 0 else 1
        sy = 0 if cell < 2 else 1
        # use a compositor-free approach: render full then crop via image offset
        scn.render.image_settings.file_format = "PNG"
        scn.render.resolution_x = 512
        scn.render.resolution_y = 512
        scn.render.filepath = os.path.join(cell_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        cell += 1

    # assemble the 2x2 grid with PIL
    import PIL.Image as PImage

    cells = []
    for name, _ in views:
        p = os.path.join(cell_dir, f"{name}.png")
        cells.append(PImage.open(p).convert("RGBA"))
    sheet = PImage.new("RGBA", (1024, 1024))
    sheet.paste(cells[0], (0, 0))
    sheet.paste(cells[1], (512, 0))
    sheet.paste(cells[2], (0, 512))
    sheet.paste(cells[3], (512, 512))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path)
    print(f"[prep] contact sheet written: {out_path}")


def main():
    import bpy as _b  # noqa - module-level bpy available after import

    args = parse_args(sys.argv[sys.argv.index("--") + 1:])

    if not os.path.exists(args.src):
        print(f"error: source not found: {args.src}", file=sys.stderr)
        return 2

    hue_shift = None
    sat_mult = None
    val_mult = None
    if args.saturate_hue:
        parts = [p.strip() for p in args.saturate_hue.split(",")]
        if len(parts) >= 1:
            try:
                hue_shift = float(parts[0])
                if len(parts) >= 2:
                    sat_mult = float(parts[1])
                if len(parts) >= 3:
                    val_mult = float(parts[2])
            except ValueError:
                print(f"error: bad --saturate-hue '{args.saturate_hue}'", file=sys.stderr)
                return 2

    try:
        # fresh scene
        bpy.ops.wm.read_factory_settings(use_empty=True)

        # import GLB
        bpy.ops.import_scene.gltf(filepath=args.src)
        objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        if not objs:
            print("error: no mesh found in GLB", file=sys.stderr)
            return 2
        # combine all meshes into one (keeper GLBs are a single mesh, but be safe)
        if len(objs) > 1:
            bpy.context.view_layer.objects.active = objs[0]
            for o in objs[1:]:
                o.select_set(True)
            objs[0].select_set(True)
            bpy.ops.object.join()
        obj = bpy.context.object

        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        orig_height, scale = normalize(obj, args.height, yaw_deg=args.yaw)
        print(f"[prep] normalized: original height {orig_height:.3f} -> {args.height} (scale {scale:.4f})")

        ensure_no_geometry_nodes(obj)
        if args.bake_decimate > 0:
            # Bake-based decimation: re-UV + re-bake albedo so Tripo textures stay
            # clean. Produces the final albedo in the bake — no --saturate-hue here.
            obj = bake_decimate(obj, args.bake_decimate)
        else:
            decimate(obj, args.faces, planar_angle=args.planar_angle)
            albedo_correct(obj, hue_shift, sat_mult, val_mult)

        export_glb(obj, args.out)
        print(f"[prep] exported: {args.out}")

        render_contact_sheet(obj, args.review)
        print("[prep] done")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import bpy
    sys.exit(main())
