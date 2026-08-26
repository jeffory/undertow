// BARKS (meta) — plan 05 §1.5, task t19 slice 2.
//
// Deterministic doorstep-bark selection. Given the run seed, a building, and
// how many times the keeper has approached its door this run, pick WHICH of the
// resident's barks plays — no Math.random, no Date, no DOM. Two rules:
//
//   1. ROTATION: the index is a pure function of
//      (run seed, building id, visit count), so the same run always plays the
//      same bark at the same visit, and revisits never repeat in lockstep.
//   2. MASK-SLIP GATE: the escalation bark ("after 5+ restorations", town.md §4
//      / plan 05 §1.5) only enters the pool once the restored count is ≥ 5. It
//      is a NEW pool member, not a replacement — the standard barks stay.
//
// The scheduler (systems/barks.ts) owns proximity + the once-per-visit cooldown
// + the `bark.shown` event; this module only answers "which line, today".
//
// Pure logic: no `three`, no DOM, no Math.random.

import { barkSetFor, type ResidentBarkSet } from '../content/townCopy';
import { Rng } from '../core/rng';

export const MASK_SLIP_THRESHOLD = 5;

export interface BarkLine {
  text: string;
  residentId: string;
  residentName: string;
  buildingId: string;
  /** True when the line is the 5+ restorations escalation bark. */
  maskSlipping: boolean;
}

// A stable 32-bit hash of the building id — the deterministic per-building salt.
export function buildingSeed(buildingId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < buildingId.length; i++) {
    h ^= buildingId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// The pool of candidate lines for a building given the town's standing count.
// Below the mask-slip threshold only the standard barks; at/above it the
// escalation bark joins as an extra member.
export function barkPool(
  set: ResidentBarkSet,
  restoredCount: number,
): { text: string; maskSlipping: boolean }[] {
  const standard = set.barksStandard.map((text) => ({ text, maskSlipping: false }));
  if (restoredCount >= MASK_SLIP_THRESHOLD) {
    return [...standard, { text: set.barkMaskSlipping, maskSlipping: true }];
  }
  return standard;
}

// Which bark plays. Deterministic: the same (seed, building, visit, restored)
// always yields the same line. The visit count is the "advance" that rotates
// the pool — visit 0 picks a seed-derived line, visit 1 picks a different one.
export function barkForRun(
  seed: number,
  buildingId: string,
  visitCount: number,
  restoredCount: number,
): BarkLine | null {
  const set = barkSetFor(buildingId);
  if (!set) return null;
  const pool = barkPool(set, restoredCount);
  if (pool.length === 0) return null;
  const rng = new Rng((seed ^ buildingSeed(buildingId) ^ (Math.imul(visitCount, 2654435761) >>> 0)) >>> 0);
  const line = pool[rng.int(0, pool.length - 1)]!;
  return {
    text: line.text,
    residentId: set.residentId,
    residentName: set.residentName,
    buildingId,
    maskSlipping: line.maskSlipping,
  };
}