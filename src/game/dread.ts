// DREAD (game) — plan 03 §4, task t12 #2. Fills the M1-reserved game/dread.ts
// slot. Per-run heat 0..100; the risk/reward dial and pacing engine. The value
// lives on WorldState.dread (the post pass already reads it); the tier is a
// derived clamp. Gains come from the run reducer (land a catch, by tier, × the
// Night Clock multiplier at night+); RELEASE is the only free in-run valve.
// Ambush / Caller / Snatcher / Whistler effects are M4/t2 producers — logged as
// data here, never spawned.
//
// Pure logic: no `three` imports.

export type DreadTier = 0 | 1 | 2 | 3 | 4;

export const DREAD_MAX = 100;

// Tier boundaries fire exactly at 20/40/60/80 (plan §4.2).
export const TIER_BOUNDARIES = [0, 20, 40, 60, 80];

export function tierFor(value: number): DreadTier {
  const v = Math.max(0, Math.min(DREAD_MAX, value));
  if (v >= TIER_BOUNDARIES[4]!) return 4;
  if (v >= TIER_BOUNDARIES[3]!) return 3;
  if (v >= TIER_BOUNDARIES[2]!) return 2;
  if (v >= TIER_BOUNDARIES[1]!) return 1;
  return 0;
}

// Gain table (plan §4.1): land a catch +4/+6/+9/+12 by tier.
export const LAND_GAIN_BY_TIER = [0, 4, 6, 9, 12];

export function landGainByTier(tier: 1 | 2 | 3 | 4): number {
  return LAND_GAIN_BY_TIER[tier] ?? 0;
}

// A gain (positive or negative) applied with the clock multiplier, clamped 0..100.
export function applyDreadGain(value: number, gain: number, mult = 1): number {
  const next = value + gain * mult;
  return Math.max(0, Math.min(DREAD_MAX, next));
}

// RELEASE is the free valve — consuming a disturbance never changes Dread (plan §3.1).
export const RELEASE_GAIN = 0;

// Starting Dread from restored buildings (plan §4.4): min(2 × count, 30).
export function startingBonus(buildingCount: number): number {
  return Math.min(30, 2 * buildingCount);
}

// Sub-bass heartbeat BPM (plan §4.5) — the audio worker binds it.
export function heartbeatBpm(value: number): number {
  return 40 + (value / DREAD_MAX) * 60;
}

// FUTURE (M4): ambush/rarity pressure effects keyed by tier, wired where the
// producer systems exist NOW. Logged for legibility; no producers yet.
export const TIER_EFFECTS: Record<DreadTier, string[]> = {
  0: ['base spawns', 'common catches'],
  1: ['+1 rarity die', 'occasional Crawler pairs (FUTURE)'],
  2: ['uncommon+ disturbance bias', 'Callers spawn (FUTURE)', '30% ambush on landing (FUTURE)'],
  3: ['rare disturbances appear', 'Snatchers active (FUTURE)', 'water phase occupied'],
  4: ['guaranteed rare/epic', 'continuous pressure', 'Whistler eligible (FUTURE)'],
};