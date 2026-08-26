// THE CONGREGATION INVOICE — the boss-climax overlay (M6, plan 05 §2.1: "the
// Invoice overlay plays: ledger rows … descending into silence. The laughter
// stops at row 47.").
//
// PRESENTATION ONLY. The burst is already in world.run.haul by the time the
// first row lands — systems/congregation.ts banked it on the LAND event. This
// file reads `world.congregation.invoice` (rowIndex, done) and paints it. The
// clock lives in the sim so the ledger descends at the same rate however the
// frames batch, and so ?timescale drivers can read it out fast.
//
// Same paper as the TRIBUTE RECEIPT (ui/runSummary.ts): the Office has one
// stationery budget. DOM only.

import type { WorldState } from '../core/world';
import {
  INVOICE_MASTHEAD,
  INVOICE_CLOSING_STAMP,
  TOTAL_ACCOUNTS,
  buildInvoiceRows,
  type CongregationInvoiceRow,
} from '../content/congregationInvoice';
import { INVOICE_SKIPPABLE_AFTER_ROW } from '../bosses/congregation';

let overlayEl: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let listEl: HTMLDivElement | null = null;
let stampEl: HTMLDivElement | null = null;
let hintEl: HTMLDivElement | null = null;
let rows: CongregationInvoiceRow[] = [];
let painted = 0;

const CSS = `
  #congregation-invoice {
    position: fixed; inset: 0; z-index: 110;
    display: flex; align-items: center; justify-content: center;
    background: rgba(2, 4, 6, 0.72);
    font: 12px/1.5 ui-monospace, 'Courier New', monospace;
    color: #241c12; pointer-events: none;
  }
  #congregation-invoice .sheet {
    width: 600px; max-height: 82vh; overflow: hidden;
    display: flex; flex-direction: column;
    background: #efe4c8;
    background-image:
      radial-gradient(ellipse 150px 100px at 88% 4%, rgba(110, 82, 42, 0.13), transparent 70%),
      radial-gradient(ellipse 190px 130px at 6% 96%, rgba(92, 72, 46, 0.11), transparent 70%),
      linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
    background-size: auto, auto, 22px 22px, 22px 22px;
    border: 1px solid #4a3a26;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65), inset 0 0 42px rgba(110, 82, 42, 0.09);
    padding: 20px 24px 16px;
    transform: rotate(-0.4deg);
  }
  #congregation-invoice .form-no {
    text-align: center; font-size: 12px; font-weight: bold;
    letter-spacing: 0.11em; color: #7a2014;
  }
  #congregation-invoice .masthead {
    text-align: center; letter-spacing: 0.14em; font-size: 11px;
    color: #3a2c1a; border-bottom: 2px solid #4a3a26; padding-bottom: 7px;
  }
  #congregation-invoice .rows {
    margin-top: 10px; overflow: hidden; flex: 1 1 auto;
    display: flex; flex-direction: column; justify-content: flex-end;
  }
  #congregation-invoice .row {
    padding: 2px 2px; border-bottom: 1px solid rgba(106, 86, 56, 0.28);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    animation: cong-descend 220ms ease-out;
  }
  @keyframes cong-descend {
    from { opacity: 0; transform: translateY(-7px); }
    to { opacity: 1; transform: none; }
  }
  /* the eight named rows are the payload — they wrap rather than truncate */
  #congregation-invoice .row.seeded {
    color: #3a2c1a; font-weight: bold; white-space: normal; text-overflow: clip;
  }
  #congregation-invoice .row.tone-unsettling { color: #4a3320; }
  #congregation-invoice .row.tone-tragic { color: #5a2418; }
  #congregation-invoice .row.tone-terminal {
    color: #7a2014; letter-spacing: 0.04em; border-bottom-color: #7a2014;
  }
  #congregation-invoice .stamp {
    margin: 12px auto 0; padding: 6px 10px; display: none; max-width: 100%;
    border: 2px solid #8a2014; color: #8a2014;
    border-radius: 4px 7px 3px 8px / 7px 3px 8px 4px;
    font-size: 10px; font-weight: bold; letter-spacing: 0.09em; text-align: center;
    transform: rotate(-2.4deg); opacity: 0.88;
    background: rgba(138, 32, 20, 0.05);
    box-shadow: inset 0 0 7px rgba(138, 32, 20, 0.28);
    white-space: normal;
  }
  #congregation-invoice .stamp.up { display: block; }
  #congregation-invoice .hint {
    margin-top: 9px; text-align: center; font-size: 10px;
    letter-spacing: 0.16em; color: #6a5638; visibility: hidden;
  }
  #congregation-invoice .hint.up { visibility: visible; }
`;

// The rows only ever fit so many on the sheet — the ledger DESCENDS, so the
// oldest scroll off the top and the newest is always the one you are reading.
const VISIBLE_ROWS = 14;

function build(world: WorldState): void {
  if (typeof document === 'undefined') return;
  dismissCongregationInvoice();

  rows = buildInvoiceRows(world.congregation.invoice.fillers);
  painted = 0;

  const root = document.createElement('div');
  root.id = 'congregation-invoice';
  document.body.appendChild(root);

  const style = styleEl ?? document.createElement('style');
  style.textContent = CSS;
  if (!styleEl) {
    document.head.appendChild(style);
    styleEl = style;
  }

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  root.appendChild(sheet);

  const form = document.createElement('div');
  form.className = 'form-no';
  form.textContent = INVOICE_MASTHEAD[0] ?? '';
  sheet.appendChild(form);

  const mast = document.createElement('div');
  mast.className = 'masthead';
  for (const line of INVOICE_MASTHEAD.slice(1)) {
    const div = document.createElement('div');
    div.textContent = line;
    mast.appendChild(div);
  }
  sheet.appendChild(mast);

  const list = document.createElement('div');
  list.className = 'rows';
  sheet.appendChild(list);
  listEl = list;

  const st = document.createElement('div');
  st.className = 'stamp';
  st.textContent = INVOICE_CLOSING_STAMP;
  sheet.appendChild(st);
  stampEl = st;

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = '[E] — ACKNOWLEDGE REMAINDER';
  sheet.appendChild(hint);
  hintEl = hint;

  overlayEl = root;
}

function paintTo(index: number): void {
  if (!listEl) return;
  while (painted < index && painted < rows.length) {
    const row = rows[painted]!;
    const el = document.createElement('div');
    el.className = `row tone-${row.tone}${row.seeded ? ' seeded' : ''}`;
    el.dataset.account = String(row.accountNumber);
    el.textContent = row.entryText;
    listEl.appendChild(el);
    painted++;
    while (listEl.childElementCount > VISIBLE_ROWS) {
      listEl.removeChild(listEl.firstChild!);
    }
  }
}

export function dismissCongregationInvoice(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  listEl = null;
  stampEl = null;
  hintEl = null;
  rows = [];
  painted = 0;
}

// The ui-system hook. Mirrors the sim state and nothing else.
export function updateCongregationInvoice(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const inv = world.congregation.invoice;
  if (!inv.active) {
    if (overlayEl) dismissCongregationInvoice();
    return;
  }
  if (!overlayEl) build(world);
  paintTo(Math.min(inv.rowIndex, TOTAL_ACCOUNTS));
  if (stampEl) stampEl.classList.toggle('up', inv.done);
  if (hintEl) {
    hintEl.classList.toggle('up', inv.rowIndex >= INVOICE_SKIPPABLE_AFTER_ROW);
  }
}
