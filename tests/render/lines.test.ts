// LINES — T10 line-render acceptance (plan 02 §9): the pure geometry/colour
// helpers the render module uses, pinned so the sag and 3-stop tension colour
// behave as specced. The visual (draw calls, readability over fog) is checked
// by the browser screenshot; this pins the math.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { tensionColor, lineSag } from '../../src/render/lines';

const CEILING = 100;

function hexAt(tension: number): string {
  const c = tensionColor(tension, CEILING, new THREE.Color());
  return `#${c.getHexString()}`;
}

describe('line tension colour (green → white → red)', () => {
  it('is green at 0 tension', () => {
    expect(hexAt(0)).toBe('#22c55e');
  });

  it('is white at the ~60 warn stop', () => {
    // lerped stop sits at 60% of the ceiling; exactly 60 → pure white
    expect(hexAt(60)).toBe('#ffffff');
  });

  it('is red at the ceiling', () => {
    expect(hexAt(100)).toBe('#ef4444');
  });

  it('clamps out-of-range tension', () => {
    expect(hexAt(-5)).toBe('#22c55e');
    expect(hexAt(150)).toBe('#ef4444');
  });

  it('blends monotonically green → white → red', () => {
    const stops = [0, 30, 60, 80, 100].map((t) => hexAt(t));
    expect(stops[1] !== stops[0]).toBe(true); // midway to white
    expect(stops[3] !== stops[2]).toBe(true); // toward red
    expect(stops[4] === '#ef4444').toBe(true);
  });
});

describe('line sag (plan §9: sag = (1 − tension/100) × kSag)', () => {
  it('hangs deepest at 0 tension (1.5m)', () => {
    expect(lineSag(0, CEILING)).toBeCloseTo(1.5, 9);
  });

  it('is taut at the ceiling (0m)', () => {
    expect(lineSag(100, CEILING)).toBe(0);
  });

  it('is half sag at 50 tension', () => {
    expect(lineSag(50, CEILING)).toBeCloseTo(0.75, 9);
  });

  it('never goes negative', () => {
    expect(lineSag(150, CEILING)).toBe(0);
  });
});
// --- QA round: rig reaping ------------------------------------------------------
// When the LAST fight ends, updateLines used to early-return before the reap
// loop, stranding the final rig's geometries and materials in the scene + the
// module Map until the next fight (or forever).

import { createWorld, createFish } from '../../src/core/world';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import { initLines, updateLines } from '../../src/render/lines';

describe('updateLines rig reaping', () => {
  it('reaps the last rig on the very step the final fight ends', () => {
    const scene = new THREE.Scene();
    initLines(scene);
    const root = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    expect(root).toBeDefined();

    const w = createWorld(1);
    w.fish = createFish();
    startTetherFight(w, M2_SPECIES, 'player');
    updateLines(w, 1 / 60);
    expect(root.children.length).toBe(1); // rig built

    // the fight ends (snap/cut/land) → constraint removed it from fights
    w.tether.fights.length = 0;
    updateLines(w, 1 / 60);
    expect(root.children.length).toBe(0); // rig removed + disposed immediately
    expect(root.visible).toBe(false);
  });
});
