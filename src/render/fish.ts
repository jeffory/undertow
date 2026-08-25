// FISH (render) — M4 round 1: the species mesh replaces the M1 capsule
// (plan 04 §3.2, §8.2). initFish(scene) is called at renderer boot;
// updateFishMesh(world, dt) each display frame reads world.fish.params and
// rebuilds the rig when the species changes, then CPU-bends the lathed capsule
// per segment (positions from the spine curve — same cost as the M1 fish), rolls
// the corpse belly-up from deadTilt, adds the exhaustion belly-tilt, and flashes
// an emissive overlay while hitFlash > 0. One shared material, one draw call per
// fish; glow species get a second additive pass on the same geometry. Renders in
// both boat and foot modes (the M4 fight is a boat fight). All three.js imports
// live here, never in game logic.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { groundYAt } from './lake';
import { HIT_FLASH_DURATION } from '../game/fish';
import { buildFishRig, disposeFishRig, readabilityScale, FISH_MATERIAL, WATER_FISH_Y, type FishRig } from './fishMesh';

let outer: THREE.Group | null = null; // yaw (facing) + position + scale
let inner: THREE.Group | null = null; // roll (belly-up flop + exhaustion tilt)
let rig: FishRig | null = null;
let rigFor: FishRig['params'] | null = null; // reference the current rig was built from

export function initFish(scene: THREE.Scene): void {
  inner = new THREE.Group();
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false; // hidden until a fish spawns
  scene.add(outer);
}

// CPU sine-spine bend: accumulated joint angles along the spine, each template
// vertex rotated about its joint (cross-section in X/Y, spine along Z, head +Z).
function bendRig(r: FishRig, fish: WorldState['fish']): void {
  if (!fish) return;
  const n = fish.spine.length;
  if (r.segZ.length !== n + 1) return; // spine resized under us — rebuild next frame

  const posAttr = r.geo.attributes.position as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;

  const th = new Float32Array(n);
  let ang = 0;
  for (let i = 0; i < n; i++) {
    th[i] = ang;
    ang += fish.spine[i] ?? 0;
  }

  const jx = new Float32Array(n + 1);
  const jz = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const dz = r.segZ[i]! - r.segZ[i - 1]!;
    const a = th[i - 1]!;
    jx[i] = jx[i - 1]! + dz * Math.sin(a);
    jz[i] = jz[i - 1]! + dz * Math.cos(a);
  }

  const base = r.basePos;
  const segOf = r.segOfVertex;
  const count = r.count;
  for (let v = 0; v < count; v++) {
    const s = segOf[v]!;
    const bx = base[v * 3]!;
    const by = base[v * 3 + 1]!;
    const bz = base[v * 3 + 2]!;
    const oz = bz - r.segZ[s]!; // offset from the joint along the spine
    const a = th[s]!;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pos[v * 3] = jx[s]! + bx * ca + oz * sa;
    pos[v * 3 + 1] = by;
    pos[v * 3 + 2] = jz[s]! + -bx * sa + oz * ca;
  }
  posAttr.needsUpdate = true;
  r.geo.computeVertexNormals();
  const normal = r.geo.attributes.normal;
  if (normal) normal.needsUpdate = true;
  r.geo.computeBoundingSphere();
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

export function updateFishMesh(world: WorldState, _dt: number): void {
  if (!outer || !inner) return;

  const fish = world.fish;
  const visible = fish !== null;
  outer.visible = visible;
  if (!visible) {
    clearRig();
    return;
  }

  // Rebuild the rig when the species params change (new SET / land-fish spawn).
  const params = fish!.params;
  if (params !== rigFor) {
    clearRig();
    if (params) {
      rig = buildFishRig(params);
      rigFor = params;
      inner.add(rig.mesh);
      if (rig.glow) inner.add(rig.glow);
    }
  }
  if (!rig || !rigFor) return;

  const y = world.mode === 'boat' ? WATER_FISH_Y : groundYAt(world, fish!.x, fish!.z) + 0.35;
  outer.position.set(fish!.x, y, fish!.z);
  outer.scale.setScalar(readabilityScale(rigFor));
  outer.rotation.y = fish!.facing;

  // belly-up flop roll (deadTilt 0→1) + the exhaustion belly-tilt telegraph
  inner.rotation.z = fish!.deadTilt * Math.PI + fish!.exhaustTilt;

  // hurt flash: emissive overlay scaled by remaining flash time
  FISH_MATERIAL.emissiveIntensity = Math.min(1, fish!.hitFlash / HIT_FLASH_DURATION) * 0.9;

  bendRig(rig, fish);
}