// WorldState — plain-data world struct (plan 01 §2.2, spec 8.3).
// Every field is data; systems mutate only their owned slice. No classes.

import type { EntityStore } from './entity';
import { createEntityStore } from './entity';
import type { Time } from './time';
import { createTime } from './time';
import type { Intent } from '../types/intent';
import { createIntent } from '../types/intent';

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
}

export interface BoatState {
  x: number;
  y: number;
  z: number; // water-surface height (sample from water)
  heading: number; // radians
  speed: number;
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
  | 'dead';

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
}

export const PLAYER_RADIUS = 0.5;
export const FISH_RADIUS = 0.8;
export const GROUND_RADIUS = 20;
export const PLAYER_MAX_HP = 100;
export const SPINE_SEGMENTS = 8;

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
    },
    boat: { x: 0, y: 0, z: 0, heading: 0, speed: 0 },
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
    ui: { debug: false },
    time: createTime(),
    seed,
    mode: 'boat',
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
    lastHp: 100,
    strafeDir: 1,
    strafeFlipTimer: 0,
    telegraph: 0,
    lungeX: 0,
    lungeZ: 0,
    lungeHitDone: 0,
    deadTilt: 0,
  };
}

export function resetWorld(world: WorldState, seed: number): WorldState {
  const fresh = createWorld(seed);
  // carry over runtime-only fields that should survive a run reset (debug flag)
  fresh.ui.debug = world.ui.debug;
  return fresh;
}
