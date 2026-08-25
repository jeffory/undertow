// SPECIES ROLL (run) — M3 placeholder seam (plan 03 §3.1/§4.4). The "Sounding
// Bell / Baby Shoe" hook is that the species is rolled AT SET — the moment the
// player commits — so Dread tier / clock / lure can shift the table before the
// commit. For M3 the species content is M4's; every disturbance is the single
// M2 capsule species and the tier does the scaling. The ripple NEVER reveals
// this pre-SET.
// Pure logic: no `three` imports.

import type { Rng } from '../core/rng';
import { M2_SPECIES } from '../game/tether';

export function rollSpeciesAtSet(_rng: Rng, _tier: 1 | 2 | 3 | 4): string {
  return M2_SPECIES; // M4 fills the real catch table
}

// Weight in kg, rolled from the LOOT stream at SET (task t12 #1).
export function rollWeight(rng: Rng, tier: 1 | 2 | 3 | 4): number {
  const [lo, hi] =
    tier === 1 ? [2, 6] : tier === 2 ? [6, 14] : tier === 3 ? [14, 30] : [26, 44];
  return Math.round(rng.range(lo, hi) * 10) / 10;
}