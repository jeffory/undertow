// TOWN EVENTS (meta) — plan 05 §0.2 "Events I emit (for audio + UI):
// `building.restored`, …". Task t18 emits the FIRST of them.
//
// A tiny queue of plain data. The audio engine and the hub renderer can drain it
// later without either of them importing the restoration logic (or it theirs);
// nothing consumes it yet beyond the ?debug probe seam, which is the point — the
// shape is fixed now so the audio worker's bell patch (plan §5.5) can bind to it
// without a refactor.
//
// Pure data: no `three`, no DOM.

import type { BuildingRestoredEvent } from './restoration';

export type TownEvent = BuildingRestoredEvent;

const QUEUE_CAP = 32;
const queue: TownEvent[] = [];

export function emitTownEvent(event: TownEvent): void {
  queue.push(event);
  if (queue.length > QUEUE_CAP) queue.shift();
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
