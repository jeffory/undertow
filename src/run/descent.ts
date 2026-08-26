// SINKHOLE DESCENT (run) — plan 03 §2.5 / §4.1 / §5.1 / §12.7, spec §3.1.6
// ("Sinkholes (1–2 per surface map) descend a zone. Descending is one-way
// within a run.").
//
// The rules, in the plan's words:
//   • §2.5  "Descending sets `dread.zoneFloor` (§5) and does NOT touch the
//            Night Clock (§3.3)."
//   • §4.1  "Descend a zone → `value = max(value, zoneFloor)` — the floor rises
//            (0→25→50→75→90). This is a clamp, not a gain, so `nightMult` never
//            applies."
//   • §5.1  "Descent does not reset the clock. `runStartMs` is set once per
//            run." — asserted below, not merely intended.
//   • §12.7 "M3 caps descents at zone 5's floor."
//
// The deeper lake is REGENERATED from the same run seed with the zone's layout
// salt (core/zones.ts), so `(runSeed, zone)` is the whole determinism key: the
// same run seed always yields the same zone-2 surface.
//
// Pure logic: no `three` imports, no Math.random, no Date.

import type { WorldState } from '../core/world';
import type { Sinkhole } from '../gen/lakeMap';
import { generateLake } from '../gen/lakeMap';
import { spawnAtLakeStart } from '../gen/lakeWorld';
import { spawnInitialDisturbances } from '../spawn/director';
import { MAX_ZONE, clampZone, zoneDreadFloor, zoneName } from '../core/zones';

// m — how close the boat's gunwale has to get to a sinkhole's water-side mouth
// for the descent prompt to arm. Deliberately looser than the 3m extraction
// reach: the gap is a big hole in the lake, not a buoy you bump.
export const DESCEND_RANGE = 6;
// s — hold the contextual verb over the gap. Longer than the buoy's 1.5s hold:
// going down is the more committing of the two (it is one-way within a run).
export const DESCEND_HOLD_SECONDS = 2;

// The sinkhole whose mouth is within DESCEND_RANGE of (x,z), or null.
export function nearestSinkhole(world: WorldState, x: number, z: number): Sinkhole | null {
  const lake = world.lake;
  if (!lake) return null;
  let best: Sinkhole | null = null;
  let bestD = DESCEND_RANGE;
  for (const s of lake.sinkholes) {
    const d = Math.hypot(s.mouth.x - x, s.mouth.z - z);
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Zone 5 (The Mouth) is the floor of the run: nothing generates a sinkhole
// there, and the descent is refused even if one were forced.
export function canDescend(world: WorldState): boolean {
  return !world.run.ended && world.run.zone < MAX_ZONE;
}

// Perform the descent. Returns the new zone depth (unchanged at the cap).
export function descend(world: WorldState): number {
  const run = world.run;
  if (!canDescend(world)) return run.zone;

  // The Night Clock epoch is captured before and checked after — plan §5.1 is a
  // hard invariant of this function, not a convention.
  const clockEpoch = world.clock.runStartMs;
  const runEpoch = run.startedAt;

  const nextZone = clampZone(run.zone + 1);
  run.zone = nextZone;
  run.sinkholesDescended += 1;

  // Dread: the FLOOR rises. A clamp, never a gain — the clock multiplier is not
  // in this expression at all (plan §4.1).
  const floor = zoneDreadFloor(nextZone);
  run.zoneFloor = floor;
  world.dread = Math.max(world.dread, floor);
  run.dreadPeak = Math.max(run.dreadPeak, world.dread);

  // The deeper surface: same run seed, the zone's layout salt.
  world.lake = generateLake(world.seed, nextZone);
  world.dockedIslet = null;
  spawnAtLakeStart(world);

  // A fresh ripple field for the new water; the old zone's disturbances are gone
  // with the old zone. The catch in hand (if any) came down with you.
  world.disturbances = [];
  run.promptId = null;
  run.spawn.initialSpawned = false;
  run.extract = { held: 0, buoyId: null };
  run.descend = { held: 0, buoyId: null };
  spawnInitialDisturbances(world);

  if (world.clock.runStartMs !== clockEpoch || run.startedAt !== runEpoch) {
    throw new Error('descent reset the Night Clock (plan 03 §5.1 violated)');
  }
  return nextZone;
}

export { zoneName, MAX_ZONE };
