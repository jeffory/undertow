// THE CONGREGATION — swarm render (M6, plan 05 §2.1: "the swarm is 20-40 small
// members orbiting the tether point (all instances from t4's shared mesh pool)").
//
// The whole school is ONE InstancedMesh: one geometry, one material, one draw
// call however many members the seed grew — the same budget discipline the kelp
// field is drawn under (render/kelp.ts), and the whole of the boss's ~2-draw
// perf allowance.
//
// The members are NOT fish rigs. A full FishRig per member would be 20-40
// generated lathes rebuilt per fight; what the fight needs is a readable school
// of small dark bodies holding a ring around the hooked centre. So the instance
// geometry is a hand-rolled minimum fish — nose, four-sided body ring, tail fin,
// ~10 triangles — carrying the same dark-dorsal / pale-belly two-tone the real
// rig paints, so at swarm scale it reads as the same animal. The hooked centre
// itself is still the ordinary species mesh (render/fish.ts): one real fish,
// dozens of instanced shapes around it.
//
// Every position comes from bosses/congregation.ts's `memberPosition` — the same
// pure function the sim uses — so nothing about the look can drift from the
// fight.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { memberPosition } from '../bosses/congregation';
import { WATER_FISH_Y } from './fishMesh';
import { groundYAt } from './lake';

const DORSAL = 0x0d1a18; // near-black teal — the top of a small dark fish
const BELLY = 0xa9b6a4; // pale, so the school flickers as it turns

let root: THREE.Group | null = null;
let mesh: THREE.InstancedMesh | null = null;
let capacity = 0;

const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// The minimum fish: nose at +Z, a four-vertex body ring, a tail base and a
// two-lobed caudal fin. Unit length 1 along Z so an instance scales to size.
function makeMemberGeometry(): THREE.BufferGeometry {
  const w = 0.16; // half-width
  const h = 0.22; // half-height
  const verts: number[] = [
    0, 0, 0.5, // 0 nose
    w, 0, 0.12, // 1 ring +X
    0, h, 0.12, // 2 ring +Y (dorsal)
    -w, 0, 0.12, // 3 ring −X
    0, -h, 0.12, // 4 ring −Y (belly)
    0, 0, -0.35, // 5 tail base
    0, 0.28, -0.5, // 6 caudal upper
    0, -0.28, -0.5, // 7 caudal lower
  ];
  const idx = [
    // nose cone
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1,
    // body → tail base
    5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4,
    // caudal fin (double-sided by winding both ways)
    5, 6, 7, 5, 7, 6,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);

  const dorsal = new THREE.Color(DORSAL);
  const belly = new THREE.Color(BELLY);
  const c = new THREE.Color();
  const colors = new Float32Array(verts.length);
  for (let v = 0; v < verts.length / 3; v++) {
    const y = verts[v * 3 + 1]!;
    // −h (belly) → 0, +h (dorsal) → 1
    const t = Math.max(0, Math.min(1, (y + h) / (2 * h)));
    // sqrt-biased toward the dorsal so the school reads DARK with a pale
    // underside — a linear (or squared) ramp leaves the mid-body pale and the
    // members read as bright shards rather than small fish.
    c.lerpColors(belly, dorsal, Math.sqrt(t));
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function disposeMesh(): void {
  if (!mesh || !root) return;
  root.remove(mesh);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  mesh = null;
  capacity = 0;
}

function ensureMesh(count: number): void {
  if (!root) return;
  if (mesh && capacity >= count) return;
  disposeMesh();
  if (count <= 0) return;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m = new THREE.InstancedMesh(makeMemberGeometry(), mat, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.name = 'congregation:swarm';
  mesh = m;
  capacity = count;
  root.add(m);
}

export function initCongregation(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'congregation:root';
  root.visible = false;
  scene.add(root);
}

// Probe/gate readout: what the school costs right now.
export function congregationRenderState(): {
  members: number;
  instances: number;
  draws: number;
  visible: boolean;
} {
  return {
    members: capacity,
    instances: mesh ? mesh.count : 0,
    draws: mesh && root && root.visible ? 1 : 0,
    visible: !!root && root.visible,
  };
}

export function updateCongregation(world: WorldState, _dt: number): void {
  if (!root) return;
  const state = world.congregation;
  if (!state.active || state.members.length === 0 || !world.fish) {
    root.visible = false;
    return;
  }
  ensureMesh(state.members.length);
  if (!mesh) return;
  root.visible = true;

  const fish = world.fish;
  const centre = { x: fish.x, z: fish.z };
  const baseY =
    world.mode === 'boat' ? WATER_FISH_Y : groundYAt(world, fish.x, fish.z) + 0.35;

  for (let i = 0; i < state.members.length; i++) {
    const m = state.members[i]!;
    const p = memberPosition(m, centre, state.elapsed);
    if (!p.visible) {
      mesh.setMatrixAt(i, ZERO);
      continue;
    }
    // face along the orbit tangent (or the drift, once torn off)
    const ahead = memberPosition(m, centre, state.elapsed + 0.05);
    const dx = ahead.x - p.x;
    const dz = ahead.z - p.z;
    const facing = Math.hypot(dx, dz) > 1e-5 ? Math.atan2(dx, dz) : 0;
    _quat.setFromAxisAngle(_axisY, facing);
    _pos.set(p.x, baseY + p.y, p.z);
    _scale.setScalar(m.scale);
    _matrix.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
