// TRINKET PICKER (ui) — task t19 §3. The pre-run picker: after the receipt (and
// any grade-up letter) dismisses, the box's trinkets are offered for the two
// equippable slots. Two trinkets may be carried into the run; the selection
// persists to the save (setEquippedTrinkets) and the fresh run applies them via
// applyRunStartPassives (which startNewRun calls). DOM only — the persisted
// write path is core/save.ts; effects are loot/runStart.ts.

import type { WorldState } from '../core/world';
import { getSave, setEquippedTrinkets } from '../core/save';
import { startNewRun } from '../run/run';
import type { SundryItem } from '../save/schemas';

let overlayEl: HTMLDivElement | null = null;

export const TRINKET_SLOTS = 2;

export function showTrinketPicker(world: WorldState, onComplete?: () => void): void {
  if (typeof document === 'undefined') return;
  dismissTrinketPicker();

  const save = getSave();
  const trinkets = (save?.box ?? []).filter((i) => i.slot === 'trinket');
  const equipped = save?.equipped ?? [];

  const root = document.createElement('div');
  root.id = 'trinket-picker';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #trinket-picker {
      position: fixed; inset: 0; z-index: 95;
      display: flex; align-items: center; justify-content: center;
      background: rgba(2, 4, 6, 0.6);
      font: 13px/1.45 ui-monospace, 'Courier New', monospace;
      color: #241c12;
    }
    #trinket-picker .invoice {
      width: 520px; max-height: 84vh; overflow: auto;
      background: #efe4c8;
      background-image:
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: 22px 22px;
      border: 1px solid #4a3a26;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      padding: 22px 26px;
    }
    #trinket-picker .masthead {
      text-align: center; letter-spacing: 0.18em;
      color: #3a2c1a; font-size: 14px; font-weight: bold;
      border-bottom: 2px solid #4a3a26; padding-bottom: 6px;
    }
    #trinket-picker .form-no {
      text-align: center; margin-top: 8px; font-size: 12px;
      letter-spacing: 0.12em; color: #7a2014; font-weight: bold;
    }
    #trinket-picker .hint { margin-top: 10px; font-size: 11px; color: #5a4630; text-align: center; }
    #trinket-picker .list { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    #trinket-picker .entry {
      display: flex; align-items: center; gap: 10px;
      border: 1px solid rgba(106, 86, 56, 0.6); padding: 8px 10px;
      background: rgba(239, 228, 200, 0.4); cursor: pointer;
    }
    #trinket-picker .entry.picked { border-color: #2a5c2a; background: rgba(74, 122, 74, 0.18); }
    #trinket-picker .entry .box {
      width: 14px; height: 14px; border: 1px solid #4a3a26; flex: none;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #2a5c2a; font-weight: bold;
    }
    #trinket-picker .entry .name { font-weight: bold; color: #2a2012; }
    #trinket-picker .entry .meta { font-size: 10px; color: #6a5638; letter-spacing: 0.08em; }
    #trinket-picker .empty { margin-top: 14px; text-align: center; font-size: 12px; color: #6a5638; font-style: italic; }
    #trinket-picker .actions { display: flex; gap: 8px; margin-top: 16px; }
    #trinket-picker button {
      flex: 1; padding: 8px 0; border: none; cursor: pointer;
      font: 12px/1.4 ui-monospace, monospace; letter-spacing: 0.2em;
    }
    #trinket-picker .cast { background: #4a3a26; color: #efe4c8; }
    #trinket-picker .cast:hover { background: #5c4a30; }
    #trinket-picker .decline { background: #6a5638; color: #efe4c8; }
    #trinket-picker .decline:hover { background: #7a6440; }
  `;
  document.head.appendChild(style);

  const invoice = document.createElement('div');
  invoice.className = 'invoice';
  root.appendChild(invoice);

  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'THE OFFICE OF RETURNS — PROVISIONS LEDGER';
  invoice.appendChild(mast);

  const form = document.createElement('div');
  form.className = 'form-no';
  form.textContent = '[SCHEDULE D: PERSONAL EFFECTS, TWO (2) SLOTS]';
  invoice.appendChild(form);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Select up to two (2) trinkets to carry. The Office keeps the rest.';
  invoice.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'list';
  invoice.appendChild(list);

  const selected = new Set<string>(equipped.filter((id) => trinkets.some((t) => t.id === id)));

  function render(): void {
    list.textContent = '';
    if (trinkets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'no sundries recovered. the box is empty.';
      list.appendChild(empty);
      return;
    }
    for (const item of trinkets) {
      list.appendChild(buildRow(item, selected, render));
    }
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  invoice.appendChild(actions);

  const cast = document.createElement('button');
  cast.className = 'cast';
  cast.textContent = 'CAST OFF';
  cast.addEventListener('click', () => {
    dismissTrinketPicker();
    void (async () => {
      await setEquippedTrinkets([...selected].slice(0, TRINKET_SLOTS));
      startNewRun(world);
      onComplete?.();
    })();
  });
  actions.appendChild(cast);

  const decline = document.createElement('button');
  decline.className = 'decline';
  decline.textContent = 'DECLINE';
  decline.addEventListener('click', () => {
    dismissTrinketPicker();
    startNewRun(world);
    onComplete?.();
  });
  actions.appendChild(decline);

  render();
  overlayEl = root;
}

function buildRow(
  item: SundryItem,
  selected: Set<string>,
  rerender: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = `entry${selected.has(item.id) ? ' picked' : ''}`;

  const box = document.createElement('div');
  box.className = 'box';
  box.textContent = selected.has(item.id) ? '✓' : '';
  row.appendChild(box);

  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = item.name;
  text.appendChild(name);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${item.rarity} — ${item.effects.map((fx) => fx.key).join(' · ') || 'no recorded effect'}`;
  text.appendChild(meta);
  row.appendChild(text);

  row.addEventListener('click', () => {
    if (selected.has(item.id)) {
      selected.delete(item.id);
    } else if (selected.size < TRINKET_SLOTS) {
      selected.add(item.id);
    }
    rerender();
  });

  return row;
}

export function dismissTrinketPicker(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}