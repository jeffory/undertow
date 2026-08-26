// THE CHOIR (systems) — the void's singing cursor, plan 05 §2.3.
//
// "THE CHOIR ITSELF: sparse emissive points in the void … They sing: stage the
//  choir.sang event pattern into townEvents at slow deterministic intervals for
//  the audio worker later."
//
// That is the whole job. There is no audio worker yet, so this round ships the
// EVENT and the SCHEDULE and stops there — exactly the way the town-event queue
// itself shipped before anything drained it, and the way the tether's boat/
// reverse/snatch event variants were data from day one. The schedule lives in
// gen/choir.ts as a pure function of (seed, verse index); this is the stepper
// that walks it and the one place a verse becomes an event.
//
// The cursor ARMS on entering the Choir and DISARMS on leaving, so the first
// verse of a zone-4 visit is always `singIntervalFor(seed, index)` after arrival
// and never a leftover fraction from somewhere else. Verse numbering does NOT
// reset on re-entry: a run has one choir and it keeps singing where it left off.
//
// Runs in its own sim slot next to the Whistler. Zone-gated to a single integer
// comparison everywhere else in the game.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import { CHOIR_ZONE } from '../core/zones';
import { CHOIR_MOTE_COUNT, singIntervalFor, singerFor, singPitchFor } from '../gen/choir';
import { emitTownEvent } from '../meta/townEvents';

export function updateChoir(world: WorldState, dt: number): void {
  const c = world.choir;
  const zone = world.run ? world.run.zone : 1;

  if (zone !== CHOIR_ZONE) {
    // Outside the void the cursor is parked, not reset — a run that descends
    // out of the Choir into the Mouth keeps its verse count, and one that never
    // reaches it costs exactly this comparison per tick.
    c.armedFor = -1;
    return;
  }

  // Arm on arrival: the first verse of the visit is a full seeded interval away.
  if (c.armedFor !== zone) {
    c.armedFor = zone;
    c.timer = singIntervalFor(world.seed, c.index);
  }

  c.timer -= dt;
  if (c.timer > 0) return;

  const index = c.index;
  const mote = singerFor(world.seed, index, CHOIR_MOTE_COUNT);
  const pitch = singPitchFor(world.seed, index);
  c.index = index + 1;
  c.lastMote = mote;
  c.lastAt = world.time.elapsed;
  // Roll the next gap from the NEW index, and carry the overshoot so a long
  // frame never silently swallows part of the next interval.
  c.timer += singIntervalFor(world.seed, c.index);

  emitTownEvent({ type: 'choir.sang', zone, index, mote, pitch });
}

/** Probe/gate readout: where the hymn has got to. */
export function choirCursor(world: WorldState): {
  armed: boolean;
  index: number;
  timer: number;
  lastMote: number;
  lastAt: number;
} {
  const c = world.choir;
  return {
    armed: c.armedFor === CHOIR_ZONE,
    index: c.index,
    timer: c.timer,
    lastMote: c.lastMote,
    lastAt: c.lastAt,
  };
}
