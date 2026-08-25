// STAMINA — WORKER A OWNS THIS FILE.
// M1: stamina pool (plan 01 §4.3, spec 4.1). Pool 100, regen 40/s after a 0.8s
// delay (no regen during the window after a spend); costs dodge 25, heavy gaff
// 30. Runs from the intent slot right after updateController, so the pool
// reflects the controller's spends this same step. Reel-stance drain (10/s) is
// reserved for 02.
//
// spendStamina(player, amount) is the shared spend seam — WORKER B's combat
// imports it for the 30-cost heavy.
//
// M4 (t19): the pool ceiling is per-run player.maxStamina (G2 license +10 at run
// start) and the Damp trinket adds flat staminaRegenBonus regen/s — the 100
// ceiling + 40/s base are the defaults every run resets to.

import type { PlayerState, WorldState } from '../core/world';

export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 40; // per second, plan §4.3
export const STAMINA_DELAY = 0.8; // seconds of no regen after a spend

const EPS = 1e-9; // timer snapping so fixed-step ticks land on exact windows

// Try to spend `amount` from the pool. Returns false (and changes nothing) when
// the pool is short — no partial spends. A successful spend restarts the 0.8s
// no-regen window; a failed one does not touch it.
export function spendStamina(player: PlayerState, amount: number): boolean {
  if (player.stamina < amount) return false;
  player.stamina -= amount;
  player.staminaRegenDelay = STAMINA_DELAY;
  return true;
}

// Tick the pool: count the no-regen window down, then regen up to the run's
// ceiling (player.maxStamina) at the base rate + the equipped trinket bonus.
// Regen applies on the same step the delay elapses, so the pause is exactly 0.8s.
export function updateStamina(world: WorldState, dt: number): void {
  const p = world.player;
  if (p.staminaRegenDelay > 0) {
    p.staminaRegenDelay -= dt;
    if (p.staminaRegenDelay <= EPS) p.staminaRegenDelay = 0;
  }
  if (p.staminaRegenDelay === 0 && p.stamina < p.maxStamina) {
    p.stamina = Math.min(p.maxStamina, p.stamina + (STAMINA_REGEN + p.staminaRegenBonus) * dt);
  }
}