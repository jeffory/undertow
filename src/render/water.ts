// WATER — WORKER B OWNS THIS FILE.
// Water plane + Gerstner vertex waves + depth-gradient fragment shader (plan
// 01 §3.2, T6). Renderer boot calls initWater(scene); each frame updateWater
// (world, dt) drives the time/light uniforms. Plain functions + module state,
// zero textures. One ShaderMaterial, one draw call.
//
// The Gerstner wave parameters live ONLY in WAVES below (single source of
// truth): the vertex GLSL is generated from the same table, and the CPU-side
// waterHeightAt() samples it, so the boat can bob on exactly the rendered
// surface.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { waveConstsGlsl, waveBodyGlsl } from '../core/waves';

const WATER_SIZE = 400;
const WATER_SEGMENTS = 112; // 112x112 -> 12,769 verts, 25,088 tris (~well under the 30k water budget)

const vertexShader = `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;

uniform float uTime;

#include <fog_pars_vertex>

${waveConstsGlsl()}

void main() {
  #include <begin_vertex>

  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float height = 0.0;
${waveBodyGlsl()}

  // Surface normal = cross(dPdz, dPdx) (upward for the identity mapping).
  vec3 n = normalize(cross(dPdz, dPdx));
  vNormal = normalize(mat3(modelMatrix) * n);
  vHeight = height;
  vWorldPos = vec3(modelMatrix * vec4(transformed, 1.0));

  #include <project_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;

uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonIntensity;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternIntensity;
uniform float uLanternRange;
uniform vec3 uAmbient;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;

#include <fog_pars_fragment>

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Depth/height gradient: troughs (deep) near-black -> crests (shallow)
  // bone-teal accent. Wave heights span roughly ±1.23.
  float t = clamp(vHeight * 0.6 + 0.5, 0.0, 1.0);
  vec3 base = mix(uDeepColor, uShallowColor, t);

  // Moon directional (Lambert) — rakes the wave slopes.
  float ndl = max(dot(n, uMoonDir), 0.0);
  vec3 moon = uMoonColor * uMoonIntensity * ndl;

  // Boat lantern point light (cheap distance-squared falloff bounded by the
  // light's cutoff distance=16, same shape as three's physical point lights).
  vec3 toLantern = uLanternPos - vWorldPos;
  float dist = length(toLantern);
  vec3 ln = toLantern / max(dist, 1e-4);
  float atten = 1.0 / (1.0 + dist * dist);
  if (uLanternRange > 0.0) {
    atten *= pow(clamp(1.0 - pow(dist / uLanternRange, 4.0), 0.0, 1.0), 2.0);
  }
  vec3 lantern = uLanternColor * uLanternIntensity * atten * max(dot(n, ln), 0.0);

  // Subtle moon specular so a glint path rakes across the swells.
  vec3 hv = normalize(uMoonDir + viewDir);
  float spec = pow(max(dot(n, hv), 0.0), 64.0) * 0.35;

  // Ambient keeps the base from falling flat; moon + lantern light the surface
  // gradient directly so crests pick up the bone-teal and the lantern pool.
  vec3 color = base * uAmbient * 0.8;
  color += base * moon * 0.55;
  color += base * lantern;
  color += uMoonColor * spec * 1.2;

  // Cheap fresnel-ish darkening at grazing angles (also fattens the fog blend).
  float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
  color *= 1.0 - 0.5 * fres;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// Palette (spec 8.1 / plan 01 §3.2): near-black water base, bone-teal accent.
const DEEP_COLOR = 0x071318; // near-black, teal-tinted (troughs)
const SHALLOW_COLOR = 0x4e858b; // bone-teal accent (crests)

let sceneRef: THREE.Scene | null = null;
let plane: THREE.Mesh | null = null;
let waterMaterial: THREE.ShaderMaterial | null = null;
let moon: THREE.DirectionalLight | null = null;
let lantern: THREE.PointLight | null = null;

// Uniform handles held at module scope so updateWater mutates .value in place
// (indexing material.uniforms under noUncheckedIndexedAccess is messy).
const uniforms = {
  uTime: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonColor: { value: new THREE.Color(0x9db8d4) },
  uMoonIntensity: { value: 1.1 },
  uLanternPos: { value: new THREE.Vector3(0, 1, 0) },
  uLanternColor: { value: new THREE.Color(0xffb45e) },
  uLanternIntensity: { value: 3.2 },
  uLanternRange: { value: 16 },
  uAmbient: { value: new THREE.Color(0x223344).multiplyScalar(0.5) },
  uDeepColor: { value: new THREE.Color(DEEP_COLOR) },
  uShallowColor: { value: new THREE.Color(SHALLOW_COLOR) },
};

const tmpDir = new THREE.Vector3();

function findLights(): void {
  if (!sceneRef) return;
  sceneRef.traverse((obj) => {
    if (!moon && (obj as THREE.DirectionalLight).isDirectionalLight) {
      moon = obj as THREE.DirectionalLight;
    }
    if (!lantern && (obj as THREE.PointLight).isPointLight) {
      lantern = obj as THREE.PointLight;
    }
  });
}

export function initWater(scene: THREE.Scene): void {
  sceneRef = scene;

  const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
  geo.rotateX(-Math.PI / 2); // plane lies in XZ, faces +Y; mesh kept at identity so model == world

  waterMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // fog: true needs the fog uniforms present or three's uniform refresh crashes
    uniforms: { ...THREE.UniformsLib.fog, ...uniforms },
    fog: true, // respect scene FogExp2 (horizon must ghost out)
  });

  plane = new THREE.Mesh(geo, waterMaterial);
  scene.add(plane);
}

export function updateWater(world: WorldState, _dt: number): void {
  if (!waterMaterial) return;

  uniforms.uTime.value = world.time.elapsed;

  if (!moon || !lantern) findLights();

  if (moon) {
    uniforms.uMoonDir.value.copy(tmpDir.subVectors(moon.position, moon.target.position).normalize());
    uniforms.uMoonColor.value.copy(moon.color);
    uniforms.uMoonIntensity.value = moon.intensity;
  }

  if (lantern) {
    uniforms.uLanternPos.value.copy(lantern.position);
    uniforms.uLanternColor.value.copy(lantern.color);
    uniforms.uLanternIntensity.value = lantern.intensity;
    uniforms.uLanternRange.value = lantern.distance;
  }
}

// Re-export the pure wave math so render/water keeps its public API identical
// (boat.ts imports waterHeightAt from here). The implementation lives in
// src/core/waves.ts (no three), so game logic and Node tests can use it too.
export { waterHeightAt } from '../core/waves';
