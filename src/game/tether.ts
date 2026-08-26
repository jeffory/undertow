// TETHER (game) — plan 02 §2, Addendum A.2–A.6.
// The generic two-endpoint distance constraint. The M2 player-vs-fish fight is
// the default special case, but the shape (Anchor / ReelSource / CutCost /
// TetherEndpoint / TetherFight / TetherState.fights[]) is built generic from
// day one so 03's boat fight and 05's reverse/snatch fights slot in without a
// refactor (A.2). The constraint math lives in game/tetherConstraint.ts.
//
// Pure data + fight construction + the event union. No `three` imports.

import type { EntityId } from '../core/entity';
import { Rng } from '../core/rng';
import type { WorldState, TetherFishAI } from '../core/world';

export type Vec2 = { x: number; z: number };
export type SpeciesId = string;

// --- generic endpoint shape (Addendum A.2) ------------------------------------

export type Anchor =
  | { kind: 'entity'; entityId: EntityId } // player, catch, Snatcher, Postmaster…
  | { kind: 'boat' }                        // reads world.boat.x/z (t1/t3 state)
  | { kind: 'fixed'; point: Vec2 };         // Longliner trap-line, shore (mass = ∞)

export type ReelSource =
  | { kind: 'player-stance' } // hold RMB — the M2 default
  | { kind: 'winch-post' }    // boat fight: reel only while at the post (03 §6.1)
  | { kind: 'ai' }            // reverse/snatch: the enemy reels (05 §0)
  | { kind: 'none' };         // this end never reels

export type CutCost =
  | { kind: 'lure' }          // M2 default: F-cut costs the equipped lure
  | { kind: 'hull-segment' }  // boat fight: cleat cut costs a hull segment (03 §6.1)
  | { kind: 'contextual' }    // reverse: close-range action, no item cost (05 zone 3)
  | { kind: 'none' };         // this end can never cut the line

export type EndpointOwner = 'player' | 'enemy' | 'third' | 'world';

export interface TetherEndpoint {
  anchor: Anchor;
  owner: EndpointOwner;       // drives brace, events, verb gating
  mass: number;               // correction split (spec 4.3); player = 1.0
  radius: number;             // hook radius — L floor for this end
  reel: ReelSource;
  cut: CutCost;
}

export interface ReelState {
  hold: boolean;              // reel intent held this frame (intent / AI)
  active: boolean;            // hold && stamina-gate satisfied
  speedMult: number;          // 0.5 while active (movement reads this)
  drain: number;              // 10 stamina/s (spec 4.1)
  exhaustedMult: number;      // ×2 reelRate while the catch is exhausted
}

export interface CutState {
  held: number;               // seconds F has been held (0..0.5)
  progress: number;           // held / 0.5 → UI ring 0..1
  fired: boolean;             // true the frame the cut completes
}

export interface LandState {
  eligible: boolean;          // |d| < 2m && catch exhausted (spec 4.2)
  accepted: boolean;          // player pressed the contextual prompt → clean catch
}

export interface SnapState {
  fired: boolean;
  cause: 'reel' | 'lunge' | 'greed'; // diagnosis for 13.1 legibility
}

export interface DragState {
  windowStart: number;        // world.time the current window opened
  accumulated: number;        // Σ|pull correction| over the window (m)
  lastDir: Vec2;              // dominant pull direction
  cooldown: number;           // s until the next drag event may fire
}

export interface TetherFight {
  id: number;
  species: SpeciesId;         // bestiary/telemetry tag (04 consumes)
  anchor: 'player' | 'boat';  // event tag (boat fights from 03)
  a: TetherEndpoint;
  b: TetherEndpoint;
  L: number;                  // current line length (m); only shrinks via reel
  // Per-fight reel-rate override (03 §6.1): the boat fight reels at the WINCH's
  // rate, not the hand-line's. Undefined → line.reelRate (the M2 default).
  reelRate?: number;
  // Per-fight pull-force multiplier (05 §2.1): the Congregation's mass pool
  // "scales pullForce so the fight starts heavy and lightens". Same seam shape
  // as reelRate — undefined → ×1, so every other fight is untouched.
  pullForceMult?: number;
  tension: number;            // 0..line.tensionCeiling
  reel: ReelState;
  cut: CutState;
  land: LandState;
  snap: SnapState;
  drag: DragState;
}

export interface TetherState {
  fights: TetherFight[];      // [0] = primary line; iterated in fixed id order (deterministic)
  nextId: number;
}

// --- constants / special entity ids ---------------------------------------------

// M1's player/fish are not in the EntityStore yet; these negative ids resolve
// to world.player / world.fish in the constraint's position accessor.
export const PLAYER_ENTITY = -1;
export const FISH_ENTITY = -2;

export const M2_SPECIES: SpeciesId = 'capsule';

export const FISH_STAMINA_BASE = 100; // exhaustion pool before dial 6
export const LAND_DISTANCE = 2; // m — LAND eligibility (spec 4.2)
export const CUT_HOLD_SECONDS = 0.5; // s — hold-F cut
export const REEL_STAMINA_DRAIN = 10; // stamina/s while reeling (spec 4.1)
export const REEL_EXHAUSTED_MULT = 2; // ×reelRate while the catch is exhausted
export const LOW_TENSION_THRESHOLD = 40; // tension below which reeling exhausts the catch
export const LOW_TENSION_EXHAUST = 12; // catch stamina/s while reeling at low tension (plan 6.1)
export const DRAG_WINDOW = 0.1; // s — drag detection window
export const DRAG_THRESHOLD = 1.5; // m — player pulled this far in a window = drag
export const DRAG_COOLDOWN = 0.3; // s — minimum between drag events
export const SNAP_STAGGER = 0.3; // s — player stagger on a snap (plan 5.3)
export const STUN_DURATION = 2; // s — Bellwire stun
export const STUN_TENSION_RESET = 40; // Bellwire tension reset after a stun
export const WIDOWS_HAIR_DAMAGE = 20; // direct player HP at ceiling (Widow's Hair)
export const BOAT_MASS_DEFAULT = 6; // boat endpoint mass (03 tune)
export const BOAT_RADIUS_DEFAULT = 3; // boat endpoint radius (03 tune)

// --- events (plan 02 §2.5 / Addendum A.6) ---------------------------------------
// Pushed to world.tetherEvents, consumed by ui/render/audio, cleared per tick
// by the producer (the constraint system). The boat/reverse/snatch/water
// variants are data from day one — nothing produces them until their milestone.

export type TetherEvent =
  | { type: 'drag'; fightId: number; anchor: 'player' | 'boat'; dir: Vec2; magnitude: number; by: 'lunge' | 'dive' }
  // `occluded` (M6, plan 05 §2.1): a kelp column stands on the sight-line from
  // the hauling end to the catch. The event STILL FIRES — audio and the sim read
  // it unchanged — but the visual cue is suppressed, so a fight fought inside
  // the Kelp Graves is read off the line, not off the fish.
  | { type: 'telegraph'; fightId: number; dir: Vec2; kind: 'lunge' | 'drag'; occluded?: boolean }
  | { type: 'lunge'; fightId: number; dir: Vec2; force: number }
  | { type: 'snap'; fightId: number; cause: 'reel' | 'lunge' | 'greed' | 'delivered'; lineId: string; side: 'player' | 'enemy' }
  | { type: 'cut'; fightId: number; lineId: string; cost: 'lure' | 'hull-segment' | 'contextual' }
  | { type: 'landed'; clean: true }
  | { type: 'butchered'; lineId: string; minusOneTier: true }
  // M6 drag-snag (plan 05 §2.1): a drag that would have hauled the player/boat
  // through a kelp column was arrested at the column edge instead. `arrested` is
  // the metres of pull that were dropped — braced-at-kelp is a free arrest.
  | { type: 'kelpSnag'; fightId: number; anchor: 'player' | 'boat'; at: Vec2; column: number; arrested: number }
  | { type: 'pulledUnder'; breathSec: number; occupied: boolean; sinkingHaul?: boolean }
  | { type: 'surfaced'; breathSec: number } // T9 — water phase exit (reached shore / line ended)
  | { type: 'reeledMs'; ms: number }                                   // instrumentation
  | { type: 'tensionWarning'; fightId: number; tension: number }       // creak/high-tension UI
  | { type: 'boatHooked'; draggerId: EntityId }
  | { type: 'hullHit'; segments: number; hp: number }
  | { type: 'swamped'; sinkingHaul: boolean }
  | { type: 'delivered'; by: 'postmaster' | 'whistler' | 'dragger' }
  | { type: 'bossLineCut' }
  | { type: 'snatcherAttached'; target: EntityId }
  | { type: 'gripBroken' }
  | { type: 'catchStolen'; species: SpeciesId }
  | { type: 'enterWaterPhase'; breathSec: number; occupied: boolean; sinkingHaul?: boolean };

// 03 §3.2 run-reducer mapping (A.6): one stream, many subscribers.
export type RunKind = 'tether/landed' | 'tether/cut' | 'tether/snapped' | 'tether/pulledIn';

export function toRunKinds(ev: TetherEvent): RunKind | null {
  switch (ev.type) {
    case 'landed':
      return 'tether/landed';
    case 'cut':
      return 'tether/cut';
    case 'snap':
      return 'tether/snapped';
    case 'pulledUnder':
      return 'tether/pulledIn';
    default:
      return null;
  }
}

// --- fight construction -----------------------------------------------------------

// Seed the tethered-fight AI for a catch (plan 02 §7, round 2A). PCG32 stream
// keyed by (world.seed, fight id) so a scripted replay is byte-identical (spec
// 8.3). The FSM itself lives in game/fishAI.ts; this is just the per-fight
// state construction, kept here so fight setup stays in one place (no import
// cycle: tether.ts → fishAI.ts is not needed).
export function initTetherFishAI(seed: number, fightId: number): TetherFishAI {
  const rngSeed = ((seed * 2654435761) ^ (fightId * 40503)) >>> 0;
  return {
    mode: 'orbit',
    timer: 0, // 0 → the first fishAI step rolls a weighted transition immediately
    telegraph: 0,
    telegraphKind: null,
    pullDirX: 0,
    pullDirZ: 0,
    orbitDir: 1,
    orbitFlipTimer: 0,
    lungeCooldown: 0,
    biasTimer: 0,
    pullBy: 'lunge',
    rng: new Rng(rngSeed),
  };
}

// The sibling-facing API (03 §0): starts a fight between the endpoint `anchor`
// (player or boat) and a catch built from `species`. `opts` overrides endpoints
// or the starting line length (used by 03/05 for reverse/snatch constructions).
// Returns the new fight, or null when no catch exists to hook.
export function startTetherFight(
  world: WorldState,
  species: SpeciesId,
  anchor: 'player' | 'boat',
  opts?: Partial<{
    a: TetherEndpoint;
    b: TetherEndpoint;
    L: number;
    reelRate: number;
    pullForceMult: number;
  }>,
): TetherFight | null {
  const fish = world.fish;

  let a: TetherEndpoint;
  let b: TetherEndpoint;

  if (anchor === 'player') {
    // M2 default (A.2 conventions): a = the player, b = the catch from FishStats.
    if (!fish) return null;
    a = {
      anchor: { kind: 'entity', entityId: PLAYER_ENTITY },
      owner: 'player',
      mass: 1,
      radius: world.player.radius,
      reel: { kind: 'player-stance' },
      cut: { kind: 'lure' },
    };
    b = {
      anchor: { kind: 'entity', entityId: FISH_ENTITY },
      owner: 'enemy',
      mass: fish.tether.mass,
      radius: fish.radius,
      reel: { kind: 'none' },
      cut: { kind: 'none' },
    };
  } else {
    // boat (03 §6.1): a = the winch post on the boat, b = the Dragger. The
    // Dragger rides the single catch slot (world.fish) — it IS a species, so it
    // reuses the whole fish pipeline (params, tethered-fight FSM, mesh).
    a = {
      anchor: { kind: 'boat' },
      owner: 'world',
      mass: BOAT_MASS_DEFAULT,
      radius: BOAT_RADIUS_DEFAULT,
      reel: { kind: 'winch-post' },
      cut: { kind: 'hull-segment' },
    };
    b = {
      anchor: { kind: 'entity', entityId: FISH_ENTITY },
      owner: 'enemy',
      mass: fish ? fish.tether.mass : 8,
      radius: fish ? fish.radius : 2,
      reel: { kind: 'none' },
      cut: { kind: 'none' },
    };
  }

  if (opts?.a) a = opts.a;
  if (opts?.b) b = opts.b;
  const L = opts?.L ?? world.line.baseLength;

  // Reset the catch's exhaustion pool for this fight (dial 6 = fishStaminaPool).
  if (fish) {
    fish.tether.maxStamina = FISH_STAMINA_BASE * world.tuning.fishStaminaPool;
    fish.stamina = fish.tether.maxStamina;
    fish.tether.exhausted = false;
  }

  const fight: TetherFight = {
    id: world.tether.nextId++,
    species,
    anchor,
    a,
    b,
    L,
    ...(opts?.reelRate !== undefined ? { reelRate: opts.reelRate } : {}),
    ...(opts?.pullForceMult !== undefined ? { pullForceMult: opts.pullForceMult } : {}),
    tension: 0,
    reel: {
      hold: false,
      active: false,
      speedMult: 1,
      drain: REEL_STAMINA_DRAIN,
      exhaustedMult: REEL_EXHAUSTED_MULT,
    },
    cut: { held: 0, progress: 0, fired: false },
    land: { eligible: false, accepted: false },
    snap: { fired: false, cause: 'greed' },
    drag: { windowStart: world.time.elapsed, accumulated: 0, lastDir: { x: 0, z: 0 }, cooldown: 0 },
  };
  world.tether.fights.push(fight);
  // Seed the tethered-fight FSM (round 2A) — the catch's own AI block.
  if (fish) fish.ai = initTetherFishAI(world.seed, fight.id);
  return fight;
}

// Water-phase entry (A.2 API). The breath timer / restricted verbs are 03/05's
// waterPhase system (T9); this sets the state + event so the seam is real.
export function enterWaterPhase(
  world: WorldState,
  opts: { breathSec: number; occupied: boolean; sinkingHaul?: boolean },
): void {
  world.water.active = true;
  world.water.breath = opts.breathSec;
  world.water.breathMax = opts.breathSec;
  const ev: TetherEvent = {
    type: 'enterWaterPhase',
    breathSec: opts.breathSec,
    occupied: opts.occupied,
    ...(opts.sinkingHaul !== undefined ? { sinkingHaul: opts.sinkingHaul } : {}),
  };
  world.tetherEvents.push(ev);
}