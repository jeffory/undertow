// SAVES — tests-first (plan 03 §8, task t12 #5; task t19 → v2; task t18 → v3).
// Pins the zod schema round-trip, the version-0/1/2 → current migrations, the
// refuse-forward-data rule, corrupt import rejection, and the meta/cap
// bookkeeping on persist — plus the M4 folds (bestiary events → entry states,
// sundries → box, tribute XP → license) and the M5 town slice.

import { describe, it, expect } from 'vitest';
import {
  SAVE_VERSION,
  SaveGameSchema,
  type SaveGame,
} from '../../src/save/schemas';
import {
  migrate,
  freshSave,
  applyRunResult,
  RUNS_CAP,
  exportSave,
  importSave,
} from '../../src/save/migrate';

const result = () => ({
  seed: 123,
  source: 'random' as const,
  clockPhaseEnd: 'night' as const,
  haul: [
    {
      species: 'capsule',
      tier: 2,
      weight: 9.4,
      clean: true,
      memories: 28,
      xp: 28,
    },
  ],
  extracted: true,
  memoriesTotal: 28,
  xpTotal: 28,
  dreadPeak: 47,
  startedAtDread: 0,
  draggersLand: 0,
  bagmanCaught: false,
  sinkholesDescended: 0,
});

// A v1 blob (pre-M4) — the shape every real save from before this round has.
function sampleV1(): Record<string, unknown> {
  return {
    version: 1,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
  };
}

// A v2 blob (pre-M5) — the shape every real save from the M4 rounds has.
function sampleV2(): Record<string, unknown> {
  return {
    version: 2,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
    bestiary: {},
    license: { grade: 1, xp: 0 },
    box: [],
    equipped: [],
  };
}

function sampleSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
    bestiary: {},
    license: { grade: 1, xp: 0 },
    box: [],
    equipped: [],
    metaState: {
      buildings: {},
      memories: 0,
      notesRead: [],
      decants: 0,
      damKeyUsed: false,
      forwardingAddress: false,
      truthSeen: false,
      breadcrumbs: [],
      endingsSeen: {},
      nplus: false,
    },
    rigLoadout: { rodId: null, lineId: null, lureIds: [], trinketIds: [], consumables: [] },
  };
}

describe('schema round-trip', () => {
  it('a SaveGame serializes and parses back exactly', () => {
    const save = sampleSave();
    const raw = JSON.stringify(save);
    const parsed = SaveGameSchema.parse(JSON.parse(raw));
    expect(parsed).toEqual(save);
  });

  it('a run with a full result round-trips through the schema', () => {
    const save = applyRunResult(sampleSave(), result());
    expect(SaveGameSchema.parse(save)).toEqual(save);
    expect(save.runs[0]!.memoriesTotal).toBe(28);
  });

  it('meta rejects wrong shapes (zod enforces version, ints, types)', () => {
    expect(() =>
      SaveGameSchema.parse({ version: 1, meta: { memoriesTotal: 'x' }, runs: [] }),
    ).toThrow();
    expect(() => SaveGameSchema.parse({ version: 2, meta: {}, runs: [] })).toThrow();
  });

  it('a run with bestiary events + sundries round-trips (the v2 fields)', () => {
    const save = applyRunResult(sampleSave(), {
      ...result(),
      bestiary: [
        { speciesId: 'glass-minnow', event: 'hooked' },
        { speciesId: 'glass-minnow', event: 'clean' },
      ],
      sundries: [
        {
          id: 'trinket-abc',
          name: 'Damp of Held Water',
          rarity: 'R',
          slot: 'trinket',
          prefix: 'damp',
          suffix: 'held-water',
          effects: [
            { key: 'staminaRegen', value: 8 },
            { key: 'brace', value: 0.25 },
          ],
        },
      ],
    });
    expect(SaveGameSchema.parse(save)).toEqual(save);
    expect(save.bestiary['glass-minnow']!.cleanCatch).toBe(true);
    expect(save.box[0]!.name).toBe('Damp of Held Water');
  });
});

describe('migrate (versioned, forward-data-safe)', () => {
  it('passes a current-version save through unchanged', () => {
    const save = sampleSave();
    expect(migrate(save)).toEqual(save);
  });

  it('migrates a version-0 stub up to current defaults', () => {
    const v0 = { version: 0 };
    const out = migrate(v0 as unknown as Record<string, unknown>);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.meta).toEqual({ memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false });
    expect(out.runs).toEqual([]);
    expect(out.bestiary).toEqual({});
    expect(out.license).toEqual({ grade: 1, xp: 0 });
    expect(out.box).toEqual([]);
    expect(out.equipped).toEqual([]);
    expect(out.metaState).toEqual(sampleSave().metaState);
  });

  it('a raw object with no version migrates as a fresh save', () => {
    expect(migrate({} as Record<string, unknown>)).toEqual(sampleSave());
  });

  it('refuses an unknown NEWER version — never destroys forward data', () => {
    expect(() => migrate({ version: 99 } as Record<string, unknown>)).toThrow(/newer/);
    expect(() => migrate({ version: 42, meta: {}, runs: [] } as Record<string, unknown>)).toThrow();
  });

  it('rejects structurally-corrupt JSON (zod), even with the right version', () => {
    expect(() => migrate({ version: 2, meta: { runsCompleted: 'nope' } })).toThrow();
  });

  it('v1 → current: keeps meta + runs and adds the M4/M5 slices empty', () => {
    const v1 = {
      ...sampleV1(),
      runs: [
        {
          seed: 1,
          source: 'random',
          clockPhaseEnd: 'dusk',
          haul: [{ species: 'capsule', tier: 1, weight: 4, clean: true, memories: 6, xp: 6 }],
          extracted: true,
          memoriesTotal: 6,
          xpTotal: 6,
          dreadPeak: 0,
          startedAtDread: 0,
        },
      ],
    };
    const out = migrate(v1);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.meta).toEqual(v1.meta);
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.memoriesTotal).toBe(6);
    expect(out.bestiary).toEqual({});
    expect(out.license).toEqual({ grade: 1, xp: 0 });
    expect(out.box).toEqual([]);
    expect(out.equipped).toEqual([]);
    expect(out.metaState).toEqual(sampleSave().metaState);
  });

  it('v2 → current: keeps every M4 slice and adds an EMPTY town', () => {
    const v2 = {
      ...sampleV2(),
      license: { grade: 3, xp: 900 },
      equipped: ['trink-1'],
      box: [
        {
          id: 'trink-1',
          name: 'Damp of Held Water',
          rarity: 'U',
          slot: 'trinket',
          effects: [{ key: 'staminaRegen', value: 1.5 }],
        },
      ],
    };
    const out = migrate(v2);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.license).toEqual({ grade: 3, xp: 900 });
    expect(out.equipped).toEqual(['trink-1']);
    expect(out.box).toHaveLength(1);
    expect(out.metaState.buildings).toEqual({});
    expect(out.metaState.notesRead).toEqual([]);
    expect(out.metaState.nplus).toBe(false);
  });

  it('v2 → current: the lifetime Memories tally becomes the town\'s opening purse', () => {
    const v2 = { ...sampleV2(), meta: { memoriesTotal: 420, runsCompleted: 9, bestHaul: 88, seenIntro: true } };
    const out = migrate(v2);
    expect(out.metaState.memories).toBe(420);
    expect(out.meta.memoriesTotal).toBe(420); // the odometer is untouched
  });

  it('a corrupt v1 blob is rejected, not silently wiped', () => {
    expect(() => migrate({ version: 1, meta: { runsCompleted: 'nope' } })).toThrow();
  });
});

describe('applyRunResult (meta + append log + M4 folds)', () => {
  it('appends the run, sums memories, bumps runsCompleted, tracks bestHaul', () => {
    const save = applyRunResult(sampleSave(), result());
    expect(save.meta.memoriesTotal).toBe(28);
    expect(save.meta.runsCompleted).toBe(1);
    expect(save.meta.bestHaul).toBe(28);
    expect(save.runs).toHaveLength(1);

    const second = applyRunResult(save, { ...result(), memoriesTotal: 9, xpTotal: 9 });
    expect(second.meta.memoriesTotal).toBe(37);
    expect(second.meta.runsCompleted).toBe(2);
    expect(second.meta.bestHaul).toBe(28); // 28 > 9
    expect(second.runs).toHaveLength(2);
  });

  it('a death (30% of 28 → 9) banks partial memories', () => {
    const death = { ...result(), extracted: false, memoriesTotal: 9, xpTotal: 9 };
    const save = applyRunResult(sampleSave(), death);
    expect(save.meta.memoriesTotal).toBe(9);
    expect(save.runs[0]!.extracted).toBe(false);
  });

  it('the runs log is capped at RUNS_CAP (append keeps the newest)', () => {
    let save = sampleSave();
    for (let i = 0; i < RUNS_CAP + 5; i++) {
      save = applyRunResult(save, { ...result(), seed: i, memoriesTotal: 1, xpTotal: 1 });
    }
    expect(save.runs.length).toBe(RUNS_CAP);
    expect(save.runs[RUNS_CAP - 1]!.seed).toBe(RUNS_CAP + 4); // newest survives
  });

  it('bestiary events fold into the entry state on persist', () => {
    const save = applyRunResult(sampleSave(), {
      ...result(),
      bestiary: [
        { speciesId: 'bottle-post', event: 'hooked' },
        { speciesId: 'bottle-post', event: 'clean' },
      ],
    });
    const entry = save.bestiary['bottle-post']!;
    expect(entry.seen).toBe(true);
    expect(entry.fought).toBe(true);
    expect(entry.cleanCatch).toBe(true);
    expect(entry.catches).toBe(1);
  });

  it('sundries are retained in the box and the equipped loadout survives', () => {
    const boxed = sampleSave();
    boxed.box = [
      {
        id: 'trinket-old',
        name: 'Municipal of Morning',
        rarity: 'U',
        slot: 'trinket',
        effects: [],
      },
    ];
    boxed.equipped = ['trinket-old'];
    const save = applyRunResult(boxed, {
      ...result(),
      sundries: [{ id: 'trinket-new', name: 'Barnacled of the Spillway', rarity: 'R', slot: 'trinket', effects: [] }],
    });
    expect(save.box.map((i) => i.id)).toEqual(['trinket-old', 'trinket-new']);
    expect(save.equipped).toEqual(['trinket-old']);
  });

  it('tribute XP accrues in the license and the grade recomputes', () => {
    const save = applyRunResult(sampleSave(), { ...result(), xpTotal: 130 });
    expect(save.license.xp).toBe(130);
    expect(save.license.grade).toBe(2);
  });
});

describe('export / import', () => {
  it('exportSave is a JSON blob; importSave round-trips it', () => {
    const save = applyRunResult(sampleSave(), result());
    const json = exportSave(save);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(importSave(JSON.parse(json))).toEqual(save);
  });

  it('importSave rejects corrupt JSON', () => {
    expect(() => importSave('not json' as unknown as string)).toThrow();
    expect(() => importSave({ version: 2, meta: { bad: true }, runs: 'x' })).toThrow();
  });

  it('importSave migrates an old-version blob instead of rejecting it', () => {
    const imported = importSave({ version: 0 });
    expect(imported.version).toBe(SAVE_VERSION);
    const v1 = importSave(sampleV1());
    expect(v1.version).toBe(SAVE_VERSION);
    expect(v1.license).toEqual({ grade: 1, xp: 0 });
    expect(v1.metaState.buildings).toEqual({});
  });
});