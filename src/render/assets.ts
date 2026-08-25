// ASSETS — manifest-driven async GLTF loading (plan 07). At boot loadAssets()
// kicks off GLTFLoader for every entry in assets/manifest.json; render modules
// call getAsset(id) to swap a primitive for the loaded model once available.
// The primitive stays as the fallback while (or if) the asset fails to load —
// the game must still boot with no network. Render-side only (three imports OK).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from '../../assets/manifest.json';

export interface AssetEntry {
  url: string;
  height: number;
}

export type AssetManifest = Record<string, AssetEntry>;

// The module-level manifest, keyed by id.
const MANIFEST = manifest as AssetManifest;

const loaded = new Map<string, THREE.Group>();
let loader: GLTFLoader | null = null;

function makeLoader(): GLTFLoader {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

// Convert a PBR (MeshStandardMaterial) material to the game's flat-shaded look:
// keep the base-color texture and base color, drop the metalness/roughness maps
// (the game never uses PBR, and dropping them lightens the fragment cost). Any
// non-standard material is left untouched.
function toLambert(src: THREE.Material): THREE.Material {
  if (src instanceof THREE.MeshStandardMaterial) {
    const lam = new THREE.MeshLambertMaterial();
    lam.name = src.name;
    lam.color.copy(src.color);
    if (src.map) lam.map = src.map;
    if (src.vertexColors) lam.vertexColors = true;
    return lam;
  }
  return src;
}

// Walk a loaded GLTF scene and swap every mesh's PBR material for a Lambert one.
function flattenMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(toLambert);
    } else {
      mesh.material = toLambert(mesh.material);
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
        flattenMaterials(gltf.scene);
        loaded.set(id, gltf.scene);
      },
      undefined,
      (err) => {
        // Network/parse failure — keep the primitive fallback, don't crash.
        console.warn(`[assets] failed to load '${id}' from ${entry.url}:`, err);
      }
    );
  }
}

// Returns a fresh clone of the loaded model, or null while loading / on failure.
// Cloning lets every caller (e.g. the player) own its own copy.
export function getAsset(id: string): THREE.Group | null {
  const src = loaded.get(id);
  if (!src) return null;
  return src.clone();
}

// Loaded-state helper so the player knows whether to keep the primitive.
export function hasAsset(id: string): boolean {
  return loaded.has(id);
}
