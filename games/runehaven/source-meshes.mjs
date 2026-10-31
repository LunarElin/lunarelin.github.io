import * as THREE from './vendor/three.module.js';
import { SOURCE_MESH_DATA } from './assets/burger-source/mesh-data.mjs';

// Geometry comes from the user's statically extracted source APK. Only bounds,
// pose conversion and palette colors change; no network/runtime asset decoder.
export function createSourceGeometry(key, { size, bounds, color = '#ffffff', vertexColor, skin = false } = {}) {
  const source = SOURCE_MESH_DATA[key];
  if (!source) throw new Error(`Unknown source mesh: ${key}`);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(source.positions), count = positions.length / 3;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(source.indices);
  geometry.computeBoundingBox();
  const original = geometry.boundingBox.clone(), extent = original.getSize(new THREE.Vector3());
  if (size || bounds) {
    const min = bounds ? new THREE.Vector3(bounds.minX, bounds.minY ?? 0, bounds.minZ) : new THREE.Vector3(-size[0] / 2, 0, -size[2] / 2);
    const target = bounds ? new THREE.Vector3(bounds.maxX - bounds.minX, (bounds.maxY ?? extent.y) - min.y, bounds.maxZ - bounds.minZ) : new THREE.Vector3(...size);
    for (let i = 0; i < count; i++) for (const [axis, letter] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
      positions[i * 3 + axis] = min[letter] + (positions[i * 3 + axis] - original.min[letter]) / extent[letter] * target[letter];
    }
  }
  const colors = new Float32Array(count * 3), rgb = new THREE.Color(color), local = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    local.fromBufferAttribute(geometry.attributes.position, i);
    if (vertexColor) rgb.set(vertexColor(local, i));
    colors[i * 3] = rgb.r; colors[i * 3 + 1] = rgb.g; colors[i * 3 + 2] = rgb.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (skin) {
    const indices = source.skinIndices ? new Uint16Array(source.skinIndices) : new Uint16Array(count * 4);
    const weights = source.skinWeights ? new Float32Array(source.skinWeights) : new Float32Array(count * 4);
    if (!source.skinWeights) for (let i = 0; i < count; i++) weights[i * 4] = 1;
    else for (let i = 0; i < count; i++) {
      const sum = weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3];
      for (let j = 0; j < 4; j++) weights[i * 4 + j] /= sum;
    }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.sourceMesh = key;
  return geometry;
}
