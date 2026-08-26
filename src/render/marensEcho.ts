// MAREN'S ECHO — render (M8 boss, plan 05 §2.3). ONE object, no new asset.
//
// THE BODY IS THE FISH PIPELINE, WHOLE — the Postmaster's precedent, one zone
// deeper. `systems/marensEcho.ts` stores a real FishParams on her state at the
// summons (generated from the 'marens-echo' species preset), and this module
// builds it with the same `buildFishRig` / `readabilityScale` / `bendFishRig`
// every catch in the game is drawn with. There is no Echo mesh, no Echo
// material and no Echo geometry in this file. What makes her HER is three dials
// in data/species.ts (no eyes, no mouth, humanRatio 0.96), one palette entry
// (drowned linen — the only near-white in the game), and the quarter-turn below
// that stands the rig up into a figure.
//
// ── THE MIRROR (the decision this round owes) ────────────────────────────────
//
// "It holds at max line length, swaying gently, MIRRORED BY YOUR OWN
//  SILHOUETTE." Two ways to buy that:
//
//   (a) read the keeper's idle animation clip and drive her spine off its phase;
//   (b) drive her off the SIM's own sway phase, negated.
//
// This is (b), and the reason is not laziness. The keeper's idle sway is a
// RENDER-side cosmetic that no test can see and no probe can read; hanging the
// game's most important image off it would make "she mirrors you" a thing that
// is true only when the renderer happens to be running, and unverifiable when it
// is not. `marensEcho.swayPhase` is sim state, advanced at a fixed rate on fixed
// steps, so the mirror is deterministic, screenshot-reproducible, and a unit
// test can assert the counter-phase without a GPU. The keeper's own idle sway
// runs at the same slow rate; negating her phase puts the two silhouettes a half
// cycle apart — leaning away from each other and back, on the same beat.
//
// She also never turns around. `facing` is the bearing OUT from the keeper, so
// what the lantern finds is a back — "a figure in drenched linen hovering in the
// void, FACING AWAY FROM THE BOAT" (choir.md §5.6).
//
// One extra draw call while she is on the line, none otherwise.

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
import { ARRIVE_SECONDS, echoActive } from '../bosses/marensEcho';

let outer: THREE.Group | null = null; // yaw + position + scale
let inner: THREE.Group | null = null; // pitch — she STANDS
let rig: FishRig | null = null;
let rigFor: FishParams | null = null;
let spine = new Float32Array(0);

// The Postmaster's quarter-turn: the generator's rig runs head-toward-+Z like
// every catch, and pitching it up turns the same mesh into a tall figure. Her
// girth curve was written to be read this way round — narrow at the head, a hem
// of linen widening into the dark below.
const STAND_PITCH = -Math.PI / 2;
// m — her body is ~2.4 m on its own origin; a centre just under the waterline
// stands her chest-deep, which is where a thing that is not swimming stands.
const STAND_Y = WATER_FISH_Y - 0.7;
// m — how far she rises out of the black over the arrival.
const ARRIVE_RISE = 1.8;
// The spine bend the sway is worth. Tiny: "it sways with the slow pulse of the
// basin", not a tail beat.
const SWAY_BEND = 0.07;

export function initMarensEcho(scene: THREE.Scene): void {
  inner = new THREE.Group();
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false;
  outer.name = 'marensEcho:root';
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

/** Probe/gate readout: what she costs right now. */
export function marensEchoRenderState(): { body: boolean; draws: number } {
  const bodyDraws = rig ? 1 + (rig.glow ? 1 : 0) : 0;
  return {
    body: !!rig && !!outer && outer.visible,
    draws: outer && outer.visible ? bodyDraws : 0,
  };
}

export function updateMarensEcho(world: WorldState, _dt: number): void {
  if (!outer || !inner) return;
  const s = world.marensEcho;

  const visible = echoActive(s) && s.params !== null;
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

  // She comes up out of the dark rather than appearing: the arrival is the only
  // motion in the encounter that is not the keeper's own doing.
  const rise = s.phase === 'arrive' ? Math.min(1, (ARRIVE_SECONDS - s.timer) / ARRIVE_SECONDS) : 1;
  outer.position.set(s.x, STAND_Y - (1 - rise) * ARRIVE_RISE, s.z);
  outer.scale.setScalar(readabilityScale(rigFor));
  outer.rotation.y = s.facing; // away from the boat, the whole way in
  inner.rotation.x = STAND_PITCH;

  // THE MIRROR: the sim's sway phase, negated. Not a travelling wave like the
  // Postmaster's coat — one slow lean of the whole figure, so she reads as
  // something standing in a current rather than something swimming in one.
  const lean = -Math.sin(s.swayPhase) * SWAY_BEND;
  for (let i = 0; i < spine.length; i++) {
    spine[i] = lean * (i / Math.max(1, spine.length - 1));
  }
  bendFishRig(rig, spine);
}
