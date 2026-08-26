# QA Issues — root-cause pass, 2026-08-26

Hand-off document for the orchestrator. Complements `TODO.md` (the art-director
symptom review); this doc is the **root-cause + process** pass behind it.

Every finding below is confirmed against source, with file:line and numbers.
Ordered by leverage: **T1 and T2 likely resolve a large fraction of `TODO.md`'s
CRITICAL/HIGH items as side effects.** Do not dispatch the `TODO.md` items
individually until T1 has landed and the art-director pass has been re-run.

---

## 0. Headline

The visuals are not behind because of insufficient iteration. Two structural
causes:

1. **The gameplay camera cannot show the art direction.** Most of `TODO.md`'s
   critical items are symptoms of this, not independent defects.
2. **The QA harness reviews components, never composed frames, and asserts
   nothing objective about images.** Three of the five reported bugs are
   invisible to screenshot review by construction and belong in unit tests.

External corroboration: agents score ~51% on gameplay-logic tasks vs ~33% on
graphics tasks (GameDevBench, arXiv 2602.11103v2); adding visual feedback moved
one model 41%→52%. Our logic layer is healthy; the visual layer is exactly where
the literature predicts an agent fleet stalls without a frame-level target.

---

## 1. ROOT CAUSE — gameplay camera angle

**`src/render/renderer.ts:113-116`**

```
c.position.z += (tz + 12 - c.position.z) * lerp;
c.position.y = 14;
```

- Shipped camera: **49° above the waterline** (atan(14/12)), ~18.4 m from subject.
- Concept art (`docs/concepts/images/night_boat_combat_1787661324075.jpg`,
  `tether_combat_gameplay_1787661298454.jpg`): **~12–18°**, near wave height.

### Cascading symptoms (all currently filed as separate defects)

| Symptom | Why the camera causes it |
|---|---|
| "Water is a flat pale gradient, no wave facets" (`TODO.md` CRITICAL) | At 49° you see the plane's *shading*, not its *shape*. The Gerstner sum in `core/waves.ts` is correct and is physically unobservable from this angle. Crest-occludes-trough is the entire read of the concept water. |
| "Fog is missing" | Fog exists (`src/render/sky.ts:189`, `FogExp2` density `0.016`). At the boat's 18.4 m camera distance it contributes **8.3%**. It only reaches ~60% at 60 m — and a 49° camera never looks at anything 60 m away. |
| "No horizon / flat dark grey void" (`TODO.md` HIGH) | A downward camera has no horizon line. There is nowhere for the sky gradient, fog band, or lighthouse beam to be seen. |
| Low contrast / "everything reads mid-grey" | Concept value structure: water is the **darkest** element (~`#0a0e12`), foam the **brightest**, ~3% of pixels carrying the contrast. Ours: water is mid-value and lighter than the boat. Top-down light hits every wave face identically; grazing light does not. |
| "Diorama / toy scale" | Concept boat fills ~40% of frame; ours ~4%. |

**Do T1 before any further water, sky, or fog work.** It changes what every
downstream visual judgement means.

---

## 2. CONFIRMED BUGS

### B1 — Water renders over the top of every islet
**Not a shader bug. A constants mismatch between two independently-developed files.**

| Quantity | Source | Value |
|---|---|---|
| `WAVE_MAX_HEIGHT` (Σ amplitudes) | `src/core/waves.ts:34` | **1.23 m** |
| `GROUND_Y` (islet shoreline) | `src/render/lake.ts:35` | 0.25 m |
| `ISLET_RISE_MIN/MAX` | `src/gen/isletHeight.ts:22-23` | 0.35 / 0.85 m |
| Tallest islet peak (`GROUND_Y + RISE_MAX`) | derived | 1.10 m |

- Crests clear the shoreline by **0.98 m**.
- Crests clear **the tallest islet peak in the game** by **0.13 m**.

Compounding: `src/render/water.ts` has **no shoreline or depth attenuation of any
kind** — the only `atten` term in the file (`water.ts:119-123`) is lantern
falloff. Standard stylized-water practice is a depth-difference mask that both
flattens wave amplitude toward shore and drives edge foam. Adding it fixes the
overflow **and** delivers the "sharp white foam at the waterline" bar in
`TODO.md` CRITICAL. Ref: Cyanilux shoreline shader breakdown.

### B2 — No collision on floating objects
- `src/core/collision.ts` is **foot-only** walkable-polygon collision.
- `src/game/boatPhysics.ts` contains **zero** obstacle terms — no islet, wreck,
  or buoy interaction.
- Wrecks and buoys (`src/render/lake.ts`) are render-only markers with no sim
  representation for collision purposes.

The boat can drive through every solid object in the world.

### B3 — Boat wake reads as a shimmer stuck to the stern
**`src/game/boat.ts:33, 179, 227-229, 302-311`**

The wake is `THREE.Points` **parented to the boat group**. It therefore
translates and yaws *with* the hull. A wake parented to the emitter cannot read
as a wake under any tuning — it must be emitted into **world space** and decay
in place. Current code only pulses `PointsMaterial.opacity` against
`wakeClock` and `b.speed`, which is why it reads as flicker rather than trail.

Note: `src/render/ripples.ts` is the **disturbance/bite telegraph**, not the
wake. That file is fine and is not implicated in this report.

### B4 — Fog
Not a bug. See §1 — fog is correctly implemented and structurally unobservable
at the current camera angle. Expect it to appear on its own after T1. Re-verify
before doing any fog tuning work.

---

## 3. PROCESS GAPS (why QA missed these)

The harness (`docs/plan/06-testing.md`: unit → smoke → manual gates) is sound and
better than typical. Three holes, each mapping directly onto the findings above.

### P1 — We review assets, never frames
`tools/` contains `water-v2..v5`, `sweep-*`, `keeper-*`, `line-v2..v4`,
`fish-mid-*` — every artifact is one **component in isolation**. Concept art is
not a component; it is a **frame**: camera + composition + value range + lighting
*together*. Optimising components separately does not converge on a frame. This
is the mechanism behind §1 going unnoticed through five water rounds.

### P2 — No objective image assertion
"Looks bad" is not actionable for an agent worker. Nothing in the gate stack
makes a falsifiable claim about a rendered image. A luma histogram is cheap,
deterministic, and would have flagged the water immediately:

- Concept reference: ~60% of pixels below 0.15 luma, ~2% spike above 0.85.
- Shipped `tools/water-night-final.png`: neither.

We already have the hard prerequisite for golden-image testing — determinism
(fixed timestep + seeded PCG32, per `docs/plan/06-testing.md`).

### P3 — Physics/interaction invariants are absent from the unit layer
B1, B2 and B3 are **invisible to screenshot review by construction** and are all
expressible as pure-Node assertions. The three-free architecture rule makes them
free to write. GameDevBench verifies precisely this way — deterministic in-engine
assertions rather than visual LLM-judging, because judging is non-deterministic.

---

## 4. TASK QUEUE (dispatch in this order)

### T1 — Drop the gameplay camera to the concept angle  `[blocks T2, T5]`
`src/render/renderer.ts:113-116`. Target ~15° above the waterline, pulled in so
the boat occupies a materially larger share of frame. Preserve the `debugCam`
override path and the follow-lerp. Do **not** touch water/sky/fog in this task.

**Accept:** horizon visible in the default gameplay frame; fog contribution at
the subject materially above the current 8.3%; boat frame-share up substantially.

### T2 — Shoreline depth mask in the water shader  `[after T1]`
`src/render/water.ts`. Depth-difference mask that (a) attenuates Gerstner
amplitude to ~0 at the shoreline and (b) drives thresholded white edge foam.
Keep `core/waves.ts` as the single source of truth for the wave table — CPU and
GPU must not drift.

**Accept:** B1's invariant test passes; foam appears at every islet waterline;
`waterHeightAt()` and the shader still agree.

### T3 — Invariant unit tests  `[independent, dispatch in parallel]`
Pure Node, no browser. Three tests:

1. `WAVE_MAX_HEIGHT` + shoreline clearance vs `GROUND_Y` / `isletHeightAt()` —
   crests must never exceed terrain (covers B1, permanently).
2. Boat swept into an islet hull → position rejected (covers B2).
3. Wake particle **world** position at `t+1` equals its position at `t` for a
   moving boat, i.e. it is left behind (covers B3).

**Accept:** all three fail against current `main`, pass after T2/T4/T6.

### T4 — Boat collision  `[independent]`
Extend `src/game/boatPhysics.ts` with obstacle response against islet hulls,
wrecks and buoys. Reuse the hull polygons already backing `core/collision.ts`;
do not fork the geometry. Sim-side only, stays three-free.

### T5 — Beauty-shot gate  `[after T1]`
`tools/beauty.mjs`: fixed seed, fixed night-clock phase, camera posed to match
`docs/concepts/images/night_boat_combat_1787661324075.jpg`, renders on every
build. Emits the frame **side-by-side with the concept image** for review, plus
the luma-histogram assertion from P2. Reuse the `?timescale` hook
(`docs/plan/06-testing.md`) to reach the target state fast, then drop to
`timescale=1` for the photograph.

**Accept:** wired into the gate stack; histogram assert fails on current `main`
and is the target for subsequent art rounds.

### T6 — Rebuild the wake in world space  `[independent, low priority]`
`src/game/boat.ts`. Emit into a scene-level pool with world-space positions and
per-particle decay; stop parenting to the boat group.

### T7 — Re-run the art-director pass  `[after T1, T2, T5]`
Regenerate `TODO.md` against the new camera. Expect a significant share of the
current CRITICAL/HIGH entries to be resolved or materially restated. Judge every
future art round against the T5 beauty shot, not against the previous round.

---

## 5. Explicitly NOT in scope of this report

- `src/render/ripples.ts` (bite telegraph) — correct as shipped.
- The tether/line render, fish morphology, keeper pose, HUD, and paperwork
  styling items in `TODO.md` — real, but downstream of T1/T7 and not re-triaged
  here.
- `core/waves.ts` wave table values — correct and unit-tested; B1 is a
  *terrain* mismatch, do not "fix" it by shrinking the waves.

---

## References

- GameDevBench — https://arxiv.org/html/2602.11103v2
- Agentic Coding Handbook, Visual Feedback Loop — https://tweag.github.io/agentic-coding-handbook/WORKFLOW_VISUAL_FEEDBACK/
- Cyanilux, Shoreline shader breakdown — https://www.cyanilux.com/tutorials/shoreline-shader-breakdown/
- Harry Alisavakis, Stylized water shader — https://halisavakis.com/my-take-on-shaders-stylized-water-shader/
- 80.lv, Lighting and visual composition — https://80.lv/articles/importance-of-lighting-and-visual-composition-in-a-video-game
- iXie, Art pipeline and visual QA checklists — https://ixiegaming.com/from-sketch-to-screen-the-evolution-of-game-art-pipelines/
- Visual glitch detection in games (ScienceDirect) — https://www.sciencedirect.com/science/article/pii/S0952197625035286
