// BESTIARY STATE — tests-first (plan 04 §6.1, task t19 §1). Pins the pure event
// fold: hooked = seen + fought (the species is only revealed at the hook), a
// clean land sets the ✓ checkmark, a butcher credits kills but NEVER the
// checkmark, and `willing` (Maren's Thimble) is untouched until the thimble
// exists.

import { describe, it, expect } from 'vitest';
import {
  emptyBestiary,
  applyBestiaryEvents,
  mergedBestiary,
  bestiaryStatus,
  type BestiaryEntryState,
  type BestiaryEvent,
} from '../../src/bestiary/bestiary';

describe('bestiary state transitions', () => {
  it('an empty state has every flag false and zero counts', () => {
    const e = emptyBestiary('silt-pikelet');
    expect(e).toEqual({
      speciesId: 'silt-pikelet',
      seen: false,
      fought: false,
      cleanCatch: false,
      willing: false,
      kills: 0,
      catches: 0,
    });
  });

  it('hooked = seen + fought (the silhouette is only revealed at the hook)', () => {
    const out = applyBestiaryEvents({}, [{ speciesId: 'glass-minnow', event: 'hooked' }]);
    const e = out['glass-minnow']!;
    expect(e.seen).toBe(true);
    expect(e.fought).toBe(true);
    expect(e.cleanCatch).toBe(false);
    expect(e.catches).toBe(0);
  });

  it('a clean land grants the checkmark and counts a catch', () => {
    const base: Record<string, BestiaryEntryState> = {
      'glass-minnow': { ...emptyBestiary('glass-minnow'), seen: true, fought: true },
    };
    const out = applyBestiaryEvents(base, [{ speciesId: 'glass-minnow', event: 'clean' }]);
    expect(out['glass-minnow']!.cleanCatch).toBe(true);
    expect(out['glass-minnow']!.catches).toBe(1);
    expect(out['glass-minnow']!.kills).toBe(0);
  });

  it('a butcher credits kills but never the checkmark', () => {
    const base: Record<string, BestiaryEntryState> = {
      'damp-roller': { ...emptyBestiary('damp-roller'), seen: true, fought: true },
    };
    const out = applyBestiaryEvents(base, [{ speciesId: 'damp-roller', event: 'butchered' }]);
    expect(out['damp-roller']!.kills).toBe(1);
    expect(out['damp-roller']!.cleanCatch).toBe(false);
    expect(out['damp-roller']!.catches).toBe(0);
  });

  it('a clean land on a species never previously fought still counts', () => {
    const out = applyBestiaryEvents({}, [
      { speciesId: 'toady-office', event: 'hooked' },
      { speciesId: 'toady-office', event: 'clean' },
    ]);
    expect(out['toady-office']!.fought).toBe(true);
    expect(out['toady-office']!.cleanCatch).toBe(true);
    expect(out['toady-office']!.catches).toBe(1);
  });

  it('willing is never touched by the tether events (thimble comes later)', () => {
    const base: Record<string, BestiaryEntryState> = {
      'marens-fox': { ...emptyBestiary('marens-fox'), willing: true },
    };
    const out = applyBestiaryEvents(base, [
      { speciesId: 'marens-fox', event: 'hooked' },
      { speciesId: 'marens-fox', event: 'clean' },
    ]);
    expect(out['marens-fox']!.willing).toBe(true);
  });

  it('applyBestiaryEvents does not mutate its input state', () => {
    const base: Record<string, BestiaryEntryState> = {};
    const out = applyBestiaryEvents(base, [{ speciesId: 'glass-minnow', event: 'hooked' }]);
    expect(base).toEqual({});
    expect(out['glass-minnow']).toBeDefined();
  });

  it('mergedBestiary folds the run events over the persisted state (the mid-run UI view)', () => {
    const persisted: Record<string, BestiaryEntryState> = {
      'silt-pikelet': { ...emptyBestiary('silt-pikelet'), seen: true, fought: true },
    };
    const runEvents: BestiaryEvent[] = [{ speciesId: 'glass-minnow', event: 'hooked' }];
    const view = mergedBestiary(persisted, runEvents);
    expect(view['silt-pikelet']!.fought).toBe(true);
    expect(view['glass-minnow']!.fought).toBe(true);
    expect(view['damp-roller']).toBeUndefined();
  });
});

describe('bestiaryStatus (the UI card tier)', () => {
  it('clean > fought > undiscovered', () => {
    expect(bestiaryStatus(undefined)).toBe('undiscovered');
    expect(bestiaryStatus({ ...emptyBestiary('x'), seen: true })).toBe('undiscovered');
    expect(bestiaryStatus({ ...emptyBestiary('x'), seen: true, fought: true })).toBe('fought');
    expect(bestiaryStatus({ ...emptyBestiary('x'), seen: true, fought: true, cleanCatch: true })).toBe('clean');
  });
});