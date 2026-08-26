// THE SNATCHER (enemies) — the Township's pressure, plan 05 §2.2:
//
//   "Snatchers (spec §4.4, t4 rigs) spawn actively and try to steal your hooked
//    catch — a second mouth on the line; kill it or lose the catch (t2 must
//    allow a third entity on the line — interface flagged)."
//
// This module is the pure state + rules half, in the shape bosses/congregation
// .ts and boat/boatCombat.ts established: no WorldState, no systems, no
// `three`, no Math.random, no Date. `systems/snatcher.ts` drives it — the spawn
// gate, the approach, the latch, the steal clock, the gaff kill.
//
// THE THIRD ENTITY, AS A FIGHT MODIFIER (the design decision this round owes):
// the constraint is NOT rewritten. A latched Snatcher is a `TetherRider` on the
// one two-endpoint fight the player already understands (game/tether.ts), and
// everything it does to that fight is expressed in the two levers the tether
// already exposes:
//
//   (a) PULL — `pullForceMult`, the same seam the Congregation's mass pool
//       drives. The two COMPOSE through `effectivePullMult` (fight × rider), so
//       neither owner has to know the other exists;
//   (b) TENSION — a steady upward `tensionBias` while it holds, which is the
//       steal clock made legible in the currency the player already reads;
//   (c) TIME — the steal clock itself, which is the only thing here that is
//       genuinely new, and which resolves into an ordinary fight-end.
//
// Nothing above can perturb a fight that has no rider, which is what "zones 1-2
// stay byte-identical" costs in practice.

import { Rng } from '../core/rng';
import type { FishParams } from '../gen/fishParams';

// --- events (plan 05 §0.2 shape; task t28: snatcher.latched / .killed / .stole)
// The same plain-data town-queue shape the Congregation's stings ride, so the
// audio worker binds these without importing a line of this logic.

export interface SnatcherLatchedEvent {
  type: 'snatcher.latched';
  zone: number;
  fightId: number;
  species: string; // the CATCH's species — what is being contested
  stealSeconds: number;
}

export interface SnatcherKilledEvent {
  type: 'snatcher.killed';
  zone: number;
  fightId: number;
  gaffHits: number; // swings it took
  stealLeft: number; // s that were left on the clock when it died
}

export interface SnatcherStoleEvent {
  type: 'snatcher.stole';
  zone: number;
  fightId: number;
  species: string; // the catch it took
}

// --- the lifecycle ---------------------------------------------------------------

// idle      — nothing on the water (the state every world outside zone 3 sits in)
// approach  — a wake closing on the HOOKED CATCH from outside. Telegraphed.
// latched   — the second mouth is on the line; the steal clock runs
// dying     — killed; the body drifts off for a beat, then idle
export type SnatcherPhase = 'idle' | 'approach' | 'latched' | 'dying';

// plan 05 §2.2 / task: "the spawn director MAY launch a Snatcher" once a fight
// has been live a while — long enough that the player has committed to it.
export const SPAWN_DELAY_MIN = 6; // s of live fight before one may launch
export const SPAWN_DELAY_MAX = 12;
// After a kill, the street needs a moment before it sends the next one.
export const RESPAWN_DELAY_MIN = 14;
export const RESPAWN_DELAY_MAX = 22;

// "it approaches the HOOKED CATCH (not the player) from outside, visible as a
// wake/fin approach (telegraphed — the player gets a few seconds)".
export const APPROACH_RADIUS = 14; // m out from the catch it appears at
export const APPROACH_SPEED = 4.2; // m/s — ~3.3 s of visible wake before it bites
export const LATCH_DISTANCE = 1.1; // m from the catch it bites down at

// "a STEAL CLOCK runs (~8-10s)". Nine.
export const STEAL_SECONDS = 9;
// The split-tension line fires as the clock crosses its own halfway mark.
export const SPLIT_LINE_AT = STEAL_SECONDS / 2;

// (a) "effective fish mass/pull increases … stack a snatcherMult"
export const SNATCHER_PULL_MULT = 1.45;
// (b) "tension gains a steady upward bias (the steal timer pressure)"
export const SNATCHER_TENSION_BIAS = 4.5; // tension/s

// "2-3 gaff hits kill it": a light tap is worth 1, a heavy is worth 2, and it
// takes 3 — so three lights, or a heavy and a light. The same shape as the
// Congregation's gaffTearFor, because it is the same swing.
export const SNATCHER_GAFF_HP = 3;
export const GAFF_COST_LIGHT = 1;
export const GAFF_COST_HEAVY = 2;

// THE KILL VERB (the reuse decision this round owes): the ordinary gaff, with
// no new verb, no new button and no new arc — but the Snatcher is only IN that
// arc while it is SURFACED. Latched, it works the catch down on the hook, out
// of reach; every SURFACE_PERIOD it comes up the line to the hauling end (the
// gunwale aboard, the keeper's side on foot) and holds there, gaffable, for
// SURFACE_UP seconds. One rule, both modes.
export const SURFACE_DOWN = 2.4; // s out of reach, working the catch
export const SURFACE_UP = 1.8; // s at the hauling end, gaffable
export const SURFACE_PERIOD = SURFACE_DOWN + SURFACE_UP;
// How far off the hauling end it holds while surfaced. Inside gaff REACH (1.6 m
// — game/combat.ts) so an ordinary swing lands, outside the body radius so it
// is not standing on the keeper.
export const GUNWALE_HOLD = 1.2; // m
export const LATCHED_SWIM = 5.5; // m/s it moves between the catch and the gunwale

// The body drifts for this long after it dies, then stops being drawn.
export const DEATH_DRIFT_SECONDS = 1.4;
export const DEATH_DRIFT_SPEED = 1.6; // m/s

// (c) "if it completes, the catch is GONE … Dread gain small"
export const STEAL_DREAD_GAIN = 3;

// hit-event targetId for the Snatcher (game/combat.ts owns the id space; the
// single M1 fish is 0).
export const SNATCHER_TARGET_ID = 7;

export interface SnatcherState {
  phase: SnatcherPhase;
  /** The fight it is riding, or -1. */
  fightId: number;
  x: number;
  z: number;
  facing: number; // radians, world convention (0 = +Z)
  speed: number; // m/s this tick — the wake emitter reads it
  /** The rig the render side builds its body from (null while idle). */
  params: FishParams | null;
  /** s since it entered the water on this approach. */
  elapsed: number;
  /** s left on the steal clock (latched only). */
  steal: number;
  /** Gaff pool left; SNATCHER_GAFF_HP at latch. */
  gaffHp: number;
  /** Swings landed on it this life (the killed event reports it). */
  gaffHits: number;
  /** Position in the surfacing cycle, 0..SURFACE_PERIOD. */
  surfaceTimer: number;
  /** True while it is at the hauling end and gaffable. */
  surfaced: boolean;
  /** s of death drift left (phase 'dying'). */
  dying: number;
  /**
   * Where it entered the water on this approach, and the delay that was rolled
   * for it. Both are pure functions of (run seed, fight id, launch index) —
   * recorded so the determinism gate can compare the SEEDED facts instead of
   * whatever the frame it sampled happened to catch.
   */
  originX: number;
  originZ: number;
  spawnDelay: number;

  // --- director bookkeeping (per fight) --------------------------------------
  /** s until the director may launch one onto the live fight. */
  spawnTimer: number;
  /** The fight id the current spawn timer was armed for (-1 = unarmed). */
  armedFor: number;
  /** Rolls consumed on this fight — salts each launch's own stream. */
  launches: number;

  // --- run tallies (the readout / receipt seam) ------------------------------
  killed: number;
  stolen: number;
}

export function createSnatcherState(): SnatcherState {
  return {
    phase: 'idle',
    fightId: -1,
    x: 0,
    z: 0,
    facing: 0,
    speed: 0,
    params: null,
    elapsed: 0,
    steal: 0,
    gaffHp: 0,
    gaffHits: 0,
    surfaceTimer: 0,
    surfaced: false,
    dying: 0,
    originX: 0,
    originZ: 0,
    spawnDelay: 0,
    spawnTimer: 0,
    armedFor: -1,
    launches: 0,
    killed: 0,
    stolen: 0,
  };
}

/** Live on the water — approaching, latched, or still drifting dead. */
export function snatcherActive(s: SnatcherState): boolean {
  return s.phase !== 'idle';
}

/** On the line — the only phase that modifies the fight. */
export function snatcherLatched(s: SnatcherState): boolean {
  return s.phase === 'latched';
}

// --- the spawn gate ------------------------------------------------------------------
//
// "SNATCHER LIFECYCLE (sim, zone 3, night+ phases, active-fight-triggered)".
// All four conditions, in one pure predicate, so the gate is testable without a
// world and impossible to half-apply:
//   • ZONE — the Township only. Zone-1 fights (every M2 tether-gate scenario)
//     and zone-2 fights never see one.
//   • PHASE — night or deeper. The Hollow audits nothing at dusk.
//   • FIGHT — a live tether fight with a hooked catch. There is no second mouth
//     without a first one.
//   • ONE AT A TIME — a Snatcher already on the water is the whole encounter.

export const SNATCHER_ZONE = 3;
export const SNATCHER_PHASES: ReadonlySet<string> = new Set(['night', 'deepNight']);

export interface SnatcherGateInput {
  zone: number;
  phase: string;
  fightLive: boolean;
  hasCatch: boolean;
  active: boolean; // one is already on the water
}

export function snatcherSpawnEligible(g: SnatcherGateInput): boolean {
  if (g.active) return false;
  if (g.zone !== SNATCHER_ZONE) return false;
  if (!SNATCHER_PHASES.has(g.phase)) return false;
  return g.fightLive && g.hasCatch;
}

// --- determinism ----------------------------------------------------------------------

// The Snatcher's own PCG32 point in seed space, keyed by (run seed, fight id,
// launch index) exactly the way initTetherFishAI keys the catch's FSM — so the
// same seed fighting the same fight sends the same animal, from the same
// bearing, on the same schedule (spec 8.3).
export const SNATCHER_SALT = 0x534e4348; // 'SNCH'

export function snatcherRng(seed: number, fightId: number, launch: number): Rng {
  return new Rng(
    ((seed * 2654435761) ^ (fightId * 2246822519) ^ ((launch + 1) * 0x9e3779b1) ^ SNATCHER_SALT) >>>
      0,
  );
}

/** s of live fight before the director may launch onto it. */
export function rollSpawnDelay(rng: Rng): number {
  return rng.range(SPAWN_DELAY_MIN, SPAWN_DELAY_MAX);
}

/** s after a kill before the next one may launch onto the same fight. */
export function rollRespawnDelay(rng: Rng): number {
  return rng.range(RESPAWN_DELAY_MIN, RESPAWN_DELAY_MAX);
}

/** Where it comes from: a bearing on the approach ring around the catch. */
export function approachPoint(rng: Rng, catchX: number, catchZ: number): { x: number; z: number } {
  const ang = rng.nextFloat() * Math.PI * 2;
  return { x: catchX + Math.cos(ang) * APPROACH_RADIUS, z: catchZ + Math.sin(ang) * APPROACH_RADIUS };
}

// --- the latch math -------------------------------------------------------------------

/** The rider a latch installs on the fight. Data only — see game/tether.ts. */
export function snatcherRider(): {
  kind: 'snatcher';
  owner: 'third';
  on: 'b';
  pullForceMult: number;
  tensionBias: number;
} {
  return {
    kind: 'snatcher',
    owner: 'third',
    on: 'b', // the catch end: it bit down on what you hooked, not on you
    pullForceMult: SNATCHER_PULL_MULT,
    tensionBias: SNATCHER_TENSION_BIAS,
  };
}

/** How much gaff pool ONE swing takes off. Heavy swings stagger; lights do not. */
export function snatcherGaffCost(stagger: number): number {
  return stagger > 0 ? GAFF_COST_HEAVY : GAFF_COST_LIGHT;
}

/**
 * The surfacing cycle, as a pure function of the cycle clock. Down first: the
 * moment it latches it is under, working the catch, and the player has to wait
 * for it to come up before the gaff is worth anything.
 */
export function surfacedAt(surfaceTimer: number): boolean {
  const t = ((surfaceTimer % SURFACE_PERIOD) + SURFACE_PERIOD) % SURFACE_PERIOD;
  return t >= SURFACE_DOWN;
}

/** Steal-clock fraction remaining, 1 at latch → 0 at the steal. */
export function stealFraction(s: SnatcherState): number {
  if (s.phase !== 'latched') return 0;
  return Math.max(0, Math.min(1, s.steal / STEAL_SECONDS));
}

// --- movement -------------------------------------------------------------------------

export interface Point {
  x: number;
  z: number;
}

/**
 * Step a body toward a target at `speed`, returning the new position, the
 * distance covered and the heading it moved on. Pure — the approach, the dive
 * back to the catch and the run to the gunwale are all this one function.
 */
export function swimToward(
  from: Point,
  to: Point,
  speed: number,
  dt: number,
): { x: number; z: number; facing: number; moved: number; arrived: boolean } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const facing = dist > 1e-6 ? Math.atan2(dx, dz) : 0;
  const step = speed * dt;
  if (dist <= 1e-6) return { x: from.x, z: from.z, facing: 0, moved: 0, arrived: true };
  if (step >= dist) return { x: to.x, z: to.z, facing, moved: dist, arrived: true };
  return {
    x: from.x + (dx / dist) * step,
    z: from.z + (dz / dist) * step,
    facing,
    moved: step,
    arrived: false,
  };
}

/**
 * Where a LATCHED Snatcher wants to be this tick: down on the catch, or up at
 * the hauling end holding station at GUNWALE_HOLD on the line's own bearing —
 * which is exactly where an ordinary gaff swing reaches.
 */
export function latchedTarget(
  surfaced: boolean,
  catchAt: Point,
  haulAt: Point,
): { x: number; z: number } {
  if (!surfaced) return { x: catchAt.x, z: catchAt.z };
  const dx = catchAt.x - haulAt.x;
  const dz = catchAt.z - haulAt.z;
  const len = Math.hypot(dx, dz);
  if (len <= 1e-6) return { x: haulAt.x, z: haulAt.z + GUNWALE_HOLD };
  return { x: haulAt.x + (dx / len) * GUNWALE_HOLD, z: haulAt.z + (dz / len) * GUNWALE_HOLD };
}
