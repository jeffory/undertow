// THE CHOIR — M8 (plan 05 §2.3). The emissive mote field and the hymn schedule.
// Both are pure functions of (seed, index[, t]) — no Math.random, no Date, no
// three — so "the same seed hangs the same lights in the same water" is a unit
// test rather than a screenshot comparison.

import { describe, it, expect } from 'vitest';
import {
  CHOIR_FIELD_HALF,
  CHOIR_MOTE_COUNT,
  CHOIR_DRIFT_XZ,
  CHOIR_DRIFT_Y,
  CHOIR_Y_MAX,
  CHOIR_Y_MIN,
  SING_INTERVAL_MAX,
  SING_INTERVAL_MIN,
  choirField,
  choirMoteAt,
  choirMoteHome,
  createChoirState,
  singIntervalFor,
  singPitchFor,
  singerFor,
} from '../../src/gen/choir';
import { createWorld } from '../../src/core/world';
import { CHOIR_ZONE } from '../../src/core/zones';
import { updateChoir, choirCursor } from '../../src/systems/choir';
import { clearTownEvents, peekTownEvents } from '../../src/meta/townEvents';

describe('the mote field is deterministic', () => {
  it('the same seed gives the same field, twice', () => {
    const a = choirField(1234, 12.5);
    const b = choirField(1234, 12.5);
    expect(a).toEqual(b);
  });

  it('a different seed gives a different field', () => {
    const a = choirField(1234, 0);
    const b = choirField(9876, 0);
    expect(a).not.toEqual(b);
  });

  it('sampling at t is frame-rate independent — position is a function, not a sum', () => {
    // The same instant reached "by one big step" and "by many small ones" is the
    // same instant: there is no accumulator to diverge.
    const one = choirMoteAt(55, 7, 30);
    let t = 0;
    for (let i = 0; i < 1800; i++) t += 1 / 60;
    const many = choirMoteAt(55, 7, t);
    expect(many.x).toBeCloseTo(one.x, 6);
    expect(many.y).toBeCloseTo(one.y, 6);
    expect(many.z).toBeCloseTo(one.z, 6);
  });

  it('the field is ~40 motes, spread across the void, in the height band', () => {
    const field = choirField(2, 0);
    expect(field).toHaveLength(CHOIR_MOTE_COUNT);
    for (const m of field) {
      expect(Math.abs(m.x)).toBeLessThanOrEqual(CHOIR_FIELD_HALF + CHOIR_DRIFT_XZ);
      expect(Math.abs(m.z)).toBeLessThanOrEqual(CHOIR_FIELD_HALF + CHOIR_DRIFT_XZ);
      expect(m.y).toBeGreaterThanOrEqual(CHOIR_Y_MIN - CHOIR_DRIFT_Y);
      expect(m.y).toBeLessThanOrEqual(CHOIR_Y_MAX + CHOIR_DRIFT_Y);
      expect(m.brightness).toBeGreaterThan(0.5);
      expect(m.brightness).toBeLessThanOrEqual(1);
    }
  });

  it('they HOLD their places — the wander is bounded, not a random walk', () => {
    for (let i = 0; i < CHOIR_MOTE_COUNT; i++) {
      const home = choirMoteHome(31, i);
      for (const t of [0, 17, 240, 3600, 100000]) {
        const m = choirMoteAt(31, i, t);
        expect(Math.hypot(m.x - home.x, m.z - home.z)).toBeLessThanOrEqual(
          CHOIR_DRIFT_XZ * Math.SQRT2 + 1e-9,
        );
        expect(Math.abs(m.y - home.y)).toBeLessThanOrEqual(CHOIR_DRIFT_Y + 1e-9);
      }
    }
  });

  it('they do not all sit in one place — the field has spread', () => {
    const field = choirField(4242, 0);
    const xs = field.map((m) => m.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(CHOIR_FIELD_HALF);
  });
});

describe('the hymn schedule is deterministic and slow', () => {
  it('every gap is inside the declared slow window', () => {
    for (let i = 0; i < 200; i++) {
      const gap = singIntervalFor(99, i);
      expect(gap).toBeGreaterThanOrEqual(SING_INTERVAL_MIN);
      expect(gap).toBeLessThanOrEqual(SING_INTERVAL_MAX);
    }
  });

  it('the singer is always a real mote and the pitch is always a mode degree', () => {
    for (let i = 0; i < 200; i++) {
      const mote = singerFor(1, i);
      expect(Number.isInteger(mote)).toBe(true);
      expect(mote).toBeGreaterThanOrEqual(0);
      expect(mote).toBeLessThan(CHOIR_MOTE_COUNT);
      const pitch = singPitchFor(1, i);
      expect(pitch).toBeGreaterThanOrEqual(0);
      expect(pitch).toBeLessThan(7);
    }
  });

  it('the same seed sings the same verses in the same order', () => {
    const a = Array.from({ length: 20 }, (_, i) => [singIntervalFor(5, i), singerFor(5, i), singPitchFor(5, i)]);
    const b = Array.from({ length: 20 }, (_, i) => [singIntervalFor(5, i), singerFor(5, i), singPitchFor(5, i)]);
    expect(a).toEqual(b);
    const c = Array.from({ length: 20 }, (_, i) => [singIntervalFor(6, i), singerFor(6, i), singPitchFor(6, i)]);
    expect(c).not.toEqual(a);
  });
});

describe('the singing system', () => {
  function stepFor(world: ReturnType<typeof createWorld>, seconds: number, dt = 1 / 60): void {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      world.time.elapsed += dt;
      updateChoir(world, dt);
    }
  }

  it('is silent outside the Choir, at any length of run', () => {
    clearTownEvents();
    const w = createWorld(3);
    w.run.zone = 1;
    stepFor(w, 120);
    expect(peekTownEvents().filter((e) => e.type === 'choir.sang')).toHaveLength(0);
    expect(choirCursor(w).armed).toBe(false);
  });

  it('arms on arrival and sings on the seeded schedule', () => {
    clearTownEvents();
    const w = createWorld(3);
    w.run.zone = CHOIR_ZONE;
    updateChoir(w, 0);
    expect(choirCursor(w).armed).toBe(true);
    expect(choirCursor(w).timer).toBeCloseTo(singIntervalFor(w.seed, 0), 6);

    stepFor(w, SING_INTERVAL_MAX + 0.5);
    const sung = peekTownEvents().filter((e) => e.type === 'choir.sang');
    expect(sung.length).toBeGreaterThanOrEqual(1);
    const first = sung[0] as { zone: number; index: number; mote: number; pitch: number };
    expect(first.zone).toBe(CHOIR_ZONE);
    expect(first.index).toBe(0);
    expect(first.mote).toBe(singerFor(w.seed, 0, CHOIR_MOTE_COUNT));
    expect(first.pitch).toBe(singPitchFor(w.seed, 0));
  });

  it('sings the same verses for the same seed however the frames batch', () => {
    const run = (dt: number) => {
      clearTownEvents();
      const w = createWorld(808);
      w.run.zone = CHOIR_ZONE;
      stepFor(w, 90, dt);
      return peekTownEvents()
        .filter((e) => e.type === 'choir.sang')
        .map((e) => JSON.stringify(e));
    };
    expect(run(1 / 60)).toEqual(run(1 / 120));
  });

  it('a fresh cursor is unarmed and has sung nothing', () => {
    const c = createChoirState();
    expect(c.index).toBe(0);
    expect(c.armedFor).toBe(-1);
    expect(c.lastMote).toBe(-1);
  });

  it('leaving the Choir parks the cursor rather than resetting the hymn', () => {
    clearTownEvents();
    const w = createWorld(11);
    w.run.zone = CHOIR_ZONE;
    stepFor(w, 60);
    const sungInVoid = w.choir.index;
    expect(sungInVoid).toBeGreaterThan(0);
    w.run.zone = 5;
    stepFor(w, 60);
    expect(w.choir.index).toBe(sungInVoid); // no verses in the Mouth
    expect(choirCursor(w).armed).toBe(false);
  });
});
