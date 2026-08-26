// SPAWN DIRECTOR — disturbance budgets (plan 03 §9.2, task t12 #6). A pure data
// table `(dreadTier, clockPhase) → rarity weights`. Higher Dread tiers push the
// disturbance rarity (and with it the spawn budget) rarer; the Night Clock mods
// the distribution (night shifts −10% common → +10% rare) and the refill
// cadence (false dawn halts new spawns ~60% through the phase). The tier roll
// maps a rarity onto the M3 ripple tiers 1-3 — NEVER a species.
//
// Un-caught-species + Bagman guarantee seams are documented in spawn/director.ts
// as M4 hooks (they need the bestiary caught-set + M5 meta, which are not here).
//
// Pure logic: no `three` imports.

import type { Rng } from '../core/rng';
import type { ClockPhase } from '../game/clock';

export type DreadTier = 0 | 1 | 2 | 3 | 4;

export interface RarityDistribution {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
}

// The base per-tier distribution (plan §9.2), at dusk.
export const BUDGET_TABLE: Record<DreadTier, RarityDistribution> = {
  0: { common: 0.8, uncommon: 0.15, rare: 0.05, epic: 0 },
  1: { common: 0.65, uncommon: 0.25, rare: 0.1, epic: 0 },
  2: { common: 0.45, uncommon: 0.35, rare: 0.15, epic: 0.05 },
  3: { common: 0.3, uncommon: 0.4, rare: 0.25, epic: 0.05 },
  4: { common: 0.2, uncommon: 0.35, rare: 0.35, epic: 0.1 },
};

// (tier, phase) → weights. dusk/falseDawn use the base table; night+ shifts the
// distribution rarer by exactly 10 points common→rare (weights still sum to 1).
export function budgetFor(dreadTier: DreadTier, phase: ClockPhase): RarityDistribution {
  const base = BUDGET_TABLE[dreadTier]!;
  if (phase === 'dusk' || phase === 'falseDawn') return { ...base };
  return {
    common: Math.max(0, base.common - 0.1),
    uncommon: base.uncommon,
    rare: base.rare + 0.1,
    epic: base.epic,
  };
}

// Rarity roll → M3 ripple tier. common→1, uncommon→2, rare+epic→3 (a 4th tier is
// M4 content; the epic bucket still telegraphs as the largest ripple, no species).
export function rollTierFrom(dist: RarityDistribution, rng: Rng): 1 | 2 | 3 {
  const r = rng.nextFloat();
  if (r < dist.common) return 1;
  if (r < dist.common + dist.uncommon) return 2;
  return 3;
}

// Refill cadence (plan §9.2): dusk 90s, night 60s, deep night 45s, false dawn 120s.
export function refillTimerForPhase(phase: ClockPhase): number {
  switch (phase) {
    case 'dusk': return 90;
    case 'night': return 60;
    case 'deepNight': return 45;
    case 'falseDawn': return 120;
  }
}

// false dawn thins the pool — no new spawns past 60% through the phase.
export function refillActive(phase: ClockPhase, phaseProgress01: number): boolean {
  return phase !== 'falseDawn' || phaseProgress01 < 0.6;
}

// --- night gating table (plan §5.3, the phase-effects table at line 341) --------
// | Dusk       | no ambushes below Dread 40 | Safe traversal (NO Draggers) | ×1.0  |
// | Night      | rare bias                  | Boat combat ENABLED          | ×1.25 |
// | Deep night | Whistler/Courier eligible  | Dragger rate ×1.5            | ×1.25 |
// | False dawn | spawns thin out            | Safe again, if it floats     | ×1.25 |
//
// plan §6.3 acceptance is the tie-breaker on dusk: "No Dragger spawns, hooks, or
// boat damage before `night` phase" — dusk is Dragger-free at ANY Dread (the
// "below Dread 40" clause on that row governs land AMBUSHES, a different
// producer; `ambushEligible` below is that rule). plan.md §3.3 says the same in
// fiction: "Daytime/dusk boats are strictly traversal."

// Base seconds between Dragger spawn attempts at `night` (the ×1 rate).
export const DRAGGER_BASE_INTERVAL_S = 75;

export function draggerEligible(phase: ClockPhase): boolean {
  return phase === 'night' || phase === 'deepNight';
}

// Deep night hunts you: rate ×1.5 → the interval divides by 1.5.
export function draggerRateMult(phase: ClockPhase): number {
  switch (phase) {
    case 'night': return 1;
    case 'deepNight': return 1.5;
    default: return 0; // dusk: never; false dawn: "safe again, if it still floats"
  }
}

export function draggerIntervalFor(phase: ClockPhase): number {
  const mult = draggerRateMult(phase);
  return mult <= 0 ? Infinity : DRAGGER_BASE_INTERVAL_S / mult;
}

// Land ambushes (the OTHER half of the dusk row): none at dusk below Dread 40.
// The ambush producers themselves are M4/M5; this is the gate they will read.
export const DUSK_AMBUSH_DREAD_FLOOR = 40;

export function ambushEligible(phase: ClockPhase, dread: number): boolean {
  return phase === 'dusk' ? dread >= DUSK_AMBUSH_DREAD_FLOOR : true;
}
