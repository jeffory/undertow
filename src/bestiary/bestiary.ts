// BESTIARY STATE (bestiary) — plan 04 §6.1, task t19. Per-species entry state,
// produced from tether events and merged into the save (schema v2) at run end.
//
// Unlock rules (plan 04 §6.1): `seen` + `fought` on the SET (hooked = seen +
// fought — the species is only known at the moment it is hooked); `cleanCatch`
// only from an exhausted-and-landed catch (a butcher never grants the
// checkmark); `willing` is the Maren's Thimble variant — a distinct, worse
// record, and as of the M8 boss (05 §2.3) it finally has a producer: a
// 'willing' event, recorded when Maren's Echo is landed on the thimble. A species with no entry state is "undiscovered" — the UI shows a dark
// silhouette card and hides the name.
//
// Events accumulate on world.run.bestiaryEvents during the run (the reducer +
// cast flow push them); buildRunResult carries them onto the RunResult, and
// applyRunResult folds them into save.bestiary. mergedBestiary gives the UI the
// live view mid-run (persisted state + this run's events).
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';

export interface BestiaryEntryState {
  speciesId: string;
  seen: boolean; // silhouette observed (a disturbance of this species spawned)
  fought: boolean; // hooked — the fight began
  cleanCatch: boolean; // exhausted-and-landed — the ✓ checkmark
  willing: boolean; // came willingly (Maren's Thimble) — different, worse text
  kills: number; // HP-kills (butcher) — credit without the checkmark
  catches: number; // landed catches (clean or otherwise)
}

// 05 §2.3 — 'willing' is the FOURTH kind, and the first producer the `willing`
// flag has ever had: Maren's Echo taken with Maren's Thimble. It was declared in
// the entry state in M4 with nothing able to set it ("wired with the thimble in
// a later round"), and the M8 boss is the round where a willing catch exists.
export type BestiaryEventKind = 'hooked' | 'clean' | 'butchered' | 'willing';

export interface BestiaryEvent {
  speciesId: string;
  event: BestiaryEventKind;
}

export function emptyBestiary(speciesId: string): BestiaryEntryState {
  return {
    speciesId,
    seen: false,
    fought: false,
    cleanCatch: false,
    willing: false,
    kills: 0,
    catches: 0,
  };
}

// The pure fold: apply a run's bestiary events to the persisted state. Never
// mutates the input — returns a new record map (spread + shallow entry copies).
export function applyBestiaryEvents(
  state: Record<string, BestiaryEntryState>,
  events: readonly BestiaryEvent[],
): Record<string, BestiaryEntryState> {
  const out: Record<string, BestiaryEntryState> = {};
  for (const [id, entry] of Object.entries(state)) out[id] = { ...entry };
  for (const ev of events) {
    const entry = { ...(out[ev.speciesId] ?? emptyBestiary(ev.speciesId)) };
    switch (ev.event) {
      case 'hooked':
        entry.seen = true;
        entry.fought = true;
        break;
      case 'clean':
        entry.cleanCatch = true;
        entry.catches += 1;
        break;
      case 'butchered':
        entry.kills += 1;
        break;
      case 'willing':
        // It came willingly. The record does not change what happened — it
        // changes what the record SAYS (data/bestiaryText.ts `entryWilling`).
        entry.willing = true;
        break;
    }
    out[ev.speciesId] = entry;
  }
  return out;
}

// The live view for the UI mid-run: persisted save state folded with this run's
// not-yet-persisted events.
export function mergedBestiary(
  state: Record<string, BestiaryEntryState>,
  runEvents: readonly BestiaryEvent[],
): Record<string, BestiaryEntryState> {
  return applyBestiaryEvents(state, runEvents);
}

// Push a bestiary event onto the current run (the seam the reducer + cast flow
// call). It lands on the RunResult via buildRunResult and merges at persist.
export function recordBestiary(world: WorldState, speciesId: string, event: BestiaryEventKind): void {
  world.run.bestiaryEvents.push({ speciesId, event });
}

// UI status for a species slot: 'clean' > 'fought' > 'undiscovered'.
export type BestiaryStatus = 'undiscovered' | 'fought' | 'clean';

export function bestiaryStatus(entry: BestiaryEntryState | undefined): BestiaryStatus {
  if (!entry) return 'undiscovered';
  if (entry.cleanCatch) return 'clean';
  if (entry.fought) return 'fought';
  return 'undiscovered';
}