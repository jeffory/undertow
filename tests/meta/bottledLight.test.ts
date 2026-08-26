// BOTTLED LIGHT (meta) — task t21. Pins plan 05 §1.7's rules as written: a
// finite global pool of nine decants, one Bottled Light minted per pour, the
// hub light dimmed/cooled/slowed on the same `1 − f(totalDecants)` curve
// (§1.1), the Apothecary's Memory-priced phial that does NOT dim it, and the
// in-run effect — full stamina + tension reset (§0.1's tether interface).

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { freshSave, freshMetaState } from '../../src/save/migrate';
import type { MetaState, SaveGame } from '../../src/save/schemas';
import { applyRigGear } from '../../src/meta/rigLoadout';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import { updateBottledLight } from '../../src/systems/bottledLight';
import { clearTownEvents, drainTownEvents } from '../../src/meta/townEvents';
import {
  BEAM_INTENSITY_DROP,
  BEAM_SWEEP_DROP,
  BOTTLED_LIGHT_PRICE,
  DECANT_POOL,
  bottledLightCharges,
  bottledLightItem,
  canDecant,
  decant,
  decantFraction,
  decantsRemaining,
  hubLightCurve,
  isBottledLightId,
  purchaseBottledLight,
  resetFightTension,
  useBottledLight,
} from '../../src/meta/bottledLight';

function saveWith(over: (s: SaveGame) => SaveGame): SaveGame {
  return over(freshSave());
}

// Pour n decants off a fresh town, returning the final MetaState.
function pour(n: number, from: MetaState = freshMetaState()): MetaState {
  let meta = from;
  for (let i = 0; i < n; i++) {
    const out = decant(meta);
    expect(out.ok).toBe(true);
    meta = out.meta;
  }
  return meta;
}

describe('the decant pool (§1.7: nine decants, total)', () => {
  it('pours nine and refuses the tenth', () => {
    let meta = freshMetaState();
    for (let i = 1; i <= DECANT_POOL; i++) {
      const out = decant(meta);
      expect(out.ok).toBe(true);
      expect(out.meta.decants).toBe(i);
      expect(out.event?.remaining).toBe(DECANT_POOL - i);
      meta = out.meta;
    }
    expect(decantsRemaining(meta)).toBe(0);
    expect(canDecant(meta).reason).toBe('pool-exhausted');
    const tenth = decant(meta);
    expect(tenth.ok).toBe(false);
    expect(tenth.reason).toBe('pool-exhausted');
    expect(tenth.meta.decants).toBe(DECANT_POOL); // the refusal never spends
  });

  it('never mutates the MetaState handed in', () => {
    const meta = freshMetaState();
    const out = decant(meta);
    expect(meta.decants).toBe(0);
    expect(out.meta).not.toBe(meta);
  });

  it('mints one uniquely-identified Bottled Light per pour', () => {
    const ids = new Set<string>();
    let meta = freshMetaState();
    for (let i = 0; i < DECANT_POOL; i++) {
      const out = decant(meta);
      meta = out.meta;
      const item = out.item!;
      expect(item.name).toBe('Bottled Light');
      expect(item.slot).toBe('consumable');
      expect(item.rarity).toBe('R');
      expect(isBottledLightId(item.id)).toBe(true);
      ids.add(item.id);
    }
    expect(ids.size).toBe(DECANT_POOL);
  });

  it('emits bottledLight.decanted carrying what the lamp is now worth', () => {
    const out = decant(freshMetaState());
    const ev = out.event!;
    expect(ev.type).toBe('bottledLight.decanted');
    expect(ev.source).toBe('lighthouse');
    expect(ev.decants).toBe(1);
    expect(ev.intensityScale).toBeCloseTo(hubLightCurve(1).intensityScale, 6);
    expect(ev.sweepScale).toBeCloseTo(hubLightCurve(1).sweepScale, 6);
  });
});

describe("the Apothecary's phial (§1.7: it does NOT dim the light)", () => {
  it('is withheld until the Weirside Apothecary stands', () => {
    const out = purchaseBottledLight({ ...freshMetaState(), memories: 999 }, 0);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('apothecary-unrestored');
  });

  it('is Memory-priced and refuses an overdraft', () => {
    const meta: MetaState = {
      ...freshMetaState(),
      memories: BOTTLED_LIGHT_PRICE - 1,
      buildings: { apothecary: { restored: true, paid: 110, atRun: 0 } },
    };
    expect(purchaseBottledLight(meta, 0).reason).toBe('insufficient-memories');
    const rich = { ...meta, memories: BOTTLED_LIGHT_PRICE };
    const out = purchaseBottledLight(rich, 0);
    expect(out.ok).toBe(true);
    expect(out.meta.memories).toBe(0);
  });

  it('leaves `decants` — and therefore the beam — untouched', () => {
    const meta: MetaState = {
      ...pour(3),
      memories: 500,
      buildings: { apothecary: { restored: true, paid: 110, atRun: 0 } },
    };
    const out = purchaseBottledLight(meta, 3);
    expect(out.ok).toBe(true);
    expect(out.meta.decants).toBe(3);
    expect(decantsRemaining(out.meta)).toBe(DECANT_POOL - 3);
    expect(out.event?.source).toBe('apothecary');
    expect(out.item?.name).toBe('Bottled Light');
  });
});

describe('the beam curve f(decants) (§1.1: intensity/colour/sweep on 1 − f)', () => {
  it('an untouched lamp is exactly its own base', () => {
    const c = hubLightCurve(0);
    expect(c.intensityScale).toBe(1);
    expect(c.sweepScale).toBe(1);
    expect(c.coolness).toBe(0);
  });

  it('falls monotonically over the whole pool and never reaches zero', () => {
    let prevI = Infinity;
    let prevS = Infinity;
    for (let d = 0; d <= DECANT_POOL; d++) {
      const c = hubLightCurve(d);
      expect(c.intensityScale).toBeLessThan(prevI);
      expect(c.sweepScale).toBeLessThan(prevS);
      expect(c.intensityScale).toBeGreaterThan(0);
      expect(c.sweepScale).toBeGreaterThan(0);
      prevI = c.intensityScale;
      prevS = c.sweepScale;
    }
    const full = hubLightCurve(DECANT_POOL);
    expect(full.intensityScale).toBeCloseTo(1 - BEAM_INTENSITY_DROP, 6);
    expect(full.sweepScale).toBeCloseTo(1 - BEAM_SWEEP_DROP, 6);
  });

  it('is READABLE at three decants (the visual bar: side-by-side, not crippling)', () => {
    const three = hubLightCurve(3);
    expect(1 - three.intensityScale).toBeGreaterThan(0.2); // visibly dimmer
    expect(three.intensityScale).toBeGreaterThan(0.6); // but the lamp still works
    expect(1 - hubLightCurve(1).intensityScale).toBeLessThan(0.2); // one draw is a nudge
  });

  it('clamps beyond the pool and floors fractional counts', () => {
    expect(decantFraction(99)).toBe(1);
    expect(decantFraction(-4)).toBe(0);
    expect(hubLightCurve(3.9).intensityScale).toBe(hubLightCurve(3).intensityScale);
  });
});

describe('the run pool (the loadout carries the bottles)', () => {
  it('counts only Bottled Light ids out of the packed stores', () => {
    expect(bottledLightCharges(['chum', 'bottled-light-1', 'bottled-light-2', 'ration'])).toBe(2);
    expect(bottledLightCharges([])).toBe(0);
  });

  it('applyRigGear feeds the packed bottles into the run as charges', () => {
    const save = saveWith((s) => ({
      ...s,
      rigLoadout: {
        ...s.rigLoadout,
        consumables: [bottledLightItem(1).id, 'Prepared Chum', bottledLightItem(2).id],
      },
    }));
    const world = createWorld(7);
    applyRigGear(world, save);
    expect(world.consumables.bottledLight).toBe(2);
  });

  it('a rig with no bottles opens the run with no charges', () => {
    const world = createWorld(7);
    applyRigGear(world, freshSave());
    expect(world.consumables.bottledLight).toBe(0);
  });
});

describe('the in-run use (§0.1: Bottled Light tension-reset)', () => {
  it('resetFightTension zeroes every live line', () => {
    const fights = [{ tension: 88 }, { tension: 12 }];
    expect(resetFightTension(fights)).toBe(2);
    expect(fights.map((f) => f.tension)).toEqual([0, 0]);
  });

  it('drops the fight to zero tension and refills stamina, spending one charge', () => {
    const world = createWorld(11);
    world.mode = 'foot';
    world.fish = createFish();
    const fight = startTetherFight(world, M2_SPECIES, 'player')!;
    fight.tension = 92;
    world.player.stamina = 9;
    world.player.staminaRegenDelay = 0.8;
    world.consumables.bottledLight = 2;

    const ev = useBottledLight(world)!;
    expect(ev.type).toBe('bottledLight.used');
    expect(ev.tensionBefore).toBe(92);
    expect(ev.staminaBefore).toBe(9);
    expect(ev.fightsReset).toBe(1);
    expect(fight.tension).toBe(0);
    expect(world.player.stamina).toBe(world.player.maxStamina);
    expect(world.player.staminaRegenDelay).toBe(0);
    expect(world.consumables.bottledLight).toBe(1);
    expect(ev.remaining).toBe(1);
  });

  it('refuses when the run carries no bottle (and spends nothing)', () => {
    const world = createWorld(11);
    world.player.stamina = 5;
    world.consumables.bottledLight = 0;
    expect(useBottledLight(world)).toBeNull();
    expect(world.player.stamina).toBe(5);
    expect(world.consumables.bottledLight).toBe(0);
  });

  it('is usable with no fight standing — the stamina half still lands', () => {
    const world = createWorld(11);
    world.player.stamina = 3;
    world.consumables.bottledLight = 1;
    const ev = useBottledLight(world)!;
    expect(ev.fightsReset).toBe(0);
    expect(ev.tensionBefore).toBe(0);
    expect(world.player.stamina).toBe(world.player.maxStamina);
  });
});

describe('the system seam (L pops one bottle, once)', () => {
  it('consumes the intent tap and emits bottledLight.used', () => {
    clearTownEvents();
    const world = createWorld(3);
    world.mode = 'foot';
    world.fish = createFish();
    const fight = startTetherFight(world, M2_SPECIES, 'player')!;
    fight.tension = 70;
    world.consumables.bottledLight = 1;

    world.intent.bottledLight = true;
    updateBottledLight(world, 1 / 60);
    expect(world.intent.bottledLight).toBe(false);
    expect(fight.tension).toBe(0);
    expect(world.consumables.bottledLight).toBe(0);

    const events = drainTownEvents();
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('bottledLight.used');
  });

  it('emits nothing on a tap with an empty pool', () => {
    clearTownEvents();
    const world = createWorld(3);
    world.consumables.bottledLight = 0;
    world.intent.bottledLight = true;
    updateBottledLight(world, 1 / 60);
    expect(drainTownEvents()).toEqual([]);
  });

  it('is inert without the tap', () => {
    const world = createWorld(3);
    world.consumables.bottledLight = 1;
    updateBottledLight(world, 1 / 60);
    expect(world.consumables.bottledLight).toBe(1);
  });
});
