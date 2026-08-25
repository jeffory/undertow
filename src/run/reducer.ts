// RUN REDUCER (run) — plan 03 §3.2/§10, task t12 #1/#2. The single pure fold
// over the tether event stream: landing a catch adds to the run haul (clean
// catch, weight already rolled at SET), a butcher yields a −1-tier non-clean
// record, and a snap/cut/pulled-under abandons the catch — nothing recorded, no
// Dread gain. Landing a catch raises Dread by tier × the Night Clock multiplier.
// Runs AFTER tetherConstraint in the update order so the event stream is fresh.
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import type { CatchRecord } from '../extract/memories';
import { catchMemories } from '../extract/memories';
import { landGainByTier, applyDreadGain } from '../game/dread';
import { dreadMultForPhase, phaseAt, runElapsedMs } from '../game/clock';
import type { ClockPhase } from '../game/clock';

export function currentPhase(world: WorldState): ClockPhase {
  return phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed));
}

export function currentDreadMult(world: WorldState): number {
  return dreadMultForPhase(currentPhase(world));
}

// A clean land: full tier, clean ×1.5 credit, Dread gain by tier.
export function landCatch(world: WorldState): CatchRecord | null {
  const c = world.run.activeCatch;
  if (!c) return null;
  const memories = catchMemories(c.weight, c.tier, true);
  const rec: CatchRecord = {
    species: c.species,
    tier: c.tier,
    weight: c.weight,
    clean: true,
    memories,
    xp: memories,
  };
  world.run.haul.push(rec);
  world.dread = applyDreadGain(world.dread, landGainByTier(c.tier as 1 | 2 | 3 | 4), currentDreadMult(world));
  world.run.activeCatch = null;
  return rec;
}

// HP kill (gaffed dead): −1 tier, no clean credit (plan §7.1). Still lands.
export function butcherCatch(world: WorldState): CatchRecord | null {
  const c = world.run.activeCatch;
  if (!c) return null;
  const tier = Math.max(1, c.tier - 1);
  const memories = catchMemories(c.weight, tier, false);
  const rec: CatchRecord = {
    species: c.species,
    tier,
    weight: c.weight,
    clean: false,
    memories,
    xp: memories,
  };
  world.run.haul.push(rec);
  world.dread = applyDreadGain(world.dread, landGainByTier(tier as 1 | 2 | 3 | 4), currentDreadMult(world));
  world.run.activeCatch = null;
  return rec;
}

// snap / cut / pulled-under — the catch is gone; nothing recorded, no gain.
export function abandonCatch(world: WorldState): void {
  world.run.activeCatch = null;
}

// The run reducer: fold the fresh tether event stream into haul + Dread.
export function processRunEvents(world: WorldState): void {
  for (const ev of world.tetherEvents) {
    switch (ev.type) {
      case 'landed':
        landCatch(world);
        break;
      case 'butchered':
        butcherCatch(world);
        break;
      case 'snap':
      case 'cut':
      case 'pulledUnder':
        abandonCatch(world);
        break;
      default:
        break;
    }
  }
}