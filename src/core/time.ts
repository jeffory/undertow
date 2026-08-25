// Fixed-timestep clock (plan 01 §2.4 / §3.4).
// Accumulates real elapsed time and steps the system list at a fixed DT=1/60,
// rendering at the display rate.

export interface Time {
  dt: number; // fixed timestep (1/60)
  accumulator: number; // leftover real time to step through
  step: number; // fixed steps taken this frame (for interpolation)
  elapsed: number; // total simulated time (seconds)
  simSteps: number; // total fixed sim steps executed (runSimSteps counts these)
  lastReal: number; // performance.now() of previous frame (ms)
  nightPhase: number; // 0..1 dusk→deep-night stub; owned by 03
  timescale: number; // ?timescale=N debug multiplier (clamped 1..20, default 1)
}

// ?timescale=N debug gate-driver hook (plan 06 "Gate-driver speed"). Only honored
// alongside ?debug; N clamped to 1..MAX_TIMESCALE; default 1 (production path).
export const MAX_TIMESCALE = 20;

export function parseTimescale(search: string): number {
  if (!/[?&]debug/.test(search)) return 1;
  const m = /[?&]timescale=(\d+)/.exec(search);
  if (!m) return 1;
  const n = parseInt(m[1]!, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(MAX_TIMESCALE, Math.max(1, n));
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
    simSteps: 0,
    lastReal: 0,
    nightPhase: 0,
    timescale: 1,
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

// Steps actually due this display frame = base clock steps × timescale (plan 06
// "Gate-driver speed"). FIXED_DT is untouched, so determinism and all spec
// timings are preserved — sim time just advances N× faster per wall-clock frame.
// NOTE: this advances `elapsed` for the whole frame in one lump. Callers that
// run sim systems must use runSimSteps (below) so each step observes its own
// per-step elapsed value.
export function frameSimSteps(time: Time, realMs: number): number {
  const baseSteps = advanceClock(time, realMs);
  if (time.timescale > 1) {
    time.elapsed += baseSteps * (time.timescale - 1) * FIXED_DT;
  }
  time.step = baseSteps * time.timescale;
  return time.step;
}

// Run every sim step due this display frame, advancing `elapsed` PER STEP.
// advanceClock/frameSimSteps advance `elapsed` for the whole frame up front, so
// systems inside the step loop would all observe the end-of-frame value — and
// how steps batch into display frames depends on wall-clock frame timing, which
// breaks replay determinism (spec 8.3) for anything sampling elapsed (drag
// windows, drift sines, the Night Clock). Here each step sees
// elapsed = simSteps × FIXED_DT — an exact product, independent of batching and
// free of long-run float accumulation drift.
export function runSimSteps(time: Time, realMs: number, step: (dt: number) => void): number {
  const steps = frameSimSteps(time, realMs);
  for (let i = 0; i < steps; i++) {
    time.simSteps++;
    time.elapsed = time.simSteps * FIXED_DT;
    step(FIXED_DT);
  }
  return steps;
}
