// HUD — diegetic gameplay overlay (TODO.md High 'Diegetic HUD & In-Game UI
// Overlays'). Bottom-left weathered paper corner chips (PHASE / HAUL / DREAD)
// plus a grungy bottom-center tension gauge that appears only while a tether
// fight is live. The fiction is municipal paperwork, so the look matches
// runSummary.ts: parchment #efe4c8, stamped dark-brown borders, serif. The
// gauge fill walks the same green→amber→red palette as the tether line
// (render/lines.ts). DOM only — no three, no render imports. Text updates are
// change-gated (no per-frame DOM churn); the gauge only writes style when its
// fill actually moves or its colour stop changes.

import type { WorldState } from '../core/world';
import { phaseAt, runElapsedMs } from '../game/clock';
import { tierFor } from '../game/dread';
import { zoneName } from '../core/zones';

// --- palette (matches render/lines.ts: COLOR_CALM / COLOR_WARN / COLOR_DANGER) -
const COLOR_CALM = '#33ff88';
const COLOR_WARN = '#ffcc44';
const COLOR_DANGER = '#ff3344';
const WARN_STOP = 0.7; // amber colour at 70% of the ceiling

const PHASE_LABEL: Record<string, string> = {
  dusk: 'DUSK',
  night: 'NIGHT',
  deepNight: 'DEEP NIGHT',
  falseDawn: 'FALSE DAWN',
};

// --- module state (change-gating) ------------------------------------------
let rootEl: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let chipPhaseVal: HTMLSpanElement | null = null;
let chipHaulVal: HTMLSpanElement | null = null;
let chipDreadVal: HTMLSpanElement | null = null;
let chipZoneVal: HTMLSpanElement | null = null;
let chipHullVal: HTMLSpanElement | null = null;
let chipLightVal: HTMLSpanElement | null = null;
let chipLightEl: HTMLElement | null = null;
let lastLight: number | null = null;
let lastZone: string | null = null;
let lastHull: string | null = null;
let gaugeEl: HTMLDivElement | null = null;
let gaugeFill: HTMLDivElement | null = null;
let lastPhase: string | null = null;
let lastHaul: number | null = null;
let lastDreadTier: number | null = null;
let lastFightActive: boolean | null = null;
let lastFillPct = -1;
let lastFillColor = '';

// 3-stop hex lerp by tension (identical shape to lines.ts::tensionColor).
function tensionFillColor(p: number): string {
  const t = Math.min(1, Math.max(0, p));
  let a = COLOR_CALM;
  let b = COLOR_WARN;
  let k = t / WARN_STOP;
  if (t > WARN_STOP) {
    a = COLOR_WARN;
    b = COLOR_DANGER;
    k = (t - WARN_STOP) / (1 - WARN_STOP);
  }
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const r = ((ai >> 16) + ((bi >> 16) - (ai >> 16)) * k) | 0;
  const g = (((ai >> 8) & 0xff) + ((((bi >> 8) & 0xff) - ((ai >> 8) & 0xff)) * k)) | 0;
  const bl = ((ai & 0xff) + (((bi & 0xff) - (ai & 0xff)) * k)) | 0;
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// The chip node itself (for the chips that hide when they have nothing to say).
let lastChipEl: HTMLElement | null = null;

function chip(label: string): HTMLSpanElement {
  const el = document.createElement('div');
  el.className = 'hud-chip';
  const l = document.createElement('span');
  l.className = 'hud-chip-label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'hud-chip-value';
  el.appendChild(l);
  el.appendChild(v);
  rootEl!.appendChild(el);
  lastChipEl = el;
  return v;
}

function buildDom(): void {
  rootEl = document.createElement('div');
  rootEl.id = 'hud';
  document.body.appendChild(rootEl);

  const style = styleEl ?? document.createElement('style');
  style.textContent = `
    #hud {
      position: fixed; left: 0; bottom: 0; z-index: 25;
      display: flex; flex-direction: column; align-items: flex-start;
      gap: 6px; padding: 10px; pointer-events: none; user-select: none;
      font-family: Georgia, 'Times New Roman', serif;
    }
    #hud .hud-chip {
      background: #efe4c8;
      background-image:
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: 14px 14px;
      border: 1px solid #4a3a26;
      box-shadow: 2px 3px 6px rgba(0, 0, 0, 0.45);
      padding: 4px 10px 5px;
      min-width: 96px;
      display: flex; flex-direction: column; align-items: center;
      transform: rotate(-2deg);
    }
    #hud .hud-chip:nth-child(2) { transform: rotate(1.5deg); }
    #hud .hud-chip:nth-child(3) { transform: rotate(-1deg); }
    #hud .hud-chip-label {
      font-size: 9px; letter-spacing: 0.22em; color: #6a5638;
      font-weight: bold; margin-bottom: 1px;
    }
    #hud .hud-chip-value {
      font-size: 14px; font-weight: bold; letter-spacing: 0.12em;
      color: #3a2c1a;
    }
    #hud-gauge {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      z-index: 25; pointer-events: none; user-select: none;
      display: none; width: 260px; padding: 8px 10px 7px;
      background: #efe4c8;
      background-image:
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: 14px 14px;
      border: 1px solid #4a3a26; border-radius: 2px;
      box-shadow: 2px 3px 8px rgba(0, 0, 0, 0.5);
      font-family: Georgia, 'Times New Roman', serif;
    }
    #hud-gauge .hud-gauge-caption {
      display: block; text-align: center; font-size: 9px;
      letter-spacing: 0.24em; color: #6a5638; font-weight: bold; margin-bottom: 5px;
    }
    #hud-gauge .hud-gauge-track {
      height: 10px; border: 1px solid #3a2c1a; background: rgba(60, 45, 25, 0.22);
      position: relative; overflow: hidden;
    }
    #hud-gauge .hud-gauge-fill {
      height: 100%; width: 0%;
      box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
    }
  `;
  if (!styleEl) {
    document.head.appendChild(style);
    styleEl = style;
  }

  chipPhaseVal = chip('PHASE');
  chipZoneVal = chip('ZONE');
  chipHaulVal = chip('HAUL');
  chipDreadVal = chip('DREAD');
  chipHullVal = chip('HULL');
  // 05 §1.7: how many Bottled Lights are still in the boat. Hidden while the
  // rig carries none — the HUD never advertises a verb the run cannot do.
  chipLightVal = chip('BOTTLED LIGHT');
  chipLightEl = lastChipEl;
  if (chipLightEl) chipLightEl.style.display = 'none';

  gaugeEl = document.createElement('div');
  gaugeEl.id = 'hud-gauge';
  const cap = document.createElement('span');
  cap.className = 'hud-gauge-caption';
  cap.textContent = 'TENSION';
  const track = document.createElement('div');
  track.className = 'hud-gauge-track';
  gaugeFill = document.createElement('div');
  gaugeFill.className = 'hud-gauge-fill';
  track.appendChild(gaugeFill);
  gaugeEl.appendChild(cap);
  gaugeEl.appendChild(track);
  document.body.appendChild(gaugeEl);
}

export function initHud(): void {
  if (typeof document === 'undefined' || rootEl) return;
  buildDom();
}

export function updateHud(world: WorldState): void {
  if (typeof document === 'undefined') return;
  if (!rootEl) buildDom();

  const phaseKey = world.run
    ? phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed))
    : 'dusk';
  const phaseLabel = PHASE_LABEL[phaseKey] ?? phaseKey;
  if (phaseLabel !== lastPhase) {
    lastPhase = phaseLabel;
    if (chipPhaseVal) chipPhaseVal.textContent = phaseLabel;
  }

  const haul = world.run?.haul.length ?? 0;
  if (haul !== lastHaul) {
    lastHaul = haul;
    if (chipHaulVal) chipHaulVal.textContent = String(haul);
  }

  // M3 round 3: the zone you are fishing and what is left of the boat.
  const zoneLabel = zoneName(world.run?.zone ?? 1).toUpperCase();
  if (zoneLabel !== lastZone) {
    lastZone = zoneLabel;
    if (chipZoneVal) chipZoneVal.textContent = zoneLabel;
  }

  const bc = world.boatCombat;
  const hullLabel = bc.swamped
    ? 'SWAMPED'
    : `${Math.round(bc.hull.hp)}/${Math.round(bc.hull.maxHp)}${bc.active ? ' !' : ''}`;
  if (hullLabel !== lastHull) {
    lastHull = hullLabel;
    if (chipHullVal) chipHullVal.textContent = hullLabel;
  }

  const light = world.consumables.bottledLight;
  if (light !== lastLight) {
    lastLight = light;
    if (chipLightVal) chipLightVal.textContent = light > 0 ? `${light} · L` : '0';
    if (chipLightEl) chipLightEl.style.display = light > 0 ? 'flex' : 'none';
  }

  const tier = tierFor(world.dread);
  if (tier !== lastDreadTier) {
    lastDreadTier = tier;
    if (chipDreadVal) chipDreadVal.textContent = `TIER ${tier}`;
  }

  const fightActive = world.tether.fights.length > 0;
  if (fightActive !== lastFightActive) {
    lastFightActive = fightActive;
    if (gaugeEl) gaugeEl.style.display = fightActive ? 'block' : 'none';
    if (!fightActive) {
      lastFillPct = -1;
      lastFillColor = '';
      return;
    }
  }
  if (!fightActive || !gaugeFill) return;

  const fight = world.tether.fights[0]!;
  const ceiling = Math.max(1, world.line.tensionCeiling);
  const pct = Math.min(1, Math.max(0, fight.tension / ceiling));
  const fillPct = Math.round(pct * 1000) / 10;
  if (Math.abs(fillPct - lastFillPct) >= 0.5) {
    lastFillPct = fillPct;
    gaugeFill.style.width = `${fillPct}%`;
  }
  const color = tensionFillColor(pct);
  if (color !== lastFillColor) {
    lastFillColor = color;
    gaugeFill.style.background = color;
  }
}