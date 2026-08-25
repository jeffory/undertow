// SPECIES ROLL (run) — plan 03 §3.1/§4.4, M4 round 1. The "Sounding Bell /
// Baby Shoe" hook is that the species is rolled AT SET — the moment the player
// commits — so Dread tier / clock / lure can shift the table before the
// commit. M4 fills the real catch table: rollSpeciesAtSet draws a species
// preset from the disturbance-tier table, deterministic over the 'loot' stream.
// The ripple NEVER reveals this pre-SET.
// Pure logic: no `three` imports.

import type { Rng } from '../core/rng';
import { rollSpeciesFromTier } from '../data/species';
import type { SpeciesPreset } from '../data/species';

export function rollSpeciesAtSet(rng: Rng, tier: 1 | 2 | 3 | 4): SpeciesPreset {
  const t = Math.max(1, Math.min(3, tier)) as 1 | 2 | 3;
  return rollSpeciesFromTier(rng, t);
}