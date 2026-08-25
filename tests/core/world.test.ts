import { describe, it, expect } from 'vitest';
import { createWorld, resetWorld, createFish } from '../../src/core/world';

describe('WorldState M1 shapes', () => {
  it('player has the full M1 shape with sensible defaults', () => {
    const w = createWorld();
    const p = w.player;
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
    expect(p.facing).toBe(0);
    expect(p.vx).toBe(0);
    expect(p.vz).toBe(0);
    expect(p.stamina).toBe(100);
    expect(p.staminaRegenDelay).toBe(0);
    expect(p.dodge).toEqual({ active: false, timeLeft: 0, cooldownLeft: 0, dirX: 0, dirZ: 0 });
    expect(p.iframes).toBe(0);
    expect(p.hp).toBe(100);
    expect(p.radius).toBeGreaterThan(0);
  });

  it('combat carries combo/attack/heavy/hits state', () => {
    const c = createWorld().combat;
    expect(c.comboStage).toBe(0);
    expect(c.comboWindow).toBe(0);
    expect(c.attackTimer).toBe(0);
    expect(c.heavyCharge).toBe(0);
    expect(Array.isArray(c.hits)).toBe(true);
    expect(c.hits).toHaveLength(0);
  });

  it('combat.hits accepts pending hit events with the full shape', () => {
    const w = createWorld();
    w.combat.hits.push({ targetId: 1, damage: 12, knockbackX: 0.4, knockbackZ: -0.2, stagger: 0.2 });
    expect(w.combat.hits).toHaveLength(1);
    expect(w.combat.hits[0]).toEqual({
      targetId: 1,
      damage: 12,
      knockbackX: 0.4,
      knockbackZ: -0.2,
      stagger: 0.2,
    });
  });

  it('ground boundary is a 20m circle at the origin', () => {
    const g = createWorld().ground;
    expect(g.x).toBe(0);
    expect(g.z).toBe(0);
    expect(g.radius).toBe(20);
  });

  it('fish is null until spawned', () => {
    expect(createWorld().fish).toBeNull();
  });

  it('mode defaults to boat (M0 behaviour)', () => {
    expect(createWorld().mode).toBe('boat');
  });

  it('createFish() returns an idle fish with a zeroed 8-segment spine', () => {
    const f = createFish();
    expect(f.state).toBe('idle');
    expect(f.hp).toBe(f.maxHp);
    expect(f.hp).toBeGreaterThan(0);
    expect(f.stamina).toBeGreaterThan(0);
    expect(f.spine).toBeInstanceOf(Float32Array);
    expect(f.spine.length).toBe(8);
    for (let i = 0; i < f.spine.length; i++) expect(f.spine[i]).toBe(0);
    expect(f.hitFlash).toBe(0);
    expect(f.radius).toBeGreaterThan(0);
  });

  it('resetWorld re-defaults M1 fields but keeps ui.debug and sets the seed', () => {
    const w = createWorld();
    w.ui.debug = true;
    w.player.x = 5;
    w.player.vx = 2;
    w.combat.comboStage = 3;
    w.combat.hits.push({ targetId: 1, damage: 1, knockbackX: 0, knockbackZ: 0, stagger: 0 });
    w.fish = createFish();
    w.fish.x = 9;

    const r = resetWorld(w, 7);
    expect(r.ui.debug).toBe(true);
    expect(r.seed).toBe(7);
    expect(r.player.x).toBe(0);
    expect(r.player.vx).toBe(0);
    expect(r.combat.comboStage).toBe(0);
    expect(r.combat.hits).toHaveLength(0);
    expect(r.fish).toBeNull();
    // collections are fresh, never shared with the previous run
    expect(r.combat.hits).not.toBe(w.combat.hits);
  });
});
describe('shared-default isolation (QA round)', () => {
  it('mutating one world\'s tuning/line never leaks into module defaults or new worlds', async () => {
    const { DEFAULT_TUNING } = await import('../../src/game/tuning');
    const { BASE_LINE } = await import('../../src/game/line');
    const a = createWorld(1);
    a.tuning.pullForce = 99;
    a.line.reelRate = 42;
    expect(DEFAULT_TUNING.pullForce).not.toBe(99);
    expect(BASE_LINE.reelRate).not.toBe(42);
    const b = createWorld(2);
    expect(b.tuning.pullForce).toBe(DEFAULT_TUNING.pullForce);
    expect(b.line.reelRate).toBe(BASE_LINE.reelRate);
  });
});
