// TETHER LOG — playtest instrumentation (plan 02 §11, T11). Per-fight + per-
// session log drawn from world.tetherEvents (subscribed each sim tick, right
// after tetherConstraint produces them) plus per-frame samples. Feeds the 13.1
// fun-or-dead gate: drag events reconstruct the emergent story, snap causes /
// tension-at-end make failure legible, reeledMs shows voluntary reel usage,
// and cut/land/butcher outcomes give the Angler-vs-Butcher split. Keeps a
// simple plain-JSON shape so the T12 gate driver can assert on it.
//
// Pure logic: no three, no DOM at import. The console summary is printed at
// fight end; the whole session is printable on demand and, under ?debug,
// exposed as window.__tetherLog for the browser-side gate driver.

import type { WorldState } from '../core/world';
import { M2_SPECIES } from '../game/tether';
import type { TetherEvent } from '../game/tether';

const DEBUG_FLAG =
  typeof location !== 'undefined' ? /[?&]debug/.test(location.search) : false;
const SAMPLE_INTERVAL = 0.25; // s between per-fight samples (4 Hz)
// Retention cap on finished fight records: each record holds unbounded
// samples/events arrays, and nothing in game code ever called resetTetherLog,
// so a long session grew the Map (and its finalize scan) forever.
const RECORD_CAP = 100;

export type FightOutcome =
  | 'ongoing'
  | 'snap'
  | 'cut'
  | 'landed'
  | 'butchered'
  | 'unknown';

export interface FightSample {
  t: number; // seconds since fight start
  tension: number;
  L: number;
  stamina: number; // fish stamina %
}

export type LoggedEvent = { type: string } & Record<string, unknown>;

export interface FightRecord {
  fightId: number;
  species: string;
  anchor: 'player' | 'boat';
  startedAt: number;
  endedAt: number | null;
  outcome: FightOutcome;
  durationSec: number | null;
  maxTension: number;
  tensionAtEnd: number | null;
  reeledMs: number;
  lunges: number;
  lungesDodged: number;
  telegraphs: number;
  drags: number;
  dragMagnitude: number;
  events: LoggedEvent[];
  samples: FightSample[];
}

export interface SessionTallies {
  snaps: number;
  cuts: number;
  lands: number;
  butchers: number;
  drags: number;
  lunges: number;
  lungesDodged: number;
  reeledMs: number;
}

export interface SessionLog {
  startedAt: number;
  durationSec: number;
  fights: FightRecord[];
  tallies: SessionTallies;
}

// Internal record = public record + bookkeeping.
interface Rec extends FightRecord {
  lastTension: number;
  lastSampleT: number;
  hint: FightOutcome | null;
}

let records = new Map<number, Rec>();
let sessionStart = 0;
let lastTick = 0;
let initDone = false;
const tallies: SessionTallies = {
  snaps: 0,
  cuts: 0,
  lands: 0,
  butchers: 0,
  drags: 0,
  lunges: 0,
  lungesDodged: 0,
  reeledMs: 0,
};

export function resetTetherLog(): void {
  records = new Map();
  sessionStart = 0;
  lastTick = 0;
  initDone = false;
  tallies.snaps = 0;
  tallies.cuts = 0;
  tallies.lands = 0;
  tallies.butchers = 0;
  tallies.drags = 0;
  tallies.lunges = 0;
  tallies.lungesDodged = 0;
  tallies.reeledMs = 0;
}

function toRecord(r: Rec): FightRecord {
  return {
    fightId: r.fightId,
    species: r.species,
    anchor: r.anchor,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    outcome: r.outcome,
    durationSec: r.durationSec,
    maxTension: r.maxTension,
    tensionAtEnd: r.tensionAtEnd,
    reeledMs: r.reeledMs,
    lunges: r.lunges,
    lungesDodged: r.lungesDodged,
    telegraphs: r.telegraphs,
    drags: r.drags,
    dragMagnitude: r.dragMagnitude,
    events: r.events,
    samples: r.samples,
  };
}

// The most recent record that has not yet been finalised — the fight that
// landed/butchered/… events (which carry no fightId) belong to.
function newestOpen(): Rec | null {
  let best: Rec | null = null;
  for (const r of records.values()) {
    if (r.endedAt === null && (best === null || r.startedAt > best.startedAt)) {
      best = r;
    }
  }
  return best;
}

// Defensive fallback: an end-event with no matching record (the fight started
// and ended within the same tick, before the logger ever saw it live). Records
// the outcome so the gate never silently loses a fight.
function synthesize(fightId: number, world: WorldState, now: number, outcome: FightOutcome): Rec {
  const rec: Rec = {
    fightId,
    species: world.tether.fights[0]?.species ?? M2_SPECIES,
    anchor: world.tether.fights[0]?.anchor ?? 'player',
    startedAt: now,
    endedAt: now,
    outcome,
    durationSec: 0,
    maxTension: 0,
    tensionAtEnd: 0,
    reeledMs: 0,
    lunges: 0,
    lungesDodged: 0,
    telegraphs: 0,
    drags: 0,
    dragMagnitude: 0,
    events: [],
    samples: [],
    lastTension: 0,
    lastSampleT: now,
    hint: outcome,
  };
  records.set(fightId, rec);
  return rec;
}

const END_EVENT_HINT: Partial<Record<string, FightOutcome>> = {
  snap: 'snap',
  cut: 'cut',
  landed: 'landed',
  butchered: 'butchered',
};

export function updateTetherLog(world: WorldState, dt: number): void {
  void dt;
  if (!initDone) {
    initDone = true;
    sessionStart = world.time.elapsed;
    if (DEBUG_FLAG && typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__tetherLog = {
        getSessionLog,
        sessionSummary,
        printSessionSummary,
        resetTetherLog,
      };
    }
  }
  const now = world.time.elapsed;
  lastTick = now;

  const current = new Set<number>();

  // Live fights: ensure a record, track maxTension + throttled samples.
  for (const f of world.tether.fights) {
    current.add(f.id);
    let rec = records.get(f.id);
    // Fight ids restart at 1 after a run reset (resetWorld rebuilds the tether
    // state), so a recycled id can collide with a FINISHED record from the
    // previous run — which would silently absorb the new fight's stats and
    // never re-finalize. Treat a finished record under a live id as stale.
    if (rec && rec.endedAt !== null) rec = undefined;
    if (!rec) {
      rec = {
        fightId: f.id,
        species: f.species,
        anchor: f.anchor,
        startedAt: now,
        endedAt: null,
        outcome: 'ongoing',
        durationSec: null,
        maxTension: f.tension,
        tensionAtEnd: null,
        reeledMs: 0,
        lunges: 0,
        lungesDodged: 0,
        telegraphs: 0,
        drags: 0,
        dragMagnitude: 0,
        events: [],
        samples: [],
        lastTension: f.tension,
        lastSampleT: now,
        hint: null,
      };
      records.set(f.id, rec);
    }
    rec.lastTension = f.tension;
    if (f.tension > rec.maxTension) rec.maxTension = f.tension;
    if (now - rec.lastSampleT >= SAMPLE_INTERVAL) {
      rec.lastSampleT = now;
      const maxSt = world.fish ? world.fish.tether.maxStamina : 0;
      rec.samples.push({
        t: Number((now - rec.startedAt).toFixed(2)),
        tension: Number(f.tension.toFixed(1)),
        L: Number(f.L.toFixed(2)),
        stamina: world.fish && maxSt > 0
          ? Number(((world.fish.stamina / maxSt) * 100).toFixed(0))
          : 0,
      });
    }
  }

  // Consume the event stream (each event belongs to a fight by fightId when
  // present, else the primary / just-ended fight).
  for (const ev of world.tetherEvents) {
    const evFightId = (ev as { fightId?: number }).fightId;
    let rec: Rec | null =
      typeof evFightId === 'number' ? (records.get(evFightId) ?? null) : null;
    if (!rec) {
      if (
        ev.type === 'landed' ||
        ev.type === 'butchered' ||
        ev.type === 'pulledUnder' ||
        ev.type === 'reeledMs' ||
        ev.type === 'enterWaterPhase'
      ) {
        rec = newestOpen();
      } else {
        const primary = world.tether.fights[0];
        rec = primary ? (records.get(primary.id) ?? null) : newestOpen();
      }
    }
    if (!rec) {
      // An end-event with no live fight: synthesize so no outcome is lost.
      const hint = END_EVENT_HINT[ev.type];
      if (hint) {
        const fid =
          typeof evFightId === 'number'
            ? evFightId
            : Math.max(0, world.tether.nextId - 1);
        if (fid > 0 && !records.has(fid)) rec = synthesize(fid, world, now, hint);
      }
    }
    if (!rec) continue;
    rec.events.push({ ...ev } as LoggedEvent);
    switch (ev.type) {
      case 'lunge':
        rec.lunges++;
        tallies.lunges++;
        // A lunge that fires while the player's dodge i-frames are active is a
        // dodge (the controller set dodge.active this tick, before the constraint).
        if (world.player.dodge.active) {
          rec.lungesDodged++;
          tallies.lungesDodged++;
        }
        break;
      case 'telegraph':
        rec.telegraphs++;
        break;
      case 'drag':
        rec.drags++;
        tallies.drags++;
        rec.dragMagnitude += ev.magnitude;
        break;
      case 'snap':
        rec.hint = 'snap';
        // A snap fires exactly when tension reaches the ceiling, and the fight
        // is removed the same tick the logger sees the event — so the observed
        // tension cannot capture it. Pin the end-tension to the ceiling.
        rec.lastTension = Math.max(rec.lastTension, world.line.tensionCeiling);
        tallies.snaps++;
        break;
      case 'cut':
        rec.hint = 'cut';
        tallies.cuts++;
        break;
      case 'landed':
        rec.hint = 'landed';
        tallies.lands++;
        break;
      case 'butchered':
        rec.hint = 'butchered';
        tallies.butchers++;
        break;
      case 'reeledMs':
        rec.reeledMs += ev.ms;
        tallies.reeledMs += ev.ms;
        break;
      default:
        break;
    }
  }

  // Finalise fights that ended this tick (already removed from world.tether).
  for (const [id, rec] of records) {
    if (!current.has(id) && rec.endedAt === null) {
      rec.endedAt = now;
      rec.durationSec = Number((now - rec.startedAt).toFixed(2));
      rec.tensionAtEnd = Number(rec.lastTension.toFixed(1));
      rec.outcome = rec.hint ?? 'unknown';
      printFightSummary(rec);
    }
  }

  // Evict the oldest FINISHED records past the cap (tallies keep the totals).
  if (records.size > RECORD_CAP) {
    for (const [id, rec] of records) {
      if (records.size <= RECORD_CAP) break;
      if (rec.endedAt !== null) records.delete(id); // Map iterates in insertion order
    }
  }
}

function printFightSummary(rec: Rec): void {
  const dodgePct = rec.lunges > 0 ? Math.round((rec.lungesDodged / rec.lunges) * 100) : 0;
  // eslint-disable-next-line no-console
  console.info(
    `[tether] fight #${rec.fightId} ${rec.species}/${rec.anchor} → ${rec.outcome} ` +
      `@${rec.durationSec ?? '?'}s maxT=${rec.maxTension.toFixed(0)} ` +
      `endT=${(rec.tensionAtEnd ?? 0).toFixed(0)} drags=${rec.drags} ` +
      `lunges=${rec.lunges}(${dodgePct}% dodged) ` +
      `reeled=${(rec.reeledMs / 1000).toFixed(1)}s`,
  );
}

export function getSessionLog(): SessionLog {
  return {
    startedAt: sessionStart,
    durationSec: Number(Math.max(0, lastTick - sessionStart).toFixed(2)),
    fights: [...records.values()].map(toRecord),
    tallies: { ...tallies },
  };
}

// A one-screen summary a tester can answer the five 13.1 questions against.
export function sessionSummary(): string {
  const log = getSessionLog();
  const t = log.tallies;
  const lines: string[] = [];
  lines.push(
    `=== UNDERTOW tether session (${log.durationSec.toFixed(1)}s, ` +
      `${log.fights.length} fight${log.fights.length === 1 ? '' : 's'}) ===`,
  );
  lines.push(
    `outcomes: landed ${t.lands} · butchered ${t.butchers} · snapped ${t.snaps} · cut ${t.cuts}`,
  );
  lines.push(
    `drags ${t.drags} · lunges ${t.lunges} (${t.lungesDodged} dodged) · reeled ${(t.reeledMs / 1000).toFixed(1)}s`,
  );
  for (const f of log.fights) {
    lines.push(
      `  #${f.fightId} ${f.species}/${f.anchor} ${f.outcome} ` +
        `@${(f.durationSec ?? 0).toFixed(1)}s maxT=${f.maxTension.toFixed(0)} ` +
        `endT=${(f.tensionAtEnd ?? 0).toFixed(0)} drags=${f.drags} ` +
        `lunges=${f.lunges} (${f.lungesDodged} dodged) reeled=${(f.reeledMs / 1000).toFixed(1)}s`,
    );
  }
  return lines.join('\n');
}

export function printSessionSummary(): void {
  // eslint-disable-next-line no-console
  console.info(sessionSummary());
}

// Keep the TetherEvent import live (typed helper for the gate's use).
export type { TetherEvent };