// CAST PROMPT — the SET/RELEASE window overlay (task t12 #1). Shown while a
// disturbance is in the 1.2s prompt: LMB = SET (fight begins), RMB = RELEASE
// (the free Dread valve). A countdown bar reads the window. DOM only; the
// decision logic lives in systems/castFlow.ts.

import type { WorldState } from '../core/world';
import { PROMPT_WINDOW } from '../run/disturbance';

let el: HTMLDivElement | null = null;
let bar: HTMLDivElement | null = null;

function ensureEl(): void {
  if (el) return;
  el = document.createElement('div');
  el.id = 'cast-prompt';
  document.body.appendChild(el);
  const style = document.createElement('style');
  style.textContent = `
    #cast-prompt {
      position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
      z-index: 40; width: 300px; padding: 10px 14px;
      background: rgba(6, 10, 12, 0.85); border: 1px solid #3a4c58;
      color: #e8dcc8; font: 12px/1.5 ui-monospace, monospace; text-align: center;
      letter-spacing: 0.12em; pointer-events: none; user-select: none;
    }
    #cast-prompt .title { color: #ffcf8a; font-weight: bold; margin-bottom: 6px; }
    #cast-prompt .bar { height: 4px; background: #22303a; margin: 8px 0 6px; }
    #cast-prompt .bar > div { height: 100%; background: #ffcf8a; width: 100%; }
    #cast-prompt .hint { font-size: 10px; color: #8fb0a8; letter-spacing: 0.06em; }
  `;
  document.head.appendChild(style);
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'SET / RELEASE';
  el.appendChild(title);
  bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  bar.appendChild(fill);
  el.appendChild(bar);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'LMB = SET · RMB = RELEASE';
  el.appendChild(hint);
  el.setAttribute('data-fill', 'fill');
}

export function updateCastPrompt(world: WorldState): void {
  const promptId = world.run.promptId;
  if (promptId == null) {
    if (el) el.style.display = 'none';
    return;
  }
  const d = world.disturbances.find((x) => x.id === promptId);
  if (!d || d.state !== 'prompt') {
    if (el) el.style.display = 'none';
    return;
  }
  ensureEl();
  el!.style.display = 'block';
  const frac = Math.max(0, Math.min(1, d.promptTimer / PROMPT_WINDOW));
  const fill = bar!.querySelector('div');
  if (fill) fill.style.width = `${frac * 100}%`;
}