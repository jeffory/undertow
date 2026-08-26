// TOWN EVENTS (meta) — plan 05 §0.2 "Events I emit (for audio + UI):
// `building.restored`, …". Task t18 emits the FIRST of them; task t19 adds
// `bark.shown` (the doorstep-bark record the future audio worker binds to).
//
// A tiny queue of plain data. The audio engine and the hub renderer can drain it
// later without either of them importing the restoration logic (or it theirs);
// nothing consumes it yet beyond the ?debug probe seam, which is the point — the
// shape is fixed now so the audio worker's bell patch (plan §5.5) can bind to it
// without a refactor.
//
// Pure data: no `three`, no DOM.

import type { BuildingRestoredEvent } from './restoration';
import type { BottledLightDecantedEvent, BottledLightUsedEvent } from './bottledLight';
import type { PendingBark } from '../core/world';
import type { BossStartedEvent, BossLandedEvent } from '../bosses/congregation';
import type {
  SnatcherLatchedEvent,
  SnatcherKilledEvent,
  SnatcherStoleEvent,
} from '../enemies/snatcher';
import type {
  PostmasterSummonedEvent,
  PostmasterTelegraphEvent,
  PostmasterCutEvent,
  PostmasterDeliveredEvent,
} from '../bosses/postmaster';

export interface BarkShownEvent {
  type: 'bark.shown';
  buildingId: string;
  residentId: string;
  text: string;
  maskSlipping: boolean;
  visitCount: number;
}

export type TownEvent =
  | BuildingRestoredEvent
  | BarkShownEvent
  | BottledLightDecantedEvent // 05 §1.7 / §0.2 (task t21)
  | BottledLightUsedEvent
  | BossStartedEvent // 05 §2.1 / §0.2 — the Kelp Graves boss (task t25)
  | BossLandedEvent
  | SnatcherLatchedEvent // 05 §2.2 — the Township's second mouth (task t28)
  | SnatcherKilledEvent
  | SnatcherStoleEvent
  | PostmasterSummonedEvent // 05 §2.2 — the Township boss (task t29)
  | PostmasterTelegraphEvent
  | PostmasterCutEvent
  | PostmasterDeliveredEvent;

const QUEUE_CAP = 32;
const queue: TownEvent[] = [];

export function emitTownEvent(event: TownEvent): void {
  queue.push(event);
  if (queue.length > QUEUE_CAP) queue.shift();
}

// A bark that has just been scheduled — the toast the UI shows AND the record
// the audio engine will hear. Two writes, one source.
export function emitBarkShown(bark: PendingBark, visitCount: number): void {
  emitTownEvent({
    type: 'bark.shown',
    buildingId: bark.buildingId,
    residentId: bark.residentId,
    text: bark.text,
    maskSlipping: bark.maskSlipping,
    visitCount,
  });
}

// Read without consuming (the probe / a debug readout).
export function peekTownEvents(): readonly TownEvent[] {
  return queue;
}

// Consume — the eventual audio subscriber's call.
export function drainTownEvents(): TownEvent[] {
  return queue.splice(0, queue.length);
}

export function clearTownEvents(): void {
  queue.length = 0;
}
