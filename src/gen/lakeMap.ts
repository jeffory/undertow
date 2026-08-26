// LAKE MAP — M3 round 1 procedural surface (task scope 2, plan 03 §2). Pure and
// three-free: given a 32-bit run seed it deterministically produces the whole
// LakeMap (islet archipelago + pruned path graph + wrecks/sinkholes/micro-event/
// buoys). All randomness comes from the LAYOUT RNG stream, consumed in a fixed
// order, so the same seed always yields the identical lake (tested).
//
// Pipeline (plan §2.1):
//   runSeed → poisson-disc islet centers (§2.2) → Bowyer-Watson Delaunay +
//   maxEdge-pruned path graph (§2.3) → jittered islet polygons (§2.4) →
//   placements: wrecks / sinkholes / micro-event / buoys (§2.5) → LakeMap.

import { createRng, LAYOUT } from '../core/rngStreams';
import { MAX_ZONE, clampZone, zoneSalt } from '../core/zones';
import type { Vec2 } from '../core/poly';
import {
  convexHull,
  pointInPolygon,
} from '../core/poly';
import { poissonDisc } from './poisson';
import { prunedPathGraph } from './delaunay';
import type { Edge } from './delaunay';
import { computeKelpColumns } from './kelp';
import type { KelpColumn } from './kelp';

// --- tuning (plan §2.2-2.5, tuned for a ~200x200 lake) ------------------------

// The world box the archipelago occupies: ~200×200 play area plus margin, so
// every islet sits fully inside with water to spare at the edges.
export const LAKE_BOUNDS = { w: 220, h: 220 };

export const MIN_ISLETS = 9;
export const MAX_ISLETS = 14;
export const MAX_EDGE = 100; // m — longest allowed path-graph edge

// Poisson-disc radii tried, in order. The first that lands 9-14 islets wins;
// otherwise the closest-to-11 is used (plan's "tune r" fallback for point-starved
// seeds). Bridson over a 220×220 lake (with the r edge margin) yields these
// counts at each radius — the ladder spans ~7 to ~15 islets so the target band
// is always reachable:
//   r=38 → ~10   r=36 → ~12   r=40 → ~9   r=34 → ~14   r=42 → ~7
const RADIUS_LADDER = [38, 36, 40, 34, 42];

const ISLET_VERT_MIN = 6;
const ISLET_VERT_MAX = 12;
const ISLET_RADIUS_MIN = 7; // m — walkable base radius
const ISLET_RADIUS_MAX = 13;
const ISLET_JITTER = { min: 0.75, max: 1.3 };
const ROCK_CAP = 2; // 1-2 pure-obstacle islets (plan §2.4)
const ROCK_CHANCE = 0.15;
// The max islet radius as a fraction of the poisson radius actually used: two
// neighbouring islets (≥ r apart) then leave 2·(0.36r) ≤ 0.72r < r → a real
// water channel between them, and there is always clear water around each shore.
const MAX_RADIUS_FRACTION = 0.36;

const BOTTLE_NOTES = [
  'The bells went quiet after the third night.',
  'They say the Drowned still count the old tides.',
  'A number without a name: 12, 44, 71.',
  'Row past the sunken steeple, not through it.',
  "The keeper's lamp never once found me here.",
];

// --- shapes (plan §2.5) ---------------------------------------------------------

export type IsletKind = 'walkable' | 'rock';

export interface IsletFeature {
  kind: string;
  pos: Vec2;
}

export interface Islet {
  id: number;
  center: Vec2;
  poly: Vec2[]; // walkable silhouette (render + walkable-surface tests)
  hull: Vec2[]; // convex hull — collision containment uses this (plan §2.6)
  baseRadius: number;
  kind: IsletKind;
  zone: number;
  features: IsletFeature[]; // rock/reeds clusters — M4 renders
  hasSinkhole: boolean;
}

export type WreckKind = 'hull' | 'jetty' | 'steamer';

export interface Wreck {
  id: number;
  pos: Vec2;
  kind: WreckKind;
  zone: number;
  anchorIslet?: number;
  lootTier: number;
  marked: boolean; // pre-tagged marked wreck for the future Office Contract (plan §6.7)
}

export interface Sinkhole {
  id: number;
  pos: Vec2; // the gap itself — the far islet's centre (plan §2.5 "at the far islets")
  // The water-side descent point: the boat cannot row onto the islet, so the
  // mouth is the reachable lip of the gap, just off that islet's shore facing
  // back toward the start. Computed WITHOUT the layout RNG (a pure angular
  // sweep) so adding it left every other placement byte-identical.
  mouth: Vec2;
  zoneFrom: number;
  zoneTo: number;
}

export interface Buoy {
  id: number;
  pos: Vec2;
  primary: boolean;
  submerged: boolean;
  submergeProgress: number; // 0..1 — false-dawn sink (nightClockSystem drives it)
}

export interface ShrineBuff {
  kind: 'stamina' | 'breath' | 'tension';
  amount: number;
}

export type MicroEvent =
  | { kind: 'wreck'; wreck: Wreck }
  | { kind: 'shrine'; pos: Vec2; buff: ShrineBuff }
  | { kind: 'bottle'; pos: Vec2; text: string; isMarenBreadcrumb: boolean };

export interface DisturbanceSpawn {
  pos: Vec2;
  tier: number;
  speciesRoll?: string;
}

export interface LakeMap {
  seed: number;
  zone: number; // 1..5 zone depth this surface was generated for (plan §2.4)
  bounds: { w: number; h: number };
  poissonRadius: number; // the radius actually used (after the ladder)
  startIslet: number; // the lighthouse islet the run begins at
  islets: Islet[];
  graph: { edges: Edge[] };
  wrecks: Wreck[];
  sinkholes: Sinkhole[];
  microEvent: MicroEvent;
  buoys: Buoy[];
  // M6 (plan 05 §2.1): the Kelp Graves' vertical columns. Grown from a SALTED
  // copy of the layout stream after every other placement, so adding them left
  // the whole existing map byte-identical; empty outside zone 2.
  kelp: KelpColumn[];
  disturbanceSpawns: DisturbanceSpawn[]; // empty for round 1; the director refills
}

// The boat's run-start distance off the start islet's centre. Lives here (not
// in lakeWorld, which owns the spawn itself) because the kelp field has to keep
// clear of it and lakeWorld imports THIS module — the dependency only runs one
// way. gen/lakeWorld.ts's boatSpawnDist delegates here.
export function boatSpawnDistFor(poissonRadius: number): number {
  return poissonRadius * MAX_RADIUS_FRACTION + 8;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

// --- islet polygon (plan §2.4) --------------------------------------------------
function buildIslet(
  rng: { int(a: number, b: number): number; range(a: number, b: number): number },
  center: Vec2,
  id: number,
  maxRadius: number,
  zone: number,
): Islet {
  const n = rng.int(ISLET_VERT_MIN, ISLET_VERT_MAX);
  const base = rng.range(ISLET_RADIUS_MIN, ISLET_RADIUS_MAX);
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = rng.range(ISLET_JITTER.min, ISLET_JITTER.max);
    radii.push(clamp(base * j, 1.5, maxRadius));
  }
  // one smoothing pass (average adjacent radii) — kills the jitter spikes that
  // could otherwise poke the polygon near a neighbour (plan §2.4)
  const smooth = radii.map((r, i) => {
    const prev = radii[(i - 1 + n) % n]!;
    const next = radii[(i + 1) % n]!;
    return (prev + r + next) / 3;
  });
  const poly: Vec2[] = smooth.map((r, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
  });
  return {
    id,
    center,
    poly,
    hull: convexHull(poly),
    baseRadius: base,
    kind: 'walkable',
    zone, // plan §2.4: the generator takes `zone` as an input so zones 2-5 reuse it
    features: [],
    hasSinkhole: false,
  };
}

// --- BFS graph distance (plan §2.2: sinkhole islets are the furthest) ----------
function graphDistances(edges: Edge[], n: number, from: number): number[] {
  const dist = new Array<number>(n).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [a, b] of edges) {
      const next = a === cur ? b : b === cur ? a : -1;
      if (next >= 0 && dist[next] === -1) {
        dist[next] = dist[cur]! + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

// --- placements (plan §2.5) ------------------------------------------------------
function clearOfIslets(pos: Vec2, islets: Islet[]): boolean {
  for (const iso of islets) {
    if (pointInPolygon(pos, iso.poly)) return false;
  }
  return true;
}

// A point just off a given islet's shore, guaranteed to be in the water (outside
// every islet). `biasAngle` (radians) is tried first for directed placements.
function shorePoint(
  rng: { nextFloat(): number; range(a: number, b: number): number },
  iso: Islet,
  islets: Islet[],
  maxRadius: number,
  biasAngle?: number,
): Vec2 {
  let last: Vec2 = { x: iso.center.x + maxRadius + 4, z: iso.center.z };
  for (let attempt = 0; attempt < 16; attempt++) {
    const ang = attempt === 0 && biasAngle !== undefined ? biasAngle : rng.nextFloat() * Math.PI * 2;
    const off = maxRadius + 4 + rng.range(0, 4);
    last = {
      x: iso.center.x + Math.cos(ang) * off,
      z: iso.center.z + Math.sin(ang) * off,
    };
    if (clearOfIslets(last, islets)) return last;
  }
  return last;
}

// The water-side lip of a sinkhole: `maxRadius + 5` off the gap islet's shore,
// swept from the bearing back toward `toward` (the start islet) outward in
// alternating ±30° steps until the point clears every islet. Pure trigonometry —
// it draws NOTHING from the layout stream, so bolting the mouth on left every
// other placement in an existing seed's lake byte-identical.
function sinkholeMouth(iso: Islet, islets: Islet[], maxRadius: number, toward: Vec2): Vec2 {
  const base = Math.atan2(toward.z - iso.center.z, toward.x - iso.center.x);
  const off = maxRadius + 5;
  let fallback: Vec2 = { x: iso.center.x + Math.cos(base) * off, z: iso.center.z + Math.sin(base) * off };
  for (let k = 0; k < 12; k++) {
    const step = Math.ceil(k / 2) * (Math.PI / 6);
    const ang = base + (k % 2 === 0 ? step : -step);
    const p: Vec2 = { x: iso.center.x + Math.cos(ang) * off, z: iso.center.z + Math.sin(ang) * off };
    if (k === 0) fallback = p;
    if (clearOfIslets(p, islets)) return p;
  }
  return fallback;
}

function buildLake(runSeed: number, zone: number): LakeMap {
  // The zone salt is the whole of "a deeper zone is a different lake from the
  // same run seed" (plan §2.4 / task 2): zone 1 salts with 0, so the Shallows
  // surface of a seed is unchanged from round 1.
  const layout = createRng(runSeed, LAYOUT, zoneSalt(zone));
  const bounds = LAKE_BOUNDS;
  const box = {
    minX: -bounds.w / 2,
    minZ: -bounds.h / 2,
    maxX: bounds.w / 2,
    maxZ: bounds.h / 2,
  };

  // --- step 1: Poisson-disc islet centers (plan §2.2) --------------------------
  // The lighthouse-side anchor islet is pinned first, at 2r from the west edge,
  // so the first row-out is always short (plan §2.2 / task scope 5).
  let radius = RADIUS_LADDER[0]!;
  let points: Vec2[] = [];
  let best: { r: number; pts: Vec2[] } | null = null;
  for (const r of RADIUS_LADDER) {
    const start: Vec2 = { x: -bounds.w / 2 + r * 2, z: 0 };
    const pts = poissonDisc(layout, box, r, start);
    if (pts.length >= MIN_ISLETS && pts.length <= MAX_ISLETS) {
      radius = r;
      points = pts;
      break;
    }
    if (!best || Math.abs(pts.length - 11) < Math.abs(best.pts.length - 11)) {
      best = { r, pts };
    }
  }
  if (points.length === 0 && best) {
    radius = best.r;
    points = best.pts;
  }
  const maxIsletRadius = radius * MAX_RADIUS_FRACTION; // keeps neighbour islets non-overlapping

  // --- step 2: Delaunay + pruned path graph (plan §2.3) ------------------------
  const edges = prunedPathGraph(points, MAX_EDGE);

  // --- step 3: islet polygons (plan §2.4) --------------------------------------
  const islets = points.map((center, id) => buildIslet(layout, center, id, maxIsletRadius, zone));

  // sinkhole islets = the graph-furthest from the start (the descent journey).
  // 1 in the Shallows, 2 in the deeper zones (plan §2.5); The Mouth (zone 5) has
  // none — it is the descent cap (plan §12.7), there is nowhere deeper to go.
  const dist = graphDistances(edges, islets.length, 0);
  const sinkholeCount = zone >= MAX_ZONE ? 0 : zone === 1 ? 1 : 2;
  const byDistance = islets
    .map((iso) => iso.id)
    .filter((id) => id !== 0)
    .sort((a, b) => (dist[b]! - dist[a]!) || (a - b));
  const gapIslets = byDistance.slice(0, sinkholeCount);
  for (const id of gapIslets) islets[id]!.hasSinkhole = true;

  // rock vs walkable split (plan §2.4): start + sinkhole islets stay walkable
  let rockCount = 0;
  for (const iso of islets) {
    if (iso.id === 0 || iso.hasSinkhole) continue;
    if (rockCount < ROCK_CAP && layout.chance(ROCK_CHANCE)) {
      iso.kind = 'rock';
      rockCount++;
    }
  }

  // --- step 4: placements (plan §2.5) ------------------------------------------
  const wrecks: Wreck[] = [];
  const wreckCount = layout.int(2, 3);
  for (let i = 0; i < wreckCount; i++) {
    const kind = layout.pick<WreckKind>(['hull', 'jetty', 'steamer']);
    let pos: Vec2;
    let anchorIslet: number | undefined;
    if (kind === 'steamer') {
      // mid-water: a clear lake point (plan §2.5 "or mid-water for the 'steamer'")
      pos = { x: 0, z: 0 };
      for (let attempt = 0; attempt < 16; attempt++) {
        const cand = {
          x: layout.range(-bounds.w / 2 + 12, bounds.w / 2 - 12),
          z: layout.range(-bounds.h / 2 + 12, bounds.h / 2 - 12),
        };
        if (clearOfIslets(cand, islets)) {
          pos = cand;
          break;
        }
      }
    } else {
      const iso = layout.pick(islets);
      anchorIslet = iso.id;
      pos = shorePoint(layout, iso, islets, maxIsletRadius);
    }
    wrecks.push({
      id: i,
      pos,
      kind,
      zone,
      ...(anchorIslet !== undefined ? { anchorIslet } : {}),
      lootTier: layout.int(1, 3),
      marked: false,
    });
  }
  // one wreck is pre-tagged as the marked wreck (plan §2.5 / §6.7 slot)
  wrecks[layout.int(0, wrecks.length - 1)]!.marked = true;

  // plan §2.5: "each stores zoneTo = zoneFrom + 1. Descending sets
  // dread.zoneFloor (§5) and does NOT touch the Night Clock (§3.3)."
  const startCentre = islets[0]!.center;
  const sinkholes: Sinkhole[] = gapIslets.map((id, i) => ({
    id: i,
    pos: islets[id]!.center,
    mouth: sinkholeMouth(islets[id]!, islets, maxIsletRadius, startCentre),
    zoneFrom: zone,
    zoneTo: Math.min(MAX_ZONE, zone + 1),
  }));

  // buoys: primary near the start (submerges LAST at false dawn), secondary
  // mid-map (submerges FIRST) — plan §2.5 / §5.3
  const startIso = islets[0]!;
  const otherWalkable = islets.filter((iso) => iso.id !== 0 && iso.kind === 'walkable');
  const secondaryAnchor = otherWalkable.length > 0
    ? layout.pick(otherWalkable)
    : layout.pick(islets.filter((iso) => iso.id !== 0));
  const buoys: Buoy[] = [
    { id: 0, pos: shorePoint(layout, startIso, islets, maxIsletRadius, Math.PI / 2), primary: true, submerged: false, submergeProgress: 0 },
    { id: 1, pos: shorePoint(layout, secondaryAnchor, islets, maxIsletRadius), primary: false, submerged: false, submergeProgress: 0 },
  ];

  // micro-event: exactly one per map (plan §2.5) — wreck | shrine | bottle-note
  const microKind = layout.pick<MicroEvent['kind']>(['wreck', 'shrine', 'bottle']);
  let microEvent: MicroEvent;
  if (microKind === 'wreck') {
    const wreck = layout.pick(wrecks);
    wreck.marked = true;
    microEvent = { kind: 'wreck', wreck };
  } else {
    const walkable = islets.filter((iso) => iso.kind === 'walkable');
    const host = layout.pick(walkable);
    if (microKind === 'shrine') {
      microEvent = {
        kind: 'shrine',
        pos: host.center,
        buff: {
          kind: layout.pick<ShrineBuff['kind']>(['stamina', 'breath', 'tension']),
          amount: layout.int(10, 30),
        },
      };
    } else {
      microEvent = {
        kind: 'bottle',
        pos: host.center,
        text: layout.pick(BOTTLE_NOTES),
        isMarenBreadcrumb: layout.chance(0.3),
      };
    }
  }

  // --- step 5: the Kelp Graves field (plan 05 §2.1) -----------------------------
  // Drawn from its OWN salted stream, after everything else, and only in zone 2.
  const spawn: Vec2 = {
    x: startIso.center.x + boatSpawnDistFor(radius),
    z: startIso.center.z,
  };
  const kelp = computeKelpColumns(
    { seed: runSeed, zone, bounds, islets, sinkholes, buoys },
    spawn,
  );

  return {
    seed: runSeed,
    zone,
    bounds,
    poissonRadius: radius,
    startIslet: 0,
    islets,
    graph: { edges },
    wrecks,
    sinkholes,
    microEvent,
    buoys,
    kelp,
    disturbanceSpawns: [],
  };
}

// `zone` (1..5, default 1 = the Shallows) selects the zone depth: it salts the
// LAYOUT stream (a different lake from the same run seed), stamps the islets /
// wrecks, and decides how many sinkholes lead deeper. `(runSeed, zone)` is the
// full determinism key: same run seed + same zone → byte-identical lake.
export function generateLake(runSeed: number, zone = 1): LakeMap {
  return buildLake(runSeed >>> 0, clampZone(zone));
}