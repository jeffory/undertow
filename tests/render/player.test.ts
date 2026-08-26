// PLAYER CLIPS — T11 acceptance for the keeper AnimationMixer path. The rigged
// keeper GLB ships an 'idle' loop and a 'reel' loop; the player must play idle
// on load, crossfade to reel while a tether fight is running, and fall back to
// the old static behaviour for a GLB with no clips. The visual read is the
// browser screenshot; this pins the wiring.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { createWorld } from '../../src/core/world';

// The asset module is stubbed so the test never touches the network or a GLB.
const stub = vi.hoisted(() => ({
  group: null as THREE.Group | null,
  clips: [] as THREE.AnimationClip[],
}));

vi.mock('../../src/render/assets', () => ({
  hasAsset: () => stub.group !== null,
  getAsset: () => stub.group,
  getAssetClips: () => stub.clips,
}));

const { initPlayer, updatePlayer } = await import('../../src/render/player');

// A one-bone skinned rig, plus clips that drive that bone along distinct axes
// so which clip is winning can be read straight off the bone's position.
function rigged(): { group: THREE.Group; bone: THREE.Bone } {
  const bone = new THREE.Bone();
  bone.name = 'b';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial());
  const group = new THREE.Group();
  group.add(bone);
  group.add(mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  return { group, bone };
}

function clip(name: string, axis: 'x' | 'y'): THREE.AnimationClip {
  const to = axis === 'x' ? [1, 0, 0] : [0, 1, 0];
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('b.position', [0, 1], [0, 0, 0, ...to]),
  ]);
}

function step(world: ReturnType<typeof createWorld>, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) updatePlayer(world, dt);
}

describe('keeper clip playback', () => {
  let world: ReturnType<typeof createWorld>;

  beforeEach(() => {
    world = createWorld(7);
    world.mode = 'foot';
    stub.group = null;
    stub.clips = [];
  });

  it('plays idle on a rigged keeper and holds it with no fight', () => {
    const { group, bone } = rigged();
    stub.group = group;
    stub.clips = [clip('idle', 'y'), clip('reel', 'x')];
    initPlayer(new THREE.Scene());

    step(world, 0.5);
    expect(bone.position.y).toBeGreaterThan(0.3); // idle is advancing
    expect(bone.position.x).toBeCloseTo(0, 5); // reel is not
  });

  it('crossfades to reel while a tether fight is active, then back to idle', () => {
    const { group, bone } = rigged();
    stub.group = group;
    stub.clips = [clip('idle', 'y'), clip('reel', 'x')];
    initPlayer(new THREE.Scene());
    step(world, 0.5);

    world.tether.fights.push({} as never); // same check render/lines.ts uses
    step(world, 0.6); // past the 0.25s crossfade
    expect(bone.position.x).toBeGreaterThan(0.3); // reel has taken over

    world.tether.fights.length = 0;
    step(world, 0.6);
    expect(bone.position.x).toBeLessThan(0.1); // faded back out
  });

  it('leaves a clip-less GLB completely alone (the static keeper path)', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    group.add(mesh);
    stub.group = group;
    stub.clips = [];
    initPlayer(new THREE.Scene());

    const before = mesh.position.clone();
    world.tether.fights.push({} as never);
    step(world, 1.0);
    expect(mesh.position.equals(before)).toBe(true);
    expect(group.parent).not.toBeNull(); // still mounted, just not animated
  });
});
