// RUN TERMINAL (systems) — plan 03 §7, task t12 #4. Runs last (before ui).
// Reaching a live buoy in the boat and holding E 1.5s ends the run by
// extraction (haul → Memories at 100%); keeper hp 0 ends it by death (the
// Office's 30% condolence rate). Both freeze the RunResult, show the DOM
// overlay (municipal-invoice TRIBUTE RECEIPT / condolence), and persist the run
// to the save. Dismissing the overlay starts a fresh run (new seed).
// The system itself is pure; DOM + IndexedDB are guarded for Node tests.
// No `three` imports.

import type { WorldState } from '../core/world';
import type { Buoy } from '../gen/lakeMap';
import { endRun, startNewRun } from '../run/run';
import { showRunSummary, dismissRunSummary } from '../ui/runSummary';
import { showGradeUpLetter } from '../ui/gradeUpLetter';
import { showTrinketPicker } from '../ui/trinketPicker';
import { getSave, saveRunResult } from '../core/save';
import { gradeUpForRun, type GradeUpInfo } from '../loot/license';

export const EXTRACT_HOLD_SECONDS = 1.5; // hold E at a live buoy (task t12 #4)
export const EXTRACT_RANGE = 3; // m — how close the boat must get to a buoy

// A live (non-submerging) buoy within EXTRACT_RANGE of (x,z).
export function nearestExtractBuoy(world: WorldState, x: number, z: number): Buoy | null {
  const lake = world.lake;
  if (!lake) return null;
  let best: Buoy | null = null;
  let bestD = EXTRACT_RANGE;
  for (const b of lake.buoys) {
    if (b.submerged || b.submergeProgress > 0) continue;
    const d = Math.hypot(b.pos.x - x, b.pos.z - z);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function updateRunTerminal(world: WorldState, dt: number): void {
  const run = world.run;
  if (run.ended) return;

  // Extraction: in the boat, no fight, near a live buoy, holding E 1.5s.
  // The buoy scan only matters while E is held (or a hold is being cleared) —
  // skipping it in the common no-input case avoids a per-buoy distance walk
  // every fixed step of every boat-mode run.
  if (
    world.mode === 'boat' &&
    world.tether.fights.length === 0 &&
    (world.intent.extract || run.extract.held !== 0 || run.extract.buoyId !== null)
  ) {
    const buoy = nearestExtractBuoy(world, world.boat.x, world.boat.z);
    if (buoy && world.intent.extract) {
      run.extract.held += dt;
      run.extract.buoyId = buoy.id;
      if (run.extract.held >= EXTRACT_HOLD_SECONDS) {
        run.extract.held = 0;
        finishRun(world, true);
        return;
      }
    } else {
      run.extract.held = 0;
      run.extract.buoyId = null;
    }
  }

  // Death: keeper hp 0.
  if (world.player.hp <= 0) {
    finishRun(world, false);
  }
}

function finishRun(world: WorldState, extracted: boolean): void {
  const result = endRun(world, extracted);
  if (typeof document === 'undefined') return;

  // The grade-up is computed from the pre-persist save so the letter reads the
  // exact run that earned it; the persist promise is awaited in the discharge
  // flow so the picker/next-run read post-merge state.
  const preSave = getSave();
  const gradeUp = preSave ? gradeUpForRun(preSave, result) : null;
  const licenseGrade = gradeUp ? gradeUp.newGrade : (preSave?.license.grade ?? 1);
  const persist = saveRunResult(result).catch(() => {
    /* save failures never crash the run loop */
  });

  showRunSummary(world, result, extracted, {
    licenseGrade,
    onDischarge: () => {
      dismissRunSummary();
      void continueAfterDischarge(world, gradeUp, persist);
    },
  });
}

// After the receipt dismisses: show the grade-up letter (next hub-return) if the
// run earned one, then the pre-run trinket picker if the box has trinkets, then
// start the fresh run (startNewRun applies the equipped passives).
async function continueAfterDischarge(
  world: WorldState,
  gradeUp: GradeUpInfo | null,
  persist: Promise<unknown>,
): Promise<void> {
  await persist.catch(() => {});
  if (gradeUp) {
    showGradeUpLetter(world, gradeUp, () => pickerOrStart(world));
  } else {
    pickerOrStart(world);
  }
}

function pickerOrStart(world: WorldState): void {
  const save = getSave();
  const hasTrinkets = (save?.box ?? []).some((i) => i.slot === 'trinket');
  if (hasTrinkets) {
    showTrinketPicker(world);
  } else {
    startNewRun(world);
  }
}