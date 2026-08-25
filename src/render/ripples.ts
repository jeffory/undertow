// RIPPLES — disturbance telegraph render (task t12 #1). Each live disturbance
// is an expanding ring on the water sized by its tier ONLY (1-3) — the species
// is never observable pre-SET. Color hints the rarity bucket (pale common →
// warm rare), the ring pulses, and a prompt (the bite) flashes hot. A pool of
// ring meshes is keyed by disturbance id so sim spawns/consumes map 1:1.
// Render-side (three).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { rippleRadiusForTier } from '../run/disturbance';

let root: THREE.Group | null = null;
const meshes = new Map<number, THREE.Mesh>();

// rarity-bucket tints — the plan's "small/medium/large rings + tint by bucket"
const TIER_COLOR: Record<number, number> = {
  1: 0x9db8d4, // common — bone-teal
  2: 0x6fa8c8, // uncommon — brighter teal
  3: 0xd8906a, // rare — warm
};

export function initRipples(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.renderOrder = 5;
  scene.add(root);
}

function ensureMesh(id: number, tier: number): THREE.Mesh {
  const existing = meshes.get(id);
  if (existing) return existing;
  const geo = new THREE.RingGeometry(0.85, 1, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: TIER_COLOR[tier] ?? TIER_COLOR[1],
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  root!.add(m);
  meshes.set(id, m);
  return m;
}

export function updateRipples(world: WorldState, dt: number): void {
  if (!root) return;
  const t = world.time.elapsed;
  const live = new Set<number>();

  for (const d of world.disturbances) {
    if (d.state === 'gone') continue;
    live.add(d.id);
    const mesh = ensureMesh(d.id, d.tier);
    const base = rippleRadiusForTier(d.tier);
    // pulse the ring; a prompt flares (the bite is "now")
    const phase = d.state === 'prompt' ? t * 7 : t * 1.6;
    const pulse = 1 + 0.12 * Math.sin(phase);
    const scale = base * pulse;
    mesh.scale.setScalar(scale);
    mesh.position.set(d.pos.x, 0.06, d.pos.z);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (d.state === 'prompt') {
      mat.opacity = 0.5 + 0.4 * Math.sin(t * 12);
    } else if (d.state === 'biting') {
      mat.opacity = 0.4 + 0.2 * Math.sin(t * 3);
    } else {
      mat.opacity = 0.45;
    }
  }

  // hide + recycle meshes for consumed disturbances
  const gone: number[] = [];
  for (const [id, mesh] of meshes) {
    if (!live.has(id)) {
      mesh.visible = false;
      gone.push(id);
    }
  }
  for (const id of gone) {
    const mesh = meshes.get(id);
    if (mesh) {
      root!.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    meshes.delete(id);
  }
  // show fresh ones
  for (const id of live) {
    const mesh = meshes.get(id);
    if (mesh) mesh.visible = true;
  }
  void dt;
}