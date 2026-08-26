// POST — WORKER A OWNS THIS FILE.
// Fullscreen post pass: vignette + subtle chromatic aberration, both scaling
// with world.dread (0 → off, 100 → strongest). Implemented as one fullscreen
// triangle + a small custom ShaderMaterial rendered after the main scene (no
// postprocessing libs). At dread tier 4 (>=80) a 0.5° screen tilt is applied
// as a camera-roll lerp, not a shader warp. A '?dread=NN' URL param is a debug
// override read here so the effect is testable while world.dread stays 0 in
// M0. When effective dread is 0 the pass degrades to a plain direct render —
// free, no render target touched.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { RenderContext } from './renderer';

const TILT_TIER = (0.5 * Math.PI) / 180; // 0.5 degrees, spec 8.1

let rt: THREE.WebGLRenderTarget | null = null;
let quad: THREE.Mesh | null = null;
let mat: THREE.ShaderMaterial | null = null;
let quadScene: THREE.Scene | null = null;
let quadCamera: THREE.OrthographicCamera | null = null;

let dreadOverride: number | null = null;
let tilt = 0;
let ready = false;

// Options menu seam (CIRCULAR 4, 'Chromatic Dispersion & Lens Staining'):
// forces the direct-render path (no render target, no shader) when disabled.
// Gates BOTH the composite and the dread-driven screen tilt, so "off" is the
// whole post-effect family off.
let postEnabled = true;

export function setPostEnabled(on: boolean): void {
  postEnabled = on;
}

// Debug override: '?dread=NN' (0..100). Read once from the URL.
function readOverride(): number | null {
  const m = /[?&]dread=(\d{1,3})/.exec(window.location.search || '');
  if (!m) return null;
  return THREE.MathUtils.clamp(parseInt(m[1] ?? '', 10), 0, 100);
}

// Lazy init: currentRenderContext() is null during initPost (the renderer sets
// ctx right after), so build the target/quad on first composite.
function ensureReady(ctx: RenderContext): void {
  if (ready) return;
  const { renderer } = ctx;
  rt = new THREE.WebGLRenderTarget(
    renderer.domElement.width,
    renderer.domElement.height,
    { samples: 4 }
  );
  // Sampled 1:1 by the fullscreen triangle — no mipmaps needed.
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;

  // One fullscreen triangle (covers the screen with a single clip-space quad).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2)
  );

  mat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      uDread: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform float uDread;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d);
        float vig = 1.0 - uDread * smoothstep(0.25, 0.85, r * 1.6);
        float ca = uDread * 0.0035 * r;
        vec2 dir = r > 1e-4 ? d / r : vec2(0.0);
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + dir * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir * ca).b;
        col *= vig;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;

  quadScene = new THREE.Scene();
  quadScene.add(quad);
  quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ready = true;
}

export function initPost(): void {
  // Nothing to do here — lazy setup happens in compositeScene once the
  // renderer context exists (renderer boot calls initPost before setting ctx).
}

export function updatePost(world: WorldState, dt: number): void {
  if (dreadOverride === null) dreadOverride = readOverride();

  // Compute the screen-tilt target (dread tier 4 = 0.5° camera roll). Applied
  // in compositeScene AFTER the renderer's lookAt so it isn't reset each frame.
  const effective = !postEnabled ? 0 : (dreadOverride ?? world.dread);
  const target = effective >= 80 ? TILT_TIER : 0;
  const k = 1 - Math.exp(-dt * 3);
  tilt += (target - tilt) * k;
}

// Called by the renderer AFTER updatePost in place of the direct scene render.
// Renders the scene into a target, then composites the fullscreen triangle to
// the screen. When effective dread is 0 it just renders directly — free.
export function compositeScene(ctx: RenderContext): void {
  // Camera-roll tilt (tier-4 dread) — applied here, after the renderer's
  // camera.lookAt, so it survives to the actual render.
  ctx.camera.rotation.z = tilt;

  ensureReady(ctx);
  if (!mat || !rt || !quadScene || !quadCamera) {
    ctx.renderer.render(ctx.scene, ctx.camera);
    return;
  }

  const effective = !postEnabled ? 0 : (dreadOverride ?? 0) / 100;
  if (effective <= 0) {
    ctx.renderer.render(ctx.scene, ctx.camera);
    return;
  }

  const w = ctx.renderer.domElement.width;
  const h = ctx.renderer.domElement.height;
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

  mat.uniforms.uDread!.value = effective; // Scene → target, then triangle → screen.
  ctx.renderer.setRenderTarget(rt);
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.renderer.setRenderTarget(null);
  ctx.renderer.render(quadScene, quadCamera);
}
