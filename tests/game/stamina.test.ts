// T12 — stamina pool tests (plan 01 §4.3, spec 4.1). Tests-first: written
// before stamina.ts was implemented. Step at the fixed DT so regen numbers are
// exact.

import { describe, it, expect } from 'vitest';
import {
  updateStamina,
  spendStamina,
  STAMINA_MAX,
  STAMINA_REGEN,
  STAMINA_DELAY,
} from '../../src/game/stamina';
import { createWorld } from '../../src/core/world';

const DT = 1 / 60;

describe('T12 stamina pool', () => {
  it('regens at exactly 40/s toward the cap once the delay has elapsed', () => {
    const w = createWorld();
    w.player.stamina = 50;
    w.player.staminaRegenDelay = 0;
    for (let i = 0; i < 60; i++) updateStamina(w, DT); // 1s of sim time
    expect(w.player.stamina).toBeCloseTo(50 + STAMINA_REGEN, 6);
  });

  it('no regen for exactly 0.8s after a spend, then regen resumes', () => {
    const w = createWorld();
    expect(spendStamina(w.player, 25)).toBe(true);
    expect(w.player.stamina).toBe(75);
    // 47/60 = 0.783s: still inside the no-regen window
    for (let i = 0; i < 47; i++) updateStamina(w, DT);
    expect(w.player.stamina).toBe(75);
    // past 0.8s the pool grows again and the delay timer reads zero
    for (let i = 0; i < 2; i++) updateStamina(w, DT);
    expect(w.player.staminaRegenDelay).toBe(0);
    expect(w.player.stamina).toBeGreaterThan(75);
  });

  it('any spend resets the delay timer even mid-regen', () => {
    const w = createWorld();
    w.player.stamina = 40;
    w.player.staminaRegenDelay = 0;
    for (let i = 0; i < 10; i++) updateStamina(w, DT); // regen some back
    expect(w.player.stamina).toBeGreaterThan(40);
    expect(spendStamina(w.player, 5)).toBe(true);
    expect(w.player.staminaRegenDelay).toBe(STAMINA_DELAY);
    const frozen = w.player.stamina;
    // 47/60 = 0.783s: the new no-regen window holds the pool frozen
    for (let i = 0; i < 47; i++) updateStamina(w, DT);
    expect(w.player.stamina).toBe(frozen);
  });

  it('clamps at the 100 cap (never overfills)', () => {
    const w = createWorld();
    w.player.stamina = STAMINA_MAX - 1;
    w.player.staminaRegenDelay = 0;
    for (let i = 0; i < 600; i++) updateStamina(w, DT); // 10s
    expect(w.player.stamina).toBe(STAMINA_MAX);
  });

  it('failed spend returns false, leaves the pool unchanged, keeps the delay', () => {
    const w = createWorld();
    w.player.stamina = 24;
    w.player.staminaRegenDelay = 0.2;
    expect(spendStamina(w.player, 25)).toBe(false);
    expect(w.player.stamina).toBe(24);
    expect(w.player.staminaRegenDelay).toBe(0.2);
  });

  it('successful spend subtracts exactly the amount and starts the delay', () => {
    const w = createWorld();
    w.player.stamina = 100;
    expect(spendStamina(w.player, 25)).toBe(true);
    expect(w.player.stamina).toBe(75);
    expect(w.player.staminaRegenDelay).toBe(STAMINA_DELAY);
  });
});