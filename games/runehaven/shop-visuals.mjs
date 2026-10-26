import * as THREE from './vendor/three.module.js';

// Broad, untextured shapes keep the work surface and its stack easy to read.
export function createShopFixtures(parent) {
  const materials = new Map(), boxes = new Map();
  const groups = {};
  for (const name of ['forge', 'alchemy', 'counter', 'potionCounter', 'inn']) {
    const group = new THREE.Group(); group.name = `shop-${name}`;
    parent.add(group); groups[name] = group;
  }
  function box(group, size, position, color) {
    const key = size.join(',');
    if (!boxes.has(key)) boxes.set(key, new THREE.BoxGeometry(...size));
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    const mesh = new THREE.Mesh(boxes.get(key), materials.get(color));
    mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  const { forge, alchemy, counter, potionCounter, inn } = groups;
  box(forge, [1.25, 1.15, 1.05], [-.48, .575, -.2], '#e99a52');
  box(forge, [.8, .45, .06], [-.48, .5, .355], '#514b57');
  box(forge, [.58, .25, .07], [-.48, .45, .395], '#ffcc59');
  box(forge, [.52, .72, .6], [.72, .36, .12], '#7c8b9a');
  box(forge, [1.02, .18, .55], [.72, .81, .12], '#b4c8da');
  box(alchemy, [1.9, .65, 1.1], [0, .325, 0], '#4aa991');
  box(alchemy, [2.05, .12, 1.2], [0, .71, 0], '#9ce0c7');
  box(alchemy, [.76, .38, .65], [-.3, .96, -.12], '#556b76');
  box(alchemy, [.63, .05, .52], [-.3, 1.17, -.12], '#b5eb7e');
  box(counter, [2.25, .65, .8], [0, .325, 0], '#dc8e4b');
  box(counter, [2.4, .16, 1], [0, .72, 0], '#ffd38b');
  box(potionCounter, [1.9, .65, .8], [0, .325, 0], '#4aa991');
  box(potionCounter, [2.1, .16, 1], [0, .72, 0], '#9ce0c7');
  box(inn, [2.2, .32, 1.15], [0, .18, -.5], '#9a75c7');
  box(inn, [2, .18, 1], [0, .43, -.5], '#fff4d3');
  box(inn, [.45, .16, .78], [-.69, .6, -.5], '#ffffff');
  return groups;
}
