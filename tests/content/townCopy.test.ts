// TOWN COPY — task t18 slice 4. The ledger consumes docs/story/town.md §3
// verbatim; these pin that the copy module and the buildings data never drift
// apart, and that the loader seam (a later copy pass = a data swap) works.

import { describe, it, expect } from 'vitest';
import { BUILDINGS, buildingDef } from '../../src/content/buildings';
import {
  AMBIENT_HUB_LINES,
  TOWN_COPY,
  loadTownCopy,
  townCopyFor,
  townName,
} from '../../src/content/townCopy';

describe('copy ↔ data', () => {
  it('every building has a copy row', () => {
    for (const def of BUILDINGS) {
      expect(townCopyFor(def.id), def.id).not.toBeNull();
    }
  });

  it('every copy row has a building', () => {
    for (const id of Object.keys(TOWN_COPY)) {
      expect(buildingDef(id), id).not.toBeNull();
    }
  });

  it('costs never drift — the notice quotes the price the ledger charges', () => {
    for (const def of BUILDINGS) {
      expect(townCopyFor(def.id)!.restorationNotice.costMemories, def.id).toBe(def.cost);
    }
  });

  it('every notice carries a form code, 2+ lines, a Dread warning and a stamp', () => {
    for (const def of BUILDINGS) {
      const copy = townCopyFor(def.id)!;
      expect(copy.restorationNotice.formCode.length).toBeGreaterThan(0);
      expect(copy.restorationNotice.noticeLines.length).toBeGreaterThanOrEqual(2);
      expect(copy.restorationNotice.dreadNotice).toMatch(/Dread/);
      expect(copy.stampRestored.length).toBeGreaterThan(0);
      expect(copy.benefitSummary.length).toBeGreaterThan(0);
      expect(copy.residentName.length).toBeGreaterThan(0);
    }
  });

  it('the three ambient shoreline lines are present', () => {
    expect(AMBIENT_HUB_LINES.map((l) => l.focus)).toEqual(['street', 'water', 'light']);
  });

  it('townName falls back when an id has no copy row', () => {
    expect(townName('smokehouse', 'x')).toBe('Old Sluice Smokehouse');
    expect(townName('sunken-casino', 'The Sunken Casino')).toBe('The Sunken Casino');
  });
});

describe('the loader seam', () => {
  it('merges a partial copy array in by id', () => {
    const before = townCopyFor('bakery')!;
    const applied = loadTownCopy([
      {
        id: 'bakery',
        name: 'Hollow Commons Bakery (rev. 2)',
        category: before.category,
        residentId: before.residentId,
        residentName: before.residentName,
        restorationNotice: {
          formCode: 'CIRCULAR 3-K',
          noticeLines: ['A new line.', 'And another.'],
          costMemories: 110,
          dreadNotice: 'The basin notes the displacement (+2 Starting Dread).',
        },
        stampRestored: 'STAMPED',
        benefitSummary: 'Bread.',
      },
    ]);
    expect(applied).toBe(1);
    expect(townCopyFor('bakery')!.name).toBe('Hollow Commons Bakery (rev. 2)');
    // put it back so ordering between test files can never matter
    loadTownCopy([before]);
    expect(townCopyFor('bakery')!.name).toBe('Hollow Commons Bakery');
  });

  it('skips malformed rows instead of half-applying them', () => {
    const before = townCopyFor('chapel')!;
    expect(loadTownCopy([{ id: 'chapel' }])).toBe(0);
    expect(loadTownCopy([{ id: 'chapel', name: 'X', restorationNotice: {} }])).toBe(0);
    expect(loadTownCopy('not an array')).toBe(0);
    expect(loadTownCopy(null)).toBe(0);
    expect(townCopyFor('chapel')).toEqual(before);
  });
});
