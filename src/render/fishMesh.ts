// FISH MESH (render) — M4 round 1: FishParams → a single-draw-call
// THREE.BufferGeometry rig (plan 04 §3.2, plan.md §8.2). A lathed capsule
// spine from the girthCurve rings, flat vertex-coloured fins at their
// placements, small dark eye dots, palette from a Shallows table (dark teal
// bodies, pale bellies per crawler_creature_concept). One shared
// MeshLambertMaterial, one draw call per fish; glow species add one additive
// MeshBasicMaterial pass on the same geometry. Built at spawn time (<5ms for
// ≤~250 tris) and CPU-bent per frame by render/fish.ts from the rig's bend
// cache (basePos + segOfVertex + segZ).
//
// three only here — never imported by game logic.

import * as THREE from 'three';
import type { FishParams } from '../gen/fishParams';
import type { FinPlacement } from '../gen/fishParams';

export interface FishRig {
  params: FishParams;
  mesh: THREE.Mesh;
  glow: THREE.Mesh | null;
  geo: THREE.BufferGeometry;
  basePos: Float32Array;
  segOfVertex: Uint8Array;
  segZ: Float32Array; // joint z positions along the spine (n+1)
  count: number;
}

export const WATER_FISH_Y = 0.2; // fish floats just at the waterline during boat fights

const RING_RADIAL = 8; // verts around a spine ring (matches the M1 low-poly)

// Shared materials — every fish is one draw call on one Lambert material.
// The hurt-flash emissive lives here (only one fish is ever alive at a time).
export const FISH_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
FISH_MATERIAL.emissive.setRGB(1, 0.25, 0.2);
FISH_MATERIAL.emissiveIntensity = 0;

const GLOW_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Shallows palette registry (plan 8.1: bone-teal accents on near-black; the
// one red-accented palette is Maren's Fox). `banding.colorIdx` indexes `band`.
interface Palette {
  body: number;
  back: number;
  belly: number;
  head: number;
  fin: number;
  eye: number;
  band: number[];
}

const PALETTES: Palette[] = [
  { body: 0x45858a, back: 0x2f5f64, belly: 0xdfe9dc, head: 0x3c767b, fin: 0x2f5f64, eye: 0x0b0e10, band: [0x4a6a6e, 0x7a2e2e] }, // 0 silt/teal
  { body: 0x5aa0a6, back: 0x3a7479, belly: 0xd8ece6, head: 0x4f8a90, fin: 0x3a7479, eye: 0x0b0e10, band: [0x69b0b6, 0x2a5559] }, // 1 biolum
  { body: 0x8fa8a0, back: 0x6a847c, belly: 0xe8eee2, head: 0x7a948c, fin: 0x6a847c, eye: 0x141719, band: [0xc9d6cf, 0x2f5f64] }, // 2 bone/teal
  { body: 0x2a3338, back: 0x1c2327, belly: 0x9aa6a4, head: 0x232b30, fin: 0x1c2327, eye: 0x0a0c0d, band: [0x3a444a, 0x6a2a2a] }, // 3 deep-dark
  { body: 0x8b8f94, back: 0x6e7278, belly: 0xcdd3d2, head: 0x7a7e84, fin: 0x6e7278, eye: 0x141619, band: [0x9aa0a6, 0x444a50] }, // 4 grey
  { body: 0x4a5a5a, back: 0x38443f, belly: 0xd6d2c2, head: 0x44504e, fin: 0x38443f, eye: 0x0c0e0f, band: [0xb03030, 0x2c3836] }, // 5 red-ribbon
];

// Uniform readability scale so a 0.8m minnow reads like the old 4m capsule at
// fight distance without blowing up the boss (normalises ~2.6m rendered length).
export function readabilityScale(params: FishParams): number {
  const s = 2.6 / params.totalLength;
  return s < 1 ? 1 : s > 3.2 ? 3.2 : s;
}

// --- per-fish build -----------------------------------------------------------

export function buildFishRig(params: FishParams): FishRig {
  const n = params.spineSegments;
  const lengths = params.spineLengths;
  const pal = PALETTES[params.palette] ?? PALETTES[0]!;

  // spine joints (head toward +Z), centred on the fish's origin
  const segZ = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    segZ[i] = acc;
    acc += lengths[i] ?? 0.5;
  }
  segZ[n] = acc;
  const total = acc;
  const off = total / 2;
  for (let i = 0; i <= n; i++) segZ[i] = segZ[i]! - off;

  const baseRadius = total * 0.085;
  const noseLen = (lengths[n - 1] ?? 0.5) * 0.55;

  const bodyCount = (n + 1) * RING_RADIAL;
  const finCount = params.finPlacement.length;
  const eyeCount = params.eyeCount;
  const count = bodyCount + 2 + finCount * 3 + eyeCount * 4;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seg = new Uint8Array(count);
  const idx: number[] = [];

  const body = new THREE.Color(pal.body);
  const back = new THREE.Color(pal.back);
  const belly = new THREE.Color(pal.belly);
  const head = new THREE.Color(pal.head);
  const fin = new THREE.Color(pal.fin);
  const eyeC = new THREE.Color(pal.eye);
  const tmp = new THREE.Color();
  const bandColor = params.banding
    ? new THREE.Color(pal.band[params.banding.colorIdx % Math.max(1, pal.band.length)] ?? 0x889999)
    : null;

  let vi = 0; // vertex cursor
  const put = (x: number, y: number, z: number, c: THREE.Color, s: number): void => {
    pos[vi * 3] = x;
    pos[vi * 3 + 1] = y;
    pos[vi * 3 + 2] = z;
    col[vi * 3] = c.r;
    col[vi * 3 + 1] = c.g;
    col[vi * 3 + 2] = c.b;
    seg[vi] = s;
    vi++;
  };

  // body rings — each ring at a spine joint, radius from the girthCurve
  for (let i = 0; i < n; i++) {
    const r = (params.girthCurve[i] ?? 0.4) * baseRadius;
    const frac = i / n;
    for (let th = 0; th < RING_RADIAL; th++) {
      const a = (th / RING_RADIAL) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      // vertical belly blend: pale bottom (-Y) → body top (+Y)
      const t = Math.min(1, Math.max(0, (y / Math.max(1e-4, r) + 1) / 2));
      tmp.copy(belly).lerp(body, t);
      // longitudinal: tail darker → head closer to body
      tmp.lerp(back, (1 - frac) * 0.35);
      // banding (rungfish ladder / marens-fox ribbons)
      if (bandColor && params.banding && params.banding.period > 0) {
        const band = Math.floor(frac / params.banding.period) % 2;
        if (band === 1) tmp.lerp(bandColor, 0.55);
      }
      put(x, y, segZ[i]!, tmp, i);
    }
  }
  // nose ring (tapered head) — first ring is the tail at girth[0], head at n-1
  const headR = (params.girthCurve[n - 1] ?? 0.35) * baseRadius * 0.4;
  for (let th = 0; th < RING_RADIAL; th++) {
    const a = (th / RING_RADIAL) * Math.PI * 2;
    const x = Math.cos(a) * headR;
    const y = Math.sin(a) * headR;
    const t = Math.min(1, Math.max(0, (y / Math.max(1e-4, headR) + 1) / 2));
    tmp.copy(belly).lerp(head, t);
    put(x, y, segZ[n]!, tmp, n - 1);
  }
  const tailTip = vi;
  put(0, 0, segZ[0]! - 0.08, back, 0);
  const noseTip = vi;
  put(0, 0, segZ[n]! + noseLen, head, n - 1);

  // body triangles
  const tri = (a: number, b: number, c: number): void => {
    idx.push(a, b, c);
  };
  for (let th = 0; th < RING_RADIAL; th++) {
    const th2 = (th + 1) % RING_RADIAL;
    tri(tailTip, th, th2); // tail cap
    tri(n * RING_RADIAL + th2, n * RING_RADIAL + th, noseTip); // nose cap
  }
  for (let i = 0; i < n; i++) {
    const r0 = i * RING_RADIAL;
    const r1 = (i + 1) * RING_RADIAL;
    for (let th = 0; th < RING_RADIAL; th++) {
      const th2 = (th + 1) % RING_RADIAL;
      tri(r0 + th, r1 + th, r1 + th2);
      tri(r0 + th, r1 + th2, r0 + th2);
    }
  }

  // fins — flat triangles at their placements (kind picks the outward axis)
  const finBase = (placement: FinPlacement): { s: number; oz: number } => {
    const z = segZ[0]! + placement.at * total;
    let s = 0;
    while (s < n - 1 && segZ[s + 1]! <= z) s++;
    return { s, oz: z - segZ[s]! };
  };
  for (let f = 0; f < params.finPlacement.length; f++) {
    const pl = params.finPlacement[f]!;
    const { s, oz } = finBase(pl);
    const segLen = lengths[s] ?? 0.5;
    const rad = (params.girthCurve[s] ?? 0.4) * baseRadius;
    if (pl.kind === 'caudal') {
      const a = vi++;
      const b = vi++;
      const c = vi++;
      put(0, rad * 1.15, oz, fin, s);
      put(0, -rad * 1.15, oz, fin, s);
      put(0, 0, oz - segLen * 0.9, fin, s);
      tri(a, b, c);
      continue;
    }
    const width = segLen * 0.4;
    const extent = rad * 1.12 + pl.scale * segLen * 0.55;
    // outward axis per kind; pectorals alternate sides by fin index
    let ax = 0;
    let ay = 0;
    if (pl.kind === 'dorsal') ay = 1;
    else if (pl.kind === 'ventral') ay = -1;
    else if (pl.kind === 'ridge') ay = 1;
    else ax = f % 2 === 0 ? 1 : -1; // pectoral / default
    const a = vi++;
    const b = vi++;
    const c = vi++;
    put(ax * rad * 1.12, ay * rad * 1.12, oz, fin, s);
    put(ax * rad * 1.12, ay * rad * 1.12, oz + width, fin, s);
    put(ax * extent, ay * extent, oz + width / 2, fin, s);
    tri(a, b, c);
  }

  // eyes — small dark quads stuck to the head ring
  const headZ = segZ[n]!;
  const eyeRad = headR * 1.3;
  const eyeS = Math.max(0.02, params.eyeSize * headR * 2.4);
  const eyeAngles =
    eyeCount === 1 ? [Math.PI / 2] : eyeCount === 3 ? [Math.PI, 0, Math.PI / 2] : [Math.PI, 0];
  for (let e = 0; e < eyeCount; e++) {
    const theta = eyeAngles[e] ?? 0;
    const cx = Math.cos(theta) * eyeRad;
    const cy = Math.sin(theta) * eyeRad;
    const tanX = -Math.sin(theta);
    const tanY = Math.cos(theta);
    const a = vi++;
    const b = vi++;
    const c = vi++;
    const d = vi++;
    put(cx + tanX * eyeS, cy + tanY * eyeS, headZ - eyeS, eyeC, n - 1);
    put(cx - tanX * eyeS, cy - tanY * eyeS, headZ - eyeS, eyeC, n - 1);
    put(cx - tanX * eyeS, cy - tanY * eyeS, headZ + eyeS, eyeC, n - 1);
    put(cx + tanX * eyeS, cy + tanY * eyeS, headZ + eyeS, eyeC, n - 1);
    tri(a, b, c);
    tri(a, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, FISH_MATERIAL);
  const glow = params.glow ? new THREE.Mesh(geo, GLOW_MATERIAL) : null;

  return {
    params,
    mesh,
    glow,
    geo,
    basePos: new Float32Array(pos),
    segOfVertex: seg,
    segZ,
    count,
  };
}

export function disposeFishRig(rig: FishRig): void {
  rig.geo.dispose();
}