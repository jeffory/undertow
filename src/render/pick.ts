// PICK — mouse → world-space water-plane point (task t12 #1 "aim with mouse").
// Raycasts the mouse through the camera onto the y=0 water plane and writes
// world.input.mouseWorld. Render-side (three) — the cast system (pure) reads
// the point each fixed step. Runs once per display frame.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { RenderContext } from './renderer';

export function updatePick(world: WorldState, ctx: RenderContext): void {
  const w = ctx.renderer.domElement.clientWidth || 1;
  const h = ctx.renderer.domElement.clientHeight || 1;
  const mx = world.input.mouseX;
  const my = world.input.mouseY;
  const ndc = new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, ctx.camera);
  const dir = ray.ray.direction;
  if (Math.abs(dir.y) < 1e-6) {
    world.input.mouseWorld = null;
    return;
  }
  const t = -ray.ray.origin.y / dir.y;
  if (t < 0) {
    world.input.mouseWorld = null;
    return;
  }
  world.input.mouseWorld = {
    x: ray.ray.origin.x + dir.x * t,
    z: ray.ray.origin.z + dir.z * t,
  };
}