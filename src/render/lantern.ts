// LANTERN — WORKER A OWNS THIS FILE.
// Player/boat point lantern: warm point light + tiny emissive lantern mesh +
// slow organic pulse (sum of two sines, not one obvious throb). Follows the
// boat each frame. Warm radius against the cool moon is the core image (plan
// 01 §3.2, T5). Vertex colors only, zero textures.

import * as THREE from 'three';
import type { WorldState } from '../core/world';

// Warm palette (spec 8.1: bone/teal water, sodium-amber accents here).
const LIGHT_COLOR = 0xffb45e; // warm amber
const BULB_COLOR = 0xffd9a0; // hot core

let light: THREE.PointLight | null = null;
let bulb: THREE.Mesh | null = null;

export function initLantern(scene: THREE.Scene): void {
  // Physical-ish point light: warm, tight decay so the glow pool is readable.
  // distance ~16 units, decay 2 gives a fast falloff — a small warm pool on the
  // water, not a flood. Base intensity tuned for modern three physical units.
  light = new THREE.PointLight(LIGHT_COLOR, 5.0, 16, 2);
  scene.add(light);

  // Tiny emissive lantern mesh — vertex-colored octahedron reads as a lamp
  // from any angle. No texture.
  const geo = new THREE.OctahedronGeometry(0.16, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(BULB_COLOR);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true }); // emissive, ignores light
  bulb = new THREE.Mesh(geo, mat);
  scene.add(bulb);
}

export function updateLantern(world: WorldState, dt: number): void {
  if (!light || !bulb) return;
  void dt;

  // Follow the boat in boat mode (M0); on foot (M1) the lantern rides with the
  // player, hovering above the keeper's head like a carried lamp.
  const foot = world.mode === 'foot';
  const x = foot ? world.player.x : world.boat.x;
  const z = foot ? world.player.z : world.boat.z;
  const y = foot ? 1.7 : world.boat.y + 0.7;
  light.position.set(x, y, z);
  bulb.position.set(x, y, z);
  // Gentle bob so the lantern rides the boat's motion.
  const t = world.time.elapsed;
  bulb.position.y += Math.sin(t * 1.3) * 0.02;

  // Slow organic pulse: two incommensurate sines summed — a low fundamental
  // (breath) and a faster, weaker overtone. Reads alive, not like a strobe.
  const breath = 0.5 + 0.5 * Math.sin(t * 1.6);
  const flutter = 0.5 + 0.5 * Math.sin(t * 4.1 + 1.3);
  const pulse = 0.82 + 0.16 * breath + 0.06 * flutter; // ~0.82..1.04
  light.intensity = 5.0 * pulse;
}
