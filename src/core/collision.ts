// Collision — pure circle geometry for M1 land combat (plan 01 §2.3 collision
// slot, spec 8.3). No three, no DOM. The systems.ts `collision` slot applies
// these to the world's player/fish/ground each fixed step (foot mode only).
// Split out of systems.ts so the containment/separation math is unit-testable
// in Node without three (the same carve-out as core/waves.ts / game/boatPhysics.ts).

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

export interface Boundary {
  x: number;
  z: number;
  radius: number;
}

// Returns a copy of `pos` constrained so the circle stays fully inside the
// boundary disc. A point already inside (or at the degenerate centre) is
// returned unchanged. Does not mutate its inputs.
export function constrainToCircle(pos: Circle, boundary: Boundary): Circle {
  const dx = pos.x - boundary.x;
  const dz = pos.z - boundary.z;
  const dist = Math.hypot(dx, dz);
  const maxDist = boundary.radius - pos.radius;
  if (dist > maxDist) {
    if (dist <= 1e-9) return { ...pos, x: boundary.x, z: boundary.z };
    const scale = maxDist / dist;
    return { ...pos, x: boundary.x + dx * scale, z: boundary.z + dz * scale };
  }
  return { ...pos };
}

// Returns a copy of `pos` pushed just outside `obstacle` (centre distance >=
// obstacle.radius + pos.radius). Unlike separateCircles, only `pos` moves — the
// obstacle is world geometry (a kelp column, M6) and never budges. A circle
// already clear is returned unchanged; a concentric one is pushed along +X.
export function pushOutsideCircle(pos: Circle, obstacle: Boundary): Circle {
  const dx = pos.x - obstacle.x;
  const dz = pos.z - obstacle.z;
  const minDist = obstacle.radius + pos.radius;
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist) return { ...pos };
  if (dist <= 1e-9) return { ...pos, x: obstacle.x + minDist, z: obstacle.z };
  const scale = minDist / dist;
  return { ...pos, x: obstacle.x + dx * scale, z: obstacle.z + dz * scale };
}

// Returns [a', b'] pushed just apart so the two circles no longer overlap
// (centre distance >= a.radius + b.radius). The overlap is split evenly.
// Concentric (degenerate) circles are separated along +X. A pair that already
// has clearance is returned unchanged. Does not mutate its inputs.
export function separateCircles(a: Circle, b: Circle): [Circle, Circle] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return [a, b];
  if (dist <= 1e-9) {
    const push = minDist / 2;
    return [{ ...a, x: a.x - push }, { ...b, x: b.x + push }];
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const push = (minDist - dist) / 2;
  return [
    { ...a, x: a.x - nx * push, z: a.z - nz * push },
    { ...b, x: b.x + nx * push, z: b.z + nz * push },
  ];
}