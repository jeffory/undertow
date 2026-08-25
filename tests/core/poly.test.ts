import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  convexHull,
  pointInConvex,
  constrainCircleInConvex,
  circleOutOfHull,
  constrainCircleOutsideHull,
  closestPointOnHull,
  distanceToHull,
  isSelfIntersecting,
  polygonCentroid,
} from '../../src/core/poly';

// CCW square 4×4 at the origin
const square = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 4 },
  { x: 0, z: 4 },
];

describe('poly: point-in-polygon (ray casting)', () => {
  it('inside a square', () => {
    expect(pointInPolygon({ x: 2, z: 2 }, square)).toBe(true);
  });
  it('outside a square', () => {
    expect(pointInPolygon({ x: 5, z: 2 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, z: 2 }, square)).toBe(false);
  });
  it('boundary-inclusive on a vertex', () => {
    expect(pointInPolygon({ x: 4, z: 4 }, square)).toBe(true);
  });
  it('concave L-shape notch is outside, arms are inside', () => {
    const L = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 2 },
      { x: 2, z: 2 },
      { x: 2, z: 4 },
      { x: 0, z: 4 },
    ];
    expect(pointInPolygon({ x: 3, z: 1 }, L)).toBe(true);
    expect(pointInPolygon({ x: 1, z: 3 }, L)).toBe(true);
    expect(pointInPolygon({ x: 3, z: 3 }, L)).toBe(false); // the notch
  });
  it('triangle known cases', () => {
    const tri = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: 2 },
    ];
    expect(pointInPolygon({ x: 0.2, z: 0.2 }, tri)).toBe(true);
    expect(pointInPolygon({ x: 1.5, z: 1.5 }, tri)).toBe(false);
  });
});

describe('poly: convex hull', () => {
  it('square hull keeps all four corners', () => {
    const h = convexHull(square);
    expect(h.length).toBe(4);
    for (const v of square) expect(pointInConvex(v, h)).toBe(true);
  });
  it('interior points are dropped', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
      { x: 2, z: 2 },
      { x: 1, z: 1 },
    ];
    expect(convexHull(pts).length).toBe(4);
  });
  it('collinear points collapse to hull vertices only', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ];
    const h = convexHull(pts);
    expect(h.length).toBe(4);
  });
});

describe('poly: circle-in-convex containment (foot collision)', () => {
  it('an inside circle with clearance stays put', () => {
    const c = constrainCircleInConvex({ x: 2, z: 2, radius: 0.5 }, square);
    expect(c.x).toBeCloseTo(2, 6);
    expect(c.z).toBeCloseTo(2, 6);
  });
  it('a circle too close to an edge is pushed inward to full clearance', () => {
    const c = constrainCircleInConvex({ x: 3.9, z: 2, radius: 0.5 }, square);
    expect(c.x).toBeCloseTo(3.5, 6); // 4 - 0.5
    expect(c.z).toBeCloseTo(2, 6);
  });
  it('an outside point is pushed back to exactly radius inside the nearest edge', () => {
    const c = constrainCircleInConvex({ x: 6, z: 2, radius: 0.5 }, square);
    expect(c.x).toBeCloseTo(3.5, 6);
    expect(c.z).toBeCloseTo(2, 6);
  });
  it('a corner keeps the circle inside both faces', () => {
    const c = constrainCircleInConvex({ x: 3.9, z: 3.9, radius: 0.5 }, square);
    expect(c.x).toBeLessThanOrEqual(3.5 + 1e-6);
    expect(c.z).toBeLessThanOrEqual(3.5 + 1e-6);
  });
});

describe('poly: circle-out-of-hull (water-phase trigger)', () => {
  it('returns 0 when the circle is fully inside', () => {
    expect(circleOutOfHull({ x: 2, z: 2, radius: 0.5 }, square)).toBe(0);
  });
  it('returns >0 when crossing an edge', () => {
    expect(circleOutOfHull({ x: 3.9, z: 2, radius: 0.5 }, square)).toBeGreaterThan(0);
  });
  it('returns >0 when fully outside', () => {
    expect(circleOutOfHull({ x: 8, z: 2, radius: 0.5 }, square)).toBeGreaterThan(0);
  });
});

describe('poly: circle-outside-hull (boat collision)', () => {
  it('a point inside the hull is pushed out to exactly radius clearance', () => {
    const c = constrainCircleOutsideHull({ x: 2, z: 2, radius: 1 }, square);
    expect(pointInConvex(c, square)).toBe(false);
    expect(distanceToHull(c, square)).toBeCloseTo(1, 6);
  });
  it('a point outside but within radius is pushed to exactly radius', () => {
    const c = constrainCircleOutsideHull({ x: 4.6, z: 2, radius: 1 }, square);
    expect(distanceToHull(c, square)).toBeCloseTo(1, 6);
    expect(pointInConvex(c, square)).toBe(false);
  });
  it('a clear point is unchanged', () => {
    const c = constrainCircleOutsideHull({ x: 9, z: 9, radius: 1 }, square);
    expect(c.x).toBe(9);
    expect(c.z).toBe(9);
  });
});

describe('poly: closest point / distance to boundary', () => {
  it('closest point on the square boundary', () => {
    const p = closestPointOnHull({ x: 6, z: 2 }, square);
    expect(p.x).toBeCloseTo(4, 6);
    expect(p.z).toBeCloseTo(2, 6);
  });
  it('distance to the boundary (interior and exterior)', () => {
    expect(distanceToHull({ x: 6, z: 2 }, square)).toBeCloseTo(2, 6);
    expect(distanceToHull({ x: 2, z: 2 }, square)).toBeCloseTo(2, 6); // interior → nearest face
  });
});

describe('poly: self-intersection + centroid', () => {
  it('square is not self-intersecting', () => {
    expect(isSelfIntersecting(square)).toBe(false);
  });
  it('bowtie is self-intersecting', () => {
    const bow = [
      { x: 0, z: 0 },
      { x: 2, z: 2 },
      { x: 2, z: 0 },
      { x: 0, z: 2 },
    ];
    expect(isSelfIntersecting(bow)).toBe(true);
  });
  it('polygon centroid of a square', () => {
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(2, 6);
    expect(c.z).toBeCloseTo(2, 6);
  });
});