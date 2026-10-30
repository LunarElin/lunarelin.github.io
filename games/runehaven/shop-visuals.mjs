import * as THREE from './vendor/three.module.js';

// Soft untextured blocks keep the work surface and its stack easy to read.
export function createShopFixtures(parent) {
  const materials = new Map(), boxes = new Map();
  const groups = {};
  for (const name of ['forge', 'alchemy', 'counter', 'potionCounter', 'inn']) {
    const group = new THREE.Group(); group.name = `shop-${name}`;
    parent.add(group); groups[name] = group;
  }
  function box(group, size, position, color) {
    const key = size.join(',');
    if (!boxes.has(key)) {
      const geometry = new THREE.BoxGeometry(...size, 2, 2, 2);
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const radius = Math.min(.1, ...size.map(value => value * .16));
      const inner = new THREE.Vector3(...size).multiplyScalar(.5).subScalar(radius);
      const point = new THREE.Vector3(), center = new THREE.Vector3(), normal = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        center.set(Math.max(-inner.x, Math.min(inner.x, point.x)), Math.max(-inner.y, Math.min(inner.y, point.y)), Math.max(-inner.z, Math.min(inner.z, point.z)));
        normal.copy(point).sub(center).normalize(); point.copy(center).addScaledVector(normal, radius);
        positions.setXYZ(i, point.x, point.y, point.z); normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      boxes.set(key, geometry);
    }
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    const mesh = new THREE.Mesh(boxes.get(key), materials.get(color));
    mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  const { forge, alchemy, counter, potionCounter, inn } = groups;
  box(forge, [1.25, 1.15, 1.05], [-.48, .575, -.2], '#e6a7c4');
  box(forge, [.8, .45, .06], [-.48, .5, .355], '#806286');
  box(forge, [.58, .25, .07], [-.48, .45, .395], '#ffe0a8');
  box(forge, [.52, .72, .6], [.72, .36, .12], '#a69bc5');
  box(forge, [1.02, .18, .55], [.72, .81, .12], '#ddd7f1');
  box(alchemy, [1.9, .65, 1.1], [0, .325, 0], '#8bcdbb');
  box(alchemy, [2.05, .12, 1.2], [0, .71, 0], '#ddf4e7');
  box(alchemy, [.76, .38, .65], [-.3, .96, -.12], '#9b9ac3');
  box(alchemy, [.63, .05, .52], [-.3, 1.17, -.12], '#c6ecb5');
  box(counter, [2.25, .65, .8], [0, .325, 0], '#dca1bd');
  box(counter, [2.4, .16, 1], [0, .72, 0], '#fff0d4');
  box(potionCounter, [1.9, .65, .8], [0, .325, 0], '#8bcdbb');
  box(potionCounter, [2.1, .16, 1], [0, .72, 0], '#ddf4e7');
  box(inn, [2.2, .32, 1.15], [0, .18, -.5], '#c0a2db');
  box(inn, [2, .18, 1], [0, .43, -.5], '#fff3e6');
  box(inn, [.45, .16, .78], [-.69, .6, -.5], '#ffe4f0');
  return groups;
}
