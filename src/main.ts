// main.ts — boot (plan 01 §1.3). Create world, renderer/scene/camera, start the
// fixed-timestep loop running UPDATE_ORDER, render at vsync, handle resize.

import { createWorld } from './core/world';
import { UPDATE_ORDER, debugInfoRef } from './core/systems';
import { parseTimescale, frameSimSteps } from './core/time';
import { createRenderer, resizeRenderer } from './render/renderer';
import { initInput } from './game/input';
import { ensureLake, spawnAtLakeStart, dockPlayer } from './gen/lakeWorld';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app container');

// Wire raw keyboard/mouse listeners (game/input.ts) — the input system reads
// them each fixed step. Without this, world.input/intent stay all-zero.
// (no arg → the module falls back to window)
initInput();

// Run seed: '?seed=N' pins it for reproducible screenshots/gates, otherwise a
// fresh random run (plan 03 §1.3 — the only non-deterministic step of a run).
const search = typeof location !== 'undefined' ? location.search : '';
function parseRunSeed(q: string): number {
  const m = /[?&]seed=(\d+)/.exec(q);
  if (m) return Number(m[1]) >>> 0;
  return (Math.random() * 2 ** 32) >>> 0;
}

const world = createWorld(parseRunSeed(search));

// M3: the run's world is real — generate the lake and start aboard the boat
// near the lighthouse islet (task scope 5). The camera follows the boat as before.
ensureLake(world);
spawnAtLakeStart(world);

// ?timescale=N gate-driver hook (debug only): run N fixed steps per rAF frame
// so automated gates play faster than real time. FIXED_DT is untouched, so all
// spec timings and determinism are preserved. Default 1 = production path.
world.time.timescale = parseTimescale(search);

// M3 scaffold: '?mode=foot' URL param boots straight into foot mode — the
// keeper is docked onto the lighthouse islet (the boat stays parked beside it).
if (/[?&]mode=foot/.test(search)) {
  const start = world.lake!.islets[world.lake!.startIslet]!;
  dockPlayer(world, world.lake!.startIslet, { x: start.center.x, z: start.center.z });
}

// '?debug' drivability seam (M1 gate): expose the live world on window so the
// automated fight driver (tools/fight.mjs) can read and verify combat state.
if (/[?&]debug/.test(search)) {
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
const SIM_COUNT = 12; // input..animation (before render); includes fishAI + waterPhase + tetherLog
const PRESENT_INDEX = SIM_COUNT; // render, ui

function frame(now: number): void {
  const simSteps = frameSimSteps(world.time, now);
  for (let i = 0; i < simSteps; i++) {
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
