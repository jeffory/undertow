// SAVES — migration + meta bookkeeping (plan 03 §8, task t12 #5; task t19;
// task t18 / plan 05 §0.2; task t19 / plan 05 §1.2).
// `migrate` stepwise-up-migrates any raw blob to the current version and REFUSES
// unknown newer versions (never destroy forward data). v1→v2 adds the M4 meta
// slices (bestiary, license, box, equipped) with safe defaults; v2→v3 adds the
// M5 town slice (`metaState`) — an OLD SAVE LOADS AND GETS AN EMPTY TOWN, and
// the Memories it has already banked in `meta.memoriesTotal` are carried into
// `metaState.memories` so a returning player's ledger is not reset to zero.
// v3→v4 adds the M5 rig-up loadout (`rigLoadout`) — an old save loads with an
// empty loadout except that whatever was in the legacy `equipped` mirror is
// seeded into `rigLoadout.trinketIds` so already-packed trinkets carry over.
// `applyRunResult` is the write path: append to the runs log (capped), sum
// Memories (into BOTH the run counter and the town's spendable purse), bump
// runsCompleted, keep bestHaul, and fold in the run's bestiary events, sundries
// (retained in the box), and tribute XP (license grade up-recompute).
// Pure logic: no `three` imports.

import {
  SAVE_VERSION,
  RunResultSchema,
  SaveGameSchema,
  SaveGameV1Schema,
  SaveGameV2Schema,
  SaveGameV3Schema,
  type MetaState,
  type RigLoadout,
  type RunResult,
  type SaveGame,
  type SaveGameV2,
  type SaveGameV3,
} from './schemas';
import type { SundryItem } from './schemas';
import { applyBestiaryEvents } from '../bestiary/bestiary';
import { gradeForXp } from '../loot/license';

export { SAVE_VERSION };

export const RUNS_CAP = 200; // plan §8.1: append-only, capped 200

// The empty town: nothing restored, nothing read, no light bottled, no ending
// seen. plan 05 §0.2, field for field.
export function freshMetaState(): MetaState {
  return {
    buildings: {},
    memories: 0,
    notesRead: [],
    decants: 0,
    damKeyUsed: false,
    forwardingAddress: false,
    breadcrumbs: [],
    endingsSeen: {},
    nplus: false,
  };
}

// plan 05 §1.2 RigLoadout, empty: no rod, no line, no lures, no trinkets, no
// stores. Empty slots are the "no catalogue yet" state, not an error.
export function freshRigLoadout(): RigLoadout {
  return {
    rodId: null,
    lineId: null,
    lureIds: [],
    trinketIds: [],
    consumables: [],
  };
}

export function freshSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    meta: { memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false },
    runs: [],
    bestiary: {},
    license: { grade: 1, xp: 0 },
    box: [],
    equipped: [],
    metaState: freshMetaState(),
    rigLoadout: freshRigLoadout(),
  };
}

// A retained-box merge: sundries landed this run are kept in the box (the
// pre-run picker equips up to 2 trinket slots from it at the next run start).
export function mergeSundries(box: SundryItem[], gained: readonly SundryItem[]): SundryItem[] {
  return [...box, ...gained];
}

// Raw blob → validated current-version SaveGame. A missing/0 version is treated
// as the pre-M3 stub and migrates to a fresh save. Older versions are validated
// against their own shape and stepped up one version at a time (v1→v2→v3→v4).
// An unknown NEWER version throws (forward data is never destroyed). A
// structurally-corrupt document at any step throws too.
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
  if (version === 1) return migrateV3toV4(migrateV2toV3(migrateV1toV2(r)));
  if (version === 2) return migrateV3toV4(migrateV2toV3(parseV2(r)));
  if (version === 3) return migrateV3toV4(parseV3(r));
  if (version === SAVE_VERSION) {
    const parsed = SaveGameSchema.safeParse(r);
    if (parsed.success) return parsed.data;
    throw new Error('corrupt save: failed v4 schema validation');
  }
  // any other older version → migrate as the v0 stub
  return freshSave();
}

// v1 → v2: validate the v1 document, keep meta + runs, add the empty M4 slices.
function migrateV1toV2(raw: Record<string, unknown>): SaveGameV2 {
  const parsed = SaveGameV1Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('corrupt save: failed v1 schema validation');
  }
  return {
    version: 2,
    meta: parsed.data.meta,
    runs: parsed.data.runs,
    bestiary: {},
    license: { grade: 1, xp: 0 },
    box: [],
    equipped: [],
  };
}

function parseV2(raw: Record<string, unknown>): SaveGameV2 {
  const parsed = SaveGameV2Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('corrupt save: failed v2 schema validation');
  }
  return parsed.data;
}

function parseV3(raw: Record<string, unknown>): SaveGameV3 {
  const parsed = SaveGameV3Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('corrupt save: failed v3 schema validation');
  }
  return parsed.data;
}

// v2 → v3: add the M5 town slice. The town starts EMPTY (nothing restored), but
// the Memories the save has already banked become the town's opening purse —
// a player who has been fishing since M3 walks up to the ledger with money.
function migrateV2toV3(v2: SaveGameV2): SaveGameV3 {
  return {
    version: 3,
    meta: v2.meta,
    runs: v2.runs,
    bestiary: v2.bestiary,
    license: v2.license,
    box: v2.box,
    equipped: v2.equipped,
    metaState: { ...freshMetaState(), memories: Math.max(0, Math.floor(v2.meta.memoriesTotal)) },
  };
}

// v3 → v4: add the M5 rig-up loadout. Everything starts empty except the legacy
// `equipped` mirror, which seeds `trinketIds` so trinkets the player had packed
// under the M4 picker carry straight into the requisition register.
function migrateV3toV4(v3: SaveGameV3): SaveGame {
  return {
    version: SAVE_VERSION,
    meta: v3.meta,
    runs: v3.runs,
    bestiary: v3.bestiary,
    license: v3.license,
    box: v3.box,
    equipped: v3.equipped,
    metaState: v3.metaState,
    rigLoadout: { ...freshRigLoadout(), trinketIds: v3.equipped.slice(0, 2) },
  };
}

// The canonical write path: append this run, update meta, fold in the M4 slices
// (bestiary events → entry states, sundries → box, tribute XP → license grade).
// The result is normalized through the schema first so defaulted fields
// (bestiary / sundries / draggersLand …) always materialize in the stored log.
export function applyRunResult(save: SaveGame, result: RunResult): SaveGame {
  const normalized = RunResultSchema.parse(result);
  const runs = [...save.runs, normalized].slice(-RUNS_CAP);
  const bestiary = applyBestiaryEvents(save.bestiary, normalized.bestiary ?? []);
  const box = mergeSundries(save.box, normalized.sundries ?? []);
  const xp = save.license.xp + (normalized.xpTotal ?? 0);
  // The receipt's Memories are banked TWICE, deliberately: `meta.memoriesTotal`
  // is the lifetime tally (never spent — the run log's odometer) and
  // `metaState.memories` is the spendable purse the restoration ledger draws
  // down (plan 05 §1.3: "Spending Memories is the only spend in the hub").
  const banked = Math.max(0, Math.floor(normalized.memoriesTotal));
  return {
    version: SAVE_VERSION,
    meta: {
      memoriesTotal: save.meta.memoriesTotal + normalized.memoriesTotal,
      runsCompleted: save.meta.runsCompleted + 1,
      bestHaul: Math.max(save.meta.bestHaul, normalized.memoriesTotal),
      seenIntro: true,
    },
    runs,
    bestiary,
    license: { xp, grade: gradeForXp(xp) },
    box,
    equipped: save.equipped,
    metaState: {
      ...(save.metaState ?? freshMetaState()),
      memories: (save.metaState?.memories ?? 0) + banked,
      // M7 (plan 05 §2.2): the forwarding address is LATCHED — once the Office
      // has your address it does not forget it, and a later run that never met
      // the Postmaster cannot un-post the slip.
      forwardingAddress:
        (save.metaState?.forwardingAddress ?? false) || (normalized.forwardingAddress ?? false),
    },
    // The rig-up loadout is carried through the run end untouched — the Office
    // holds the requisition between runs.
    rigLoadout: save.rigLoadout ?? freshRigLoadout(),
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