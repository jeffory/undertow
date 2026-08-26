// META STATE (save) — task t18 slice 1. Pins the plan 05 §0.2 slice itself: the
// zod round-trip (every field survives JSON), the defaults an incomplete blob
// gets, and the migration contract the task names — AN OLD SAVE LOADS AND GETS
// AN EMPTY META SLICE.

import { describe, it, expect } from 'vitest';
import { MetaStateSchema, SaveGameSchema, SAVE_VERSION } from '../../src/save/schemas';
import { freshMetaState, freshSave, migrate, applyRunResult } from '../../src/save/migrate';

const run = () => ({
  seed: 7,
  source: 'random' as const,
  clockPhaseEnd: 'night' as const,
  haul: [{ species: 'bell-carp', tier: 2, weight: 6, clean: true, memories: 18, xp: 18 }],
  extracted: true,
  memoriesTotal: 18,
  xpTotal: 18,
  dreadPeak: 30,
  startedAtDread: 0,
  draggersLand: 0,
  bagmanCaught: false,
  sinkholesDescended: 0,
});

describe('MetaState schema (plan 05 §0.2)', () => {
  // Ten, not eight: plan §0.2 lists eight, but §1.4 gates restoration rows on
  // `forwardingAddress:true` and §2.2 makes the Postmaster drop it, so M7 added
  // the ninth; §2.3's truth scene is the tenth (M10's endings read it). Both were
  // added the way every deferred slot was — DEFAULTED, no version bump.
  it('carries the eight fields plan §0.2 names, plus forwardingAddress + truthSeen', () => {
    expect(Object.keys(freshMetaState()).sort()).toEqual(
      [
        'breadcrumbs',
        'buildings',
        'damKeyUsed',
        'decants',
        'endingsSeen',
        'forwardingAddress',
        'memories',
        'notesRead',
        'nplus',
        'truthSeen',
      ].sort(),
    );
  });

  it('round-trips through JSON exactly', () => {
    const meta = {
      buildings: {
        smokehouse: { restored: true, paid: 40, atRun: 3 },
        chapel: { restored: true, paid: 60, atRun: 5 },
      },
      memories: 217,
      notesRead: ['notice-1', 'notice-2'],
      decants: 2,
      damKeyUsed: true,
      forwardingAddress: true,
      truthSeen: true,
      breadcrumbs: ['tin-locket'],
      endingsSeen: { haul: true },
      nplus: true,
    };
    const parsed = MetaStateSchema.parse(JSON.parse(JSON.stringify(meta)));
    expect(parsed).toEqual(meta);
  });

  it('an empty object defaults to the empty town (no throw)', () => {
    expect(MetaStateSchema.parse({})).toEqual(freshMetaState());
  });

  it('rejects wrong shapes — negative Memories, a non-boolean restored flag', () => {
    expect(() => MetaStateSchema.parse({ memories: -5 })).toThrow();
    expect(() => MetaStateSchema.parse({ buildings: { smokehouse: { restored: 'yes' } } })).toThrow();
  });

  it('the full SaveGame requires the slice (a v3 save without it is corrupt)', () => {
    const s = freshSave() as Record<string, unknown>;
    delete s.metaState;
    expect(() => SaveGameSchema.parse(s)).toThrow();
  });
});

describe('migration: an old save loads and gets a fresh meta slice', () => {
  it('a v1 blob (pre-M4) lands on the current version with an empty town', () => {
    const out = migrate({
      version: 1,
      meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
      runs: [],
    });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.metaState).toEqual(freshMetaState());
  });

  it('a v2 blob (pre-M5) keeps its M4 data and gains an empty town', () => {
    const out = migrate({
      version: 2,
      meta: { memoriesTotal: 130, runsCompleted: 4, bestHaul: 60, seenIntro: true },
      runs: [],
      bestiary: { 'bell-carp': { speciesId: 'bell-carp', seen: true, fought: true, cleanCatch: true, willing: false, kills: 1, catches: 2 } },
      license: { grade: 2, xp: 130 },
      box: [],
      equipped: [],
    });
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.license.grade).toBe(2);
    expect(out.bestiary['bell-carp']!.cleanCatch).toBe(true);
    expect(out.metaState.buildings).toEqual({});
    expect(out.metaState.memories).toBe(130); // banked Memories carry into the purse
  });
});

describe('Memories are banked into the town purse at run end', () => {
  it('applyRunResult adds the receipt total to metaState.memories', () => {
    const save = freshSave();
    const after = applyRunResult(save, run());
    expect(after.metaState.memories).toBe(18);
    expect(after.meta.memoriesTotal).toBe(18);
  });

  it('two runs accumulate, and the purse is independent of the odometer', () => {
    let save = freshSave();
    save = applyRunResult(save, run());
    // spend some of the purse (as the restoration ledger would)
    save = { ...save, metaState: { ...save.metaState, memories: 0 } };
    save = applyRunResult(save, run());
    expect(save.metaState.memories).toBe(18); // purse: spent, then re-earned
    expect(save.meta.memoriesTotal).toBe(36); // odometer: never spent
  });

  it('a save with no town slice still banks (the defensive branch)', () => {
    const legacy = { ...freshSave() } as Record<string, unknown>;
    delete legacy.metaState;
    const after = applyRunResult(legacy as never, run());
    expect(after.metaState.memories).toBe(18);
  });
});
