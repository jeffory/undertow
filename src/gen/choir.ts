// THE CHOIR (gen) — the emissive points in the void, plan 05 §2.3 / spec §8.1
// ("Choir is emissive points on black").
//
// The zone's LOOK is "geometry only where light touches" — which would leave
// nothing at all to look at past the lantern's rim. The Choir is what is left:
// sparse cold motes hanging in the black, visible at ANY distance because they
// are not lit geometry, they are light. They are the only thing in the game that
// the darkness gate deliberately does not suppress.
//
// This module is the pure half: WHERE the motes are, and WHEN they sing. Both
// are deterministic functions of (lake seed, index) — no Math.random, no Date,
// no `three` — so render/choir.ts and systems/choir.ts read the same field and a
// replay of the same seed hangs the same lights in the same water.
//
// The drift is a function of TIME, not an integration: a mote's position is
// `home + a bounded lissajous of t`, so it never accumulates and a probe that
// samples at t = 30 s gets the same answer whatever framerate got it there.

// Sparse on purpose: the task's budget is "~40 instanced/pooled motes".
export const CHOIR_MOTE_COUNT = 40;

/**
 * m — the half-extent of the field. Sized against the 220 m lake rather than
 * beyond it: forty voices spread over a box much wider than the water put barely
 * one in frame at a time, and a choir of one is a star. This is roughly a voice
 * every 30 m, which reads as a sparse congregation from a chase camera and still
 * leaves most of the void empty.
 */
export const CHOIR_FIELD_HALF = 95;
/** m — the height band the motes hang in. Low enough to reflect, high enough to hang. */
export const CHOIR_Y_MIN = 0.6;
export const CHOIR_Y_MAX = 9.5;

/** m — how far a mote wanders from its home. Small: they hold their places. */
export const CHOIR_DRIFT_XZ = 1.9;
export const CHOIR_DRIFT_Y = 0.55;
/** rad/s — the two incommensurate rates the wander is built from. */
export const CHOIR_DRIFT_HZ_A = 0.083;
export const CHOIR_DRIFT_HZ_B = 0.061;

/** The salt that puts the Choir at its own point in the lake seed's space. */
export const CHOIR_SALT = 0x43484f52; // 'CHOR'

export interface ChoirMote {
  index: number;
  x: number;
  y: number;
  z: number;
  /** 0..1 — the mote's own place in the pulse, so they breathe out of phase. */
  phase: number;
  /** 0.55..1 — a per-mote brightness so the field has near voices and far ones. */
  brightness: number;
}

// Deterministic [0,1) hash — the same integer-lattice shape render/silt.ts and
// the driftwood field use, so the Choir reproduces byte-identically for a seed.
export function hash01(seed: number, a: number): number {
  let h = (seed ^ CHOIR_SALT) >>> 0;
  h = (h ^ Math.imul((a | 0) + 1, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A mote's HOME — its position with no drift at all. Pure, allocation-light. */
export function choirMoteHome(seed: number, index: number): ChoirMote {
  const r = (k: number): number => hash01(seed, index * 8 + k);
  return {
    index,
    x: (r(1) - 0.5) * 2 * CHOIR_FIELD_HALF,
    y: CHOIR_Y_MIN + r(2) * (CHOIR_Y_MAX - CHOIR_Y_MIN),
    z: (r(3) - 0.5) * 2 * CHOIR_FIELD_HALF,
    phase: r(4),
    brightness: 0.55 + r(5) * 0.45,
  };
}

/**
 * A mote AT TIME t. The wander is two bounded sines of incommensurate rate —
 * it reads as something holding station in a slow current, and because it is a
 * function of t (not an integration of dt) it is frame-rate independent and a
 * probe can sample it at any moment and get the canonical answer.
 */
export function choirMoteAt(seed: number, index: number, t: number): ChoirMote {
  const home = choirMoteHome(seed, index);
  const a = (home.phase + index * 0.137) * Math.PI * 2;
  const wx = Math.sin(t * CHOIR_DRIFT_HZ_A * Math.PI * 2 + a);
  const wz = Math.cos(t * CHOIR_DRIFT_HZ_B * Math.PI * 2 + a * 1.31);
  const wy = Math.sin(t * CHOIR_DRIFT_HZ_B * Math.PI * 2 + a * 0.77);
  return {
    index,
    x: home.x + wx * CHOIR_DRIFT_XZ,
    y: home.y + wy * CHOIR_DRIFT_Y,
    z: home.z + wz * CHOIR_DRIFT_XZ,
    phase: home.phase,
    brightness: home.brightness,
  };
}

/** The whole field at t. Render walks it once a frame; tests walk it twice. */
export function choirField(seed: number, t: number, count = CHOIR_MOTE_COUNT): ChoirMote[] {
  const out: ChoirMote[] = [];
  for (let i = 0; i < count; i++) out.push(choirMoteAt(seed, i, t));
  return out;
}

// --- THE SINGING ---------------------------------------------------------------
//
// "They sing: stage the choir.sang event pattern into townEvents at slow
// deterministic intervals for the audio worker later."
//
// There is no audio worker yet, so this round ships the SCHEDULE and the EVENT
// and nothing else — the same way the town-event queue shipped before anything
// drained it. The schedule is a pure function of the sing INDEX, so it does not
// need state to be reproducible and a test can assert the whole first minute of
// a run's choir without stepping a world.

/** s — the slowest gap between voices. Slow. This is a hymn, not a chorus. */
export const SING_INTERVAL_MIN = 6.5;
export const SING_INTERVAL_MAX = 13;

/** The gap before sing number `index` (0-based). Deterministic in (seed, index). */
export function singIntervalFor(seed: number, index: number): number {
  const u = hash01(seed ^ 0x5eed, index * 3 + 1);
  return SING_INTERVAL_MIN + u * (SING_INTERVAL_MAX - SING_INTERVAL_MIN);
}

/** Which mote sings the `index`-th verse. Deterministic in (seed, index). */
export function singerFor(seed: number, index: number, count = CHOIR_MOTE_COUNT): number {
  return Math.floor(hash01(seed ^ 0x51a6, index * 3 + 2) * count) % count;
}

/**
 * The pitch class of a verse, 0..6 — a degree of the leitmotif's mode, handed to
 * the audio worker as an integer so the sim never names a frequency. Twelve
 * verses walk the mode without repeating a degree twice in a row.
 */
export function singPitchFor(seed: number, index: number): number {
  return Math.floor(hash01(seed ^ 0x7017, index * 3 + 3) * 7) % 7;
}

// --- the singing CURSOR (world state) -------------------------------------------
//
// The schedule above is stateless; this is the one thing a run has to remember —
// how far through it we are. It lives on WorldState so a save/replay carries it
// and so systems/choir.ts stays a pure stepper over it.

export interface ChoirState {
  /** s until the next verse. Seeded from `singIntervalFor(seed, 0)` on entry. */
  timer: number;
  /** Verses sung this run. The index into the deterministic schedule. */
  index: number;
  /** The zone the cursor was armed for; -1 = unarmed (outside the Choir). */
  armedFor: number;
  /** The mote that sang last, or -1 — the render side pulses it. */
  lastMote: number;
  /** world.time.elapsed when the last verse fired — the render pulse's epoch. */
  lastAt: number;
}

export function createChoirState(): ChoirState {
  return { timer: 0, index: 0, armedFor: -1, lastMote: -1, lastAt: -1 };
}
