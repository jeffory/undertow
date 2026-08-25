// SAVES — migration + meta bookkeeping (plan 03 §8, task t12 #5). `migrate`
// stepwise-up-migrates any raw blob to the current version and REFUSES unknown
// newer versions (never destroy forward data). `applyRunResult` is the write
// path: append to the runs log (capped), sum Memories, bump runsCompleted, keep
// bestHaul. Pure logic: no `three` imports.

import {
  SAVE_VERSION,
  SaveGameSchema,
  type RunResult,
  type SaveGame,
} from './schemas';

export { SAVE_VERSION };

export const RUNS_CAP = 200; // plan §8.1: append-only, capped 200

export function freshSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
  };
}

// Raw blob → validated current-version SaveGame. A missing/0 version is treated
// as the pre-M3 stub and migrates to a fresh v1. An unknown NEWER version throws
// (forward data is never destroyed). Structurally-corrupt v1 throws too.
export function migrate(raw: unknown): SaveGame {
  if (raw === null || typeof raw !== 'object') return freshSave();
  const r = raw as Record<string, unknown>;
  const version = r.version;
  if (version === undefined || version === null || version === 0) return freshSave();
  if (typeof version === 'number' && version > SAVE_VERSION) {
    throw new Error(
      `save version ${version} is newer than supported (${SAVE_VERSION}) — refusing to touch forward data`,
    );
  }
  if (version === SAVE_VERSION) {
    const parsed = SaveGameSchema.safeParse(r);
    if (parsed.success) return parsed.data;
    throw new Error('corrupt save: failed v1 schema validation');
  }
  // any other older version → migrate as the v0 stub
  return freshSave();
}

// The canonical write path: append this run, update meta.
export function applyRunResult(save: SaveGame, result: RunResult): SaveGame {
  const runs = [...save.runs, result].slice(-RUNS_CAP);
  return {
    version: SAVE_VERSION,
    meta: {
      memoriesTotal: save.meta.memoriesTotal + result.memoriesTotal,
      runsCompleted: save.meta.runsCompleted + 1,
      bestHaul: Math.max(save.meta.bestHaul, result.memoriesTotal),
      seenIntro: true,
    },
    runs,
  };
}

// The whole save as a JSON download blob (plan §8.1 export).
export function exportSave(save: SaveGame): string {
  return JSON.stringify(save, null, 2);
}

// Validate + migrate an imported blob (JSON string or already-parsed object).
// Throws on anything corrupt — the caller must not clobber existing data.
export function importSave(raw: unknown): SaveGame {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('corrupt save: not valid JSON');
    }
  }
  return migrate(data);
}