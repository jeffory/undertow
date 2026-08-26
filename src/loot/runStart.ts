// RUN START (loot) — the build-passives seam (task t19 "effect hooks as a clean
// applyTrinkets(world) at run start"). applyTrinkets applies a set of trinkets'
// effects to a fresh world; applyRunStartPassives is the run-start hook that
// reads the save's equipped loadout + license grade and applies both, then runs
// the M5 `runMetaStart` hook (plan 05 §0.2: starting Dread = 2 × restored
// buildings, capped 30). Called by startNewRun (run/run.ts) and after the boot
// save load (main.ts).
//
// Wired effects (only where a system exists):
//   hp            → +player.maxHp
//   staminaRegen  → +player.staminaRegenBonus (stamina.ts reads it)
//   memories      → ×(1+value) world.run.memoriesMult (buildRunResult reads it)
//   brace         → ×(1+value) tuning.braceEfficacy (the tether constraint reads it)
//   breath        → +water.breathMax (waterPhase reads it)
// Everything else (reel / gaff / dodge / congregation) is a deliberate no-op —
// those systems don't exist yet, so their affixes are collected but silent.
//
// Pure logic: no `three` imports (core/save is a guarded DOM/IndexedDB seam).

import type { WorldState } from '../core/world';
import { getSave } from '../core/save';
import { applyLicensePassives } from './license';
import { runMetaStart } from '../meta/runMeta';
import { applyRigGear } from '../meta/rigLoadout';
import type { SundryItem } from './items';

// Apply trinket effects to a FRESH world. Mutates world in place.
export function applyTrinkets(world: WorldState, items: readonly SundryItem[]): void {
  for (const item of items) {
    for (const fx of item.effects) applyEffect(world, fx.key, fx.value);
  }
}

export function applyEffect(world: WorldState, key: string, value: number): void {
  switch (key) {
    case 'hp':
      world.player.maxHp += value;
      world.player.hp = world.player.maxHp; // a fresh run starts full
      break;
    case 'staminaRegen':
      world.player.staminaRegenBonus += value;
      break;
    case 'memories':
      world.run.memoriesMult *= 1 + value;
      break;
    case 'brace':
      world.tuning.braceEfficacy = Math.min(1, world.tuning.braceEfficacy * (1 + value));
      break;
    case 'breath':
      world.water.breathMax += value;
      break;
    default:
      break; // unwired gimmicks — collected, silent until their system exists
  }
}

// The save's currently-equipped trinkets (2 slots; ids resolve into the box).
// SOURCE OF TRUTH: the M5 rig-up register's `rigLoadout.trinketIds` (task t19 —
// the rig-up is the writer of the loadout, run-start reads the same array). The
// legacy top-level `equipped` mirror is the fallback for saves/pre-picker call
// sites that only ever knew the old field. Missing ids and duplicates are both
// ignored (the loadout is a Set).
export function equippedItems(save: {
  equipped?: string[];
  rigLoadout?: { trinketIds?: string[] };
  box: SundryItem[];
}): SundryItem[] {
  const seen = new Set<string>();
  const out: SundryItem[] = [];
  const ids = save.rigLoadout?.trinketIds ?? save.equipped ?? [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = save.box.find((i) => i.id === id);
    if (item) out.push(item);
  }
  return out;
}

// The run-start seam: read the save (no-op when none is loaded — boot/tests),
// then apply license passives + equipped trinkets to the fresh world, then the
// rig-up's gear (line/lure slots — the same rigLoadout the register writes),
// and finally the town's starting-Dread base (plan 05 §0.2). The Dread hook
// runs LAST so it stamps run.startedAtDread after everything else has settled.
export function applyRunStartPassives(world: WorldState): void {
  const save = getSave();
  if (!save) return;
  world.run.licenseGrade = save.license.grade;
  applyLicensePassives(world, save.license.grade);
  applyTrinkets(world, equippedItems(save));
  applyRigGear(world, save);
  runMetaStart(world, save.metaState);
}