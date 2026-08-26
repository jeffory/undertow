// THE CONGREGATION (systems) — the driver half of the Kelp Graves boss, plan 05
// §2.1. Runs in its own sim slot AFTER `combat` (so the tick's gaff hits are
// fresh) and BEFORE `updateDreadSystem` (so the run reducer never sees a single
// boss catch where a burst of twelve to eighteen belongs).
//
// What it does, in the plan's order:
//   1. the mass pool decays — exhaustion (the swarm centre's own stamina) and
//      gaffs (a swing tears members straight off the hook);
//   2. members detach in the seeded tear order and drift away;
//   3. the pool scales the fight's pullForce, so it starts heavy and lightens;
//   4. an exhausted pool exhausts the centre, which arms the ORDINARY LAND
//      prompt — the boss is landed with the verb every catch is landed with;
//   5. LAND bursts the cluster into 12-18 individual landed catches (real
//      HaulRecords through the existing memories/bestiary/loot pipeline) and
//      starts the invoice overlay's clock.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import { FISH_TARGET_ID } from '../game/combat';
import { createRng, LOOT } from '../core/rngStreams';
import { catchMemories, type CatchRecord } from '../extract/memories';
import { applyDreadGain, landGainByTier } from '../game/dread';
import { currentDreadMult } from '../run/reducer';
import { recordBestiary } from '../bestiary/bestiary';
import { rollCatchDrop, type RollCtx } from '../loot/roller';
import { tierFor } from '../game/dread';
import { generateFishParams } from '../gen/fishParams';
import { speciesById, KELP_BURST_ROSTER } from '../data/species';
import { emitTownEvent } from '../meta/townEvents';
import { TOTAL_ACCOUNTS } from '../content/congregationInvoice';
import {
  INVOICE_ROW_SECONDS,
  gaffTearFor,
  createCongregationState,
  invoiceSkippable,
  massPoolFor,
  pullForceMultFor,
  rollBurstCount,
  rollBurstSpecies,
  tearMembersTo,
  tornCountFor,
} from '../bosses/congregation';

// Salt for the burst's own LOOT draw. The swarm was grown off the boss's PCG32
// stream at the hook-set; the burst draws from its own point in seed space so
// the shower is reproducible without replaying the school.
const BURST_SALT = 0x42555253; // 'BURS'

// s the stamped ledger stays up before it clears itself. E dismisses it sooner.
export const INVOICE_CLOSE_SECONDS = 4;

// The kelp-zone roster's display names, in the order the burst drew them, with
// duplicates collapsed — the names the unseeded accounts are itemised with.
function fillerNames(speciesIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of speciesIds) {
    const name = speciesById(id).name;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

// THE BURST (plan 05 §2.1: "the cluster bursts into 12-18 individual landed
// catches (loot shower + guaranteed bestiary credits)"). Each one is a real
// CatchRecord through the ordinary memories math, so the receipt, the Memories
// conversion, the condolence rate and the save all read it as a haul — because
// it is one.
function burstLanding(world: WorldState): void {
  const state = world.congregation;
  const rng = createRng(world.seed, LOOT, (BURST_SALT ^ state.fightId) >>> 0);
  const count = rollBurstCount(rng);
  const picks = rollBurstSpecies(rng, KELP_BURST_ROSTER, count);

  const ctxBase = {
    zoneDepth: world.run.zone,
    dreadTier: tierFor(world.dread),
    licenseGrade: world.run.licenseGrade,
    qualityBonus: 1, // every one of them is a clean land
  };

  for (const id of picks) {
    const preset = speciesById(id);
    const params = generateFishParams(preset, rng, { zone: world.run.zone });
    const tier = preset.tier;
    const memories = catchMemories(params.weightKg, tier, true);
    const rec: CatchRecord = {
      species: preset.name.toLowerCase(), // receipt name ("one (1) pew-shad, damp")
      tier,
      weight: params.weightKg,
      clean: true,
      memories,
      xp: memories,
    };
    world.run.haul.push(rec);
    // guaranteed bestiary credit — the whole point of landing dozens
    recordBestiary(world, id, 'clean');
    const ctx: RollCtx = { ...ctxBase, catchTier: tier };
    const drop = rollCatchDrop(rng, ctx);
    if (drop) world.run.inventory.push(drop);
  }

  // One Dread gain for one landing, at the epic band the boss is priced in — not
  // twelve to eighteen of them. Landing the Congregation is one act.
  world.dread = applyDreadGain(world.dread, landGainByTier(4), currentDreadMult(world));
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  // The run reducer runs after this system and would otherwise land the swarm
  // centre a second time, as one catch. The burst IS the landing.
  world.run.activeCatch = null;

  state.landed = true;
  state.active = false;
  state.burstCount = count;

  // The ledger reads the haul back. Presentation only — it is already banked.
  state.invoice.active = true;
  state.invoice.rowIndex = 0;
  state.invoice.timer = INVOICE_ROW_SECONDS;
  state.invoice.fillers = fillerNames(picks);
  state.invoice.done = false;
  state.invoice.skipPrev = world.intent.extract;

  emitTownEvent({
    type: 'boss.landed',
    bossId: 'congregation',
    zone: world.run.zone,
    fightId: state.fightId,
    burst: count,
    accounts: TOTAL_ACCOUNTS,
  });
}

// The ledger's clock. Rows descend at INVOICE_ROW_SECONDS each; the verb is the
// same E the buoy and the sinkhole use, and it only bites after row 10 (by then
// the joke has landed and the player has read that the joke is the point).
function stepInvoice(world: WorldState, dt: number): void {
  const inv = world.congregation.invoice;
  if (!inv.active) return;
  const press = world.intent.extract && !inv.skipPrev;
  inv.skipPrev = world.intent.extract;

  if (!inv.done) {
    inv.timer -= dt;
    while (inv.timer <= 0 && inv.rowIndex < TOTAL_ACCOUNTS) {
      inv.rowIndex++;
      inv.timer += INVOICE_ROW_SECONDS;
    }
    if (press && invoiceSkippable(inv)) inv.rowIndex = TOTAL_ACCOUNTS;
    if (inv.rowIndex >= TOTAL_ACCOUNTS) {
      inv.rowIndex = TOTAL_ACCOUNTS;
      inv.done = true;
      inv.timer = INVOICE_CLOSE_SECONDS; // the stamp holds, then the sheet clears
    }
    return;
  }

  inv.timer -= dt;
  if (press || inv.timer <= 0) inv.active = false;
}

export function updateCongregation(world: WorldState, dt: number): void {
  const state = world.congregation;
  stepInvoice(world, dt);
  if (!state.active) return;

  const fight = world.tether.fights.find((f) => f.id === state.fightId) ?? null;

  // The fight ended this tick. LAND bursts; anything else (snap / cut / a
  // butchered centre) is the congregation adjourning itself — no invoice, no
  // ledger, and the ripple is spent for the run.
  if (!fight) {
    let landed = false;
    for (const ev of world.tetherEvents) {
      if (ev.type === 'landed') landed = true;
    }
    if (landed) {
      burstLanding(world);
    } else {
      const invoice = state.invoice;
      Object.assign(state, createCongregationState());
      state.invoice = invoice; // never interrupt a ledger already reading out
    }
    return;
  }

  state.elapsed += dt;

  // GAFFS — the tick's fresh hits on the swarm centre. Counted, never consumed:
  // fishAI drains their stamina next tick (the exhaustion half of the same
  // sentence), and combat clears the array itself at the top of every tick.
  for (const hit of world.combat.hits) {
    if (hit.targetId !== FISH_TARGET_ID) continue;
    state.gaffTears += gaffTearFor(hit.stagger);
  }

  // EXHAUSTION — the centre's own pool, as a fraction.
  const fish = world.fish;
  const staminaFrac =
    fish && fish.tether.maxStamina > 0 ? fish.stamina / fish.tether.maxStamina : 0;
  state.massPool = massPoolFor(state.massPoolMax, staminaFrac, state.gaffTears);

  // Members come off the hook in the seeded order and drift away.
  const centre = fish ? { x: fish.x, z: fish.z } : { x: 0, z: 0 };
  tearMembersTo(state, tornCountFor(state), state.elapsed, centre);

  // "the mass pool scales pullForce so the fight starts heavy and lightens"
  fight.pullForceMult = pullForceMultFor(state);

  // An exhausted pool exhausts the centre, which arms the ORDINARY land prompt
  // (exhausted && within 2 m). The boss is landed with the verb every catch is.
  if (state.massPool <= 0 && fish) {
    fish.stamina = 0;
    fish.tether.exhausted = true;
  }
}
