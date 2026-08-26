// BARK TOAST (ui) — plan 05 §1.5, task t19 slice 2. The municipal-note toast a
// returned resident's doorstep bark is shown in: a small parchment note at the
// bottom-center, just above the tension gauge slot, that auto-fades after ~4 s
// and never stacks (a second bark replaces the current toast rather than piling
// up). DOM only — the sim schedules the bark (systems/barks.ts sets
// world.town.pendingBark); this presents it and clears the slot.
//
// In the same paper-and-stamps idiom as the restoration register and the
// trinket invoice: parchment ground, ledger margins, Office voice.

import type { WorldState } from '../core/world';

let toastEl: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

const BARK_LINGER_MS = 4000;
const FADE_MS = 600;

const STYLE = `
  #bark-toast {
    position: fixed; left: 50%; bottom: 170px; transform: translateX(-50%) rotate(-0.4deg);
    z-index: 45; width: 420px; max-width: 90vw;
    background: #efe4c8;
    background-image:
      linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
    background-size: 22px 22px;
    border: 1px solid #4a3a26;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(110, 82, 42, 0.08);
    padding: 10px 14px 9px;
    font: 11px/1.5 ui-monospace, 'Courier New', monospace;
    color: #3a2c1a;
    opacity: 1;
    transition: opacity ${FADE_MS}ms ease;
    pointer-events: none; user-select: none;
  }
  #bark-toast .bark-resident {
    font-size: 9px; letter-spacing: 0.18em; color: #7a2014; font-weight: bold;
    border-bottom: 1px solid rgba(106, 86, 56, 0.45); padding-bottom: 3px; margin-bottom: 5px;
  }
  #bark-toast .bark-text { font-size: 11px; line-height: 1.5; color: #241c12; }
  #bark-toast .bark-mask {
    margin-top: 5px; font-size: 8px; letter-spacing: 0.2em; color: #7a2014; text-align: right;
  }
`;

function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
}

function clearFadeTimer(): void {
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

// The one parchment note, rendered. Title bar, body, optional stamp. Never
// stacks: a second call replaces what is in the element rather than piling up.
function renderToast(title: string, body: string, stamp: string | null): void {
  if (typeof document === 'undefined') return;
  ensureStyle();
  clearFadeTimer();

  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'bark-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = '';
  const head = document.createElement('div');
  head.className = 'bark-resident';
  head.textContent = title;
  const text = document.createElement('div');
  text.className = 'bark-text';
  text.textContent = body;
  toastEl.appendChild(head);
  toastEl.appendChild(text);
  if (stamp) {
    const mask = document.createElement('div');
    mask.className = 'bark-mask';
    mask.textContent = stamp;
    toastEl.appendChild(mask);
  }
  toastEl.style.opacity = '1';
  toastEl.style.display = 'block';

  fadeTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0';
    fadeTimer = setTimeout(() => {
      if (toastEl) toastEl.style.display = 'none';
    }, FADE_MS);
  }, BARK_LINGER_MS);
}

// Present (or replace) the toast.
export function showBarkToast(bark: WorldState['town']['pendingBark']): void {
  if (!bark) return;
  renderToast(
    bark.residentName.toUpperCase(),
    bark.text,
    bark.maskSlipping ? 'THE WATER IS REDDER TODAY.' : null,
  );
}

// 05 §2.2 — a Snatcher moment line, in the SAME note the doorstep barks use.
// It is the same object the player already reads mid-fight, so the second mouth
// speaks in the Office's paper voice rather than inventing a HUD element for
// itself. The stamp is the Schedule 6-S line the bible stamps contested
// salvage with (docs/story/township.md §7, note-z3-04).
const SNATCHER_STAMP = 'PARTITION APPROVED';

let lastMoment: { title: string; text: string } | null = null;

export function showMomentToast(moment: WorldState['township']['pendingMoment']): void {
  if (!moment) return;
  lastMoment = { title: moment.title, text: moment.text };
  renderToast(moment.title, moment.text, SNATCHER_STAMP);
}

// Probe/gate readout: what the note ACTUALLY says right now. The sim's
// `pendingMoment` is consumed by this overlay within a frame of being parked,
// so it is never what an outside observer can read — the same reason
// envTextOverlay exposes `envTextOnScreen()`.
export function snatcherToastOnScreen(): { visible: boolean; title: string; text: string } {
  const el = toastEl;
  const visible = !!el && el.style.display !== 'none' && el.style.opacity !== '0';
  return {
    visible: visible && lastMoment !== null,
    title: lastMoment ? lastMoment.title : '',
    text: lastMoment ? lastMoment.text : '',
  };
}

// The ui-system entry point: consume world.town.pendingBark into the toast.
// When the sim parks a new bark while one is fading, it replaces in place.
export function updateBarkOverlay(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const pending = world.town.pendingBark;
  if (pending) {
    showBarkToast(pending);
    world.town.pendingBark = null;
  }
  // A Snatcher moment outranks a doorstep bark — it fires mid-fight, and the
  // two can never be live at once anyway (barks are a hub verb, the Snatcher is
  // a zone-3 fight verb). Consumed second so it wins the element if they are.
  const moment = world.township.pendingMoment;
  if (moment) {
    showMomentToast(moment);
    world.township.pendingMoment = null;
  }
}

export function dismissBarkOverlay(): void {
  lastMoment = null;
  if (toastEl) {
    toastEl.remove();
    toastEl = null;
  }
  clearFadeTimer();
}