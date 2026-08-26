// RIG-UP SCREEN (ui) — plan 05 §1.2, task t19 slice 2.
//
// The pre-run tackle requisition, reached from the lighthouse door's two-button
// register (the RESTORATION / RIG-UP nav lives in ui/restorationUI.ts; this
// module renders the RIG-UP panel into the same #restoration overlay).
//
//   • rod (1) + line (1) + lure (3) + trinket (2) + consumables
//   • catalogues: rods from content/rigCatalog.ts (the Dredger / Longliner are
//     silhouette lock-ups gated by their workshop — Smokehouse / Chandlery);
//     line / lure / trinket / consumable from the player's OWN box (sundries
//     loot/roller.ts landed) — items not collected are simply absent, and a
//     class with nothing collected renders as an empty slot.
//   • gating: a row whose workshop is unrestored or whose tackle grade exceeds
//     the Keeper's License gets the RESTRICTED. NICE TRY. stamp with town.md
//     §5's rejection copy. Persisted via core/save `setRigLoadout`, which is
//     the SAME data applyRunStartPassives reads at run start (rigLoadout is
//     the single loadout source of truth).
//
// DOM only: no `three`; the gating math is meta/rigLoadout.ts.

import type { WorldState } from '../core/world';
import { getSave, setRigLoadout } from '../core/save';
import { RODS, lineIdForName } from '../content/rigCatalog';
import { rigUpSlot, restrictedNotice } from '../content/townCopy';
import {
  rigGateContext,
  rodGate,
  sanitizeRigLoadout,
  type RigGateContext,
  type RigLoadoutLike,
} from '../meta/rigLoadout';
import type { SundryItem } from '../save/schemas';

const STYLE = `
  #restoration .door-nav {
    display: flex; gap: 8px; margin-top: 10px;
  }
  #restoration .door-nav button {
    flex: 1; padding: 6px 0; border: 1px solid #4a3a26; background: #efe4c8;
    color: #3a2c1a; cursor: pointer;
    font: 11px/1.3 ui-monospace, monospace; letter-spacing: 0.14em;
  }
  #restoration .door-nav button.active {
    background: #4a3a26; color: #efe4c8; font-weight: bold;
  }
  #restoration .door-nav button:hover:not(.active) { background: #e4d7b6; }
  #restoration .schedule {
    margin-top: 12px; padding: 8px 10px; border-left: 3px solid #7a2014;
    background: rgba(122, 32, 20, 0.05); color: #5a2418; font-size: 11px; letter-spacing: 0.05em;
  }
  #restoration .slot {
    margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(106, 86, 56, 0.45);
  }
  #restoration .slot .slot-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  #restoration .slot .slot-ref { font-size: 9px; letter-spacing: 0.12em; color: #7a2014; font-weight: bold; }
  #restoration .slot .slot-label { font-weight: bold; font-size: 12px; letter-spacing: 0.05em; }
  #restoration .slot .slot-flavor { font-size: 10px; color: #6a5638; margin-top: 3px; }
  #restoration .slot .entries { margin-top: 7px; display: flex; flex-direction: column; gap: 5px; }
  #restoration .slot .entry {
    display: flex; align-items: center; gap: 8px; padding: 5px 8px;
    border: 1px solid rgba(106, 86, 56, 0.55); cursor: pointer; position: relative;
  }
  #restoration .slot .entry.picked { border-color: #2a5c2a; background: rgba(74, 122, 74, 0.14); }
  #restoration .slot .entry.locked { cursor: not-allowed; }
  #restoration .slot .entry .box {
    width: 12px; height: 12px; border: 1px solid #4a3a26; flex: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; color: #2a5c2a; font-weight: bold;
  }
  #restoration .slot .entry .name { font-weight: bold; color: #2a2012; }
  #restoration .slot .entry .meta { font-size: 9px; color: #6a5638; letter-spacing: 0.08em; margin-left: auto; }
  #restoration .slot .empty { font-size: 10px; color: #6a5638; font-style: italic; margin-top: 6px; }
  #restoration .restricted {
    position: absolute; right: 8px; top: 4px; transform: rotate(-6deg);
    border: 2px solid #7a2014; color: #7a2014; border-radius: 3px 6px 2px 7px / 6px 3px 7px 2px;
    padding: 2px 6px; font-size: 9px; font-weight: bold; letter-spacing: 0.14em;
    background: rgba(122, 32, 20, 0.04); pointer-events: none;
  }
  #restoration .restricted-note {
    margin-top: 5px; font-size: 10px; color: #7a2014; font-style: italic;
  }
`;

// The mutable selection carried through re-renders.
interface RigSelection {
  rodId: string | null;
  lineId: string | null;
  lureIds: Set<string>;
  trinketIds: Set<string>;
  consumables: Set<string>;
}

interface RigUpCtx {
  world: WorldState;
  overlay: HTMLElement;
  selection: RigSelection;
  box: SundryItem[];
  ctx: RigGateContext;
  onSwitchToRestoration: () => void;
  onSwitchToDecant: () => void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ensureRigStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('rig-up-style')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'rig-up-style';
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
}

function sundryMeta(item: SundryItem): string {
  const fx = item.effects.map((e) => e.key).join(' · ');
  return `${item.rarity}${fx ? ` — ${fx}` : ''}`;
}

// --- the panel --------------------------------------------------------------------

export function renderRigUpInto(
  overlayEl: HTMLElement,
  world: WorldState,
  onSwitchToRestoration: () => void,
  onSwitchToDecant: () => void = () => {},
): void {
  ensureRigStyle();
  overlayEl.textContent = '';
  const save = getSave();
  if (!save) return;

  const kept = sanitizeRigLoadout(save);
  const selection: RigSelection = {
    rodId: kept.rodId,
    lineId: kept.lineId,
    lureIds: new Set(kept.lureIds),
    trinketIds: new Set(kept.trinketIds),
    consumables: new Set(kept.consumables),
  };
  const ctx: RigUpCtx = {
    world,
    overlay: overlayEl,
    selection,
    box: save.box,
    ctx: rigGateContext(save),
    onSwitchToRestoration,
    onSwitchToDecant,
  };
  renderPanel(ctx);
}

function renderPanel(ctx: RigUpCtx): void {
  const overlayEl = ctx.overlay;
  overlayEl.textContent = '';

  const header = rigUpSlot('screen_header');
  const register = el('div', 'register');
  overlayEl.appendChild(register);

  register.appendChild(el('div', 'masthead', 'THE OFFICE OF PUBLIC WORKS'));
  register.appendChild(el('div', 'form-no', header?.formRef ?? 'FORM 6-R: CUSTODIAL RIGGING'));

  const nav = el('div', 'door-nav');
  const restBtn = el('button', undefined, 'REGISTER OF RESTORATION') as HTMLButtonElement;
  restBtn.addEventListener('click', ctx.onSwitchToRestoration);
  const rigBtn = el('button', 'active', 'FORM 6-R · RIG-UP') as HTMLButtonElement;
  const decBtn = el('button', undefined, 'FORM 9-L · DECANT') as HTMLButtonElement;
  decBtn.addEventListener('click', ctx.onSwitchToDecant);
  nav.appendChild(restBtn);
  nav.appendChild(rigBtn);
  nav.appendChild(decBtn);
  register.appendChild(nav);

  if (header) {
    const sched = el('div', 'schedule');
    sched.appendChild(el('b', undefined, header.label));
    sched.appendChild(el('div', undefined, header.flavorText));
    register.appendChild(sched);
  }

  renderRodSlot(register, ctx);
  renderBoxSlot(register, ctx, { slotId: 'line', max: 1, picked: ctx.selection.lineId });
  renderBoxSlot(register, ctx, { slotId: 'lure', max: 3, picked: ctx.selection.lureIds });
  renderBoxSlot(register, ctx, { slotId: 'trinket', max: 2, picked: ctx.selection.trinketIds });
  renderBoxSlot(register, ctx, { slotId: 'consumables', max: 6, picked: ctx.selection.consumables });

  const confirmRef = rigUpSlot('confirm_button');
  const confirm = el('button', 'close', confirmRef?.label ?? 'SIGN REGISTER & ROW OUT') as HTMLButtonElement;
  confirm.addEventListener('click', () => {
    const loadout: RigLoadoutLike = {
      rodId: ctx.selection.rodId,
      lineId: ctx.selection.lineId,
      lureIds: [...ctx.selection.lureIds].slice(0, 3),
      trinketIds: [...ctx.selection.trinketIds].slice(0, 2),
      consumables: [...ctx.selection.consumables],
    };
    void setRigLoadout(loadout).then(() => {
      ctx.world.town.open = false;
    });
  });
  register.appendChild(confirm);
  if (confirmRef) {
    register.appendChild(el('div', 'footnote', confirmRef.flavorText));
  }
}

// Rods: the always-available staff + the two workshop-gated unlock rods. A rod
// whose workshop is unrestored renders as a lock-up (the gate notice explains
// which foundation must be rebuilt), and one beyond the license grade carries
// the license-tier RESTRICTED stamp.
function renderRodSlot(register: HTMLElement, ctx: RigUpCtx): void {
  const slot = el('div', 'slot');
  const label = rigUpSlot('rod');
  const head = el('div', 'slot-head');
  head.appendChild(el('span', 'slot-ref', label?.formRef ?? 'SCHEDULE A'));
  head.appendChild(el('span', 'slot-label', label?.label ?? 'PRIMARY LEVERAGE APPARATUS (ROD)'));
  slot.appendChild(head);
  if (label) slot.appendChild(el('div', 'slot-flavor', label.flavorText));

  const entries = el('div', 'entries');
  for (const rod of RODS) {
    const gate = rodGate(rod, ctx.ctx);
    const picked = ctx.selection.rodId === rod.id;
    const row = el('div', `entry${picked ? ' picked' : ''}${gate.ok ? '' : ' locked'}`);
    row.setAttribute('data-rig', 'rod');
    row.setAttribute('data-id', rod.id);
    row.appendChild(el('div', 'box', picked ? '✓' : ''));
    row.appendChild(el('span', 'name', rod.name));
    row.appendChild(el('span', 'meta', `GRADE ${rod.tackleGrade}`));
    if (!gate.ok && gate.restriction) {
      row.appendChild(el('div', 'restricted', 'RESTRICTED. NICE TRY.'));
      row.appendChild(el('div', 'restricted-note', restrictedNotice(gate.restriction)?.noticeBody ?? ''));
    }
    if (gate.ok) {
      row.addEventListener('click', () => {
        ctx.selection.rodId = rod.id;
        renderPanel(ctx);
      });
    }
    entries.appendChild(row);
  }
  slot.appendChild(entries);
  register.appendChild(slot);
}

// The shared four "box" slots (line / lure / trinket / consumables): the
// player's collected sundries of that class. An empty class renders as an
// unfilled schedule (no stores recovered).
function renderBoxSlot(
  register: HTMLElement,
  ctx: RigUpCtx,
  opts: { slotId: string; max: number; picked: Set<string> | string | null },
): void {
  const slot = el('div', 'slot');
  const label = rigUpSlot(opts.slotId);
  const head = el('div', 'slot-head');
  head.appendChild(el('span', 'slot-ref', label?.formRef ?? `SCHEDULE ${opts.slotId.toUpperCase()}`));
  head.appendChild(el('span', 'slot-label', label?.label ?? opts.slotId.toUpperCase()));
  slot.appendChild(head);
  if (label) slot.appendChild(el('div', 'slot-flavor', label.flavorText));

  const items =
    opts.slotId === 'consumables'
      ? ctx.box.filter((i) => i.slot === 'bait' || i.slot === 'consumable')
      : ctx.box.filter((i) => i.slot === opts.slotId);

  const entries = el('div', 'entries');
  if (items.length === 0) {
    entries.appendChild(el('div', 'empty', 'no stores recovered from the basin. this schedule is unfilled.'));
  }
  for (const item of items) {
    const key = opts.slotId === 'line' ? lineIdForName(item.name) : item.id;
    const picked = opts.picked instanceof Set ? opts.picked.has(key) : opts.picked === key;
    const row = el('div', `entry${picked ? ' picked' : ''}`);
    row.setAttribute('data-rig', opts.slotId);
    row.setAttribute('data-id', key);
    row.appendChild(el('div', 'box', picked ? '✓' : ''));
    row.appendChild(el('span', 'name', item.name));
    row.appendChild(el('span', 'meta', sundryMeta(item)));
    row.addEventListener('click', () => toggle(ctx, opts, key));
    entries.appendChild(row);
  }
  slot.appendChild(entries);
  register.appendChild(slot);
}

function toggle(
  ctx: RigUpCtx,
  opts: { slotId: string; max: number; picked: Set<string> | string | null },
  key: string,
): void {
  switch (opts.slotId) {
    case 'line':
      ctx.selection.lineId = ctx.selection.lineId === key ? null : key;
      break;
    case 'lure':
      if (ctx.selection.lureIds.has(key)) ctx.selection.lureIds.delete(key);
      else if (ctx.selection.lureIds.size < opts.max) ctx.selection.lureIds.add(key);
      break;
    case 'trinket':
      if (ctx.selection.trinketIds.has(key)) ctx.selection.trinketIds.delete(key);
      else if (ctx.selection.trinketIds.size < opts.max) ctx.selection.trinketIds.add(key);
      break;
    case 'consumables':
      if (ctx.selection.consumables.has(key)) ctx.selection.consumables.delete(key);
      else if (ctx.selection.consumables.size < opts.max) ctx.selection.consumables.add(key);
      break;
  }
  renderPanel(ctx);
}