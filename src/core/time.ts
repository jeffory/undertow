// Fixed-timestep clock (plan 01 §2.4 / §3.4).
// Accumulates real elapsed time and steps the system list at a fixed DT=1/60,
// rendering at the display rate.

export interface Time {
  dt: number; // fixed timestep (1/60)
  accumulator: number; // leftover real time to step through
  step: number; // fixed steps taken this frame (for interpolation)
  elapsed: number; // total simulated time (seconds)
  lastReal: number; // performance.now() of previous frame (ms)
  nightPhase: number; // 0..1 dusk→deep-night stub; owned by 03
}

export const FIXED_DT = 1 / 60;

// Spiral-of-death guard: at most this many fixed steps may run in a single
// frame. A big stall (tab switch, GC hitch) must not trigger a catch-up
// avalanche that compounds the stall; excess simulated time is dropped.
export const MAX_STEPS_PER_FRAME = 5;

export function createTime(): Time {
  return {
    dt: FIXED_DT,
    accumulator: 0,
    step: 0,
    elapsed: 0,
    lastReal: 0,
    nightPhase: 0,
  };
}

// Returns how many fixed steps are due given real elapsed ms since last call.
export function advanceClock(time: Time, realMs: number): number {
  if (time.lastReal === 0) {
    time.lastReal = realMs;
    return 0;
  }
  const frame = (realMs - time.lastReal) / 1000;
  time.lastReal = realMs;
  time.accumulator += frame;
  // Clamp the accumulator so a stall can never queue more than
  // MAX_STEPS_PER_FRAME steps; the excess is dropped, not deferred.
  time.accumulator = Math.min(time.accumulator, FIXED_DT * MAX_STEPS_PER_FRAME);
  let steps = 0;
  while (time.accumulator >= FIXED_DT) {
    time.accumulator -= FIXED_DT;
    time.elapsed += FIXED_DT;
    steps++;
  }
  time.step = steps;
  return steps;
}
