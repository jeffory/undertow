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
