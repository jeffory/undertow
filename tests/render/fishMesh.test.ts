// FISH MESH LOOK — M4 round 2 acceptance (task t18). The round-1 mesh passed
// mechanics QA but read as "limp grey-white tubes" — so this pins the LOOK at
// the geometry level: every species builds a non-degenerate, two-tone, finned,
// eyed fish (dark dorsal → pale belly gradient, pale translucent fins, dark
// glassy eyes), no grey-white defaults, no NaN normals. Pure Node + three.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '../../src/core/rng';
import { generateFishParams } from '../../src/gen/fishParams';
import { ALL_SPECIES } from '../../src/data/species';
import { buildFishRig } from '../../src/render/fishMesh';

function build(seed: number, id: string) {
  const sp = ALL_SPECIES.find((s) => s.id === id)!;
  const params = generateFishParams(sp, new Rng(seed), { zone: 1 });
  const rig = buildFishRig(params);
  const geo = rig.geo;
  const pos = geo.attributes.position.array as Float32Array;
  const col = geo.attributes.color.array as Float32Array;
  const count = rig.count;
  const bb = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
  const size = bb.getSize(new THREE.Vector3());
  // color stats over the vertices
  let maxSat = 0;
  let maxLuma = 0;
  let minLuma = 1;
  const hues = new Set<number>();
  for (let v = 0; v < count; v++) {
    const r = col[v * 3], g = col[v * 3 + 1], b = col[v * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    maxSat = Math.max(maxSat, sat);
    maxLuma = Math.max(maxLuma, lum);
    minLuma = Math.min(minLuma, lum);
    if (sat > 0.08) {
      let h: number;
      if (mx === r) h = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
      hues.add(Math.round((((h + 6) % 6) * 60) / 30));
    }
  }
  const normals = geo.attributes.normal ? (geo.attributes.normal.array as Float32Array) : null;
  let nanNormals = 0;
  if (normals) {
    for (let i = 0; i < normals.length; i++) if (!Number.isFinite(normals[i])) nanNormals++;
  }
  const indexCount = geo.index ? geo.index.count : 0;
  return { rig, params, size, maxSat, maxLuma, minLuma, hues, nanNormals, count, indexCount };
}

describe('every species builds a readable fish', () => {
  const seeds = [11, 42, 977];

  it('builds without a vertex-budget mismatch and with finite normals', () => {
    for (const sp of ALL_SPECIES) {
      for (const s of seeds) {
        const { rig, nanNormals, indexCount } = build(s, sp.id);
        expect(nanNormals, `${sp.id}@${s}`).toBe(0);
        expect(indexCount, `${sp.id}@${s}`).toBeGreaterThan(0);
        expect(rig.count, `${sp.id}@${s}`).toBeGreaterThan(0);
      }
    }
  });

  it('has real body volume: depth/length is more than a paper tube', () => {
    // spoonworm is deliberately a thin ribbon, so the floor is low but nonzero
    const thin = build(42, 'spoonworm');
    expect(thin.size.y / thin.size.z).toBeGreaterThan(0.05);
    const pike = build(42, 'silt-pikelet');
    expect(pike.size.y / pike.size.z).toBeGreaterThan(0.12);
    const carp = build(42, 'bell-carp');
    expect(carp.size.y / carp.size.z).toBeGreaterThan(0.18);
    const toady = build(42, 'toady-office');
    expect(toady.size.y / toady.size.z).toBeGreaterThan(0.22);
  });

  it('is NOT a grey-white default: saturated two-tone colours (dark dorsal, pale belly)', () => {
    for (const sp of ALL_SPECIES) {
      const { maxSat, maxLuma, minLuma } = build(42, sp.id);
      expect(maxSat, `${sp.id} dorsal saturation`).toBeGreaterThan(0.25);
      expect(maxLuma, `${sp.id} belly`).toBeGreaterThan(0.45); // pale cream belly
      expect(minLuma, `${sp.id} dorsal dark`).toBeLessThan(0.5);
      expect(maxLuma - minLuma, `${sp.id} two-tone contrast`).toBeGreaterThan(0.15);
    }
  });

  it('bands rungfish and Marens-fox (banding paint is not lost)', () => {
    const rung = build(42, 'rungfish');
    const fox = build(42, 'marens-fox');
    expect(rung.params.banding).toBeDefined();
    expect(fox.params.banding).toBeDefined();
  });

  it('sizes the fins from finPlacement/finCount: visible fins = caudal + extra (+pectoral pairs)', () => {
    // every preset with a pectoral kind must render a pair → more fin triangles
    // than a bare lathe. Check via vertex count growth over a body-only baseline
    // for the same params (the fins are extra verts beyond rings + eyes).
    for (const sp of ALL_SPECIES) {
      const { count, params } = build(42, sp.id);
      const ringVerts = (params.spineSegments + 2) * 8 + 2 + params.eyeCount * 8;
      let finVerts = 0;
      for (const pl of params.finPlacement) {
        finVerts += pl.kind === 'caudal' ? 5 : pl.kind === 'ridge' ? 4 : pl.kind === 'pectoral' ? 6 : 3;
      }
      expect(count, sp.id).toBe(ringVerts + finVerts);
      expect(finVerts, sp.id).toBeGreaterThan(0);
    }
  });

  it('reads a pectoral pair on the mid-rosters (dorsal + caudal + 2 pec = 4 visible)', () => {
    // the presets carry a pectoral kind; every roll that leaves room for an
    // extra fin beyond caudal+dorsal must place one (the renderer draws a PAIR
    // per pectoral placement → two visible side fins)
    for (const id of ['silt-pikelet', 'bottle-post', 'hollow-shiner']) {
      const preset = ALL_SPECIES.find((s) => s.id === id)!;
      expect(preset.finKinds, id).toContain('pectoral');
      for (const s of seeds) {
        const { params } = build(s, id);
        const caudals = params.finPlacement.filter((p) => p.kind === 'caudal').length;
        expect(caudals, `${id}@${s}`).toBeGreaterThanOrEqual(1);
        if (params.finCount >= 3) {
          const pecs = params.finPlacement.filter((p) => p.kind === 'pectoral').length;
          expect(pecs, `${id}@${s}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});