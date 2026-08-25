// NIGHT CLOCK (systems) — plan 03 §5, task t12 #3. Runs in the `nightClock`
// slot (after spawn). The phase is a pure function of run-relative elapsed; this
// system derives one-shot phase-transition effects (buoy submergence at false
// dawn, per-phase refill timer reset) by comparing prev vs next phase. The
// clock never resets mid-run — descent and landing don't touch the epoch.
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { phaseAt, phaseProgress, runElapsedMs, PHASE_LENGTH_S, buoySinkProgress } from '../game/clock';
import { refillTimerForPhase } from '../spawn/budgets';

export function updateNightClockSystem(world: WorldState, _dt: number): void {
  const run = world.run;
  const elapsedMs = runElapsedMs(run.startedAt, world.time.elapsed);
  const phase = phaseAt(elapsedMs);

  // One-shots fire on the transition, not on a threshold (plan §5 risk note).
  if (phase !== run.spawn.lastPhase) {
    run.spawn.lastPhase = phase;
    run.spawn.refillTimer = refillTimerForPhase(phase);
  }

  // False dawn: buoys begin to submerge (secondary first, primary 90s later).
  // Outside false dawn they ride the surface.
  const lake = world.lake;
  if (lake) {
    const fdElapsed = phase === 'falseDawn' ? phaseProgress(elapsedMs) * PHASE_LENGTH_S : -1;
    for (const b of lake.buoys) {
      const progress = buoySinkProgress(b.primary, fdElapsed);
      b.submergeProgress = progress;
      b.submerged = progress >= 1;
    }
  }
}