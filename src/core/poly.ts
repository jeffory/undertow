// POLY — pure 2D polygon geometry for the procedural lake (plan 03 §2.4) and
// its collision (plan 03 §2.6 "collision uses the convex hull approximation for
// stability"). No three, no DOM: point-in-polygon, convex hull, circle-vs-hull
// containment (foot: circle inside; boat: circle outside), the water-phase
// "out of hull" trigger, and polygon sanity helpers used by the tests.
//
// Convention: polygons are simple and CCW; convex hulls are CCW with no
// collinear interior points. For a CCW polygon the interior is always to the
// LEFT of each directed edge a→b, so the outward normal is (d.z, -d.x)/|d| and
// the signed distance s = dot(p - a, n) is NEGATIVE inside, POSITIVE outside.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

// --- signed distance to a CCW edge's supporting line (positive = outside) -----
export function signedDistToEdge(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-12) return Infinity; // degenerate edge — never a constraint
  const nx = dz / len;
  const nz = -dx / len;
  return (p.x - a.x) * nx + (p.z - a.z) * nz;
}

// --- point-in-polygon (ray casting; simple, possibly concave) -----------------
function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const cross = (p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x);
  const len2 = (b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z);
  if (Math.abs(cross) > 1e-9 * Math.max(1, len2)) return false;
  return (
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.z >= Math.min(a.z, b.z) - 1e-9 &&
    p.z <= Math.max(a.z, b.z) + 1e-9
  );
}

export function pointInPolygon(p: Vec2, verts: Vec2[]): boolean {
  for (let i = 0; i < verts.length; i++) {
    if (onSegment(p, verts[i]!, verts[(i + 1) % verts.length]!)) return true;
  }
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i]!;
    const b = verts[j]!;
    if (a.z > p.z !== b.z > p.z) {
      const xint = ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
      if (p.x < xint) inside = !inside;
    }
  }
  return inside;
}

// --- convex hull (Andrew's monotone chain, CCW, collinear points dropped) -----
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

export function convexHull(pts: Vec2[]): Vec2[] {
  const sorted = pts
    .slice()
    .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.z - b.z));
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : pts.slice();
}

// --- point-in-convex (CCW hull, boundary-inclusive) ----------------------------
export function pointInConvex(p: Vec2, hull: Vec2[]): boolean {
  for (let i = 0; i < hull.length; i++) {
    if (signedDistToEdge(p, hull[i]!, hull[(i + 1) % hull.length]!) > 1e-9) return false;
  }
  return true;
}

// --- circle fully inside a convex CCW polygon (foot collision) -----------------
// Repeatedly pushes the centre inward along each violating edge's outward
// normal until the circle has >= `radius` clearance from every edge. Convex →
// the pass converges; game steps are small so 3 passes is plenty.
export function constrainCircleInConvex(c: Circle, hull: Vec2[]): Circle {
  let x = c.x;
  let z = c.z;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]!;
      const b = hull[(i + 1) % hull.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-12) continue;
      const nx = dz / len;
      const nz = -dx / len;
      const s = (x - a.x) * nx + (z - a.z) * nz;
      if (s > -c.radius) {
        const push = s + c.radius;
        x -= nx * push;
        z -= nz * push;
      }
    }
  }
  return { ...c, x, z };
}

// How far the circle pokes OUTSIDE the hull, in world units (0 = fully inside).
// The water-phase "in deep water" trigger reads this against the player circle.
export function circleOutOfHull(c: Circle, hull: Vec2[]): number {
  let pen = 0;
  for (let i = 0; i < hull.length; i++) {
    const s = signedDistToEdge(c, hull[i]!, hull[(i + 1) % hull.length]!);
    const over = s + c.radius;
    if (over > pen) pen = over;
  }
  return pen > 0 ? pen : 0;
}

// --- circle stays OUTSIDE a convex CCW polygon (boat collision) ---------------
export function closestPointOnHull(p: Vec2, hull: Vec2[]): Vec2 {
  let best = { x: p.x, z: p.z };
  let bestD = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t =
      len2 <= 1e-12
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    const q = { x: a.x + t * dx, z: a.z + t * dz };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

export function distanceToHull(p: Vec2, hull: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const q = closestPointOnHull(p, [hull[i]!, hull[(i + 1) % hull.length]!]);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < best) best = d;
  }
  return best;
}

export function constrainCircleOutsideHull(c: Circle, hull: Vec2[]): Circle {
  const p = { x: c.x, z: c.z };
  if (pointInConvex(p, hull)) {
    const near = closestPointOnHull(p, hull);
    const dx = p.x - near.x;
    const dz = p.z - near.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) {
      // sitting exactly on the boundary — push along the shallowest edge's normal
      let bestS = -Infinity;
      let nx = 1;
      let nz = 0;
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i]!;
        const b = hull[(i + 1) % hull.length]!;
        const s = signedDistToEdge(p, a, b);
        if (s > bestS) {
          bestS = s;
          const ex = b.x - a.x;
          const ez = b.z - a.z;
          const el = Math.hypot(ex, ez);
          if (el > 1e-12) {
            nx = ez / el;
            nz = -ex / el;
          }
        }
      }
      return { ...c, x: p.x + nx * c.radius, z: p.z + nz * c.radius };
    }
    // push outward through the nearest boundary point to exactly `radius` clear
    const dirX = dx / len;
    const dirZ = dz / len;
    return { ...c, x: near.x - dirX * c.radius, z: near.z - dirZ * c.radius };
  }
  const d = distanceToHull(p, hull);
  if (d < c.radius) {
    const near = closestPointOnHull(p, hull);
    const dx = p.x - near.x;
    const dz = p.z - near.z;
    const len = Math.hypot(dx, dz) || 1;
    return { ...c, x: p.x + (dx / len) * (c.radius - d), z: p.z + (dz / len) * (c.radius - d) };
  }
  return { ...c, x: p.x, z: p.z };
}

// --- polygon sanity helpers ----------------------------------------------------
function ccw(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsProperlyIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = ccw(a, b, c);
  const d2 = ccw(a, b, d);
  const d3 = ccw(c, d, a);
  const d4 = ccw(c, d, b);
  return (
    ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
    ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))
  );
}

// True when any pair of non-adjacent edges properly crosses (a bowtie).
export function isSelfIntersecting(verts: Vec2[]): boolean {
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const c = verts[j]!;
      const d = verts[(j + 1) % n]!;
      if (segmentsProperlyIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// Area-weighted centroid of a simple polygon (works for concave).
export function polygonCentroid(verts: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cz = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const v = verts[i]!;
    const w = verts[(i + 1) % n]!;
    const cr = v.x * w.z - w.x * v.z;
    a += cr;
    cx += (v.x + w.x) * cr;
    cz += (v.z + w.z) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return verts[0] ?? { x: 0, z: 0 };
  return { x: cx / (6 * a), z: cz / (6 * a) };
}