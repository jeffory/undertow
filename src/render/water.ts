// WATER — WORKER B OWNS THIS FILE.
// Water plane + Gerstner vertex waves + flat-shaded depth/facet fragment shader
// (plan 01 §3.2, T6; Visual QA round A water-mood pass). Renderer boot calls
// initWater(scene); each frame updateWater (world, dt) drives the time/light
// uniforms. Plain functions + module state, zero textures. One ShaderMaterial,
// one draw call.
//
// Round A changes (VS QA: near-black teal low-poly ocean, not pale grey-blue):
//   - Palette: near-black teal base (#081014) with a NARROW bone-teal crest
//     accent (only the top ~55% of the wave range ramps toward it), so the
//     surface reads near-black and only crest crowns pick up teal.
//   - Flat shading: the fragment derives per-face normals from
//     dFdx/dFdy(vWorldPos), so wave facets catch the moon as discrete lit faces
//     (low-poly look) instead of one smooth gradient. Gerstner motion unchanged.
//   - Foam: thresholded near-white foam on the highest crests (height >
//     ~0.75·WAVE_MAX), per-facet jittered so it breaks along the facet grid.
//
// The Gerstner wave parameters live ONLY in WAVES (single source of truth):
// the vertex GLSL is generated from the same table, the CPU-side waterHeightAt()
// samples it, and WAVE_MAX_HEIGHT drives the crest/foam thresholds here.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { waveConstsGlsl, waveBodyGlsl, WAVE_MAX_HEIGHT } from '../core/waves';
import { shoreAttenAt } from '../core/shore';

const WATER_SIZE = 400;
const WATER_SEGMENTS = 112; // 112x112 -> 12,769 verts, 25,088 tris (~well under the 30k water budget)

// Palette (spec 8.1 / plan 01 §3.2 / VS QA round A): near-black teal base,
// bone-teal crest accent, near-white foam. Thresholds are fractions of
// WAVE_MAX_HEIGHT so they stay coupled to the wave table.
const DEEP_COLOR = 0x081014; // near-black, teal-tinted (the surface default)
const SHALLOW_COLOR = 0x355c66; // deep bone-teal crest accent (narrow, top of range only)
const FOAM_COLOR = 0xeaf2ee; // near-white bone foam
const CREST_START_FRAC = 0.45; // crest accent begins at 45% of max wave height
const FOAM_LO_FRAC = 0.88; // foam threshold: only the rare aligned crests
const FOAM_HI_FRAC = 0.98; // foam saturates here (top of the range)

const WAVE_MAX = WAVE_MAX_HEIGHT;
const CREST_START = CREST_START_FRAC * WAVE_MAX;
const FOAM_LO = FOAM_LO_FRAC * WAVE_MAX;
const FOAM_HI = FOAM_HI_FRAC * WAVE_MAX;

const vertexShader = `
attribute float aShore; // baked shoreline attenuation (core/shore.ts): 0 rim -> 1 open water
varying vec3 vWorldPos;
varying float vHeight;
varying float vShore;

uniform float uTime;

#include <fog_pars_vertex>

${waveConstsGlsl()}

void main() {
  #include <begin_vertex>

  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float height = 0.0;
  vec3 restPos = transformed;
${waveBodyGlsl()}

  // Shoreline depth mask (T2 / bug B1): scale the whole Gerstner displacement
  // by the baked attenuation so swells die to flat water at every islet rim —
  // crests can no longer wash over the land. Mirrors attenuatedWaterHeightAt.
  transformed = restPos + (transformed - restPos) * aShore;
  height *= aShore;

  vHeight = height;
  vShore = aShore;
  vWorldPos = vec3(modelMatrix * vec4(transformed, 1.0));

  #include <project_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = `
varying vec3 vWorldPos;
varying float vHeight;
varying float vShore;

uniform float uTime;
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
uniform vec3 uFoamColor;

const float FOAM_LO = ${FOAM_LO.toFixed(4)};
const float FOAM_HI = ${FOAM_HI.toFixed(4)};
const float CREST_START = ${CREST_START.toFixed(4)};
const float WAVE_MAX = ${WAVE_MAX.toFixed(4)};

#include <fog_pars_fragment>

void main() {
  // Flat shading: per-face normal from screen-space derivatives of the
  // displaced world position (constant across each triangle → discrete facets).
  vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (n.y < 0.0) n = -n;
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Depth/crest gradient: near-black base everywhere; only the top ~55% of the
  // wave range ramps toward the bone-teal crest accent (the old full-range
  // gradient washed the whole plane pale).
  float t = clamp((vHeight - CREST_START) / (WAVE_MAX - CREST_START), 0.0, 1.0);
  vec3 base = mix(uDeepColor, uShallowColor, t);

  // Moon directional, FACET-gated: discrete lit/unlit facets (low-poly look).
  // Added (not multiplied through the near-black base) so moon-facing facets
  // read as cool teal against near-black troughs.
  float ndl = max(dot(n, uMoonDir), 0.0);
  // narrow window + low gain: lit facets stay dark teal, never ice-white
  float facet = smoothstep(0.55, 0.98, ndl);
  vec3 moon = uMoonColor * uMoonIntensity * facet * 0.22;

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

  // Lantern REFLECTION — not albedo-multiplied. Every other light term is
  // modulated by the near-black base (#081014, ~4%), which is physically fine
  // for diffuse but means the lantern can never visibly pool on the water and
  // night phases read as a void around the boat. Real dark water still MIRRORS
  // a lamp: a specular lobe toward the viewer plus a faint direct warm disc,
  // both bounded by the same ranged falloff.
  vec3 rl = reflect(-ln, n);
  float lspec = pow(max(dot(rl, viewDir), 0.0), 28.0);
  // The direct warm disc must hug the hull: at the light's full 16 m range the
  // faint amber over near-black mixed into a mud-brown wash that read as a
  // shadow FOLLOWING the boat (the moonlit facets beyond it were brighter).
  // Tight quartic pool (~7 m, most energy inside ~4 m) lets the dark water
  // close around a small lamp-lit circle instead. The view-dependent specular
  // streak keeps the longer ranged falloff.
  float pool = pow(clamp(1.0 - dist / 7.0, 0.0, 1.0), 2.0);
  vec3 lanternGlow = uLanternColor * uLanternIntensity * (lspec * 0.28 * atten + 0.05 * pool * pool);

  // Subtle moon specular so a glint path rakes across the swells.
  vec3 hv = normalize(uMoonDir + viewDir);
  // flat facets share one normal — a broad spec gain paints whole
  // triangles pale, so keep the glint corridor faint
  float spec = pow(max(dot(n, hv), 0.0), 96.0) * 0.2;

  vec3 color = base * uAmbient * 0.8;
  color += base * moon;
  color += base * lantern;
  color += lanternGlow;
  color += uMoonColor * spec;

  // Faceted crest foam: height threshold >~0.75·max, jittered per facet (from
  // the quantized flat normal) and weighted by how flat-up the facet faces, so
  // foam breaks into crisp facet patches instead of one smooth blob.
  float fh =
    floor(n.x * 5.0 + 0.5) * 0.41 +
    floor(n.y * 5.0 + 0.5) * 0.57 +
    floor(n.z * 5.0 + 0.5) * 0.31;
  // Per-facet brightness jitter: each triangle gets its own shade so the
  // surface reads as discrete low-poly facets rather than a smooth gradient.
  color *= 0.88 + 0.24 * fract(fh * 7.31);
  float foamHash = 0.8 + 0.2 * fract(fh * 1.61803);
  float upness = 0.55 + 0.45 * max(n.y, 0.0);
  float foam = smoothstep(FOAM_LO, FOAM_HI, vHeight) * upness * foamHash;

  // Shoreline edge foam (T2): where the depth mask kills the swell, a lapping
  // near-white band hugs the islet rim — per-facet jittered and slowly pulsed
  // so it reads as surge, not a painted outline. vShore==0 verts sit under the
  // islet mesh (skirt covers them), so the visible band is the outer ramp.
  // Narrow band: foam only inside ~2.3 m of the rim (vShore < 0.25), and the
  // lap phase travels along the shoreline + drops fully out between surges so
  // it reads as breathing surf, not a painted white ring. Weight kept low —
  // at the grazing camera a shoreline band foreshortens into a lot of screen.
  // Near the camera a smooth 2 m gradient band reads as pale fog, not surf —
  // so the band is broken into world-anchored clumps (0.7 m hash cells) and
  // hard-thresholded: crisp foam patches that surge with the lap phase.
  float edge = 1.0 - vShore;
  float band = smoothstep(0.78, 0.99, edge);
  float lap = max(sin(uTime * 1.6 + (vWorldPos.x + vWorldPos.z) * 0.9 + fh * 7.0), 0.0);
  // fract-based cell hash (sin-hash loses precision at |coord| ~100 and
  // returns correlated values -> solid white sheets instead of clumps)
  vec2 cell = floor(vWorldPos.xz * 1.4);
  vec3 p3 = fract(vec3(cell.x, cell.y, cell.x) * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  float ch = fract((p3.x + p3.y) * p3.z);
  // hash is a true gate (floor 0.15): low cells stay dark even at full
  // band*lap, so the shoreline breaks into patches instead of solid sheets
  float surf = band * (0.25 + 0.75 * lap) * (0.15 + 0.85 * ch);
  float edgeFoam = smoothstep(0.32, 0.60, surf);

  // crest foam saturates to full white at the peaks — the concept's bright ~2%
  // lives in foam caps and the lantern, not in a lifted midrange (luma gate)
  color = mix(color, uFoamColor, clamp(foam * 1.1 + edgeFoam * 0.45, 0.0, 1.0));

  // Cheap fresnel-ish darkening at grazing angles (also fattens the fog blend).
  // Weakened from the original 0.5 so the darker palette's moonlit facets stay
  // visible instead of being crushed flat.
  float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
  color *= 1.0 - 0.35 * fres;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

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
  uFoamColor: { value: new THREE.Color(FOAM_COLOR) },
};

let sceneRef: THREE.Scene | null = null;
let plane: THREE.Mesh | null = null;
let waterMaterial: THREE.ShaderMaterial | null = null;
let moon: THREE.DirectionalLight | null = null;
let lantern: THREE.PointLight | null = null;

// Uniform handles held at module scope so updateWater mutates .value in place
// (indexing material.uniforms under noUncheckedIndexedAccess is messy).
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

  // shoreline attenuation attribute — starts as open water (1) everywhere;
  // baked from the real islet polygons on the first frame the lake exists.
  const count = geo.attributes.position!.count;
  geo.setAttribute('aShore', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));

  waterMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // fog: true needs the fog uniforms present or three's uniform refresh crashes
    uniforms: { ...THREE.UniformsLib.fog, ...uniforms },
    fog: true, // respect scene FogExp2 (horizon must ghost out)
  });

  plane = new THREE.Mesh(geo, waterMaterial);
  plane.name = 'water:plane';
  scene.add(plane);
}

let shoreBaked = false;

// One-time bake: exact polygon-distance shore attenuation (core/shore.ts) per
// water-grid vertex. ~12.8k verts x ~8 islets once at boot — free thereafter,
// and the vertex shader scales its displacement by the result.
function bakeShore(world: WorldState): void {
  if (shoreBaked || !plane || !world.lake) return;
  const geo = plane.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const shore = geo.attributes.aShore as THREE.BufferAttribute;
  const islets = world.lake.islets;
  for (let i = 0; i < pos.count; i++) {
    shore.setX(i, shoreAttenAt(islets, pos.getX(i), pos.getZ(i)));
  }
  shore.needsUpdate = true;
  shoreBaked = true;
}

export function updateWater(world: WorldState, _dt: number): void {
  if (!waterMaterial) return;

  bakeShore(world);
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