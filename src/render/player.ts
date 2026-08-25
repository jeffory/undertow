// PLAYER — M1 scaffold: a low-poly keeper figure (capsule torso + head + limbs,
// ~140 tris, vertex colours only, no textures). Positioned/rotated from
// world.player each frame; shown only in foot mode. A brief roll hook tilts and
// spins the figure while world.player.dodge.active — the real roll animation is
// WORKER A's job (controller), this is just a readable placeholder. The figure
// faces +Z in local space so rotation.y = world.player.facing matches the
// movement convention (facing 0 = +Z, +PI/2 = +X).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { GROUND_Y } from './ground';

const DODGE_DURATION = 0.25; // seconds; matches the 0.25s i-frame roll window

// --- palette (dark keeper: coat, head, hands) ---------------------------------
const COAT = 0x3a4a5a; // deep keeper blue-grey
const COAT_DARK = 0x2a3644; // limbs
const HEAD = 0x7a5a42; // weathered skin
const BOOTS = 0x1e1a16; // near-black boots

let group: THREE.Group | null = null;

// Paint a geometry a single flat colour (flat shading via MeshLambertMaterial).
function tint(geo: THREE.BufferGeometry, color: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function limb(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0); // origin at the joint/floor end
  return geo;
}

export function initPlayer(scene: THREE.Scene): void {
  group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  // torso — low-poly capsule
  const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.62, 2, 6);
  tint(torsoGeo, COAT);
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.position.y = 0.82;
  group.add(torso);

  // head
  const headGeo = new THREE.BoxGeometry(0.32, 0.3, 0.32);
  tint(headGeo, HEAD);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 1.38;
  group.add(head);

  // arms — hanging at the sides
  for (const side of [-1, 1] as const) {
    const armGeo = limb(0.12, 0.62, 0.12);
    tint(armGeo, COAT_DARK);
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.set(side * 0.34, 0.62, 0);
    group.add(arm);
  }

  // legs
  for (const side of [-1, 1] as const) {
    const legGeo = limb(0.14, 0.42, 0.14);
    tint(legGeo, BOOTS);
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(side * 0.12, 0.0, 0);
    group.add(leg);
  }

  group.position.y = GROUND_Y;
  group.visible = false; // foot mode only
  scene.add(group);
}

export function updatePlayer(world: WorldState, dt: number): void {
  if (!group) return;
  void dt;

  const foot = world.mode === 'foot';
  group.visible = foot;
  if (!foot) return;

  const p = world.player;
  group.position.x = p.x;
  group.position.z = p.z;
  group.rotation.y = p.facing;

  // Roll hook: while dodge.active, tilt the figure sideways and spin it once
  // around the roll axis, reading as a tumble. Progress runs 0→1 over the roll.
  if (p.dodge.active) {
    const rollT = 1 - Math.min(Math.max(p.dodge.timeLeft / DODGE_DURATION, 0), 1);
    group.rotation.z = Math.sin(rollT * Math.PI) * 0.9;
    group.rotation.y = p.facing + rollT * Math.PI * 2;
  } else {
    group.rotation.z = 0;
  }
}