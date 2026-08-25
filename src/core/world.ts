// WorldState — plain-data world struct (plan 01 §2.2, spec 8.3).
// Every field is data; systems mutate only their owned slice. No classes.

import type { EntityStore } from './entity';
import { createEntityStore } from './entity';
import type { Time } from './time';
import { createTime } from './time';
import { Rng } from './rng';
import type { Intent } from '../types/intent';
import { createIntent } from '../types/intent';
import type { TetherState, TetherEvent } from '../game/tether';
import type { LineStats } from '../game/line';
import { BASE_LINE } from '../game/line';
import type { TetherTuning } from '../game/tuning';
import { DEFAULT_TUNING } from '../game/tuning';

export type Mode = 'boat' | 'foot'; // driven by 03

export interface InputState {
  // raw device state this frame, filled by the input system
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
}

export interface DodgeState {
  active: boolean; // rolling right now
  timeLeft: number; // seconds of roll remaining (i-frames = this window)
  cooldownLeft: number; // seconds until roll is allowed again (0.6s, stamina-independent)
  dirX: number; // roll direction (normalized, matches vx/vz axes)
  dirZ: number;
}

export interface PlayerState {
  // M1: on-foot keeper (plan 01 §4.1). Position is integrated by the movement
  // system from vx/vz (set by the controller); facing is radians on the same
  // XZ convention as the boat (0 = +Z, +PI/2 = +X).
  x: number;
  z: number;
  facing: number; // radians
  vx: number; // m/s along +X
  vz: number; // m/s along +Z
  stamina: number; // pool 0..100 (plan §4.3)
  staminaRegenDelay: number; // seconds left in the 0.8s no-regen window after a spend
  dodge: DodgeState; // roll state (0.25s i-frames, 0.6s cooldown, 25 stamina)
  iframes: number; // seconds of invulnerability remaining
  hp: number; // keeper health
  radius: number; // circle collision radius (land combat, spec 8.3)
  stagger: number; // seconds of tether-snap stagger (plan 02 §5.3, ~0.3s)
}

export interface BoatState {
  x: number;
  y: number;
  z: number; // water-surface height (sample from water)
  heading: number; // radians
  speed: number;
  atWinchPost: boolean; // reel-source gate for boat fights (02 seam, 03 fills)
  atCleat: boolean; // cut-cost gate for boat fights (02 seam, 03 fills)
}

export interface HitEvent {
  targetId: number; // entity/collision id the hit lands on
  damage: number;
  knockbackX: number; // impulse along +X
  knockbackZ: number; // impulse along +Z
  stagger: number; // hit-stun seconds applied to the target
}

export interface CombatState {
  // M1: gaff light 3-hit combo + heavy hold (plan 01 §4.4, spec 4.1)
  comboStage: number; // 0 = idle, 1..3 = current combo stage
  comboWindow: number; // seconds left to continue the combo before reset
  attackTimer: number; // active swing wind-down timer
  heavyCharge: number; // seconds held on the heavy wind-up (0.35s hold, 30 stamina)
  hits: HitEvent[]; // pending hit events; damage application consumes them
  // Swing bookkeeping (WORKER B, game/combat.ts): intent.primary is a LEVEL
  // signal, so combat tracks the previous tick to detect the tap's rising edge,
  // and a swing must remember its facing (locked), its type, and whether its
  // single hit has landed.
  primaryPrev: boolean; // intent.primary from the previous tick (tap edge)
  swingFacing: number; // facing captured at swing start, locked for the swing
  swingIsHeavy: boolean; // current swing is a heavy (bigger arc / damage / stagger)
  swingHitDelivered: boolean; // one hit max per swing
}

export type FishStateKind =
  | 'idle'
  | 'strafe'
  | 'lunge'
  | 'hurt'
  | 'recover'
  | 'dead'
  | 'dive'; // tether-FSM dive (render reads it for the line's dive-hook sink)

export interface PatternWeights {
  orbit: number;
  lunge: number;
  dive: number;
  drag: number;
}

export interface FishTetherStats {
  // 02 tether block (plan 02 §2.2): the exhaustion/lunge stats the tethered-fight
  // AI reads in round 2. Mass drives the correction split; stamina is the shared
  // exhaustion pool (FishState.stamina, 0..maxStamina).
  mass: number; // mass ratio vs player (=1.0); heavy → yanks the player
  maxStamina: number; // exhaustion pool ceiling (= 100 × dial 6 at fight start)
  maxSwimSpeed: number; // m/s — lunge impulses clamp to this (plan 02 §4.1)
  pullForce: number; // impulse magnitude per lunge (m/s) — dial 1
  lungeCooldown: number; // s between lunges
  lungeStaminaCost: number; // stamina per lunge (× line.exhaustMult for Braided Sinew)
  dragSpeed: number; // m/s while in drag state
  dragStaminaCostPerM: number;
  routedDrag: boolean; // bosses + deliberately-routing species drag toward hazards
  patterns: PatternWeights; // species bias over orbit/lunge/dive/drag
  exhausted: boolean; // stamina === 0 — animation system reads this
}

// --- tethered-fight AI (plan 02 §7, round 2A — game/fishAI.ts) -----------------
// The FSM is deliberately separate from the M1 land AI (per 01 §7's risk note).
// FishState.ai is null while no tether fight is active; startTetherFight seeds
// it. PCG32 stream keyed by (world.seed, fight id) so a replay is byte-identical
// (spec 8.3).

export type TetherAIMode = 'orbit' | 'lunge' | 'dive' | 'drag' | 'exhausted';

export interface TetherFishAI {
  mode: TetherAIMode;
  timer: number; // s left in the current mode/phase
  telegraph: number; // s of telegraph remaining (0 = none); render reads it
  telegraphKind: 'lunge' | 'drag' | null;
  pullDirX: number; // normalized pull dir locked at telegraph start
  pullDirZ: number;
  orbitDir: number; // 1 | -1
  orbitFlipTimer: number; // s until the next orbit direction flip
  lungeCooldown: number; // s until the fish may lunge again
  biasTimer: number; // s until the next weighted transition roll
  pullBy: 'lunge' | 'dive'; // current pull source — drag events tag with this
  rng: Rng; // PCG32 stream (seeded from world.seed + fight id)
}

export interface FishState {
  // M1: the one hardcoded sine-spine fish (plan 01 §4.5). The fish integrates
  // its own x/z from vx/vz in its AI — the movement system does NOT touch it.
  x: number;
  z: number;
  facing: number; // radians (0 = +Z, +PI/2 = +X)
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  stamina: number;
  state: FishStateKind;
  stateTimer: number; // seconds left in the current behaviour state
  spine: Float32Array; // per-segment bend (radians), CPU sine-spine animation
  hitFlash: number; // seconds of hurt-flash remaining (vertex-colour flash)
  radius: number; // circle collision radius
  tether: FishTetherStats; // 02 — exhaustion/lunge stats (plan 02 §2.2)
  ai: TetherFishAI | null; // 02 round 2A — tethered-fight FSM (game/fishAI.ts)
  // --- WORKER C land-AI / sine-spine fields (plan 01 §4.5, T16/T17) ---------
  lastHp: number; // hp from the previous step — hp-delta check for hurt
  strafeDir: number; // 1 | -1 — strafe orbit direction (random flips)
  strafeFlipTimer: number; // seconds until the next strafe direction flip
  telegraph: number; // >0 = lunging fish is coiling (render coils); also the
  //                    0.4s telegraph countdown
  lungeX: number; // burst target locked at the telegraph start
  lungeZ: number;
  lungeHitDone: number; // 1 once contact damage has been dealt this lunge
  deadTilt: number; // 0→1 belly-flop roll (render rolls the body from this)
  exhaustTilt: number; // 0..max belly-tilt telegraph (animateFish ramps it, plan 02 §6.2)
}

export interface GroundState {
  // Debug walkable islet boundary for M1 land combat (plan 01 §4.1). The
  // collision system keeps actors inside this circle; the procedural map (03)
  // owns real terrain later.
  x: number;
  z: number;
  radius: number; // m
}

export interface UiState {
  // crosshair, stamina bar, hints
  debug: boolean;
  underwater: boolean; // T9 — set while the water phase is active; render/DOM tint reads it
}

export interface WaterPhaseState {
  // 02 (plan 02 §8, T9): submerged, dragged under. Triggered when a drag
  // displaces the tethered player past the islet shoreline (world.ground
  // boundary). The waterPhase system (game/waterPhase.ts) owns the timer,
  // drift, and struggle-to-shore vector.
  active: boolean; // submerged, dragged under
  breath: number; // 15s max, drains underwater (clamped at 0 — not lethal in M2)
  breathMax: number; // 15
  drift: { x: number; z: number }; // small sinusoidal drift to add to movement
  towardShore: { x: number; z: number }; // struggle vector (player → islet centre)
  threatsApproach: boolean; // true when dread tier >= 3 — spawn system hook
}

export interface LureState {
  // 02 placeholder lure slot (plan 02 §5.4): the equipped lure; cut/snap lose it.
  id: string;
  count: number;
}

export interface WorldState {
  entities: EntityStore;
  input: InputState;
  intent: Intent;
  player: PlayerState;
  boat: BoatState;
  combat: CombatState;
  fish: FishState | null;
  ground: GroundState; // M1: walkable islet boundary (collision system)
  dread: number; // 0..100 (RESERVED; post reads it, 05 owns)
  ui: UiState;
  time: Time;
  seed: number; // PCG32 seed (set per run; 03/04 use)
  mode: Mode; // 'boat' | 'foot' (03 drives)
  tether: TetherState; // 02 — generic anchor fights (Addendum A.2)
  line: LineStats; // 02 — equipped line
  tuning: TetherTuning; // 02 — the six dials
  tetherEvents: TetherEvent[]; // 02 — produced by tetherConstraint, cleared per tick
  water: WaterPhaseState; // 02 — water-phase state (T9 owns the system)
  lure: LureState; // 02 — equipped lure slot (cut/snap cost)
}

export const PLAYER_RADIUS = 0.5;
export const FISH_RADIUS = 0.8;
export const GROUND_RADIUS = 20;
export const PLAYER_MAX_HP = 100;
export const SPINE_SEGMENTS = 8;
// Foot-mode debug spawn: on the islet a few metres off the parked boat (which
// sits at the origin) so the player doesn't overlap it when boots or toggles
// into foot mode.
export const FOOT_SPAWN = { x: 0, z: 6 };

export function createWorld(seed = 1): WorldState {
  return {
    entities: createEntityStore(),
    input: { keys: new Set(), mouseX: 0, mouseY: 0, mouseDown: false },
    intent: createIntent(),
    player: {
      x: 0,
      z: 0,
      facing: 0,
      vx: 0,
      vz: 0,
      stamina: 100,
      staminaRegenDelay: 0,
      dodge: { active: false, timeLeft: 0, cooldownLeft: 0, dirX: 0, dirZ: 0 },
      iframes: 0,
      hp: PLAYER_MAX_HP,
      radius: PLAYER_RADIUS,
      stagger: 0,
    },
    boat: { x: 0, y: 0, z: 0, heading: 0, speed: 0, atWinchPost: false, atCleat: false },
    combat: {
      comboStage: 0,
      comboWindow: 0,
      attackTimer: 0,
      heavyCharge: 0,
      hits: [],
      primaryPrev: false,
      swingFacing: 0,
      swingIsHeavy: false,
      swingHitDelivered: false,
    },
    fish: null,
    ground: { x: 0, z: 0, radius: GROUND_RADIUS },
    dread: 0,
    ui: { debug: false, underwater: false },
    time: createTime(),
    seed,
    mode: 'boat',
    tether: { fights: [], nextId: 1 },
    line: BASE_LINE,
    tuning: DEFAULT_TUNING,
    tetherEvents: [],
    water: {
      active: false,
      breath: 15,
      breathMax: 15,
      drift: { x: 0, z: 0 },
      towardShore: { x: 0, z: 0 },
      threatsApproach: false,
    },
    lure: { id: 'basic-lure', count: 1 },
  };
}

// Defaulted fish for WORKER C's spawnFish (game/fish.ts). Plain data; the
// worker repositions/restates it to taste.
export function createFish(): FishState {
  return {
    x: 8,
    z: -6,
    facing: 0,
    vx: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    state: 'idle',
    stateTimer: 0,
    spine: new Float32Array(SPINE_SEGMENTS),
    hitFlash: 0,
    radius: FISH_RADIUS,
    tether: {
      mass: 1.5,
      maxStamina: 100,
      maxSwimSpeed: 6,
      pullForce: 4,
      lungeCooldown: 3,
      lungeStaminaCost: 20,
      dragSpeed: 4,
      dragStaminaCostPerM: 2,
      // M2 capsule routes drags toward the debug islet shoreline (plan 02 §7):
      // drags deliberately pull the player toward the water.
      routedDrag: true,
      patterns: { orbit: 0.4, lunge: 0.3, dive: 0.2, drag: 0.1 },
      exhausted: false,
    },
    ai: null,
    lastHp: 100,
    strafeDir: 1,
    strafeFlipTimer: 0,
    telegraph: 0,
    lungeX: 0,
    lungeZ: 0,
    lungeHitDone: 0,
    deadTilt: 0,
    exhaustTilt: 0,
  };
}

export function resetWorld(world: WorldState, seed: number): WorldState {
  const fresh = createWorld(seed);
  // carry over runtime-only fields that should survive a run reset (debug flag)
  fresh.ui.debug = world.ui.debug;
  return fresh;
}
