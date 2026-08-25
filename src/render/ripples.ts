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
const groups = new Map<number, THREE.Group>();

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

const RINGS_PER = 3; // concentric expanding ripples per disturbance

function ensureMesh(id: number, tier: number): THREE.Group {
  const existing = groups.get(id);
  if (existing) return existing;
  const g = new THREE.Group();
  for (let i = 0; i < RINGS_PER; i++) {
    // thin ring, expands outward and fades — reads as water, not a UI circle
    const geo = new THREE.RingGeometry(0.94, 1, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: TIER_COLOR[tier] ?? TIER_COLOR[1],
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      // the displaced wave surface (±1.2m) would occlude a flat ring at the
      // waterline — draw over the water like the tether line does
      depthTest: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    g.add(m);
  }
  g.position.y = 0.06;
  root!.add(g);
  groups.set(id, g);
  return g;
}

export function updateRipples(world: WorldState, dt: number): void {
  if (!root) return;
  const t = world.time.elapsed;
  const live = new Set<number>();

  for (const d of world.disturbances) {
    if (d.state === 'gone') continue;
    live.add(d.id);
    const group = ensureMesh(d.id, d.tier);
    const base = rippleRadiusForTier(d.tier);
    group.position.set(d.pos.x, 0.06, d.pos.z);
    // concentric rings expand from the centre and fade out — the classic
    // something-is-under-there telegraph. Prompt = urgent fast pulses.
    const speed = d.state === 'prompt' ? 1.6 : d.state === 'biting' ? 0.9 : 0.45;
    const peak = d.state === 'prompt' ? 0.85 : d.state === 'biting' ? 0.55 : 0.4;
    for (let i = 0; i < group.children.length; i++) {
      const ring = group.children[i] as THREE.Mesh;
      const phase = (t * speed + i / RINGS_PER + d.id * 0.37) % 1;
      const r = base * (0.25 + 0.85 * phase);
      ring.scale.setScalar(Math.max(0.001, r));
      const mat = ring.material as THREE.MeshBasicMaterial;
      // born faint, brightest at a third out, gone at the rim
      mat.opacity = peak * Math.sin(Math.min(1, phase) * Math.PI) * (1 - 0.35 * phase);
    }
  }

  // hide + recycle meshes for consumed disturbances
  const gone: number[] = [];
  for (const [id, group] of groups) {
    if (!live.has(id)) {
      group.visible = false;
      gone.push(id);
    }
  }
  for (const id of gone) {
    const group = groups.get(id);
    if (group) {
      root!.remove(group);
      for (const child of group.children) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    groups.delete(id);
  }
  for (const id of live) {
    const group = groups.get(id);
    if (group) group.visible = true;
  }
  void dt;
}