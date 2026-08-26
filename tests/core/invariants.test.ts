import { describe, it, expect } from 'vitest';
import { WAVE_MAX_HEIGHT } from '../../src/core/waves';
import { attenuatedWaterHeightAt } from '../../src/core/shore';
import { generateLake } from '../../src/gen/lakeMap';
import { isletPeakRise } from '../../src/gen/isletHeight';
import { createWorld } from '../../src/core/world';
import { ensureLake } from '../../src/gen/lakeWorld';
import { stepBoatKinematics, stepBoatMovement } from '../../src/game/boatPhysics';
import { pointInPolygon } from '../../src/core/poly';
import { createWake, stepWake } from '../../src/core/wake';

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

describe('invariants: boat never enters an islet hull (bug B2, fixed by the T4 obstacle response)', () => {
  it('full-throttle run into an islet keeps the boat outside its hull polygon', () => {
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
          // the real movement-system integration + obstacle resolution
          // (src/core/systems.ts movement → stepBoatMovement) — slides the boat
          // along the shore and drops its speed; it never accepts a position
          // inside an islet polygon.
          stepBoatMovement(w, DT);
          expect(
            pointInPolygon({ x: w.boat.x, z: w.boat.z }, iso.poly),
            `seed ${seed} islet ${iso.id} step ${i}`,
          ).toBe(false);
        }
      }
    }
  });
});

// B3 — fixed by T6: the wake is now a pure world-space pool (core/wake.ts);
// particles are emitted behind the stern and belong to the world thereafter.
describe('invariants: wake particles persist in world space (bug B3)', () => {
  it('emitted particles move only by their own drift — never with the boat', () => {
    const wk = createWake();
    const boat = { x: 0, z: 0, heading: 0, speed: 3 };
    // run long enough at full speed to guarantee emissions
    for (let i = 0; i < 30; i++) stepWake(wk, boat, DT);
    const live = wk.parts.filter((p) => p.age < p.life);
    expect(live.length).toBeGreaterThan(0);

    // record each live particle and its expected self-drift-only next position
    const before = live.map((p) => ({ p, ex: p.x + p.vx * DT, ez: p.z + p.vz * DT }));
    // teleport the boat far away and keep sailing — a parented wake would jump
    boat.x = 500;
    boat.z = -500;
    stepWake(wk, boat, DT);
    for (const { p, ex, ez } of before) {
      expect(p.x).toBeCloseTo(ex, 10);
      expect(p.z).toBeCloseTo(ez, 10);
      // and emphatically not near the teleported boat
      expect(Math.hypot(p.x - boat.x, p.z - boat.z)).toBeGreaterThan(400);
    }
  });

  it('a stationary boat emits nothing', () => {
    const wk = createWake();
    for (let i = 0; i < 60; i++) stepWake(wk, { x: 0, z: 0, heading: 0, speed: 0 }, DT);
    expect(wk.parts.every((p) => p.age >= p.life)).toBe(true);
  });
});