// BESTIARY TEXT — tests-first (task t19 §2/§5 "entry-text id coverage": every
// species id has text). The transcribed entries in src/data/bestiaryText.ts must
// cover every id in the 12-Shallows species roster (and the boss/bagman special
// records), keeping ids aligned with src/data/species.ts.

import { describe, it, expect } from 'vitest';
import { SHALLOWS_SPECIES, BOSS_AND_BAGMAN } from '../../src/data/species';
import { BESTIARY_TEXT, bestiaryById } from '../../src/data/bestiaryText';

describe('entry-text id coverage', () => {
  it('every Shallows species has a bestiary record', () => {
    for (const sp of SHALLOWS_SPECIES) {
      const record = bestiaryById(sp.id);
      expect(record, `no text for '${sp.id}'`).not.toBeNull();
    }
  });

  it('every bestiary record resolves to a real species preset', () => {
    const ids = new Set([
      ...SHALLOWS_SPECIES.map((s) => s.id),
      ...BOSS_AND_BAGMAN.map((s) => s.id),
    ]);
    for (const record of BESTIARY_TEXT) {
      expect(ids.has(record.id), `text for unknown species '${record.id}'`).toBe(true);
    }
  });

  it('every record carries a silhouette one-liner and a fought entry', () => {
    for (const record of BESTIARY_TEXT) {
      expect(record.silhouette.length).toBeGreaterThan(0);
      expect(record.entryFought.length).toBeGreaterThan(0);
    }
  });

  it('the 12-Shallows roster matches the plan spread (4C / 3U / 4R / 1E)', () => {
    const rarities = SHALLOWS_SPECIES.map((s) => s.rarity);
    const count = (r: string) => rarities.filter((x) => x === r).length;
    expect(count('C')).toBe(4);
    expect(count('U')).toBe(3);
    expect(count('R')).toBe(4);
    expect(count('E')).toBe(1);
  });

  it('the two willing entries (grave-shad, marens-fox) have entryWilling text', () => {
    expect(bestiaryById('grave-shad')!.entryWilling).toBeTruthy();
    expect(bestiaryById('marens-fox')!.entryWilling).toBeTruthy();
  });
});