// INPUT — WORKER C OWNS THIS FILE.
// Raw key/mouse → InputState (plan 01 §1.2, task 5). The input system calls
// updateInput(world) each fixed step to fill world.input and resolve it into
// world.intent. The boat worker consumes the Intent. Plain module state.

import type { WorldState } from '../core/world';

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
  ['KeyB', 'mode'], // M1 scaffold: toggle world.mode (boat <-> foot)
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

  // edge-triggered taps (dodge, cut, lures)
  intent.dodge = consumeTap('Space');
  intent.cut = consumeTap('KeyF');
  intent.lure1 = consumeTap('Digit1');
  intent.lure2 = consumeTap('Digit2');
  intent.lure3 = consumeTap('Digit3');

  // screen-space aim (raw pixels; fine for M0)
  intent.aimX = mouseX;
  intent.aimY = mouseY;

  // M1 scaffold: B toggles boat <-> foot (debug mode switch; the real drive is
  // the '?mode=foot' URL param at boot and 03's map worker later).
  if (consumeTap('KeyB')) {
    world.mode = world.mode === 'boat' ? 'foot' : 'boat';
  }
}
