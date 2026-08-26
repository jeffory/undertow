// THE WHISTLER'S CUT PROMPT (ui) — M8, plan 05 §2.3.
//
// The Whistler has no speech bubble. The Postmaster is courteous and municipal
// and TALKS; this thing whistles, and everything it says arrives as a faint
// parchment toast (content/choirLines.ts, via ui/barkOverlay.ts). So the only
// screen furniture it owns is the ESCAPE: the same filling-bar hold prompt the
// letterbox and the Postmaster's cut are drawn in, because it is the same verb —
// two landed gaffs bought a window, and a hold spends it.
//
// Reusing that idiom is the point: the keeper learned "hold E in reach to cut a
// line that is not yours" one zone up, in a lit street, against a man who
// explained himself. Here they will do it in the dark, at speed, against
// something they cannot see the far end of. The verb is the memory.
//
// DOM only. The sim owns every number (world.whistler); this presents them.

import type { WorldState } from '../core/world';
import { CUT_REACH, cutArmed, cutProgress } from '../enemies/whistler';
import { keeperPoint } from '../systems/whistler';

let styleEl: HTMLStyleElement | null = null;
let promptEl: HTMLDivElement | null = null;
let promptTitle: HTMLDivElement | null = null;
let promptHint: HTMLDivElement | null = null;
let promptFill: HTMLDivElement | null = null;

const STYLE = `
  #wh-prompt {
    position: fixed; left: 50%; bottom: 118px; transform: translateX(-50%);
    z-index: 46; width: 320px; max-width: 86vw; padding: 8px 12px 9px;
    background: rgba(6, 10, 12, 0.82);
    border: 1px solid rgba(120, 200, 190, 0.35);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.6);
    font: 11px/1.4 ui-monospace, 'Courier New', monospace;
    color: #cfeae4; letter-spacing: 0.16em; text-align: center;
    pointer-events: none; user-select: none;
  }
  #wh-prompt .wh-title { font-size: 11px; color: #9fe6d6; font-weight: bold; }
  #wh-prompt .wh-bar {
    margin: 6px 0 5px; height: 3px; background: rgba(160, 230, 214, 0.16);
  }
  #wh-prompt .wh-fill { height: 100%; width: 0%; background: #9fe6d6; }
  #wh-prompt .wh-hint { font-size: 8px; letter-spacing: 0.22em; color: #6f9a93; }
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
  promptEl.id = 'wh-prompt';
  promptTitle = document.createElement('div');
  promptTitle.className = 'wh-title';
  const bar = document.createElement('div');
  bar.className = 'wh-bar';
  promptFill = document.createElement('div');
  promptFill.className = 'wh-fill';
  bar.appendChild(promptFill);
  promptHint = document.createElement('div');
  promptHint.className = 'wh-hint';
  promptEl.appendChild(promptTitle);
  promptEl.appendChild(bar);
  promptEl.appendChild(promptHint);
  promptEl.style.display = 'none';
  document.body.appendChild(promptEl);
}

function show(title: string, hint: string, fill: number): void {
  ensure();
  if (!promptEl || !promptTitle || !promptHint || !promptFill) return;
  promptTitle.textContent = title;
  promptHint.textContent = hint;
  promptFill.style.width = `${Math.max(0, Math.min(1, fill)) * 100}%`;
  promptEl.style.display = 'block';
}

/** What the hold prompt says on screen right now (the gate's readout). */
export function whistlerPromptOnScreen(): { visible: boolean; title: string } {
  const el = promptEl;
  const visible = !!el && el.style.display !== 'none';
  return { visible, title: visible && promptTitle ? (promptTitle.textContent ?? '') : '' };
}

export function updateWhistlerPrompt(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const s = world.whistler;

  if (cutArmed(s)) {
    // Reach is measured from the body the keeper is IN — the hull aboard, the
    // keeper on foot — because its fight happens in open water and can be fought
    // either way. Same rule the gaff arc uses (game/combat.ts).
    const at = keeperPoint(world);
    const inReach = Math.hypot(at.x - s.x, at.z - s.z) <= CUT_REACH;
    if (inReach) {
      show('CUT ITS LINE', 'HOLD E — IT IS NOT YOUR LINE', cutProgress(s));
      return;
    }
    show('ITS GRIP IS OFF THE LINE', 'CLOSE THE DISTANCE', 0);
    return;
  }

  if (promptEl) promptEl.style.display = 'none';
}

export function dismissWhistlerPrompt(): void {
  if (promptEl) {
    promptEl.remove();
    promptEl = null;
    promptTitle = null;
    promptHint = null;
    promptFill = null;
  }
}
