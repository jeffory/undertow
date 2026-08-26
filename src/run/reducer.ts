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
import { landGainByTier, applyDreadGain, tierFor } from '../game/dread';
import { dreadMultForPhase, phaseAt, runElapsedMs } from '../game/clock';
import type { ClockPhase } from '../game/clock';
import { createRng, LOOT } from '../core/rngStreams';
import { rollCatchDrop, rollAffixedTrinket, type RollCtx } from '../loot/roller';
import type { SundryItem } from '../save/schemas';
import type { Rarity } from '../loot/items';
import { recordBestiary } from '../bestiary/bestiary';
import { DRAGGER_SPECIES_ID, MARENS_ECHO_SPECIES_ID } from '../data/species';

export function currentPhase(world: WorldState): ClockPhase {
  return phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed));
}

export function currentDreadMult(world: WorldState): number {
  return dreadMultForPhase(currentPhase(world));
}

// A clean land: full tier, clean ×1.5 credit, Dread gain by tier. Rolls the
// loot drop (clean quality +1) and records the bestiary clean-catch credit.
export function landCatch(world: WorldState): CatchRecord | null {
  const c = world.run.activeCatch;
  if (!c) return null;
  const memories = catchMemories(c.weight, c.tier, true);
  const rec: CatchRecord = {
    species: c.name.toLowerCase(), // receipt name ("one (1) purse minnow, damp")
    tier: c.tier,
    weight: c.weight,
    clean: true,
    memories,
    xp: memories,
  };
  world.run.haul.push(rec);
  const drop = rollDropForCatch(world, 1);
  if (drop) world.run.inventory.push(drop);
  recordBestiary(world, c.species, 'clean');
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
    species: c.name.toLowerCase(),
    tier,
    weight: c.weight,
    clean: false,
    memories,
    xp: memories,
  };
  world.run.haul.push(rec);
  const drop = rollDropForCatch(world, -1);
  if (drop) world.run.inventory.push(drop);
  recordBestiary(world, c.species, 'butchered');
  world.dread = applyDreadGain(world.dread, landGainByTier(tier as 1 | 2 | 3 | 4), currentDreadMult(world));
  world.run.activeCatch = null;
  return rec;
}

// Loot roll for a landed catch (plan 04 §7): seeded over the 'loot' stream keyed
// by the disturbance (same seed + same catch → same drop), ctx from the catch's
// tier + current Dread tier + the run's license grade + quality bonus.
// `forceDrop` is the ?debug gate-driver seam — always surface a sundry.
function rollDropForCatch(world: WorldState, qualityBonus: number): SundryItem | null {
  const c = world.run.activeCatch;
  if (!c) return null;
  // A landed Dragger is paid for by the boat-combat system instead (03 §6.1:
  // "guaranteed Rare+" + repair materials + Teeth). Rolling here as well would
  // hand out two drops for one animal.
  if (c.species === DRAGGER_SPECIES_ID) return null;
  // 05 §2.3 — same reason, one zone deeper: Maren's Echo pays out THE ECHO'S
  // SCALE, a named Drowned unique her own system pushes at the landing. A random
  // sundry alongside it would be the Office handing you a spare lure with her.
  if (c.species === MARENS_ECHO_SPECIES_ID) return null;
  const rng = createRng(world.seed, LOOT, c.disturbanceId);
  const ctx: RollCtx = {
    zoneDepth: world.run.zone, // 1 Shallows … 5 Mouth — descents raise the ladder
    catchTier: c.tier,
    dreadTier: tierFor(world.dread),
    licenseGrade: world.run.licenseGrade,
    qualityBonus,
  };
  if (world.run.forceDrop) {
    const rarity: Rarity = 'R'; // the gate driver's deterministic trinket grade
    return rollAffixedTrinket(rng, rarity);
  }
  return rollCatchDrop(rng, ctx);
}

// snap / cut / pulled-under — the catch is gone; nothing recorded, no gain.
export function abandonCatch(world: WorldState): void {
  world.run.activeCatch = null;
}

// STOLEN (05 §2.2) — a Snatcher's steal clock ran out. Mechanically an abandon
// variant: nothing is recorded, no land gain is paid, and (unlike a snap or a
// cut) no lure is spent — the line came back, the catch did not. The count is
// the seam the run receipt's own "stolen" line reads when it lands; the small
// Dread gain is paid by the Snatcher system, at the moment of the theft.
export function stolenCatch(world: WorldState): void {
  world.run.stolen++;
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
      case 'catchStolen':
        stolenCatch(world);
        break;
      default:
        break;
    }
  }
}