// TOWNSHIP RENDER — the drowned Hollow (M7 round 1, plan 05 §2.2: "the drowned
// Hollow — walkable rooftops over flooded streets, sodium-lamp amber palette,
// the cinema marquee lit underwater, church steeple").
//
// Three layers, cheapest first:
//
//   1. THE DECKS. Every roof's walkable surface as ONE InstancedMesh — a thin
//      wet-slate slab scaled per roof to the EXACT polygon gen/township.ts gave
//      collision. One draw call for the whole street, and it stands in before
//      (or instead of) any GLB, so a roof is never a hole you fall through.
//   2. THE BUILDINGS. The M5 town GLBs (public/assets/town/*.glb) SUBMERGED.
//      They are not in assets/manifest.json — a run that never reaches zone 3
//      must not fetch twelve houses — so they are requested on demand the first
//      frame the street exists (render/town.ts's requestAsset pattern) and
//      swapped in when they land. Each is sunk so the waterline crosses its
//      upper walls (roof.waterlineFrac), leaving the pitch above the flood.
//   3. THE AMBER. Drowned streetlamps — one InstancedMesh of poles breaking the
//      surface plus a shared additive halo sprite per lamp (the bell-buoy
//      caged-lantern technique from render/lake.ts, no PointLight anywhere) —
//      and the cinema's MARQUEE: an emissive canvas-texture plane hung on the
//      street-facing wall UNDER the water, still advertising SOMETHING IN THE
//      WATER. The canvas texture is the one DOM-generated texture here, matching
//      the wake-sprite / buoy-halo precedent.
//
// Everything is driven off lake.roofs / lake.lamps, which are empty outside
// zone 3 — so this module is a visibility flag and a return in every other
// zone. The decks are built from the same numbers the hull collision uses, so
// what you stand on can never drift from what you see.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { LakeMap } from '../gen/lakeMap';
import type { Roof } from '../gen/township';
import { marqueeAnchor } from '../gen/township';
import { MARQUEE_TEXT } from '../content/envText';
import { GROUND_Y } from './lake';
import { getAsset, hasAsset, requestAsset } from './assets';
import { townAssetId, townModelUrl } from './town';

// Wet slate, a shade colder than the islet rock — a roof under a flood reads
// blue-black, and the amber has to be the only warm thing on the street.
const DECK_LO = 0x0d1216;
const DECK_HI = 0x1b2329;
const DECK_THICKNESS = 0.22; // m

// Sodium lamp: the zone's signature. Hot amber core, iron pole.
const LAMP_GLASS = 0xffc46a;
const LAMP_POLE = 0x0a0806;
const LAMP_HALO_SCALE = 1.9;
const POLE_RADIUS = 0.075;

// The marquee: emissive sodium amber, drawn UNDER the surface, fog off so the
// murk cannot swallow the one line the zone exists to show you.
const MARQUEE_W = 6.0; // m
const MARQUEE_H = 1.6;
// The sign is DROWNED, not sunk: it hangs so the flood cuts across the letters
// — most of it under the surface, glowing up through the water, with the top
// edge breaking clear so it is legible from a boat rowing past. A fully
// submerged plane would be invisible: the water plane is opaque from above.
const MARQUEE_DEPTH = 0.34; // m — the plane's CENTRE, relative to the water
const MARQUEE_AMBER = '#ffb45e';

// The GLBs face +X as prepped (render/town.ts MODEL_FACING); the roof yaw turns
// a +Z-facing box down the street, so the same −90° reconciliation applies.
const MODEL_FACING = -Math.PI / 2;

let root: THREE.Group | null = null;
let decks: THREE.InstancedMesh | null = null;
let models: THREE.Group | null = null;
let poles: THREE.InstancedMesh | null = null;
let lampGroup: THREE.Group | null = null;
let marquee: THREE.Mesh | null = null;
let haloTexture: THREE.Texture | null = null;
let haloMaterial: THREE.SpriteMaterial | null = null;
let marqueeTexture: THREE.Texture | null = null;
let marqueeMaterial: THREE.MeshBasicMaterial | null = null;

let builtFor: LakeMap | null = null;
let builtMask = '';
let modelCount = 0;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _axisY = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

// A unit slab (1×1×1, origin at the TOP face) with the top lit and the sides in
// shade — so a deck reads as a flat plate seen from above, which is how the
// player will always see it.
function makeDeckGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, -0.5, 0); // origin → the walkable top face
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const lo = new THREE.Color(DECK_LO);
  const hi = new THREE.Color(DECK_HI);
  for (let f = 0; f < 6; f++) {
    const c = f === 2 ? hi : lo; // +Y is the slate you walk on
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// The buoy-lantern halo, rebuilt here in sodium amber (a warmer, wider splat —
// a streetlamp under water throws a bigger, softer cone than a caged bulb).
function makeLampHalo(): THREE.Sprite {
  if (!haloTexture) {
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 64;
    const g = cnv.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 200, 118, 1.0)');
    grad.addColorStop(0.22, 'rgba(255, 176, 88, 0.72)');
    grad.addColorStop(0.55, 'rgba(255, 148, 58, 0.26)');
    grad.addColorStop(1, 'rgba(255, 138, 48, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(cnv);
  }
  if (!haloMaterial) {
    haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
  }
  const s = new THREE.Sprite(haloMaterial);
  s.scale.setScalar(LAMP_HALO_SCALE);
  return s;
}

// The marquee's lettering, drawn once to a canvas. plan §4.3 keeps signage as
// DOM overlays for zero draw cost — but the marquee is DIEGETIC (it is lit,
// underwater, and you read it from the boat before you can reach it), so it is
// geometry, exactly as the wake sprite and the buoy halo are.
function marqueeMat(): THREE.MeshBasicMaterial {
  if (marqueeMaterial) return marqueeMaterial;
  const cnv = document.createElement('canvas');
  cnv.width = 1024;
  cnv.height = 256;
  const g = cnv.getContext('2d')!;
  g.fillStyle = '#120c06';
  g.fillRect(0, 0, 1024, 256);
  // the bulb border
  g.fillStyle = MARQUEE_AMBER;
  for (let x = 16; x < 1024; x += 34) {
    g.beginPath();
    g.arc(x, 18, 7, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x, 238, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.font = 'bold 92px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff0d2';
  g.shadowColor = MARQUEE_AMBER;
  g.shadowBlur = 34;
  // the lettering sits high on the board: the flood cuts across the lower
  // third, so the words stay legible from the channel while the sign drowns
  g.fillText(MARQUEE_TEXT, 512, 104);
  g.shadowBlur = 0;
  marqueeTexture = new THREE.CanvasTexture(cnv);
  marqueeMaterial = new THREE.MeshBasicMaterial({
    map: marqueeTexture,
    fog: false,
    transparent: false,
    side: THREE.DoubleSide,
  });
  return marqueeMaterial;
}

function disposeBuilt(): void {
  if (!root) return;
  for (const child of [...root.children]) root.remove(child);
  decks?.geometry.dispose();
  (decks?.material as THREE.Material | undefined)?.dispose();
  poles?.geometry.dispose();
  (poles?.material as THREE.Material | undefined)?.dispose();
  marquee?.geometry.dispose();
  decks = null;
  poles = null;
  models = null;
  lampGroup = null;
  marquee = null;
  modelCount = 0;
}

// Build one submerged building: the GLB turned down the street, scaled to the
// roof's footprint, and sunk so the flood line crosses its upper walls.
function makeSubmerged(model: THREE.Group, roof: Roof): THREE.Group {
  const group = new THREE.Group();
  model.rotation.y = MODEL_FACING;
  _box.setFromObject(model);
  _box.getSize(_size);
  const widest = Math.max(_size.x, _size.z);
  const fit = widest > 1e-4 ? roof.footprint / widest : 1;
  model.scale.setScalar(fit);
  // the GLB's own base may not sit at y = 0 — measure it and re-zero
  model.position.y = -_box.min.y * fit;
  group.add(model);
  // Sink: the waterline (y = 0) sits waterlineFrac up the building's own height.
  group.position.set(roof.pos.x, -_size.y * fit * roof.waterlineFrac, roof.pos.z);
  group.rotation.y = roof.yaw;
  group.name = `township:${roof.slot}:${roof.building}`;
  return group;
}

function buildMarquee(lake: LakeMap): THREE.Mesh | null {
  const cinema = lake.roofs.find((r) => r.slot === 'marquee');
  if (!cinema || !lake.street) return null;
  const at = marqueeAnchor(lake.street, cinema);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MARQUEE_W, MARQUEE_H), marqueeMat());
  mesh.name = 'township:marquee';
  mesh.position.set(at.x, MARQUEE_DEPTH, at.z);
  // face across the street: the wall normal is the street perpendicular, on the
  // side the cinema does NOT stand on
  const nx = -lake.street.perp.x * cinema.side;
  const nz = -lake.street.perp.z * cinema.side;
  mesh.rotation.y = Math.atan2(nx, nz);
  return mesh;
}

function rebuild(lake: LakeMap): void {
  if (!root) return;
  disposeBuilt();
  if (lake.roofs.length === 0) return;

  // --- 1. the decks: ONE InstancedMesh for every walkable roof ----------------
  const deckMesh = new THREE.InstancedMesh(
    makeDeckGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    lake.roofs.length,
  );
  deckMesh.name = 'township:decks';
  for (let i = 0; i < lake.roofs.length; i++) {
    const roof = lake.roofs[i]!;
    _pos.set(roof.pos.x, GROUND_Y + roof.deckRise, roof.pos.z);
    _quat.setFromAxisAngle(_axisY, roof.yaw);
    // the slab spans the roof polygon exactly — same halfX/halfZ collision uses
    _scale.set(roof.halfX * 2, DECK_THICKNESS, roof.halfZ * 2);
    _matrix.compose(_pos, _quat, _scale);
    deckMesh.setMatrixAt(i, _matrix);
  }
  deckMesh.instanceMatrix.needsUpdate = true;
  decks = deckMesh;
  root.add(deckMesh);

  // --- 2. the submerged buildings --------------------------------------------
  models = new THREE.Group();
  models.name = 'township:models';
  root.add(models);
  for (const roof of lake.roofs) {
    const id = townAssetId(roof.building);
    if (!hasAsset(id)) continue;
    const model = getAsset(id);
    if (!model) continue;
    models.add(makeSubmerged(model, roof));
  }
  modelCount = models.children.length;

  // --- 3. the amber: poles (instanced) + one halo sprite each ------------------
  if (lake.lamps.length > 0) {
    const poleMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(POLE_RADIUS * 0.6, POLE_RADIUS, 1, 5),
      new THREE.MeshLambertMaterial({ color: LAMP_POLE, flatShading: true }),
      lake.lamps.length,
    );
    poleMesh.name = 'township:lamp-poles';
    lampGroup = new THREE.Group();
    lampGroup.name = 'township:lamps';
    for (let i = 0; i < lake.lamps.length; i++) {
      const lamp = lake.lamps[i]!;
      // the pole runs from below the surface up to the glass
      const base = -1.6;
      const len = lamp.height + 1.6;
      _pos.set(lamp.pos.x, base + len / 2, lamp.pos.z);
      _quat.setFromAxisAngle(_axisY, 0);
      _scale.set(1, len, 1);
      _matrix.compose(_pos, _quat, _scale);
      poleMesh.setMatrixAt(i, _matrix);

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.24, 0.2),
        new THREE.MeshBasicMaterial({ color: LAMP_GLASS, fog: false }),
      );
      glass.position.set(lamp.pos.x, lamp.height, lamp.pos.z);
      glass.name = `township:lamp-glass:${lamp.id}`;
      lampGroup.add(glass);

      const halo = makeLampHalo();
      halo.position.set(lamp.pos.x, lamp.height, lamp.pos.z);
      lampGroup.add(halo);
    }
    poleMesh.instanceMatrix.needsUpdate = true;
    poles = poleMesh;
    root.add(poleMesh);
    root.add(lampGroup);
  }

  // --- the marquee -------------------------------------------------------------
  const m = buildMarquee(lake);
  if (m) {
    marquee = m;
    root.add(m);
  }
}

export function initTownship(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'township:root';
  scene.add(root);
}

/** The probe/gate readout: what the drowned street is worth right now. */
export function townshipRenderState(): {
  roofs: number;
  decks: number;
  deckDraws: number;
  models: number;
  lamps: number;
  lampDraws: number;
  marquee: boolean;
  draws: number;
  tris: number;
} {
  const roofs = decks ? decks.count : 0;
  const lampCount = poles ? poles.count : 0;
  // poles are ONE instanced draw; each lamp adds a glass cube + a halo sprite
  const lampDraws = lampCount > 0 ? 1 + lampCount * 2 : 0;
  let modelDraws = 0;
  let tris = 0;
  if (models) {
    models.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      modelDraws++;
      const idx = mesh.geometry?.getIndex();
      const pos = mesh.geometry?.getAttribute('position');
      tris += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
    });
  }
  return {
    roofs,
    decks: roofs,
    deckDraws: decks ? 1 : 0,
    models: modelCount,
    lamps: lampCount,
    lampDraws,
    marquee: !!marquee,
    draws: (decks ? 1 : 0) + modelDraws + lampDraws + (marquee ? 1 : 0),
    tris: Math.round(tris),
  };
}

export function updateTownship(world: WorldState, _dt: number): void {
  if (!root) return;
  const lake = world.lake;
  if (!lake || lake.roofs.length === 0) {
    if (builtFor !== lake) {
      disposeBuilt();
      builtFor = lake;
      builtMask = '';
    }
    root.visible = false;
    return;
  }

  // A drowned building's mesh is fetched the first frame the street exists, and
  // never before — a run that stops at the Kelp Graves pays for none of them.
  let mask = '';
  for (const roof of lake.roofs) {
    const id = townAssetId(roof.building);
    requestAsset(id, townModelUrl(roof.building));
    mask += hasAsset(id) ? '1' : '0';
  }

  if (builtFor !== lake || mask !== builtMask) {
    rebuild(lake);
    builtFor = lake;
    builtMask = mask;
  }
  root.visible = true;

  // The sodium lamps breathe — mains hum, not a pulse. One shared material, so
  // this is a single write however many lamps the street grew.
  if (haloMaterial) {
    const t = world.time.elapsed;
    haloMaterial.opacity = 0.66 + 0.13 * Math.sin(t * 1.15);
  }
}
