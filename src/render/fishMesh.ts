// FISH MESH (render) — M4 round 2: the LOOK. Round 1 shipped the mechanics but
// the fish read as "limp grey-white tubes": thin lathes, fin triangles that
// referenced never-written vertices (invisible), zero-area eye quads, flat grey
// palettes. This round reworks fishMesh to the crawler_creature_concept bar — a
// rich dark-teal dorsal grading to a pale cream belly (soft blend band at the
// lateral line), real flat fins with area (forked caudal + dorsal + a pectoral
// PAIR per placement), a glassy dark eye with a pale rim, and per-species
// girthCurve character (deep-bodied carp, slender tapered pike, stubby minnow).
// Silhouette + colour come from the tested params; nothing here feeds game logic.
//
// three only here — never imported by game logic.

import * as THREE from 'three';
import type { FishParams } from '../gen/fishParams';
import type { FinPlacement, Rarity } from '../gen/fishParams';

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
// DoubleSide: the fins are flat single-quad/tri sheets in the Y-Z plane —
// front-face culling made every dorsal/pectoral fin invisible from one flank.
export const FISH_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
});
FISH_MATERIAL.emissive.setRGB(1, 0.25, 0.2);
FISH_MATERIAL.emissiveIntensity = 0;

const GLOW_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.45,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Shallows palette registry (plan 8.1, crawler_creature_concept). Every entry
// is a TWO-TONE fish: a dark saturated dorsal `back`, a mid `body`, a pale
// cream `belly`, a `head` cap, a pale translucent `fin`, a dark glassy `eye`.
// Four variants across the roster (teal / olive-bronze / silver-blue / pale
// sickly) plus the red-ribbon Maren's Fox and the boss's deep-dark.
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
  // 0 teal — the Shallows staple (dark teal-green dorsal, cream belly)
  { body: 0x2f7a6f, back: 0x123f3d, belly: 0xe6e8cf, head: 0x1f5c54, fin: 0x9dbfae, eye: 0x0a0d0e, band: [0x9fbc86, 0x3f8a72] },
  // 1 olive-bronze — muddy rollers, bronze-scaled carp
  { body: 0x6f6a3a, back: 0x3c3a1c, belly: 0xe4dcbc, head: 0x4d4a26, fin: 0xc3bd92, eye: 0x0c0d0a, band: [0xb8a86a, 0x5a5a2e] },
  // 2 silver-blue — pale banded shiners, metallic bream
  { body: 0x4a7a8a, back: 0x1d3c4a, belly: 0xdce8e6, head: 0x2f5a68, fin: 0xa8c6c4, eye: 0x0b0d10, band: [0x8fb6ba, 0x2e5a66] },
  // 3 pale sickly — the rare+ unnerving pale variant (spoonworm)
  { body: 0x5f8a6a, back: 0x2e4a38, belly: 0xd8e2ca, head: 0x3d5f4a, fin: 0xacd0b2, eye: 0x0c0e0d, band: [0x8fba96, 0x4a7a58] },
  // 4 red-ribbon — Maren's Fox, the only red in the Shallows (pale sickly base)
  { body: 0x8a5a46, back: 0x4a2a22, belly: 0xe6d8c6, head: 0x5f3a2e, fin: 0xcfb8a6, eye: 0x0d0b0c, band: [0x9e3a2a, 0x4a5f52] },
  // 5 deep-dark — the old-pike boss, near-black teal
  { body: 0x2c4a4e, back: 0x101f22, belly: 0x8a9c96, head: 0x1c3438, fin: 0x5f8a84, eye: 0x050607, band: [0x3f6666, 0x6e3a2a] },
];

// Rarity tone: higher rarities darken the dorsal and saturate the mid — the
// rare+ of the Shallows look richer, deeper, more poisonous.
const RARITY_TONE: Record<Rarity, { deep: number; sat: number }> = {
  C: { deep: 0, sat: 0 },
  U: { deep: 0.06, sat: 0.05 },
  R: { deep: 0.13, sat: 0.1 },
  E: { deep: 0.2, sat: 0.16 },
  Boss: { deep: 0.28, sat: 0.12 },
};

// Uniform readability scale so a 0.8m minnow reads like the old 4m capsule at
// fight distance without blowing up the boss (normalises ~2.6m rendered length).
export function readabilityScale(params: FishParams): number {
  const s = 2.6 / params.totalLength;
  return s < 1 ? 1 : s > 3.2 ? 3.2 : s;
}

// Body thickness as a fraction of total length — raised from the M1 0.085 so
// the flat-shaded lathe has real volume (carp depth/length ≈ 0.35, pike ≈ 0.2).
const BASE_RADIUS_FRAC = 0.13;
// The head ring is smaller than the body — a blunt jaw hint before the snout.
const HEAD_RATIO = 0.78;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(x: number, e0: number, e1: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function saturateColor(c: THREE.Color, amt: number): void {
  if (amt <= 0) return;
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s + amt), hsl.l);
}

// --- per-fish build -----------------------------------------------------------

export function buildFishRig(params: FishParams): FishRig {
  const n = params.spineSegments;
  const lengths = params.spineLengths;
  const pal = PALETTES[params.palette] ?? PALETTES[0]!;

  // rarity tone deepens/saturates the palette in place
  const tone = RARITY_TONE[params.rarity] ?? { deep: 0, sat: 0 };
  const dorsal = new THREE.Color(pal.back).multiplyScalar(1 - tone.deep * 0.45);
  const body = new THREE.Color(pal.body);
  body.lerp(dorsal, tone.deep * 0.4);
  saturateColor(body, tone.sat);
  const belly = new THREE.Color(pal.belly);
  belly.lerp(new THREE.Color(0xf4f2dc), tone.deep * 0.12);
  const head = new THREE.Color(pal.head);
  const fin = new THREE.Color(pal.fin);
  const finTint = fin.clone().lerp(belly, 0.45); // pale translucent-looking
  const eyeC = new THREE.Color(pal.eye);
  const eyeRim = fin.clone().lerp(new THREE.Color(0xf2efe0), 0.7);

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

  const baseRadius = total * BASE_RADIUS_FRAC;

  // head / snout profile (head ring smaller than body + a jaw hint)
  const headGirth = params.girthCurve[n - 1] ?? 0.4;
  const headR = headGirth * baseRadius * HEAD_RATIO;
  const snout = params.snout ?? 0.5;
  const snoutLen = (lengths[n - 1] ?? 0.5) * (0.55 + snout * 0.95);
  const jawDrop = params.jawSplit * headR * 0.45;

  // ring layout: body rings 0..n-1 (girthCurve), head ring n, snout mid ring n+1
  const ringZ: number[] = [];
  const ringR: number[] = [];
  const ringSeg: number[] = [];
  for (let i = 0; i < n; i++) {
    ringZ.push(segZ[i]!);
    ringR.push((params.girthCurve[i] ?? 0.4) * baseRadius);
    ringSeg.push(i);
  }
  ringZ.push(segZ[n]!);
  ringR.push(headR);
  ringSeg.push(n - 1);
  ringZ.push(segZ[n]! + snoutLen * 0.55);
  ringR.push(headR * 0.55);
  ringSeg.push(n - 1);
  const rings = ringZ.length; // n + 2

  // fin vertex budget (caudal fork 5, dorsal/ventral tri 3, ridge quad 4,
  // pectoral pair 6) + eye budget (8 per eye)
  let finVerts = 0;
  for (const pl of params.finPlacement) {
    finVerts += pl.kind === 'caudal' ? 5 : pl.kind === 'ridge' ? 4 : pl.kind === 'pectoral' ? 6 : 3;
  }
  const eyeCount = params.eyeCount;
  const count = rings * RING_RADIAL + 2 + finVerts + eyeCount * 8;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seg = new Uint8Array(count);
  const idx: number[] = [];

  const tmp = new THREE.Color();
  const bandColor = params.banding
    ? new THREE.Color(pal.band[params.banding.colorIdx % Math.max(1, pal.band.length)] ?? 0x889999)
    : null;

  let vi = 0; // vertex cursor — put() writes at vi then advances it
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
  // write into a pre-reserved vertex slot without touching the cursor
  const putAt = (i: number, x: number, y: number, z: number, c: THREE.Color, s: number): void => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    seg[i] = s;
  };
  // reserve `k` vertex slots, returning the base index (write them with putAt)
  const slot = (k: number): number => {
    const base = vi;
    vi += k;
    return base;
  };

  // two-tone ring colour: pale cream belly below the lateral line, dark dorsal
  // above, a soft blend band at the seam, head-cap darkening toward the nose.
  const ringColor = (s: number, frac: number): THREE.Color => {
    const k = smoothstep(s, -0.55, 0.1); // 0 = belly (underside only), 1 = dorsal
    tmp.copy(belly).lerp(dorsal, k);
    const band = 1 - Math.abs(s + 0.25) / 0.5;
    if (band > 0) tmp.lerp(body, band * 0.4 * (0.35 + 0.65 * k));
    tmp.lerp(head, frac * 0.15 * k); // head darkening, dorsal side only
    tmp.lerp(dorsal, (1 - frac) * 0.1 * k); // tail darkening, dorsal side only
    if (frac > 0.86) {
      const hk = smoothstep(frac, 0.86, 1);
      tmp.lerp(head, hk * (0.3 + 0.45 * k)); // head cap
    }
    if (bandColor && params.banding && params.banding.period > 0) {
      const bandI = Math.floor(frac / params.banding.period) % 2;
      if (bandI === 1) tmp.lerp(bandColor, 0.5);
    }
    return tmp;
  };

  // rings
  const ringBase: number[] = [];
  for (let k = 0; k < rings; k++) {
    ringBase.push(vi);
    const r = ringR[k]!;
    const z = ringZ[k]!;
    const frac = clamp((z - segZ[0]!) / total, 0, 1.15);
    for (let th = 0; th < RING_RADIAL; th++) {
      const a = (th / RING_RADIAL) * Math.PI * 2;
      put(Math.cos(a) * r, Math.sin(a) * r, z, ringColor(r > 1e-4 ? Math.sin(a) : 0, frac), ringSeg[k]!);
    }
  }
  const tailTip = vi;
  put(0, 0, segZ[0]! - 0.015, dorsal, 0); // tiny peduncle closure (no stump)
  const noseTip = vi;
  put(0, -jawDrop, segZ[n]! + snoutLen, new THREE.Color(head).multiplyScalar(0.7), n - 1);

  const tri = (a: number, b: number, c: number): void => {
    idx.push(a, b, c);
  };
  // tail cap (peduncle → point)
  for (let th = 0; th < RING_RADIAL; th++) {
    const th2 = (th + 1) % RING_RADIAL;
    tri(tailTip, ringBase[0]! + th, ringBase[0]! + th2);
  }
  // ring-to-ring bands (body → head ring → snout mid)
  for (let k = 0; k < rings - 1; k++) {
    const r0 = ringBase[k]!;
    const r1 = ringBase[k + 1]!;
    for (let th = 0; th < RING_RADIAL; th++) {
      const th2 = (th + 1) % RING_RADIAL;
      tri(r0 + th, r1 + th, r1 + th2);
      tri(r0 + th, r1 + th2, r0 + th2);
    }
  }
  // nose cap (snout mid → tip)
  for (let th = 0; th < RING_RADIAL; th++) {
    const th2 = (th + 1) % RING_RADIAL;
    tri(ringBase[rings - 1]! + th2, ringBase[rings - 1]! + th, noseTip);
  }

  // fins — flat, pale, with real area at their placements (kind picks the axis)
  const finBase = (placement: FinPlacement): { s: number; oz: number } => {
    const z = segZ[0]! + placement.at * total;
    let s = 0;
    while (s < n - 1 && segZ[s + 1]! <= z) s++;
    return { s, oz: z - segZ[s]! };
  };
  for (let f = 0; f < params.finPlacement.length; f++) {
    const pl = params.finPlacement[f]!;
    const { s, oz } = finBase(pl);
    // absolute z along the body: fins were previously placed at the LOCAL
    // segment offset (~0..0.5), collapsing every fin to mid-body.
    const zf = segZ[s]! + oz;
    const segLen = lengths[s] ?? 0.5;
    const rad = (params.girthCurve[s] ?? 0.4) * baseRadius;

    if (pl.kind === 'caudal') {
      // forked tail fin flaring from the thin peduncle
      const r0 = Math.max(0.02, rad);
      const finH = baseRadius * (1.9 + pl.scale * 0.9);
      const finLen = baseRadius * (1.55 + pl.scale * 0.8);
      const a = slot(5);
      putAt(a, 0, r0 * 1.05, zf, finTint, s);
      putAt(a + 1, 0, -r0 * 1.05, zf, finTint, s);
      putAt(a + 2, 0, finH, zf - finLen, finTint, s);
      putAt(a + 3, 0, -finH, zf - finLen, finTint, s);
      putAt(a + 4, 0, 0, zf - finLen * 0.55, finTint, s);
      tri(a, a + 1, a + 4);
      tri(a, a + 4, a + 2);
      tri(a + 1, a + 3, a + 4);
      continue;
    }
    if (pl.kind === 'ridge') {
      // low continuous dorsal ridge (spoonworm)
      const l = segLen * 1.3;
      const h = baseRadius * 0.55;
      const a = slot(4);
      putAt(a, 0, rad * 1.1, zf - l, finTint, s);
      putAt(a + 1, 0, rad * 1.1, zf + l, finTint, s);
      putAt(a + 2, 0, rad * 1.1 + h, zf + l, finTint, s);
      putAt(a + 3, 0, rad * 1.1 + h, zf - l, finTint, s);
      tri(a, a + 1, a + 2);
      tri(a, a + 2, a + 3);
      continue;
    }
    if (pl.kind === 'pectoral') {
      // a PAIR of flat side fins (one per side) so every fish shows two
      const width = segLen * 0.55;
      const extent = baseRadius * (1.7 + pl.scale * 1.2);
      const a = slot(6);
      putAt(a, rad * 1.1, 0, zf, finTint, s);
      putAt(a + 1, rad * 1.1, 0, zf - width, finTint, s);
      putAt(a + 2, rad * 1.1 + extent, -baseRadius * 0.18, zf - width * 0.5, finTint, s);
      putAt(a + 3, -rad * 1.1, 0, zf, finTint, s);
      putAt(a + 4, -rad * 1.1, 0, zf - width, finTint, s);
      putAt(a + 5, -(rad * 1.1 + extent), -baseRadius * 0.18, zf - width * 0.5, finTint, s);
      tri(a, a + 1, a + 2);
      tri(a + 3, a + 4, a + 5);
      continue;
    }
    // dorsal / ventral — a swept triangle fin
    const down = pl.kind === 'ventral' ? -1 : 1;
    const height = baseRadius * (2.1 + pl.scale * 1.3);
    const w = segLen * 0.7;
    const a = slot(3);
    putAt(a, 0, down * rad * 1.1, zf - w / 2, finTint, s);
    putAt(a + 1, 0, down * rad * 1.1, zf + w / 2, finTint, s);
    putAt(a + 2, 0, down * (rad * 1.1 + height), zf - w * 0.2, finTint, s);
    tri(a, a + 1, a + 2);
  }

  // eyes — a dark glassy pupil with a pale rim, proud of the head ring
  if (eyeCount > 0) {
    // just behind the head ring — an eye forward on the snout reads as a nose
    const eyeZ = segZ[n]! - snoutLen * 0.2;
    const eyeRad = headR * 1.08;
    // Eye size is proportional to the HEAD, never absolute: the old 0.09 m
    // floor exceeded small species' entire head radius and rendered as a giant
    // box frame swallowing the face.
    const eyeS = headR * clamp(params.eyeSize * 2.2, 0.24, 0.48);
    // slightly above the midline, like a real fish — not on the equator
    const eyeAngles =
      eyeCount === 1
        ? [Math.PI / 2]
        : eyeCount === 3
          ? [Math.PI * 0.9, Math.PI * 0.1, Math.PI / 2]
          : [Math.PI * 0.9, Math.PI * 0.1];
    for (let e = 0; e < eyeCount; e++) {
      const theta = eyeAngles[e] ?? 0;
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const ux = -ny;
      const uy = nx;
      const px = nx * eyeRad + nx * eyeS * 0.45;
      const py = ny * eyeRad + ny * eyeS * 0.45;
      const q = eyeS * 1.55;
      // diamond (45°-rotated) quads — a square rim read as a picture frame;
      // the diamond matches the game's low-poly language and reads organic
      const rim = slot(4);
      putAt(rim, px + ux * q, py + uy * q, eyeZ, eyeRim, n - 1);
      putAt(rim + 1, px, py, eyeZ - q, eyeRim, n - 1);
      putAt(rim + 2, px - ux * q, py - uy * q, eyeZ, eyeRim, n - 1);
      putAt(rim + 3, px, py, eyeZ + q, eyeRim, n - 1);
      const pupil = slot(4);
      putAt(pupil, px + ux * eyeS, py + uy * eyeS, eyeZ, eyeC, n - 1);
      putAt(pupil + 1, px, py, eyeZ - eyeS, eyeC, n - 1);
      putAt(pupil + 2, px - ux * eyeS, py - uy * eyeS, eyeZ, eyeC, n - 1);
      putAt(pupil + 3, px, py, eyeZ + eyeS, eyeC, n - 1);
      tri(rim, rim + 1, pupil + 1);
      tri(rim, pupil + 1, pupil);
      tri(rim + 1, rim + 2, pupil + 2);
      tri(rim + 1, pupil + 2, pupil + 1);
      tri(rim + 2, rim + 3, pupil + 3);
      tri(rim + 2, pupil + 3, pupil + 2);
      tri(rim + 3, rim, pupil);
      tri(rim + 3, pupil, pupil + 3);
      tri(pupil, pupil + 1, pupil + 2);
      tri(pupil, pupil + 2, pupil + 3);
    }
  }

  if (vi !== count) throw new Error(`fishMesh vertex budget mismatch: emitted ${vi}, counted ${count}`);

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