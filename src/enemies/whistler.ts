// THE WHISTLER (enemies) — the Choir's pressure, plan 05 §2.3:
//
//   "The Whistler (tier-4 elite, spec §5 'roaming elite that hooks YOU') roams
//    OUTSIDE your light — it is never visible until it's close enough to hook;
//    a whistle motif (audio §5.8) is your only cue. Deep-night spawns allowed
//    (t3 clock hook)."
//
// This module is the pure state + rules half, in the shape enemies/snatcher.ts
// and bosses/postmaster.ts established: no WorldState, no systems, no `three`,
// no DOM, no Math.random, no Date. `systems/whistler.ts` drives it.
//
// ── THE DESIGN, IN THREE DECISIONS ────────────────────────────────────────────
//
// 1. IT IS NEVER SEEN UNTIL IT STRIKES — and that is a CLAMP, not a hope.
//    `clampOutsideDisc` is applied to its position every tick of the roam: after
//    it has moved wherever its wander wanted to go, it is pushed back out to
//    `lanternRadius + ROAM_MARGIN`. So there is no tuning value anywhere that
//    could accidentally let it drift into frame, and — because the clamp reads
//    game/darkness.ts's ONE radius function — buying the Chandlery's bow lantern
//    literally pushes the monster further out. The upgrade is not a stat; it is
//    a bigger exclusion ring around the boat.
//
// 2. ITS APPROACH IS ONLY EVER SOUND. Three escalating proximity bands, fired
//    MONOTONICALLY (band 2 cannot fire before band 1, and a band never re-fires
//    when it drifts back out and in again). The event is `whistler.heard`, which
//    is the audio worker's cue; the three dread lines from choir.md ride the
//    same edge as faint toasts. Nothing is drawn. `bandFor` is a pure ladder, so
//    "the bands fire in order" is a unit test and not a hope either.
//
// 3. THE STRIKE IS THE POSTMASTER'S REVERSE TETHER, RE-USED WHOLE. Same
//    configuration, same reason (see bosses/postmaster.ts's essay): the boss end
//    is A (owner 'enemy', reel 'ai', cut 'contextual'), the keeper's end is B
//    (reel 'none', cut 'none'), `snapBehavior: 'hold'`. Nothing about the
//    constraint is branched or rewritten for a second reverse fight — which is
//    the point of having built it as a configuration.
//
// ── WHAT IS DIFFERENT FROM THE POSTMASTER ────────────────────────────────────
//
//   • THE ARENA — his is a roof; hers is OPEN WATER, from the boat or on foot.
//     So the keeper's endpoint is whichever body the keeper is in: the hull
//     aboard, the keeper on foot. One `strikeAnchor` call decides it.
//   • THE ROUTE — his aims at the roof RIM (the street below). Hers aims AWAY
//     FROM LAND: `deepStation` picks the bearing that maximises distance from
//     every islet, so a drag is always outward, into the black, and never
//     conveniently beaches you.
//   • THE OUTCOME — he DROWNS you (`water.lethal`). She does not. "It does NOT
//     kill outright — it delivers you to the water." The loss condition is the
//     water phase itself, occupied per the existing swamp rule (dread tier ≥ 3),
//     and then she lets go and sounds. The run continues; the keeper is simply
//     somewhere much worse, in the dark, with their breath running.
//
// The escape is his: two landed gaffs knock her grip off, and the contextual
// hold-E in reach cuts her line. Same verb, same pool, same window.

import { Rng } from '../core/rng';

// --- events (plan 05 §0.2 shape) ------------------------------------------------
// The same plain-data town-queue rows the Congregation's stings, the Snatcher's
// moments and the Postmaster's telegraphs ride, so the audio worker binds the
// Whistler without importing a line of this logic.

export interface WhistlerHeardEvent {
  type: 'whistler.heard';
  zone: number;
  /** 1, 2 or 3 — the escalating proximity bands. Fires once each, in order. */
  band: number;
  /** m — how far away it actually was on the tick the band opened. */
  distance: number;
}

export interface WhistlerHookedEvent {
  type: 'whistler.hooked';
  zone: number;
  fightId: number;
  /** Which body it took: the hull, or the keeper. */
  anchor: 'player' | 'boat';
}

export interface WhistlerCutEvent {
  type: 'whistler.cut';
  zone: number;
  fightId: number;
  drags: number; // route-drags survived
  gaffHits: number; // swings it took to open the window
}

export interface WhistlerDeliveredEvent {
  type: 'whistler.delivered';
  zone: number;
  fightId: number;
  drags: number;
  /** The existing swamp rule (boat/boatCombat.ts SWAMP_OCCUPIED_TIER): tier ≥ 3. */
  occupied: boolean;
}

export interface ChoirSangEvent {
  type: 'choir.sang';
  zone: number;
  /** The verse number this run — the audio worker's sequence position. */
  index: number;
  /** Which mote sang (gen/choir.ts). */
  mote: number;
  /** 0..6 — a degree of the mode. The sim never names a frequency. */
  pitch: number;
}

// --- the lifecycle ----------------------------------------------------------------
//
// idle      — not in the water (the state every world outside the Choir sits in)
// roam      — outside the disc, wandering; the three bands fire as it closes
// strike    — it has committed: closing on the keeper to set its line
// drag      — its line is on; it reels you outward, toward the deep
// staggered — two gaffs landed; its grip is off the line and the CUT is armed
// sounding  — it is going down (cut, or it has delivered you and let go)
// gone      — the encounter is over. One Whistler per run.
export type WhistlerPhase =
  | 'idle'
  | 'roam'
  | 'strike'
  | 'drag'
  | 'staggered'
  | 'sounding'
  | 'gone';

// --- the spawn gate ------------------------------------------------------------------
//
// "One Whistler per run max; spawn gated deep-night + zone 4 + Dread >= 60."
// All of it in one pure predicate, so the gate is testable without a world and
// impossible to half-apply.

export const WHISTLER_ZONE = 4;
/** "deep-night eligible per the plan's clock hook" — that phase and no other. */
export const WHISTLER_PHASES: ReadonlySet<string> = new Set(['deepNight']);
/** Dread floor. Zone 4's own floor is 75, so this is met on arrival — by design. */
export const WHISTLER_DREAD_MIN = 60;

export interface WhistlerGateInput {
  zone: number;
  phase: string;
  dread: number;
  spawned: boolean; // one per run
}

export function whistlerSpawnEligible(g: WhistlerGateInput): boolean {
  if (g.spawned) return false;
  if (g.zone !== WHISTLER_ZONE) return false;
  if (!WHISTLER_PHASES.has(g.phase)) return false;
  return g.dread >= WHISTLER_DREAD_MIN;
}

// --- the roam ---------------------------------------------------------------------------

/** m — how far OUTSIDE the lantern disc it is held. It is never in frame. */
export const ROAM_MARGIN = 4;
/** m — where it enters the water, measured out from the keeper. */
export const SPAWN_DIST = 78;
/** m/s — its cruising speed on the wander. Unhurried; it has the whole night. */
export const ROAM_SPEED = 5.2;
/** m/s — the speed it closes at once it has committed. */
export const STRIKE_SPEED = 9.5;
/** s between re-rolls of its wander bearing while roaming. */
export const WANDER_PERIOD = 4.5;
/** m — how much closer each wander leg tries to get. It circles inward. */
export const CLOSE_PER_LEG = 7;

/**
 * Push a point back OUT to at least `minDist` from `origin`. The whole
 * "never visible until it strikes" guarantee, as four lines of arithmetic.
 * A point exactly on the origin is pushed out along +Z (any bearing would do;
 * a fixed one keeps it deterministic).
 */
export function clampOutsideDisc(
  x: number,
  z: number,
  originX: number,
  originZ: number,
  minDist: number,
): { x: number; z: number; clamped: boolean } {
  const dx = x - originX;
  const dz = z - originZ;
  const d = Math.hypot(dx, dz);
  if (d >= minDist) return { x, z, clamped: false };
  if (d <= 1e-6) return { x: originX, z: originZ + minDist, clamped: true };
  return { x: originX + (dx / d) * minDist, z: originZ + (dz / d) * minDist, clamped: true };
}

// --- the proximity bands --------------------------------------------------------------
//
// Three rings — and they are measured RELATIVE TO THE ROAM FLOOR, not as absolute
// metres. Band 3 is "it is at the edge of your light", and the edge of your light
// moves: a Chandlery bow lantern widens the disc, which widens the clamp floor,
// which would put an absolutely-placed innermost ring permanently INSIDE the
// exclusion ring — the Whistler would circle forever, never reach its last band,
// and never strike. Anchoring the ladder to the floor makes the upgrade widen the
// whole encounter instead of breaking it.
//
// The floor itself is measured from the LANTERN (the bow aboard), and a band from
// the keeper's own body, so the innermost offset must clear BOW_OFFSET with room
// to spare. 4 m against 1.75 m does.

export const BAND_OFFSETS: readonly number[] = [38, 14, 4];

/** The three ring radii for a given roam floor (`lanternRadius + ROAM_MARGIN`). */
export function bandRings(discFloor: number): number[] {
  return BAND_OFFSETS.map((o) => discFloor + o);
}

/** The band a distance falls in: 0 (nothing yet), 1, 2 or 3. Pure ladder. */
export function bandFor(distance: number, discFloor: number): number {
  const rings = bandRings(discFloor);
  let band = 0;
  for (let i = 0; i < rings.length; i++) {
    if (distance <= rings[i]!) band = i + 1;
  }
  return band;
}

/** The last band. Once it is heard here it has committed to a strike. */
export const FINAL_BAND = BAND_OFFSETS.length;

// --- the strike / the line ----------------------------------------------------------------

/** m — how close it gets before its line goes on. Inside the disc at last. */
export const STRIKE_RANGE = 13;
/** m — L at the hook-set. Long: it means to take you a long way out. */
export const LINE_LENGTH = 20;
/** m — the L floor on its end. Inside gaff REACH (1.6 m): it comes to arm's length. */
export const WHISTLER_RADIUS = 1.1;
/** Its mass against the keeper's 1.0. Heavier than the Postmaster: it is the lake. */
export const WHISTLER_MASS = 11;
/** m/s — how fast it takes line during a haul (`fight.reelRate`). */
export const WHISTLER_REEL_RATE = 3.1;
/** m/s — line paid back out between hauls, up to LINE_LENGTH. */
export const PAYOUT_RATE = 3.6;
/** The lineId every event of its carries. It is not your line either. */
export const WHISTLER_LINE_ID = 'whistle-gut';

/** s it spends closing before the line is actually set (the last silent beat). */
export const STRIKE_SECONDS = 1.4;
/** s of hauling per drag. Longer than a delivery: it is going somewhere. */
export const DRAG_SECONDS = 3.2;
/** s between hauls — it lets you breathe, then takes it back. */
export const REST_SECONDS = 1.8;
/** s it takes to go down once it is finished with you. */
export const SOUND_SECONDS = 2.2;

/** m — how far past the current position a deep station stands. */
export const DEEP_OVERSHOOT = 26;

// --- the gaff / the cut ---------------------------------------------------------------------
//
// The Postmaster's window, verbatim: two landed gaffs (a heavy is worth both)
// knock its grip off the line, and the contextual hold-E is live only while it
// is staggered. Reused rather than re-tuned — the keeper already learned this
// verb one zone up, and the Choir is not the place to teach a new one.

export const GAFF_POOL = 2;
export const GAFF_COST_LIGHT = 1;
export const GAFF_COST_HEAVY = 2;
export const STAGGER_SECONDS = 3.5;
export const CUT_HOLD_SECONDS = 0.6;
export const CUT_REACH = 2.4;

/** hit-event targetId for the Whistler (game/combat.ts owns the id space). */
export const WHISTLER_TARGET_ID = 11;
/** m — the body radius the gaff arc tests against. */
export const WHISTLER_HIT_RADIUS = 0.8;

/** Dread the run takes for having been delivered to the water by it. */
export const DELIVER_DREAD_GAIN = 6;

// --- state -----------------------------------------------------------------------------------

export interface WhistlerState {
  phase: WhistlerPhase;
  /** The reverse fight it owns, or -1. */
  fightId: number;
  x: number;
  z: number;
  facing: number; // radians, world convention (0 = +Z)
  speed: number; // m/s this tick — render reads it
  /** The rig the render side builds its body from (null while idle). */
  params: import('../gen/fishParams').FishParams | null;

  /** s left in the current phase. */
  timer: number;
  /** s until the next wander bearing is rolled. */
  wanderTimer: number;
  /** The bearing it is wandering along (rad). */
  wanderAngle: number;
  /** How far out this wander leg is trying to hold. Shrinks each leg. */
  wanderRing: number;
  /** Wander legs walked — the roll index for its own seed stream. */
  legs: number;

  /** The highest proximity band heard so far, 0..3. Monotonic; never regresses. */
  band: number;
  /** m — the distance recorded when the current band opened (the event payload). */
  bandDistance: number;

  /** Route-drags begun this fight. */
  drags: number;
  /** The deep station this haul is pulling toward. */
  routeX: number;
  routeZ: number;
  /** True while the constraint should let it take line (`fight.aiReel`). */
  reeling: boolean;

  /** Gaff pool left before the stagger; GAFF_POOL at the hook and after recovery. */
  gaffHp: number;
  /** Swings landed on it this encounter. */
  gaffHits: number;
  /** s of hold-E banked on the cut. */
  cutHeld: number;

  /** Its line was cut — the escape latch (kept after `phase` moves to 'gone'). */
  cut: boolean;
  /** It delivered the keeper to the water — the loss latch. */
  delivered: boolean;
  /** In the water at least once this run (one Whistler per run). */
  spawned: boolean;
}

export function createWhistlerState(): WhistlerState {
  return {
    phase: 'idle',
    fightId: -1,
    x: 0,
    z: 0,
    facing: 0,
    speed: 0,
    params: null,
    timer: 0,
    wanderTimer: 0,
    wanderAngle: 0,
    wanderRing: SPAWN_DIST,
    legs: 0,
    band: 0,
    bandDistance: 0,
    drags: 0,
    routeX: 0,
    routeZ: 0,
    reeling: false,
    gaffHp: GAFF_POOL,
    gaffHits: 0,
    cutHeld: 0,
    cut: false,
    delivered: false,
    spawned: false,
  };
}

/** In the water — anything but idle and gone. */
export function whistlerActive(s: WhistlerState): boolean {
  return s.phase !== 'idle' && s.phase !== 'gone';
}

/** It owns a line right now (the phases that hold a live TetherFight). */
export function whistlerFighting(s: WhistlerState): boolean {
  return s.phase === 'drag' || s.phase === 'staggered';
}

/** The cut is armed: it is staggered and the window has not lapsed. */
export function cutArmed(s: WhistlerState): boolean {
  return s.phase === 'staggered';
}

/** 0..1 of the cut hold — the ring the prompt draws. */
export function cutProgress(s: WhistlerState): number {
  return Math.min(1, s.cutHeld / CUT_HOLD_SECONDS);
}

// --- determinism ------------------------------------------------------------------------------
//
// Its own PCG32 point in seed space, keyed by (run seed, leg index) the way
// snatcherRng keys the second mouth and postmasterRng keys a delivery — so the
// same seed, at the same Dread, in the same phase, sends the same animal in on
// the same wander.

export const WHISTLER_SALT = 0x57484c52; // 'WHLR'

export function whistlerRng(seed: number, leg: number): Rng {
  return new Rng(((seed * 2654435761) ^ ((leg + 1) * 0x9e3779b1) ^ WHISTLER_SALT) >>> 0);
}

/** The bearing it enters the water on. */
export function rollSpawnBearing(rng: Rng): number {
  return rng.nextFloat() * Math.PI * 2;
}

/** The bearing the next wander leg runs along. */
export function rollWanderBearing(rng: Rng): number {
  return rng.nextFloat() * Math.PI * 2;
}

// --- the deep -----------------------------------------------------------------------------------
//
// "it drags you toward the deep (routes away from islets)". The station is a
// point DEEP_OVERSHOOT metres along the bearing that gets furthest from land:
// of a fixed fan of candidate bearings, the one whose station's nearest islet is
// furthest away wins. A fixed fan (not a search) keeps it pure, allocation-free
// and exactly reproducible; the fan is fine enough that the chosen bearing is
// within 22.5° of the true optimum, and the sea is not a maze.

export const DEEP_FAN = 16; // candidate bearings, evenly spaced

export interface Landmark {
  x: number;
  z: number;
}

/** Distance from (x,z) to the nearest landmark. Infinity when there are none. */
export function nearestLandmarkDistance(x: number, z: number, land: readonly Landmark[]): number {
  let best = Infinity;
  for (const l of land) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The station a haul pulls the keeper toward: DEEP_OVERSHOOT out from where they
 * are now, on the bearing that puts the most water between them and every islet.
 * Ties break toward the lower bearing index, so it is deterministic.
 */
export function deepStation(
  fromX: number,
  fromZ: number,
  land: readonly Landmark[],
  overshoot = DEEP_OVERSHOOT,
): { x: number; z: number; angle: number } {
  let best = { x: fromX, z: fromZ + overshoot, angle: 0 };
  let bestClear = -Infinity;
  for (let i = 0; i < DEEP_FAN; i++) {
    const angle = (i / DEEP_FAN) * Math.PI * 2;
    const x = fromX + Math.cos(angle) * overshoot;
    const z = fromZ + Math.sin(angle) * overshoot;
    const clear = nearestLandmarkDistance(x, z, land);
    if (clear > bestClear) {
      bestClear = clear;
      best = { x, z, angle };
    }
  }
  return best;
}

// --- the gaff --------------------------------------------------------------------------------------

/** How much grip ONE swing takes off. Heavy swings stagger; lights do not. */
export function whistlerGaffCost(stagger: number): number {
  return stagger > 0 ? GAFF_COST_HEAVY : GAFF_COST_LIGHT;
}

// --- movement helper -----------------------------------------------------------------------------

/** One step of swimming toward a point, capped at `speed`. Pure. */
export function swimToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
  speed: number,
  dt: number,
): { x: number; z: number; facing: number; moved: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const facing = dist > 1e-6 ? Math.atan2(dx, dz) : 0;
  if (dist <= 1e-6) return { x: from.x, z: from.z, facing, moved: 0 };
  const step = Math.min(dist, speed * dt);
  return { x: from.x + (dx / dist) * step, z: from.z + (dz / dist) * step, facing, moved: step };
}
