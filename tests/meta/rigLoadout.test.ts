// RIG GATING (meta) — task t19 slice 2. Pins the plan 05 §1.2 gate rules: a rod
// whose workshop is unrestored or whose tackle grade exceeds the Keeper's
// License is RESTRICTED (town.md §5 sticker copy), the loadout sanitizes on
// open, and the gear that CAN be fed to the run actually lands in the world's
// line/lure slots.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { freshSave } from '../../src/save/migrate';
import type { SaveGame } from '../../src/save/schemas';
import {
  rigGateContext,
  rodGate,
  gradeGate,
  sanitizeRigLoadout,
  reconcileRigLoadout,
  applyRigGear,
} from '../../src/meta/rigLoadout';
import { restrictedNotice } from '../../src/content/townCopy';

function saveWith(over: (s: SaveGame) => SaveGame): SaveGame {
  return over(freshSave());
}

describe('rod gating (town.md §5)', () => {
  it('the base staff is always requisitionable', () => {
    const save = saveWith((s) => s);
    const gate = rodGate({ id: 'rod-staff', name: 'Staff', tackleGrade: 1, unlockedBy: { kind: 'start' } }, rigGateContext(save));
    expect(gate.ok).toBe(true);
  });

  it('the Dredger is withheld until the Smokehouse stands', () => {
    const save = saveWith((s) => s);
    const gate = rodGate({ id: 'rod-dredger', name: 'Dredger', tackleGrade: 2, unlockedBy: { kind: 'restored', id: 'smokehouse' } }, rigGateContext(save));
    expect(gate.ok).toBe(false);
    expect(gate.restriction).toBe('restricted_unrestored_building');
    const notice = restrictedNotice(gate.restriction!)!;
    expect(notice.stickerText).toBe('RESTRICTED. NICE TRY.');
    expect(/dry register/.test(notice.noticeBody)).toBe(true);
  });

  it('a restored workshop is not enough — the license grade still applies', () => {
    const save = saveWith((s) => ({
      ...s,
      metaState: {
        ...s.metaState,
        buildings: { chandlery: { restored: true, paid: 45, atRun: 0 } },
      },
    }));
    const gate = rodGate({ id: 'rod-longliner', name: 'Longliner', tackleGrade: 3, unlockedBy: { kind: 'restored', id: 'chandlery' } }, rigGateContext(save));
    expect(gate.ok).toBe(false);
    expect(gate.restriction).toBe('restricted_license_tier');
    const notice = restrictedNotice(gate.restriction!)!;
    expect(notice.stickerText).toBe('RESTRICTED. NICE TRY.');
    expect(/Custodial License/.test(notice.noticeBody)).toBe(true);
  });

  it('gradeGate holds nothing open for a grade-less (inert) class', () => {
    const save = saveWith((s) => s);
    expect(gradeGate(null, rigGateContext(save)).ok).toBe(true);
    expect(gradeGate(undefined, rigGateContext(save)).ok).toBe(true);
  });
});

describe('sanitize + reconcile', () => {
  it('sanitizeRigLoadout drops a rod the town no longer grants', () => {
    const save = saveWith((s) => ({
      ...s,
      rigLoadout: { ...s.rigLoadout, rodId: 'rod-dredger', lineId: 'waxed-linen' },
    }));
    const kept = sanitizeRigLoadout(save);
    expect(kept.rodId).toBeNull(); // Smokehouse unrestored
    expect(kept.lineId).toBe('waxed-linen'); // inert line has no gate
  });

  it('reconcileRigLoadout writes the sanitized loadout back and mirrors equipped', () => {
    const save = saveWith((s) => ({
      ...s,
      rigLoadout: {
        ...s.rigLoadout,
        rodId: 'rod-dredger',
        lureIds: ['a', 'b'],
        trinketIds: ['t1', 't2'],
        consumables: ['c'],
      },
    }));
    const out = reconcileRigLoadout(save);
    expect(out.rigLoadout.rodId).toBeNull();
    expect(out.rigLoadout.trinketIds).toEqual(['t1', 't2']);
    expect(out.equipped).toEqual(['t1', 't2']);
  });
});

describe('applyRigGear feeds the run slots', () => {
  it('an equipped line + first lure land in world.line / world.lure', () => {
    const save = saveWith((s) => ({
      ...s,
      rigLoadout: {
        rodId: 'rod-staff',
        lineId: 'bellwire',
        lureIds: ['Lantern Grub', 'Wailing Spoon'],
        trinketIds: [],
        consumables: [],
      },
    }));
    const world = createWorld(1);
    applyRigGear(world, save);
    expect(world.line.id).toBe('bellwire');
    expect(world.lure.id).toBe('Lantern Grub');
  });

  it('a gated rod is never smuggled into the run', () => {
    const save = saveWith((s) => ({
      ...s,
      rigLoadout: {
        rodId: 'rod-dredger', // Smokehouse not restored
        lineId: null,
        lureIds: [],
        trinketIds: [],
        consumables: [],
      },
    }));
    const world = createWorld(1);
    applyRigGear(world, save);
    // rods have no run slot yet — but the sanitize must not throw, and an empty
    // line must not clobber the base line
    expect(world.line.id).toBe('waxed-linen');
  });
});