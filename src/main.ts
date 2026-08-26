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
import { initQaAnnotate, isQaPaused } from './ui/qaAnnotate';
import { initTitleScreen } from './ui/titleScreen';
import { applySavedOptions, initOptionsMenu } from './ui/optionsMenu';
import { initAudio } from './audio/engine';
import { toggleBestiary } from './ui/bestiaryScreen';
import { initHud } from './ui/hud';
import { applyRunStartPassives } from './loot/runStart';
import { gradeForXp } from './loot/license';
import { descend } from './run/descent';
import { hookDragger, swampBoat } from './systems/boatCombat';
import { lighthouseFoot } from './meta/hubStreet';
import { restore, restoredIds, startingDreadFor } from './meta/restoration';
import { unlockContextFor } from './meta/runMeta';
import { emitTownEvent, peekTownEvents } from './meta/townEvents';
import { townInstanceCount } from './render/town';
import { PHASE_LENGTH_S } from './game/clock';
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
  // M3 round 3 gate seams (tools/m3r3-probe.mjs): jump the Night Clock to a
  // phase (by moving the run epoch back — the clock is a pure function of
  // elapsed, so this is exactly "time passed"), hook a Dragger on demand,
  // swamp the hull, and descend a sinkhole.
  (window as unknown as { __setPhase: (p: string) => number }).__setPhase = (p: string) => {
    const idx = ['dusk', 'night', 'deepNight', 'falseDawn'].indexOf(p);
    const back = Math.max(0, idx) * PHASE_LENGTH_S + 1;
    world.run.startedAt = world.time.elapsed - back;
    world.clock.runStartMs = world.run.startedAt * 1000;
    return back;
  };
  (window as unknown as { __hookDragger: () => boolean }).__hookDragger = () => hookDragger(world);
  (window as unknown as { __swamp: () => void }).__swamp = () => swampBoat(world);
  (window as unknown as { __descend: () => number }).__descend = () => descend(world);
  (window as unknown as { __toSinkhole: () => unknown }).__toSinkhole = () => {
    const s = world.lake?.sinkholes[0];
    if (!s) return null;
    world.boat.x = s.mouth.x;
    world.boat.z = s.mouth.z;
    world.boat.speed = 0;
    return s;
  };
  // M5 gate seams (tools/m5-probe.mjs): read the town slice, inject Memories
  // through the same save write path the receipt uses, walk to the lighthouse
  // door, open/close the register, and pay for a building headlessly.
  (window as unknown as { __meta: () => unknown }).__meta = () => {
    const save = getSave();
    if (!save) return null;
    return {
      version: save.version,
      metaState: save.metaState,
      restored: restoredIds(save.metaState),
      startingDread: startingDreadFor(save.metaState),
      instances: townInstanceCount(),
      events: peekTownEvents(),
    };
  };
  (window as unknown as { __grantMemories: (n: number) => void }).__grantMemories = (n: number) => {
    void updateSave((s) => ({
      ...s,
      metaState: { ...s.metaState, memories: Math.max(0, s.metaState.memories + n) },
    }));
  };
  (window as unknown as { __toDoor: () => unknown }).__toDoor = () => {
    const lake = world.lake;
    if (!lake) return null;
    const iso = lake.islets[lake.startIslet];
    if (!iso) return null;
    const door = lighthouseFoot(iso);
    dockPlayer(world, lake.startIslet, { x: door.x, z: door.z });
    world.player.x = door.x;
    world.player.z = door.z;
    return door;
  };
  (window as unknown as { __openTown: (on: boolean) => void }).__openTown = (on: boolean) => {
    world.town.open = on;
  };
  (window as unknown as { __restore: (id: string) => unknown }).__restore = (id: string) => {
    const save = getSave();
    if (!save) return { ok: false, reason: 'no-save' };
    const out = restore(save.metaState, id, {
      atRun: save.meta.runsCompleted,
      ctx: unlockContextFor(save),
    });
    if (!out.ok) return { ok: false, reason: out.reason };
    if (out.event) emitTownEvent(out.event);
    void updateSave((s) => ({ ...s, metaState: out.meta }));
    return { ok: true, event: out.event };
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
// apply saved CIRCULAR 4 options on boot (render scale / murk / post / reel stance)
applySavedOptions();
// wire the renderer's info counters into the debug overlay
debugInfoRef.current = ctx.renderer.info;

// debug seam: also expose the live THREE scene + camera so scene-graph probes
// can read the loaded assets' tri counts / positions and reframe for close-ups.
if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) {
  (window as unknown as { __scene: unknown }).__scene = ctx.scene;
  (window as unknown as { __camera: unknown }).__camera = ctx.camera;
}

// QA annotate overlay (?qa / ?debug): Q freezes the sim, click pins a note
// carrying seed + tick + scene hit, written to qa-notes/ by the dev server.
initQaAnnotate(world);

// Diegetic HUD (corner chips + tension gauge) — shown in ALL modes, debug or not.
initHud();

// CIRCULAR 4 options menu: Esc opens/closes it in-game in every mode.
initOptionsMenu();

// Procedural audio (t13): binds the first-gesture unlock — browsers block an
// AudioContext built outside a real click. SCHEDULE B drives it from there.
initAudio();

// M2.5 shell: title screen + opening story cards over the live drifting lake
// (docs/story/title-menu.md / opening.md). Debug and gate paths (?debug, ?qa)
// boot straight into gameplay so every automated driver stays untouched.
if (!/[?&](debug|qa)\b/.test(search)) initTitleScreen();

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
  if (isQaPaused()) {
    // QA annotate holds the sim so a click resolves against the frame actually
    // on screen. Park the clock at `now` each frame so resuming doesn't replay
    // the pause as catch-up steps.
    world.time.lastReal = now;
  } else {
    runSimSteps(world.time, now, (dt) => {
      for (let s = 0; s < SIM_COUNT; s++) {
        const system = UPDATE_ORDER[s];
        if (system) system(world, dt);
      }
    });
  }
  // present at display rate regardless of sim steps
  for (let s = PRESENT_INDEX; s < UPDATE_ORDER.length; s++) {
    const system = UPDATE_ORDER[s];
    if (system) system(world, world.time.dt);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
