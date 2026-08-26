// Renderer — WebGLRenderer, scene, camera, resize, and the render(world) entry
// point the render system calls (plan 01 §3.1, task 3). Game systems never
// import three; only render/* does. This file owns the THREE scene/camera and
// wires the sky/lantern/water/post/boat stubs into the frame.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { initSky, updateSky } from './sky';
import { initLantern, updateLantern } from './lantern';
import { initWater, updateWater } from './water';
import { initPost, updatePost, compositeScene } from './post';
import { initBoat, updateBoat } from '../game/boat';
import { initGround, updateGround } from './ground';
import { initLake, updateLake } from './lake';
import { initRipples, updateRipples } from './ripples';
import { updatePick } from './pick';
import { initPlayer, updatePlayer } from './player';
import { initFish, updateFishMesh } from './fish';
import { initLines, updateLines } from './lines';
import { loadAssets } from './assets';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  follow: { x: number; y: number; z: number };
}

let ctx: RenderContext | null = null;

export function createRenderer(container: HTMLElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );
  // low chase angle (~25° above the waterline): low enough that the horizon,
  // fog band, and wave silhouettes are in frame (qa-issues T1), high enough
  // that the flat ripple telegraphs and cast aiming stay readable.
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);

  // ambient so flat-shaded surfaces aren't pitch black
  scene.add(new THREE.AmbientLight(0x223344, 0.6));

  initSky(scene);
  initWater(scene);
  initLantern(scene);
  initBoat(scene);
  initGround(scene);
  initLake(scene);
  initRipples(scene);
  initPlayer(scene);
  initFish(scene);
  initLines(scene);
  initPost();

  // Kick off async GLTF loads at boot; render modules swap primitives for the
  // loaded models when they land (primitive stays as the fallback meanwhile).
  loadAssets();

  ctx = { renderer, scene, camera, follow: { x: 0, y: 0, z: 0 } };
  return ctx;
}

export function resizeRenderer(renderer: THREE.WebGLRenderer): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (ctx) {
    ctx.camera.aspect = w / h;
    ctx.camera.updateProjectionMatrix();
  }
}

// The render system calls this every display frame after all fixed steps.
export function render(world: WorldState, dt: number): void {
  if (!ctx) return;
  updateSky(world, dt);
  updateWater(world, dt);
  updateLantern(world, dt);
  updateBoat(world, dt);
  updateGround(world, dt);
  updateLake(world, dt);
  updateRipples(world, dt);
  updatePlayer(world, dt);
  updateFishMesh(world, dt);
  updateLines(world, dt);
  updatePost(world, dt);

  // smooth camera follow — the boat in M0, the player on foot in M1 (same low
  // top-down angle: the camera sits behind the subject on +z so the horizon/
  // fog band stays in frame; plan §3.1). A gate driver may override the framing
  // via world.debugCam (plan 06 composed shots).
  const c = ctx.camera;
  const cam = world.debugCam;
  if (cam) {
    c.position.set(cam.x, cam.y, cam.z);
    c.lookAt(cam.lookX, 0.6, cam.lookZ);
  } else {
    const foot = world.mode === 'foot';
    const tx = foot ? world.player.x : world.boat.x;
    const tz = foot ? world.player.z : world.boat.z;
    const lerp = 1 - Math.exp(-dt * 5);
    c.position.x += (tx - c.position.x) * lerp;
    c.position.z += (tz + 12 - c.position.z) * lerp;
    c.position.y = 6;
    // aim slightly above the deck so the horizon rides near the top of frame
    c.lookAt(tx, 0.6, tz);
  }

  // mouse → world aim point (the cast system reads it next fixed step)
  updatePick(world, ctx);

  // Post pass renders the scene (dread 0 → direct, free) instead of a bare render.
  compositeScene(ctx);
}

export function currentRenderContext(): RenderContext | null {
  return ctx;
}
