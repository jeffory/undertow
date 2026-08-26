// LANTERN — WORKER A OWNS THIS FILE.
// Player/boat point lantern: warm point light + tiny emissive lantern mesh +
// slow organic pulse (sum of two sines, not one obvious throb). Follows the
// boat each frame. Warm radius against the cool moon is the core image (plan
// 01 §3.2, T5). Vertex colors only, zero textures.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { BOW_OFFSET, LANTERN_BASE_RADIUS, lanternRadius } from '../game/darkness';

// Warm palette (spec 8.1: bone/teal water, sodium-amber accents here).
const LIGHT_COLOR = 0xffb45e; // warm amber
const BULB_COLOR = 0xffd9a0; // hot core

let light: THREE.PointLight | null = null;
let bulb: THREE.Mesh | null = null;
let halo: THREE.Sprite | null = null;

// Soft radial glow billboard around the bulb — the concept carries much of its
// bright-value budget in the lantern's warm halo, not just the pinpoint core
// (TODO.md luma balance). Additive over the near-black water.
function makeHalo(): THREE.Sprite {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 64;
  const g = cnv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 250, 230, 1.0)');
  grad.addColorStop(0.12, 'rgba(255, 244, 205, 0.85)');
  grad.addColorStop(0.3, 'rgba(255, 214, 140, 0.45)');
  grad.addColorStop(0.6, 'rgba(255, 180, 94, 0.16)');
  grad.addColorStop(1, 'rgba(255, 180, 94, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cnv),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(2.2);
  return s;
}

export function initLantern(scene: THREE.Scene): void {
  // Physical-ish point light: warm, tight decay so the glow pool is readable.
  // distance ~16 units, decay 2 gives a fast falloff — a small warm pool on the
  // water, not a flood. Base intensity tuned for modern three physical units.
  //
  // M8 (plan 05 §2.3): the distance is no longer a literal — it is
  // `lanternRadiusFor(bowLantern)` (game/darkness.ts), the SINGLE number that
  // also decides where the Choir's cue gate stops drawing and where the
  // Whistler's roam clamp holds it. updateLantern re-applies it every frame so a
  // Chandlery upgrade bought mid-session widens the light without a rebuild.
  light = new THREE.PointLight(LIGHT_COLOR, 5.0, LANTERN_BASE_RADIUS, 2);
  light.name = 'lantern:light'; // the gate reads its `distance` back by name
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
  bulb.name = 'lantern:bulb';
  scene.add(bulb);

  halo = makeHalo();
  halo.name = 'lantern:halo';
  scene.add(halo);
}

export function updateLantern(world: WorldState, dt: number): void {
  if (!light || !bulb) return;
  void dt;

  // Follow the boat in boat mode (M0); on foot (M1) the lantern rides with the
  // player, hovering above the keeper's head like a carried lamp.
  const foot = world.mode === 'foot';
  // Boat: the lantern hangs at the BOW, ahead of the keeper — so the keeper
  // reads as a dark shape against his own light and the glow pool leads the
  // boat (USER art direction). Foot: carried at head height as before.
  const b = world.boat;
  const bowX = b.x + Math.sin(b.heading) * BOW_OFFSET;
  const bowZ = b.z + Math.cos(b.heading) * BOW_OFFSET;
  const x = foot ? world.player.x : bowX;
  const z = foot ? world.player.z : bowZ;
  const y = foot ? 1.7 : b.y + 0.85;
  // THE radius (05 §2.3): the Chandlery's bow lantern, read live.
  light.distance = lanternRadius(world);
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
  if (halo) {
    halo.position.copy(bulb.position);
    halo.material.opacity = 0.75 + 0.25 * (pulse - 0.82) / 0.22;
    halo.scale.setScalar(2.2 * (0.92 + 0.12 * breath));
  }
}
