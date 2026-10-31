import * as THREE from './vendor/three.module.js';
import { createSourceGeometry } from './source-meshes.mjs';

// Selected source APK meshes. Palette colors and world-unit normalization are
// applied once; the same visual bounds are also used by the shop collision map.
export function createShopFixtures(parent) {
  const groups = {}, material = new THREE.MeshLambertMaterial({ vertexColors: true });
  function fixture(name, source, bounds, base, top) {
    const group = new THREE.Group(); group.name = `shop-${name}`; parent.add(group); groups[name] = group;
    const geometry = createSourceGeometry(source, { bounds, vertexColor: point => point.y > bounds.maxY * .78 ? top : base });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `source-${source}`; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  fixture('forge', 'grill', { minX: -1.105, maxX: .1, minY: 0, maxY: 1.16, minZ: -.725, maxZ: .43 }, '#9b82bc', '#e8e1f0');
  const output = createSourceGeometry('table', { bounds: { minX: .21, maxX: 1.23, minY: 0, maxY: .8, minZ: -.155, maxZ: .395 }, color: '#d5c9df' });
  const outputMesh = new THREE.Mesh(output, material); outputMesh.name = 'source-output-table'; outputMesh.castShadow = outputMesh.receiveShadow = true; groups.forge.add(outputMesh);
  fixture('alchemy', 'grill', { minX: -1.025, maxX: 0, minY: 0, maxY: 1.16, minZ: -.6, maxZ: .6 }, '#64ad9d', '#d8eee9');
  const alchemyOutput = createSourceGeometry('table', { bounds: { minX: 0, maxX: 1.025, minY: 0, maxY: .8, minZ: -.6, maxZ: .6 }, color: '#c3ddd5' });
  const alchemyMesh = new THREE.Mesh(alchemyOutput, material); alchemyMesh.name = 'source-output-table'; alchemyMesh.castShadow = alchemyMesh.receiveShadow = true; groups.alchemy.add(alchemyMesh);
  fixture('counter', 'counter', { minX: -1.2, maxX: 1.2, minY: 0, maxY: 1.25, minZ: -.5, maxZ: .5 }, '#9b82bc', '#e8e1f0');
  fixture('potionCounter', 'counter', { minX: -1.05, maxX: 1.05, minY: 0, maxY: 1.25, minZ: -.5, maxZ: .5 }, '#64ad9d', '#d8eee9');
  fixture('inn', 'table', { minX: -1.1, maxX: 1.1, minY: 0, maxY: .65, minZ: -1.075, maxZ: .075 }, '#7e76a2', '#e5d9bc');
  return groups;
}
