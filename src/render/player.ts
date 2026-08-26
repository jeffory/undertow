// PLAYER — M1 scaffold: a low-poly keeper figure. A procedural primitive
// (capsule torso + head + limbs, ~140 tris, vertex colours only) is the
// pre-load fallback; once the generated keeper model (assets/manifest.json ->
// public/assets/keeper.glb) lands, the primitive is swapped for the loaded
// model, keeping the same position / facing / roll-animation transform hooks.
// Positioned/rotated from world.player each frame; shown only in foot mode.
// The figure faces +Z in local space so rotation.y = world.player.facing
// matches the movement convention (facing 0 = +Z, +PI/2 = +X).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { GROUND_Y } from './ground';
import { groundYAt } from './lake';
import { getAsset, getAssetClips, hasAsset } from './assets';
import { ROWBOAT_SCALE } from '../game/boat';

const DODGE_DURATION = 0.25; // seconds; matches the 0.25s i-frame roll window

// --- keeper animation (rigged GLB only) ---------------------------------------
// A rigged keeper GLB ships two loops: 'idle' (breathing sway) and 'reel' (the
// rhythmic haul). The reel plays while a tether fight is running — the same
// world.tether.fights.length check render/lines.ts uses to show the line — and
// crossfades back to idle when the fight ends. A GLB with no clips (the current
// public/assets/keeper.glb) leaves the mixer null and renders exactly as before.
const CLIP_IDLE = 'idle';
const CLIP_REEL = 'reel';
const CROSSFADE = 0.25; // seconds; long enough to hide the pose pop, short
                        // enough that the haul still lands with the hook-set

// The generated keeper GLB faces +Z natively (verified from the model's
// geometry: the face/skin side of the head sits on +Z), which matches the
// game's movement convention (facing 0 = +Z). Keep this at 0; raise it only if
// a re-export ever bakes in a different forward axis — never edit the GLB.
const KEEPER_BASE_YAW = 0;

// --- palette (dark keeper: coat, head, hands) ---------------------------------
const COAT = 0x3a4a5a; // deep keeper blue-grey (fallback only)
const COAT_DARK = 0x2a3644; // limbs
const HEAD = 0x7a5a42; // weathered skin
const BOOTS = 0x1e1a16; // near-black boots

// --- warm night fill (task: make the keeper read after dark) ------------------
// A small, subtle warm point light parented to the player so the loaded keeper
// pops at night without flattening the cool-moon scene mood. Positioned just
// ahead of the torso (local +Z is the model's facing) so it grazes the coat
// from the front — the direction the camera/player tends to face.
const FILL_COLOR = 0xff9a5e;
const FILL_INTENSITY = 2.6;
const FILL_DISTANCE = 4.5;
const FILL_POS = new THREE.Vector3(0, 0.85, 0.35); // front-chest, on the coat

// Subtle warm emissive lift on the loaded keeper's materials, so the coat
// reads as oilskin yellow even in shadow under the cool moon. Kept warm and
// low so it warms rather than flattens.
const KEEPER_EMISSIVE = 0x4a3818;

let root: THREE.Group | null = null; // holds primitive OR loaded model
let modelGroup: THREE.Group | null = null; // base-yaw wrapper holding the model
let fillLight: THREE.PointLight | null = null;
let primitive: THREE.Group | null = null; // fallback figure
let swapped = false; // have we swapped primitive -> loaded model?
let mixer: THREE.AnimationMixer | null = null; // null for a clip-less GLB
let idleAction: THREE.AnimationAction | null = null;
let reelAction: THREE.AnimationAction | null = null;
let reeling = false; // which clip the mixer is currently faded to

// Paint a geometry a single flat colour (flat shading via MeshLambertMaterial).
function tint(geo: THREE.BufferGeometry, color: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function limb(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0); // origin at the joint/floor end
  return geo;
}

function buildPrimitive(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  // torso — low-poly capsule
  const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.62, 2, 6);
  tint(torsoGeo, COAT);
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.position.y = 0.82;
  group.add(torso);

  // head
  const headGeo = new THREE.BoxGeometry(0.32, 0.3, 0.32);
  tint(headGeo, HEAD);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 1.38;
  group.add(head);

  // arms — hanging at the sides
  for (const side of [-1, 1] as const) {
    const armGeo = limb(0.12, 0.62, 0.12);
    tint(armGeo, COAT_DARK);
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.set(side * 0.34, 0.62, 0);
    group.add(arm);
  }

  // legs
  for (const side of [-1, 1] as const) {
    const legGeo = limb(0.14, 0.42, 0.14);
    tint(legGeo, BOOTS);
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(side * 0.12, 0.0, 0);
    group.add(leg);
  }
  return group;
}

export function initPlayer(scene: THREE.Scene): void {
  root = new THREE.Group();
  mixer = null;
  idleAction = null;
  reelAction = null;
  reeling = false;
  swapped = false;
  primitive = buildPrimitive();
  root.add(primitive);

  // The model (once loaded) goes in its own group so a corrective base yaw can
  // be applied without fighting the per-frame facing rotation on `root`.
  modelGroup = new THREE.Group();
  modelGroup.rotation.y = KEEPER_BASE_YAW;
  root.add(modelGroup);

  // Subtle warm fill light so the loaded keeper reads at night.
  fillLight = new THREE.PointLight(FILL_COLOR, FILL_INTENSITY, FILL_DISTANCE, 2);
  fillLight.position.copy(FILL_POS);
  root.add(fillLight);

  root.position.y = GROUND_Y;
  root.visible = false; // foot mode only
  root.name = 'player:root';
  scene.add(root);
}

// Swap the primitive fallback for the loaded keeper model once available.
function trySwap(): void {
  if (swapped || !root || !hasAsset('keeper')) return;
  const model = getAsset('keeper');
  if (!model) return;
  if (primitive) {
    root.remove(primitive);
    // free the fallback's buffers — this module built them, nothing shares them
    primitive.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    primitive = null;
  }
  // Model origin is at the feet and +Y is up (see prep.py normalize); it
  // already matches the keeper's height/radius, so no extra scale is needed
  // beyond the 1.8m build height. The loaded asset is a group clone, mounted
  // inside the base-yaw wrapper. A subtle warm emissive lifts the coat so the
  // keeper stays readable against the cool moonlit scene.
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshLambertMaterial) m.emissive.setHex(KEEPER_EMISSIVE);
    }
  });
  modelGroup!.add(model);
  bindClips(model);
  swapped = true;
}

// Wire up the mixer if the loaded keeper carries clips. Everything here is
// optional: no clips (or no 'idle') means no mixer, and the model just stands
// there the way the static keeper always has.
// Swap the keeper's warm emissive lift per mode (cheap: only writes when the
// value actually changes). Aboard, the bow lantern owns the light and the
// emissive would keep the silhouette glowing.
let curEmissive = -1;
function setKeeperEmissive(hex: number): void {
  if (curEmissive === hex || !modelGroup) return;
  curEmissive = hex;
  modelGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshLambertMaterial) m.emissive.setHex(hex);
    }
  });
}

function bindClips(model: THREE.Group): void {
  const clips = getAssetClips('keeper');
  if (clips.length === 0) return;
  const idle = THREE.AnimationClip.findByName(clips, CLIP_IDLE) ?? clips[0]!;
  const reel = THREE.AnimationClip.findByName(clips, CLIP_REEL);

  mixer = new THREE.AnimationMixer(model);
  idleAction = mixer.clipAction(idle);
  idleAction.setLoop(THREE.LoopRepeat, Infinity);
  idleAction.play();
  // The reel action is created but NOT started: an action parked at weight 0
  // can never fade back in, because fadeIn scales the action's own weight
  // rather than replacing it. It gets reset/re-weighted on the first crossfade.
  if (reel) {
    reelAction = mixer.clipAction(reel);
    reelAction.setLoop(THREE.LoopRepeat, Infinity);
  }
  reeling = false;
}

// Crossfade between the two loops on the tether-fight edge. With no 'reel'
// clip this is a no-op and idle keeps playing throughout.
function updateClips(world: WorldState, dt: number): void {
  if (!mixer) return;
  const fighting = world.tether.fights.length > 0;
  if (reelAction && idleAction && fighting !== reeling) {
    const from = reeling ? reelAction : idleAction;
    const to = reeling ? idleAction : reelAction;
    // Restart the incoming clip from its first frame so the haul reads as a
    // fresh pull rather than picking up mid-stroke.
    from.fadeOut(CROSSFADE);
    to.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE).play();
    reeling = fighting;
  }
  mixer.update(dt);
}

export function updatePlayer(world: WorldState, dt: number): void {
  if (!root) return;

  trySwap();

  const foot = world.mode === 'foot';
  root.visible = true; // foot: standing on the islet; boat: riding the deck
  updateClips(world, dt);

  // Boat mode: the keeper rides amidships (slightly aft), facing the bow, on
  // the deck of the bobbing hull — the empty self-sailing boat read is gone.
  // The hull's bob height is world.boat.y; the dinghy's deck sits ~0.32 above.
  if (!foot) {
    // Aboard, the bow lantern owns the lighting: kill the keeper's own warm
    // fill so his camera side falls dark and he reads as a shape against his
    // own light (USER art direction). Foot mode restores the fill below.
    if (fillLight) fillLight.intensity = 0.5;
    setKeeperEmissive(0x140f08); // near-none: the silhouette must go dark
    const b = world.boat;
    const ox = 0;
    const oz = -0.25; // a step aft of centre, clear of the bench
    root.position.x = b.x + Math.sin(b.heading) * oz + Math.cos(b.heading) * ox;
    root.position.z = b.z + Math.cos(b.heading) * oz - Math.sin(b.heading) * ox;
    // The hull model renders at ROWBOAT_SCALE (~0.865) of its native size, so
    // a full-size keeper read ~15% oversized aboard (USER report) — match the
    // hull's scale (this restores the review-sheet proportions exactly), and
    // scale the deck offset with it.
    root.scale.setScalar(ROWBOAT_SCALE);
    root.position.y = b.y + 0.32 * ROWBOAT_SCALE;
    root.rotation.y = b.heading;
    root.rotation.z = 0;
    return;
  }
  root.scale.setScalar(1);
  if (fillLight) fillLight.intensity = FILL_INTENSITY;
  setKeeperEmissive(KEEPER_EMISSIVE);

  const p = world.player;
  root.position.x = p.x;
  root.position.z = p.z;
  // Feet meet the terrain: the foot player stands on the faceted islet surface
  // (falls back to the flat GROUND_Y when there is no lake).
  root.position.y = groundYAt(world, p.x, p.z);
  root.rotation.y = p.facing;

  // Roll hook: while dodge.active, tilt the figure sideways and spin it once
  // around the roll axis, reading as a tumble. Progress runs 0→1 over the roll.
  if (p.dodge.active) {
    const rollT = 1 - Math.min(Math.max(p.dodge.timeLeft / DODGE_DURATION, 0), 1);
    root.rotation.z = Math.sin(rollT * Math.PI) * 0.9;
    root.rotation.y = p.facing + rollT * Math.PI * 2;
  } else {
    root.rotation.z = 0;
  }
}
