// RUN SUMMARY — the municipal-invoice overlays (task t12 #4, docs/story/voice.md).
// Extraction → an itemized TRIBUTE RECEIPT (100% of the haul); death → the
// Office's OFFICE OF CONDOLENCE (30% per item, floored). Both carry the same
// fields: form number, REF, per-item lines, the Memories total, the phase the
// run ended on, peak Dread, and the seed. DISCHARGE dismisses the overlay and
// starts a fresh run (new seed). DOM only — the logic lives in run/run.ts.

import type { WorldState } from '../core/world';
import type { RunResult } from '../save/schemas';
import { startNewRun } from '../run/run';
import { applyRunStartPassives } from '../loot/runStart';
import { GRADE_TITLES } from '../loot/license';

let overlayEl: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null; // injected once — reused across runs

export interface RunSummaryOptions {
  licenseGrade?: number; // Keeper's License grade line (task t19 §4)
  onDischarge?: () => void; // the run-terminal flow (grade-up letter → picker → run)
}

const PHASE_LABEL: Record<string, string> = {
  dusk: 'DUSK',
  night: 'NIGHT',
  deepNight: 'DEEP NIGHT',
  falseDawn: 'FALSE DAWN',
};

function stamp(): number {
  return (Math.random() * 100000) | 0;
}

function tierWord(tier: number): string {
  return ['', 'I', 'II', 'III', 'IV'][tier] ?? String(tier);
}

export function showRunSummary(
  world: WorldState,
  result: RunResult,
  extracted: boolean,
  opts: RunSummaryOptions = {},
): void {
  if (typeof document === 'undefined') return;
  dismissRunSummary(); // never stack overlays

  const licenseGrade = opts.licenseGrade ?? 1;

  const root = document.createElement('div');
  root.id = 'run-summary';
  document.body.appendChild(root);

  // The stylesheet targets stable #run-summary selectors, so it is injected
  // once and reused — appending a fresh copy per run end leaked one ~2.5KB
  // <style> node into <head> every run, forever.
  const style = styleEl ?? document.createElement('style');
  style.textContent = `
    #run-summary {
      position: fixed; inset: 0; z-index: 100;
      display: flex; align-items: center; justify-content: center;
      background: rgba(2, 4, 6, 0.6);
      font: 13px/1.45 ui-monospace, 'Courier New', monospace;
      color: #241c12;
    }
    #run-summary .invoice {
      width: 460px; max-height: 86vh; overflow: auto;
      background: #efe4c8;
      /* water stains + a cup ring over the ruled grid — the Office's copies
         have been damp for thirty years (TODO.md paperwork grunge) */
      background-image:
        radial-gradient(ellipse 130px 90px at 82% 6%, rgba(110, 82, 42, 0.13), transparent 70%),
        radial-gradient(ellipse 170px 120px at 8% 92%, rgba(92, 72, 46, 0.11), transparent 70%),
        radial-gradient(circle 58px at 74% 78%, transparent 62%, rgba(110, 82, 42, 0.14) 68%, transparent 76%),
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: auto, auto, auto, 22px 22px, 22px 22px;
      border: 1px solid #4a3a26;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 0 42px rgba(110, 82, 42, 0.09);
      padding: 22px 26px;
      transform: rotate(-0.55deg);
    }
    #run-summary .masthead {
      text-align: center; letter-spacing: 0.18em;
      color: #3a2c1a; font-size: 14px; font-weight: bold;
      border-bottom: 2px solid #4a3a26; padding-bottom: 6px;
    }
    #run-summary .form-no {
      text-align: center; margin-top: 8px; font-size: 13px;
      letter-spacing: 0.12em; color: #7a2014; font-weight: bold;
    }
    #run-summary .form-no.condolence { color: #3a1a3a; }
    #run-summary .reline {
      margin-top: 4px; text-align: center; color: #5a4630; font-size: 11px;
    }
    #run-summary table { width: 100%; margin: 14px 0 10px; border-collapse: collapse; }
    #run-summary th {
      text-align: left; font-size: 10px; letter-spacing: 0.1em;
      color: #6a5638; border-bottom: 1px solid #6a5638; padding: 2px 4px;
    }
    #run-summary td { padding: 3px 4px; border-bottom: 1px solid rgba(106, 86, 56, 0.35); }
    #run-summary td.num, #run-summary th.num { text-align: right; }
    #run-summary .clean-mark { color: #2a5c2a; }
    #run-summary .total { text-align: right; font-size: 14px; font-weight: bold;
      margin: 10px 0 2px; border-top: 2px solid #4a3a26; padding-top: 8px; }
    #run-summary .ledger { margin-top: 10px; font-size: 11px; color: #5a4630; }
    #run-summary .ledger div { display: flex; justify-content: space-between; }
    #run-summary .sundries { margin-top: 12px; border-top: 1px solid #6a5638; padding-top: 8px; }
    #run-summary .sundries-head {
      font-size: 10px; letter-spacing: 0.14em; color: #6a5638; font-weight: bold;
      margin-bottom: 4px;
    }
    #run-summary .sundries div { display: flex; justify-content: space-between; font-size: 11px; }
    #run-summary .sundries .rar { color: #7a2014; font-weight: bold; letter-spacing: 0.08em; }
    #run-summary .license-line {
      margin-top: 8px; padding: 6px 8px; border: 1px dashed #6a5638;
      font-size: 11px; display: flex; justify-content: space-between; color: #3a2c1a;
    }
    #run-summary .stamp {
      margin: 14px 0 4px; padding: 4px 10px; display: inline-block;
      border: 2px solid #8a2014; color: #8a2014;
      border-radius: 4px 7px 3px 8px / 7px 3px 8px 4px; /* uneven worn die */
      font-size: 12px; font-weight: bold; letter-spacing: 0.16em;
      transform: rotate(-4deg); opacity: 0.85;
      background: rgba(138, 32, 20, 0.05);
      box-shadow: inset 0 0 7px rgba(138, 32, 20, 0.28); /* blotted ink edge */
      text-shadow: 0.6px 0.6px 0 rgba(138, 32, 20, 0.35);
    }
    #run-summary .stamp.ok { border-color: #2a5c2a; color: #2a5c2a; }
    #run-summary .discharge {
      display: block; width: 100%; margin-top: 16px; padding: 8px 0;
      background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
      font: 12px/1.4 ui-monospace, monospace; letter-spacing: 0.2em;
    }
    #run-summary .discharge:hover { background: #5c4a30; }
    #run-summary .seed { margin-top: 8px; text-align: center; font-size: 10px; color: #6a5638; }
  `;
  if (!styleEl) {
    document.head.appendChild(style);
    styleEl = style;
  }

  const invoice = document.createElement('div');
  invoice.className = 'invoice';
  root.appendChild(invoice);

  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'THE OFFICE OF RETURNS';
  invoice.appendChild(mast);

  const form = document.createElement('div');
  form.className = `form-no${extracted ? '' : ' condolence'}`;
  form.textContent = extracted
    ? `[TRIBUTE RECEIPT]`
    : `[OFFICE OF CONDOLENCE — RATE ${Math.round((result.memoriesTotal / Math.max(1, result.haul.length)) * 10) / 10} PER ITEM]`;
  invoice.appendChild(form);

  const reline = document.createElement('div');
  reline.className = 'reline';
  reline.textContent = `[RE: REF-${String(stamp()).padStart(4, '0')} · SEED ${result.seed} · PHASE ${PHASE_LABEL[result.clockPhaseEnd] ?? result.clockPhaseEnd}]`;
  invoice.appendChild(reline);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const [label, cls] of [
    ['ITEM', ''],
    ['TIER', 'num'],
    ['WGT', 'num'],
    ['MEM', 'num'],
  ] as const) {
    const th = document.createElement('th');
    th.className = cls;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const rec of result.haul) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = `one (1) ${rec.species}, damp`;
    if (rec.clean) name.classList.add('clean-mark');
    row.appendChild(name);
    const tier = document.createElement('td');
    tier.className = 'num';
    tier.textContent = tierWord(rec.tier);
    row.appendChild(tier);
    const wgt = document.createElement('td');
    wgt.className = 'num';
    wgt.textContent = `${rec.weight.toFixed(1)} kg`;
    row.appendChild(wgt);
    const mem = document.createElement('td');
    mem.className = 'num';
    mem.textContent = extracted
      ? `${rec.memories}`
      : `${Math.floor(rec.memories * 0.3)}/30%`;
    row.appendChild(mem);
    tbody.appendChild(row);
  }
  if (result.haul.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'the boat returns empty.';
    cell.style.color = '#6a5638';
    row.appendChild(cell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  invoice.appendChild(table);

  const total = document.createElement('div');
  total.className = 'total';
  total.textContent = extracted
    ? `MEMORIES DELIVERED  ${result.memoriesTotal}`
    : `MEMORIES RETAINED   ${result.memoriesTotal}  (30%)`;
  invoice.appendChild(total);

  // SUNDRIES RECOVERED (task t19 §3): the run's looted items, listed under their
  // own schedule on the invoice. The box keeps them for the pre-run picker.
  if ((result.sundries ?? []).length > 0) {
    const sundries = document.createElement('div');
    sundries.className = 'sundries';
    const head = document.createElement('div');
    head.className = 'sundries-head';
    head.textContent = 'SUNDRIES RECOVERED';
    sundries.appendChild(head);
    for (const item of result.sundries ?? []) {
      const row = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = `one (1) ${item.name}`;
      row.appendChild(name);
      const rar = document.createElement('span');
      rar.className = 'rar';
      rar.textContent = item.rarity;
      row.appendChild(rar);
      sundries.appendChild(row);
    }
    invoice.appendChild(sundries);
  }

  // Keeper's License grade line (task t19 §4).
  const lic = document.createElement('div');
  lic.className = 'license-line';
  const licLabel = document.createElement('span');
  licLabel.textContent = 'KEEPER\'S LICENSE';
  lic.appendChild(licLabel);
  const licVal = document.createElement('span');
  licVal.textContent = `GRADE ${licenseGrade} — ${GRADE_TITLES[licenseGrade] ?? ''}`.replace(/\s+/g, ' ').trim();
  lic.appendChild(licVal);
  invoice.appendChild(lic);

  const ledger = document.createElement('div');
  ledger.className = 'ledger';
  const phaseRow = document.createElement('div');
  phaseRow.textContent = 'Phase of conclusion';
  const phaseVal = document.createElement('span');
  phaseVal.textContent = PHASE_LABEL[result.clockPhaseEnd] ?? result.clockPhaseEnd;
  phaseRow.appendChild(phaseVal);
  ledger.appendChild(phaseRow);
  const dreadRow = document.createElement('div');
  dreadRow.textContent = 'Peak Dread';
  const dreadVal = document.createElement('span');
  dreadVal.textContent = `${result.dreadPeak.toFixed(0)} / 100`;
  dreadRow.appendChild(dreadVal);
  ledger.appendChild(dreadRow);
  const startRow = document.createElement('div');
  startRow.textContent = 'Opened the water at Dread';
  const startVal = document.createElement('span');
  startVal.textContent = `${result.startedAtDread.toFixed(0)}`;
  startRow.appendChild(startVal);
  ledger.appendChild(startRow);
  invoice.appendChild(ledger);

  const stampEl = document.createElement('div');
  stampEl.className = `stamp${extracted ? ' ok' : ''}`;
  stampEl.textContent = extracted ? '[AUDITED · DELIVERY CONFIRMED]' : '[RESTRICTED. NICE TRY.]';
  invoice.appendChild(stampEl);

  const seedEl = document.createElement('div');
  seedEl.className = 'seed';
  seedEl.textContent = `undertow-${result.seed}${result.source === 'daily' ? '-daily' : ''}`;
  invoice.appendChild(seedEl);

  const discharge = document.createElement('button');
  discharge.className = 'discharge';
  discharge.textContent = extracted ? 'DISCHARGE' : 'ACCEPT';
  discharge.addEventListener('click', () => {
    dismissRunSummary();
    if (opts.onDischarge) {
      opts.onDischarge();
    } else {
      // default: straight into the fresh run, passives applied at start
      startNewRun(world);
      applyRunStartPassives(world);
    }
  });
  invoice.appendChild(discharge);

  overlayEl = root;
}

export function dismissRunSummary(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}