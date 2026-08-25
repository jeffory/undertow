// SAVES — tests-first (plan 03 §8, task t12 #5). Pins the zod v1 schema
// round-trip, the version-0→1 migration, the refuse-forward-data rule, corrupt
// import rejection, and the meta/cap bookkeeping on persist.

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

function sampleSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
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
});

describe('migrate (versioned, forward-data-safe)', () => {
  it('passes a v1 save through unchanged', () => {
    const save = sampleSave();
    expect(migrate(save)).toEqual(save);
  });

  it('migrates a version-0 stub up to v1 defaults', () => {
    const v0 = { version: 0 };
    const out = migrate(v0 as unknown as Record<string, unknown>);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.meta).toEqual({ memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false });
    expect(out.runs).toEqual([]);
  });

  it('a raw object with no version migrates as a fresh save', () => {
    expect(migrate({} as Record<string, unknown>)).toEqual(sampleSave());
  });

  it('refuses an unknown NEWER version — never destroys forward data', () => {
    expect(() => migrate({ version: 99 } as Record<string, unknown>)).toThrow(/newer/);
    expect(() => migrate({ version: 42, meta: {}, runs: [] } as Record<string, unknown>)).toThrow();
  });

  it('rejects structurally-corrupt JSON (zod), even with the right version', () => {
    expect(() => migrate({ version: 1, meta: { runsCompleted: 'nope' } })).toThrow();
  });
});

describe('applyRunResult (meta + append log)', () => {
  it('appends the run, sums memories, bumps runsCompleted, tracks bestHaul', () => {
    const save = applyRunResult(sampleSave(), result());
    expect(save.meta.memoriesTotal).toBe(28);
    expect(save.meta.runsCompleted).toBe(1);
    expect(save.meta.bestHaul).toBe(28);
    expect(save.runs).toHaveLength(1);

    const second = applyRunResult(save, { ...result(), memoriesTotal: 9 });
    expect(second.meta.memoriesTotal).toBe(37);
    expect(second.meta.runsCompleted).toBe(2);
    expect(second.meta.bestHaul).toBe(28); // 28 > 9
    expect(second.runs).toHaveLength(2);
  });

  it('a death (30% of 28 → 9) banks partial memories', () => {
    const death = { ...result(), extracted: false, memoriesTotal: 9 };
    const save = applyRunResult(sampleSave(), death);
    expect(save.meta.memoriesTotal).toBe(9);
    expect(save.runs[0]!.extracted).toBe(false);
  });

  it('the runs log is capped at RUNS_CAP (append keeps the newest)', () => {
    let save = sampleSave();
    for (let i = 0; i < RUNS_CAP + 5; i++) {
      save = applyRunResult(save, { ...result(), seed: i, memoriesTotal: 1 });
    }
    expect(save.runs.length).toBe(RUNS_CAP);
    expect(save.runs[RUNS_CAP - 1]!.seed).toBe(RUNS_CAP + 4); // newest survives
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
    expect(() => importSave({ version: 1, meta: { bad: true }, runs: 'x' })).toThrow();
  });

  it('importSave migrates an old-version blob instead of rejecting it', () => {
    const imported = importSave({ version: 0 });
    expect(imported.version).toBe(SAVE_VERSION);
  });
});