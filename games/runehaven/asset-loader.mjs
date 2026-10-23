import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';

export { THREE, GLTFLoader };

const assetRoot = new URL('./assets/', import.meta.url);

/** Load models on demand, sharing geometry/textures while cloning animation rigs. */
export async function createAssetLibrary() {
  const response = await fetch(new URL('manifest.json', assetRoot));
  if (!response.ok) throw new Error(`Asset manifest: ${response.status}`);
  const manifest = await response.json();
  const loader = new GLTFLoader();
  const pending = new Map();

  function source(key) {
    const entry = manifest.models[key];
    if (!entry) return Promise.reject(new Error(`Unknown model: ${key}`));
    if (!pending.has(key)) {
      const request = loader.loadAsync(new URL(entry.url, assetRoot).href);
      pending.set(key, request);
      request.catch(() => pending.delete(key));
    }
    return pending.get(key);
  }

  async function load(key, options = {}) {
    const gltf = await source(key);
    const entry = manifest.models[key];
    const content = cloneSkeleton(gltf.scene);
    content.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(content);
    const nativeHeight = bounds.max.y - bounds.min.y;
    const scale = options.scale ?? ((options.height ?? entry.recommendedHeight) / (nativeHeight || 1));
    content.scale.multiplyScalar(scale);
    content.updateMatrixWorld(true);
    bounds.setFromObject(content);
    content.position.x -= (bounds.min.x + bounds.max.x) / 2;
    content.position.y -= bounds.min.y;
    content.position.z -= (bounds.min.z + bounds.max.z) / 2;
    content.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = options.shadows !== false;
      node.receiveShadow = options.shadows !== false;
      node.material = Array.isArray(node.material)
        ? node.material.map((material) => material.clone())
        : node.material.clone();
    });
    const object = new THREE.Group();
    object.name = `asset-${key}`;
    object.add(content);
    object.userData.assetKey = key;
    return { object, animations: gltf.animations, source: entry };
  }

  return {
    manifest,
    load,
    preload: (keys) => Promise.all(keys.map(source)),
    icon: (key) => new URL(manifest.icons[key].url, assetRoot).href,
  };
}
