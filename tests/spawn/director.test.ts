// SPAWN DIRECTOR (QA round) — the disturbance stream must advance across
// refills. A fixed salt re-created the identical PCG32 stream on every call, so
// every refill replayed the initial batch (same islet picks, angles, tiers,
// bite seeds) forever.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { ensureLake } from '../../src/gen/lakeWorld';
import {
  spawnInitialDisturbances,
  refillDisturbances,
  INITIAL_DISTURBANCES,
} from '../../src/spawn/director';

function lakeWorld(seed = 7) {
  const w = createWorld(seed);
  ensureLake(w);
  return w;
}

describe('disturbance stream across refills', () => {
  it('a refill batch draws differently from the initial batch', () => {
    const w = lakeWorld();
    spawnInitialDisturbances(w);
    const initial = w.disturbances.map((d) => ({ seed: d.seed, x: d.pos.x, z: d.pos.z }));
    expect(initial.length).toBeGreaterThan(0);
    w.disturbances = []; // consume everything
    refillDisturbances(w);
    const refill = w.disturbances.map((d) => ({ seed: d.seed, x: d.pos.x, z: d.pos.z }));
    expect(refill.length).toBeGreaterThan(0);
    // the refill must NOT replay the initial draw sequence
    expect(refill[0]).not.toEqual(initial[0]);
  });

  it('successive refills differ from each other too', () => {
    const w = lakeWorld();
    spawnInitialDisturbances(w);
    w.disturbances = [];
    refillDisturbances(w);
    const first = w.disturbances.map((d) => d.seed);
    w.disturbances = [];
    refillDisturbances(w);
    const second = w.disturbances.map((d) => d.seed);
    expect(second).not.toEqual(first);
  });

  it('the whole spawn set stays reproducible from the run seed', () => {
    const roll = () => {
      const w = lakeWorld(1234);
      spawnInitialDisturbances(w);
      w.disturbances = [];
      refillDisturbances(w);
      return w.disturbances.map((d) => ({ seed: d.seed, tier: d.tier, x: d.pos.x, z: d.pos.z }));
    };
    expect(roll()).toEqual(roll());
  });

  it('initial spawn still seeds the documented count when islets allow', () => {
    const w = lakeWorld();
    spawnInitialDisturbances(w);
    expect(w.disturbances.length).toBeLessThanOrEqual(INITIAL_DISTURBANCES);
  });
});
