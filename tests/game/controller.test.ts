// T11 + T13 — on-foot controller tests (plan 01 §4.1/§4.2, spec 4.1).
// Tests-first: written before controller.ts was implemented. Step at the
// fixed DT (FIXED_DT = 1/60) and count steps so i-frame / cooldown windows
// are exact.

import { describe, it, expect } from 'vitest';
import {
  updateController,
  WALK_SPEED,
  DODGE_SPEED,
  DODGE_DURATION,
  DODGE_IFRAMES,
  DODGE_COOLDOWN,
  DODGE_COST,
} from '../../src/game/controller';
import { createWorld } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';

const DT = FIXED_DT;

function footWorld() {
  const w = createWorld();
  w.mode = 'foot';
  return w;
}

describe('T11 8-direction foot controller', () => {
  it('cardinal movement writes walk-speed velocity along the correct axis', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    updateController(w, DT);
    expect(w.player.vx).toBeCloseTo(WALK_SPEED, 6);
    expect(w.player.vz).toBeCloseTo(0, 6);

    w.intent.moveX = 0;
    w.intent.moveY = 1;
    updateController(w, DT);
    expect(w.player.vx).toBeCloseTo(0, 6);
    expect(w.player.vz).toBeCloseTo(WALK_SPEED, 6);
  });

  it('diagonals are normalized to the same speed as a cardinal', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 1;
    updateController(w, DT);
    const speed = Math.hypot(w.player.vx, w.player.vz);
    expect(speed).toBeCloseTo(WALK_SPEED, 6);
  });

  it('facing follows the movement direction (0 = +Z, +PI/2 = +X)', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    updateController(w, DT);
    expect(w.player.facing).toBeCloseTo(Math.PI / 2, 6);

    w.intent.moveX = 0;
    w.intent.moveY = 1;
    updateController(w, DT);
    expect(w.player.facing).toBeCloseTo(0, 6);

    w.intent.moveX = 1;
    w.intent.moveY = 1;
    updateController(w, DT);
    expect(w.player.facing).toBeCloseTo(Math.PI / 4, 6);
  });

  it('idle zeroes velocity and preserves the last facing', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 1;
    updateController(w, DT);
    const facing = w.player.facing;
    expect(facing).not.toBe(0);
    w.intent.moveX = 0;
    w.intent.moveY = 0;
    updateController(w, DT);
    expect(w.player.vx).toBe(0);
    expect(w.player.vz).toBe(0);
    expect(w.player.facing).toBe(facing);
  });

  it('boat mode is untouched: no velocity, facing, dodge, or stamina spend', () => {
    const w = createWorld(); // mode defaults to 'boat'
    w.intent.moveX = 1;
    w.intent.moveY = 1;
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.vx).toBe(0);
    expect(w.player.vz).toBe(0);
    expect(w.player.facing).toBe(0);
    expect(w.player.dodge.active).toBe(false);
    expect(w.player.stamina).toBe(100);
  });
});

describe('T13 dodge roll', () => {
  it('dodge spends exactly 25 stamina and grants the i-frame window', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.stamina).toBe(100 - DODGE_COST);
    expect(w.player.dodge.active).toBe(true);
    expect(w.player.iframes).toBe(DODGE_IFRAMES);
  });

  it('i-frame window is exactly 0.25s of sim time (counted at FIXED_DT)', () => {
    const w = footWorld();
    w.intent.dodge = true;
    updateController(w, DT);
    w.intent.dodge = false;
    let steps = 0;
    while (w.player.iframes > 0 && steps < 60) {
      updateController(w, DT);
      steps++;
    }
    expect(steps).toBe(Math.round(DODGE_IFRAMES / DT)); // 15 steps = 0.25s
  });

  it('cooldown blocks a second dodge before 0.6s and allows it after', () => {
    const w = footWorld();
    w.intent.dodge = true;
    updateController(w, DT); // first dodge
    w.intent.dodge = false;

    // 34/60 = 0.567s in: cooldown still positive
    for (let i = 0; i < 34; i++) updateController(w, DT);
    w.intent.dodge = true;
    updateController(w, DT); // 35/60 = 0.583s — blocked by cooldown
    expect(w.player.dodge.cooldownLeft).toBeGreaterThan(0);
    expect(w.player.stamina).toBe(100 - DODGE_COST); // no second spend
    w.intent.dodge = false;

    // 36/60 = 0.6s: cooldown clear, next attempt lands
    updateController(w, DT);
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.dodge.active).toBe(true);
    expect(w.player.stamina).toBe(100 - 2 * DODGE_COST);
  });

  it('stamina gate: 24 stamina → no dodge, no cooldown started', () => {
    const w = footWorld();
    w.player.stamina = 24;
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.dodge.active).toBe(false);
    expect(w.player.dodge.cooldownLeft).toBe(0);
    expect(w.player.iframes).toBe(0);
    expect(w.player.stamina).toBe(24);
    // and the next attempt once stamina is back succeeds (cooldown never ran)
    w.player.stamina = 100;
    updateController(w, DT);
    expect(w.player.dodge.active).toBe(true);
  });

  it('dodge locks steering: direction is fixed for the burst mid-roll', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.dodge.dirX).toBeCloseTo(1, 6);
    expect(w.player.dodge.dirZ).toBeCloseTo(0, 6);
    // mid-roll, change intent — velocity stays locked on the roll axis
    w.intent.dodge = false;
    w.intent.moveX = 0;
    w.intent.moveY = 1;
    for (let i = 0; i < 8; i++) updateController(w, DT); // 8/60 = 0.133s < burst
    expect(w.player.dodge.active).toBe(true);
    expect(w.player.vx).toBeCloseTo(DODGE_SPEED, 6);
    expect(w.player.vz).toBeCloseTo(0, 6);
  });

  it('dodging from idle rolls in the current facing direction', () => {
    const w = footWorld();
    w.player.facing = Math.PI / 2; // facing +X
    w.intent.dodge = true;
    updateController(w, DT);
    expect(w.player.dodge.dirX).toBeCloseTo(1, 6);
    expect(w.player.dodge.dirZ).toBeCloseTo(0, 6);
  });

  it('the roll burst lasts ~0.28s (DODGE_DURATION) then hands control back', () => {
    const w = footWorld();
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    w.intent.dodge = true;
    updateController(w, DT);
    w.intent.dodge = false;
    // 16/60 = 0.267s: still rolling
    for (let i = 0; i < 16; i++) updateController(w, DT);
    expect(w.player.dodge.active).toBe(true);
    // 17/60 = 0.283s: burst over
    updateController(w, DT);
    expect(w.player.dodge.active).toBe(false);
    expect(w.player.dodge.timeLeft).toBe(0);
  });

  it('DODGE_COOLDOWN and DODGE_DURATION are the tuned constants', () => {
    expect(DODGE_COOLDOWN).toBe(0.6);
    expect(DODGE_DURATION).toBe(0.28);
  });
});