// ENVIRONMENTAL TEXT OVERLAY (ui) — plan 05 §4.3, M7 round 1.
//
// The bark toast's quieter cousin. Same parchment idiom (so the drowned town
// speaks in the same municipal paper the hub does) with three deliberate
// differences: NO SPEAKER line (signage does not address you), dimmer and
// smaller (it is a thing you noticed, not a thing you were told), and it sits
// higher up the screen so a bark and a sign can be on at once without stacking.
//
// DOM only — zero draw-call cost (plan §4.3 "overlays are DOM, not canvas").
// The sim (systems/envText.ts) parks the line; this presents it and clears the
// slot, exactly as barkOverlay does.

import type { WorldState } from '../core/world';

let el: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
let curKey = '';

const LINGER_MS = 5200;
const FADE_MS = 900;

const STYLE = `
  #env-text {
    position: fixed; left: 50%; bottom: 236px; transform: translateX(-50%) rotate(-0.25deg);
    z-index: 44; max-width: 460px;
    background: rgba(226, 214, 186, 0.82);
    border: 1px solid rgba(74, 58, 38, 0.55);
    border-left: 3px solid rgba(122, 32, 20, 0.5);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    padding: 7px 13px 6px;
    font: italic 11px/1.55 Georgia, 'Times New Roman', serif;
    letter-spacing: 0.04em;
    color: #3a2c1a;
    opacity: 0.86;
    transition: opacity ${FADE_MS}ms ease;
    pointer-events: none; user-select: none;
  }
`;

function ensureDom(): void {
  if (el || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
  el = document.createElement('div');
  el.id = 'env-text';
  el.style.display = 'none';
  document.body.appendChild(el);
}

function clearFadeTimer(): void {
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

/** Present (or replace) the parchment line. Never stacks. */
export function showEnvText(text: string): void {
  if (!text || typeof document === 'undefined') return;
  ensureDom();
  clearFadeTimer();
  el!.textContent = text;
  el!.style.display = 'block';
  el!.style.opacity = '0.86';
  fadeTimer = setTimeout(() => {
    if (el) el.style.opacity = '0';
    fadeTimer = setTimeout(() => {
      if (el) el.style.display = 'none';
    }, FADE_MS);
  }, LINGER_MS);
}

/** The ui-system entry point: consume world.township.pendingEnv into the toast. */
export function updateEnvTextOverlay(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const pending = world.township.pendingEnv;
  if (!pending) return;
  curKey = pending.key;
  showEnvText(pending.text);
  world.township.pendingEnv = null;
}

/** Test/probe seam: the line currently on screen (empty when nothing is up). */
export function envTextOnScreen(): { key: string; text: string; visible: boolean } {
  const visible = !!el && el.style.display !== 'none' && el.style.opacity !== '0';
  return { key: visible ? curKey : '', text: visible ? (el?.textContent ?? '') : '', visible };
}

export function dismissEnvText(): void {
  clearFadeTimer();
  if (el) {
    el.remove();
    el = null;
  }
  curKey = '';
}
