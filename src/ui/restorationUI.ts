// RESTORATION LEDGER — "The Office of Public Works, Greywater Hollow" (plan 05
// §1.3, task t18 slice 4). A dry municipal register over the live shore, in the
// same paper-and-stamps idiom as the TRIBUTE RECEIPT (ui/runSummary.ts).
//
// It shows, for every building on docs/story/town.md's Main Street:
//   • the FORM code and its 2–3 notice lines, verbatim from the copy module
//   • the cost in Memories — highlighted when affordable NOW
//   • an Office-speak reason when the row is withheld by an order gate
//   • the restored stamp once the works are complete
// …plus the live twist readout at the head of the register: THE LAKE STIRS —
// what the town has already bought, and what the next restoration adds
// (plan §1.3: "telegraphed, not hidden").
//
// The door prompt (hold E at the lighthouse) lives here too, so the whole
// verb — prompt, register, payment — is one DOM module. The sim only ever sets
// `world.town.open` / `world.town.held` (systems/townDoor.ts); this reads them.
//
// DOM only: no `three`, no game logic (meta/restoration.ts owns the math).

import type { WorldState } from '../core/world';
import type { MetaState } from '../save/schemas';
import { BUILDINGS } from '../content/buildings';
import { townCopyFor } from '../content/townCopy';
import { getSave, updateSave } from '../core/save';
import {
  affordable,
  canRestore,
  dreadReadout,
  isRestored,
  restore,
  restoredCount,
  unlockState,
  type UnlockContext,
} from '../meta/restoration';
import { unlockContextFor } from '../meta/runMeta';
import { emitTownEvent } from '../meta/townEvents';
import { DOOR_HOLD_SECONDS } from '../systems/townDoor';
import { freshMetaState } from '../save/migrate';
import { renderRigUpInto } from './rigUpScreen';
import { renderDecantInto } from './decantScreen';
import { applyHubMeta } from '../render/hubAtmosphere';

let overlayEl: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null; // injected once, reused
let promptEl: HTMLDivElement | null = null;
let promptFill: HTMLDivElement | null = null;
// The world whose `town.open` the CLOSE button clears.
let pendingWorld: WorldState | null = null;

const STYLE = `
  #restoration {
    position: fixed; inset: 0; z-index: 110;
    display: flex; align-items: center; justify-content: center;
    background: rgba(2, 4, 6, 0.62);
    font: 13px/1.45 ui-monospace, 'Courier New', monospace;
    color: #241c12;
  }
  #restoration .register {
    width: 560px; max-height: 88vh; overflow: auto;
    background: #efe4c8;
    background-image:
      radial-gradient(ellipse 150px 100px at 88% 4%, rgba(110, 82, 42, 0.12), transparent 70%),
      radial-gradient(ellipse 180px 130px at 6% 96%, rgba(92, 72, 46, 0.10), transparent 70%),
      linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
    background-size: auto, auto, 22px 22px, 22px 22px;
    border: 1px solid #4a3a26;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 0 42px rgba(110, 82, 42, 0.09);
    padding: 22px 26px 18px;
    transform: rotate(-0.35deg);
  }
  #restoration .masthead {
    text-align: center; letter-spacing: 0.16em;
    color: #3a2c1a; font-size: 14px; font-weight: bold;
    border-bottom: 2px solid #4a3a26; padding-bottom: 6px;
  }
  #restoration .form-no {
    text-align: center; margin-top: 8px; font-size: 12px;
    letter-spacing: 0.12em; color: #7a2014; font-weight: bold;
  }
  #restoration .purse {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 12px; padding: 6px 8px; border: 1px dashed #6a5638; font-size: 12px;
  }
  #restoration .purse .amount { font-weight: bold; font-size: 15px; }
  #restoration .stirs {
    margin-top: 8px; padding: 6px 8px;
    border-left: 3px solid #7a2014; background: rgba(122, 32, 20, 0.06);
    color: #5a2418; font-size: 11px; letter-spacing: 0.05em;
  }
  #restoration .stirs b { font-size: 12px; }
  #restoration .row {
    margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(106, 86, 56, 0.45);
  }
  #restoration .row.affordable .name { color: #2a5c2a; }
  #restoration .row.done { opacity: 0.72; }
  #restoration .row.locked { opacity: 0.62; }
  #restoration .head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  #restoration .name { font-weight: bold; font-size: 13px; letter-spacing: 0.04em; }
  #restoration .cost { white-space: nowrap; font-size: 12px; color: #5a4630; }
  #restoration .row.affordable .cost { color: #2a5c2a; font-weight: bold; }
  #restoration .formcode { font-size: 10px; letter-spacing: 0.1em; color: #7a2014; margin-top: 3px; }
  #restoration .notice { font-size: 11px; color: #3a2c1a; margin-top: 4px; }
  #restoration .notice div { margin-top: 2px; }
  #restoration .benefit { font-size: 10px; color: #6a5638; margin-top: 4px; letter-spacing: 0.04em; }
  #restoration .withheld { font-size: 11px; color: #7a2014; margin-top: 5px; }
  #restoration .actions { margin-top: 7px; }
  #restoration button.pay {
    padding: 5px 14px; background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
    font: 11px/1.4 ui-monospace, monospace; letter-spacing: 0.16em;
  }
  #restoration button.pay:hover { background: #5c4a30; }
  #restoration button.pay[disabled] { background: #9c9078; cursor: not-allowed; }
  #restoration .short { font-size: 11px; color: #7a2014; }
  #restoration .stamp {
    display: inline-block; margin-top: 6px; padding: 3px 9px;
    border: 2px solid #2a5c2a; color: #2a5c2a;
    border-radius: 4px 7px 3px 8px / 7px 3px 8px 4px;
    font-size: 10px; font-weight: bold; letter-spacing: 0.12em;
    transform: rotate(-3deg); opacity: 0.88;
    background: rgba(42, 92, 42, 0.05);
    box-shadow: inset 0 0 7px rgba(42, 92, 42, 0.24);
  }
  #restoration .close {
    display: block; width: 100%; margin-top: 18px; padding: 8px 0;
    background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
    font: 12px/1.4 ui-monospace, monospace; letter-spacing: 0.2em;
  }
  #restoration .close:hover { background: #5c4a30; }
  #restoration .footnote { margin-top: 10px; text-align: center; font-size: 10px; color: #6a5638; }
  #restoration .door-nav { display: flex; gap: 8px; margin-top: 10px; }
  #restoration .door-nav button {
    flex: 1; padding: 6px 0; border: 1px solid #4a3a26; background: #efe4c8;
    color: #3a2c1a; cursor: pointer;
    font: 11px/1.3 ui-monospace, monospace; letter-spacing: 0.14em;
  }
  #restoration .door-nav button.active { background: #4a3a26; color: #efe4c8; font-weight: bold; }
  #restoration .door-nav button:hover:not(.active) { background: #e4d7b6; }

  #town-door {
    position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
    z-index: 40; width: 300px; padding: 10px 14px;
    background: rgba(6, 10, 12, 0.85); border: 1px solid #3a4c58;
    color: #e8dcc8; font: 12px/1.5 ui-monospace, monospace; text-align: center;
    letter-spacing: 0.12em; pointer-events: none; user-select: none;
  }
  #town-door .title { color: #ffcf8a; font-weight: bold; margin-bottom: 6px; }
  #town-door .bar { height: 4px; background: #22303a; margin: 8px 0 6px; }
  #town-door .bar > div { height: 100%; background: #ffcf8a; width: 0%; }
  #town-door .hint { font-size: 10px; color: #8fb0a8; letter-spacing: 0.06em; }
`;

function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
}

function currentMeta(): MetaState {
  return getSave()?.metaState ?? freshMetaState();
}

function currentContext(): UnlockContext {
  return unlockContextFor(getSave());
}

// The register's own run number: how many runs the ledger has seen (the Office
// stamps everything with a reference, and this one is honest).
function currentRunIndex(): number {
  return getSave()?.meta.runsCompleted ?? 0;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- the register --------------------------------------------------------------

function renderRegister(): void {
  if (!overlayEl) return;
  overlayEl.textContent = '';
  const meta = currentMeta();
  const ctx = currentContext();

  const register = el('div', 'register');
  overlayEl.appendChild(register);

  // The door's three-button register: the restoration ledger, the rig-up
  // requisition and the decant station share one masthead and one overlay
  // (plan 05 §1.2 "RESTORATION / RIG-UP"; §1.7's decant station is the third
  // door, task t21). Defaults to the restoration tab.
  const nav = el('div', 'door-nav');
  const restBtn = el('button', 'active', 'REGISTER OF RESTORATION') as HTMLButtonElement;
  const rigBtn = el('button', undefined, 'FORM 6-R · RIG-UP') as HTMLButtonElement;
  rigBtn.addEventListener('click', () => showRigUp());
  const decBtn = el('button', undefined, 'FORM 9-L · DECANT') as HTMLButtonElement;
  decBtn.addEventListener('click', () => showDecant());
  nav.appendChild(restBtn);
  nav.appendChild(rigBtn);
  nav.appendChild(decBtn);
  register.appendChild(nav);

  register.appendChild(el('div', 'masthead', 'THE OFFICE OF PUBLIC WORKS'));
  register.appendChild(el('div', 'form-no', '[REGISTER OF RESTORATION — GREYWATER HOLLOW]'));

  const purse = el('div', 'purse');
  purse.appendChild(el('span', undefined, 'MEMORIES ON DEPOSIT'));
  purse.appendChild(el('span', 'amount', String(meta.memories)));
  register.appendChild(purse);

  const read = dreadReadout(meta);
  const stirs = el('div', 'stirs');
  const stirsHead = el('b', undefined, `THE LAKE STIRS: +${read.current} STARTING DREAD`);
  stirs.appendChild(stirsHead);
  stirs.appendChild(
    el(
      'div',
      undefined,
      `Premises on the dry register: ${restoredCount(meta)}. ` +
        `The next restoration adds +${read.delta} (capped at +30).`,
    ),
  );
  register.appendChild(stirs);

  for (const def of BUILDINGS) {
    const copy = townCopyFor(def.id);
    const done = isRestored(meta, def.id);
    const unlock = unlockState(meta, def, ctx);
    const canPay = canRestore(meta, def.id, ctx).ok;

    const row = el('div', 'row');
    if (done) row.classList.add('done');
    else if (!unlock.unlocked) row.classList.add('locked');
    else if (affordable(meta, def)) row.classList.add('affordable');
    row.setAttribute('data-building', def.id);

    const head = el('div', 'head');
    head.appendChild(el('span', 'name', copy?.name ?? def.name));
    head.appendChild(el('span', 'cost', `${def.cost} MEMORIES`));
    row.appendChild(head);

    if (copy) {
      row.appendChild(el('div', 'formcode', copy.restorationNotice.formCode));
      const notice = el('div', 'notice');
      for (const line of copy.restorationNotice.noticeLines) {
        notice.appendChild(el('div', undefined, line));
      }
      row.appendChild(notice);
      row.appendChild(el('div', 'benefit', copy.benefitSummary));
    }

    if (done) {
      row.appendChild(el('div', 'stamp', `[${copy?.stampRestored ?? 'WORKS COMPLETE'}]`));
    } else if (!unlock.unlocked) {
      row.appendChild(el('div', 'withheld', unlock.reason));
    } else {
      const actions = el('div', 'actions');
      if (canPay) {
        const btn = el('button', 'pay', `PAY ${def.cost} — AUTHORIZE WORKS`) as HTMLButtonElement;
        btn.addEventListener('click', () => {
          void payFor(def.id);
        });
        actions.appendChild(btn);
      } else {
        actions.appendChild(
          el('span', 'short', `SHORT ${def.cost - meta.memories} MEMORIES — the works are deferred.`),
        );
      }
      row.appendChild(actions);
    }
    register.appendChild(row);
  }

  const close = el('button', 'close', 'CLOSE REGISTER') as HTMLButtonElement;
  close.addEventListener('click', () => {
    if (pendingWorld) pendingWorld.town.open = false;
  });
  register.appendChild(close);
  register.appendChild(
    el(
      'div',
      'footnote',
      'The Office thanks you for your continued custodianship. Do not stop fishing.',
    ),
  );
}

// The three panels are one overlay: each switcher re-renders the whole
// #restoration node and hands the others back as callbacks, so the nav works
// from whichever register is up.
function showRigUp(): void {
  if (!overlayEl || !pendingWorld) return;
  renderRigUpInto(overlayEl, pendingWorld, () => renderRegister(), () => showDecant());
}

function showDecant(): void {
  if (!overlayEl || !pendingWorld) return;
  renderDecantInto(overlayEl, pendingWorld, {
    onSwitchToRestoration: () => renderRegister(),
    onSwitchToRigUp: () => showRigUp(),
  });
}

// Pay, persist, re-render in place. The write goes through core/save's
// updateSave so the IndexedDB row and the in-memory singleton never diverge.
async function payFor(id: string): Promise<void> {
  const save = getSave();
  if (!save) return;
  const result = restore(save.metaState, id, {
    atRun: currentRunIndex(),
    ctx: unlockContextFor(save),
  });
  if (!result.ok) return;
  if (result.event) emitTownEvent(result.event);
  await updateSave((s) => ({ ...s, metaState: result.meta }));
  // 05 §1.1: the shore water reddens with every restoration (and the beam keeps
  // whatever the decants left it) — one seam, pushed the frame the works close.
  applyHubMeta(result.meta);
  renderRegister();
}

export function showRestorationUI(world: WorldState): void {
  if (typeof document === 'undefined') return;
  ensureStyle();
  dismissRestorationUI();
  pendingWorld = world;
  overlayEl = document.createElement('div');
  overlayEl.id = 'restoration';
  document.body.appendChild(overlayEl);
  renderRegister();
}

export function dismissRestorationUI(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

export function isRestorationUIOpen(): boolean {
  return overlayEl !== null;
}

// --- the door prompt ------------------------------------------------------------

function ensurePrompt(): void {
  if (promptEl || typeof document === 'undefined') return;
  ensureStyle();
  promptEl = document.createElement('div');
  promptEl.id = 'town-door';
  promptEl.appendChild(el('div', 'title', 'THE OFFICE OF PUBLIC WORKS'));
  const bar = el('div', 'bar');
  promptFill = el('div') as HTMLDivElement;
  bar.appendChild(promptFill);
  promptEl.appendChild(bar);
  promptEl.appendChild(el('div', 'hint', 'HOLD E — OFFICE DOOR'));
  document.body.appendChild(promptEl);
}

// The ui-system entry point: mirror world.town.open onto the DOM, and show the
// doorstep prompt whenever the keeper is at the door with the register closed.
export function updateRestorationUI(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const town = world.town;

  if (town.open && !overlayEl) showRestorationUI(world);
  if (!town.open && overlayEl) dismissRestorationUI();

  const showPrompt = town.near && !town.open;
  if (!showPrompt) {
    if (promptEl) promptEl.style.display = 'none';
    return;
  }
  ensurePrompt();
  if (promptEl) promptEl.style.display = 'block';
  if (promptFill) {
    const p = Math.min(1, town.held / DOOR_HOLD_SECONDS);
    promptFill.style.width = `${(p * 100).toFixed(1)}%`;
  }
}
