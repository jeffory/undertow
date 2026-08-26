import { describe, it, expect } from 'vitest';
import { WAVE_MAX_HEIGHT } from '../../src/core/waves';
import { attenuatedWaterHeightAt } from '../../src/core/shore';
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

describe('invariants: wave / terrain clearance (bug B1, fixed by the T2 shore mask)', () => {
  it('attenuated water height never tops an islet at its rim or interior', () => {
    // The raw crest bound (WAVE_MAX_HEIGHT = 1.23) exceeds every islet peak
    // (0.60-1.10), so open-water waves MUST die at the shoreline: the shore
    // mask (core/shore.ts) is what makes this invariant hold. Sample every
    // rim vertex, points pulled toward the centre, and the centre itself,
    // across a sweep of times covering the wave phases.
    expect(WAVE_MAX_HEIGHT).toBeGreaterThan(SHORELINE_Y); // the hazard is real
    for (const seed of SEEDS) {
      const lake = generateLake(seed);
      for (const iso of lake.islets) {
        expect(SHORELINE_Y + isletPeakRise(iso)).toBeGreaterThan(0); // sanity
        const samples = [iso.center, ...iso.poly];
        for (const v of iso.poly) {
          samples.push({
            x: v.x + (iso.center.x - v.x) * 0.4,
            z: v.z + (iso.center.z - v.z) * 0.4,
          });
        }
        for (let t = 0; t < 12; t += 0.37) {
          for (const p of samples) {
            expect(
              attenuatedWaterHeightAt(lake.islets, p.x, p.z, t),
              `seed ${seed} islet ${iso.id} t=${t.toFixed(2)} at (${p.x.toFixed(1)},${p.z.toFixed(1)})`,
            ).toBeLessThanOrEqual(SHORELINE_Y);
          }
        }
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