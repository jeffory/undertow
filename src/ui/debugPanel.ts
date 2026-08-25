// DEBUG PANEL — T11 (plan 02 §10, spec 13.1). A DOM overlay behind ?debug that
// exposes exactly the six tuning dials from game/tuning.ts as live sliders with
// numeric readouts. Sliders mutate world.tuning in place; every system reads
// that same struct each frame, so changes apply live mid-fight with no restart.
// Overrides persist to localStorage (per-run override + R to reset to defaults).
// Alongside the dials: live readouts of tension / L / fish stamina / state and
// the session log's fight tallies. FPS / draw-call / tris stay in 01's existing
// top-left #debug overlay (the panel shares it, not duplicates it).

import type { WorldState } from '../core/world';
import { DEFAULT_TUNING } from '../game/tuning';
import type { TetherTuning } from '../game/tuning';
import { getSessionLog, sessionSummary } from '../playtest/tetherLog';
import { getSave } from '../core/save';

const DEBUG_FLAG =
  typeof location !== 'undefined' ? /[?&]debug/.test(location.search) : false;
const STORAGE_KEY = 'undertow.tuning';

interface DialDef {
  key: keyof TetherTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
}

const DIALS: DialDef[] = [
  { key: 'pullForce', label: 'pull force', min: 0, max: 12, step: 0.1, digits: 1 },
  { key: 'kTension', label: 'k tension', min: 0, max: 20, step: 0.1, digits: 1 },
  { key: 'slackDecay', label: 'slack decay', min: 0, max: 100, step: 1, digits: 0 },
  { key: 'braceEfficacy', label: 'brace efficacy', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'lungeTelegraph', label: 'lunge telegraph', min: 0, max: 3, step: 0.05, digits: 2 },
  { key: 'fishStaminaPool', label: 'fish stamina pool', min: 0.25, max: 3, step: 0.05, digits: 2 },
];

function clampDial(def: DialDef, v: number): number {
  return Math.min(def.max, Math.max(def.min, v));
}

// --- localStorage persistence --------------------------------------------------

function readStored(): Partial<Record<keyof TetherTuning, number>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const out: Partial<Record<keyof TetherTuning, number>> = {};
    for (const d of DIALS) {
      const v = parsed[d.key];
      if (typeof v === 'number' && Number.isFinite(v)) out[d.key] = clampDial(d, v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeStored(tuning: TetherTuning): void {
  try {
    const data: Record<string, number> = {};
    for (const d of DIALS) data[d.key] = tuning[d.key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — live in-memory tuning still works
  }
}

// --- DOM state ------------------------------------------------------------------

let built = false;
let rootEl: HTMLDivElement | null = null;
const sliders = new Map<keyof TetherTuning, HTMLInputElement>();
const dialReadouts = new Map<keyof TetherTuning, HTMLSpanElement>();
let liveEl: HTMLDivElement | null = null;
let talliesEl: HTMLDivElement | null = null;
let summaryEl: HTMLPreElement | null = null;
let lastSummary = '';

function resetTuning(world: WorldState): void {
  for (const d of DIALS) world.tuning[d.key] = DEFAULT_TUNING[d.key];
  writeStored(world.tuning);
  syncSliders(world);
}

function syncSliders(world: WorldState): void {
  for (const d of DIALS) {
    const s = sliders.get(d.key);
    const r = dialReadouts.get(d.key);
    if (s) s.value = String(world.tuning[d.key]);
    if (r) r.textContent = world.tuning[d.key].toFixed(d.digits);
  }
}

function buildPanel(world: WorldState): void {
  // Set the guard FIRST: if anything below ever threw, updateDebugPanel would
  // otherwise re-run the whole build (including the window keydown listener)
  // every frame.
  built = true;
  rootEl = document.createElement('div');
  rootEl.id = 'debug-panel';
  document.body.appendChild(rootEl);

  const style = document.createElement('style');
  style.textContent = `
    #debug-panel {
      position: fixed; top: 8px; right: 8px; z-index: 30;
      width: 250px; padding: 8px 10px;
      background: rgba(6, 10, 12, 0.82); border: 1px solid #2a3c46;
      color: #9fe8ae; font: 11px/1.5 ui-monospace, monospace;
      text-shadow: 0 1px 2px #000; pointer-events: auto; user-select: none;
    }
    #debug-panel .dp-title { color: #dfe9dc; margin-bottom: 6px; }
    #debug-panel .dp-dial { display: grid; grid-template-columns: 92px 1fr 46px;
      align-items: center; gap: 6px; margin: 3px 0; }
    #debug-panel .dp-dial input[type=range] { width: 100%; accent-color: #22c55e; }
    #debug-panel .dp-val { text-align: right; color: #fff; }
    #debug-panel .dp-row { margin-top: 6px; border-top: 1px solid #22303a;
      padding-top: 5px; white-space: nowrap; }
    #debug-panel .dp-summary { margin: 6px 0 0; white-space: pre-wrap; color: #7fbf8a; }
    #debug-panel .dp-reset { margin-top: 6px; font: 10px/1.4 monospace;
      background: #12242b; color: #9fe8ae; border: 1px solid #2a4a44; cursor: pointer; }
  `;
  document.head.appendChild(style);

  const title = document.createElement('div');
  title.className = 'dp-title';
  title.textContent = 'TUNING — six dials (R = reset)';
  rootEl.appendChild(title);

  for (const d of DIALS) {
    const row = document.createElement('div');
    row.className = 'dp-dial';

    const label = document.createElement('label');
    label.textContent = d.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.value = String(world.tuning[d.key]);

    const val = document.createElement('span');
    val.className = 'dp-val';
    val.textContent = world.tuning[d.key].toFixed(d.digits);

    input.addEventListener('input', () => {
      world.tuning[d.key] = parseFloat(input.value);
      val.textContent = world.tuning[d.key].toFixed(d.digits);
      writeStored(world.tuning);
    });

    sliders.set(d.key, input);
    dialReadouts.set(d.key, val);
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    rootEl.appendChild(row);
  }

  liveEl = document.createElement('div');
  liveEl.className = 'dp-row';
  rootEl.appendChild(liveEl);

  talliesEl = document.createElement('div');
  talliesEl.className = 'dp-row';
  rootEl.appendChild(talliesEl);

  summaryEl = document.createElement('pre');
  summaryEl.className = 'dp-summary';
  rootEl.appendChild(summaryEl);

  const reset = document.createElement('button');
  reset.className = 'dp-reset';
  reset.textContent = 'reset dials (R)';
  reset.addEventListener('click', () => resetTuning(world));
  rootEl.appendChild(reset);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') resetTuning(world);
  });

  // Re-apply persisted overrides on top of the defaults at boot.
  const stored = readStored();
  for (const [key, v] of Object.entries(stored) as [keyof TetherTuning, number][]) {
    world.tuning[key] = v;
  }
  syncSliders(world);
}

// --- per-frame readouts ----------------------------------------------------------

function updateReadouts(world: WorldState): void {
  const fight = world.tether.fights[0];
  const tension = fight ? fight.tension : 0;
  const L = fight ? fight.L : world.line.baseLength;
  const fish = world.fish;
  const maxSt = fish ? fish.tether.maxStamina : 0;
  const stamina = fish && maxSt > 0 ? Math.round((fish.stamina / maxSt) * 100) : -1;
  if (liveEl) {
    const save = getSave();
    const lic = save ? `G${save.license.grade} · ${Math.round(save.license.xp)}xp` : 'no save';
    liveEl.textContent =
      `tension ${tension.toFixed(1)} | L ${L.toFixed(2)} | ` +
      `fish ${stamina < 0 ? '—' : `${stamina}%`} | ${fish ? fish.state : 'no fish'} | ` +
      `license ${lic}`;
  }

  const log = getSessionLog();
  const t = log.tallies;
  if (talliesEl) {
    const dbg = document.getElementById('debug')?.textContent ?? '';
    const dc = /draw calls (\d+)/.exec(dbg)?.[1];
    talliesEl.textContent =
      `fights ${log.fights.length} · snap ${t.snaps} cut ${t.cuts} ` +
      `land ${t.lands} butcher ${t.butchers} · drags ${t.drags} ` +
      `lunges ${t.lunges} (${t.lungesDodged} dodged) · dc ${dc ?? 'n/a'}`;
  }

  const summary = sessionSummary();
  if (summaryEl && summary !== lastSummary) {
    lastSummary = summary;
    summaryEl.textContent = summary;
  }
}

// --- the ui-system seam ----------------------------------------------------------

export function updateDebugPanel(world: WorldState): void {
  if (!DEBUG_FLAG || typeof document === 'undefined') return;
  if (!built) buildPanel(world);
  syncSliders(world);
  updateReadouts(world);
}