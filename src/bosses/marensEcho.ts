// MAREN'S ECHO (bosses) — the Choir's boss and the tonal pivot of the game,
// plan 05 §2.3:
//
//   "Design: not her; the town's memory of her, wearing the flood. REFUSES TO
//    LUNGE. The fight is you deciding to reel.
//    Sketch: the boss has NO HOSTILE VERBS — no lunge, no drag, no attack state.
//    It holds at max line length, swaying gently, mirrored by your own
//    silhouette. Reeling shortens the line; TENSION RISES WITH PROXIMITY and
//    DRAINS YOUR STAMINA DIRECTLY (it mirrors your exhaustion). If tension hits
//    100 → snap (the catch 'goes home'). There is no damage; the pressure is
//    entirely the decision and the drain. Full reel → LAND → guaranteed clean
//    catch, the truth scene … The 'fight' runs ZERO HOSTILE-AI CODE — it's a
//    state machine of hold / sway / mirror plus the reel-advance loop."
//
// This module is the pure state + rules half, in the shape bosses/postmaster.ts
// and enemies/whistler.ts established: no WorldState, no systems, no `three`, no
// DOM, no Math.random, no Date. `systems/marensEcho.ts` drives it.
//
// ── WHY THERE IS SO LITTLE HERE (and that is the deliverable) ────────────────
//
// The Postmaster is 445 lines of telegraph rotations, route stations, gaff
// pools and stagger windows. She is a hold, a sway, and a curve. Every verb the
// other three encounters own is ABSENT — not disabled behind a flag, not
// weighted to zero in a table it could be re-weighted out of: absent. There is
// no lunge function to call, no drag timer to expire, no target id for the gaff
// to find, no hp anywhere that any code path can write. The no-combat check the
// plan asks for is not a test we pass; it is a test we could not fail without
// adding code that does not exist.
//
// ── THE THREE DECISIONS THIS ROUND OWES ──────────────────────────────────────
//
// 1. TENSION COMES FROM PROXIMITY, AND THE CONSTRAINT IS TOLD SO ONCE.
//    `TetherFight.tensionSource = 'proximity'` (game/tether.ts) makes the
//    constraint skip its own two tension writes — the taut `+= excess·kTension`
//    and the slack `-= slackDecay` — and nothing else. The clamp, the ceiling
//    and the SNAP stay exactly where they were, so her line parts through the
//    same machinery every other line in the game parts through; only the number
//    feeding it is ours. That is ONE gated branch in the constraint, which is
//    the budget the task set, and the alternative (writing `fight.tension` from
//    her system and letting the constraint keep adding to it) would have meant
//    two systems owning one number and a fight whose tension depended on frame
//    order. See `echoTensionFraction`.
//
// 2. THE CURVE ENDS WHERE THE LINE ENDS. Tension is 0 at the length she holds
//    at and exactly the line's ceiling at the L FLOOR — the closest the
//    constraint will ever let the two ends get. The LAND window opens a couple
//    of metres before that. So the whole fight is one continuous decision with a
//    visible cost: reel until she is close enough to take, and TAKE HER; keep
//    reeling past that and the line goes at the floor and she goes home. The
//    only way to lose her is to want her too much, which is the game.
//
// 3. SHE IS NOT `world.fish`. Same reasoning as the Postmaster and the
//    Whistler, and here it is load-bearing rather than tidy: the catch slot
//    carries an hp pool, a butcher check that ends the fight when that pool
//    reaches zero, and a gaff target id. Putting her in it would hand a
//    NO-COMBAT boss a health bar and a way to be killed. She is her own state,
//    reached through the constraint's one position seam (MARENS_ECHO_ENTITY),
//    and a gaff swung at her passes through empty water because there is
//    nothing in the combat system's target space to hit.

import type { Vec2 } from '../core/poly';
import { CHOIR_ZONE } from '../core/zones';

// --- events (plan 05 §0.2 shape) ---------------------------------------------
// The same plain-data town-queue rows the Congregation's stings, the Snatcher's
// moments, the Postmaster's telegraphs and the Whistler's bands ride, so the
// audio worker binds her without importing a line of this logic.

export interface EchoSummonedEvent {
  type: 'echo.summoned';
  zone: number;
  fightId: number;
  at: Vec2;
}

export interface EchoSwayEvent {
  type: 'echo.sway';
  zone: number;
  fightId: number;
  index: number; // which sway line — the copy is content/choirLines.ts's
}

export interface EchoLandedEvent {
  type: 'echo.landed';
  zone: number;
  fightId: number;
  willing: boolean; // taken with the thimble — the worse bestiary entry
  reeledSeconds: number;
}

export interface EchoGoneHomeEvent {
  type: 'echo.goneHome';
  zone: number;
  fightId: number;
  cause: 'snap' | 'cut';
}

// --- the zone / the marker ----------------------------------------------------
//
// "Summon: a marker in zone 4 (the deepest point / a fixed salted location among
//  the choir motes)".
//
// THE DEEPEST POINT, resolved as the point of the lake furthest from every islet
// — the middle of the widest water there is. It is a pure function of the islet
// field, so it is the same point for the same seed without storing anything, and
// it needs no new generator pass. `__toVoid` (the M8 round-1 gate seam) already
// searched for this exact point to frame the void screenshot, which is a decent
// sign it is the right place to put the only thing in zone 4 worth rowing to.

export const MARENS_ECHO_ZONE = CHOIR_ZONE;

/** m — the marker's read radius. Wider than the letterbox: this one is found by boat. */
export const SUMMON_RANGE = 7;
/** s — the contextual hold. The Postmaster's 1.5 s: a commitment, not a tap. */
export const SUMMON_HOLD_SECONDS = 1.5;

/** m — the grid pitch the deepest-point search walks. */
export const MARKER_STEP = 11;
/** m — how far out the search looks (the lake is ~220 m across). */
export const MARKER_HALF = 99;

export interface Landmark {
  x: number;
  z: number;
}

/** Distance to the nearest landmark, or Infinity when there is no land at all. */
export function nearestLandmark(x: number, z: number, land: readonly Landmark[]): number {
  let best = Infinity;
  for (const l of land) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < best) best = d;
  }
  return best;
}

/**
 * THE MARKER — the deepest water in the lake, found by a fixed grid walk. Ties
 * resolve to the first point in scan order, so it is deterministic without an
 * RNG at all: the same islets always give the same node.
 */
export function echoMarker(land: readonly Landmark[]): Vec2 {
  let best = { x: 0, z: 0 };
  let bestClear = -Infinity;
  for (let x = -MARKER_HALF; x <= MARKER_HALF; x += MARKER_STEP) {
    for (let z = -MARKER_HALF; z <= MARKER_HALF; z += MARKER_STEP) {
      const clear = nearestLandmark(x, z, land);
      if (clear > bestClear) {
        bestClear = clear;
        best = { x, z };
      }
    }
  }
  return best;
}

// --- the line -----------------------------------------------------------------

/** m — L at the hook-set. She is a long way out, and she stays there. */
export const HOLD_LENGTH = 18;
/** m — her end's hook radius (the L floor she contributes). */
export const ECHO_RADIUS = 0.9;
/** Her mass against the keeper's 1.0. Light: nothing about her resists. */
export const ECHO_MASS = 3.2;
/**
 * m/s — the reel rate for HER fight only (the per-fight `reelRate` override the
 * boat winch and the Postmaster's twine already use). Slower than the
 * hand-line's 2.5, because forty fathoms of memory should not come up in six
 * seconds — but not so slow that the pull/rest rhythm below becomes a grind: at
 * 1.5 the fifteen metres between her and the gunwale are ten seconds of REELING,
 * which the stamina pool pays for in two or three pulls with a rest between them.
 * That rhythm IS the fight: pull until your hands give out, stand in the dark
 * with her waiting, decide to pull again.
 */
export const ECHO_REEL_RATE = 1.5;
/** The lineId her events carry. It IS your line — you are the one who hooked her. */
export const ECHO_LINE_ID = 'keeper-line';

/** s — she surfaces into the lantern's reach before the line goes on. */
export const ARRIVE_SECONDS = 2.2;

// --- the sway -----------------------------------------------------------------
//
// "It holds at max line length, SWAYING GENTLY, MIRRORED BY YOUR OWN
//  SILHOUETTE."
//
// The sway is a bounded oscillation of her BEARING around the keeper, not a
// walk: she never closes and never retreats, she simply drifts across the line
// like something hanging in a slow current. It is a function of elapsed time (a
// phase, not an integration), so it is frame-rate independent and a probe
// sampling it at t = 30 s gets the canonical answer.
//
// THE MIRROR is the phase: her sway runs a half-cycle out of step with the
// keeper's own idle sway, so the two silhouettes lean apart and together on the
// same beat. The render side reads `swayPhase` and negates it (see
// render/marensEcho.ts for why the mirror is bought in the sim and not off the
// keeper's animation clip).

/** rad/s — the sway's angular rate. Slow: the pulse of a basin, not a tide. */
export const SWAY_RATE = 0.34;
/** rad — how far across the line she drifts. Small; she is holding, not pacing. */
export const SWAY_ARC = 0.21;

/** Her bearing offset from the base bearing at a given phase. Pure. */
export function swayOffset(phase: number): number {
  return Math.sin(phase) * SWAY_ARC;
}

/** s of HOLDING (not reeling) between sway lines. */
export const SWAY_LINE_SECONDS = 7;

// --- the proximity curve (decision 1 + 2 above) -------------------------------

/**
 * m — how far above the L floor the LAND window opens. Two seconds of reeling
 * wide: long enough to be a decision, short enough to be one you have to make.
 */
export const LAND_MARGIN = 3;

/**
 * TENSION, AS A FRACTION OF THE LINE'S CEILING, FROM DISTANCE ALONE.
 *
 * 0 at the length she holds at, 1 at `floor` — the closest the constraint will
 * let the two ends get (`max(radiusA, radiusB)`, which is the hull's 3 m aboard
 * and her own 0.9 m on foot). Expressing it as a FRACTION rather than a number
 * of tension points is the one thing that makes it survive gear: a line with a
 * ceiling of 110 would otherwise never part at 100, and her whole fight would
 * quietly lose its only failure state to a tackle upgrade.
 *
 * The curve is linear on purpose. Every other pressure in this game is a
 * timer, a telegraph or a die roll; hers is a ruler. The player should be able
 * to look at the tension gauge and read, exactly, how much line is left before
 * the thing they want is gone.
 */
export function echoTensionFraction(distance: number, floor: number): number {
  const span = HOLD_LENGTH - floor;
  if (span <= 1e-6) return 1;
  const t = (HOLD_LENGTH - distance) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The LAND window: she is close enough to take. Opens before the curve tops out. */
export function landEligibleAt(distance: number, floor: number): boolean {
  return distance <= floor + LAND_MARGIN;
}

/** The tension fraction at which the LAND window opens — the readable number. */
export function landWindowFraction(floor: number): number {
  return echoTensionFraction(floor + LAND_MARGIN, floor);
}

// --- the mirror drain ---------------------------------------------------------
//
// "tension … DRAINS YOUR STAMINA DIRECTLY (it mirrors your exhaustion)".
//
// The constraint already takes the ordinary 10/s reel-stance drain, because her
// fight is an ordinary player-stance reel. THIS is the extra: a drain
// proportional to the tension the proximity curve is reporting, paid only while
// the keeper is actually reeling ("stamina drain proportional to reel
// activity"). Hold the line and it costs you nothing at all — she will wait.
// Pull, and the closer she gets the more it costs, until the pool is empty, the
// reel gates itself off and you are standing in the dark deciding whether to
// start again. Nothing here can reach hp.

/** stamina/s at full tension, ON TOP of the constraint's 10/s reel drain. */
export const MIRROR_DRAIN_MAX = 12;

/** The mirror drain this tick, from the tension fraction. Pure. */
export function mirrorDrain(tensionFraction: number): number {
  const t = tensionFraction < 0 ? 0 : tensionFraction > 1 ? 1 : tensionFraction;
  return MIRROR_DRAIN_MAX * t;
}

// --- the choir dims -----------------------------------------------------------
//
// "the choir motes dim slightly while she holds — a choirDim seam". The void's
// forty voices drop back while she is on the line: not out, just quieter, the
// way a room goes when someone who matters walks into it. One multiplier, read
// by render/choir.ts; exactly 1 whenever she is not in the water, so zones 1-3
// and a Choir without her are byte-identical.

export const CHOIR_DIM_WHILE_HELD = 0.55;

// --- the truth scene ----------------------------------------------------------
//
// The sim owns the CLOCK and the BEAT INDEX; ui/truthScene.ts owns the pixels
// and content/choirLines.ts owns the words. Same split as the Congregation's
// invoice, for the same reason: the beat a driver reads out must not depend on
// how the frames batched.

export interface TruthSceneState {
  /** The cards are up. */
  active: boolean;
  /** Which beat is showing, 0-based. */
  beat: number;
  /** All three beats have been read (the scene has closed). */
  done: boolean;
  /** E-edge tracker, so a held key does not skip the whole scene. */
  advancePrev: boolean;
}

export function createTruthSceneState(): TruthSceneState {
  return { active: false, beat: 0, done: false, advancePrev: false };
}

// --- the fight's shape --------------------------------------------------------
//
// idle    — not summoned (every world outside the deepest point in zone 4)
// arrive  — she is there; the line goes on
// hold    — THE FIGHT. She holds at L, swaying, mirroring. Reeling shortens L.
//           There is no second fight phase, because there is no second thing she
//           does. Sway and mirror are what `hold` does every tick, not states it
//           can leave: a state machine whose only exit is the player's own verb
//           is the entire design of the encounter, written down.
// landing — she is landed; the truth scene is reading out
// gone    — the encounter is over (told, snapped, or cut)
export type EchoPhase = 'idle' | 'arrive' | 'hold' | 'landing' | 'gone';

export interface MarensEchoState {
  phase: EchoPhase;
  /** The fight she is the far end of, or -1. */
  fightId: number;
  x: number;
  z: number;
  /** radians, world convention (0 = +Z). She faces AWAY (choir.md §5.6). */
  facing: number;
  /** The rig the render side builds her body from (null while idle). */
  params: import('../gen/fishParams').FishParams | null;

  /** s left in the current phase (only `arrive` uses one). */
  timer: number;
  /** The bearing off the keeper she hangs on, before the sway. */
  bearing: number;
  /** The sway's phase, advanced by the sim. The render mirrors it. */
  swayPhase: number;
  /** s of the summon hold banked at the marker. */
  summonHeld: number;
  /** The marker she was summoned at (the render draws a node there). */
  marker: Vec2;

  /** The L floor of her fight — the closest the two ends can be. */
  floor: number;
  /** m — the live separation, the number the whole fight is made of. */
  distance: number;
  /** 0..1 — the proximity curve's current value (the constraint gets ×ceiling). */
  tensionFraction: number;
  /** s the keeper has actually spent reeling. Only ever counts up. */
  reeledSeconds: number;
  /** s of holding-without-reeling banked toward the next sway line. */
  holdSeconds: number;
  /** Sway lines shown this fight — the index into the bible's rotation. */
  swayIndex: number;

  /**
   * HER HP. Nothing in the game writes this. It exists so the no-combat
   * invariant has something to watch: a test can assert it never moved, which is
   * a stronger statement than "she has no health bar" because it is checkable.
   */
  hp: number;

  /** She was landed — the truth latch (kept after `phase` moves on). */
  landed: boolean;
  /** Taken with Maren's Thimble: the worse bestiary entry. */
  willing: boolean;
  /** She went home — the snap latch. */
  goneHome: boolean;
  /** Summoned at least once this run (one Echo per run). */
  summoned: boolean;

  truth: TruthSceneState;
}

export function createMarensEchoState(): MarensEchoState {
  return {
    phase: 'idle',
    fightId: -1,
    x: 0,
    z: 0,
    facing: 0,
    params: null,
    timer: 0,
    bearing: 0,
    swayPhase: 0,
    summonHeld: 0,
    marker: { x: 0, z: 0 },
    floor: ECHO_RADIUS,
    distance: HOLD_LENGTH,
    tensionFraction: 0,
    reeledSeconds: 0,
    holdSeconds: 0,
    swayIndex: 0,
    hp: 100,
    landed: false,
    willing: false,
    goneHome: false,
    summoned: false,
    truth: createTruthSceneState(),
  };
}

/** Live in the water — anything but idle and gone. */
export function echoActive(s: MarensEchoState): boolean {
  return s.phase !== 'idle' && s.phase !== 'gone';
}

/** She is on a line right now (the phases that hold a live TetherFight). */
export function echoFighting(s: MarensEchoState): boolean {
  return s.phase === 'arrive' || s.phase === 'hold';
}

/** The choir's dim multiplier while she holds. 1 whenever she does not. */
export function choirDim(s: MarensEchoState): number {
  return echoFighting(s) ? CHOIR_DIM_WHILE_HELD : 1;
}

/** 0..1 of the summon hold — the ring the marker prompt draws. */
export function summonProgress(s: MarensEchoState): number {
  return Math.min(1, s.summonHeld / SUMMON_HOLD_SECONDS);
}

// --- the summon gate ----------------------------------------------------------
//
// One pure predicate, so the gate is testable without a world and impossible to
// half-apply:
//   • ZONE — the Choir only;
//   • ARENA — at the marker in the deepest water;
//   • HANDS FREE — no live tether fight, no catch on the hook, not submerged;
//   • ONCE — one Echo per run.
//
// There is deliberately NO clock gate. The Postmaster will not sort at dusk and
// the Whistler only comes at deep night; she has been standing there for thirty
// years and the hour is not the thing that has been stopping you.

export interface EchoGateInput {
  zone: number;
  atMarker: boolean;
  fightLive: boolean;
  hasCatch: boolean;
  submerged: boolean;
  summoned: boolean;
}

export function echoSummonEligible(g: EchoGateInput): boolean {
  if (g.summoned) return false;
  if (g.zone !== MARENS_ECHO_ZONE) return false;
  if (g.fightLive || g.hasCatch) return false;
  if (g.submerged) return false;
  return g.atMarker;
}

// --- the willing variant ------------------------------------------------------
//
// bestiary/bestiary.ts has carried a `willing` flag since M4 ("the Maren's
// Thimble variant — a distinct, worse record, wired with the thimble in a later
// round; the flag exists from day one"), and until now NOTHING in the game could
// set it: there is no equipped-gimmick resolution yet, so the thimble is a name
// in a loot pool. This round wires the half that is ours — the event kind, the
// fold, the record's `entryWilling` text and the screen that shows it — and
// leaves ONE predicate as the seam the thimble round will make reachable.
//
// It matches the gimmick key, the pool's display name and the plain id, because
// which of those `world.lure.id` will eventually carry is the thimble round's
// decision, not ours.

export const THIMBLE_KEY = 'marens_thimble';

export function isMarensThimble(lureId: string | null | undefined): boolean {
  if (!lureId) return false;
  const id = lureId.trim().toLowerCase();
  return id === THIMBLE_KEY || id === 'marens-thimble' || id === "maren's thimble";
}

// --- movement helper ----------------------------------------------------------

/** Where she hangs: `L` metres off the keeper, on the swayed bearing. Pure. */
export function holdPoint(keeper: Vec2, bearing: number, L: number): Vec2 {
  return { x: keeper.x + Math.sin(bearing) * L, z: keeper.z + Math.cos(bearing) * L };
}
