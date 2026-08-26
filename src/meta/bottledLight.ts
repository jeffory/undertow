// BOTTLED LIGHT (meta) — plan 05 §1.7, task t21.
//
// "Decant station at the lighthouse: converts light into a Bottled Light
// consumable (rare; full stamina + tension reset in-run — fires the t2/t1 reset
// hooks). Finite global pool of 9 decants total (~1 per run across the
// campaign); each decant permanently dims the hub light: `intensity −=`,
// `sweepFrequency −=`, colour cools. The dimming is cumulative across runs and
// the only reaction is the light's."
//
// Two sources, one item, ONE of them dims:
//   • the lighthouse decant station — free, capped at DECANT_POOL for the whole
//     campaign, and every use permanently costs the hub light (`meta.decants`);
//   • the Weirside Apothecary — Memory-priced, unbounded, and the beam never
//     notices. "the dimming source is always the player's own hand."
//
// The beam curve f(totalDecants) lives here rather than in render/sky.ts so the
// arithmetic is testable without three: §1.1 says the hub light's `intensity`,
// `color` and `sweepFrequency` are all driven by `1 − f(totalDecants)`, and
// render/sky.ts is only the seam that applies it.
//
// Everything here is PURE over MetaState / WorldState — no DOM, no `three`, no
// Math.random, no Date. Callers own persistence and event emission (the same
// contract meta/restoration.ts keeps).

import type { MetaState, SundryItem } from '../save/schemas';
import type { WorldState } from '../core/world';
import { isRestored } from './restoration';

// plan §1.7: "Finite global pool of 9 decants total (~1 per run across the
// campaign)". The pool is global and permanent — it does not refill.
export const DECANT_POOL = 9;

// The item id prefix. Each decant mints its OWN id (`bottled-light-1` …
// `bottled-light-9`) rather than stacking one id: the rig-up register's slot
// selection is a Set of ids (ui/rigUpScreen.ts), so two bottles under one id
// would collapse into a single requisition line.
export const BOTTLED_LIGHT_ID = 'bottled-light';
export const BOTTLED_LIGHT_NAME = 'Bottled Light';

// The Apothecary's alternative source (plan §1.7 "purchasable rarely at the
// Apothecary (Memory-priced)"). The plan gives no number — INTERPRETED: 60
// Memories, between the Chandlery (45) and the Apothecary itself (110), so a
// bottle costs more than a cheap building's fraction and stays "rare".
export const BOTTLED_LIGHT_PRICE = 60;
export const APOTHECARY_ID = 'apothecary';

// How many bottles the rig-up may carry (SCHEDULE E holds six stores; the
// register's own consumable cap).
export const RIG_CONSUMABLE_CAP = 6;

// --- the beam curve (plan §1.1: intensity/colour/sweep all `1 − f(decants)`) ---
// f is the fraction of the finite pool already poured, eased so the FIRST
// decants read on screen (a linear 1/9 step is invisible at the beam's 0.07
// opacity) without the last ones going black. The three ranges below are the
// visual budget: at a full pool the beam keeps 35% of its intensity and half
// its sweep rate — dimmer and colder and slower, never off.
export const BEAM_INTENSITY_DROP = 0.65;
export const BEAM_SWEEP_DROP = 0.5;
export const BEAM_COOL_MAX = 0.8;
const CURVE_EXP = 0.75;

export function decantFraction(decants: number): number {
  const d = Math.min(DECANT_POOL, Math.max(0, Math.floor(decants)));
  return Math.pow(d / DECANT_POOL, CURVE_EXP);
}

export interface HubLightCurve {
  /** multiplier on beam opacity + the lantern-room point light (1 → untouched) */
  intensityScale: number;
  /** multiplier on the beam's sweep rate (§3.2's meta-clock, visibly slowed) */
  sweepScale: number;
  /** 0..1 lerp of the beam colour from lantern-warm toward a cold pale */
  coolness: number;
}

// The whole of §1.1's "driven by 1 − f(totalDecants)", in one place.
export function hubLightCurve(decants: number): HubLightCurve {
  const f = decantFraction(decants);
  return {
    intensityScale: 1 - BEAM_INTENSITY_DROP * f,
    sweepScale: 1 - BEAM_SWEEP_DROP * f,
    coolness: BEAM_COOL_MAX * f,
  };
}

// --- the decant ----------------------------------------------------------------

export interface BottledLightDecantedEvent {
  type: 'bottledLight.decanted';
  /** decants standing AFTER this one */
  decants: number;
  remaining: number;
  itemId: string;
  source: 'lighthouse' | 'apothecary';
  /** what the hub light is worth now — the only reaction there is */
  intensityScale: number;
  sweepScale: number;
}

export interface BottledLightUsedEvent {
  type: 'bottledLight.used';
  /** charges left in the run pool AFTER this use */
  remaining: number;
  /** fights whose tension this reset */
  fightsReset: number;
  /** the highest tension standing at the moment of use (0 with no fight) */
  tensionBefore: number;
  staminaBefore: number;
}

export type DecantFailure = 'pool-exhausted' | 'apothecary-unrestored' | 'insufficient-memories';

export interface DecantResult {
  ok: boolean;
  meta: MetaState; // unchanged on failure
  item?: SundryItem;
  event?: BottledLightDecantedEvent;
  reason?: DecantFailure;
}

export function decantsRemaining(meta: MetaState): number {
  return Math.max(0, DECANT_POOL - Math.max(0, Math.floor(meta.decants)));
}

export function canDecant(meta: MetaState): { ok: boolean; reason?: DecantFailure } {
  if (decantsRemaining(meta) <= 0) return { ok: false, reason: 'pool-exhausted' };
  return { ok: true };
}

// One bottle. `n` is the 1-based mint number (the decant this bottle came from,
// or the purchase count) — it only has to be unique inside the player's box.
export function bottledLightItem(n: number, source: 'lighthouse' | 'apothecary' = 'lighthouse'): SundryItem {
  return {
    id: `${BOTTLED_LIGHT_ID}-${source === 'apothecary' ? 'phial-' : ''}${Math.max(1, Math.floor(n))}`,
    name: BOTTLED_LIGHT_NAME,
    rarity: 'R',
    slot: 'consumable',
    effects: [
      { key: 'stamina', value: 100 },
      { key: 'tensionReset', value: 1 },
    ],
  };
}

// Pour one bottle at the lighthouse. Returns a NEW MetaState (never mutates),
// the minted item, and the §0.2 `bottledLight.decanted` event. The light pays:
// `decants` is the only counter that moves, and it never comes back down.
export function decant(meta: MetaState): DecantResult {
  const check = canDecant(meta);
  if (!check.ok) return { ok: false, meta, reason: check.reason };
  const decants = Math.max(0, Math.floor(meta.decants)) + 1;
  const next: MetaState = { ...meta, decants };
  const item = bottledLightItem(decants, 'lighthouse');
  const curve = hubLightCurve(decants);
  return {
    ok: true,
    meta: next,
    item,
    event: {
      type: 'bottledLight.decanted',
      decants,
      remaining: decantsRemaining(next),
      itemId: item.id,
      source: 'lighthouse',
      intensityScale: curve.intensityScale,
      sweepScale: curve.sweepScale,
    },
  };
}

// The Apothecary's phial (plan §1.7): Memory-priced, needs the shop on the dry
// register, and does NOT touch `decants` — the beam never dims for a purchase.
// `mintedCount` is how many bottles the box already holds (for the item id).
export function purchaseBottledLight(meta: MetaState, mintedCount: number): DecantResult {
  if (!isRestored(meta, APOTHECARY_ID)) {
    return { ok: false, meta, reason: 'apothecary-unrestored' };
  }
  if (meta.memories < BOTTLED_LIGHT_PRICE) {
    return { ok: false, meta, reason: 'insufficient-memories' };
  }
  const next: MetaState = { ...meta, memories: meta.memories - BOTTLED_LIGHT_PRICE };
  const item = bottledLightItem(Math.max(1, Math.floor(mintedCount) + 1), 'apothecary');
  const curve = hubLightCurve(next.decants);
  return {
    ok: true,
    meta: next,
    item,
    event: {
      type: 'bottledLight.decanted',
      decants: next.decants,
      remaining: decantsRemaining(next),
      itemId: item.id,
      source: 'apothecary',
      intensityScale: curve.intensityScale,
      sweepScale: curve.sweepScale,
    },
  };
}

// --- the run pool --------------------------------------------------------------

export function isBottledLightId(id: string): boolean {
  return id === BOTTLED_LIGHT_ID || id.startsWith(`${BOTTLED_LIGHT_ID}-`);
}

// How many charges a packed loadout carries into the basin. Called by the
// run-start feed (meta/rigLoadout.ts `applyRigGear`).
export function bottledLightCharges(consumables: readonly string[]): number {
  let n = 0;
  for (const id of consumables) if (isBottledLightId(id)) n++;
  return n;
}

// --- the in-run use ------------------------------------------------------------

// Tension reset over a fight list (plan §0.1's tether interface: "Bottled Light
// tension-reset"). Pure over the minimal shape so it is testable without a
// world; returns how many fights it touched.
export function resetFightTension(fights: { tension: number }[]): number {
  for (const f of fights) f.tension = 0;
  return fights.length;
}

// Pop one bottle in the run: full stamina + tension to ~0 on every live fight.
// Returns the §0.2 `bottledLight.used` event, or null when there is no charge
// (the caller emits — same contract as meta/restoration.ts).
export function useBottledLight(world: WorldState): BottledLightUsedEvent | null {
  if (world.consumables.bottledLight <= 0) return null;
  const tensionBefore = world.tether.fights.reduce((m, f) => Math.max(m, f.tension), 0);
  const staminaBefore = world.player.stamina;
  const fightsReset = resetFightTension(world.tether.fights);
  // full stamina (§1.7) — and the regen lockout the spend left behind is lifted
  // too, otherwise "full stamina" is followed by 0.8 s of nothing.
  world.player.stamina = world.player.maxStamina;
  world.player.staminaRegenDelay = 0;
  world.consumables.bottledLight -= 1;
  return {
    type: 'bottledLight.used',
    remaining: world.consumables.bottledLight,
    fightsReset,
    tensionBefore,
    staminaBefore,
  };
}
