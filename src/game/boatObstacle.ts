// BOAT OBSTACLES — sim-side obstacle response for the rowable boat (qa-issues.md
// B2, task T4). Pure geometry over the generated LakeMap: islet silhouettes
// (concave-aware: pointInPolygon + distToPolygonEdge, not the convex hull) and
// the wreck/buoy marker circles. No three, no render/*, no DOM.
//
// The movement system resolves the boat's integrated position through this
// module each fixed step. A position collides when it lies inside an islet
// polygon OR within BOAT_HULL_RADIUS of a polygon edge (the boat's gunwale
// clearance), or within (obstacle radius + hull radius) of a wreck/buoy. The
// resolution slides the remaining movement along the obstacle's tangent and
// drops the inward normal component — a thud, not a bounce.
//
// Deterministic: obstacles are processed in fixed array order with a fixed pass
// count; no Math.random, no Date. Drag/thrust and all other open-water boat
// behaviour are untouched.

import type { LakeMap } from '../gen/lakeMap';
import type { Vec2 } from '../core/poly';
import { pointInPolygon } from '../core/poly';
import { distToPolygonEdge } from '../core/shore';

// m — the boat's own hull radius: a position inside an islet polygon, or within
// this distance of a polygon edge, is colliding. The gunwale stops short of the
// shore by this much.
export const BOAT_HULL_RADIUS = 0.9;

// Fraction of its speed the boat keeps after a collision (a thud, not a bounce).
export const BOAT_THUD_KEEP = 0.4;

// Wreck / buoy marker collision radii. They match the rendered markers in
// src/render/lake.ts: wrecks are a 3.2×1.4 m hull box plus mast (~1.6 m), buoys
// a 0.4 m radius float.
export const WRECK_RADIUS = 1.6;
export const BUOY_RADIUS = 0.5;

export interface BoatObstacleResult {
  x: number;
  z: number;
  hit: boolean;
}

// Outward normal of a CCW edge a→b (interior is to the left of the edge, per
// the poly.ts convention). Falls back to +X for a degenerate edge.
function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return len < 1e-12 ? { x: 1, z: 0 } : { x: dz / len, z: -dx / len };
}

// Nearest point q on the polygon boundary to p, with the boundary's outward
// normal there. Radial when p sits outside the polygon; the closest edge's
// normal when p is inside or on the rim (the radial would point the wrong way —
// toward the interior — in that case).
function closestBoundary(p: Vec2, poly: Vec2[]): { q: Vec2; n: Vec2 } {
  let q = { x: p.x, z: p.z };
  let bestD = Infinity;
  let ea = poly[0]!;
  let eb = poly[1]!;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t =
      len2 <= 1e-12
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
    const c = { x: a.x + abx * t, z: a.z + abz * t };
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD) {
      bestD = d;
      q = c;
      ea = a;
      eb = b;
    }
  }
  if (!pointInPolygon(p, poly) && bestD > 1e-9) {
    return { q, n: { x: (p.x - q.x) / bestD, z: (p.z - q.z) / bestD } };
  }
  return { q, n: edgeNormal(ea, eb) };
}

// Slide the movement (mx, mz) against one polygon so `pos` ends at hull radius
// `r` from the shore, keeping only the tangential component of the movement
// (the inward normal component is dropped). Reduces (mx, mz) in place so later
// obstacles do not re-add the cancelled inward motion. A couple of passes let a
// slide along one edge clear the next (corners) — steps are tiny (≤ ~0.08 m at
// full throttle) so this converges well before the movement is meaningful.
function slidePolygon(
  pos: Vec2,
  mx: number,
  mz: number,
  poly: Vec2[],
  r: number,
): { x: number; z: number; mx: number; mz: number; hit: boolean } {
  let x = pos.x;
  let z = pos.z;
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    if (!pointInPolygon({ x, z }, poly) && distToPolygonEdge(x, z, poly) >= r) break;
    hit = true;
    const { q, n } = closestBoundary({ x, z }, poly);
    const vn = mx * n.x + mz * n.z;
    mx -= n.x * vn;
    mz -= n.z * vn;
    x = q.x + n.x * r + mx;
    z = q.z + n.z * r + mz;
  }
  return { x, z, mx, mz, hit };
}

// Slide the movement (mx, mz) against one circle (a wreck/buoy) of combined
// radius `r` (marker radius + hull radius). Same tangent slide as slidePolygon.
function slideCircle(
  pos: Vec2,
  mx: number,
  mz: number,
  c: Vec2,
  r: number,
): { x: number; z: number; mx: number; mz: number; hit: boolean } {
  const dx = pos.x - c.x;
  const dz = pos.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d >= r) return { x: pos.x, z: pos.z, mx, mz, hit: false };
  const nx = d > 1e-9 ? dx / d : 1;
  const nz = d > 1e-9 ? dz / d : 0;
  const vn = mx * nx + mz * nz;
  return {
    x: c.x + nx * r + (mx - nx * vn),
    z: c.z + nz * r + (mz - nz * vn),
    mx: mx - nx * vn,
    mz: mz - nz * vn,
    hit: true,
  };
}

// Resolve the boat's desired next position `to` (one fixed-step integration from
// `from`) against every islet, wreck and buoy in the lake. Slides along obstacle
// tangents and drops the inward normal movement; returns the corrected position
// plus whether anything was hit. Submerged buoys are no longer surface obstacles.
export function resolveBoatObstacles(lake: LakeMap, from: Vec2, to: Vec2): BoatObstacleResult {
  const r = BOAT_HULL_RADIUS;
  let x = to.x;
  let z = to.z;
  let mx = to.x - from.x;
  let mz = to.z - from.z;
  let hit = false;

  for (let pass = 0; pass < 3; pass++) {
    for (const iso of lake.islets) {
      const res = slidePolygon({ x, z }, mx, mz, iso.poly, r);
      x = res.x;
      z = res.z;
      mx = res.mx;
      mz = res.mz;
      hit = hit || res.hit;
    }
    for (const wreck of lake.wrecks) {
      const res = slideCircle({ x, z }, mx, mz, wreck.pos, WRECK_RADIUS + r);
      x = res.x;
      z = res.z;
      mx = res.mx;
      mz = res.mz;
      hit = hit || res.hit;
    }
    for (const buoy of lake.buoys) {
      if (buoy.submerged) continue;
      const res = slideCircle({ x, z }, mx, mz, buoy.pos, BUOY_RADIUS + r);
      x = res.x;
      z = res.z;
      mx = res.mx;
      mz = res.mz;
      hit = hit || res.hit;
    }
  }

  // Final safety clamp: a tangential slide through a concave corner can in
  // principle leave the boat inside a polygon; push it out through the nearest
  // edge so the B2 invariant (never inside a hull) holds unconditionally.
  for (const iso of lake.islets) {
    if (pointInPolygon({ x, z }, iso.poly)) {
      const { q, n } = closestBoundary({ x, z }, iso.poly);
      x = q.x + n.x * r;
      z = q.z + n.z * r;
      hit = true;
    }
  }

  return { x, z, hit };
}