// TOWN RESTORATION (meta) — task t18 slice 2. Pins the spend math (Memories can
// never go negative, the purse is debited exactly the cost, the ledger row
// records the receipt), the plan §1.4 order gates, and the telegraphed Dread
// readout the register prints before the player pays.

import { describe, it, expect } from 'vitest';
import { freshMetaState } from '../../src/save/migrate';
import type { MetaState } from '../../src/save/schemas';
import { BUILDINGS, buildingDef } from '../../src/content/buildings';
import {
  affordable,
  canRestore,
  dreadReadout,
  isRestored,
  restore,
  restoredCount,
  restoredIds,
  startingDreadFor,
  unlockState,
} from '../../src/meta/restoration';

function withMemories(n: number): MetaState {
  return { ...freshMetaState(), memories: n };
}

// Restore a list of ids in order, ignoring cost (the fixture pre-pays).
function restoreAll(ids: string[]): MetaState {
  let meta = withMemories(100000);
  for (const id of ids) {
    const out = restore(meta, id);
    expect(out.ok).toBe(true);
    meta = out.meta;
  }
  return meta;
}

describe('spend math', () => {
  it('debits exactly the cost and records the receipt row', () => {
    const meta = withMemories(100);
    const out = restore(meta, 'smokehouse', { atRun: 4 });
    expect(out.ok).toBe(true);
    expect(out.meta.memories).toBe(60); // 100 − 40
    expect(out.meta.buildings['smokehouse']).toEqual({ restored: true, paid: 40, atRun: 4 });
    expect(isRestored(out.meta, 'smokehouse')).toBe(true);
  });

  it('never overdraws — one Memory short is a refusal, not a negative purse', () => {
    const meta = withMemories(39);
    const out = restore(meta, 'smokehouse');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('insufficient-memories');
    expect(out.meta).toBe(meta); // untouched
    expect(out.meta.memories).toBe(39);
  });

  it('exactly the cost is affordable (the boundary pays)', () => {
    const out = restore(withMemories(40), 'smokehouse');
    expect(out.ok).toBe(true);
    expect(out.meta.memories).toBe(0);
  });

  it('does not mutate the input MetaState', () => {
    const meta = withMemories(100);
    restore(meta, 'smokehouse');
    expect(meta.memories).toBe(100);
    expect(meta.buildings).toEqual({});
  });

  it('refuses a second payment for an already-restored building', () => {
    const first = restore(withMemories(200), 'smokehouse');
    const second = restore(first.meta, 'smokehouse');
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already-restored');
    expect(second.meta.memories).toBe(160);
  });

  it('refuses an unknown building id', () => {
    const out = restore(withMemories(9999), 'sunken-casino');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('unknown-building');
  });

  it('a full sweep of the affordable town leaves a coherent purse', () => {
    const phase0 = ['smokehouse', 'chandlery', 'post-office', 'bell-tower', 'chapel'];
    const total = phase0.reduce((s, id) => s + buildingDef(id)!.cost, 0);
    let meta = withMemories(total);
    for (const id of phase0) meta = restore(meta, id).meta;
    expect(meta.memories).toBe(0);
    expect(restoredCount(meta)).toBe(5);
  });
});

describe('the building.restored event (plan §0.2)', () => {
  it('carries the id, the paid cost, the new count and the new starting Dread', () => {
    const out = restore(withMemories(100), 'bell-tower');
    expect(out.event).toEqual({
      type: 'building.restored',
      id: 'bell-tower',
      name: 'Parish Bell Tower', // town.md copy, not the fallback
      cost: 40,
      restoredCount: 1,
      startingDread: 2,
    });
  });

  it('a refused restoration emits nothing', () => {
    expect(restore(withMemories(1), 'bell-tower').event).toBeUndefined();
  });
});

describe('order gates (plan §1.4)', () => {
  it('Phase 0 (#1–5) is available from the start', () => {
    const meta = freshMetaState();
    for (const id of ['smokehouse', 'chandlery', 'post-office', 'bell-tower', 'chapel']) {
      expect(unlockState(meta, buildingDef(id)!).unlocked).toBe(true);
    }
  });

  it('Phase 1 is withheld until five premises stand, in Office-speak', () => {
    const apothecary = buildingDef('apothecary')!;
    const empty = unlockState(freshMetaState(), apothecary);
    expect(empty.unlocked).toBe(false);
    expect(empty.reason).toMatch(/WITHHELD/);
    expect(empty.reason).toMatch(/5 outstanding/);

    const four = restoreAll(['smokehouse', 'chandlery', 'post-office', 'bell-tower']);
    expect(unlockState(four, apothecary).unlocked).toBe(false);
    expect(unlockState(four, apothecary).reason).toMatch(/1 outstanding/);

    const five = restore(four, 'chapel').meta;
    expect(unlockState(five, apothecary).unlocked).toBe(true);
  });

  it('a locked row cannot be paid for even with the Memories in hand', () => {
    const out = restore(withMemories(9999), 'apothecary');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('locked');
    expect(out.meta.memories).toBe(9999);
  });

  it('the Phase 2 Schoolhouse stays withheld until the Township is reached', () => {
    const rich = { ...restoreAll(['smokehouse', 'chandlery', 'post-office', 'bell-tower', 'chapel']), memories: 9999 };
    expect(canRestore(rich, 'schoolhouse').ok).toBe(false);
    expect(canRestore(rich, 'schoolhouse', { deepestZone: 2 }).ok).toBe(false);
    expect(canRestore(rich, 'schoolhouse', { deepestZone: 3 }).ok).toBe(true);
  });

  it('affordable() is purely the purse — the gate is a separate question', () => {
    const meta = withMemories(9999);
    expect(affordable(meta, buildingDef('apothecary')!)).toBe(true);
    expect(unlockState(meta, buildingDef('apothecary')!).unlocked).toBe(false);
  });
});

describe('restored order + the Dread readout', () => {
  it('restoredIds comes back in LEDGER order, not payment order', () => {
    const meta = restoreAll(['chapel', 'smokehouse', 'bell-tower']);
    expect(restoredIds(meta)).toEqual(['smokehouse', 'bell-tower', 'chapel']);
  });

  it('the readout telegraphs current and next starting Dread', () => {
    const meta = restoreAll(['smokehouse', 'chandlery']);
    expect(startingDreadFor(meta)).toBe(4);
    const read = dreadReadout(meta);
    expect(read).toEqual({ current: 4, next: 6, delta: 2 });
  });

  it('an already-restored row reports no further stir', () => {
    const meta = restoreAll(['smokehouse']);
    expect(dreadReadout(meta, 'smokehouse')).toEqual({ current: 2, next: 2, delta: 0 });
  });

  it('the ledger holds exactly the eight buildings town.md wrote', () => {
    expect(BUILDINGS).toHaveLength(8);
    expect(BUILDINGS.map((b) => b.id)).toEqual([
      'smokehouse',
      'chandlery',
      'post-office',
      'bell-tower',
      'chapel',
      'apothecary',
      'bakery',
      'schoolhouse',
    ]);
  });
});
