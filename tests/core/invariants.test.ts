import { describe, it, expect } from 'vitest';
import { WAVE_MAX_HEIGHT } from '../../src/core/waves';
import { generateLake } from '../../src/gen/lakeMap';
import { isletPeakRise } from '../../src/gen/isletHeight';
import { createWorld } from '../../src/core/world';
import { ensureLake } from '../../src/gen/lakeWorld';
import { stepBoatKinematics } from '../../src/game/boatPhysics';
import { pointInPolygon } from '../../src/core/poly';

// GROUND_Y (0.25 m above the water plane) is the islet shoreline surface,
// exported from src/render/lake.ts:32 — but that module imports three, so it is
// not importable here. Pin the constant so this suite stays three-free.
const SHORELINE_Y = 0.25;

const DT = 1 / 60;
const SEEDS = [1, 42, 2024, 4242];

describe('invariants: wave / terrain clearance (bug B1)', () => {
  // flip to it() when the shoreline depth mask (T2) lands
  it.fails('wave crests never exceed the shoreline + islet peak for any seeded islet', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed);
      for (const iso of lake.islets) {
        // crest height is bounded by WAVE_MAX_HEIGHT (Σ Gerstner amplitudes,
        // src/core/waves.ts:31 = 1.23); a crest that tops SHORELINE_Y +
        // isletPeakRise(iso) would submerge the islet's tallest point (B1).
        expect(
          WAVE_MAX_HEIGHT,
          `seed ${seed} islet ${iso.id} peak=${(SHORELINE_Y + isletPeakRise(iso)).toFixed(3)}`,
        ).toBeLessThanOrEqual(SHORELINE_Y + isletPeakRise(iso));
      }
    }
  });
});

describe('invariants: boat never enters an islet hull (bug B2)', () => {
  // flip when boat collision (T4) lands
  it.fails('full-throttle run into an islet keeps the boat outside its hull polygon', () => {
    for (const seed of SEEDS) {
      const w = createWorld(seed);
      ensureLake(w);
      for (const iso of w.lake!.islets) {
        const c = iso.center;
        const v = iso.poly[0]!;
        const len = Math.hypot(v.x - c.x, v.z - c.z) || 1;
        // spawn just outside the hull vertex, on the radial toward the centre
        w.boat.x = c.x + ((v.x - c.x) / len) * (len + 1);
        w.boat.z = c.z + ((v.z - c.z) / len) * (len + 1);
        w.boat.heading = Math.atan2(c.x - w.boat.x, c.z - w.boat.z);
        w.boat.speed = 0;

        // full forward throttle toward the centre for ~5s of fixed steps
        w.intent.moveX = 0;
        w.intent.moveY = 1;
        for (let i = 0; i < 5 / DT; i++) {
          // re-aim the bow at the centre each step — this invariant is about
          // obstacle rejection, not the turn rate
          w.boat.heading = Math.atan2(c.x - w.boat.x, c.z - w.boat.z);
          stepBoatKinematics(w.boat, w.intent, DT);
          // replicate movement()'s position integration (src/core/systems.ts)
          w.boat.x += Math.sin(w.boat.heading) * w.boat.speed * DT;
          w.boat.z += Math.cos(w.boat.heading) * w.boat.speed * DT;
          // boatPhysics has zero obstacle terms (B2) and no sim collision runs
          // here, so the position is accepted — this fails today.
          expect(
            pointInPolygon({ x: w.boat.x, z: w.boat.z }, iso.poly),
            `seed ${seed} islet ${iso.id} step ${i}`,
          ).toBe(false);
        }
      }
    }
  });
});

// B3 — the wake is a THREE.Points parented to the boat group (src/game/boat.ts:
// 33, 179, 227-229, 302-311), so it translates/yaws with the hull and there is
// no sim-side wake state to assert against without three. Do not import three
// in a test to force it. Once T6 rebuilds the wake in world space (or exposes a
// sim-side wake particle list), this must assert:
//
//   wake particle WORLD position at t+1 === its position at t
//   for a moving boat — particles are emitted behind the stern and left behind
//   in world space, never carried along by the boat's transform.
describe.todo('invariants: wake particles persist in world space (bug B3)');