// RIG LOADOUT (save) — task t19 slice 2. Pins the plan 05 §1.2 slice: the zod
// round-trip, the v3→v4 migration seeding trinketIds from the legacy `equipped`
// mirror, and the run-end carry-through (the Office holds the requisition).

import { describe, it, expect } from 'vitest';
import {
  RigLoadoutSchema,
  SaveGameSchema,
  SAVE_VERSION,
} from '../../src/save/schemas';
import { freshRigLoadout, freshSave, migrate, applyRunResult } from '../../src/save/migrate';

const run = () => ({
  seed: 7,
  source: 'random' as const,
  clockPhaseEnd: 'night' as const,
  haul: [],
  extracted: true,
  memoriesTotal: 18,
  xpTotal: 18,
  dreadPeak: 30,
  startedAtDread: 0,
});

describe('RigLoadout schema (plan 05 §1.2)', () => {
  it('round-trips a full loadout through JSON exactly', () => {
    const loadout = {
      rodId: 'rod-dredger',
      lineId: 'braided-sinew',
      lureIds: ['Chum Knot', 'Lantern Grub'],
      trinketIds: ['trinket-a', 'trinket-b'],
      consumables: ['Bottled Light', 'Office Biscuit'],
    };
    const parsed = RigLoadoutSchema.parse(JSON.parse(JSON.stringify(loadout)));
    expect(parsed).toEqual(loadout);
  });

  it('an empty object defaults to the empty loadout (no throw)', () => {
    expect(RigLoadoutSchema.parse({})).toEqual(freshRigLoadout());
  });

  it('rejects over-cap lure/trinket arrays (the register caps at selection)', () => {
    expect(() => RigLoadoutSchema.parse({ lureIds: ['a', 'b', 'c', 'd'] })).toThrow();
    expect(() => RigLoadoutSchema.parse({ trinketIds: ['x', 'y', 'z'] })).toThrow();
  });

  it('a fresh save carries an empty loadout, and the full SaveGame requires it', () => {
    const s = freshSave();
    expect(s.rigLoadout).toEqual(freshRigLoadout());
    expect(SaveGameSchema.parse(s)).toEqual(s);
    const missing = { ...s, rigLoadout: undefined } as unknown as Record<string, unknown>;
    delete missing.rigLoadout;
    expect(() => SaveGameSchema.parse(missing)).toThrow();
  });
});

describe('v3 → v4 migration: the loadout is seeded from the legacy equipped mirror', () => {
  it('a v3 blob (pre-rig-up) keeps its town slice and gains an empty loadout', () => {
    const v3 = {
      version: 3,
      meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
      runs: [],
      bestiary: {},
      license: { grade: 2, xp: 130 },
      box: [],
      equipped: [],
      metaState: { ...freshSave().metaState, memories: 12 },
    };
    const out = migrate(v3);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.rigLoadout).toEqual(freshRigLoadout());
    expect(out.metaState.memories).toBe(12); // the town slice survives
    expect(out.license.grade).toBe(2);
  });

  it('already-equipped trinkets carry into rigLoadout.trinketIds', () => {
    const v3 = {
      version: 3,
      meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
      runs: [],
      bestiary: {},
      license: { grade: 1, xp: 0 },
      box: [],
      equipped: ['trink-old', 'trink-second'],
      metaState: freshSave().metaState,
    };
    const out = migrate(v3);
    expect(out.rigLoadout.trinketIds).toEqual(['trink-old', 'trink-second']);
    expect(out.equipped).toEqual(['trink-old', 'trink-second']); // mirror kept
  });
});

describe('the loadout rides through run end', () => {
  it('applyRunResult carries rod/line/lure/trinket/consumable unchanged', () => {
    const save = freshSave();
    save.rigLoadout = {
      rodId: 'rod-longliner',
      lineId: 'bellwire',
      lureIds: ['Wailing Spoon'],
      trinketIds: ['t-1'],
      consumables: ['Damp Grain'],
    };
    const after = applyRunResult(save, run());
    expect(after.rigLoadout).toEqual(save.rigLoadout);
    expect(SaveGameSchema.parse(after)).toEqual(after);
  });

  it('a legacy save without the slice still carries an empty loadout through', () => {
    const legacy = freshSave() as Record<string, unknown>;
    delete legacy.rigLoadout;
    const after = applyRunResult(legacy as never, run());
    expect(after.rigLoadout).toEqual(freshRigLoadout());
  });
});