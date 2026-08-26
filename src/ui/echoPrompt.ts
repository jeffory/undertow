// MAREN'S ECHO — the marker prompt and the decision prompt (ui), M8 boss,
// plan 05 §2.3.
//
// Two moments, one piece of screen furniture, in the filling-bar hold idiom the
// letterbox, the Postmaster's cut and the Whistler's cut are all drawn in:
//
//   • THE MARKER — sitting in the deepest water in the Choir, HOLD E. The
//     summon node's own docket text (choir.md §5.1) is the title.
//   • THE DECISION — she is close enough to take. The LAND prompt says what the
//     player is about to do, and it is the only prompt in the game that is not
//     telling you to hurry.
//
// There is no third card, because there is no third thing she does. Her four
// sway lines arrive as the ordinary faint parchment note (ui/barkOverlay.ts) —
// the Choir's own voice, not a boss's speech bubble; she is not the Postmaster
// and she does not explain herself.
//
// DOM only. The sim owns every number (world.marensEcho); this presents them.

import type { WorldState } from '../core/world';
import { ECHO_SUMMON_HEADER } from '../content/choirLines';
import {
  echoSummonEligible,
  landEligibleAt,
  summonProgress,
} from '../bosses/marensEcho';
import { atEchoMarker, echoMarkerFor } from '../systems/marensEcho';

let styleEl: HTMLStyleElement | null = null;
let promptEl: HTMLDivElement | null = null;
let titleEl: HTMLDivElement | null = null;
let hintEl: HTMLDivElement | null = null;
let fillEl: HTMLDivElement | null = null;

// The Whistler's prompt, one shade colder and one shade paler: the same verb in
// the same zone, but this one is not an escape.
const STYLE = `
  #echo-prompt {
    position: fixed; left: 50%; bottom: 118px; transform: translateX(-50%);
    z-index: 46; width: 340px; max-width: 88vw; padding: 8px 12px 9px;
    background: rgba(6, 8, 10, 0.84);
    border: 1px solid rgba(206, 204, 190, 0.34);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.65);
    font: 11px/1.4 ui-monospace, 'Courier New', monospace;
    color: #ddd9cc; letter-spacing: 0.16em; text-align: center;
    pointer-events: none; user-select: none;
  }
  #echo-prompt .echo-title { font-size: 11px; color: #ece8da; font-weight: bold; }
  #echo-prompt .echo-bar { margin: 6px 0 5px; height: 3px; background: rgba(230, 226, 212, 0.16); }
  #echo-prompt .echo-fill { height: 100%; width: 0%; background: #ece8da; }
  #echo-prompt .echo-hint { font-size: 8px; letter-spacing: 0.22em; color: #8e8a7e; }
`;

function ensure(): void {
  if (typeof document === 'undefined') return;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }
  if (promptEl) return;
  promptEl = document.createElement('div');
  promptEl.id = 'echo-prompt';
  titleEl = document.createElement('div');
  titleEl.className = 'echo-title';
  const bar = document.createElement('div');
  bar.className = 'echo-bar';
  fillEl = document.createElement('div');
  fillEl.className = 'echo-fill';
  bar.appendChild(fillEl);
  hintEl = document.createElement('div');
  hintEl.className = 'echo-hint';
  promptEl.append(titleEl, bar, hintEl);
  promptEl.style.display = 'none';
  document.body.appendChild(promptEl);
}

function show(title: string, hint: string, fill: number): void {
  ensure();
  if (!promptEl || !titleEl || !hintEl || !fillEl) return;
  titleEl.textContent = title;
  hintEl.textContent = hint;
  fillEl.style.width = `${Math.max(0, Math.min(1, fill)) * 100}%`;
  promptEl.style.display = 'block';
}

function hide(): void {
  if (promptEl) promptEl.style.display = 'none';
}

/** What the prompt says on screen right now (the gate's readout). */
export function echoPromptOnScreen(): { visible: boolean; title: string; hint: string } {
  const el = promptEl;
  const visible = !!el && el.style.display !== 'none';
  return {
    visible,
    title: visible && titleEl ? (titleEl.textContent ?? '') : '',
    hint: visible && hintEl ? (hintEl.textContent ?? '') : '',
  };
}

export function updateEchoPrompt(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const s = world.marensEcho;

  // THE DECISION. Armed by the sim (`fight.land.eligible`), and deliberately
  // worded as a choice rather than an instruction: the fight is you deciding.
  if (s.phase === 'hold') {
    const fight = world.tether.fights.find((f) => f.id === s.fightId);
    if (fight && fight.land.eligible) {
      show('SHE IS WITHIN REACH', 'E — TAKE HER ABOARD · RMB KEEPS REELING', 1);
      return;
    }
    hide();
    return;
  }

  // THE MARKER — only while the summon is actually possible, so the void does
  // not carry a permanent instruction.
  if (s.phase === 'idle') {
    const marker = echoMarkerFor(world);
    const eligible =
      !!marker &&
      echoSummonEligible({
        zone: world.run.zone,
        atMarker: atEchoMarker(world, marker),
        fightLive: world.tether.fights.length > 0,
        hasCatch: world.run.activeCatch !== null,
        submerged: world.water.active,
        summoned: s.summoned,
      });
    if (eligible) {
      show(ECHO_SUMMON_HEADER, 'HOLD E', summonProgress(s));
      return;
    }
  }

  hide();
}

export function dismissEchoPrompt(): void {
  if (promptEl) {
    promptEl.remove();
    promptEl = null;
    titleEl = null;
    hintEl = null;
    fillEl = null;
  }
}

// Re-exported so a gate driver can ask the same question the prompt asks.
export { landEligibleAt };
