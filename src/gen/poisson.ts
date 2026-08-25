// POISSON DISC — grid-based fast Poisson-disc sampling (Bridson, plan 03 §2.2).
// Deterministic: every random draw comes from the passed Rng, in a fixed order,
// so the same Rng state reproduces the same point set. The `start` point is
// injected first (the lighthouse-side anchor islet), so the archipelago always
// grows away from it.

import type { Vec2 } from '../core/poly';

export interface PoissonBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

// Sample `radius`-separated points inside the box (each ≥ `radius` from the
// edge, matching the plan's "min distance enforced to the edge"). `k` is the
// Bridson candidate budget per active point. Deterministic given `rng`.
export function poissonDisc(
  rng: { nextFloat(): number; int(a: number, b: number): number },
  box: PoissonBox,
  radius: number,
  start: Vec2,
  k = 30,
): Vec2[] {
  const cell = radius / Math.SQRT2;
  const cols = Math.max(1, Math.ceil((box.maxX - box.minX) / cell));
  const rows = Math.max(1, Math.ceil((box.maxZ - box.minZ) / cell));
  const grid = new Int32Array(cols * rows).fill(-1);

  const pts: Vec2[] = [];
  const active: number[] = [];

  const inBounds = (p: Vec2): boolean =>
    p.x >= box.minX + radius &&
    p.x <= box.maxX - radius &&
    p.z >= box.minZ + radius &&
    p.z <= box.maxZ - radius;

  const cellOf = (p: Vec2): { cx: number; cz: number } => {
    const cx = Math.max(0, Math.min(cols - 1, Math.floor((p.x - box.minX) / cell)));
    const cz = Math.max(0, Math.min(rows - 1, Math.floor((p.z - box.minZ) / cell)));
    return { cx, cz };
  };

  const hasNear = (cand: Vec2): boolean => {
    const { cx, cz } = cellOf(cand);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) continue;
        const id = grid[gx + gz * cols];
        if (id !== undefined && id >= 0) {
          const q = pts[id]!;
          const d = Math.hypot(q.x - cand.x, q.z - cand.z);
          if (d < radius) return true;
        }
      }
    }
    return false;
  };

  const add = (p: Vec2): void => {
    pts.push(p);
    const id = pts.length - 1;
    const { cx, cz } = cellOf(p);
    grid[cx + cz * cols] = id;
    active.push(id);
  };

  add(start);

  while (active.length > 0) {
    const idx = rng.int(0, active.length - 1);
    const center = pts[active[idx]!]!;
    let found = false;
    for (let i = 0; i < k; i++) {
      const ang = rng.nextFloat() * Math.PI * 2;
      const rad = radius * (1 + rng.nextFloat()); // [r, 2r]
      const cand: Vec2 = {
        x: center.x + Math.cos(ang) * rad,
        z: center.z + Math.sin(ang) * rad,
      };
      if (!inBounds(cand)) continue;
      if (hasNear(cand)) continue;
      add(cand);
      found = true;
      break;
    }
    if (!found) {
      active.splice(idx, 1);
    }
  }

  return pts;
}