// INPUT — WORKER C OWNS THIS FILE.
// Raw key/mouse → InputState (plan 01 §1.2, task 5). The input system calls
// updateInput(world) each fixed step to fill world.input and resolve it into
// world.intent. The boat worker consumes the Intent. Plain module state.

import type { WorldState } from '../core/world';
import { startTetherFight, M2_SPECIES } from './tether';
import {
  nearestDockableIslet,
  dockPlayer,
  playerNearBoat,
  boardBoat,
  DOCK_RANGE,
} from '../gen/lakeWorld';

// --- raw device state (module-level, updated by listeners) -----------------

const held = new Set<string>();
let mouseX = 0;
let mouseY = 0;
let leftDown = false;
let rightDown = false;

// edge-triggered taps: true for the step where the key just became held
const tapFlags = new Map<string, boolean>();
// the key has already been reported as a tap while held (prevents repeat)
const tapConsumed = new Set<string>();

const KEY_CODE = new Map<string, string>([
  ['KeyW', 'up'],
  ['KeyS', 'down'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['Space', 'dodge'],
  ['KeyF', 'cut'],
  ['KeyE', 'land'], // M2 T6: accept the LAND prompt (clean catch)
  ['KeyB', 'mode'], // M1 scaffold: toggle world.mode (boat <-> foot)
  ['KeyT', 'tether'], // M2 scaffold: start a tether fight (foot mode)
  ['Digit1', 'lure1'],
  ['Digit2', 'lure2'],
  ['Digit3', 'lure3'],
]);

function onKeyDown(e: KeyboardEvent): void {
  const code = KEY_CODE.get(e.code);
  if (!code) return;
  // space / arrows scroll the page — stop that, but keep keys typeable
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!held.has(e.code)) tapFlags.set(e.code, true);
  held.add(e.code);
}

function onKeyUp(e: KeyboardEvent): void {
  held.delete(e.code);
  tapConsumed.delete(e.code);
}

function onBlur(): void {
  held.clear();
  tapFlags.clear();
  tapConsumed.clear();
  leftDown = false;
  rightDown = false;
}

function onMouseMove(e: MouseEvent): void {
  mouseX = e.clientX;
  mouseY = e.clientY;
}

function onMouseDown(e: MouseEvent): void {
  if (e.button === 0) leftDown = true;
  else if (e.button === 2) rightDown = true;
  e.preventDefault();
}

function onMouseUp(e: MouseEvent): void {
  if (e.button === 0) leftDown = false;
  else if (e.button === 2) rightDown = false;
}

let wired = false;

export function initInput(el?: HTMLElement | null): void {
  if (wired) return;
  wired = true;
  const t = el || (typeof window !== 'undefined' ? window : null);
  if (!t) return;
  t.addEventListener('keydown', onKeyDown as EventListener);
  t.addEventListener('keyup', onKeyUp as EventListener);
  t.addEventListener('blur', onBlur as EventListener);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
}

function axisFrom(neg: boolean, pos: boolean): number {
  return (pos ? 1 : 0) - (neg ? 1 : 0);
}

function consumeTap(code: string): boolean {
  if (tapFlags.get(code)) {
    tapFlags.delete(code);
    tapConsumed.add(code);
    return true;
  }
  return false;
}

export function updateInput(world: WorldState): void {
  // raw state
  world.input.keys = new Set(held);
  world.input.mouseX = mouseX;
  world.input.mouseY = mouseY;
  world.input.mouseDown = leftDown;

  const up = held.has('KeyW') || held.has('ArrowUp');
  const down = held.has('KeyS') || held.has('ArrowDown');
  const left = held.has('KeyA') || held.has('ArrowLeft');
  const right = held.has('KeyD') || held.has('ArrowRight');

  // normalize diagonal movement (WASD/arrows)
  const mx = axisFrom(left, right);
  const my = axisFrom(down, up);
  const len = Math.hypot(mx, my) || 1;

  const intent = world.intent;
  intent.moveX = mx / len;
  intent.moveY = my / len;

  // held actions (gaff light / heavy-hold need held state)
  intent.primary = leftDown;
  intent.secondary = rightDown || held.has('ShiftLeft') || held.has('ShiftRight');

  // edge-triggered taps (dodge, lures)
  intent.dodge = consumeTap('Space');
  intent.lure1 = consumeTap('Digit1');
  intent.lure2 = consumeTap('Digit2');
  intent.lure3 = consumeTap('Digit3');

  // LAND is a contextual prompt press (E) — a tap, not a hold (plan 02 §5.5).
  intent.acceptLand = consumeTap('KeyE');

  // CUT is a HOLD action (hold F 0.5s, plan 02 §5.4), not a tap: level, so the
  // tether cut ring charges while the key is held and resets on release.
  intent.cut = held.has('KeyF');

  // EXTRACT is a HOLD too: hold E 1.5s at a live buoy to end the run (03 §7.2).
  // E also tap-fires LAND during a tether fight — the contexts never overlap
  // (extraction is a boat verb, LAND is a foot verb).
  intent.extract = held.has('KeyE');

  // screen-space aim (raw pixels; fine for M0)
  intent.aimX = mouseX;
  intent.aimY = mouseY;

  // M3: B docks / un-docks. In boat mode, approach within ~2m of a walkable
  // islet's edge + B → foot mode on that islet. On foot, B near the parked boat
  // → back aboard. (This replaces the M1 debug mode toggle; the '?mode=foot' URL
  // param handles the debug boot path.)
  if (consumeTap('KeyB')) {
    if (world.mode === 'boat') {
      const iso = nearestDockableIslet(world, world.boat.x, world.boat.z, DOCK_RANGE);
      if (iso) dockPlayer(world, iso.id);
    } else if (playerNearBoat(world, DOCK_RANGE)) {
      boardBoat(world);
    }
  }

  // M2 scaffold temp hook (plan 02 §12): T in foot mode starts a tether fight
  // with the existing M1 fish (anchor 'entity', player side). The fish's M1 AI
  // keeps running — real tether AI is round 2. No-op while a fight is active.
  if (
    consumeTap('KeyT') &&
    world.mode === 'foot' &&
    world.fish &&
    world.tether.fights.length === 0
  ) {
    startTetherFight(world, M2_SPECIES, 'player');
  }
}
