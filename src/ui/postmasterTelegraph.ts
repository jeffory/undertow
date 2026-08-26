// THE POSTMASTER'S SPEECH BUBBLE + HOLD PROMPTS (ui) — plan 05 §2.2 / task t29.
//
// "His dialogue appears in courteous, municipal speech bubbles above his head"
// (docs/story/township.md §5). So it is not a HUD banner and not a bottom-centre
// toast: it is a PARCHMENT BUBBLE, with a tail, pinned over the man himself —
// projected from his world position through the live camera each display frame.
//
// It is the castPrompt/bark visual family, boss-voiced: the same paper ground,
// ledger grid and Office red the restoration register, the trinket invoice and
// the doorstep barks are drawn in, so the boss speaks in the same voice the town
// does. Nothing here is a new idiom; what is new is only WHERE it hangs.
//
// Two prompts share the file because they are the same verb (hold E) at the two
// ends of the encounter: the letterbox that summons him, and the reach that cuts
// his line. They are drawn in the descent-prompt shape (a filling bar = a
// commitment), which is what the keeper already reads a hold as.
//
// DOM only. The sim owns every number (world.postmaster); this presents them.

import type { WorldState } from '../core/world';
import { currentRenderContext } from '../render/renderer';
import { postmasterBubbleAnchor } from '../render/postmaster';
import {
  CUT_REACH,
  SUMMON_PHASES,
  cutArmed,
  cutProgress,
  postmasterFighting,
  summonProgress,
} from '../bosses/postmaster';
import { postmasterArena, atLetterbox } from '../systems/postmaster';
import { postmasterLineFor, POSTMASTER_TITLE } from '../content/postmasterLines';
import { currentPhase } from '../run/reducer';

let styleEl: HTMLStyleElement | null = null;
let bubbleEl: HTMLDivElement | null = null;
let bubbleText: HTMLDivElement | null = null;
let promptEl: HTMLDivElement | null = null;
let promptTitle: HTMLDivElement | null = null;
let promptHint: HTMLDivElement | null = null;
let promptFill: HTMLDivElement | null = null;

const STYLE = `
  #pm-bubble {
    position: fixed; z-index: 46; transform: translate(-50%, -100%);
    max-width: 340px; padding: 9px 14px 8px;
    background: #efe4c8;
    background-image:
      linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
    background-size: 22px 22px;
    border: 1px solid #4a3a26;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    font: 13px/1.35 ui-monospace, 'Courier New', monospace;
    color: #241c12; letter-spacing: 0.09em; text-align: center;
    pointer-events: none; user-select: none;
  }
  #pm-bubble .pm-who {
    font-size: 8px; letter-spacing: 0.22em; color: #7a2014; font-weight: bold;
    border-bottom: 1px solid rgba(106, 86, 56, 0.45); padding-bottom: 3px; margin-bottom: 5px;
  }
  #pm-bubble .pm-line { font-weight: bold; }
  #pm-bubble.pm-courtesy .pm-line { font-weight: normal; opacity: 0.86; }
  /* the tail: a paper corner pointing down at the man who said it */
  #pm-bubble::after {
    content: ''; position: absolute; left: 50%; bottom: -9px; margin-left: -8px;
    width: 0; height: 0;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    border-top: 9px solid #efe4c8;
    filter: drop-shadow(0 1px 0 #4a3a26);
  }
  #pm-prompt {
    position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
    z-index: 40; width: 320px; padding: 10px 14px;
    background: rgba(6, 6, 10, 0.88); border: 1px solid #57402b;
    color: #e8dcc8; font: 12px/1.5 ui-monospace, monospace; text-align: center;
    letter-spacing: 0.12em; pointer-events: none; user-select: none;
  }
  #pm-prompt .title { color: #ffcf8a; font-weight: bold; margin-bottom: 6px; }
  #pm-prompt .bar { height: 4px; background: #2a2118; margin: 8px 0 6px; }
  #pm-prompt .bar > div { height: 100%; background: #ffcf8a; width: 0%; }
  #pm-prompt .hint { font-size: 10px; color: #a08a6a; letter-spacing: 0.06em; }
`;

function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
}

function ensureBubble(): void {
  if (bubbleEl || typeof document === 'undefined') return;
  ensureStyle();
  bubbleEl = document.createElement('div');
  bubbleEl.id = 'pm-bubble';
  const who = document.createElement('div');
  who.className = 'pm-who';
  who.textContent = POSTMASTER_TITLE;
  bubbleText = document.createElement('div');
  bubbleText.className = 'pm-line';
  bubbleEl.appendChild(who);
  bubbleEl.appendChild(bubbleText);
  bubbleEl.style.display = 'none';
  document.body.appendChild(bubbleEl);
}

function ensurePrompt(): void {
  if (promptEl || typeof document === 'undefined') return;
  ensureStyle();
  promptEl = document.createElement('div');
  promptEl.id = 'pm-prompt';
  promptTitle = document.createElement('div');
  promptTitle.className = 'title';
  const bar = document.createElement('div');
  bar.className = 'bar';
  promptFill = document.createElement('div');
  bar.appendChild(promptFill);
  promptHint = document.createElement('div');
  promptHint.className = 'hint';
  promptEl.appendChild(promptTitle);
  promptEl.appendChild(bar);
  promptEl.appendChild(promptHint);
  promptEl.style.display = 'none';
  document.body.appendChild(promptEl);
}

// --- the bubble ------------------------------------------------------------------

function updateBubble(world: WorldState): void {
  const s = world.postmaster;
  const line = s.card ? postmasterLineFor(s.card) : null;
  const live = !!line && s.cardTimer > 0 && s.phase !== 'idle' && s.phase !== 'gone';
  if (!live) {
    if (bubbleEl) bubbleEl.style.display = 'none';
    return;
  }
  const ctx = currentRenderContext();
  if (!ctx) return;
  ensureBubble();
  if (!bubbleEl || !bubbleText) return;

  // Project through the live camera. Three's own Vector3.project is not imported
  // here (this file is DOM-side and must stay `three`-light), so the projection
  // is done by hand off the camera's matrices, which the renderer keeps current.
  const at = postmasterBubbleAnchor(world);
  const p = projectToScreen(ctx, at.x, at.y, at.z);
  if (!p) {
    bubbleEl.style.display = 'none';
    return;
  }
  bubbleText.textContent = line.line;
  bubbleEl.className = line.isCanonical ? '' : 'pm-courtesy';
  bubbleEl.style.left = `${Math.round(p.x)}px`;
  bubbleEl.style.top = `${Math.round(p.y)}px`;
  bubbleEl.style.display = 'block';
  lastBubble = { text: line.line, canonical: line.isCanonical };
}

// World → screen, using the camera's own matrices. Returns null when the point
// is behind the camera (w ≤ 0) or off the near plane.
function projectToScreen(
  ctx: ReturnType<typeof currentRenderContext>,
  x: number,
  y: number,
  z: number,
): { x: number; y: number } | null {
  if (!ctx) return null;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const m = cam.projectionMatrix.elements;
  const vm = cam.matrixWorldInverse.elements;
  // view-space
  const vx = vm[0]! * x + vm[4]! * y + vm[8]! * z + vm[12]!;
  const vy = vm[1]! * x + vm[5]! * y + vm[9]! * z + vm[13]!;
  const vz = vm[2]! * x + vm[6]! * y + vm[10]! * z + vm[14]!;
  // clip-space
  const cx = m[0]! * vx + m[4]! * vy + m[8]! * vz + m[12]!;
  const cy = m[1]! * vx + m[5]! * vy + m[9]! * vz + m[13]!;
  const cw = m[3]! * vx + m[7]! * vy + m[11]! * vz + m[15]!;
  if (cw <= 1e-6) return null;
  const canvas = ctx.renderer.domElement;
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: (-(cy / cw) * 0.5 + 0.5) * h };
}

// --- the two holds ---------------------------------------------------------------

function updatePrompt(world: WorldState): void {
  const s = world.postmaster;

  // THE CUT — the victory verb. Armed only while he is staggered and you are in
  // reach: two landed gaffs bought this window, and it closes.
  if (cutArmed(s)) {
    const p = world.player;
    const inReach = Math.hypot(p.x - s.x, p.z - s.z) <= CUT_REACH;
    if (inReach) {
      show('CUT HIS LINE', 'HOLD E — IT IS NOT YOUR LINE', cutProgress(s));
      return;
    }
    show('HE HAS LET GO OF THE TWINE', 'CLOSE THE DISTANCE', 0);
    return;
  }

  // THE SUMMONS — at the letterbox, after dark, hands free.
  if (s.phase === 'idle' && !s.summoned && !postmasterFighting(s)) {
    const arena = postmasterArena(world);
    const ok =
      !!arena &&
      atLetterbox(world, arena) &&
      world.tether.fights.length === 0 &&
      !world.water.active &&
      SUMMON_PHASES.has(currentPhase(world));
    if (ok) {
      show('THE LETTERBOX IS FULL', 'HOLD E — RING FOR THE POSTMASTER', summonProgress(s));
      return;
    }
  }

  if (promptEl) promptEl.style.display = 'none';
}

function show(title: string, hint: string, fill: number): void {
  ensurePrompt();
  if (!promptEl || !promptTitle || !promptHint || !promptFill) return;
  promptTitle.textContent = title;
  promptHint.textContent = hint;
  promptFill.style.width = `${Math.max(0, Math.min(1, fill)) * 100}%`;
  promptEl.style.display = 'block';
}

// --- probe seams --------------------------------------------------------------------

let lastBubble: { text: string; canonical: boolean } | null = null;

/** What the bubble ACTUALLY says on screen right now (the gate's readout). */
export function postmasterBubbleOnScreen(): {
  visible: boolean;
  text: string;
  canonical: boolean;
  left: number;
  top: number;
} {
  const el = bubbleEl;
  const visible = !!el && el.style.display !== 'none';
  return {
    visible,
    text: visible && lastBubble ? lastBubble.text : '',
    canonical: visible && lastBubble ? lastBubble.canonical : false,
    left: el ? parseFloat(el.style.left || '0') : 0,
    top: el ? parseFloat(el.style.top || '0') : 0,
  };
}

/** What the hold prompt says on screen right now. */
export function postmasterPromptOnScreen(): { visible: boolean; title: string } {
  const el = promptEl;
  const visible = !!el && el.style.display !== 'none';
  return { visible, title: visible && promptTitle ? (promptTitle.textContent ?? '') : '' };
}

export function updatePostmasterOverlay(world: WorldState): void {
  if (typeof document === 'undefined') return;
  updateBubble(world);
  updatePrompt(world);
}

export function dismissPostmasterOverlay(): void {
  lastBubble = null;
  if (bubbleEl) {
    bubbleEl.remove();
    bubbleEl = null;
    bubbleText = null;
  }
  if (promptEl) {
    promptEl.remove();
    promptEl = null;
    promptTitle = null;
    promptHint = null;
    promptFill = null;
  }
}
