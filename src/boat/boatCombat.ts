// BOAT COMBAT (boat) — plan 03 §6 / spec §3.3, M3 round 3. The night fight:
// a Dragger surfaces near the boat, hooks THE BOAT (the M2 tether at
// `anchor: 'boat'`), and the keeper fights it with the same reel/brace verbs at
// boat scale — winch post to reel, cleat to cut, hull HP between you and the
// water.
//
// This module is the pure state + rules half (no systems, no world mutation
// beyond the helpers that take the state they own). `systems/boatCombat.ts`
// drives it: spawn cadence, hooking, event consumption, swamping.
//
// The tether is REUSED, not reimplemented (plan §0 "contract to t2"): the
// constraint already resolves an `{ kind: 'boat' }` anchor against
// `world.boat.x/z`, already gates the winch reel on `boat.atWinchPost`, and
// already prices the cut at a hull segment when `boat.atCleat`. Everything here
// hangs off the same `landed/cut/snapped/drag` event stream a player fight
// fires.
//
// Pure logic: no `three` imports, no Math.random, no Date.

import type { Vec2 } from '../core/poly';

// --- hull / winch / upgrades (plan §6.1-§6.2) ---------------------------------

export interface HullState {
  hp: number;
  maxHp: number;
  segments: number; // visual + mechanical; a cleat cut spends one
  maxSegments: number;
}

// plan §6.2 — the Chandlery hooks. Boat combat only READS these; purchase is M5.
export interface BoatUpgrades {
  hullPlating: number; // +HULL_PLATING_HP maxHp per level
  winchGearing: number; // +WINCH_GEARING_RATE reel rate per level
  bowLantern: number; // night-vision radius multiplier (render reads it)
  bellKeel: boolean; // once per night: every Dragger in range disengages
}

export interface DraggerInstance {
  species: string;
  tetherId: number; // the tether fight at anchor 'boat'
  yawTarget: Vec2 | null; // the hazard it is dragging the boat toward
  spawnedAt: number; // world.time.elapsed at the hook (telemetry / log)
}

export interface BoatCombatState {
  active: boolean;
  dragger: DraggerInstance | null;
  hull: HullState;
  winch: { rate: number };
  tilt: number; // deck tilt from tension — render + a small camera offset
  cleatCutReady: boolean; // at the cleat and a hull segment left to spend
  bellKeel: { uses: number; maxUses: number };
  upgrades: BoatUpgrades;
  spawnTimer: number; // s until the next Dragger spawn attempt
  spawns: number; // Draggers hooked this run — salts the spawn stream
  swamped: boolean; // hull 0 — the boat is gone for this run
  landed: number; // Draggers landed this run (RunResult.draggersLand)
  teeth: number; // Dragger Teeth — the crafting mat M5 consumes
  impactSpeed: number; // |speed| at the last obstacle thud (movement writes it)
}

// --- tuning ---------------------------------------------------------------------

export const HULL_MAX_HP = 100;
export const HULL_SEGMENTS = 4; // the hull is 4 segments of 25 hp
export const HULL_MAX_SEGMENTS = 6; // repairs cap here (2 landings from stock)
export const WINCH_BASE_RATE = 1.6; // m/s of line at the post (boat-scale reel)
export const WINCH_GEARING_RATE = 0.4; // +rate per Chandlery gearing level
export const HULL_PLATING_HP = 2 * HULL_SEGMENTS; // "+2 maxHp / segment per level"

// Boat-scale tether geometry. The line starts long (the Dragger surfaces well
// off the bow) and the boat endpoint is heavy and wide.
export const DRAGGER_LINE_LENGTH = 22; // m at the hook
export const DRAGGER_SPAWN_DIST = 18; // m — where it surfaces off the boat
export const BOAT_ENDPOINT_MASS = 6; // matches tether.ts BOAT_MASS_DEFAULT
export const BOAT_ENDPOINT_RADIUS = 3;

// Hull damage. The plan states the swamp condition and the cleat-cut price but
// does NOT quantify what wears the hull down; these three rules are this round's
// reading of §6.1 (documented as an interpretation, not a quote):
//   1. a LUNGE on a boat-anchored line is the Dragger hitting the end of the
//      line and taking a bite of boat. This is the load-bearing rule: it is what
//      makes an IGNORED fight sink you (~6-7 lunges of a Dragger's stamina pool
//      is the whole hull), and it stops the moment the animal is exhausted — so
//      exhausting it, the tether's own win condition, is also how you save the
//      boat;
//   2. a real drag (the M2 threshold: >1.5 m of hull displacement inside a 0.1 s
//      window) costs hull per metre stolen;
//   3. being yawed into a hazard hurts — "Dragger lunges yaw the boat toward
//      hazards (rocks, wrecks, other disturbances)".
// The winch multiplier is the plan's own line: "Dragger drags are *stronger*
// when you're reeling (it's the bait)".
export const HULL_DAMAGE_PER_LUNGE = 16; // hp per lunge landed on the hull
export const HULL_DAMAGE_PER_DRAG_M = 3.2; // hp per metre of boat displacement
export const HULL_DAMAGE_PER_IMPACT = 6; // hp per m/s of speed into a hazard
export const WINCH_DRAG_MULT = 1.5; // hits land 1.5× while you are at the post

// Deck tilt from tension (pure feel; render reads it).
export const TILT_PER_TENSION = 0.006; // rad per tension point
export const TILT_DECAY = 4; // rad/s toward the tension target

// Swamping (plan §6.1): the EXTENDED water phase.
export const SWAMP_BREATH_SEC = 25;
export const SWAMP_OCCUPIED_TIER = 3; // dread tier ≥ 3 → occupied water

// Landing rewards (plan §6.1).
export const DRAGGER_REPAIR_SEGMENTS = 2;
export const DRAGGER_TEETH_PER_LAND = 1;

export function createBoatUpgrades(): BoatUpgrades {
  return { hullPlating: 0, winchGearing: 0, bowLantern: 0, bellKeel: false };
}

export function hullMaxHpFor(upgrades: BoatUpgrades): number {
  return HULL_MAX_HP + upgrades.hullPlating * HULL_PLATING_HP;
}

export function winchRateFor(upgrades: BoatUpgrades): number {
  return WINCH_BASE_RATE + upgrades.winchGearing * WINCH_GEARING_RATE;
}

export function createBoatCombat(upgrades: BoatUpgrades = createBoatUpgrades()): BoatCombatState {
  const maxHp = hullMaxHpFor(upgrades);
  return {
    active: false,
    dragger: null,
    hull: { hp: maxHp, maxHp, segments: HULL_SEGMENTS, maxSegments: HULL_MAX_SEGMENTS },
    winch: { rate: winchRateFor(upgrades) },
    tilt: 0,
    cleatCutReady: false,
    bellKeel: { uses: 0, maxUses: upgrades.bellKeel ? 1 : 0 },
    upgrades,
    spawnTimer: 0,
    spawns: 0,
    swamped: false,
    landed: 0,
    teeth: 0,
    impactSpeed: 0,
  };
}

// --- hull rules -------------------------------------------------------------------

// Damage the hull; segments track hp so the visual break-up matches the number.
// Returns the hp actually removed (0 once swamped).
export function damageHull(state: BoatCombatState, amount: number): number {
  if (amount <= 0 || state.swamped) return 0;
  const before = state.hull.hp;
  state.hull.hp = Math.max(0, state.hull.hp - amount);
  syncSegments(state);
  return before - state.hull.hp;
}

// segments = ceil(hp / hp-per-segment), never below 0 — a purely derived readout
// EXCEPT after a cleat cut, which spends a segment outright (see cleatCut).
function syncSegments(state: BoatCombatState): void {
  const per = state.hull.maxHp / Math.max(1, state.hull.maxSegments);
  const derived = Math.ceil(state.hull.hp / per);
  state.hull.segments = Math.max(0, Math.min(state.hull.segments, derived));
}

// plan §6.1: "hold F at the cleat → tether cut. Instead of losing the lure, lose
// a hull segment (`segments--`, `hp -= maxHp/segments`). Dragger takes a bite of
// boat on the way out." Applied exactly, in that order. Never touches the lure.
export function cleatCut(state: BoatCombatState): number {
  state.hull.segments = Math.max(0, state.hull.segments - 1);
  const price = state.hull.maxHp / Math.max(1, state.hull.segments);
  const before = state.hull.hp;
  state.hull.hp = Math.max(0, state.hull.hp - price);
  return before - state.hull.hp;
}

// plan §6.1: landing a Dragger yields hull repair materials (`+2 segments`).
export function repairHull(state: BoatCombatState, segments = DRAGGER_REPAIR_SEGMENTS): void {
  const per = state.hull.maxHp / Math.max(1, state.hull.maxSegments);
  state.hull.segments = Math.min(state.hull.maxSegments, state.hull.segments + segments);
  state.hull.hp = Math.min(state.hull.maxHp, state.hull.hp + segments * per);
}

export function hullSwamped(state: BoatCombatState): boolean {
  return state.hull.hp <= 0;
}

// Deck tilt: tension yaws the deck. Pure feel — eased toward the tension target.
export function stepTilt(state: BoatCombatState, tension: number, dt: number): void {
  const target = tension * TILT_PER_TENSION;
  const k = Math.min(1, TILT_DECAY * dt);
  state.tilt += (target - state.tilt) * k;
}
