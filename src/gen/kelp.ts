// KELP GRAVES — the zone-2 kelp field (M6, plan 05 §2.1). Pure and three-free:
// given a lake's seed / zone / islets / placements it deterministically produces
// the vertical kelp columns that make the Kelp Graves fight differently from the
// Shallows, plus the two pieces of geometry the sim needs from them:
//
//   • resolveKelpSnag  — segment-vs-column arrest, the DRAG-SNAG mechanic
//     ("a drag that would pull you through a kelp column instead snags you at
//     the column edge"; braced players use kelp to arrest drags).
//   • segmentCrossesKelp — the partial LOS test ("they block … the player's
//     sight-line to the tethered fish … lunge telegraphs are partially read").
//
// Placement (plan 05 §2.1 "vertical kelp columns as instanced line-of-sight
// blockers"): clusters, drawn from a SALTED copy of the lake's LAYOUT stream in
// a fixed consumption order — the same convention driftwood/wrecks/buoys use, so
// the same (runSeed, zone) always grows the same field and the un-salted layout
// stream is untouched (zone 1 stays byte-identical).
//
// Only zone 2 grows kelp. Every other zone returns an empty field, so every
// consumer (render instancing, boat obstacles, foot collision, the snag
// resolver, LOS) is a no-op outside the Kelp Graves by construction rather than
// by a scattering of `if (zone === 2)` guards.

import { createRng, LAYOUT } from '../core/rngStreams';
import { zoneSalt } from '../core/zones';
import { shoreAttenAt } from '../core/shore';
import type { Islet } from './lakeMap';
import type { Vec2 } from '../core/poly';

// The one zone that grows kelp (plan.md §7: 2 = Kelp Graves).
export const KELP_ZONE = 2;

// m — the collider radius of one column (task: "Radius ~0.5m each"). This is
// the radius the boat/foot obstacle response and the drag-snag resolver use;
// the rendered stalk is drawn slightly thinner so the collision reads as
// generous rather than as clipping.
export const KELP_RADIUS = 0.5;

// m — minimum clearance the field keeps from anything the player has to be able
// to reach: a sinkhole mouth (the descent), a bell buoy (the extraction), and
// the boat's own run-start spawn point.
export const KELP_CLEARANCE = 6;

// Salt for the kelp placement stream. XOR'd with the zone salt so a future
// kelp-bearing zone would grow a different field from the same run seed.
const KELP_SALT = 0x4b454c50; // 'KELP'

const CLUSTER_MIN = 10;
const CLUSTER_MAX = 14;
const PER_CLUSTER_MIN = 5;
const PER_CLUSTER_MAX = 11;
const CLUSTER_SPREAD = 5.5; // m — how far members scatter from a cluster centre

// Half the clusters grow in open water, half on the approaches to an islet (the
// channels you have to row through) — that is what makes the zone read as a
// graveyard you navigate rather than a field you look at.
const ISLET_APPROACH_MIN = 2; // m past the shore attenuation band
const ISLET_APPROACH_MAX = 9;

const BOUNDS_MARGIN = 12; // keep the field clear of the lake box edge
const CLUSTER_ATTEMPTS = 24; // placement tries for a cluster centre
const MEMBER_ATTEMPTS = 8; // …and for each member inside it

// Hard cap on the field: the whole thing is ONE InstancedMesh (one draw call),
// so this is a sim/geometry budget, not a draw budget (plan: ≤150 draws total).
export const MAX_KELP_COLUMNS = 140;

// Stalk dimensions. Columns rise from below the waterline so the base is never
// visible as a floating stump.
const KELP_BASE_Y = -2.2; // m — the lakebed end of the stalk
const HEIGHT_MIN = 3.4; // m — total stalk length (base → tip)
const HEIGHT_MAX = 6.2;

export interface KelpColumn {
  id: number;
  cluster: number;
  x: number;
  z: number;
  radius: number; // collider radius (KELP_RADIUS for every column this round)
  height: number; // m — base (KELP_BASE_Y) to tip
  taper: number; // 0..1 — tip radius as a fraction of the base radius
  yaw: number; // fixed rotation about Y (breaks the instancing repeat)
  swayAmp: number; // rad — peak tilt of the sway
  swayFreq: number; // rad/s
  swayPhase: number;
}

// The slice of a LakeMap the field needs. Declared structurally so this module
// never imports lakeMap.ts's value side (lakeMap.ts calls IN to here).
export interface KelpLakeInput {
  seed: number;
  zone: number;
  bounds: { w: number; h: number };
  islets: readonly Islet[];
  sinkholes: readonly { pos: Vec2; mouth: Vec2 }[];
  buoys: readonly { pos: Vec2 }[];
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

// The candidate is a legal kelp spot: full open water (shoreAttenAt < 1 rejects
// everything inside an islet polygon AND everything inside its shore band — the
// same rejection the driftwood field uses), and KELP_CLEARANCE clear of every
// sinkhole mouth, gap, bell buoy and the run-start spawn point.
export function isKelpSpotClear(lake: KelpLakeInput, p: Vec2, keepOut: readonly Vec2[]): boolean {
  const halfW = lake.bounds.w / 2 - BOUNDS_MARGIN;
  const halfH = lake.bounds.h / 2 - BOUNDS_MARGIN;
  if (p.x < -halfW || p.x > halfW || p.z < -halfH || p.z > halfH) return false;
  if (shoreAttenAt(lake.islets, p.x, p.z) < 1) return false;
  for (const k of keepOut) {
    if (dist(p, k) < KELP_CLEARANCE) return false;
  }
  return true;
}

// Everything the field must stay KELP_CLEARANCE away from, in a fixed order.
export function kelpKeepOutPoints(lake: KelpLakeInput, spawn?: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  for (const s of lake.sinkholes) {
    pts.push(s.mouth);
    pts.push(s.pos);
  }
  for (const b of lake.buoys) pts.push(b.pos);
  if (spawn) pts.push(spawn);
  return pts;
}

// Grow the field. `spawn` is the boat's run-start position (lakeWorld's
// boatSpawnDist off the start islet) — passed in rather than recomputed so this
// module never has to know the docking rules.
export function computeKelpColumns(lake: KelpLakeInput, spawn?: Vec2): KelpColumn[] {
  if (lake.zone !== KELP_ZONE) return [];

  const rng = createRng(lake.seed, LAYOUT, (KELP_SALT ^ zoneSalt(lake.zone)) >>> 0);
  const keepOut = kelpKeepOutPoints(lake, spawn);
  const halfW = lake.bounds.w / 2 - BOUNDS_MARGIN;
  const halfH = lake.bounds.h / 2 - BOUNDS_MARGIN;

  const columns: KelpColumn[] = [];
  const clusterCount = rng.int(CLUSTER_MIN, CLUSTER_MAX);

  for (let c = 0; c < clusterCount && columns.length < MAX_KELP_COLUMNS; c++) {
    // Alternate open-water / islet-approach clusters so the split is fixed
    // (a chance() roll here would make the mix seed-dependent for no gain).
    const approach = c % 2 === 1 && lake.islets.length > 0;
    let centre: Vec2 | null = null;
    for (let attempt = 0; attempt < CLUSTER_ATTEMPTS; attempt++) {
      let cand: Vec2;
      if (approach) {
        const iso = rng.pick(lake.islets as Islet[]);
        const ang = rng.nextFloat() * Math.PI * 2;
        // isletMaxRadius is the shore; shoreAttenAt's band is another SHORE_BAND
        // out, so the approach ring starts past both.
        let reach = 0;
        for (const v of iso.poly) {
          const r = Math.hypot(v.x - iso.center.x, v.z - iso.center.z);
          if (r > reach) reach = r;
        }
        const off = reach + 7 + rng.range(ISLET_APPROACH_MIN, ISLET_APPROACH_MAX);
        cand = { x: iso.center.x + Math.cos(ang) * off, z: iso.center.z + Math.sin(ang) * off };
      } else {
        cand = { x: rng.range(-halfW, halfW), z: rng.range(-halfH, halfH) };
      }
      if (isKelpSpotClear(lake, cand, keepOut)) {
        centre = cand;
        break;
      }
    }
    if (!centre) continue; // a crowded seed simply grows fewer clusters

    const members = rng.int(PER_CLUSTER_MIN, PER_CLUSTER_MAX);
    for (let m = 0; m < members && columns.length < MAX_KELP_COLUMNS; m++) {
      let spot: Vec2 | null = null;
      for (let attempt = 0; attempt < MEMBER_ATTEMPTS; attempt++) {
        const ang = rng.nextFloat() * Math.PI * 2;
        // sqrt-distributed radius → an even scatter rather than a bullseye
        const r = CLUSTER_SPREAD * Math.sqrt(rng.nextFloat());
        const cand = { x: centre.x + Math.cos(ang) * r, z: centre.z + Math.sin(ang) * r };
        if (isKelpSpotClear(lake, cand, keepOut)) {
          spot = cand;
          break;
        }
      }
      if (!spot) continue;
      columns.push({
        id: columns.length,
        cluster: c,
        x: spot.x,
        z: spot.z,
        radius: KELP_RADIUS,
        height: rng.range(HEIGHT_MIN, HEIGHT_MAX),
        taper: rng.range(0.18, 0.4),
        yaw: rng.range(0, Math.PI * 2),
        swayAmp: rng.range(0.02, 0.07),
        swayFreq: rng.range(0.25, 0.6),
        swayPhase: rng.range(0, Math.PI * 2),
      });
    }
  }

  return columns;
}

export function kelpBaseY(): number {
  return KELP_BASE_Y;
}

// --- drag-snag geometry (the M6 pressure mechanic) -----------------------------

export interface KelpSnagResult {
  x: number;
  z: number;
  snagged: boolean;
  column: number; // id of the column that arrested the move, -1 when clear
  arrested: number; // m of displacement dropped
}

// Nudge the arrested body this far back down its own travel direction, so it
// rests just OUTSIDE the collider instead of exactly on the rim (where the next
// step's `startsOutside` guard would fail on a floating-point hair).
const SNAG_BACKOFF = 1e-4;

// Move a body of radius `bodyRadius` from `from` toward `to`, arrested at the
// first kelp column the path would pass through. Pure geometry: solves the
// segment against each column's INFLATED circle (column radius + body radius)
// and stops at the nearest entry point.
//
// A body that already starts inside a column's inflated circle is never
// arrested by that column — otherwise a body nudged into the kelp by some other
// system could never leave it again.
export function resolveKelpSnag(
  kelp: readonly KelpColumn[],
  from: Vec2,
  to: Vec2,
  bodyRadius: number,
): KelpSnagResult {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const travel = Math.hypot(dx, dz);
  if (kelp.length === 0 || travel <= 1e-9) {
    return { x: to.x, z: to.z, snagged: false, column: -1, arrested: 0 };
  }

  let bestT = 1;
  let bestId = -1;
  for (const col of kelp) {
    const r = col.radius + bodyRadius;
    const fx = from.x - col.x;
    const fz = from.z - col.z;
    const startD2 = fx * fx + fz * fz;
    if (startD2 <= r * r) continue; // already inside — this column cannot arrest
    // |from + t·d − c|² = r²  →  a t² + b t + c₀ = 0
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c0 = startD2 - r * r;
    const disc = b * b - 4 * a * c0;
    if (disc <= 0) continue; // misses (or grazes) the column
    const sq = Math.sqrt(disc);
    const t = (-b - sq) / (2 * a); // near root = the entry point
    if (t >= 0 && t < bestT) {
      bestT = t;
      bestId = col.id;
    }
  }

  if (bestId < 0) return { x: to.x, z: to.z, snagged: false, column: -1, arrested: 0 };

  const back = Math.min(bestT, SNAG_BACKOFF / travel);
  const t = Math.max(0, bestT - back);
  return {
    x: from.x + dx * t,
    z: from.z + dz * t,
    snagged: true,
    column: bestId,
    arrested: travel * (1 - t),
  };
}

// --- partial LOS ----------------------------------------------------------------

// Does the straight line a→b pass through any kelp column? `pad` widens every
// column (a sight-line grazing a stalk is still a sight-line through weed).
export function segmentCrossesKelp(
  kelp: readonly KelpColumn[],
  a: Vec2,
  b: Vec2,
  pad = 0,
): boolean {
  if (kelp.length === 0) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  for (const col of kelp) {
    const r = col.radius + pad;
    const px = col.x - a.x;
    const pz = col.z - a.z;
    const t = len2 > 1e-12 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / len2)) : 0;
    const cx = px - dx * t;
    const cz = pz - dz * t;
    if (cx * cx + cz * cz <= r * r) return true;
  }
  return false;
}
