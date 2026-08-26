// SHORE — shoreline wave attenuation (qa-issues.md T2, bug B1). Pure, no three.
//
// Wave crests (Σ amplitudes = 1.23 m, core/waves.ts) top every islet in the
// game (shoreline 0.25 m, tallest peak 1.10 m), so without attenuation the
// water plane washes over the land each swell. This module is the single
// source of truth for how waves die at a shoreline:
//
//   shoreAttenAt(islets, x, z) → 0 at/inside any islet rim, ramping to 1 at
//   SHORE_BAND metres from the nearest shoreline (smoothstep).
//
// BOTH consumers sample it: render/water.ts bakes it per-vertex into the
// water grid (the GPU displacement is scaled by it), and game/boat.ts scales
// the CPU bob height with it — so the surfaces can never drift apart. The
// invariant test (tests/core/invariants.test.ts B1) asserts the attenuated
// height never tops an islet.

import type { Vec2 } from './poly';
import { pointInPolygon } from './poly';
import type { Islet } from '../gen/lakeMap';
import { isletMaxRadius } from '../gen/isletHeight';
import { waterHeightAt } from './waves';

// Metres of open water over which full wave amplitude fades to zero at a
// shoreline. Wide enough to span ~2 cells of the 3.6 m water grid so the
// fade never jumps a whole cell; narrow enough that swells still run close
// to the rocks.
export const SHORE_BAND = 7;

// Distance from (x, z) to the nearest edge of a polygon rim (unsigned;
// callers pair it with pointInPolygon for containment).
export function distToPolygonEdge(x: number, z: number, verts: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[j]!;
    const b = verts[i]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2)) : 0;
    const dx = x - (a.x + abx * t);
    const dz = z - (a.z + abz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// 0 at/inside any islet rim → 1 in open water (SHORE_BAND+ from every shore).
export function shoreAttenAt(islets: readonly Islet[], x: number, z: number): number {
  let atten = 1;
  for (const iso of islets) {
    // cheap reject: outside the islet's bounding circle + band
    const reach = isletMaxRadius(iso) + SHORE_BAND;
    const dx = x - iso.center.x;
    const dz = z - iso.center.z;
    if (dx * dx + dz * dz > reach * reach) continue;
    const p = { x, z };
    if (pointInPolygon(p, iso.poly)) return 0;
    const a = smooth01(distToPolygonEdge(x, z, iso.poly) / SHORE_BAND);
    if (a < atten) atten = a;
  }
  return atten;
}

// The shoreline-aware surface height: the open-water Gerstner sum scaled by
// the shore attenuation. This is the height the boat bobs on and the height
// the water vertex shader renders (same attenuation baked per-vertex).
export function attenuatedWaterHeightAt(
  islets: readonly Islet[],
  x: number,
  z: number,
  timeSeconds: number
): number {
  return waterHeightAt(x, z, timeSeconds) * shoreAttenAt(islets, x, z);
}
