// THE STREET THAT WAS (meta) — plan 05 §1.1, task t18 slice 3.
//
// "a row of building foundations arranged along the shore in 'memory of the
// street that was' (Hollow's main street, dry-laid)". This module owns WHERE
// those foundations are: a deterministic line of slots laid across the START
// ISLET, running from the lighthouse's foot toward (and past) the islet centre,
// with the buildings alternating sides of the street the way a main street
// alternates.
//
// Everything is derived from the islet's own geometry — centre, radius, and the
// same far-edge rule render/lake.ts uses to plant the lighthouse — so the same
// lake seed always lays out the same street, and a building always returns to
// the SAME slot whatever order the town comes back in (the slot index is the
// ledger row, not the restoration order: content/buildings.ts
// `buildingSlotIndex`).
//
// Pure logic: no `three` imports, no Math.random, no Date.

import type { Islet } from '../gen/lakeMap';
import { isletHash01, isletMaxRadius } from '../gen/isletHeight';

// All lengths are FRACTIONS OF the islet's max radius, so the street scales
// with whatever islet the generator produced (base radius 7–13 m).
const STREET_START_T = 0.62; // first slot, measured from the centre toward the lighthouse
const STREET_SPAN_T = 1.24; // total run of the street (start → past the centre)
const STREET_LATERAL_T = 0.2; // half-width of the street (alternating sides)
const YAW_JITTER = 0.14; // rad — dry-laid, not surveyed
const SCALE_JITTER = 0.18; // ±9% footprint variation between premises

export interface TownSlot {
  index: number;
  x: number;
  z: number;
  /** Radians, the game's convention (0 = +Z, +PI/2 = +X). Faces the street. */
  yaw: number;
  /** Deterministic footprint multiplier, ~0.91..1.09. */
  scale: number;
}

// The lighthouse's foot: render/lake.ts plants the tower at the islet's
// outermost vertex in the −X direction, pulled inward. Duplicated here as a
// PURE function (that module is three-side) — the two share the rule, not code.
export function lighthouseFoot(iso: Islet): { x: number; z: number } {
  let far = iso.poly[0]!;
  for (const v of iso.poly) if (v.x < far.x) far = v;
  const dx = far.x - iso.center.x;
  const dz = far.z - iso.center.z;
  const len = Math.hypot(dx, dz) || 1;
  const r = isletMaxRadius(iso);
  return { x: iso.center.x + (dx / len) * r, z: iso.center.z + (dz / len) * r };
}

// The street's axis: a unit vector from the islet centre toward the lighthouse.
export function streetAxis(iso: Islet): { x: number; z: number } {
  const foot = lighthouseFoot(iso);
  const dx = foot.x - iso.center.x;
  const dz = foot.z - iso.center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

// `count` evenly-spaced slots down the street. Slot 0 is the one nearest the
// lighthouse door; odd slots sit on the far side of the street from even ones.
export function townSlots(iso: Islet, count: number): TownSlot[] {
  const slots: TownSlot[] = [];
  if (count <= 0) return slots;
  const r = isletMaxRadius(iso);
  const axis = streetAxis(iso);
  // left-hand perpendicular of the axis
  const perpX = -axis.z;
  const perpZ = axis.x;
  const step = count > 1 ? STREET_SPAN_T / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const along = (STREET_START_T - step * i) * r;
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = STREET_LATERAL_T * r * side;
    const x = iso.center.x + axis.x * along + perpX * lateral;
    const z = iso.center.z + axis.z * along + perpZ * lateral;
    // The front door faces the street centreline: the inward perpendicular.
    const faceX = -perpX * side;
    const faceZ = -perpZ * side;
    const jitter = (isletHash01(iso, i, 7) - 0.5) * 2 * YAW_JITTER;
    slots.push({
      index: i,
      x,
      z,
      yaw: Math.atan2(faceX, faceZ) + jitter,
      scale: 1 + (isletHash01(iso, i, 8) - 0.5) * SCALE_JITTER,
    });
  }
  return slots;
}

// One slot without building the whole street (render's per-building path).
export function townSlot(iso: Islet, index: number, count: number): TownSlot | null {
  return townSlots(iso, count)[index] ?? null;
}
