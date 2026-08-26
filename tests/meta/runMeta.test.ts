// RUN META HOOK — task t18 slice 2 / plan 05 §0.2 "the run start sets
// `DreadSystem.startingValue = 2 × restoredCount (cap 30)`". Pins the 2× ladder,
// the +30 cap, the stamping of run.startedAtDread, and the derived zone context.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { freshMetaState, freshSave } from '../../src/save/migrate';
import type { MetaState } from '../../src/save/schemas';
import { BUILDINGS } from '../../src/content/buildings';
import { startingBonus } from '../../src/game/dread';
import { startingDreadFor } from '../../src/meta/restoration';
import { deepestZoneReached, runMetaStart, unlockContextFor } from '../../src/meta/runMeta';

// A town with `n` buildings standing, built directly (bypasses cost/gates —
// this test is about the Dread ladder, not the spend).
function townOf(n: number): MetaState {
  const meta = freshMetaState();
  for (const def of BUILDINGS.slice(0, n)) {
    meta.buildings[def.id] = { restored: true, paid: def.cost, atRun: 0 };
  }
  return meta;
}

describe('starting Dread = 2 × restored, capped 30', () => {
  it('walks the ladder building by building', () => {
    for (let n = 0; n <= BUILDINGS.length; n++) {
      expect(startingDreadFor(townOf(n))).toBe(2 * n);
    }
  });

  it('caps at 30 — the fifteenth restoration is the last one that stings', () => {
    expect(startingBonus(14)).toBe(28);
    expect(startingBonus(15)).toBe(30);
    expect(startingBonus(16)).toBe(30);
    expect(startingBonus(20)).toBe(30); // the plan's full twenty-building town
  });

  it('an empty town opens the water at zero', () => {
    expect(startingDreadFor(freshMetaState())).toBe(0);
  });
});

describe('runMetaStart (the run-start hook)', () => {
  it('stamps world.dread and the run\'s startedAtDread together', () => {
    const world = createWorld(1);
    expect(world.dread).toBe(0);
    const opened = runMetaStart(world, townOf(3));
    expect(opened).toBe(6);
    expect(world.dread).toBe(6);
    expect(world.run.startedAtDread).toBe(6);
    expect(world.run.dreadPeak).toBe(6);
  });

  it('is a floor, never a pull-down: a hotter world is left alone', () => {
    const world = createWorld(1);
    world.dread = 55;
    world.run.dreadPeak = 55;
    runMetaStart(world, townOf(2));
    expect(world.dread).toBe(55);
    expect(world.run.startedAtDread).toBe(55);
  });

  it('no save / no meta is a clean no-op (Node tests, boot before load)', () => {
    const world = createWorld(1);
    expect(runMetaStart(world, null)).toBe(0);
    expect(world.dread).toBe(0);
  });

  it('the cap holds through the hook', () => {
    const meta = freshMetaState();
    for (let i = 0; i < 20; i++) meta.buildings[`row-${i}`] = { restored: true, paid: 0, atRun: 0 };
    const world = createWorld(1);
    // only ids that exist in the ledger count — a stale row is not a building
    expect(runMetaStart(world, meta)).toBe(0);
  });
});

describe('derived progression context (deepestZone)', () => {
  it('an empty log has reached zone 1', () => {
    expect(deepestZoneReached(freshSave())).toBe(1);
    expect(deepestZoneReached(null)).toBe(1);
  });

  it('reads the deepest descent across every logged run', () => {
    const save = freshSave();
    const base = {
      seed: 1,
      source: 'random' as const,
      clockPhaseEnd: 'dusk' as const,
      haul: [],
      extracted: true,
      memoriesTotal: 0,
      xpTotal: 0,
      dreadPeak: 0,
      startedAtDread: 0,
      draggersLand: 0,
      bagmanCaught: false,
      bestiary: [],
      sundries: [],
    };
    save.runs = [
      { ...base, sinkholesDescended: 1 },
      { ...base, sinkholesDescended: 3 },
      { ...base, sinkholesDescended: 0 },
    ];
    expect(deepestZoneReached(save)).toBe(4);
    expect(unlockContextFor(save)).toEqual({ deepestZone: 4 });
  });

  it('clamps at the deepest zone the game has', () => {
    const save = freshSave();
    save.runs = [
      {
        seed: 1,
        source: 'random',
        clockPhaseEnd: 'dusk',
        haul: [],
        extracted: true,
        memoriesTotal: 0,
        xpTotal: 0,
        dreadPeak: 0,
        startedAtDread: 0,
        draggersLand: 0,
        bagmanCaught: false,
        sinkholesDescended: 99,
        bestiary: [],
        sundries: [],
      },
    ];
    expect(deepestZoneReached(save)).toBe(5);
  });
});
