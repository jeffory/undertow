// SAVES — zod schemas (plan 03 §8.1, task t12 #5). The whole SaveGame is a
// versioned, validated JSON document. Version 1. Meta is the canonical hub state
// (M5 reads it); runs is an append-only per-run log. RunResult mirrors §7.2.
// Pure logic: no `three` imports.

import { z } from 'zod';

export const SAVE_VERSION = 1;

export const CatchRecordSchema = z.object({
  species: z.string(),
  tier: z.number().int().min(1).max(4),
  weight: z.number(),
  clean: z.boolean(),
  memories: z.number(),
  xp: z.number(),
});
export type CatchRecord = z.infer<typeof CatchRecordSchema>;

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
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const MetaSchema = z.object({
  memoriesTotal: z.number(),
  runsCompleted: z.number().int().min(0),
  bestHaul: z.number(),
  seenIntro: z.boolean(),
});
export const SaveGameSchema = z.object({
  version: z.literal(SAVE_VERSION),
  meta: MetaSchema,
  runs: z.array(RunResultSchema),
});
export type SaveGame = z.infer<typeof SaveGameSchema>;