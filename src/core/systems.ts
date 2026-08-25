// Systems — pure functions over WorldState, run in fixed order (plan 01 §2.3,
// spec 8.3). Order is the contract: a system must not depend on a later system
// having run. `render` is the only system that touches Three directly.

import type { WorldState } from './world';
import { render } from '../render/renderer';
import { updateInput } from '../game/input';
import { updateController } from '../game/controller';
import { updateStamina } from '../game/stamina';
import { updateCombat } from '../game/combat';
import { spawnFish, updateFishAI, animateFish } from '../game/fish';
import { updateTetherFishAI } from '../game/fishAI';
import { updateWaterPhase, WATER_DAMP } from '../game/waterPhase';
import { constrainToCircle, separateCircles } from './collision';
import { updateTetherConstraint } from '../game/tetherConstraint';
import { updateTetherLog } from '../playtest/tetherLog';
import { updateDebugPanel } from '../ui/debugPanel';

export type SystemFn = (world: WorldState, dt: number) => void;

// --- stubs / reserved slots (owned by other workers) ----------------------

function dread(_w: WorldState, _dt: number): void {
  // RESERVED (05): Dread value; value lives on world.dread.
}

function spawn(world: WorldState, dt: number): void {
  // M1: spawn the single hardcoded fish once, then run its land AI. WORKER C
  // fills both (game/fish.ts); spawnFish is a no-op until then. During a tether
  // fight the tethered-fight AI (fishAI.ts, intent phase) owns the fish — the
  // land AI steps aside (plan 02 §7 risk note).
  if (!world.fish) spawnFish(world);
  if (world.fish && world.tether.fights.length === 0) updateFishAI(world, dt);
}

function animation(world: WorldState, dt: number): void {
  // M1: CPU sine-spine animation params (fish). WORKER C fills (game/fish.ts).
  animateFish(world, dt);
}

// --- systems this slice owns -------------------------------------------------

function input(world: WorldState, _dt: number): void {
  // delegate to worker C's input stub
  updateInput(world);
}

function intent(world: WorldState, dt: number): void {
  // M1 intent slot, AFTER input: WORKER A resolves world.intent into the
  // player's velocity/facing/dodge (controller.ts), then refreshes the stamina
  // pool (stamina.ts) so spends made this step are reflected immediately.
  updateController(world, dt);
  updateStamina(world, dt);
}

export function movement(world: WorldState, dt: number): void {
  // Boat (M0): integrate position from heading/speed. Only in boat mode — the
  // boat stays parked while on foot (M1 scaffold).
  if (world.mode === 'boat') {
    if (world.boat.speed !== 0) {
      world.boat.x += Math.sin(world.boat.heading) * world.boat.speed * dt;
      world.boat.z += Math.cos(world.boat.heading) * world.boat.speed * dt;
    }
  }

  // Player (M1 foot): integrate vx/vz set by the on-foot controller (WORKER A,
  // game/controller.ts). The fish integrates its own x/z inside its AI stub
  // (game/fish.ts, WORKER C) — movement does not touch the fish.
  if (world.mode === 'foot') {
    // Reel stance reads its 0.5 move-speed multiplier here (plan 02 §5.1).
    const reelActive = world.tether.fights.some((f) => f.reel.active);
    const speedMult = reelActive ? 0.5 : 1;
    if (world.water.active) {
      // Underwater (plan 02 §8): movement is damped (0.85×/frame) plus the
      // waterPhase system's sinusoidal drift — slow and drifty. Reel's 0.5
      // multiplier still applies (reeling is a water verb).
      world.player.x += (world.player.vx * speedMult * WATER_DAMP + world.water.drift.x) * dt;
      world.player.z += (world.player.vz * speedMult * WATER_DAMP + world.water.drift.z) * dt;
    } else {
      world.player.x += world.player.vx * speedMult * dt;
      world.player.z += world.player.vz * speedMult * dt;
    }
  }
}

export function collision(world: WorldState, _dt: number): void {
  // M1 land collision (foot mode only): keep the player and fish inside the
  // islet boundary, and keep a live fish off the player's circle. Shared
  // infrastructure owned by the M1 scaffold (pure math in core/collision.ts).
  //
  // T9 water-phase hooks:
  //  - a hooked fish (tether fight active) is IN the water — it is not clamped
  //    to the islet, so a routed drag can pull the pair past the shoreline
  //    (the source of the water-phase trigger);
  //  - a submerged player is swimming in the deep — collision stops clamping
  //    them back to the shore (waterPhase exits when they reach it).
  if (world.mode !== 'foot') return;
  const g = world.ground;
  const p = world.player;
  const under = world.water.active;
  const tethered = world.tether.fights.length > 0;

  if (!under) {
    const pc = constrainToCircle({ x: p.x, z: p.z, radius: p.radius }, g);
    p.x = pc.x;
    p.z = pc.z;
  }

  const f = world.fish;
  if (f) {
    if (!tethered) {
      const fc = constrainToCircle({ x: f.x, z: f.z, radius: f.radius }, g);
      f.x = fc.x;
      f.z = fc.z;
    }
    // a dead fish is a corpse — the player walks through it
    if (f.state !== 'dead') {
      const [pa, fb] = separateCircles(
        { x: p.x, z: p.z, radius: p.radius },
        { x: f.x, z: f.z, radius: f.radius }
      );
      p.x = pa.x;
      p.z = pa.z;
      f.x = fb.x;
      f.z = fb.z;
    }
  }
}

function combat(world: WorldState, dt: number): void {
  // gaff hits, combo timers, damage (M1). WORKER B fills (game/combat.ts).
  updateCombat(world, dt);
}

function renderSystem(world: WorldState, dt: number): void {
  render(world, dt);
}

function ui(world: WorldState, _dt: number): void {
  updateDebugOverlay(world);
  updateDebugPanel(world);
  updateWaterTint(world);
}

// --- underwater screen-inversion hook (T9) -------------------------------------
// The waterPhase system sets world.ui.underwater; this consumes it as a cheap
// DOM tint (a blue screen overlay). The real post/water effect is 01's render
// job (render/post.ts) — this hook is the seam so the flag is observable and
// screenshot-able now, before post owns it.

let tintEl: HTMLDivElement | null = null;

function updateWaterTint(world: WorldState): void {
  if (!world.ui.underwater) {
    if (tintEl) {
      tintEl.remove();
      tintEl = null;
    }
    return;
  }
  if (!tintEl) {
    tintEl = document.createElement('div');
    tintEl.id = 'underwater-tint';
    tintEl.style.cssText =
      'position:fixed;inset:0;z-index:20;pointer-events:none;' +
      'background:rgba(0,45,95,0.35);mix-blend-mode:screen;';
    document.body.appendChild(tintEl);
  }
}

// --- debug overlay (?debug URL flag, plan section 6) -------------------------

const DEBUG_FLAG = typeof location !== 'undefined' ? /[?&]debug/.test(location.search) : false;

let fpsSmooth = 60;
let lastFpsTick = 0;
let fpsFrames = 0;

export function updateDebugOverlay(world: WorldState): void {
  if (!DEBUG_FLAG) return;
  const el = document.getElementById('debug');
  if (!el) return;
  el.style.display = 'block';

  const now = performance.now();
  fpsFrames++;
  if (now - lastFpsTick >= 500) {
    fpsSmooth = (fpsSmooth * 0.7) + (fpsFrames * 1000 / Math.max(1, now - lastFpsTick)) * 0.3;
    fpsFrames = 0;
    lastFpsTick = now;
  }

  // draw-call / tris readout via the renderer's info (wired through main.ts)
  const info = debugInfoRef && debugInfoRef.current
    ? debugInfoRef.current
    : null;
  const dc = info ? info.render.calls : 0;
  const tris = info ? info.render.triangles : 0;

  el.textContent =
    `UNDERTOW\n` +
    `fps ~${fpsSmooth.toFixed(0)}\n` +
    `draw calls ${dc}\n` +
    `tris ${tris}\n` +
    `dread ${world.dread.toFixed(0)}`;
}

interface DebugInfoRef {
  current: { render: { calls: number; triangles: number } } | null;
}
export const debugInfoRef: DebugInfoRef = { current: null };

// --- update order (the contract) ---------------------------------------------

export const UPDATE_ORDER: SystemFn[] = [
  input,
  intent,
  updateTetherFishAI, // 02 round 2A: tethered-fight FSM — end of intent phase
  updateTetherConstraint, // 02: distance constraint — AFTER intent, BEFORE movement
  updateWaterPhase, // 02 T9: reads the post-pull position (trigger) + sets drift before movement
  updateTetherLog, // 02: playtest instrumentation — consumes the fresh event stream
  movement,
  collision,
  combat,
  dread,
  spawn,
  animation,
  renderSystem,
  ui,
];
