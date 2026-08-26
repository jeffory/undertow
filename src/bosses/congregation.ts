// THE CONGREGATION (bosses) — the Kelp Graves boss, plan 05 §2.1:
//
//   "Design: a school that fights as one mass on one hook; landing it lands
//    dozens. Comedy-as-horror: the invoice itemises every soul.
//    Sketch: ONE TetherState whose 'fish' is a swarm centre; the swarm is 20–40
//    small members orbiting the tether point (all instances from t4's shared
//    mesh pool). A massPool stat decays as members are torn off by gaffs/
//    exhaustion; the mass pool scales pullForce so the fight starts heavy and
//    lightens. When massPool exhausts → LAND → the cluster bursts into 12–18
//    individual landed catches (loot shower + guaranteed bestiary credits) and
//    the Invoice overlay plays…"
//
// This module is the pure state + rules half, in the shape boat/boatCombat.ts
// established: no WorldState, no systems, no `three`, no Math.random, no Date.
// `systems/congregation.ts` drives it — hooking, tear-off, the burst, the
// overlay clock.
//
// THE TETHER IS REUSED, NOT REIMPLEMENTED. The boss is exactly one fight: the
// swarm centre rides the single catch slot (world.fish) like every other
// species, so the constraint, the reel, the brace, the cut, the snap and the
// LAND prompt are all the ones the player already knows. What this file adds is
// the mass pool on top of it.

import { Rng } from '../core/rng';
import type { Vec2 } from '../core/poly';

// --- events (plan 05 §0.2 "Events I emit … `boss.started` …") -------------------
// The same plain-data shape the town queue already carries, so the audio worker
// binds the Congregation's stings the way it binds the bell patch — without
// either side importing the other's logic. `boss.landed` is this milestone's
// sibling of the listed `boss.started`; the invoice overlay rides on it.

export interface BossStartedEvent {
  type: 'boss.started';
  bossId: 'congregation';
  zone: number;
  fightId: number;
  members: number; // how many are on the hook
  massPool: number;
}

export interface BossLandedEvent {
  type: 'boss.landed';
  bossId: 'congregation';
  zone: number;
  fightId: number;
  burst: number; // individual catches the cluster burst into (12-18)
  accounts: number; // ledger rows the invoice is about to read out (47)
}

// --- the swarm ------------------------------------------------------------------

// plan 05 §2.1: "the swarm is 20-40 small members orbiting the tether point".
export const MEMBERS_MIN = 20;
export const MEMBERS_MAX = 40;

// plan 05 §2.1: "the cluster bursts into 12-18 individual landed catches".
export const BURST_MIN = 12;
export const BURST_MAX = 18;

// One unit of mass pool per member: the pool IS the congregation, counted.
export const MASS_PER_MEMBER = 1;

// A gaff tears members off directly (plan: "torn off by gaffs/exhaustion"). A
// heavy swing takes a pair; a light tap takes one. This is on TOP of the
// stamina the hit already drains through the normal fight (fishAI's
// GAFT_EXHAUST_PER_HIT), which is the exhaustion half of the same sentence.
export const GAFF_TEAR_LIGHT = 1;
export const GAFF_TEAR_HEAVY = 2;

// "the mass pool scales pullForce so the fight starts heavy and lightens":
// a full pool pulls at PULL_MULT_FULL, an empty one at PULL_MULT_EMPTY, linear
// in the pool fraction. Never below the floor — a lightened Congregation is
// still a Congregation.
export const PULL_MULT_FULL = 1.6;
export const PULL_MULT_EMPTY = 0.45;

// Orbit geometry (m) — the ring the members hold around the centre.
export const ORBIT_RADIUS_MIN = 1.2;
export const ORBIT_RADIUS_MAX = 3.2;
export const ORBIT_SPEED_MIN = 0.45; // rad/s
export const ORBIT_SPEED_MAX = 1.15;
// Height band about the centre. Deliberately shallow and mostly ABOVE the
// waterline: a congregation on one hook has to read as a boil of small bodies
// breaking the surface, and anything much below WATER_FISH_Y is simply hidden
// by the water plane — invisible mass is not a boss fight.
export const ORBIT_Y_MIN = -0.45;
export const ORBIT_Y_MAX = 0.55;
export const MEMBER_SCALE_MIN = 0.3;
export const MEMBER_SCALE_MAX = 0.62;

// A torn member drifts off for this long before it stops being drawn.
export const TEAR_DRIFT_SECONDS = 1.6;
export const TEAR_DRIFT_SPEED = 2.4; // m/s outward

// One member of the school. Every field but `attached`/`tornAt` is drawn once at
// spawn from the fight's own stream, so a member's whole path through the fight
// is a pure function of (run seed, fight id, member index, elapsed).
export interface CongregationMember {
  index: number;
  radius: number; // orbit radius about the swarm centre (m)
  y: number; // height offset about the centre (m)
  angle0: number; // orbit phase at fight start (rad)
  speed: number; // orbit angular speed (rad/s)
  dir: 1 | -1; // orbit direction
  bobAmp: number; // vertical bob amplitude (m)
  bobFreq: number; // rad/s
  bobPhase: number;
  scale: number; // render scale of this member
  attached: boolean;
  tornAt: number; // fight-elapsed seconds when it was torn off (−1 attached)
  tearDirX: number; // outward drift direction, locked at tear-off
  tearDirZ: number;
}

// The invoice overlay's clock. Presentation only — the haul is already banked
// when this starts (plan 05 §2.1: the burst lands first, the ledger reads it
// back). Advanced by the sim so it is deterministic and timescale-aware.
export interface CongregationInvoiceState {
  active: boolean;
  rowIndex: number; // rows revealed so far, 0..TOTAL_ACCOUNTS
  timer: number; // s until the next row descends
  fillers: string[]; // species names the unseeded accounts are itemised with
  skipPrev: boolean; // rising-edge tracker for the skip verb
  done: boolean; // the stamp is down; the overlay is dismissible
}

export interface CongregationState {
  active: boolean; // a Congregation fight is live
  fightId: number;
  members: CongregationMember[];
  tearOrder: number[]; // member indices, in the order the school gives them up
  massPool: number; // units remaining (starts at members.length)
  massPoolMax: number;
  gaffTears: number; // members torn by the gaff specifically
  elapsed: number; // s since the hook set
  landed: boolean; // the burst has been banked
  burstCount: number; // how many records the burst wrote
  invoice: CongregationInvoiceState;
}

export function createCongregationInvoiceState(): CongregationInvoiceState {
  return { active: false, rowIndex: 0, timer: 0, fillers: [], skipPrev: false, done: false };
}

// The inert state every world carries. Outside a Congregation fight this is
// what every consumer sees, so the boss costs nothing anywhere else.
export function createCongregationState(): CongregationState {
  return {
    active: false,
    fightId: -1,
    members: [],
    tearOrder: [],
    massPool: 0,
    massPoolMax: 0,
    gaffTears: 0,
    elapsed: 0,
    landed: false,
    burstCount: 0,
    invoice: createCongregationInvoiceState(),
  };
}

// The boss's own PCG32 stream, keyed by (run seed, fight id) exactly the way
// initTetherFishAI keys the catch's FSM — so the same seed hooking the same
// fight grows the same school, every time (spec 8.3).
export function congregationRng(seed: number, fightId: number): Rng {
  return new Rng(((seed * 2246822519) ^ (fightId * 3266489917) ^ 0xc0c6) >>> 0);
}

// Grow the school. Members are drawn in a fixed consumption order, then the
// tear order is a seeded Fisher-Yates over the member indices — which member
// the lake gives up first is decided at the hook-set, not at the swing.
export function buildSwarm(seed: number, fightId: number): CongregationState {
  const rng = congregationRng(seed, fightId);
  const count = rng.int(MEMBERS_MIN, MEMBERS_MAX);
  const members: CongregationMember[] = [];
  for (let i = 0; i < count; i++) {
    members.push({
      index: i,
      radius: rng.range(ORBIT_RADIUS_MIN, ORBIT_RADIUS_MAX),
      y: rng.range(ORBIT_Y_MIN, ORBIT_Y_MAX),
      angle0: rng.range(0, Math.PI * 2),
      speed: rng.range(ORBIT_SPEED_MIN, ORBIT_SPEED_MAX),
      dir: rng.nextFloat() < 0.5 ? -1 : 1,
      bobAmp: rng.range(0.05, 0.28),
      bobFreq: rng.range(0.7, 1.9),
      bobPhase: rng.range(0, Math.PI * 2),
      scale: rng.range(MEMBER_SCALE_MIN, MEMBER_SCALE_MAX),
      attached: true,
      tornAt: -1,
      tearDirX: 0,
      tearDirZ: 0,
    });
  }

  const tearOrder: number[] = members.map((m) => m.index);
  for (let i = tearOrder.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = tearOrder[i]!;
    tearOrder[i] = tearOrder[j]!;
    tearOrder[j] = a;
  }

  return {
    active: true,
    fightId,
    members,
    tearOrder,
    massPool: members.length * MASS_PER_MEMBER,
    massPoolMax: members.length * MASS_PER_MEMBER,
    gaffTears: 0,
    elapsed: 0,
    landed: false,
    burstCount: 0,
    invoice: createCongregationInvoiceState(),
  };
}

// --- the mass pool -----------------------------------------------------------------

// The pool decays from the two sources the plan names, and only those:
//   • EXHAUSTION — the swarm centre's own stamina fraction. Reeling at low
//     tension, diving, dragging and lunging all spend it, so the fight lightens
//     as it tires exactly the way every other catch does.
//   • GAFFS — a swing takes members off the hook directly, on top of the
//     stamina it drains.
// Both are expressed in members, so the pool is always "how much congregation
// is still on the line".
export function massPoolFor(
  massPoolMax: number,
  staminaFrac: number,
  gaffTears: number,
): number {
  const frac = Number.isFinite(staminaFrac) ? Math.max(0, Math.min(1, staminaFrac)) : 0;
  const fromExhaustion = massPoolMax * (1 - frac);
  return Math.max(0, massPoolMax - fromExhaustion - gaffTears * MASS_PER_MEMBER);
}

export function massFraction(state: CongregationState): number {
  if (state.massPoolMax <= 0) return 0;
  return Math.max(0, Math.min(1, state.massPool / state.massPoolMax));
}

// "the mass pool scales pullForce so the fight starts heavy and lightens".
export function pullForceMultFor(state: CongregationState): number {
  return PULL_MULT_EMPTY + (PULL_MULT_FULL - PULL_MULT_EMPTY) * massFraction(state);
}

// How many members should be off the hook for the pool as it stands. Monotone
// in the decay, so members never come back.
export function tornCountFor(state: CongregationState): number {
  const total = state.members.length;
  if (total === 0) return 0;
  const stillOn = Math.ceil(state.massPool / MASS_PER_MEMBER - 1e-9);
  return Math.max(0, Math.min(total, total - stillOn));
}

// Detach members up to `target`, in the seeded tear order. Returns how many were
// torn on this call (0 when nothing changed). `elapsed` stamps the drift clock;
// `centre` gives the outward drift its direction.
export function tearMembersTo(
  state: CongregationState,
  target: number,
  elapsed: number,
  centre: Vec2,
): number {
  let torn = 0;
  let off = 0;
  for (const m of state.members) if (!m.attached) off++;
  for (let i = 0; i < state.tearOrder.length; i++) {
    if (off + torn >= target) break;
    const idx = state.tearOrder[i]!;
    const m = state.members[idx];
    if (!m || !m.attached) continue;
    const p = memberPosition(m, centre, elapsed);
    const dx = p.x - centre.x;
    const dz = p.z - centre.z;
    const len = Math.hypot(dx, dz) || 1;
    m.attached = false;
    m.tornAt = elapsed;
    m.tearDirX = dx / len;
    m.tearDirZ = dz / len;
    torn++;
  }
  return torn;
}

// How many members ONE gaff hit takes off the hook. The in-play producer is
// world.combat.hits (systems/congregation.ts reads the tick's fresh hits); this
// is the rule itself, so the ?debug seam applies exactly the same one.
export function gaffTearFor(stagger: number): number {
  return stagger > 0 ? GAFF_TEAR_HEAVY : GAFF_TEAR_LIGHT;
}

export function attachedCount(state: CongregationState): number {
  let n = 0;
  for (const m of state.members) if (m.attached) n++;
  return n;
}

// --- member positions --------------------------------------------------------------

export interface MemberPoint {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

// A member's world position: a deterministic orbit about the swarm centre while
// attached, a straight outward drift for TEAR_DRIFT_SECONDS after it is torn
// off, then gone. Pure — the render side reads the same function the sim does,
// so nothing about the look can drift from the fight.
export function memberPosition(
  m: CongregationMember,
  centre: Vec2,
  elapsed: number,
): MemberPoint {
  const ang = m.angle0 + m.dir * m.speed * elapsed;
  const bob = Math.sin(elapsed * m.bobFreq + m.bobPhase) * m.bobAmp;
  if (m.attached) {
    return {
      x: centre.x + Math.cos(ang) * m.radius,
      y: m.y + bob,
      z: centre.z + Math.sin(ang) * m.radius,
      visible: true,
    };
  }
  const drift = Math.max(0, elapsed - m.tornAt);
  const t = drift / TEAR_DRIFT_SECONDS;
  const angTorn = m.angle0 + m.dir * m.speed * m.tornAt;
  const baseX = centre.x + Math.cos(angTorn) * m.radius;
  const baseZ = centre.z + Math.sin(angTorn) * m.radius;
  return {
    x: baseX + m.tearDirX * TEAR_DRIFT_SPEED * drift,
    y: m.y + bob - drift * 0.6,
    z: baseZ + m.tearDirZ * TEAR_DRIFT_SPEED * drift,
    visible: t < 1,
  };
}

// --- the landing burst ---------------------------------------------------------------

// "the cluster bursts into 12-18 individual landed catches". Seeded off the same
// stream the school was grown from, so the same fight always pays the same
// shower.
export function rollBurstCount(rng: Rng): number {
  return rng.int(BURST_MIN, BURST_MAX);
}

// Weighted draw over a roster of (id, weight) rows — the burst's species picks.
export function rollBurstSpecies(
  rng: Rng,
  roster: readonly { id: string; w: number }[],
  count: number,
): string[] {
  const out: string[] = [];
  if (roster.length === 0) return out;
  const total = roster.reduce((s, r) => s + r.w, 0);
  for (let i = 0; i < count; i++) {
    let r = rng.nextFloat() * total;
    let picked = roster[roster.length - 1]!.id;
    for (const row of roster) {
      r -= row.w;
      if (r <= 0) {
        picked = row.id;
        break;
      }
    }
    out.push(picked);
  }
  return out;
}

// --- the invoice clock -----------------------------------------------------------------

// plan 05 §2.1 / task: rows descend at ~0.35 s each, and the ledger is skippable
// after row 10 — long enough that the joke has landed and the player has read
// that the joke is the point.
export const INVOICE_ROW_SECONDS = 0.35;
export const INVOICE_SKIPPABLE_AFTER_ROW = 10;

export function invoiceSkippable(inv: CongregationInvoiceState): boolean {
  return inv.active && inv.rowIndex >= INVOICE_SKIPPABLE_AFTER_ROW;
}
