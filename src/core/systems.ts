// Systems — pure functions over WorldState, run in fixed order (plan 01 §2.3,
// spec 8.3). Order is the contract: a system must not depend on a later system
// having run. `render` is the only system that touches Three directly.

import type { WorldState } from './world';
import { render } from '../render/renderer';
import { updateInput } from '../game/input';
import { updateController } from '../game/controller';
import { updateStamina } from '../game/stamina';
import { updateCombat } from '../game/combat';
import { animateFish } from '../game/fish';
import { updateTetherFishAI } from '../game/fishAI';
import { updateWaterPhase, WATER_DAMP } from '../game/waterPhase';
import { constrainToCircle, separateCircles } from './collision';
import { constrainCircleInConvex } from './poly';
import { dockedIslet } from '../gen/lakeWorld';
import { stepBoatKinematics, stepBoatMovement } from '../game/boatPhysics';
import { phaseAt, runElapsedMs } from '../game/clock';
import { tierFor } from '../game/dread';
import { updateTetherConstraint } from '../game/tetherConstraint';
import { splashFx } from '../game/splashFx';
import { updateTetherLog } from '../playtest/tetherLog';
import { updateDebugPanel } from '../ui/debugPanel';
import { updateCastFlow } from '../systems/castFlow';
import { updateDreadSystem } from '../systems/dreadSystem';
import { updateSpawnDirectorSystem } from '../systems/spawnDirector';
import { updateNightClockSystem } from '../systems/nightClockSystem';
import { updateBoatCombat } from '../systems/boatCombat';
import { updateDescent } from '../systems/descent';
import { updateTownDoor } from '../systems/townDoor';
import { updateBottledLight } from '../systems/bottledLight';
import { updateBarks } from '../systems/barks';
import { updateRunTerminal } from '../systems/runTerminal';
import { updateCastPrompt, updateDescentPrompt } from '../ui/castPrompt';
import { updateFightTutorial } from '../ui/fightTutorial';
import { updateRestorationUI } from '../ui/restorationUI';
import { updateBarkOverlay } from '../ui/barkOverlay';
import { updateHud } from '../ui/hud';
import { updateBestiaryToggle } from '../ui/bestiaryScreen';
import { updateAudio } from '../audio/engine';

export type SystemFn = (world: WorldState, dt: number) => void;

// --- stubs / reserved slots (owned by other workers) ----------------------

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
  // Boat kinematics (heading/speed from intent) belong to the intent phase too,
  // per fixed step: they used to run inside the render pass (game/boat.ts),
  // which stepped them once per DISPLAY frame — boat acceleration/turn rate
  // then scaled with the display refresh rate and broke determinism (and
  // ?timescale runs got 1 kinematics step per N movement steps). movement stays
  // pure position integration.
  if (world.mode === 'boat') stepBoatKinematics(world.boat, world.intent, dt);
}

export function movement(world: WorldState, dt: number): void {
  // Boat (M0): integrate position from heading/speed, resolving islet/wreck/buoy
  // obstacles at the integration point (task T4 — see stepBoatMovement). Only in
  // boat mode — the boat stays parked while on foot (M1 scaffold). Heading/speed
  // themselves advance in the intent phase (stepBoatKinematics), per fixed step.
  if (world.mode === 'boat') {
    stepBoatMovement(world, dt);
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
  // M1/M3 collision (foot mode): keep the player and fish on the walkable islet
  // the player is docked to (the procedural lake's islet hull — plan 03 §2.6
  // "collision uses the convex hull approximation"), and keep a live fish off
  // the player's circle. When no lake is generated (legacy debug world) the M1
  // ground circle is the fallback. The boat has NO branch here: its obstacle
  // response (islets/wrecks/buoys, slide + thud) is resolved at the movement
  // integration point in stepBoatMovement (task T4), so it stays in sync with
  // the fixed-step position integration.
  //
  // T9 water-phase hooks:
  //  - a hooked fish (tether fight active) is IN the water — it is not clamped
  //    to the islet, so a routed drag can pull the pair past the shoreline
  //    (the source of the water-phase trigger);
  //  - a submerged player is swimming in the deep — collision stops clamping
  //    them back to the shore (waterPhase exits when they reach it).

  // Boat mode: the foot collision below does not apply (the player is aboard);
  // the boat's own obstacle response runs in the movement system via
  // stepBoatMovement (task T4), so this system stays a no-op for the boat.
  if (world.mode === 'boat') return;

  const g = world.ground;
  const p = world.player;
  const under = world.water.active;
  const tethered = world.tether.fights.length > 0;
  const iso = dockedIslet(world);

  if (!under) {
    if (iso) {
      const pc = constrainCircleInConvex({ x: p.x, z: p.z, radius: p.radius }, iso.hull);
      p.x = pc.x;
      p.z = pc.z;
    } else {
      const pc = constrainToCircle({ x: p.x, z: p.z, radius: p.radius }, g);
      p.x = pc.x;
      p.z = pc.z;
    }
  }

  const f = world.fish;
  if (f) {
    if (!tethered) {
      if (iso) {
        const fc = constrainCircleInConvex({ x: f.x, z: f.z, radius: f.radius }, iso.hull);
        f.x = fc.x;
        f.z = fc.z;
      } else {
        const fc = constrainToCircle({ x: f.x, z: f.z, radius: f.radius }, g);
        f.x = fc.x;
        f.z = fc.z;
      }
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
  tickFps();
  updateBuildBadge();
  updateDebugOverlay(world);
  updateDebugPanel(world);
  updateWaterTint(world);
  updateHud(world);
  updateCastPrompt(world);
  updateDescentPrompt(world);
  updateFightTutorial(world);
  updateRestorationUI(world);
  updateBarkOverlay(world);
  updateBestiaryToggle(world);
  updateAudio(world, _dt); // t13: procedural audio — reads world, never writes
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
let fpsDirty = false;

// Runs every display frame from the ui system (debug or not) so both the
// debug overlay and the corner build badge share one fps estimate.
function tickFps(): void {
  if (typeof performance === 'undefined') return;
  const now = performance.now();
  fpsFrames++;
  if (now - lastFpsTick >= 500) {
    fpsSmooth = (fpsSmooth * 0.7) + (fpsFrames * 1000 / Math.max(1, now - lastFpsTick)) * 0.3;
    fpsFrames = 0;
    lastFpsTick = now;
    fpsDirty = true;
  }
}

// Build date + fps, top-right, grey and subtle (styled in index.html).
// __BUILD_DATE__ is a vite define; absent under vitest, so guard via typeof.
declare const __BUILD_DATE__: string;
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';

function updateBuildBadge(): void {
  if (!fpsDirty || typeof document === 'undefined') return;
  fpsDirty = false;
  const el = document.getElementById('buildinfo');
  if (el) el.textContent = `Build: ${BUILD_DATE} · ${Math.round(fpsSmooth)} fps`;
}

export function updateDebugOverlay(world: WorldState): void {
  if (!DEBUG_FLAG) return;
  const el = document.getElementById('debug');
  if (!el) return;
  el.style.display = 'block';

  // draw-call / tris readout via the renderer's info (wired through main.ts)
  const info = debugInfoRef && debugInfoRef.current
    ? debugInfoRef.current
    : null;
  const dc = info ? info.render.calls : 0;
  const tris = info ? info.render.triangles : 0;

  // 03 run-loop readouts: clock phase, Dread tier, disturbance count
  const phase = world.run
    ? phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed))
    : 'dusk';
  const runSec = world.run ? Math.max(0, world.time.elapsed - world.run.startedAt) : 0;
  const mm = Math.floor(runSec / 60);
  const ss = Math.floor(runSec % 60);

  el.textContent =
    `UNDERTOW\n` +
    `seed ${world.seed}\n` +
    `fps ~${fpsSmooth.toFixed(0)}\n` +
    `draw calls ${dc}\n` +
    `tris ${tris}\n` +
    `dread ${world.dread.toFixed(0)} (tier ${tierFor(world.dread)})\n` +
    `phase ${phase} · run ${mm}:${ss.toString().padStart(2, '0')}\n` +
    `ripples ${world.disturbances.length} · haul ${world.run?.haul.length ?? 0}\n` +
    `zone ${world.run?.zone ?? 1} (floor ${world.run?.zoneFloor ?? 0}) · descents ${world.run?.sinkholesDescended ?? 0}\n` +
    `hull ${world.boatCombat.hull.hp.toFixed(0)}/${world.boatCombat.hull.maxHp} ` +
    `(${world.boatCombat.hull.segments} seg)${world.boatCombat.active ? ' · DRAGGER' : ''}` +
    `${world.boatCombat.swamped ? ' · SWAMPED' : ''}`;
}

interface DebugInfoRef {
  current: { render: { calls: number; triangles: number } } | null;
}
export const debugInfoRef: DebugInfoRef = { current: null };

// --- update order (the contract) ---------------------------------------------

export const UPDATE_ORDER: SystemFn[] = [
  input,
  intent,
  updateCastFlow, // 03 §3: cast/bite/prompt (after intent, before the tether constraint)
  updateTetherFishAI, // 02 round 2A: tethered-fight FSM — end of intent phase
  updateTetherConstraint, // 02: distance constraint — AFTER intent, BEFORE movement
  splashFx, // T10: combat splash FX — steps the pool + consumes the fresh event stream sim-side
  updateWaterPhase, // 02 T9: reads the post-pull position (trigger) + sets drift before movement
  updateTetherLog, // 02: playtest instrumentation — consumes the fresh event stream
  movement,
  collision,
  combat,
  updateBoatCombat, // 03 §6: night Dragger fight — hull damage, cleat cut, swamp
  updateDreadSystem, // 03 §4: run reducer (haul + Dread gains) + peak + tier hooks
  updateSpawnDirectorSystem, // 03 §9: disturbance budget refill + M1 land-fish scaffold
  updateNightClockSystem, // 03 §5: phase one-shots (buoy submergence, refill cadence)
  updateDescent, // 03 §2.5: sinkhole descent (zoneFloor rises; the clock does not reset)
  updateTownDoor, // 05 §1.1: the lighthouse-door hold that opens the restoration ledger
  updateBottledLight, // 05 §1.7: L pops a Bottled Light — tension reset + full stamina
  updateBarks, // 05 §1.5: restored residents' doorstep barks (proximity + cooldown)
  animation,
  updateRunTerminal, // 03 §7: extraction / death / run summary — a SIM system (timers scale)
  renderSystem,
  ui,
];

// The sim/present split: every system up to (and including) the run terminal
// advances on fixed sim steps; render + ui present once per display frame.
// main.ts derives its SIM_COUNT from this index so new sim systems are not left
// running once-per-frame by a stale hardcoded count.
export const SIM_SYSTEMS = UPDATE_ORDER.indexOf(renderSystem);
