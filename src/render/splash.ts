// SPLASH (render) — task T10 render side. Presents the sim splash pool
// (core/splash.ts) as a THREE.Points soft-splat burst + a pool of one-shot
// expanding foam rings. Pure presentation: never touches game logic, only
// rewrites buffers/meshes from world.splash (which the sim system splashFx
// stepped + populated on fixed steps, so no event is ever missed here).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { SPLASH_POOL, SPLASH_RINGS, ringRadius } from '../core/splash';

// Foam tint — near-white #eaf2ee for the rings; the droplet splats use a
// slightly cooler, brighter white so the additive blend reads as churned foam.
const RING_COLOR = 0xeaf2ee;
const PARTICLE_COLOR = { r: 0.92, g: 0.97, b: 0.95 };

const RING_Y = 0.06; // sit just above the waterline (same as ripples.ts)
const RING_BASE_RADIUS = 1; // RingGeometry(0.9, 1, 28) → scale = ringRadius
const RING_PEAK_OPACITY = 0.7;

let root: THREE.Group | null = null;
let points: THREE.Points | null = null;
let pointPos: THREE.BufferAttribute | null = null;
let pointCol: THREE.BufferAttribute | null = null;
let ringMeshes: THREE.Mesh[] = [];

function makeSplatTexture(): THREE.Texture {
  // soft radial sprite — the same technique as game/boat.ts makeWake: a bare
  // Points particle renders as a hard square, a 32px radial gradient reads as
  // a churned-water splat.
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const g2d = cnv.getContext('2d')!;
  const grad = g2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2d.fillStyle = grad;
  g2d.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cnv);
}

export function initSplash(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'splash:root';
  root.renderOrder = 6; // above the ripple telegraphs, below the tether line
  scene.add(root);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPLASH_POOL * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPLASH_POOL * 3), 3));
  pointPos = geo.attributes.position as THREE.BufferAttribute;
  pointCol = geo.attributes.color as THREE.BufferAttribute;
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    map: makeSplatTexture(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // positions live in the buffer, bounds never computed
  root.add(points);

  // one-shot foam-ring pool — each slot mirrors one SplashRing slot 1:1
  ringMeshes = [];
  for (let i = 0; i < SPLASH_RINGS; i++) {
    const ringGeo = new THREE.RingGeometry(RING_BASE_RADIUS * 0.9, RING_BASE_RADIUS, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: RING_COLOR,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false, // read over the displaced wave surface, like ripples
    });
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    ringMeshes.push(m);
    root.add(m);
  }
}

export function updateSplash(world: WorldState, dt: number): void {
  if (!root || !points || !pointPos || !pointCol) return;
  void dt;
  const s = world.splash;

  // --- droplets -------------------------------------------------------------
  for (let i = 0; i < s.parts.length; i++) {
    const p = s.parts[i]!;
    if (p.age >= p.life) {
      pointPos.setXYZ(i, 0, -999, 0); // dead slot: parked out of sight
      pointCol.setXYZ(i, 0, 0, 0);
      continue;
    }
    // the particle rides its OWN vy arc (the sim integrated it) — y is the
    // leap above the water, no surface re-sampling needed
    pointPos.setXYZ(i, p.x, p.y, p.z);
    const fade = 1 - p.age / p.life;
    const a = fade * fade;
    pointCol.setXYZ(i, PARTICLE_COLOR.r * a, PARTICLE_COLOR.g * a, PARTICLE_COLOR.b * a);
  }
  pointPos.needsUpdate = true;
  pointCol.needsUpdate = true;

  // --- foam rings -----------------------------------------------------------
  for (let i = 0; i < s.rings.length; i++) {
    const r = s.rings[i]!;
    const m = ringMeshes[i];
    if (!m) continue;
    if (r.age >= r.life) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    m.position.set(r.x, RING_Y, r.z);
    // one-shot expansion: 0 → maxR over life (monotonic in sim age)
    m.scale.setScalar(Math.max(0.001, ringRadius(r) / RING_BASE_RADIUS));
    const fade = 1 - r.age / r.life;
    (m.material as THREE.MeshBasicMaterial).opacity = RING_PEAK_OPACITY * fade;
  }
}