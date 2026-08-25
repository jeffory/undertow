# 08 — Polish, Shell & Presentation (added 2026-08-25)

The game shell around the game: everything a player touches before, after,
and around a run. Companion to 07-assets.md's visual polish. These are
production items — none gate the M2 fun-or-dead checkpoint, but the title
flow and options land early (M2.5) because every playtest after that starts
through them.

## 1. Title screen (M2.5)

- The live M0 scene IS the title background: slow drift over the night
  lake, lighthouse beam sweeping, fog. No separate art. The game boots to
  attract mode; starting a run rows out of it.
- Title treatment: "UNDERTOW" in a weathered serif (embedded font subset),
  bone-teal with a slow caustic shimmer; menu = New Run / Continue /
  Options / Credits, styled like the Office's municipal paperwork (stamped,
  water-stained) — the UI voice of the game.
- Menu is DOM overlay (like the HUD), not in-canvas — accessibility and
  text rendering for free.

## 2. Opening story (M2.5, text only)

- First run only (skippable, re-viewable from Options): 4–6 title cards of
  text over the drifting lake — the flood, the choice, the light kept on,
  the thing that reflected back. Written in the bottle-note municipal
  register where possible; ends on the first NOTICE OF ELIGIBILITY.
- Delivery: DOM overlay, slow fade per card, click/key to advance. State
  in the save (`introSeen`).

## 3. Options menu (M2.5, DOM overlay; persisted in the save)

- **Graphics:** render scale (0.5–1.0), pixel-ratio cap, fog density
  scale, post effects on/off (vignette/CA), screen-tilt on/off
  (accessibility — spec §8.1's dread tilt), damage/hit flash intensity.
  Presets: Potato / Default / Nice, mapping to the above.
- **Audio (lands with M11 audio):** master / drone / SFX / heartbeat
  sliders; "reduce drone" accessibility toggle.
- **Controls:** rebindable keys (input.ts already centralizes mapping),
  mouse-sensitivity, hold-vs-toggle for reel stance (spec §4.1 RMB).
- **Gameplay/accessibility:** screen-shake scale, telegraph duration
  scale (+0–50%), colorblind-safe tension palette (the green→white→red
  line ramp gets a shape/brightness channel too — line thickens toward
  snap), text size.
- Settings schema versioned with zod alongside the save (03's IndexedDB).

## 4. README (now — ships with the repo)

`README.md` at the repo root: elevator pitch (one-line + signature
mechanic), a concept-art hero image, current status (milestone table with
checkmarks), quickstart (`npm i && npm run dev`), controls table, test
commands (`npm test`, `npm run smoke`), architecture summary (ECS-lite,
procedural + generated assets pipeline), docs map (plan.md, docs/plan/*),
and credits/tooling notes (Three.js, Tripo3D, Blender, Tone.js).
Update the milestone table at every milestone gate.

## 5. Diegetic HUD pass (M3, alongside the run loop)

Replace debug-style bars with the concept UI language (see
`docs/concepts/images/` corner chips): framed hook/lantern/bait chips,
grungy stamina/hp strips, tension as the line itself + a bowed creak (§11).
Damage numbers off by default (option to enable).

## 6. Feel polish backlog (attach to the milestone that owns each system)

- **M1/M2 combat feel:** hit-stop (~40ms on gaff contact), camera nudge on
  heavy, drag-event camera shake (scaled by option), splash/foam particles
  on lunges and landings, fish wet-slap decal on the deck.
- **M0/M3 world feel:** beam sweep audio-visual sync, firefly motes in the
  lantern radius, rain state on high Dread (cheap streak particles),
  night-clock sky gradient keyframes (§3.2 phases visibly distinct).
- **Transitions:** row-out from the hub = the camera pull that becomes the
  run (no loading screen — it's one scene); death = cut to black + Office
  condolence letter as the death screen; extraction = bell toll + fade.
- **Performance polish:** asset LODs from the prep script (--faces at two
  levels), draw-call audit at each milestone gate.

## 7. Sequencing

| When | Items |
|---|---|
| Now | README; polish backlog logged here |
| M2.5 (after tether gate) | Title screen, opening story, options + graphics settings |
| M3 | Diegetic HUD, death/extraction presentation |
| M11 (audio) | Audio options wired |
| Each milestone | Its feel-polish items from §6 |

Rationale for M2.5: the tether gate (M2) must be judged on raw feel with
debug UI; wrapping the game in its shell right after means every
subsequent playtest exercises the real player journey.
