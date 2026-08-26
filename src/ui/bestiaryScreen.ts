// BESTIARY SCREEN (ui) — plan 04 §6, task t19. DOM overlay toggled by the B key
// (from the boat / open water — input.ts sets world.ui.bestiaryTap when no
// dock/board action applies) or the ?debug `__bestiary()` seam. Grid of the 12
// Shallows species: an undiscovered slot is a dark silhouette card (name
// hidden, the one-line observation shown); a fought species is a municipal
// record card — name, rarity chip, eligibility, and the entry text from
// src/data/bestiaryText.ts — plus the clean-catch ✓ once one has been landed
// (a butcher never grants it). Styled per the Office voice: aged paper, ruled
// lines, a masthead, matching the TRIBUTE RECEIPT overlay's patterns.
// DOM only — state/merges live in bestiary/bestiary.ts.

import type { WorldState } from '../core/world';
import { getSave } from '../core/save';
import { SHALLOWS_SPECIES, ALL_SPECIES } from '../data/species';
import { bestiaryById, type BestiaryRecord } from '../data/bestiaryText';
import { mergedBestiary, bestiaryStatus } from '../bestiary/bestiary';
import type { BestiaryEntryState } from '../bestiary/bestiary';

let overlayEl: HTMLDivElement | null = null;

const RARITY_CHIP: Record<string, string> = {
  C: '#5a6a58',
  U: '#2f6a4f',
  R: '#3a5a8a',
  E: '#6a3a8a',
  Boss: '#8a2a2a',
};

function rarityWord(r: string): string {
  return { C: 'COMMON', U: 'UNCOMMON', R: 'RARE', E: 'EPIC', Boss: 'BOSS' }[r] ?? r;
}

function categoryWord(c: string): string {
  return { catch: 'CATCH', crawler: 'CRAWLER', boss: 'BOSS', bagman: 'BAGMAN' }[c] ?? c.toUpperCase();
}

// The B-key edge, consumed by the ui system (systems.ts ui slot).
export function updateBestiaryToggle(world: WorldState): void {
  if (!world.ui.bestiaryTap) return;
  world.ui.bestiaryTap = false;
  toggleBestiary(world);
}

export function toggleBestiary(world: WorldState): void {
  if (overlayEl) {
    dismissBestiary();
    return;
  }
  showBestiary(world);
}

export function dismissBestiary(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

export function bestiaryOpen(): boolean {
  return overlayEl !== null;
}

function showBestiary(world: WorldState): void {
  if (typeof document === 'undefined') return;
  dismissBestiary();

  const save = getSave();
  const persisted = save?.bestiary ?? {};
  const entries = mergedBestiary(persisted, world.run.bestiaryEvents);

  const root = document.createElement('div');
  root.id = 'bestiary-screen';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #bestiary-screen {
      position: fixed; inset: 0; z-index: 90;
      display: flex; align-items: center; justify-content: center;
      background: rgba(2, 4, 6, 0.68);
      font: 13px/1.45 ui-monospace, 'Courier New', monospace;
      color: #241c12;
    }
    #bestiary-screen .ledger {
      width: 760px; max-height: 88vh; overflow: auto;
      background: #efe4c8;
      background-image:
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: 22px 22px;
      border: 1px solid #4a3a26;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      padding: 22px 26px;
    }
    #bestiary-screen .masthead {
      text-align: center; letter-spacing: 0.18em;
      color: #3a2c1a; font-size: 14px; font-weight: bold;
      border-bottom: 2px solid #4a3a26; padding-bottom: 6px;
    }
    #bestiary-screen .form-no {
      text-align: center; margin-top: 8px; font-size: 12px;
      letter-spacing: 0.12em; color: #7a2014; font-weight: bold;
    }
    #bestiary-screen .grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 14px; margin-top: 18px;
    }
    #bestiary-screen .card {
      border: 1px solid #4a3a26; background: rgba(239, 228, 200, 0.55);
      padding: 12px 14px; min-height: 150px;
      display: flex; flex-direction: column; gap: 6px;
    }
    #bestiary-screen .card.undiscovered {
      background: rgba(26, 24, 20, 0.92); color: #9a8a70;
      border-color: #241c12; justify-content: center; align-items: center;
      text-align: center; font-style: italic; min-height: 170px;
    }
    #bestiary-screen .card.undiscovered .shape {
      width: 56px; height: 22px; margin-bottom: 6px;
      background: #3a3a36; border-radius: 50% 50% 48% 52% / 60% 60% 40% 40%;
      transform: rotate(-4deg); filter: blur(0.4px);
    }
    #bestiary-screen .card.undiscovered .name-hide {
      letter-spacing: 0.3em; font-style: normal; color: #5a5048;
    }
    #bestiary-screen .card .row { display: flex; align-items: baseline; gap: 8px; }
    #bestiary-screen .name { font-weight: bold; font-size: 14px; color: #2a2012; }
    #bestiary-screen .rarity {
      font-size: 9px; font-weight: bold; letter-spacing: 0.12em;
      color: #efe4c8; padding: 1px 5px; border-radius: 2px;
    }
    #bestiary-screen .meta { font-size: 10px; color: #6a5638; letter-spacing: 0.08em; }
    #bestiary-screen .entry {
      font-size: 12px; color: #3a2c1a; line-height: 1.5; margin-top: 2px;
      flex: 1;
    }
    #bestiary-screen .check { color: #2a5c2a; font-weight: bold; letter-spacing: 0.12em; }
    #bestiary-screen .nocheck { color: #8a8070; font-size: 10px; letter-spacing: 0.1em; }
    #bestiary-screen .foot {
      margin-top: 18px; text-align: center; font-size: 10px; color: #6a5638;
      letter-spacing: 0.14em;
    }
    #bestiary-screen .close {
      display: block; width: 100%; margin-top: 12px; padding: 8px 0;
      background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
      font: 12px/1.4 ui-monospace, monospace; letter-spacing: 0.2em;
    }
    #bestiary-screen .close:hover { background: #5c4a30; }
  `;
  document.head.appendChild(style);

  const ledger = document.createElement('div');
  ledger.className = 'ledger';
  root.appendChild(ledger);

  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'THE OFFICE OF RETURNS — REGISTER OF SPECIES';
  ledger.appendChild(mast);

  const form = document.createElement('div');
  form.className = 'form-no';
  form.textContent = '[SCHEDULE B: THE SHALLOWS — TWELVE (12) ENTRIES]';
  ledger.appendChild(form);

  const grid = document.createElement('div');
  grid.className = 'grid';
  ledger.appendChild(grid);

  for (const species of SHALLOWS_SPECIES) {
    const record = bestiaryById(species.id);
    const entry = entries[species.id];
    grid.appendChild(buildCard(record, entry));
  }
  // …and anything from a DEEPER zone the keeper has actually met. The ledger is
  // the Shallows roster by design (undiscovered Shallows slots are the dark
  // silhouette cards that make the grid a checklist), but a zone-2/3/4 record
  // the player has earned — the Congregation, the Snatcher, the Postmaster, the
  // Whistler, Maren's Echo — has had nowhere to be read until now. They appear
  // only once met, so the grid never spoils what is further down.
  const shallows = new Set(SHALLOWS_SPECIES.map((sp) => sp.id));
  for (const species of ALL_SPECIES) {
    if (shallows.has(species.id)) continue;
    const entry = entries[species.id];
    if (!entry || !entry.fought) continue;
    const record = bestiaryById(species.id);
    if (!record) continue;
    grid.appendChild(buildCard(record, entry));
  }

  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.textContent = 'Clean catches marked ✓. The Office does not remark on the rest.';
  ledger.appendChild(foot);

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = 'RETURN TO THE WATER';
  close.addEventListener('click', () => dismissBestiary());
  ledger.appendChild(close);

  overlayEl = root;
}

function buildCard(
  record: BestiaryRecord | null,
  entry: BestiaryEntryState | undefined,
): HTMLElement {
  const status = bestiaryStatus(entry);
  const card = document.createElement('div');
  card.className = `card ${status === 'undiscovered' ? 'undiscovered' : ''}`;

  if (status === 'undiscovered' || !record) {
    const shape = document.createElement('div');
    shape.className = 'shape';
    card.appendChild(shape);
    const hide = document.createElement('div');
    hide.className = 'name-hide';
    hide.textContent = 'SPECIMEN UNCLASSIFIED';
    card.appendChild(hide);
    const obs = document.createElement('div');
    obs.className = 'entry';
    obs.textContent = record?.silhouette ?? 'A shape under the water. The Office has not logged it.';
    card.appendChild(obs);
    return card;
  }

  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = record.name;
  row.appendChild(name);
  const chip = document.createElement('span');
  chip.className = 'rarity';
  chip.style.background = RARITY_CHIP[record.rarity] ?? '#5a6a58';
  chip.textContent = rarityWord(record.rarity);
  row.appendChild(chip);
  card.appendChild(row);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `ELIGIBILITY GRADE ${record.eligibility} · CATEGORY ${categoryWord(record.category)}`;
  card.appendChild(meta);

  const entryEl = document.createElement('div');
  entryEl.className = 'entry';
  // 05 §2.3 — THE WILLING VARIANT. plan 04 §6.1 declared it in M4 ("a distinct,
  // worse record") and the text slot has sat filled-in-places and unread ever
  // since, because nothing could set the flag. The M8 boss can: a species taken
  // willingly shows its OTHER paragraph, and there is no toggle and no second
  // card — the record simply says something worse, and does not mention that it
  // used to say anything else.
  const willing = !!entry && entry.willing && !!record.entryWilling;
  entryEl.textContent = willing ? record.entryWilling! : record.entryFought;
  card.appendChild(entryEl);

  const mark = document.createElement('div');
  if (status === 'clean') {
    mark.className = 'check';
    mark.textContent = `✓ CLEAN CATCH${entry && entry.catches > 1 ? ` ×${entry.catches}` : ''}`;
  } else {
    mark.className = 'nocheck';
    mark.textContent = 'NO CLEAN CATCH ON RECORD';
  }
  card.appendChild(mark);

  return card;
}