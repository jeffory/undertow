// main.ts — boot (plan 01 §1.3). Create world, renderer/scene/camera, start the
// fixed-timestep loop running UPDATE_ORDER, render at vsync, handle resize.

import { createWorld, FOOT_SPAWN } from './core/world';
import { UPDATE_ORDER, debugInfoRef } from './core/systems';
import { advanceClock } from './core/time';
import { createRenderer, resizeRenderer } from './render/renderer';
import { initInput } from './game/input';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app container');

// Wire raw keyboard/mouse listeners (game/input.ts) — the input system reads
// them each fixed step. Without this, world.input/intent stay all-zero.
// (no arg → the module falls back to window)
initInput();

const world = createWorld(1);

// M1 scaffold: '?mode=foot' URL param boots straight into foot mode (debug
// ground islet + player). The B key toggles mode live (input.ts). The player
// spawns off the parked boat so the two don't overlap on the debug islet.
if (typeof location !== 'undefined' && /[?&]mode=foot/.test(location.search)) {
  world.mode = 'foot';
  world.player.x = FOOT_SPAWN.x;
  world.player.z = FOOT_SPAWN.z;
}

// '?debug' drivability seam (M1 gate): expose the live world on window so the
// automated fight driver (tools/fight.mjs) can read and verify combat state.
if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) {
  (window as unknown as { __world: unknown }).__world = world;
}

const ctx = createRenderer(app);
// wire the Three renderer's info counters into the debug overlay
debugInfoRef.current = ctx.renderer.info;

// debug seam: also expose the live THREE scene + camera so scene-graph probes
// can read the loaded assets' tri counts / positions and reframe for close-ups.
if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) {
  (window as unknown as { __scene: unknown }).__scene = ctx.scene;
  (window as unknown as { __camera: unknown }).__camera = ctx.camera;
}

window.addEventListener('resize', () => resizeRenderer(ctx.renderer));

// sim systems run at fixed DT; render+ui run once per display frame (plan 01 §3.4)
const SIM_COUNT = 9; // input..animation (before render)
const PRESENT_INDEX = SIM_COUNT; // render, ui

function frame(now: number): void {
  const steps = advanceClock(world.time, now);
  for (let i = 0; i < steps; i++) {
    for (let s = 0; s < SIM_COUNT; s++) {
      const system = UPDATE_ORDER[s];
      if (system) system(world, world.time.dt);
    }
  }
  // present at display rate regardless of sim steps
  for (let s = PRESENT_INDEX; s < UPDATE_ORDER.length; s++) {
    const system = UPDATE_ORDER[s];
    if (system) system(world, world.time.dt);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
