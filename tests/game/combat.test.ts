// T14 + T15 — gaff combat tests (plan 01 §4.4, spec 4.1). Tests-first: written
// before combat.ts was implemented. Step at the fixed DT so combo/heavy windows
// are exact. The pure arc-vs-circle math is pinned directly; the swing→hit→event
// path runs through updateCombat so the whole contract is exercised.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish, FISH_RADIUS } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import {
  updateCombat,
  arcCircleHit,
  REACH,
  LIGHT_ARC_DEG,
  LIGHT_DAMAGE,
  LIGHT_KNOCKBACK,
  HEAVY_DAMAGE,
  HEAVY_KNOCKBACK,
  HEAVY_STAGGER,
  HEAVY_CHARGE_MIN,
  HEAVY_STAMINA_COST,
  COMBO_BUFFER,
  FISH_TARGET_ID,
} from '../../src/game/combat';

const DT = 1 / 60;

// --- test rig ----------------------------------------------------------------

function worldWithFish(x = 0, z = 2, hp = 100): WorldState {
  const w = createWorld();
  w.fish = createFish();
  w.fish.x = x;
  w.fish.z = z;
  w.fish.hp = hp;
  w.fish.maxHp = hp;
  w.player.stamina = 100;
  return w;
}

function step(w: WorldState, frames = 1): void {
  for (let i = 0; i < frames; i++) updateCombat(w, DT);
}

// One short LMB tap = one light-combo press (intent.primary is a LEVEL signal).
function tap(w: WorldState): void {
  w.intent.primary = true;
  step(w, 1);
  w.intent.primary = false;
  step(w, 1);
}

// Hold LMB for `holdFrames` fixed steps, then release (the swing resolves on
// release: a short hold is a light tap, a ≥ HEAVY_CHARGE_MIN hold is a heavy).
function holdAndRelease(w: WorldState, holdFrames: number): void {
  w.intent.primary = true;
  step(w, holdFrames);
  w.intent.primary = false;
  step(w, 1);
}

// Step until a hit event lands this tick; returns steps taken (-1 if never).
function stepUntilHit(w: WorldState, maxFrames = 120): number {
  for (let i = 0; i < maxFrames; i++) {
    step(w, 1);
    if (w.combat.hits.length > 0) return i + 1;
  }
  return -1;
}

// Step until the active swing finishes (attackTimer reaches 0).
function finishSwing(w: WorldState, maxFrames = 120): void {
  for (let i = 0; i < maxFrames && w.combat.attackTimer > 0; i++) step(w, 1);
}

// Fish centre on a ray from the player at `angleRad` (0 = +Z) / distance `dist`.
function placeFish(w: WorldState, angleRad: number, dist: number): void {
  w.fish!.x = w.player.x + dist * Math.sin(angleRad);
  w.fish!.z = w.player.z + dist * Math.cos(angleRad);
}

// --- T14 arc-vs-circle math (pure) -------------------------------------------

describe('T14 arcCircleHit', () => {
  const half = LIGHT_ARC_DEG / 2;

  it('hits a target in front, inside reach', () => {
    expect(arcCircleHit(0, 0, 0, 0, 2, FISH_RADIUS, REACH, half)).toBe(true);
  });

  it('misses a target directly behind', () => {
    expect(arcCircleHit(0, 0, 0, 0, -2, FISH_RADIUS, REACH, half)).toBe(false);
  });

  it('misses a target out of range', () => {
    expect(arcCircleHit(0, 0, 0, 0, 5, FISH_RADIUS, REACH, half)).toBe(false);
  });

  it('hits exactly on the arc edge and misses just past it (radius margin)', () => {
    const dist = 2;
    const margin = Math.asin(Math.min(1, FISH_RADIUS / dist)); // fish angular half-width
    const boundary = (half * Math.PI) / 180 + margin;
    // exactly on the boundary: inclusive hit
    expect(arcCircleHit(0, 0, 0, dist * Math.sin(boundary), dist * Math.cos(boundary), FISH_RADIUS, REACH, half)).toBe(true);
    // a hair past the boundary: miss
    const past = boundary + 0.01;
    expect(arcCircleHit(0, 0, 0, dist * Math.sin(past), dist * Math.cos(past), FISH_RADIUS, REACH, half)).toBe(false);
  });
});

// --- T14 light combo through updateCombat ------------------------------------

describe('T14 light combo', () => {
  it('a tap starts stage 1 and hits a fish in front for exact stage damage', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    expect(w.combat.comboStage).toBe(1);
    expect(w.combat.attackTimer).toBeGreaterThan(0);
    stepUntilHit(w);
    expect(w.fish!.hp).toBe(100 - LIGHT_DAMAGE[0]);
    expect(w.fish!.hitFlash).toBeGreaterThan(0);
  });

  it('a fish behind takes no hit even through a full swing', () => {
    const w = worldWithFish(0, -2);
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(100);
    expect(w.fish!.hitFlash).toBe(0);
  });

  it('a fish out of reach takes no hit even through a full swing', () => {
    const w = worldWithFish(0, 5);
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(100);
  });

  it('advances the combo when the next tap lands within the buffer window', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    expect(w.combat.comboStage).toBe(1);
    expect(w.combat.comboWindow).toBeGreaterThan(0); // buffer armed after the swing
    tap(w);
    expect(w.combat.comboStage).toBe(2);
  });

  it('resets to stage 1 when the buffer window expires', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    step(w, Math.ceil((COMBO_BUFFER + 0.05) / DT)); // let the buffer lapse
    expect(w.combat.comboStage).toBe(0);
    tap(w);
    expect(w.combat.comboStage).toBe(1); // fresh combo, not stage 2
  });

  it('stage 3 wraps back to stage 1 on the next tap', () => {
    const w = worldWithFish(0, 2);
    for (let i = 0; i < 3; i++) {
      tap(w);
      finishSwing(w);
    }
    expect(w.combat.comboStage).toBe(3);
    tap(w);
    expect(w.combat.comboStage).toBe(1);
  });

  it('deals exact per-stage light damage 6/6/10 across a full combo', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(100 - 6);
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(100 - 6 - 6);
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(100 - 6 - 6 - 10);
  });

  it('lands at most one hit per swing even across many frames', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    let dealt = 0;
    for (let i = 0; i < 40; i++) {
      step(w, 1);
      for (const h of w.combat.hits) dealt += h.damage;
    }
    expect(dealt).toBe(LIGHT_DAMAGE[0]);
    expect(w.fish!.hp).toBe(100 - LIGHT_DAMAGE[0]);
  });

  it('dodging resets the combo chain', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    tap(w);
    expect(w.combat.comboStage).toBe(2);
    w.player.dodge.active = true;
    step(w, 1);
    expect(w.combat.comboStage).toBe(0);
    expect(w.combat.comboWindow).toBe(0);
    expect(w.combat.attackTimer).toBe(0);
    w.player.dodge.active = false;
    tap(w);
    expect(w.combat.comboStage).toBe(1);
  });

  it('moving does not cancel the combo', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    w.intent.moveX = 1;
    w.intent.moveY = 0;
    tap(w);
    expect(w.combat.comboStage).toBe(2);
  });

  it('locks facing for the duration of a swing', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    w.player.facing = 2.0; // try to turn mid-swing
    step(w, 1);
    expect(w.player.facing).toBeCloseTo(0, 6); // re-locked to the swing-start facing
  });

  it('a press during an active swing is ignored (no charge, no combo advance)', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    w.intent.primary = true; // press and hold through the swing tail and beyond
    for (let i = 0; i < 30; i++) step(w, 1);
    w.intent.primary = false;
    step(w, 1);
    expect(w.combat.comboStage).toBe(1); // never advanced mid-swing
    expect(w.combat.heavyCharge).toBe(0); // never began a wind-up
  });
});

// --- T15 heavy gaff -----------------------------------------------------------

describe('T15 heavy gaff', () => {
  it('fires a heavy swing after a ≥0.35s hold and spends exactly 30 stamina', () => {
    const w = worldWithFish(0, 2);
    w.player.stamina = 30;
    holdAndRelease(w, Math.ceil(HEAVY_CHARGE_MIN / DT) + 1);
    expect(w.player.stamina).toBe(0);
    expect(w.combat.attackTimer).toBeGreaterThan(0);
    expect(w.combat.comboStage).toBe(0);
  });

  it('refuses the heavy below 30 stamina: nothing happens, no light fallback', () => {
    const w = worldWithFish(0, 2);
    w.player.stamina = 29;
    holdAndRelease(w, Math.ceil(HEAVY_CHARGE_MIN / DT) + 1);
    expect(w.player.stamina).toBe(29);
    expect(w.combat.attackTimer).toBe(0); // no swing at all
    expect(w.combat.comboStage).toBe(0); // chain untouched
    expect(w.fish!.hp).toBe(100); // no damage
  });

  it('deals heavy damage with knockback stronger than the light swing', () => {
    const light = worldWithFish(0, 2);
    tap(light);
    stepUntilHit(light);
    const lightKb = Math.hypot(light.fish!.vx, light.fish!.vz);
    expect(lightKb).toBeCloseTo(LIGHT_KNOCKBACK, 6);

    const heavy = worldWithFish(0, 2);
    holdAndRelease(heavy, Math.ceil(HEAVY_CHARGE_MIN / DT) + 1);
    stepUntilHit(heavy);
    expect(heavy.fish!.hp).toBe(100 - HEAVY_DAMAGE);
    const heavyKb = Math.hypot(heavy.fish!.vx, heavy.fish!.vz);
    expect(heavyKb).toBeCloseTo(HEAVY_KNOCKBACK, 6);
    expect(heavyKb).toBeGreaterThan(lightKb);
  });

  it('pushes stagger only on heavy hits; light hits carry stagger 0', () => {
    const light = worldWithFish(0, 2);
    tap(light);
    stepUntilHit(light);
    const lightEvt = light.combat.hits[0]!;
    expect(lightEvt.targetId).toBe(FISH_TARGET_ID);
    expect(lightEvt.damage).toBe(LIGHT_DAMAGE[0]);
    expect(lightEvt.stagger).toBe(0);
    expect(lightEvt.knockbackX).toBeCloseTo(0, 6);
    expect(lightEvt.knockbackZ).toBeCloseTo(LIGHT_KNOCKBACK, 6);

    const heavy = worldWithFish(0, 2);
    holdAndRelease(heavy, Math.ceil(HEAVY_CHARGE_MIN / DT) + 1);
    stepUntilHit(heavy);
    const heavyEvt = heavy.combat.hits[0]!;
    expect(heavyEvt.targetId).toBe(FISH_TARGET_ID);
    expect(heavyEvt.damage).toBe(HEAVY_DAMAGE);
    expect(heavyEvt.stagger).toBe(HEAVY_STAGGER);
    expect(heavyEvt.knockbackZ).toBeCloseTo(HEAVY_KNOCKBACK, 6);
  });

  it('a short hold (below the heavy threshold) stays a light tap and advances the combo', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    holdAndRelease(w, Math.ceil((HEAVY_CHARGE_MIN * 0.5) / DT)); // ~0.17s hold
    expect(w.combat.comboStage).toBe(2); // treated as a light tap
    expect(w.combat.attackTimer).toBeGreaterThan(0);
  });

  it('charging holds the light combo chain while winding up', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w); // stage 1, buffer armed
    const frozen = w.combat.comboWindow;
    expect(frozen).toBeGreaterThan(0);
    w.intent.primary = true;
    step(w, 10); // ~0.17s wind-up — the buffer must not tick down
    expect(w.combat.comboWindow).toBe(frozen);
    w.intent.primary = false;
    step(w, 1); // release as a (sub-threshold) light tap
    expect(w.combat.comboStage).toBe(2);
  });

  it('a heavy resets the light chain', () => {
    const w = worldWithFish(0, 2);
    tap(w);
    finishSwing(w);
    tap(w);
    finishSwing(w);
    expect(w.combat.comboStage).toBe(2);
    holdAndRelease(w, Math.ceil(HEAVY_CHARGE_MIN / DT) + 1);
    expect(w.combat.comboStage).toBe(0);
    expect(w.combat.attackTimer).toBeGreaterThan(0);
  });

  it('a dead fish takes no hits from any swing', () => {
    const w = worldWithFish(0, 2, 0);
    w.fish!.state = 'dead';
    w.fish!.vx = 0;
    w.fish!.vz = 0;
    tap(w);
    finishSwing(w);
    expect(w.fish!.hp).toBe(0);
    expect(w.fish!.hitFlash).toBe(0);
    expect(w.fish!.vx).toBe(0);
    expect(w.fish!.vz).toBe(0);
  });
});

// --- spec numbers pinned ------------------------------------------------------

describe('gaff combat tuning constants', () => {
  it('locks the spec numbers (plan 01 §4.4, spec 4.1)', () => {
    expect(LIGHT_DAMAGE).toEqual([6, 6, 10]);
    expect(HEAVY_DAMAGE).toBe(18);
    expect(HEAVY_STAMINA_COST).toBe(30);
    expect(HEAVY_CHARGE_MIN).toBe(0.35);
    expect(COMBO_BUFFER).toBe(0.5);
    expect(FISH_TARGET_ID).toBe(0);
  });
});