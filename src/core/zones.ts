// ZONES (core) — plan 03 §2.5 / §4.1 / §12.7 and plan.md §7. The five zones a
// run can descend through, the Dread floor each one clamps to, and the layout
// salt that makes a deeper zone a DIFFERENT lake from the same run seed.
//
// Zone depth is 1-based and matches plan.md §7's table: 1 Shallows, 2 Kelp
// Graves, 3 Township, 4 Choir, 5 Mouth. Descending is one-way within a run and
// caps at zone 5 ("M3 caps descents at zone 5's floor", plan §12.7).
//
// Pure data: no `three` imports, no RNG.

export const MIN_ZONE = 1;
// M8 (plan 05 §2.3): the bioluminescent void. Named here rather than in the
// darkness system so the zone table and its consumers share one constant.
export const CHOIR_ZONE = 4;
export const MAX_ZONE = 5; // plan §12.7 — the M3 descent cap (The Mouth)

export const ZONE_NAMES: Record<number, string> = {
  1: 'The Shallows',
  2: 'Kelp Graves',
  3: 'The Township',
  4: 'The Choir',
  5: 'The Mouth',
};

// plan §4.1: "descend a zone → value = max(value, zoneFloor); the floor rises
// (Shallows→Kelp 0→25, Kelp→Township 25→50, Township→Choir 50→75, Choir→Mouth
// 75→90). This is a clamp, not a gain, so nightMult never applies."
export const ZONE_DREAD_FLOOR: Record<number, number> = {
  1: 0,
  2: 25,
  3: 50,
  4: 75,
  5: 90,
};

export function clampZone(zone: number): number {
  if (!Number.isFinite(zone)) return MIN_ZONE;
  return Math.max(MIN_ZONE, Math.min(MAX_ZONE, Math.floor(zone)));
}

export function zoneName(zone: number): string {
  return ZONE_NAMES[clampZone(zone)] ?? 'The Shallows';
}

export function zoneDreadFloor(zone: number): number {
  return ZONE_DREAD_FLOOR[clampZone(zone)] ?? 0;
}

// The LAYOUT-stream salt for a zone's lake. Zone 1 salts with 0 so the Shallows
// surface of a run seed is byte-identical to the pre-descent generator (the M3
// round-1 lakes and their tests are untouched); every deeper zone draws from its
// own point in seed space, so `(runSeed, zone)` is the deterministic key for a
// descended lake (same run seed → same zone-2 lake, every time).
export const ZONE_SALT_STRIDE = 0x5a17;

export function zoneSalt(zone: number): number {
  return ((clampZone(zone) - MIN_ZONE) * ZONE_SALT_STRIDE) >>> 0;
}

// --- zone atmosphere (plan 05 §2.1) -------------------------------------------
// M6's Kelp Graves is "bone-teal fog denser than Shallows (FogExp2 density up)".
// This is a MULTIPLIER over the Night-Clock phase lerp, not a replacement: the
// sky's phase palette still owns the base density and the options menu still
// owns its own 'Permissible Murk Level' scale — the three compose
// (fog.density = phaseDensity × optionScale × zoneMult), so a player on Low
// murk in the Kelp Graves still gets a thinner lake than one on Heavy.
//
// Zone 1 is exactly 1 — the Shallows renders byte-identically to before M6.
// Zones 3-5 are 1 until their own milestone dials them; the seam is here.
export const ZONE_FOG_MULT: Record<number, number> = {
  1: 1,
  2: 1.55,
  3: 1,
  // M8 (plan 05 §2.3): "fog near-total". The Choir's multiplier is the load-
  // bearing half of the darkness system — at ×5.5 the night palette's 0.019
  // base becomes ~0.105, and FogExp2 reaches 99% saturation at ~20 m. The
  // lantern's own light distance is 16 m (game/darkness.ts LANTERN_BASE_RADIUS),
  // so the lit pool ends a few metres BEFORE the fog goes absolute: the disc of
  // light is the disc of the world, and everything past it is black.
  4: 5.5,
  5: 1,
};

export function zoneFogMultiplier(zone: number): number {
  return ZONE_FOG_MULT[clampZone(zone)] ?? 1;
}

// --- zone fog TINT (plan 05 §2.2) ---------------------------------------------
// M7's Township "adds sodium-lamp amber" (spec §8.1). The zone nudges the fog
// HUE a little warmer — it does NOT fight the Night Clock's phase lerp, which
// still owns the colour: sky.ts lerps the phase-drifted fog colour this far
// toward the zone tint and no further. Zone 1/2 strength is exactly 0, so
// `fog.color.copy(curFog)` is byte-identical to pre-M7 there; zones 4-5 are 0
// until their own milestone dials them.
export interface ZoneFogTint {
  color: number; // hex — the hue the zone pulls the fog toward
  strength: number; // 0..1 — how far. Small: this is a seasoning, not a repaint.
}

export const ZONE_FOG_TINT: Record<number, ZoneFogTint> = {
  1: { color: 0x000000, strength: 0 },
  2: { color: 0x000000, strength: 0 },
  3: { color: 0xffa24e, strength: 0.1 },
  4: { color: 0x000000, strength: 0 },
  5: { color: 0x000000, strength: 0 },
};

export function zoneFogTint(zone: number): ZoneFogTint {
  return ZONE_FOG_TINT[clampZone(zone)] ?? { color: 0x000000, strength: 0 };
}

// --- zone SKY DARKEN (plan 05 §2.3) -------------------------------------------
// M8's Choir is a "bioluminescent void … black palette with emissive points"
// (spec §8.1 "Choir is emissive points on black"). Dense fog alone is not black:
// FogExp2 saturates toward the FOG COLOUR, and the background dome keeps its own
// phase gradient behind it — so a merely foggy zone 4 would read as a teal wall,
// not a void.
//
// This is the second half of the seam: how far the already-phase-lerped fog
// colour AND the gradient dome's three stops are lerped toward pure black. It is
// applied last, after the phase lerp and the zone tint, and it is exactly 0 for
// zones 1-3 and 5 — so `fog.color.copy(curFog)` and `paintSphere(curTop, …)` are
// byte-identical there.
export const ZONE_SKY_DARKEN: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0.94, // near-black; the 6% left is what keeps the horizon from banding
  5: 0,
};

export function zoneSkyDarken(zone: number): number {
  return ZONE_SKY_DARKEN[clampZone(zone)] ?? 0;
}

// --- zone AMBIENT SCALE (plan 05 §2.3) -----------------------------------------
// The third and last piece of the void, and the one the fog cannot buy: "geometry
// only where light touches". Fog hides what is FAR. It does nothing about a
// near islet standing in the moonlight — which in a lightless zone is exactly the
// thing that must not be visible, because the design is that the lantern is the
// only light there is.
//
// So the Choir turns the world lights down to a floor: the moon and the ambient
// are scaled, and what is left standing is the lantern's own pool. Not zero — a
// hard 0 flattens the near hull into an unreadable silhouette and takes the
// water's own shading with it.
//
// Exactly 1 for every other zone, so their lighting is untouched.
export const ZONE_AMBIENT_SCALE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 1,
  4: 0.12,
  5: 1,
};

export function zoneAmbientScale(zone: number): number {
  return ZONE_AMBIENT_SCALE[clampZone(zone)] ?? 1;
}
