// main.ts — boot (plan 01 §1.3). Create world, renderer/scene/camera, start the
// fixed-timestep loop running UPDATE_ORDER, render at vsync, handle resize.

import { createWorld } from './core/world';
import { UPDATE_ORDER, SIM_SYSTEMS, debugInfoRef } from './core/systems';
import { parseTimescale, runSimSteps } from './core/time';
import { createRenderer, resizeRenderer, currentRenderContext } from './render/renderer';
import { initInput } from './game/input';
import { ensureLake, spawnAtLakeStart, dockPlayer } from './gen/lakeWorld';
import { initRun } from './run/run';
import { initSaveSystem, getSave, updateSave } from './core/save';
import { initSavePanel } from './ui/savePanel';
import { toggleBestiary } from './ui/bestiaryScreen';
import { applyRunStartPassives } from './loot/runStart';
import { gradeForXp } from './loot/license';
import * as THREE from 'three';

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

// M3: the run's world is real — generate the lake, start aboard the boat near
// the lighthouse islet, and stamp the run (clock epoch + initial ripple field).
ensureLake(world);
spawnAtLakeStart(world);
initRun(world);

// Load the save on boot (task t12 #5): IndexedDB row → zod-validated SaveGame.
// Once it's in hand, apply the run-start passives (license + equipped trinkets)
// to the fresh boot world.
void initSaveSystem().then(() => applyRunStartPassives(world));

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
  // scene handle for QA drivers (object inventory / stray-geometry hunts)
  (window as unknown as { __scene: unknown }).__scene = currentRenderContext()?.scene ?? null;
  // the save panel (export/import) + the run-loop probe seams
  initSavePanel();
  (window as unknown as { __save: () => unknown }).__save = () => getSave();
  // M4 gate seams: open the bestiary ledger; push the license over a threshold
  // (drives the grade-up letter screenshot); force a sundry on every land.
  (window as unknown as { __bestiary: () => void }).__bestiary = () => toggleBestiary(world);
  (window as unknown as { __setLicenseXp: (xp: number) => void }).__setLicenseXp = (xp: number) => {
    void updateSave((s) => ({ ...s, license: { xp, grade: gradeForXp(xp) } }));
  };
  (window as unknown as { __setForceDrop: (on: boolean) => void }).__setForceDrop = (on: boolean) => {
    world.run.forceDrop = on;
  };
  (window as unknown as { __toScreen: (x: number, z: number) => { x: number; y: number } }).__toScreen =
    (x: number, z: number) => {
      const ctx = currentRenderContext();
      if (!ctx) return { x: 0, y: 0 };
      const v = new THREE.Vector3(x, 0, z).project(ctx.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    };
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

// sim systems run at fixed DT; render+ui run once per display frame (plan 01
// §3.4). The sim/present split is derived from UPDATE_ORDER (SIM_SYSTEMS = the
// index of the render system) so newly-added sim systems (castFlow, the run
// terminal, …) always advance on fixed steps — never stuck once-per-frame.
const SIM_COUNT = SIM_SYSTEMS;
const PRESENT_INDEX = SIM_COUNT;

function frame(now: number): void {
  // runSimSteps advances world.time.elapsed per fixed step (not per display
  // frame), so elapsed-sampling systems behave identically however the steps
  // batch into frames (determinism, spec 8.3).
  runSimSteps(world.time, now, (dt) => {
    for (let s = 0; s < SIM_COUNT; s++) {
      const system = UPDATE_ORDER[s];
      if (system) system(world, dt);
    }
  });
  // present at display rate regardless of sim steps
  for (let s = PRESENT_INDEX; s < UPDATE_ORDER.length; s++) {
    const system = UPDATE_ORDER[s];
    if (system) system(world, world.time.dt);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
