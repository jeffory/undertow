// BARKS — task t19 slice 2. Pins the two pure rules (deterministic rotation
// seeded by run seed + building + visit count, and the mask-slip gate at 5+
// restorations) plus the sim-side once-per-approach cooldown (systems/barks).

import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/core/world';
import { ensureLake } from '../../src/gen/lakeWorld';
import { initSaveSystem, updateSave, getSave } from '../../src/core/save';
import { BUILDINGS } from '../../src/content/buildings';
import { townSlots } from '../../src/meta/hubStreet';
import { barkForRun, barkPool, buildingSeed, MASK_SLIP_THRESHOLD } from '../../src/meta/barks';
import { barkSetFor } from '../../src/content/townCopy';
import { updateBarks } from '../../src/systems/barks';
import { clearTownEvents, drainTownEvents } from '../../src/meta/townEvents';
import type { MetaState } from '../../src/save/schemas';

function town(n: number): (m: MetaState) => MetaState {
  return (meta) => {
    const buildings: MetaState['buildings'] = {};
    const ids = ['smokehouse', 'chandlery', 'post-office', 'bell-tower', 'chapel'];
    for (const id of ids.slice(0, n)) buildings[id] = { restored: true, paid: 0, atRun: 0 };
    return { ...meta, buildings };
  };
}

describe('barkForRun determinism + rotation', () => {
  it('the same (seed, building, visit, restored) always picks the same line', () => {
    const a = barkForRun(2026, 'smokehouse', 0, 2);
    const b = barkForRun(2026, 'smokehouse', 0, 2);
    expect(a).toEqual(b);
    expect(a?.buildingId).toBe('smokehouse');
    expect(a?.residentName).toBe(barkSetFor('smokehouse')?.residentName);
  });

  it('different seeds pick a different line (across the pool, not always)', () => {
    const set = barkSetFor('smokehouse')!;
    const picks = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      picks.add(barkForRun(seed, 'smokehouse', 0, 2)!.text);
    }
    // 3 standard barks across 40 seeds — the rotation is not pinned to index 0
    expect(picks.size).toBeGreaterThan(1);
  });

  it('advancing the visit count rotates the pool deterministically', () => {
    // The same seed + building over 8 visits must cover more than one standard
    // bark (the visit count is the "advance" of the rotation).
    const picks = new Set<string>();
    for (let v = 0; v < 8; v++) picks.add(barkForRun(1234, 'bakery', v, 2)!.text);
    expect(picks.size).toBeGreaterThan(1);
  });

  it('never uses Math.random: the output is a pure function of its inputs', () => {
    const rng = Math.random;
    let calls = 0;
    Math.random = () => (calls++, 0.5);
    try {
      barkForRun(99, 'chapel', 3, 1);
    } finally {
      Math.random = rng;
    }
    expect(calls).toBe(0);
  });

  it('buildingSeed is stable and distinguishes buildings', () => {
    expect(buildingSeed('smokehouse')).toBe(buildingSeed('smokehouse'));
    expect(buildingSeed('smokehouse')).not.toBe(buildingSeed('bakery'));
  });
});

describe('mask-slip gate (5+ restorations, town.md §4)', () => {
  it('below the threshold the pool is only the standard barks', () => {
    const set = barkSetFor('smokehouse')!;
    const pool = barkPool(set, MASK_SLIP_THRESHOLD - 1);
    expect(pool.every((l) => !l.maskSlipping)).toBe(true);
    expect(pool.length).toBe(set.barksStandard.length);
  });

  it('at/above the threshold the escalation bark joins the pool', () => {
    const set = barkSetFor('smokehouse')!;
    const pool = barkPool(set, MASK_SLIP_THRESHOLD);
    expect(pool.some((l) => l.maskSlipping && l.text === set.barkMaskSlipping)).toBe(true);
    expect(pool.length).toBe(set.barksStandard.length + 1);
  });

  it('barkForRun only ever returns a mask-slip line at/above the threshold', () => {
    for (let n = 0; n < MASK_SLIP_THRESHOLD; n++) {
      const line = barkForRun(7, 'post-office', 0, n);
      expect(line?.maskSlipping).toBe(false);
    }
    // and it CAN return one at the threshold (some seed lands on the pool's last slot)
    const maskLines = [];
    for (let seed = 1; seed <= 200; seed++) {
      const line = barkForRun(seed, 'post-office', 0, MASK_SLIP_THRESHOLD);
      if (line?.maskSlipping) maskLines.push(seed);
    }
    expect(maskLines.length).toBeGreaterThan(0);
  });
});

describe('once-per-approach cooldown (systems/barks)', () => {
  beforeAll(async () => {
    await initSaveSystem();
  });

  function footWorldAtBuilding(buildingId: string, restoredCount: number) {
    const world = createWorld(2026);
    ensureLake(world);
    const lake = world.lake!;
    const iso = lake.islets[lake.startIslet]!;
    world.mode = 'foot';
    world.dockedIslet = lake.startIslet;
    const i = BUILDINGS.findIndex((b) => b.id === buildingId);
    const slot = townSlots(iso, BUILDINGS.length)[i];
    world.player.x = slot!.x;
    world.player.z = slot!.z;
    return world;
  }

  it('fires once on approach, resets on leaving, re-fires on re-approach', async () => {
    await updateSave((s) => ({ ...s, metaState: town(1)(s.metaState) }));
    clearTownEvents();
    const world = footWorldAtBuilding('smokehouse', 1);

    updateBarks(world, 1 / 60);
    const first = world.town.pendingBark;
    expect(first).not.toBeNull();
    expect(first?.buildingId).toBe('smokehouse');
    expect(world.town.barks.visits['smokehouse']).toBe(1);
    expect(world.town.barks.fired['smokehouse']).toBe(true);
    // deterministic: exactly what the pure rotation says for visit 0
    const pure = barkForRun(world.seed, 'smokehouse', 0, 1);
    expect(first?.text).toBe(pure?.text);
    // the townEvents queue carries the bark.shown record (the audio worker's hook)
    const evs = drainTownEvents();
    expect(evs.some((e) => e.type === 'bark.shown' && e.buildingId === 'smokehouse')).toBe(true);

    // still standing there: no second bark
    world.town.pendingBark = null;
    updateBarks(world, 1 / 60);
    expect(world.town.pendingBark).toBeNull();

    // leave the doorstep: cooldown resets
    world.player.x += 500;
    updateBarks(world, 1 / 60);
    expect(world.town.barks.fired['smokehouse']).toBeUndefined();

    // re-approach: fires again, visit count advances, and the line matches the
    // pure rotation for the advanced visit (rotation may legitimately repeat a
    // line — what matters is it is deterministic)
    world.player.x -= 500;
    updateBarks(world, 1 / 60);
    expect(world.town.pendingBark).not.toBeNull();
    expect(world.town.barks.visits['smokehouse']).toBe(2);
    const second = world.town.pendingBark!;
    const pure2 = barkForRun(world.seed, 'smokehouse', 1, 1);
    expect(second.text).toBe(pure2!.text);
  });

  it('never barks at an unrestored foundation', async () => {
    await updateSave((s) => ({ ...s, metaState: town(0)(s.metaState) }));
    const world = footWorldAtBuilding('smokehouse', 0);
    updateBarks(world, 1 / 60);
    expect(world.town.pendingBark).toBeNull();
  });

  it('is a FOOT verb on the START islet', async () => {
    await updateSave((s) => ({ ...s, metaState: town(1)(s.metaState) }));
    const world = footWorldAtBuilding('smokehouse', 1);
    world.mode = 'boat';
    updateBarks(world, 1 / 60);
    expect(world.town.pendingBark).toBeNull();
  });
});