// DECANT STATION (ui) — plan 05 §1.7, task t21.
//
// The lighthouse door's third register (RESTORATION / RIG-UP / DECANT), in the
// same paper idiom as the other two. It is the only screen in the game where
// the player spends something that never comes back and gets no receipt for it:
//
//   • nine draws for the whole campaign, counted down in the open;
//   • each draw mints one Bottled Light into the box AND packs it into the
//     rig-up's SCHEDULE E so the bottle is actually in the boat;
//   • each draw permanently dims the beam — the panel prints what the lamp is
//     worth before and after, because the plan's dimming is *telegraphed*
//     ("Nobody comments. The light comments, by dimming.").
//
// DOM only: no `three` beyond the render seams it pushes (same convention as
// ui/optionsMenu.ts), no game logic — meta/bottledLight.ts owns the math.

import type { WorldState } from '../core/world';
import { getSave, updateSave } from '../core/save';
import { decantCopy } from '../content/townCopy';
import {
  DECANT_POOL,
  RIG_CONSUMABLE_CAP,
  bottledLightCharges,
  canDecant,
  decant,
  decantsRemaining,
  hubLightCurve,
} from '../meta/bottledLight';
import { emitTownEvent } from '../meta/townEvents';
import { applyHubMeta } from '../render/hubAtmosphere';

const STYLE = `
  #restoration .lamp {
    margin-top: 12px; padding: 8px 10px; border-left: 3px solid #7a2014;
    background: rgba(122, 32, 20, 0.05); color: #5a2418; font-size: 11px; letter-spacing: 0.05em;
  }
  #restoration .lamp b { font-size: 12px; }
  #restoration .draws {
    margin-top: 12px; padding: 8px 10px; border: 1px dashed #6a5638;
    display: flex; justify-content: space-between; align-items: baseline; font-size: 12px;
  }
  #restoration .draws .amount { font-weight: bold; font-size: 15px; }
  #restoration .phials { margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap; }
  #restoration .phial {
    width: 13px; height: 20px; border: 1px solid #4a3a26; background: #f6efd8;
    box-shadow: inset 0 -6px 0 rgba(255, 207, 138, 0.75);
  }
  #restoration .phial.spent { background: #cfc4a6; box-shadow: none; opacity: 0.55; }
  #restoration .lampbar { margin-top: 10px; }
  #restoration .lampbar .track {
    height: 8px; border: 1px solid #4a3a26; background: rgba(60, 45, 25, 0.18);
  }
  #restoration .lampbar .fill { height: 100%; background: #ffcf8a; }
  #restoration .lampbar .caption {
    font-size: 10px; color: #6a5638; letter-spacing: 0.1em; margin-top: 4px;
  }
  #restoration button.draw {
    margin-top: 12px; padding: 6px 16px; background: #4a3a26; color: #efe4c8;
    border: none; cursor: pointer; font: 11px/1.4 ui-monospace, monospace; letter-spacing: 0.16em;
  }
  #restoration button.draw:hover { background: #5c4a30; }
  #restoration button.draw[disabled] { background: #9c9078; cursor: not-allowed; }
  #restoration .stock { margin-top: 8px; font-size: 11px; color: #3a2c1a; }
`;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ensureDecantStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('decant-style')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'decant-style';
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
}

export interface DecantNav {
  onSwitchToRestoration: () => void;
  onSwitchToRigUp: () => void;
}

let ctxWorld: WorldState | null = null;
let ctxOverlay: HTMLElement | null = null;
let ctxNav: DecantNav | null = null;

export function renderDecantInto(
  overlayEl: HTMLElement,
  world: WorldState,
  nav: DecantNav,
): void {
  ensureDecantStyle();
  ctxWorld = world;
  ctxOverlay = overlayEl;
  ctxNav = nav;
  renderPanel();
}

function renderPanel(): void {
  const overlayEl = ctxOverlay;
  const nav = ctxNav;
  if (!overlayEl || !nav) return;
  overlayEl.textContent = '';
  const save = getSave();
  if (!save) return;
  const meta = save.metaState;

  const header = decantCopy('decant_header');
  const register = el('div', 'register');
  overlayEl.appendChild(register);

  register.appendChild(el('div', 'masthead', 'THE OFFICE OF PUBLIC WORKS'));
  register.appendChild(el('div', 'form-no', header?.formRef ?? 'FORM 9-L'));

  const navEl = el('div', 'door-nav');
  const restBtn = el('button', undefined, 'REGISTER OF RESTORATION') as HTMLButtonElement;
  restBtn.addEventListener('click', nav.onSwitchToRestoration);
  const rigBtn = el('button', undefined, 'FORM 6-R · RIG-UP') as HTMLButtonElement;
  rigBtn.addEventListener('click', nav.onSwitchToRigUp);
  const decBtn = el('button', 'active', 'FORM 9-L · DECANT') as HTMLButtonElement;
  navEl.appendChild(restBtn);
  navEl.appendChild(rigBtn);
  navEl.appendChild(decBtn);
  register.appendChild(navEl);

  if (header) {
    const lamp = el('div', 'lamp');
    lamp.appendChild(el('b', undefined, header.label));
    lamp.appendChild(el('div', undefined, header.flavorText));
    register.appendChild(lamp);
  }

  // The allocation, counted in the open.
  const remaining = decantsRemaining(meta);
  const draws = el('div', 'draws');
  draws.appendChild(el('span', undefined, 'DRAWS REMAINING ON THIS APPOINTMENT'));
  draws.appendChild(el('span', 'amount', `${remaining} / ${DECANT_POOL}`));
  register.appendChild(draws);

  const phials = el('div', 'phials');
  for (let i = 0; i < DECANT_POOL; i++) {
    phials.appendChild(el('div', `phial${i < meta.decants ? ' spent' : ''}`));
  }
  register.appendChild(phials);

  // What the lamp is worth now, and what the next draw costs it. Telegraphed,
  // exactly like the restoration ledger's THE LAKE STIRS readout.
  const now = hubLightCurve(meta.decants);
  const next = hubLightCurve(meta.decants + 1);
  const toll = decantCopy('decant_toll');
  const bar = el('div', 'lampbar');
  const track = el('div', 'track');
  const fill = el('div', 'fill') as HTMLDivElement;
  fill.style.width = `${(now.intensityScale * 100).toFixed(1)}%`;
  track.appendChild(fill);
  bar.appendChild(track);
  bar.appendChild(
    el(
      'div',
      'caption',
      remaining > 0
        ? `THE LAMP STANDS AT ${Math.round(now.intensityScale * 100)}% — the next draw leaves it at ` +
          `${Math.round(next.intensityScale * 100)}%, sweeping at ${Math.round(next.sweepScale * 100)}%.`
        : `THE LAMP STANDS AT ${Math.round(now.intensityScale * 100)}%. There is nothing further to draw.`,
    ),
  );
  register.appendChild(bar);
  if (toll) register.appendChild(el('div', 'benefit', toll.flavorText));

  // The verb.
  const action = decantCopy(remaining > 0 ? 'decant_action' : 'decant_exhausted');
  const can = canDecant(meta);
  const btn = el('button', 'draw', action?.label ?? 'DRAW ONE PHIAL') as HTMLButtonElement;
  btn.setAttribute('data-decant', 'draw');
  btn.disabled = !can.ok;
  btn.addEventListener('click', () => {
    void pour();
  });
  register.appendChild(btn);
  if (action) register.appendChild(el('div', 'benefit', action.flavorText));

  const packed = bottledLightCharges(save.rigLoadout.consumables);
  register.appendChild(
    el(
      'div',
      'stock',
      `PHIALS IN STORES: ${save.box.filter((i) => i.name === 'Bottled Light').length} · ` +
        `PACKED FOR THE NEXT ROW-OUT: ${packed}`,
    ),
  );

  const close = el('button', 'close', 'CLOSE REGISTER') as HTMLButtonElement;
  close.addEventListener('click', () => {
    if (ctxWorld) ctxWorld.town.open = false;
  });
  register.appendChild(close);
  register.appendChild(
    el('div', 'footnote', 'The Office does not acknowledge receipt of light.'),
  );
}

// Pour one bottle: mint the item into the box, pack it into SCHEDULE E (up to
// the register's cap), persist, emit, and push the new decant count into the
// beam the same frame. Every write goes through core/save's updateSave, so the
// IndexedDB row and the in-memory singleton never diverge.
async function pour(): Promise<void> {
  const save = getSave();
  if (!save) return;
  const result = decant(save.metaState);
  if (!result.ok || !result.item) return;
  if (result.event) emitTownEvent(result.event);
  const item = result.item;
  await updateSave((s) => {
    const consumables = s.rigLoadout.consumables.includes(item.id)
      ? s.rigLoadout.consumables
      : s.rigLoadout.consumables.length < RIG_CONSUMABLE_CAP
        ? [...s.rigLoadout.consumables, item.id]
        : s.rigLoadout.consumables;
    return {
      ...s,
      metaState: result.meta,
      box: [...s.box, item],
      rigLoadout: { ...s.rigLoadout, consumables },
    };
  });
  applyHubMeta(result.meta);
  renderPanel();
}
