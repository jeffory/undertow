// DELAUNAY — Bowyer–Watson incremental Delaunay triangulation (plan 03 §2.3),
// plus the maxEdge-pruned path graph used for boat fast-travel. Deterministic.
//
// The pruned graph is guaranteed CONNECTED: after dropping Delaunay edges longer
// than `maxEdge`, the Euclidean minimum spanning tree (a subgraph of the
// Delaunay triangulation) is unioned back in, so the islet archipelago is always
// fully reachable from the start while staying sparse and planar.

import type { Vec2 } from '../core/poly';

export type Edge = [number, number];

interface Triangle {
  a: number;
  b: number;
  c: number;
}

function circumcircleContains(
  pts: Vec2[],
  tri: Triangle,
  p: Vec2,
): boolean {
  const ax = pts[tri.a]!.x;
  const az = pts[tri.a]!.z;
  const bx = pts[tri.b]!.x;
  const bz = pts[tri.b]!.z;
  const cx = pts[tri.c]!.x;
  const cz = pts[tri.c]!.z;
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  if (Math.abs(d) < 1e-12) return false; // degenerate triangle
  const ux =
    ((ax * ax + az * az) * (bz - cz) +
      (bx * bx + bz * bz) * (cz - az) +
      (cx * cx + cz * cz) * (az - bz)) /
    d;
  const uz =
    ((ax * ax + az * az) * (cx - bx) +
      (bx * bx + bz * bz) * (ax - cx) +
      (cx * cx + cz * cz) * (bx - ax)) /
    d;
  const r2 = (ux - ax) * (ux - ax) + (uz - az) * (uz - az);
  const px = p.x - ux;
  const pz = p.z - uz;
  // epsilon widens the circle slightly to break cocircular ties deterministically
  return px * px + pz * pz <= r2 + 1e-9;
}

// Delaunay edge set (deduped) over `points`. No super-triangle edges escape.
export function delaunayEdges(points: Vec2[]): Edge[] {
  if (points.length < 3) return [];

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.z > maxZ) maxZ = p.z;
  }
  const dmax = Math.max(maxX - minX, maxZ - minZ) * 2;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  // Super-triangle: three points far outside the bounding box so every real
  // point is strictly inside its circumcircle coverage (plan §2.3 "generous
  // super-triangle").
  const supA = points.length;
  const supB = points.length + 1;
  const supC = points.length + 2;
  const all = points.concat([
    { x: midX - dmax, z: midZ - dmax },
    { x: midX + dmax, z: midZ - dmax },
    { x: midX, z: midZ + dmax },
  ]);

  let tris: Triangle[] = [{ a: supA, b: supB, c: supC }];

  for (let pi = 0; pi < points.length; pi++) {
    const p = all[pi]!;
    const bad = tris.filter((t) => circumcircleContains(all, t, p));
    if (bad.length === 0) continue;
    // collect the boundary of the union of bad triangles
    const boundary = new Map<string, Edge>();
    const addEdge = (u: number, v: number): void => {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, [u, v]);
    };
    for (const t of bad) {
      addEdge(t.a, t.b);
      addEdge(t.b, t.c);
      addEdge(t.c, t.a);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const [u, v] of boundary.values()) {
      tris.push({ a: pi, b: u, c: v });
    }
  }

  // dedupe edges, drop any that touch a super-triangle vertex
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const t of tris) {
    for (const [u, v] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a],
    ] as Array<[number, number]>) {
      if (u >= points.length || v >= points.length) continue;
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([u, v]);
    }
  }
  return edges;
}

// --- pruned, guaranteed-connected path graph ----------------------------------

export function edgeLength(pts: Vec2[], e: Edge): number {
  return Math.hypot(pts[e[0]]!.x - pts[e[1]]!.x, pts[e[0]]!.z - pts[e[1]]!.z);
}

// Kruskal MST over the given edge set (union-find). The result is a list of
// edges forming a spanning tree (Euclidean MST, since the input is Delaunay).
function mstEdges(n: number, edges: Edge[], pts: Vec2[]): Edge[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== x) {
      const nx = parent[x]!;
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const sorted = edges
    .slice()
    .sort((a, b) => edgeLength(pts, a) - edgeLength(pts, b));
  const out: Edge[] = [];
  for (const [u, v] of sorted) {
    const ru = find(u);
    const rv = find(v);
    if (ru !== rv) {
      parent[ru] = rv;
      out.push([u, v]);
    }
  }
  return out;
}

export function edgeKey(e: Edge): string {
  return e[0] < e[1] ? `${e[0]},${e[1]}` : `${e[1]},${e[0]}`;
}

// Prune the Delaunay edge set to <= maxEdge, then union back in the MST so the
// graph stays connected (plan §2.3 "maxEdge-pruned path graph", §2.6 "boat-pathable
// start→any islet"). Result is still a subgraph of the Delaunay → planar.
export function prunedPathGraph(points: Vec2[], maxEdge: number): Edge[] {
  const del = delaunayEdges(points);
  const kept = del.filter((e) => edgeLength(points, e) <= maxEdge);
  const mst = mstEdges(points.length, del, points);
  const set = new Set(kept.map(edgeKey));
  for (const e of mst) set.add(edgeKey(e));
  return [...set].map((k) => k.split(',').map(Number) as Edge);
}