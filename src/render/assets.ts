// ASSETS — manifest-driven async GLTF loading (plan 07). At boot loadAssets()
// kicks off GLTFLoader for every entry in assets/manifest.json; render modules
// call getAsset(id) to swap a primitive for the loaded model once available.
// The primitive stays as the fallback while (or if) the asset fails to load —
// the game must still boot with no network. Render-side only (three imports OK).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import manifest from '../../assets/manifest.json';

export interface AssetEntry {
  url: string;
  height: number;
  tint?: string; // optional hex color multiplied into the Lambert base color
}

export type AssetManifest = Record<string, AssetEntry>;

// The module-level manifest, keyed by id.
const MANIFEST = manifest as AssetManifest;

interface LoadedAsset {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

const loaded = new Map<string, LoadedAsset>();
let loader: GLTFLoader | null = null;

function makeLoader(): GLTFLoader {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

// Convert a PBR (MeshStandardMaterial) material to the game's flat-shaded look:
// keep the base-color texture and base color, drop the metalness/roughness maps
// (the game never uses PBR, and dropping them lightens the fragment cost). Any
// non-standard material is left untouched. An optional per-asset tint (hex,
// from the manifest) is multiplied into the Lambert base color so a whole
// model (e.g. the keeper's oilskin coat) can be warmed in-engine without
// touching the GLB.
function toLambert(src: THREE.Material, tint: THREE.Color | null): THREE.Material {
  if (src instanceof THREE.MeshStandardMaterial) {
    const lam = new THREE.MeshLambertMaterial();
    lam.name = src.name;
    lam.color.copy(src.color);
    if (tint) lam.color.multiply(tint);
    if (src.map) lam.map = src.map;
    if (src.vertexColors) lam.vertexColors = true;
    return lam;
  }
  return src;
}

// Walk a loaded GLTF scene and swap every mesh's PBR material for a Lambert one.
function flattenMaterials(root: THREE.Object3D, tint: THREE.Color | null): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => toLambert(m, tint));
    } else {
      mesh.material = toLambert(mesh.material, tint);
    }
  });
}

// Kick off loads for every manifest entry. Failures are logged as warnings and
// leave the entry missing so the caller falls back to its primitive.
export function loadAssets(): void {
  for (const id of Object.keys(MANIFEST)) {
    const entry = MANIFEST[id];
    if (!entry) continue;
    makeLoader().load(
      entry.url,
      (gltf) => {
        const tint = entry.tint ? new THREE.Color(entry.tint) : null;
        flattenMaterials(gltf.scene, tint);
        loaded.set(id, { scene: gltf.scene, clips: gltf.animations ?? [] });
      },
      undefined,
      (err) => {
        // Network/parse failure — keep the primitive fallback, don't crash.
        console.warn(`[assets] failed to load '${id}' from ${entry.url}:`, err);
      }
    );
  }
}

// Does this loaded scene contain a skinned mesh (i.e. is it rigged)?
function isSkinned(root: THREE.Object3D): boolean {
  let skinned = false;
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  return skinned;
}

// Returns a fresh clone of the loaded model, or null while loading / on failure.
// Cloning lets every caller (e.g. the player) own its own copy of the scene
// NODES — but Object3D.clone() SHARES geometries/materials with the cached
// source, so clones are tagged sharedAsset and must never be disposed (see
// render/lake.ts disposeObject): disposing one would free the cache's buffers
// and every later clone would render as nothing.
//
// Rigged assets go through SkeletonUtils.clone instead: plain Object3D.clone()
// copies a SkinnedMesh's skeleton by REFERENCE, so the clone's mesh would still
// be driven by the cached source's bones and every clone would animate in
// lockstep (or not at all). SkeletonUtils rebinds each clone to its own bones.
export function getAsset(id: string): THREE.Group | null {
  const src = loaded.get(id);
  if (!src) return null;
  const clone = (
    isSkinned(src.scene) ? cloneSkinned(src.scene) : src.scene.clone()
  ) as THREE.Group;
  clone.userData.sharedAsset = true;
  return clone;
}

// The AnimationClips that shipped inside the GLB, or [] for a static asset.
// Callers bind these to their own THREE.AnimationMixer over their own clone.
export function getAssetClips(id: string): THREE.AnimationClip[] {
  return loaded.get(id)?.clips ?? [];
}

// Loaded-state helper so the player knows whether to keep the primitive.
export function hasAsset(id: string): boolean {
  return loaded.has(id);
}
