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
import { constrainToCircle, separateCircles } from './collision';

export type SystemFn = (world: WorldState, dt: number) => void;

// --- stubs / reserved slots (owned by other workers) ----------------------

function tetherConstraint(_w: WorldState, _dt: number): void {
  // RESERVED (02): distance constraint. Runs AFTER intent, BEFORE movement.
}

function dread(_w: WorldState, _dt: number): void {
  // RESERVED (05): Dread value; value lives on world.dread.
}

function spawn(world: WorldState, dt: number): void {
  // M1: spawn the single hardcoded fish once, then run its land AI. WORKER C
  // fills both (game/fish.ts); spawnFish is a no-op until then.
  if (!world.fish) spawnFish(world);
  updateFishAI(world, dt);
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
    world.player.x += world.player.vx * dt;
    world.player.z += world.player.vz * dt;
  }
}

export function collision(world: WorldState, _dt: number): void {
  // M1 land collision (foot mode only): keep the player and fish inside the
  // islet boundary, and keep a live fish off the player's circle. Shared
  // infrastructure owned by the M1 scaffold (pure math in core/collision.ts).
  if (world.mode !== 'foot') return;
  const g = world.ground;
  const p = world.player;

  const pc = constrainToCircle({ x: p.x, z: p.z, radius: p.radius }, g);
  p.x = pc.x;
  p.z = pc.z;

  const f = world.fish;
  if (f) {
    const fc = constrainToCircle({ x: f.x, z: f.z, radius: f.radius }, g);
    f.x = fc.x;
    f.z = fc.z;
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
  tetherConstraint,
  movement,
  collision,
  combat,
  dread,
  spawn,
  animation,
  renderSystem,
  ui,
];
