// OPTIONS MENU (ui) — task t12 #1. CIRCULAR 4: 'ADJUSTMENT OF GAUGES &
// TOLERANCES'. A DOM overlay over the live scene, reachable from the title
// screen's CIRCULAR 4 form and, while playing, from Esc. Same municipal-paper
// voice as titleScreen.ts. The sim keeps running underneath (pointer-events
// overlay); a capture-phase key blocker stops gameplay input while it is up —
// the same pattern titleScreen.ts uses for its shell.
//
// Copy is verbatim from docs/story/title-menu.md §3.
//
// LIVE settings (applied to real seams + persisted to localStorage):
//   - SCHEDULE A  Resolution of Basin Survey  (render scale → renderer pixel ratio)
//   - SCHEDULE A  Permissible Murk Level      (fog density multiplier → sky.ts lerp)
//   - SCHEDULE A  Chromatic Dispersion & Lens Staining (post pass on/off → post.ts)
//   - SCHEDULE C  Reel Stance Mode            (hold/toggle RMB latch → game/input.ts)
// Everything else renders its verbatim label but is inert, stamped
// 'AWAITING INSTALLATION' (audio has no system yet; the tilt/palette/dampener
// rows have no seam this task wires).

import { setRenderScale } from '../render/renderer';
import { setFogDensityScale } from '../render/sky';
import { setPostEnabled } from '../render/post';
import { setReelStance } from '../game/input';

const OPTIONS_KEY = 'undertow.options.v1';

export interface UndertowOptions {
  // Resolution of Basin Survey — 0.5x / 0.75x / 1.0x
  renderScale: number;
  // Permissible Murk Level — Low / Standard / Heavy (multiplier on the phase fog)
  fogDensityScale: number;
  // Chromatic Dispersion & Lens Staining — On / Off
  postEnabled: boolean;
  // Reel Stance Mode — Hold RMB / Toggle RMB
  reelStance: 'hold' | 'toggle';
}

// Defaults = current boot behaviour.
const DEFAULTS: UndertowOptions = {
  renderScale: 1,
  fogDensityScale: 1,
  postEnabled: true,
  reelStance: 'hold',
};

const RENDER_SCALES = [0.5, 0.75, 1];
const FOG_DENSITY_SCALES = [0.7, 1.0, 1.4];

// --- pure options state -------------------------------------------------------

export function defaultOptions(): UndertowOptions {
  return { ...DEFAULTS };
}

// A corrupt / unknown / future row never clobbers the runnable defaults — each
// field falls back independently (same spirit as save.ts's migrate).
export function sanitizeOptions(raw: unknown): UndertowOptions {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const renderScale = RENDER_SCALES.includes(o.renderScale as number)
    ? (o.renderScale as number)
    : DEFAULTS.renderScale;
  const fogDensityScale = FOG_DENSITY_SCALES.includes(o.fogDensityScale as number)
    ? (o.fogDensityScale as number)
    : DEFAULTS.fogDensityScale;
  const postEnabled =
    typeof o.postEnabled === 'boolean' ? o.postEnabled : DEFAULTS.postEnabled;
  const reelStance = o.reelStance === 'toggle' ? 'toggle' : DEFAULTS.reelStance;
  return { renderScale, fogDensityScale, postEnabled, reelStance };
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // denied access (private mode etc.)
  }
}

export function loadOptions(storage?: StorageLike): UndertowOptions {
  const s = storage ?? browserStorage();
  if (!s) return defaultOptions();
  try {
    const raw = s.getItem(OPTIONS_KEY);
    if (!raw) return defaultOptions();
    return sanitizeOptions(JSON.parse(raw));
  } catch {
    return defaultOptions();
  }
}

export function saveOptions(o: UndertowOptions, storage?: StorageLike): void {
  const s = storage ?? browserStorage();
  if (!s) return;
  try {
    s.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    /* private mode — settings just won't persist */
  }
}

// Push an options row into the seams. Additive seams only: renderer/sky/post/
// input each export a tiny setter, nothing in core/systems.ts or core/world.ts.
export function applyOptions(o: UndertowOptions): void {
  setRenderScale(o.renderScale);
  setFogDensityScale(o.fogDensityScale);
  setPostEnabled(o.postEnabled);
  setReelStance(o.reelStance);
}

// Boot-time one-liner (main.ts): load + apply whatever is stored.
export function applySavedOptions(storage?: StorageLike): void {
  applyOptions(loadOptions(storage));
}

// --- DOM overlay --------------------------------------------------------------

let root: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let keyBlocker: ((e: KeyboardEvent) => void) | null = null;
let globalBound = false;

// True while the title shell / story cards / annotate are up — Esc must not
// yank the options menu over them. titleScreen.ts drives this flag.
let blocked = false;

let current: UndertowOptions = loadOptions();

export function setOptionsMenuBlocked(b: boolean): void {
  blocked = b;
}

export function optionsMenuOpen(): boolean {
  return root !== null;
}

// Capture-phase blocker (titleScreen.ts pattern): gameplay key listeners on the
// window bubble phase never see keys while the menu is up. The sim keeps running.
function blockGameKeys(on: boolean): void {
  if (on && !keyBlocker) {
    keyBlocker = (e: KeyboardEvent) => {
      if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', keyBlocker, true);
    window.addEventListener('keyup', keyBlocker, true);
  } else if (!on && keyBlocker) {
    window.removeEventListener('keydown', keyBlocker, true);
    window.removeEventListener('keyup', keyBlocker, true);
    keyBlocker = null;
  }
}

// In-game Esc: opens the menu while playing, closes it while open. Never fires
// while the shell/cards/annotate block it, and never hijacks a focused text
// field (the QA annotate composer discards with Esc on its own textarea).
function onGlobalKey(e: KeyboardEvent): void {
  if (e.code !== 'Escape') return;
  if (root) {
    e.stopPropagation();
    closeOptionsMenu();
    return;
  }
  if (blocked) return;
  const ae = document.activeElement;
  if (
    ae &&
    (ae.tagName === 'INPUT' ||
      ae.tagName === 'TEXTAREA' ||
      (ae as HTMLElement).isContentEditable)
  ) {
    return;
  }
  e.stopPropagation();
  openOptionsMenu();
}

// Registered once at boot (main.ts) — always, in every mode.
export function initOptionsMenu(): void {
  if (globalBound) return;
  globalBound = true;
  window.addEventListener('keydown', onGlobalKey, true);
}

function injectStyle(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    #options-screen {
      position: fixed; inset: 0; z-index: 230;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at 50% 58%, rgba(2,4,6,0.30) 0%, rgba(2,4,6,0.80) 80%);
      font-family: Georgia, 'Times New Roman', serif;
      color: #d8d2c4; user-select: none; cursor: default;
    }
    #options-screen .ledger {
      width: 34rem; max-height: 88vh; overflow: auto;
      background: #efe4c8; color: #2a241a; border: 1px solid #b8a880;
      padding: 1.4rem 1.8rem 1.1rem;
      box-shadow: 0 10px 34px rgba(0,0,0,0.65);
      transform: rotate(-0.3deg);
    }
    #options-screen .code {
      font-size: 0.62rem; letter-spacing: 0.18em; color: #6a5a3a;
    }
    #options-screen .masthead {
      font-size: 1.05rem; letter-spacing: 0.05em; font-weight: bold;
      color: #3a2c1a; border-bottom: 2px solid #4a3a26; padding-bottom: 0.4rem;
    }
    #options-screen .sched {
      margin-top: 1.1rem; font-size: 0.62rem; letter-spacing: 0.2em;
      font-weight: bold; color: #8a2f22; border-bottom: 1px solid #b8a880;
      padding-bottom: 0.25rem;
    }
    #options-screen .row {
      display: flex; align-items: center; gap: 0.7rem;
      padding: 0.45rem 0; border-bottom: 1px dashed #c8b890;
    }
    #options-screen .row .copy { flex: 1; min-width: 0; }
    #options-screen .row .label {
      font-size: 0.74rem; letter-spacing: 0.05em; font-weight: bold;
      color: #2a241a;
    }
    #options-screen .row .subtext {
      font-size: 0.62rem; font-style: italic; color: #6a5a3a;
    }
    #options-screen .opts { display: flex; gap: 0.3rem; flex-shrink: 0; }
    #options-screen .opt {
      font-family: inherit; font-size: 0.6rem; letter-spacing: 0.05em;
      background: #ddd0b0; color: #5a4e38; border: 1px solid #b8a880;
      padding: 0.22rem 0.5rem; cursor: pointer;
    }
    #options-screen .opt:hover:not(.on) { background: #e8dcbe; }
    #options-screen .opt.on {
      background: #4a3a26; color: #efe4c8; border-color: #4a3a26;
    }
    #options-screen .stamp {
      flex-shrink: 0; font-size: 0.56rem; letter-spacing: 0.14em; font-weight: bold;
      color: #8a2f22; border: 1.5px solid #8a2f22; padding: 0.08rem 0.3rem;
      transform: rotate(3deg); opacity: 0.8; white-space: nowrap;
    }
    #options-screen .row.inert .label { color: #6a5a3a; }
    #options-screen .foot {
      margin-top: 1.1rem; font-size: 0.6rem; letter-spacing: 0.2em;
      color: #6a7672; text-align: center;
    }
    #options-screen .return {
      display: block; width: 100%; margin-top: 0.7rem; padding: 0.5rem 0;
      background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
      font-family: inherit; font-size: 0.66rem; letter-spacing: 0.2em;
    }
    #options-screen .return:hover { background: #5c4a30; }
  `;
  document.head.appendChild(styleEl);
}

// --- row model (labels verbatim from title-menu.md §3) ------------------------

interface RowSpec {
  label: string; // the poetic name (italic in the bible) — kept verbatim
  subtext: string; // the plain setting name (prefix in the bible) — kept verbatim
  kind: 'live' | 'inert';
  stamp?: string;
  value?: string;
  options?: { text: string; apply: () => void; selected: () => boolean }[];
}

function setAndSave(patch: Partial<UndertowOptions>): void {
  current = { ...current, ...patch };
  applyOptions(current);
  saveOptions(current);
  // Re-render so the active segment highlights move.
  renderMenu();
}

function renderRow(row: RowSpec): HTMLElement {
  const el = document.createElement('div');
  el.className = `row${row.kind === 'inert' ? ' inert' : ''}`;

  const copy = document.createElement('div');
  copy.className = 'copy';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = row.label;
  const subtext = document.createElement('div');
  subtext.className = 'subtext';
  subtext.textContent = row.subtext;
  copy.append(label, subtext);
  el.appendChild(copy);

  if (row.kind === 'live' && row.options) {
    const opts = document.createElement('div');
    opts.className = 'opts';
    for (const opt of row.options) {
      const b = document.createElement('button');
      b.className = `opt${opt.selected() ? ' on' : ''}`;
      b.textContent = opt.text;
      b.addEventListener('click', opt.apply);
      opts.appendChild(b);
    }
    el.appendChild(opts);
  } else {
    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.textContent = row.stamp ?? 'AWAITING INSTALLATION';
    el.appendChild(stamp);
  }
  return el;
}

function schedule(header: string, rows: RowSpec[]): HTMLElement {
  const sec = document.createElement('div');
  const h = document.createElement('div');
  h.className = 'sched';
  h.textContent = header;
  sec.appendChild(h);
  for (const r of rows) sec.appendChild(renderRow(r));
  return sec;
}

function renderMenu(): void {
  if (!root) return;

  const ledger = root.querySelector('.ledger');
  if (!ledger) return;
  ledger.innerHTML = '';

  const code = document.createElement('div');
  code.className = 'code';
  code.textContent = 'CIRCULAR 4';
  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'ADJUSTMENT OF GAUGES & TOLERANCES';
  ledger.append(code, mast);

  ledger.appendChild(
    schedule('SCHEDULE A: OPTICAL GAUGES', [
      {
        label: 'RESOLUTION OF BASIN SURVEY',
        subtext: 'Render Scale',
        kind: 'live',
        options: RENDER_SCALES.map((s) => ({
          text: s === 1 ? '1.0x' : `${s}x`,
          selected: () => current.renderScale === s,
          apply: () => setAndSave({ renderScale: s }),
        })),
      },
      {
        label: 'PERMISSIBLE MURK LEVEL',
        subtext: 'Fog Density',
        kind: 'live',
        options: [
          { text: 'Low', apply: () => setAndSave({ fogDensityScale: 0.7 }), selected: () => current.fogDensityScale === 0.7 },
          { text: 'Standard', apply: () => setAndSave({ fogDensityScale: 1 }), selected: () => current.fogDensityScale === 1 },
          { text: 'Heavy', apply: () => setAndSave({ fogDensityScale: 1.4 }), selected: () => current.fogDensityScale === 1.4 },
        ],
      },
      {
        label: 'LABYRINTHINE EQUILIBRIUM AXIS',
        subtext: 'Dread Tilt',
        kind: 'inert',
      },
      {
        label: 'CHROMATIC DISPERSION & LENS STAINING',
        subtext: 'Post-Processing',
        kind: 'live',
        options: [
          { text: 'On', apply: () => setAndSave({ postEnabled: true }), selected: () => current.postEnabled },
          { text: 'Off', apply: () => setAndSave({ postEnabled: false }), selected: () => !current.postEnabled },
        ],
      },
    ]),
  );

  ledger.appendChild(
    schedule('SCHEDULE B: AUDITORY MONITORING', [
      { label: 'MASTER VOLUME OF SLUICE AUTHORITY', subtext: 'Master Gain', kind: 'inert' },
      { label: 'BASIN RESONANCE & FORMATION SAWS', subtext: 'Lake Drone', kind: 'inert' },
      { label: 'BOWED-STRING SONIFICATION', subtext: 'Line Tension Creak', kind: 'inert' },
      { label: 'SUB-BASS DREAD MODULATION', subtext: 'Heartbeat Pulse', kind: 'inert' },
    ]),
  );

  ledger.appendChild(
    schedule('SCHEDULE C: LEVER & REEL OPERATION', [
      {
        label: 'REEL STANCE MODE',
        subtext: 'Reel Stance',
        kind: 'live',
        options: [
          { text: 'Hold RMB', apply: () => setAndSave({ reelStance: 'hold' }), selected: () => current.reelStance === 'hold' },
          { text: 'Toggle RMB', apply: () => setAndSave({ reelStance: 'toggle' }), selected: () => current.reelStance === 'toggle' },
        ],
      },
      {
        label: 'COLORBLIND RAMP',
        subtext: 'Tension Palette',
        kind: 'inert',
      },
      {
        label: 'BRACE DAMPENER SENSITIVITY',
        subtext: 'Drag Mitigation',
        kind: 'inert',
      },
    ]),
  );

  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.textContent = 'THE OFFICE OF RETURNS · GREYWATER HOLLOW';
  ledger.appendChild(foot);

  const back = document.createElement('button');
  back.className = 'return';
  back.textContent = 'RETURN TO REGISTER';
  back.addEventListener('click', closeOptionsMenu);
  ledger.appendChild(back);
}

export function openOptionsMenu(): void {
  if (typeof document === 'undefined' || root) return;
  injectStyle();
  current = loadOptions();

  root = document.createElement('div');
  root.id = 'options-screen';
  const ledger = document.createElement('div');
  ledger.className = 'ledger';
  root.appendChild(ledger);
  document.body.appendChild(root);

  blockGameKeys(true);
  renderMenu();
}

export function closeOptionsMenu(): void {
  if (!root) return;
  blockGameKeys(false);
  root.remove();
  root = null;
}

export function toggleOptionsMenu(): void {
  if (root) closeOptionsMenu();
  else openOptionsMenu();
}