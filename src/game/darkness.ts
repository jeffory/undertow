// THE DARKNESS (game) — the Choir's fog-of-war, plan 05 §2.3:
//
//   "a darkness system replaces normal rendering in this zone: the player's
//    LANTERN RADIUS is the visible disc (light radius is upgradeable — Chandlery
//    bow lantern / trinkets); geometry, disturbances, and the line's far end
//    exist but are NOT DRAWN beyond the disc. Fog-of-war drives navigation
//    dread: you fish what you can't fully see."
//
// ── THE IMPLEMENTATION CHOICE (the decision this round owes) ───────────────────
//
// Not a shader, not a stencil, not a second render target. The disc is bought
// with three things the stack already had, composed:
//
//   (a) FOG — `ZONE_FOG_MULT[4] = 5.5` (core/zones.ts). FogExp2 at the night
//       palette's 0.019 base becomes ~0.105, which is 99% saturated at ~20 m.
//       Distant geometry does not need to be culled: it is already gone.
//   (b) BLACK — `ZONE_SKY_DARKEN[4]` (core/zones.ts) lerps the fog colour and
//       the gradient dome's three stops to near-black, so what geometry fades
//       INTO is a void rather than a teal wall. Fog alone is a wall; fog plus
//       black is a void.
//   (c) THE LANTERN — the warm pool the player already carries. Nothing about
//       the light changes in zone 4; what changes is that it is now the only
//       light there is, so its radius reads as the edge of the world.
//
// Fog and black are free (two multipliers already on the frame path). What fog
// CANNOT do on its own is suppress the cues that are deliberately drawn THROUGH
// it — the ripple rings are `depthTest: false` and the buoy lantern halos are
// additive sprites, both of which are legible at 60 m by design. So the fourth
// piece is an explicit visibility gate, in the shape the M6 occluded-telegraph
// gate established (game/fishAI.ts): the SIM is untouched — the disturbance is
// still there, still castable-at, still ticking — and only its RENDERED CUE is
// withheld. `withinLantern` is that predicate, and it answers `true` for every
// zone but the Choir, so nothing outside zone 4 pays more than one comparison.
//
// ── THE RADIUS IS ONE FUNCTION ────────────────────────────────────────────────
//
// "light radius is upgradeable — Chandlery bow lantern". boat/boatCombat.ts has
// carried `upgrades.bowLantern` as a declared-but-unread number since M3 ("night
// vision radius multiplier (render reads it)"). This is the round that reads it:
// `lanternRadius(world)` is the SINGLE source for the PointLight's distance
// (render/lantern.ts), for every visibility gate, and for the Whistler's roam
// clamp — so an upgrade bought at the Chandlery widens the light, the cue
// horizon and the monster's exclusion ring in one write.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import { CHOIR_ZONE } from '../core/zones';

export { CHOIR_ZONE };

// --- the lantern -------------------------------------------------------------

/**
 * m — the stock lantern's reach. This is `PointLight.distance` in
 * render/lantern.ts, which is the number that actually decides where the warm
 * pool ends; it lives here so the gate and the light can never disagree.
 */
export const LANTERN_BASE_RADIUS = 16;

/** Fractional radius per Chandlery bow-lantern level (spec §3.3 boat upgrades). */
export const BOW_LANTERN_STEP = 0.22;
/** The Chandlery stops selling glass at three. */
export const BOW_LANTERN_MAX_LEVEL = 3;

/** m — how far ahead of the hull the bow lantern hangs (render/lantern.ts). */
export const BOW_OFFSET = 1.75;

/** The radius a given bow-lantern level buys. Pure; the unit under test. */
export function lanternRadiusFor(bowLantern: number): number {
  const level = Math.max(0, Math.min(BOW_LANTERN_MAX_LEVEL, Math.floor(bowLantern || 0)));
  return LANTERN_BASE_RADIUS * (1 + BOW_LANTERN_STEP * level);
}

/** THE radius read. Everything that cares about the disc calls this. */
export function lanternRadius(world: WorldState): number {
  return lanternRadiusFor(world.boatCombat.upgrades.bowLantern);
}

/**
 * Where the light hangs: the BOW aboard (the lantern leads the boat), the
 * keeper's own head on foot. Mirrors render/lantern.ts exactly — that module
 * imports BOW_OFFSET from here so the two cannot drift.
 */
export function lanternOrigin(world: WorldState): { x: number; z: number } {
  if (world.mode === 'foot') return { x: world.player.x, z: world.player.z };
  const b = world.boat;
  return {
    x: b.x + Math.sin(b.heading) * BOW_OFFSET,
    z: b.z + Math.cos(b.heading) * BOW_OFFSET,
  };
}

// --- the fog-of-war ----------------------------------------------------------

/** Is the darkness render mode live? Zone 4 and nowhere else. */
export function darknessActive(world: WorldState): boolean {
  return (world.run ? world.run.zone : 1) === CHOIR_ZONE;
}

/**
 * Should a rendered CUE at (x, z) be drawn?
 *
 * Outside the Choir this is unconditionally true — the gate cannot change a
 * single pixel of zones 1-3, which is what "byte-identical" costs in practice.
 * Inside it, a cue is drawn only while it is inside the lantern's disc.
 *
 * `pad` widens the disc for cues that are physically large (a ripple ring is
 * metres across, so its CENTRE being just outside the disc does not mean the
 * ring is).
 */
export function withinLantern(world: WorldState, x: number, z: number, pad = 0): boolean {
  if (!darknessActive(world)) return true;
  const at = lanternOrigin(world);
  return Math.hypot(x - at.x, z - at.z) <= lanternRadius(world) + pad;
}

/** 0 at the lantern, 1 at the rim, >1 outside it. The probe's readout. */
export function discFraction(world: WorldState, x: number, z: number): number {
  const at = lanternOrigin(world);
  return Math.hypot(x - at.x, z - at.z) / Math.max(1e-6, lanternRadius(world));
}
