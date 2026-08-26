// THE POSTMASTER (bosses) — the Township boss, plan 05 §2.2:
//
//   "Design: hooks YOU with delivery lines — a reverse-tether fight. Drops the
//    Office's forwarding address.
//    Sketch: fight start inverts the constraint (interface with t2's
//    reverse-tether mode): the boss owns the line, reels, drags you by route;
//    you cannot reel, only move, gaff, and reach. The boss's verbs are delivery
//    lines — speech-bubble telegraphs ('SPECIAL DELIVERY.', 'RETURN TO
//    SENDER.', 'SIGN HERE.') each preceding a route-drag to a hazard … Victory:
//    close-range contextual action CUTS THE BOSS'S LINE (distinct from the
//    player's F-cut which costs a lure) → boss drops the forwarding address …"
//
// This module is the pure state + rules half, in the shape bosses/congregation
// .ts and enemies/snatcher.ts established: no WorldState, no systems, no
// `three`, no DOM, no Math.random, no Date. `systems/postmaster.ts` drives it.
//
// ── THE REVERSE TETHER, AS A CONFIGURATION (the decision this round owes) ──
//
// The constraint is NOT rewritten and NOT branched. plan 02 built the endpoint
// shape generic "from day one so 03's boat fight and 05's reverse/snatch fights
// slot in without a refactor", and this is the round that cashes that cheque:
// the reverse fight is ONE ORDINARY `TetherFight` whose two endpoints are
// filled in the other order.
//
//        a = THE BOSS      owner 'enemy'   reel {kind:'ai'}   cut {kind:'contextual'}
//        b = THE PLAYER    owner 'player'  reel {kind:'none'} cut {kind:'none'}
//
// Everything the fight does then falls out of machinery that already existed:
//
//   • HE REELS — `resolveReelHold` already dispatches on the A end's ReelSource
//     and already had an 'ai' case waiting ("05 fills aiReelIntent"). It now
//     reads `fight.aiReel`, which this boss sets during a drag. L shortens on
//     HIS side, at `fight.reelRate` (the same per-fight override the boat
//     winch uses) — and because the player is 1/10th of his mass, the
//     correction lands almost entirely on the keeper. That IS the drag.
//   • YOU CANNOT REEL — the player end's ReelSource is 'none', so RMB is inert
//     in this fight without a single line of "if boss fight" anywhere.
//   • YOU CANNOT F-CUT IT FOR A LURE — neither end carries a 'lure' CutCost, so
//     `resolveCutCost` finds nothing and the F-ring does not end the fight. The
//     ordinary F-cut is untouched everywhere else because everywhere else has
//     one.
//   • YOU BRACE — the constraint's brace term is already written against
//     "whichever endpoint is owned by 'player'", either side, so setting your
//     feet into the pull works from the B end unchanged.
//   • IT DOES NOT SNAP — it is HIS twine. `snapBehavior: 'hold'` (the per-fight
//     override, same seam shape as `reelRate`/`pullForceMult`) parks tension at
//     the ceiling instead of parting the line, so "run away until it breaks" is
//     not a win condition. What high tension buys you is a courtesy line and a
//     harder next delivery.
//
// ── THE ARENA AND THE HAZARD ──
//
// plan 05 §2.2 lists three interior hazards (sorting shelf, drain grate,
// flooded doorway). Interiors are not built (M7 round 1 shipped the ROOFS), so
// this round simplifies faithfully to the one hazard the drowned town does
// have and the plan itself names in the same breath: "you get yanked off roofs
// into the streets". The arena is the POST OFFICE ROOF; every route-drag aims
// at a point past its rim; going over is the water phase, and in THIS fight
// breath is lethal. One hazard, honestly documented, instead of three faked.

import { Rng } from '../core/rng';
import type { Vec2 } from '../core/poly';
import type { PostmasterVerb } from '../content/postmasterLines';

// --- events (plan 05 §0.2 shape) --------------------------------------------------
// The same plain-data town-queue rows the Congregation's stings and the
// Snatcher's moments ride, so the audio worker binds the boss without importing
// a line of this logic.

export interface PostmasterSummonedEvent {
  type: 'postmaster.summoned';
  zone: number;
  fightId: number;
  roofId: number;
}

export interface PostmasterTelegraphEvent {
  type: 'postmaster.telegraph';
  zone: number;
  fightId: number;
  verb: PostmasterVerb;
  line: string;
  canonical: boolean;
}

export interface PostmasterCutEvent {
  type: 'postmaster.cut';
  zone: number;
  fightId: number;
  drags: number; // route-drags survived
  gaffHits: number; // swings it took to open the window
}

export interface PostmasterDeliveredEvent {
  type: 'postmaster.delivered';
  zone: number;
  fightId: number;
  drags: number;
}

// --- the fight's shape ---------------------------------------------------------------

// idle       — not summoned (the state every world outside the arena sits in)
// arrive     — he surfaces at the roof and takes the line; APPROACH courtesy
// station    — he walks the line to the next hazard bearing; REPOSITION courtesy
// telegraph  — the speech-bubble card is up; 1.2 s before the pull lands
// drag       — the route-drag: he reels, you go where the route goes
// staggered  — two gaffs landed; his grip is off the twine and the CUT is armed
// sinking    — his line is cut; he goes down courteously
// gone       — the encounter is over (cut, or he delivered you)
export type PostmasterPhase =
  | 'idle'
  | 'arrive'
  | 'station'
  | 'telegraph'
  | 'drag'
  | 'staggered'
  | 'sinking'
  | 'gone';

// --- the summon --------------------------------------------------------------------
// "the fight triggers on foot on a specific Township roof (the Post Office
// roof); hold-E at the marker at night+ summons him". The marker is the env
// point gen/township.ts tags the post-office roof with.

// The arena itself (the building id, the env key, and where the letterbox is)
// belongs to gen/township.ts, which grew the street — this module never imports
// the generator, and the driver does the joining.
/** m — how close to the letterbox marker the keeper must stand. */
export const SUMMON_RANGE = 4.5;
/** s — the contextual hold. Longer than the ledger's 1 s: this is a commitment. */
export const SUMMON_HOLD_SECONDS = 1.5;
/** The clock phases that will take a summons. The Office does not sort at dusk. */
export const SUMMON_PHASES: ReadonlySet<string> = new Set(['night', 'deepNight']);
/** The one zone with a post office in it. */
export const POSTMASTER_ZONE = 3;

// --- the line -------------------------------------------------------------------------

/** m — L at the hook-set. Longer than the hand-line: it is delivery twine. */
export const LINE_LENGTH = 16;
/** m — the L floor on his end. Inside gaff REACH (1.6 m): he reels you to arm's length. */
export const BOSS_RADIUS = 1.2;
/** His mass against the keeper's 1.0 — the correction lands on you, not on him. */
export const BOSS_MASS = 9;
/** m/s — how fast he takes line in during a delivery (`fight.reelRate`). */
export const BOSS_REEL_RATE = 2.8;
/** m/s — line paid back out between deliveries, up to LINE_LENGTH. */
export const PAYOUT_RATE = 3.4;
/** The lineId every event of his carries. It is not your line. */
export const POSTMASTER_LINE_ID = 'delivery-twine';

// --- the delivery loop ------------------------------------------------------------------

export const ARRIVE_SECONDS = 1.6; // s of him surfacing before the twine goes on
/** plan/task: the card is up 1.2 s BEFORE the route-drag. */
export const TELEGRAPH_SECONDS = 1.2;
export const DRAG_SECONDS = 2.6; // s of reeling per delivery
export const STATION_SECONDS = 2.2; // s between deliveries (he repositions)
export const SINK_SECONDS = 2.6; // s he takes to go down after the cut

export const BOSS_SWIM = 6.5; // m/s — how fast he walks the line to a station
/** m — how far past the roof rim a hazard station stands. The route ends in water. */
export const EDGE_OVERSHOOT = 5;
/** m — how far off the roof centre he holds between deliveries. */
export const HOLD_RADIUS = 9;

// --- the gaff / the cut ------------------------------------------------------------------
//
// THE VICTORY TUNING (the task offered two and asked for a documented choice):
// NOT a bare proximity-E. A bare proximity press would be won by standing
// still — and he reels you into reach himself, so "get close" is the one thing
// the fight already does FOR you. Instead the E window is EARNED: two gaff hits
// (a heavy is worth both) knock his grip off the twine, and the cut is live only
// while he is staggered. The gaff has a 1.6 m reach, so landing two of them is
// exactly "approach under fire" — and the approach is his own reeling, which is
// the joke the plan wants: his delivery is your delivery.

export const GAFF_POOL = 2; // light = 1, heavy = 2 — "2 gaffs stagger him"
export const GAFF_COST_LIGHT = 1;
export const GAFF_COST_HEAVY = 2;
export const STAGGER_SECONDS = 3.5; // s the cut window stays open
export const CUT_HOLD_SECONDS = 0.6; // s of hold-E in reach
export const CUT_REACH = 2.4; // m — arm's length plus the gaff head

/** hit-event targetId for the Postmaster (game/combat.ts owns the id space). */
export const POSTMASTER_TARGET_ID = 9;
/** m — the body radius the gaff arc tests against. He is a big damp man. */
export const POSTMASTER_HIT_RADIUS = 0.9;

/** Tension at which his twine comes up hard and he asks you to initial it. */
export const WHIP_TENSION = 92;
/** s between courtesy lines, so the comedy is punctuation and not a stream. */
export const COURTESY_COOLDOWN = 4;
/** brace dot above which "you are setting your feet" reads as a brace check. */
export const BRACE_DOT = 0.5;

export interface PostmasterState {
  phase: PostmasterPhase;
  /** The reverse fight he owns, or -1. */
  fightId: number;
  /** The roof the arena is, or -1. */
  roofId: number;
  x: number;
  z: number;
  facing: number; // radians, world convention (0 = +Z)
  speed: number; // m/s this tick — render reads it
  /** The rig the render side builds his body from (null while idle). */
  params: import('../gen/fishParams').FishParams | null;

  /** s left in the current phase. */
  timer: number;
  /** The bearing out of the roof centre this delivery is routed along (rad). */
  angle: number;
  /** s of the summon hold banked at the letterbox. */
  summonHeld: number;
  /** Route-drags begun this fight (the rotation index). */
  drags: number;
  /** Seeded start of the canonical rotation — the deterministic pick. */
  rotationStart: number;
  /** The verb whose card is up right now (null = no bubble). */
  card: PostmasterVerb | null;
  /** s the card stays on screen. */
  cardTimer: number;
  /** The station he is pulling you toward this delivery. */
  routeX: number;
  routeZ: number;
  /** True while the constraint should let him take line (`fight.aiReel`). */
  reeling: boolean;

  /** Gaff pool left before the stagger; GAFF_POOL at fight start and after each recovery. */
  gaffHp: number;
  /** Swings landed on him this fight. */
  gaffHits: number;
  /** s of hold-E banked on the cut. */
  cutHeld: number;
  /** s until another courtesy line may fire. */
  courtesyCooldown: number;
  /** The line cut — the victory latch (kept after `phase` moves to 'gone'). */
  cut: boolean;
  /** He delivered you — the loss latch. */
  delivered: boolean;
  /** Summoned at least once this run (one Postmaster per run). */
  summoned: boolean;
  /** water.active last tick — the edge the STAGE_TRANSITION courtesy fires on. */
  wasUnder: boolean;
}

export function createPostmasterState(): PostmasterState {
  return {
    phase: 'idle',
    fightId: -1,
    roofId: -1,
    x: 0,
    z: 0,
    facing: 0,
    speed: 0,
    params: null,
    timer: 0,
    angle: 0,
    summonHeld: 0,
    drags: 0,
    rotationStart: 0,
    card: null,
    cardTimer: 0,
    routeX: 0,
    routeZ: 0,
    reeling: false,
    gaffHp: GAFF_POOL,
    gaffHits: 0,
    cutHeld: 0,
    courtesyCooldown: 0,
    cut: false,
    delivered: false,
    summoned: false,
    wasUnder: false,
  };
}

/** Live in the water — anything but idle and gone. */
export function postmasterActive(s: PostmasterState): boolean {
  return s.phase !== 'idle' && s.phase !== 'gone';
}

/** He owns a line right now (the phases that hold a live TetherFight). */
export function postmasterFighting(s: PostmasterState): boolean {
  return (
    s.phase === 'arrive' ||
    s.phase === 'station' ||
    s.phase === 'telegraph' ||
    s.phase === 'drag' ||
    s.phase === 'staggered'
  );
}

/** The cut is armed: he is staggered and the window has not lapsed. */
export function cutArmed(s: PostmasterState): boolean {
  return s.phase === 'staggered';
}

/** 0..1 of the cut hold — the ring the prompt draws. */
export function cutProgress(s: PostmasterState): number {
  return Math.min(1, s.cutHeld / CUT_HOLD_SECONDS);
}

/** 0..1 of the summon hold. */
export function summonProgress(s: PostmasterState): number {
  return Math.min(1, s.summonHeld / SUMMON_HOLD_SECONDS);
}

// --- the summon gate --------------------------------------------------------------------
//
// All of it in one pure predicate, so the gate is testable without a world and
// impossible to half-apply:
//   • ZONE — the Township only;
//   • PHASE — night or deeper;
//   • ARENA — on foot, standing on the post office roof, at its letterbox;
//   • HANDS FREE — not already in a tether fight, not already submerged;
//   • ONCE — one Postmaster per run.

export interface PostmasterGateInput {
  zone: number;
  phase: string;
  onFoot: boolean;
  atMarker: boolean;
  fightLive: boolean;
  submerged: boolean;
  summoned: boolean;
}

export function postmasterSummonEligible(g: PostmasterGateInput): boolean {
  if (g.summoned) return false;
  if (g.zone !== POSTMASTER_ZONE) return false;
  if (!SUMMON_PHASES.has(g.phase)) return false;
  if (!g.onFoot || g.submerged) return false;
  if (g.fightLive) return false;
  return g.atMarker;
}

// --- determinism ---------------------------------------------------------------------------
//
// His own PCG32 point in seed space, keyed by (run seed, roof id, delivery
// index) exactly the way initTetherFishAI keys a catch's FSM and snatcherRng
// keys the second mouth — so the same seed, summoned at the same roof, delivers
// the same route in the same order (spec 8.3).

export const POSTMASTER_SALT = 0x504f5354; // 'POST'

export function postmasterRng(seed: number, roofId: number, index: number): Rng {
  return new Rng(
    ((seed * 2654435761) ^ ((roofId + 1) * 2246822519) ^ ((index + 1) * 0x9e3779b1) ^
      POSTMASTER_SALT) >>>
      0,
  );
}

/** Where the canonical rotation starts. The one seeded choice in the copy path. */
export function rollRotationStart(rng: Rng): number {
  return rng.int(0, 2);
}

/** The bearing (rad) the next delivery routes you out over. */
export function rollRouteBearing(rng: Rng): number {
  return rng.nextFloat() * Math.PI * 2;
}

// --- the route --------------------------------------------------------------------------------
//
// "the drag ROUTES aim at the roof edge — going over = water phase entry". A
// route station is a point on the bearing `angle` out of the roof centre, past
// the rim by EDGE_OVERSHOOT. Reeling toward it hauls the keeper across the rim.
//
// The rim distance is found by marching the ray out of the hull rather than by
// a bespoke ray/polygon intersection: the hull is a convex 8-gon a few metres
// across, the march is 40 fixed steps of a fixed size, and it is exact to
// RIM_STEP — which is a centimetre-scale error on a target that is five metres
// past the edge. Pure, allocation-free, and deterministic.

const RIM_STEP = 0.25; // m
const RIM_MAX_STEPS = 60; // 15 m of roof is more roof than the generator makes

/** How far the rim is from `centre` along `angle`, for a convex hull. */
export function rimDistance(
  hull: readonly Vec2[],
  centre: Vec2,
  angle: number,
  inside: (p: Vec2) => boolean,
): number {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let d = 0;
  for (let i = 0; i < RIM_MAX_STEPS; i++) {
    const next = d + RIM_STEP;
    if (!inside({ x: centre.x + dx * next, z: centre.z + dz * next })) return next;
    d = next;
  }
  void hull;
  return d;
}

/**
 * The station a route-drag pulls you toward: past the rim, in the water, on the
 * chosen bearing. The keeper's path to it crosses the roof edge — which is the
 * whole hazard.
 */
export function routeStation(
  hull: readonly Vec2[],
  centre: Vec2,
  angle: number,
  inside: (p: Vec2) => boolean,
): Vec2 {
  const rim = rimDistance(hull, centre, angle, inside);
  const out = rim + EDGE_OVERSHOOT;
  return { x: centre.x + Math.cos(angle) * out, z: centre.z + Math.sin(angle) * out };
}

/** Where he holds between deliveries: off the roof, on the same bearing. */
export function holdStation(centre: Vec2, angle: number): Vec2 {
  return { x: centre.x + Math.cos(angle) * HOLD_RADIUS, z: centre.z + Math.sin(angle) * HOLD_RADIUS };
}

// --- the gaff ---------------------------------------------------------------------------------

/** How much grip ONE swing takes off. Heavy swings stagger; lights do not. */
export function postmasterGaffCost(stagger: number): number {
  return stagger > 0 ? GAFF_COST_HEAVY : GAFF_COST_LIGHT;
}

// --- movement helper (shared with the driver) --------------------------------------------------

/** One step of swimming toward a point, capped at `speed`. Pure. */
export function swimToward(
  from: Vec2,
  to: Vec2,
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
