// THE SNATCHER — render (M7, plan 05 §2.2). Two objects, no new asset:
//
//   1. THE BODY reuses the FISH PIPELINE, whole. `enemies/snatcher.ts` stores a
//      real FishParams on the state (generated at spawn from the
//      'gallows-snatcher' species preset, exactly the way the Dragger preset is
//      generated for a boat fight), and this module builds it with the same
//      `buildFishRig` / `readabilityScale` / `bendFishRig` the hooked catch is
//      drawn with. One extra draw call while one is on the water, none
//      otherwise. There is no snatcher mesh, no snatcher material and no
//      snatcher geometry in this file — that is the point.
//
//   2. THE APPROACH WAKE reuses the WAKE POOL (core/wake.ts) — the same pure
//      world-space particle pool the boat leaves behind, driven by the
//      Snatcher's own position/heading/speed. Wake particles belong to the
//      world, not to their emitter, so a Snatcher closing on your catch drags a
//      widening V behind it and the V stays where the water was. When it
//      latches, its speed drops and the pool stops emitting on its own — the
//      telegraph ends exactly when the threat arrives.
//
// The spine is animated HERE, off the render clock, because it is presentation:
// the sim owns where the animal is, never how it wriggles.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { createWake, stepWake, WAKE_POOL } from '../core/wake';
import { buildFishRig, disposeFishRig, readabilityScale, WATER_FISH_Y, type FishRig } from './fishMesh';
import { bendFishRig } from './fish';
import { groundYAt } from './lake';
import { attenuatedWaterHeightAt } from '../core/shore';
import type { FishParams } from '../gen/fishParams';

let outer: THREE.Group | null = null; // yaw + position + scale
let inner: THREE.Group | null = null; // roll (the death flop)
let rig: FishRig | null = null;
let rigFor: FishParams | null = null;
let wake: THREE.Points | null = null;
const wakeState = createWake();
let spine = new Float32Array(0);
let clock = 0;

// The wake reads slightly warmer than the boat's — sodium lamps over a black
// street, and a thing you are supposed to notice.
const WAKE_R = 0.72;
const WAKE_G = 0.6;
const WAKE_B = 0.44;

function makeWake(): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAKE_POOL * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(WAKE_POOL * 3), 3));
  // the same 32px radial splat the boat wake uses — bare Points read as squares
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const g2d = cnv.getContext('2d')!;
  const grad = g2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2d.fillStyle = grad;
  g2d.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    map: new THREE.CanvasTexture(cnv),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'snatcher:wake';
  return pts;
}

export function initSnatcher(scene: THREE.Scene): void {
  inner = new THREE.Group();
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false;
  outer.name = 'snatcher:root';
  scene.add(outer);
  // The wake lives at SCENE level in world space (core/wake.ts bug B3): a wake
  // parented to its emitter cannot read as a wake under any tuning.
  wake = makeWake();
  scene.add(wake);
}

function clearRig(): void {
  if (rig) {
    if (inner) {
      inner.remove(rig.mesh);
      if (rig.glow) inner.remove(rig.glow);
    }
    disposeFishRig(rig);
    rig = null;
    rigFor = null;
  }
}

// Probe/gate readout: what the second mouth costs right now.
export function snatcherRenderState(): {
  body: boolean;
  draws: number;
  wakeParticles: number;
} {
  let live = 0;
  for (const p of wakeState.parts) if (p.age < p.life) live++;
  const bodyDraws = rig ? 1 + (rig.glow ? 1 : 0) : 0;
  return {
    body: !!rig && !!outer && outer.visible,
    draws: (outer && outer.visible ? bodyDraws : 0) + (wake && wake.visible ? 1 : 0),
    wakeParticles: live,
  };
}

export function updateSnatcher(world: WorldState, dt: number): void {
  if (!outer || !inner) return;
  const s = world.snatcher;
  clock += dt;

  const visible = s.phase !== 'idle' && s.params !== null;
  outer.visible = visible;

  if (!visible) {
    clearRig();
    // the pool still decays in place — a wake outlives the thing that made it
    stepWake(wakeState, { x: s.x, z: s.z, heading: s.facing, speed: 0 }, dt);
    writeWake(world, dt);
    return;
  }

  const params = s.params!;
  if (params !== rigFor) {
    clearRig();
    rig = buildFishRig(params);
    rigFor = params;
    spine = new Float32Array(params.spineSegments);
    inner.add(rig.mesh);
    if (rig.glow) inner.add(rig.glow);
  }
  if (!rig || !rigFor) return;

  const y = world.mode === 'boat' ? WATER_FISH_Y : groundYAt(world, s.x, s.z) + 0.35;
  outer.position.set(s.x, y, s.z);
  outer.scale.setScalar(readabilityScale(rigFor));
  outer.rotation.y = s.facing;
  // a killed Snatcher rolls over as it drifts off — the same belly-up read the
  // catch has, on the same inner roll group
  inner.rotation.z = s.phase === 'dying' ? Math.min(1, (1.4 - s.dying) / 0.6) * Math.PI : 0;

  // The wriggle: a travelling sine down the spine, faster and deeper than a
  // catch's because the preset says so (swimFreq 3.4 / swimAmp 0.85).
  const amp = rigFor.swimAmp * 0.16;
  for (let i = 0; i < spine.length; i++) {
    spine[i] = Math.sin(clock * rigFor.swimFreq - i * 0.55) * amp;
  }
  bendFishRig(rig, spine);

  // THE APPROACH WAKE — the pool only emits above its own speed threshold, so
  // an approaching Snatcher trails one and a latched one does not.
  stepWake(wakeState, { x: s.x, z: s.z, heading: s.facing, speed: s.speed }, dt);
  writeWake(world, dt);
}

function writeWake(world: WorldState, _dt: number): void {
  if (!wake) return;
  // An empty pool is not drawn at all: outside zone 3 (and between Snatchers)
  // this object costs nothing, not even the parked-particle draw call.
  let live = 0;
  for (const p of wakeState.parts) if (p.age < p.life) live++;
  wake.visible = live > 0;
  if (live === 0) return;
  const t = world.time.elapsed;
  const islets = world.lake ? world.lake.islets : [];
  const geo = wake.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < wakeState.parts.length; i++) {
    const p = wakeState.parts[i]!;
    if (p.age >= p.life) {
      pos.setXYZ(i, 0, -999, 0);
      col.setXYZ(i, 0, 0, 0);
      continue;
    }
    // ride the shore-attenuated swell the water shader renders (the boat wake's
    // own rule) so the V sits ON the surface wherever the particle drifted to
    pos.setXYZ(i, p.x, attenuatedWaterHeightAt(islets, p.x, p.z, t) + 0.07, p.z);
    const fade = 1 - p.age / p.life;
    const a = fade * fade * 0.6;
    col.setXYZ(i, WAKE_R * a, WAKE_G * a, WAKE_B * a);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}
