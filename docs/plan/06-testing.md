# 06 — Testing (harness, layers, and the tests-first rule)

## The three layers

Every change lands behind one of three gates, cheapest first:

1. **Unit (`npm test`, vitest, Node)** — pure logic only. `tests/` mirrors `src/`
   (`tests/core/rng.test.ts`, `tests/game/boatPhysics.test.ts`, …). Run with
   `vitest run`; watch with `npm run test:watch`. These never need a browser.
2. **Smoke (`npm run smoke`, `tools/smoke.mjs`)** — launches the real app
   headless (default `http://localhost:5173`, pass any URL) and fails with
   exit 1 on a page load failure, **any** console error or pageerror, or a
   frame that is >95 % near-black (a "everything died" regression). It does
   not start or kill servers; point it at a dev server or `vite preview`.
3. **Manual gates** — the milestone acceptance criteria (M0 screenshot
   "feels like the game", M1 land-combat loop, M2 fun-or-dead tether feel).
   Automated gates can't judge feel; they only keep the loop unbroken so the
   manual pass is worth doing.

## Gate-driver speed: the timescale hook

Automated gameplay gates (M1's `tools/fight.mjs` and every gate after it)
must not play in real time. The M1 gate cost most of its wall-clock waiting
on real 0.4 s telegraphs and 60 s fights through a ~40 fps software
renderer. Rule for every future gate driver:

- The app exposes a **`?timescale=N`** debug flag (only alongside `?debug`):
  the fixed-step loop runs N sim steps per rAF frame (clamped, say N ≤ 20)
  instead of 1, leaving `FIXED_DT` itself untouched so determinism and all
  spec-numbered timings are preserved — sim time just advances N× faster
  per wall-clock frame. Rendering shows every Nth state; that's fine for a
  driver that asserts via `window.__world`, and screenshots still work
  (pause by dropping back to `timescale=1` via a `window.__world` field if
  a composed shot is needed).
- Gate drivers run at `?mode=foot&debug&timescale=10` (or similar) by
  default and only drop to real time for the moments they photograph.
- The hook is a **debug-flag-only** path: without the query param the loop
  is byte-identical to production. Its implementation lives with the fixed
  clock (`core/time.ts` + `main.ts`) and gets a unit test: N steps per
  frame at the same `FIXED_DT`, clamp respected, default N=1.

First implementer: the M2 gate worker (the tether gate is fight-heavy and
needs fast iteration most). If it lands earlier, any gate may use it.

## Tests-first rule for future milestones

Spec numbers are contract. Before implementing a milestone system, write the
unit tests for its numbers and watch them fail; then make them green. Examples:

- **Dodge (M1, spec 4.1/plan §4.2):** i-frames exactly `0.25s`, cooldown
  `0.6s` (independent of stamina — even at 0 stamina no re-roll), cost `25`
  stamina.
- **Stamina (M1, plan §4.3):** pool `100`, regen `40/s` after a `0.8s`
  delay; no regen during the delay after a spend; costs dodge 25 / heavy gaff 30.
- **Tether (M2, plan §4.3):** the distance constraint, tension, and mass-ratio
  split are the fun-or-dead math — pin them with **property tests**, not just
  example values.

### M2 tether property tests (reserved, write with 02)

- **`|d|` never exceeds `L`** after the constraint correction — no overshoot
  on either side of the leash.
- **Tension clamped 0–100** — negative (slack) and >100 (over-tension) are
  impossible post-step.
- **Mass-ratio split sums to the excess** — the displacement shared between
  player and fish reconstructs exactly the overshoot it was split from.
- **Replay determinism** — same seed + same input script → byte-identical
  fight state (this is why the clock is fixed-step and the RNG is PCG32).

## Architecture rule: game logic stays three-free

The whole harness rests on one rule already in plan §2.3: **game logic never
imports `three`.** Only `render/*` touches Three. That keeps every unit test a
plain Node run — no DOM, no WebGL, no headless browser needed for logic.

Two existing carve-outs maintain the rule:

- `core/waves.ts` is the pure Gerstner wave math (`WAVES`, `waterHeightAt`,
  the GLSL generators) split out of `render/water.ts` so the boat bob and
  Node tests share the same table. `render/water.ts` re-exports
  `waterHeightAt` unchanged.
- `game/boatPhysics.ts` is the boat kinematics step
  (`stepBoatKinematics(boat, intent, dt)`) split out of `game/boat.ts`, which
  keeps the mesh/bob/wake. Constants live in `boatPhysics.ts`; `boat.ts`
  imports them.

Rule of thumb: if a file you want to test imports `three`, the math is in the
wrong file — split the pure part out, keep the render seam's public API
identical, and note the split.

## Commands

```
npm test          # vitest run (unit)
npm run test:watch
npm run smoke     # node tools/smoke.mjs [url], exit 1 on failure
npx tsc --noEmit  # typecheck gate
npx vite build    # build gate
```