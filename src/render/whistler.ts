// THE WHISTLER — render (M8, plan 05 §2.3). ONE object, no new asset, and for
// most of its life zero pixels.
//
// THE BODY REUSES THE FISH PIPELINE, WHOLE — the render/postmaster.ts precedent,
// verbatim: enemies/whistler.ts stores a real FishParams on the state (generated
// at the spawn from the 'the-whistler' species preset), and this module builds
// it with the same `buildFishRig` / `readabilityScale` / `bendFishRig` the hooked
// catch is drawn with. There is no whistler mesh, material or geometry here.
//
// THE ONE THING THAT IS DIFFERENT: it is DRAWN ONLY ONCE IT HAS COMMITTED.
// While it roams it is held outside the lantern disc by the sim's own clamp
// (systems/whistler.ts) and it is not rendered at all — not culled, not faded:
// not built. "It is never visible until it's close enough to hook" is therefore
// true at the draw-call level and not merely at the fog level, and the roam
// costs exactly nothing on the GPU.
//
// Its preset carries `glow: true` — the only one in the game — so the rig the
// generator hands back already has the emissive shell. In a zone whose entire
// look is emissive points on black, the thing that comes for you is one of them.
//
// The shared glow material (render/fishMesh.ts) is additive over the rig's OWN
// vertex colours, which is right for a lit zone and reads as nothing at all in a
// lightless one: a near-black body adding near-black to a black frame. So the
// Whistler's shell is re-materialled here with the CHOIR'S OWN cold blue-green —
// the same hue the motes are — at a higher opacity. That is a two-line override
// of one material, not a second mesh path, and it means the thing that arrives
// out of the dark arrives as one of the voices.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import {
  buildFishRig,
  disposeFishRig,
  readabilityScale,
  WATER_FISH_Y,
  type FishRig,
} from './fishMesh';
import { bendFishRig } from './fish';
import type { FishParams } from '../gen/fishParams';
import { SOUND_SECONDS } from '../enemies/whistler';

let outer: THREE.Group | null = null; // yaw + position + scale
let inner: THREE.Group | null = null; // pitch — it rides nose-down in the swell
let rig: FishRig | null = null;
let rigFor: FishParams | null = null;
let spine = new Float32Array(0);
let clock = 0;
let glowMaterial: THREE.MeshBasicMaterial | null = null;

/** The Choir's cold blue-green — render/choir.ts's core hue, at body scale. */
const GLOW_COLOR = 0x7fffe8;
const GLOW_OPACITY = 0.5;

function coldGlow(): THREE.MeshBasicMaterial {
  if (!glowMaterial) {
    glowMaterial = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: GLOW_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // …and it draws THROUGH the water, the way the tether line and the ripple
      // rings already do. Bioluminescence seen from above the surface is light
      // in the water, not a thing the water hides: without this the opaque water
      // plane occludes all but the two fins that happen to break it, and the
      // strike arrives as a pair of triangles instead of a length of light.
      depthTest: false,
      side: THREE.DoubleSide,
      // it is light: the void's own fog does not get to eat it either
      fog: false,
    });
  }
  return glowMaterial;
}

// m — it swims just under the surface: a length of light in the water, with the
// ridge of its back and its fins breaking it. A little under the waterline a
// hooked catch floats at — deep enough to read as something rising, shallow
// enough that the glowing ribbon is the thing you see and not two fins.
const SWIM_Y = WATER_FISH_Y - 0.12;
// rad — a slight nose-down cant, so it reads as coming up at you rather than
// lying on the water like a landed thing.
const CANT = 0.16;
// m — how far it sinks over SOUND_SECONDS when it is finished with you.
const SOUND_DEPTH = 5.5;

export function initWhistler(scene: THREE.Scene): void {
  inner = new THREE.Group();
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false;
  outer.name = 'whistler:root';
  scene.add(outer);
}

function clearRig(): void {
  if (rig) {
    if (inner) {
      inner.remove(rig.mesh);
      if (rig.glow) inner.remove(rig.glow);
    }
    disposeFishRig(rig);
    rig = null;
    rigFor = null;
  }
}

/** Probe/gate readout: what it costs right now. Zero for the whole roam. */
export function whistlerRenderState(): { body: boolean; draws: number } {
  const bodyDraws = rig ? 1 + (rig.glow ? 1 : 0) : 0;
  return {
    body: !!rig && !!outer && outer.visible,
    draws: outer && outer.visible ? bodyDraws : 0,
  };
}

export function updateWhistler(world: WorldState, dt: number): void {
  if (!outer || !inner) return;
  const s = world.whistler;
  clock += dt;

  // NOT DRAWN WHILE IT ROAMS. 'strike' is the first frame it exists on screen —
  // which is also the first frame the sim's clamp stops holding it out of the
  // light, so the two halves of "never seen until it strikes" agree by
  // construction rather than by tuning.
  const visible =
    s.params !== null &&
    (s.phase === 'strike' ||
      s.phase === 'drag' ||
      s.phase === 'staggered' ||
      s.phase === 'sounding');
  outer.visible = visible;
  if (!visible) {
    clearRig();
    return;
  }

  const params = s.params!;
  if (params !== rigFor) {
    clearRig();
    rig = buildFishRig(params);
    rigFor = params;
    spine = new Float32Array(params.spineSegments);
    inner.add(rig.mesh);
    if (rig.glow) {
      // The one override: the Choir's hue, not the body's. `disposeFishRig` only
      // frees the shared geometry, so swapping the material here leaks nothing
      // and never touches the pooled GLOW_MATERIAL other rigs share.
      rig.glow.material = coldGlow();
      inner.add(rig.glow);
    }
  }
  if (!rig || !rigFor) return;

  const soundT = s.phase === 'sounding' ? Math.min(1, (SOUND_SECONDS - s.timer) / SOUND_SECONDS) : 0;
  outer.position.set(s.x, SWIM_Y - soundT * SOUND_DEPTH, s.z);
  outer.scale.setScalar(readabilityScale(rigFor));
  outer.rotation.y = s.facing;
  // It goes down head-first, the way something that meant to leave does.
  inner.rotation.x = CANT + soundT * 0.9;

  // The whip: a travelling sine down a very long spine. Its swimFreq is 2.1 and
  // its amplitude is high — it does not swim, it undulates.
  const amp = rigFor.swimAmp * 0.2;
  for (let i = 0; i < spine.length; i++) {
    spine[i] = Math.sin(clock * rigFor.swimFreq - i * 0.55) * amp;
  }
  bendFishRig(rig, spine);
}
