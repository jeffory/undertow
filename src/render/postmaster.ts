// THE POSTMASTER — render (M7 boss, plan 05 §2.2). ONE object, no new asset.
//
// THE BODY REUSES THE FISH PIPELINE, WHOLE. `bosses/postmaster.ts` stores a real
// FishParams on the state (generated at the summons from the 'the-postmaster'
// species preset, exactly the way the Dragger's and the Snatcher's are), and
// this module builds it with the same `buildFishRig` / `readabilityScale` /
// `bendFishRig` the hooked catch is drawn with. There is no postmaster mesh, no
// postmaster material and no postmaster geometry in this file — that is the
// point. The "long coat, brass buttons, tall dorsal mailbag hump" read is bought
// entirely from the generator's dials (data/species.ts).
//
// One extra draw call while he is on the water, none otherwise.
//
// The spine is animated HERE, off the render clock, because it is presentation:
// the sim owns where he is, never how he moves in the current. His swimFreq is
// the lowest in the game (1.1) — he is not hurrying. He has all night.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { buildFishRig, disposeFishRig, readabilityScale, WATER_FISH_Y, type FishRig } from './fishMesh';
import { bendFishRig } from './fish';
import type { FishParams } from '../gen/fishParams';
import { SINK_SECONDS } from '../bosses/postmaster';

let outer: THREE.Group | null = null; // yaw + position + scale
let inner: THREE.Group | null = null; // pitch — he STANDS (see STAND_PITCH)
let rig: FishRig | null = null;
let rigFor: FishParams | null = null;
let spine = new Float32Array(0);
let clock = 0;

// HE STANDS. The rig the generator builds runs head-toward-+Z, like every catch
// in the game; pitching it a quarter turn puts the head up and turns the same
// mesh into a TALL FIGURE — which is the whole reason the preset spends its
// girth curve on a flat coat with one bump near the head end. This is the only
// thing in the round that is not literally the fish path, and it is one line of
// rotation, not an asset.
const STAND_PITCH = -Math.PI / 2;
// m — the body is ~2.9 m and centred on its own origin, so a centre a little
// under the waterline stands him WAIST-DEEP in the flooded street: the coat's
// hem is in the water, his head, shoulders and mailbag are out of it.
const STAND_Y = WATER_FISH_Y - 0.35;
// m — how far he sinks over SINK_SECONDS once his line is cut.
const SINK_DEPTH = 3.6;

export function initPostmaster(scene: THREE.Scene): void {
  inner = new THREE.Group();
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false;
  outer.name = 'postmaster:root';
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

/** Probe/gate readout: what the boss costs right now. */
export function postmasterRenderState(): { body: boolean; draws: number } {
  const bodyDraws = rig ? 1 + (rig.glow ? 1 : 0) : 0;
  return {
    body: !!rig && !!outer && outer.visible,
    draws: outer && outer.visible ? bodyDraws : 0,
  };
}

/** Where the speech bubble hangs: world-space, over his head. */
export function postmasterBubbleAnchor(world: WorldState): { x: number; y: number; z: number } {
  const s = world.postmaster;
  return { x: s.x, y: STAND_Y + 2.4, z: s.z };
}

export function updatePostmaster(world: WorldState, dt: number): void {
  if (!outer || !inner) return;
  const s = world.postmaster;
  clock += dt;

  const visible = s.phase !== 'idle' && s.phase !== 'gone' && s.params !== null;
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
    if (rig.glow) inner.add(rig.glow);
  }
  if (!rig || !rigFor) return;

  // He goes down slowly and without fuss, bowing as he goes.
  const sinkT = s.phase === 'sinking' ? Math.min(1, (SINK_SECONDS - s.timer) / SINK_SECONDS) : 0;
  outer.position.set(s.x, STAND_Y - sinkT * SINK_DEPTH, s.z);
  outer.scale.setScalar(readabilityScale(rigFor));
  outer.rotation.y = s.facing;
  // upright, bowing back a little as he goes down — courteous to the last
  inner.rotation.x = STAND_PITCH + sinkT * 0.5;

  // The wriggle: a slow travelling sine — a coat in a current, not a tail.
  const amp = rigFor.swimAmp * 0.12;
  for (let i = 0; i < spine.length; i++) {
    spine[i] = Math.sin(clock * rigFor.swimFreq - i * 0.4) * amp;
  }
  bendFishRig(rig, spine);
}
