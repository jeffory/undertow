# 07 — Asset Pipeline (supersedes "no assets")

**Decision (2026-08-25):** the spec §8's "no sprites, no assets" rule is
superseded. The target is now the polish level of the concept art in
`docs/concepts/images/` — painterly low-poly with generated 3D assets, not
bare procedural primitives. Procedural systems remain the *animation and
variation* engine; generation replaces hand-modeling, not the design.

## The art bible

`docs/concepts/images/` is authoritative for look and palette:

- **Water/world:** faceted low-poly dark-teal water, near-black base, white
  foam facets on disturbance crowns; fog swallows distance; lighthouse
  silhouette recurring in the background.
- **Light:** one cool moon + warm lantern pools; the lighthouse beam.
  Warm-vs-cool is the composition engine of every frame.
- **The keeper:** yellow raincoat + rain hat — the game's single strongest
  color accent. Player-character priority asset.
- **The line:** glowing green at rest → red under tension (boat concept).
  The line render stays procedural (02's Bézier) — never a mesh asset.
- **Creatures:** pale drowned-flesh limbs, teal fish bodies, wet drip;
  low-poly facets with painterly texture.
- **UI:** minimal framed corner chips (hook, lantern, bait icons), grungy
  health bars. Diegetic where possible.

## Toolchain

1. **Generate — `tools/tripo.py`** (Tripo3D API; key configured; ~3–5 min
   per asset; balance was 1,230 credits at adoption):
   - `uv run tools/tripo.py text "<prompt>" --out assets/generated/<name> --face-limit N`
   - `uv run tools/tripo.py image <ref.png> ...` — use tight crops of the
     concept images as refs where a concept exists (better style lock than
     text). Downloads GLB.
   - Style phrases that match the bible: "low-poly stylized", "painterly
     hand-painted texture", "dark muted palette", "game asset".
2. **Post-process — Blender headless** (Blender 5.2 LTS installed):
   `blender --background --python tools/blender/<script>.py -- <args>`.
   Standard pass (`tools/blender/prep.py`, to be written with the first
   batch): import GLB → normalize scale/origin/+Z-forward → decimate to the
   face budget → limit textures to ≤1K → re-export optimized GLB to
   `public/assets/<name>.glb` → render a 4-angle turntable contact sheet
   PNG to `assets/review/<name>.png` for approval.
3. **Load — three GLTFLoader** in `src/render/assets.ts` (to be written):
   async manifest-driven loading, `assets/manifest.json` maps asset id →
   file + budget metadata. Render modules swap primitives for loaded assets
   when available (primitive stays as the fallback while loading).

## Approval loop (required for every asset)

1. Worker generates + post-processes + produces the contact sheet AND an
   in-engine screenshot (the asset lit by the game's moon/lantern/fog —
   assets that pass on the pedestal routinely fail in the fog).
2. **Claude (orchestrator) visually approves** against the art bible: shape
   silhouette, palette match, facet scale, tri budget. Rejected assets get
   a revised prompt/ref, not manual fixing, unless the fix is a blender
   one-liner (tint, decimate harder).
3. Borderline calls: second opinion from an **`agy` worker** (Antigravity,
   strong visual model) via `wt delegate agy` — show it the contact sheet +
   the relevant concept and ask for a match/mismatch verdict with reasons.
4. Approved assets get a line in `assets/manifest.json` and their review
   sheet stays in `assets/review/` (gitignore the raw `assets/generated/`
   intermediates; commit optimized `public/assets/` + review sheets).

## What is generated vs what stays procedural

| Thing | Source | Why |
|---|---|---|
| Keeper (player) | Tripo (concept-ref) | Signature asset; yellow raincoat |
| Rowboat, lighthouse, jetty, bell buoy, dock props | Tripo | Static hero props, all in concepts |
| Islets/rocks | Tripo set of 3–5 + scatter | Reused, instanced |
| Town buildings (M5) | Tripo, one per building | Static, restored-state variants via tint/decoration toggles |
| **Catches/fish bodies** | **Procedural FishParams rig (04)** | The 60-species parameterized variation + wrongness lerp is the design's crown jewel; a mesh per species defeats it |
| Hero creatures (bosses, Bagman, Crawler) | Hybrid: Tripo mesh → Blender armature along the spine → procedural sine-spine bones drive it in-engine | Concept-quality body, procedural motion |
| Water, line, fog, light, post | Procedural (M0 systems) | Already matches concepts |
| Audio | Tone.js (spec §11, unchanged) | — |

The hybrid creature path is staged: **A** static props first (validate the
pipeline), **B** rigged keeper (idle/walk), **C** one hybrid creature
(Crawler, from its concept) before committing the bosses to it.

## Budget amendments (spec §8.3)

- Draw calls: **≤150 unchanged** (instance repeated props).
- Triangles: raised **≤60k → ≤120k** typical scene (generated assets at
  `--face-limit` 2–8k each; hero assets ≤15k).
- Textures: now allowed, **≤1K per asset, total texture memory ≤64MB**;
  vertex-color-only remains the rule for procedural geometry.
- Bundle: models are static-hosted GLBs loaded async — first-paint stays
  asset-free (procedural fallbacks), so initial-load budget is unchanged.
- 60fps integrated-GPU target unchanged; the smoke test still gates boot.

## Milestone impact

- **M1.5 (new, next):** pipeline validation — keeper + rowboat + lighthouse
  + 3 rocks through generate→prep→approve→load; `src/render/assets.ts`;
  swap-in for the M0/M1 scene. Gate: in-engine screenshot approved against
  the tether-combat concept.
- **M2:** unchanged (tether feel is mesh-agnostic) but the gate screenshots
  now use the polished scene.
- **M4:** FishParams rig unchanged; add the staged hybrid-creature
  experiment for the Crawler alongside it.
- **M5+:** buildings/props flow through this pipeline per zone.
