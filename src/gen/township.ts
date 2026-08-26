// THE TOWNSHIP — the zone-3 drowned Hollow (M7 round 1, plan 05 §2.2). Pure and
// three-free: given a lake's seed / zone / islets / placements it deterministic-
// ally lays out the flooded main street — the ROOFS you walk on, the drowned
// streetlamps that light them, and the environmental-text points that read.
//
// THE ROOF-AS-ISLET MAPPING (the decision this round had to make)
// ---------------------------------------------------------------
// A roof is an ISLET. Not a new collidable class, not a second walkable
// contract: `computeTownshipIslets` returns ordinary `Islet` records with
// `kind: 'roof'`, and lakeMap APPENDS them to `lake.islets` after every other
// placement. Everything downstream then works for free and cannot drift:
//
//   • docking      — nearestDockableIslet skips only `kind === 'rock'`, so a
//                    roof is dockable with the same B verb as any shore;
//   • foot collision — the keeper is clamped into the roof's convex hull by the
//                    same constrainCircleInConvex call an islet uses;
//   • grounding    — groundYAt → isletHeightAt, which returns the roof's FLAT
//                    deck rise (isletHeight.ts's one roof branch) instead of a
//                    rock dome, so feet meet the deck exactly;
//   • fishing      — the foot cast flow already runs "on an islet"; a roof is
//                    an islet, so casting/landing from a rooftop is free;
//   • boat         — resolveBoatObstacles slides the hull off every islet
//                    polygon, so you cannot row through a drowned house;
//   • waves        — shoreAttenAt kills the swell at every islet rim, so the
//                    lake does not wash over the roof you are standing on.
//
// What a roof does NOT inherit is its LOOK: render/lake.ts skips
// `kind !== 'walkable'` when it builds slate meshes and scatters rocks, and
// render/township.ts draws the roof instead — a wet-slate deck plate over a
// SUBMERGED town building (the M5 GLBs, sunk so the waterline crosses their
// upper walls).
//
// Placement is the kelp convention exactly: a SALTED copy of the LAYOUT stream,
// consumed in a fixed order, drawn AFTER every other placement — so the
// un-salted layout stream is untouched and zones 1/2 stay byte-identical. Only
// zone 3 builds anything; every other zone returns the empty field, so every
// consumer is a no-op outside the Township by construction.

import { createRng, LAYOUT } from '../core/rngStreams';
import { zoneSalt } from '../core/zones';
import { shoreAttenAt } from '../core/shore';
import type { Islet } from './lakeMap';
import type { Vec2 } from '../core/poly';
import { convexHull } from '../core/poly';

// The one zone that drowns a town (plan.md §7: 3 = The Township).
export const TOWNSHIP_ZONE = 3;

// Salt for the township placement stream — XOR'd with the zone salt, exactly as
// the kelp field does, so a future drowned-town zone grows a different street.
const TOWNSHIP_SALT = 0x544f574e; // 'TOWN'

// --- the street ---------------------------------------------------------------

export const ROOF_MIN = 8; // the band the task set: ~8-14 roofs break the surface
export const ROOF_MAX = 14;

const TARGET_MIN = 9; // roofs the layout AIMS for before clearance rejections
const TARGET_MAX = 13;

const STEP_MIN = 8.5; // m — closest two street slots may sit
const STEP_MAX = 12;
const MAX_SLOTS = 40; // hard walk cap (a crowded street simply builds fewer)

// m — half the width of the open channel down the middle of the street. The
// hull is 0.9 m; 7 m of clear water each side is a road you row down and read.
const STREET_HALF = 7;

const BOUNDS_MARGIN = 16; // keep the whole street clear of the lake box edge

// m — minimum clearance a roof keeps from anything the player must be able to
// reach: a sinkhole mouth (the descent), a bell buoy (the extraction), a wreck,
// and the boat's own run-start spawn point. Same contract as KELP_CLEARANCE.
export const TOWNSHIP_CLEARANCE = 6;

// m — the gap two roof rims must keep, so the street never fuses into a raft.
const ROOF_GAP = 3.5;

// --- one roof -------------------------------------------------------------------

// The walkable deck: metres above GROUND_Y (the islet shoreline surface, itself
// 0.25 m over the water plane). Varied per roof so the drowned street is not a
// dead-flat pontoon; isletHeight.ts reads it off the islet.
const DECK_RISE_MIN = 0.38;
const DECK_RISE_MAX = 0.72;

const HALF_X_MIN = 2.7; // m — roof deck half-extents (the keeper's radius is 0.5)
const HALF_X_MAX = 4.0;
const HALF_Z_MIN = 2.5;
const HALF_Z_MAX = 3.5;

// The GLB under a roof is scaled off the deck's DIAGONAL, not its width: a
// building sized to the diagonal covers the whole rectangle you stand on in
// both axes, so the deck never juts out past the slates as a raft. Slightly
// under 1 keeps the building inside the clearance the deck's own reach bought.
const ROOF_FOOTPRINT_FRAC = 0.95;

const footprintFor = (halfX: number, halfZ: number): number =>
  2 * Math.hypot(halfX, halfZ) * ROOF_FOOTPRINT_FRAC;

// How far up its own height a building sits at the waterline. plan 05 §2.2 /
// the task: "building y sunk so the waterline sits at upper-wall height". 0.78
// leaves the roof pitch (and only the roof pitch) above the surface.
const WATERLINE_FRAC_HOUSE = 0.78;
// The steeple stands proud of the flood — it is the landmark you navigate by.
const WATERLINE_FRAC_STEEPLE = 0.44;
// The cinema is a broad low hall; its marquee has to hang UNDER the surface.
const WATERLINE_FRAC_MARQUEE = 0.72;

// The chamfer that turns the roof rectangle into an 8-vertex convex polygon —
// the same shape family every other islet polygon is (≥ 6 verts, convex, non
// self-intersecting), so no consumer has to special-case a 4-gon.
const ROOF_CHAMFER = 0.28;

// The M5 town GLBs (public/assets/town/*.glb) the drowned street reuses. The
// bell tower is the steeple and the schoolhouse is the cinema hall, so both are
// held out of the ordinary-house rotation.
export const STEEPLE_BUILDING = 'bell-tower';
export const MARQUEE_BUILDING = 'schoolhouse';
export const HOUSE_BUILDINGS = [
  'smokehouse',
  'chandlery',
  'post-office',
  'apothecary',
  'bakery',
  'chapel',
] as const;

// --- lamps ------------------------------------------------------------------------

const MAX_LAMPS = 7;
const LAMP_KERB = STREET_HALF - 1.1; // m — how far off the centreline a lamp stands
const LAMP_HEIGHT_MIN = 2.6; // m — pole length from the lakebed stub to the glass
const LAMP_HEIGHT_MAX = 3.4;

// --- env text -----------------------------------------------------------------------

const ENV_RADIUS_ROOF = 6.5; // m — reads while you are on (or alongside) the roof
const ENV_RADIUS_MARQUEE = 16; // m — the marquee reads from the boat, down the street

export type RoofSlot = 'house' | 'steeple' | 'marquee';

export interface Roof {
  id: number;
  isletId: number; // index into lake.islets — the walkable polygon IS the roof
  slot: RoofSlot;
  building: string; // town GLB id sunk under this roof
  pos: Vec2;
  yaw: number; // rotation of the roof rectangle (and the building under it)
  halfX: number; // m — deck half-extent along the roof's local X
  halfZ: number;
  deckRise: number; // m above GROUND_Y — the flat walkable surface
  footprint: number; // m — the widest horizontal size the GLB is scaled to
  waterlineFrac: number; // 0..1 of the building's own height that sits at y = 0
  side: -1 | 1; // which side of the street it stands on
  t: number; // m along the street from its head
}

export interface Streetlamp {
  id: number;
  pos: Vec2;
  height: number; // m — lakebed stub to the glass
  side: -1 | 1;
  t: number;
}

export interface EnvPoint {
  id: number;
  key: string; // content/envText.ts copy key
  pos: Vec2;
  radius: number; // m — approach-to-read radius
  roofId: number; // the roof it is tagged to (-1 = none)
}

export interface Street {
  origin: Vec2; // the street's head (t = 0)
  dir: Vec2; // unit vector down the street
  perp: Vec2; // unit vector across it (+1 side)
  length: number; // m
}

export interface TownshipField {
  street: Street | null;
  islets: Islet[]; // the roof islets, ready to append to lake.islets
  roofs: Roof[];
  lamps: Streetlamp[];
  envPoints: EnvPoint[];
}

// The slice of a LakeMap the street needs. Declared structurally so this module
// never imports lakeMap.ts's value side (lakeMap.ts calls IN to here).
export interface TownshipLakeInput {
  seed: number;
  zone: number;
  bounds: { w: number; h: number };
  islets: readonly Islet[];
  graph: { edges: readonly (readonly [number, number])[] };
  sinkholes: readonly { pos: Vec2; mouth: Vec2 }[];
  buoys: readonly { pos: Vec2 }[];
  wrecks: readonly { pos: Vec2 }[];
}

export function emptyTownship(): TownshipField {
  return { street: null, islets: [], roofs: [], lamps: [], envPoints: [] };
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

// The 8-vertex convex roof outline for a rectangle (halfX × halfZ) centred at
// `pos` and turned by `yaw`. Pure — the render deck plate is built from the
// same numbers, so what you stand on is what you see.
export function roofPolygon(pos: Vec2, yaw: number, halfX: number, halfZ: number): Vec2[] {
  const c = ROOF_CHAMFER * Math.min(halfX, halfZ);
  const local: Vec2[] = [
    { x: halfX - c, z: -halfZ },
    { x: halfX, z: -halfZ + c },
    { x: halfX, z: halfZ - c },
    { x: halfX - c, z: halfZ },
    { x: -halfX + c, z: halfZ },
    { x: -halfX, z: halfZ - c },
    { x: -halfX, z: -halfZ + c },
    { x: -halfX + c, z: -halfZ },
  ];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return local.map((p) => ({
    x: pos.x + p.x * cos - p.z * sin,
    z: pos.z + p.x * sin + p.z * cos,
  }));
}

// Build the Islet record for one roof. `kind: 'roof'` is what every consumer
// branches on; `deckRise` is what isletHeightAt returns for it.
export function roofIslet(id: number, roof: Roof, zone: number): Islet {
  const poly = roofPolygon(roof.pos, roof.yaw, roof.halfX, roof.halfZ);
  return {
    id,
    center: { x: roof.pos.x, z: roof.pos.z },
    poly,
    hull: convexHull(poly),
    baseRadius: Math.max(roof.halfX, roof.halfZ),
    kind: 'roof',
    zone,
    features: [],
    hasSinkhole: false,
    deckRise: roof.deckRise,
  };
}

// Everything the street must stay TOWNSHIP_CLEARANCE away from, in a fixed
// order (the kelp field's keepOut contract).
export function townshipKeepOutPoints(lake: TownshipLakeInput, spawn?: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  for (const s of lake.sinkholes) {
    pts.push(s.mouth);
    pts.push(s.pos);
  }
  for (const b of lake.buoys) pts.push(b.pos);
  for (const wk of lake.wrecks) pts.push(wk.pos);
  if (spawn) pts.push(spawn);
  return pts;
}

// A roof of reach `reach` may stand at `p`: inside the bounds margin, in FULL
// open water (shoreAttenAt < 1 rejects every natural islet and its shore band),
// clear of every keep-out point, and ROOF_GAP clear of every roof already laid.
export function isRoofSpotClear(
  lake: TownshipLakeInput,
  p: Vec2,
  reach: number,
  keepOut: readonly Vec2[],
  placed: readonly Roof[],
  rim?: readonly Vec2[],
): boolean {
  const halfW = lake.bounds.w / 2 - BOUNDS_MARGIN;
  const halfH = lake.bounds.h / 2 - BOUNDS_MARGIN;
  if (p.x < -halfW || p.x > halfW || p.z < -halfH || p.z > halfH) return false;
  // The rim is tested as well as the centre — a roof must not poke a corner into
  // a shore band. Callers that HAVE the outline (every roof does) pass its real
  // vertices, so the test is exact rather than a sampled ring; the lamps, which
  // are a 0.6 m post, fall back to a coarse ring.
  if (shoreAttenAt(lake.islets, p.x, p.z) < 1) return false;
  if (rim) {
    for (const v of rim) {
      if (shoreAttenAt(lake.islets, v.x, v.z) < 1) return false;
    }
  } else {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (shoreAttenAt(lake.islets, p.x + Math.cos(a) * reach, p.z + Math.sin(a) * reach) < 1) {
        return false;
      }
    }
  }
  for (const k of keepOut) {
    if (dist(p, k) < TOWNSHIP_CLEARANCE + reach) return false;
  }
  for (const r of placed) {
    const rr = Math.hypot(r.halfX, r.halfZ);
    if (dist(p, r.pos) < reach + rr + ROOF_GAP) return false;
  }
  return true;
}

// How far a ray from `o` in direction `d` runs before it leaves the (margined)
// lake box. Pure slab test; used to stretch the street across open water.
function rayBoxExit(o: Vec2, d: Vec2, halfW: number, halfH: number): number {
  let best = Infinity;
  if (Math.abs(d.x) > 1e-9) {
    const tx = ((d.x > 0 ? halfW : -halfW) - o.x) / d.x;
    if (tx > 0) best = Math.min(best, tx);
  }
  if (Math.abs(d.z) > 1e-9) {
    const tz = ((d.z > 0 ? halfH : -halfH) - o.z) / d.z;
    if (tz > 0) best = Math.min(best, tz);
  }
  return Number.isFinite(best) ? best : 0;
}

// The drowned main street: a straight line laid through the middle of one of
// the lake's LONGEST path-graph edges (the channel between two islets that the
// route already runs down), extended both ways to the bounds margin. The line
// is chosen from the graph — never from thin air — so the street reads as the
// road that connected the two banks before the flood.
function chooseStreet(lake: TownshipLakeInput, rng: { int(a: number, b: number): number; range(a: number, b: number): number }): Street | null {
  const edges = lake.graph.edges
    .map(([a, b]) => {
      const A = lake.islets[a];
      const B = lake.islets[b];
      if (!A || !B) return null;
      return { a, b, len: dist(A.center, B.center) };
    })
    .filter((e): e is { a: number; b: number; len: number } => e !== null)
    // longest first; ties broken by index so the sort is total and stable
    .sort((p, q) => q.len - p.len || p.a - q.a || p.b - q.b);
  if (edges.length === 0) return null;

  const pick = edges[rng.int(0, Math.min(2, edges.length - 1))]!;
  const A = lake.islets[pick.a]!.center;
  const B = lake.islets[pick.b]!.center;
  const mid: Vec2 = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
  const len = Math.max(1e-6, dist(A, B));
  const dir: Vec2 = { x: (B.x - A.x) / len, z: (B.z - A.z) / len };
  const perp: Vec2 = { x: -dir.z, z: dir.x };

  const halfW = lake.bounds.w / 2 - BOUNDS_MARGIN;
  const halfH = lake.bounds.h / 2 - BOUNDS_MARGIN;
  const fwd = rayBoxExit(mid, dir, halfW, halfH);
  const back = rayBoxExit(mid, { x: -dir.x, z: -dir.z }, halfW, halfH);
  const origin: Vec2 = { x: mid.x - dir.x * back, z: mid.z - dir.z * back };
  return { origin, dir, perp, length: fwd + back };
}

// Grow the drowned town. `spawn` is the boat's run-start position (passed in
// rather than recomputed, so this module never has to know the docking rules).
export function computeTownship(lake: TownshipLakeInput, spawn?: Vec2): TownshipField {
  if (lake.zone !== TOWNSHIP_ZONE) return emptyTownship();

  const rng = createRng(lake.seed, LAYOUT, (TOWNSHIP_SALT ^ zoneSalt(lake.zone)) >>> 0);
  const street = chooseStreet(lake, rng);
  if (!street) return emptyTownship();

  const keepOut = townshipKeepOutPoints(lake, spawn);
  const target = rng.int(TARGET_MIN, TARGET_MAX);
  const rawStep = street.length / (target + 1);
  const step = rawStep < STEP_MIN ? STEP_MIN : rawStep > STEP_MAX ? STEP_MAX : rawStep;

  const roofs: Roof[] = [];

  // One walk down the street, dropping a roof in every slot that will take one.
  // `tOffset` shifts the whole comb: the first pass lays the terrace, and a
  // crowded street (a bank of islets, a wreck, a sinkhole mouth in the way)
  // gets further passes offset between the slots it already filled, until the
  // street holds at least ROOF_MIN. Deterministic: the offsets are tried in a
  // fixed order and each slot consumes a fixed number of draws.
  const walk = (tOffset: number): void => {
    for (let i = 0; i < MAX_SLOTS && roofs.length < ROOF_MAX; i++) {
      const t = step * (i + 0.5) + tOffset + rng.range(-1.2, 1.2);
      if (t > street.length) break;
      if (t < 0) continue;
      const halfX = rng.range(HALF_X_MIN, HALF_X_MAX);
      const halfZ = rng.range(HALF_Z_MIN, HALF_Z_MAX);
      const deckRise = rng.range(DECK_RISE_MIN, DECK_RISE_MAX);
      const yawJitter = rng.range(-0.09, 0.09);
      const across = STREET_HALF + halfZ + rng.range(0, 1.6);
      const reach = Math.hypot(halfX, halfZ);
      // The primary side alternates so the two rows stagger; the other bank is
      // tried second, so a slot blocked on one side still houses the street.
      const primary: -1 | 1 = i % 2 === 0 ? -1 : 1;
      // Four tries per slot, cheapest first: the primary bank at the kerb, the
      // primary bank set BACK off the road (a house with a yard), then the same
      // pair on the far bank.
      const tries: Array<{ side: -1 | 1; across: number }> = [
        { side: primary, across },
        { side: primary, across: across + 4.5 },
        { side: -primary as -1 | 1, across },
        { side: -primary as -1 | 1, across: across + 4.5 },
      ];
      for (const { side, across: off } of tries) {
        const pos: Vec2 = {
          x: street.origin.x + street.dir.x * t + street.perp.x * side * off,
          z: street.origin.z + street.dir.z * t + street.perp.z * side * off,
        };
        // the roof's ridge runs along the street, its gable faces the road
        const yaw = Math.atan2(street.dir.z, street.dir.x) + yawJitter;
        if (!isRoofSpotClear(lake, pos, reach, keepOut, roofs, roofPolygon(pos, yaw, halfX, halfZ))) {
          continue;
        }
        roofs.push({
          id: roofs.length,
          isletId: -1, // stamped by computeTownshipIslets
          slot: 'house',
          building: HOUSE_BUILDINGS[roofs.length % HOUSE_BUILDINGS.length]!,
          pos,
          yaw,
          halfX,
          halfZ,
          deckRise,
          footprint: footprintFor(halfX, halfZ),
          waterlineFrac: WATERLINE_FRAC_HOUSE,
          side,
          t,
        });
        break;
      }
    }
  };

  for (const offset of [0, step / 2, step / 4, (step * 3) / 4]) {
    walk(offset);
    if (roofs.length >= ROOF_MIN) break;
  }

  if (roofs.length === 0) return emptyTownship();

  // The two landmarks. The steeple takes the middle of the street (the church
  // at the crossroads, the thing you navigate by); the marquee takes a roof a
  // quarter of the way down, so the cinema is something you row PAST on the way
  // in rather than something you arrive at.
  const steepleIdx = Math.floor(roofs.length / 2);
  const marqueeIdx = roofs.length >= 4 ? Math.floor(roofs.length / 4) : -1;

  const steeple = roofs[steepleIdx]!;
  steeple.slot = 'steeple';
  steeple.building = STEEPLE_BUILDING;
  steeple.waterlineFrac = WATERLINE_FRAC_STEEPLE;
  steeple.footprint = footprintFor(steeple.halfX, steeple.halfZ);

  if (marqueeIdx >= 0 && marqueeIdx !== steepleIdx) {
    const cinema = roofs[marqueeIdx]!;
    cinema.slot = 'marquee';
    cinema.building = MARQUEE_BUILDING;
    cinema.waterlineFrac = WATERLINE_FRAC_MARQUEE;
    cinema.footprint = footprintFor(cinema.halfX, cinema.halfZ) * 1.12;
  }

  // --- the drowned streetlamps -------------------------------------------------
  // On the kerb, between the roof slots, alternating banks. Poles break the
  // surface; the glass carries the sodium-amber the zone is named for.
  const lamps: Streetlamp[] = [];
  for (let i = 0; i < MAX_SLOTS && lamps.length < MAX_LAMPS; i++) {
    const t = step * (i + 1);
    if (t > street.length) break;
    const primary: -1 | 1 = i % 2 === 0 ? 1 : -1;
    const height = rng.range(LAMP_HEIGHT_MIN, LAMP_HEIGHT_MAX);
    for (const side of [primary, -primary as -1 | 1]) {
      const pos: Vec2 = {
        x: street.origin.x + street.dir.x * t + street.perp.x * side * LAMP_KERB,
        z: street.origin.z + street.dir.z * t + street.perp.z * side * LAMP_KERB,
      };
      if (!isRoofSpotClear(lake, pos, 0.6, keepOut, [])) continue;
      lamps.push({ id: lamps.length, pos, height, side, t });
      break;
    }
  }

  // --- environmental text points -------------------------------------------------
  // One per roof (read while you stand on it), plus the marquee's own, which
  // reads from the boat — that is the line the street is FOR.
  const envPoints: EnvPoint[] = [];
  for (const roof of roofs) {
    const key =
      roof.slot === 'steeple'
        ? 'steeple'
        : roof.slot === 'marquee'
          ? 'cinema-roof'
          : `roof-${roof.id % 8}`;
    envPoints.push({
      id: envPoints.length,
      key,
      pos: { x: roof.pos.x, z: roof.pos.z },
      radius: ENV_RADIUS_ROOF,
      roofId: roof.id,
    });
  }
  const cinema = roofs.find((r) => r.slot === 'marquee') ?? null;
  if (cinema) {
    // the marquee itself hangs on the street-facing wall, under the surface
    envPoints.push({
      id: envPoints.length,
      key: 'marquee',
      pos: {
        x: cinema.pos.x - street.perp.x * cinema.side * (cinema.halfZ + 1.5),
        z: cinema.pos.z - street.perp.z * cinema.side * (cinema.halfZ + 1.5),
      },
      radius: ENV_RADIUS_MARQUEE,
      roofId: cinema.id,
    });
  }

  return { street, islets: [], roofs, lamps, envPoints };
}

// Stamp the roof islets. Split from computeTownship so lakeMap can hand it the
// id base (roof islets are APPENDED after every natural islet, so their ids
// continue the same array and `world.dockedIslet` stays a plain index).
export function computeTownshipIslets(field: TownshipField, idBase: number, zone: number): Islet[] {
  const out: Islet[] = [];
  for (const roof of field.roofs) {
    roof.isletId = idBase + out.length;
    out.push(roofIslet(roof.isletId, roof, zone));
  }
  field.islets = out;
  return out;
}

// --- lookups the sim + render share --------------------------------------------

/** The roof standing on islet `isletId`, or null. */
export function roofForIslet(roofs: readonly Roof[], isletId: number | null): Roof | null {
  if (isletId == null) return null;
  for (const r of roofs) if (r.isletId === isletId) return r;
  return null;
}

/**
 * The world-space marquee anchor for a cinema roof: hard against the
 * street-facing wall of the drowned hall, so the sign hangs ON the building
 * rather than floating beside it. The building is scaled to `footprint`, so
 * half of that is where its facade stands.
 */
export function marqueeAnchor(street: Street, cinema: Roof): Vec2 {
  const off = cinema.footprint / 2 + 0.2;
  return {
    x: cinema.pos.x - street.perp.x * cinema.side * off,
    z: cinema.pos.z - street.perp.z * cinema.side * off,
  };
}
