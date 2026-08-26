// SAVES — zod schemas (plan 03 §8.1, task t12 #5; extended task t19 → v2;
// task t18 / plan 05 §0.2 → v3).
// The whole SaveGame is a versioned, validated JSON document. Version 2 adds the
// M4 meta slices: the bestiary entry map (plan 04 §6.1), the Keeper's License
// (plan 04 §8), and the retained trinket box + equipped loadout (plan 04 §7 /
// M5 §1.2). Meta is the canonical hub state (M5 reads it); runs is an
// append-only per-run log. RunResult mirrors §7.2 plus the run's bestiary
// events and sundries (t19).
//
// Version 3 adds the M5 TOWN slice — `metaState`, the plan 05 §0.2 MetaState
// exactly: { buildings, memories, notesRead, decants, damKeyUsed, breadcrumbs,
// endingsSeen, nplus }. It is stored under `metaState` because `meta` is
// already taken by the t12 run-counter block; the two are different animals
// (run bookkeeping vs. the town's memory of itself).
// Pure logic: no `three` imports.

import { z } from 'zod';

export const SAVE_VERSION = 3;

export const CatchRecordSchema = z.object({
  species: z.string(),
  tier: z.number().int().min(1).max(4),
  weight: z.number(),
  clean: z.boolean(),
  memories: z.number(),
  xp: z.number(),
});
export type CatchRecord = z.infer<typeof CatchRecordSchema>;

export const ItemEffectSchema = z.object({
  key: z.string(),
  value: z.number(),
});
export type ItemEffect = z.infer<typeof ItemEffectSchema>;

export const SundryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  rarity: z.enum(['C', 'U', 'R', 'E', 'Drowned']),
  slot: z.enum(['trinket', 'line', 'lure', 'bait', 'consumable']),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  effects: z.array(ItemEffectSchema).default([]),
});
export type SundryItem = z.infer<typeof SundryItemSchema>;

export const BestiaryEventSchema = z.object({
  speciesId: z.string(),
  event: z.enum(['hooked', 'clean', 'butchered']),
});
export type BestiaryEvent = z.infer<typeof BestiaryEventSchema>;

export const RunResultSchema = z.object({
  seed: z.number(),
  source: z.enum(['random', 'daily', 'input']).default('random'),
  clockPhaseEnd: z.enum(['dusk', 'night', 'deepNight', 'falseDawn']),
  haul: z.array(CatchRecordSchema),
  extracted: z.boolean(),
  memoriesTotal: z.number(),
  xpTotal: z.number(),
  dreadPeak: z.number(),
  startedAtDread: z.number(),
  draggersLand: z.number().int().min(0).default(0),
  bagmanCaught: z.boolean().default(false),
  sinkholesDescended: z.number().int().min(0).default(0),
  bestiary: z.array(BestiaryEventSchema).default([]),
  sundries: z.array(SundryItemSchema).default([]),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const MetaSchema = z.object({
  memoriesTotal: z.number(),
  runsCompleted: z.number().int().min(0),
  bestHaul: z.number(),
  seenIntro: z.boolean(),
});
export type RunMeta = z.infer<typeof MetaSchema>;

export const BestiaryEntryStateSchema = z.object({
  speciesId: z.string(),
  seen: z.boolean(),
  fought: z.boolean(),
  cleanCatch: z.boolean(),
  willing: z.boolean(),
  kills: z.number().int().min(0),
  catches: z.number().int().min(0),
});
export type BestiaryEntryState = z.infer<typeof BestiaryEntryStateSchema>;

export const LicenseStateSchema = z.object({
  grade: z.number().int().min(1).max(7),
  xp: z.number().min(0),
});
export type LicenseState = z.infer<typeof LicenseStateSchema>;

// --- M5 town meta (plan 05 §0.2) ----------------------------------------------
// One restored building's ledger row. `paid` is what the Office actually took
// (a building's cost can be re-tuned later; the ledger keeps the receipt) and
// `atRun` is the runsCompleted count when it went up.
export const RestoredStateSchema = z.object({
  restored: z.boolean(),
  paid: z.number().int().min(0).default(0),
  atRun: z.number().int().min(0).default(0),
});
export type RestoredState = z.infer<typeof RestoredStateSchema>;

export const EndingsSeenSchema = z.object({
  haul: z.boolean().optional(),
  cut: z.boolean().optional(),
});
export type EndingsSeen = z.infer<typeof EndingsSeenSchema>;

// The plan 05 §0.2 MetaState, field for field. Everything but `buildings` and
// `memories` is a M6–M10 slot: declared now so the save never needs another
// migration to hold them (notes, decants, the Dam Key swap, breadcrumbs,
// endings, NG+ — all DEFERRED as behaviour, present as data).
export const MetaStateSchema = z.object({
  buildings: z.record(z.string(), RestoredStateSchema).default({}),
  memories: z.number().int().min(0).default(0),
  notesRead: z.array(z.string()).default([]),
  decants: z.number().int().min(0).default(0),
  damKeyUsed: z.boolean().default(false),
  breadcrumbs: z.array(z.string()).default([]),
  endingsSeen: EndingsSeenSchema.default({}),
  nplus: z.boolean().default(false),
});
export type MetaState = z.infer<typeof MetaStateSchema>;

export const SaveGameSchema = z.object({
  version: z.literal(SAVE_VERSION),
  meta: MetaSchema,
  runs: z.array(RunResultSchema),
  bestiary: z.record(z.string(), BestiaryEntryStateSchema),
  license: LicenseStateSchema,
  box: z.array(SundryItemSchema),
  equipped: z.array(z.string()).max(2),
  metaState: MetaStateSchema,
});
export type SaveGame = z.infer<typeof SaveGameSchema>;

// The pre-M4 v1 shape (used by the v1→v2 migration in migrate.ts). Runs parse
// against the current RunResultSchema — the newer fields default.
export const SaveGameV1Schema = z.object({
  version: z.literal(1),
  meta: MetaSchema,
  runs: z.array(RunResultSchema),
});
export type SaveGameV1 = z.infer<typeof SaveGameV1Schema>;

// The pre-M5 v2 shape (used by the v2→v3 migration): everything the current
// schema has except `metaState`, which the migration adds empty.
export const SaveGameV2Schema = z.object({
  version: z.literal(2),
  meta: MetaSchema,
  runs: z.array(RunResultSchema),
  bestiary: z.record(z.string(), BestiaryEntryStateSchema),
  license: LicenseStateSchema,
  box: z.array(SundryItemSchema),
  equipped: z.array(z.string()).max(2),
});
export type SaveGameV2 = z.infer<typeof SaveGameV2Schema>;