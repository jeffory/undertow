# UNDERTOW — Implementation Plan Overview

Synthesis of the five planning slices in this directory, mapped against the design
spec (`../../plan.md`, v0.2) and its milestone ladder (spec §10). Each slice was
planned independently; this file is the build order, the dependency map, and the
cross-slice interface contracts.

## The plan set

| Doc | Slice | Spec milestones | Owns |
|---|---|---|---|
| [01-foundation.md](01-foundation.md) | Foundation | M0 The Look, M1 The Fight | Vite+TS+Three scaffold, ECS-lite core (flat-array store, pure systems, fixed update order), water/fog/lighting/post, boat rowing, on-foot controller, dodge/stamina/gaff, one hardcoded sine-spine fish |
| [02-tether.md](02-tether.md) | The Tether | M2 The Line | Distance constraint + tension, reel/brace/snap/cut, exhaustion & LAND, tethered fish AI (orbit/lunge/dive/drag), water phase, catenary line render, six-dial debug panel, playtest instrumentation. Addendum: generic anchors, reverse tether, third-entity-on-line, TetherEvent stream |
| [03-runloop.md](03-runloop.md) | The Run Loop | M3 The Loop | PCG32 seeded determinism (layout/loot/AI streams), Poisson-disc + Delaunay surface maps, cast/bite/SET-RELEASE, Dread economy, Night Clock, boat combat orchestration, extraction/death/Memories, IndexedDB+zod saves, spawn director |
| [04-fish-and-loot.md](04-fish-and-loot.md) | Fish & Loot | M4 The Fish | FishParams generator + shared-geometry pool, sine-spine/limb animation, wrongness curve, all enemy categories incl. the Bagman, 12 Shallows species, bestiary, loot/affix roller, Keeper's License, Office Contracts |
| [05-meta-and-content.md](05-meta-and-content.md) | Meta & Content | M5 The Town → M10 The End | Lighthouse hub, rig-up, town restoration (+2 starting Dread twist), barks/bottle notes, zones 2–5 pressures + bosses, both endings & Maren breadcrumbs, procedural audio (Tone.js), content budget & balance pass |
| [06-testing.md](06-testing.md) | Testing | cross-cutting | Vitest unit layer, smoke gate, tests-first rule, timescale hook for gate drivers |
| [07-assets.md](07-assets.md) | Asset pipeline | cross-cutting (added 2026-08-25) | **Supersedes spec §8 "no assets"**: Tripo3D generation (`tools/tripo.py`) + Blender-headless prep + GLTF loading, `docs/concepts/images/` as art bible, Claude visual-approval loop (agy second opinions), raised tri/texture budgets, M1.5 pipeline-validation milestone. Fish stay procedural (FishParams); hero creatures go hybrid (generated mesh, procedural bones) |
| [08-polish.md](08-polish.md) | Polish & shell | M2.5 + per-milestone (added 2026-08-25) | Title screen (attract-mode lake), text-only opening story, options menu (graphics/controls/accessibility settings, zod-versioned), README, diegetic HUD pass, feel-polish backlog per milestone |

## Build order

Strictly serial through the fun-or-dead gate, parallelizable after:

```
01 foundation (M0→M1)
        │
02 tether (M2)  ◀── FUN-OR-DEAD GATE (spec §13.1): one grey capsule fish,
        │           empty arena, six tuning dials. Playtest hard before
        │           building ANY content. If it isn't fun, surgery here.
        │
03 run loop (M3) ──┬── 04 fish & loot (M4)     } can proceed largely in
                   └── 05 meta & content (M5+)  } parallel once 03's world
                                                  shell + save schema exist
```

- 04's generator only needs 01's render/animation seams and 02's
  `exhaustionRatio` hook — it can start against the capsule fish stub while 03
  is in flight.
- 05's hub needs 03's `RunResult` + save schema; its zone/boss work (M6–M9)
  needs 02's addendum mechanics (reverse tether, third entity) and 04's presets.
- Audio (05) attaches to the TetherEvent stream and Dread value — it can be
  built any time after 02/03 land their events.

## Cross-slice interface contracts

These are the seams every slice agreed on (or flagged); breaking one breaks a
sibling plan.

**From 01 (foundation), consumed by everyone:**
- `SystemFn = (world, dt) => void`, fixed `DT = 1/60`, update order
  `input → intent → tetherConstraint → movement → collision → combat → dread → spawn → animation → render → ui`.
- Reserved slots: `tetherConstraint` system, `world.dread`, `world.seed` +
  `rng.ts`, `spawn` system, `render/lines.ts`, `world.mode: 'boat' | 'foot'`.

**From 02 (tether), consumed by 03/05/audio:**
- `startTetherFight(species, anchor: 'player' | 'boat')` — generic anchors
  (entity | boat | fixed) with per-anchor mass, reel source, and cut cost
  (boat: winch post reels, cleat cut costs a hull segment).
- Reverse-tether mode (Postmaster, Whistler): same constraint, roles swapped.
- Third-entity-on-line (Snatchers): second constraint sharing the fish endpoint
  + steal timer.
- `TetherEvent` union — landed / cut / snapped / pulledIn / drag / tension —
  consumed by audio, Dread, and UI.
- `enterWaterPhase({breathSec, occupied, sinkingHaul?})`.
- Writes `exhaustionRatio`; reads `FishStats` from 04.

**From 03 (run loop), consumed by 04/05:**
- `LakeMap` (islets, sinkholes, buoys, micro-event) — sinkhole positions drive
  the Bagman chase; micro-event slots host bottle notes / Maren breadcrumbs.
- Dread value + tier, Night Clock phase (gates Draggers, Whistler, Auditor's
  Courier, night barks).
- `RunResult` → meta layer; versioned zod save schema extended with `MetaState`.
- Spawn-director guarantee hooks: un-caught-species per map, Bagman floor in a
  new save's first 3 runs.

**From 04 (fish & loot), consumed by 02/03/05:**
- `SpeciesDef` table: tier, rarity, weight, struggle, eligibility grade,
  `FishStats` (mass, stamina, pullForce), behavior overlay.
- Bestiary unlock flags (seen / fought / cleanCatch / willing), rod stat
  blocks, Drowned item defs, License grade for bite-eligibility checks.

**From 05 (meta), consumed by 03:**
- Restored-building count → +2 starting Dread each, cap +30.
- Bottled Light decant count → hub light dimming.

## Consolidated top risks

1. **The M2 gate itself** — everything after it is production; the six dials
   (`pullForce`, `k_tension`, `slackDecay`, brace efficacy, lunge telegraph,
   fish stamina) are the game. Budget real playtest time here.
2. **Tether anchor generality** — if 02 ships player-vs-fish only, boat combat
   (03) and two bosses (05) degrade to stubs. Resolved by the 02 addendum:
   build the generic anchor *shape* in M2, defer boat/reverse/snatcher
   *behaviors* to their milestones.
3. **Determinism drift** — u32-only PCG32, single-mutation reducer, replay
   test (03). Fish generation and loot rolls must draw only from their streams.
4. **Perf budget** — one draw call per fish via the shared max-topology pool
   (04); both foundation acceptance gates assert ≤150 draw calls / ≤60k tris /
   60 fps integrated.
5. **Three stacked pressure systems** (Night Clock + Dread + License) — watch
   for admin-play; simplification order per spec §13.3: License first, clock
   second, Dread never.

## Rough effort

Per-slice task breakdowns are ~1–3 h tasks: 18 (foundation) + 13 ≈ 25 h incl.
addendum (tether) + 16 ≈ 40 h (run loop) + 17 (fish & loot) + 60+ (meta &
content).
Vertical slice (Shallows + Old Pike, ~45 min of game) lands at end of M5, per
spec. Weekend-sized milestones hold if the M2 gate passes on the first serious
tuning pass.
