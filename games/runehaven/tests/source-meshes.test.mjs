import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { SOURCE_MESH_DATA } from '../assets/burger-source/mesh-data.mjs';
import { createSourceGeometry } from '../source-meshes.mjs';
import { createShopFixtures } from '../shop-visuals.mjs';
import { createProductVisuals } from '../product-visuals.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} != ${expected}`);

test('selected source data preserves indexed source topology and normalized, nonnegative recovered skin weights', () => {
  const triangles = { customer: 196, player: 1274, apron: 566, counter: 937, grill: 1878, table: 76, chair: 252, burger: 128, emptyDish: 84, cup: 236, cash: 22 };
  assert.deepEqual(Object.keys(SOURCE_MESH_DATA).sort(), Object.keys(triangles).sort());
  for (const [key, source] of Object.entries(SOURCE_MESH_DATA)) {
    assert.equal(source.indices.length / 3, triangles[key]);
    assert.ok(source.positions.every(Number.isFinite));
    assert.ok(source.indices.every(index => Number.isInteger(index) && index >= 0 && index < source.positions.length / 3));
    const geometry = createSourceGeometry(key, { skin: key === 'player' });
    if (key === 'player') {
      const weights = geometry.attributes.skinWeight, indices = geometry.attributes.skinIndex;
      for (let i = 0; i < weights.count; i++) {
        const row = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
        assert.ok(row.every(weight => weight >= 0 && weight <= 1)); near(row.reduce((a, b) => a + b), 1);
        assert.ok([indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)].every(bone => bone >= 0 && bone < 8));
      }
    }
    geometry.dispose();
  }
});

test('source shop fixtures fill the same world bounds used by the solid facility collision map', () => {
  const scene = new THREE.Scene(), fixtures = createShopFixtures(scene);
  const expected = {
    forge: [-1.105, 1.23, -.725, .43], alchemy: [-1.025, 1.025, -.6, .6],
    counter: [-1.2, 1.2, -.5, .5], potionCounter: [-1.05, 1.05, -.5, .5], inn: [-1.1, 1.1, -1.075, .075],
  };
  let meshes = 0, triangles = 0;
  for (const [key, values] of Object.entries(expected)) {
    const box = new THREE.Box3().setFromObject(fixtures[key]);
    [box.min.x, box.max.x, box.min.z, box.max.z].forEach((value, i) => near(value, values[i]));
  }
  const geometries = new Set(), materials = new Set();
  scene.traverse(node => { if (node.isMesh) { meshes++; triangles += node.geometry.index.count / 3; geometries.add(node.geometry); materials.add(node.material); } });
  assert.equal(meshes, 7); assert.equal(triangles, 5858);
  for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
});

test('new source cargo lands with visible bounce while adjacent layers stay separated and removals do not relaunch the stack', () => {
  const materials = [], visuals = createProductVisuals(color => { const value = new THREE.MeshLambertMaterial({ color }); materials.push(value); return value; });
  const matrix = new THREE.Matrix4(), low = new THREE.Box3(), high = new THREE.Box3();
  for (const product of ['gear', 'potion']) {
    const parent = new THREE.Group(); visuals.set(parent, 8, product); const stack = visuals.set(parent, 9, product);
    let lifted = false;
    for (let frame = 0; frame < 45; frame++) {
      visuals.animate(parent, { time: frame / 60, dt: 1 / 60 });
      stack.base.geometry.computeBoundingBox();
      for (let i = 0; i < 8; i++) {
        stack.base.getMatrixAt(i, matrix); low.copy(stack.base.geometry.boundingBox).applyMatrix4(matrix);
        stack.base.getMatrixAt(i + 1, matrix); high.copy(stack.base.geometry.boundingBox).applyMatrix4(matrix);
        assert.ok(low.max.y <= high.min.y + .00001, `${product} layers ${i}/${i + 1} do not penetrate while bouncing`);
      }
      stack.base.getMatrixAt(8, matrix); if (matrix.elements[13] > 8 * stack.spacing + .015) lifted = true;
    }
    assert.ok(lifted, 'the arriving top visibly lifts before settling');
    visuals.set(parent, 8, product); assert.equal(stack.popRemaining, 0, 'unloading does not act like an arriving item');
    for (const mesh of [stack.base, stack.detail]) mesh.dispose();
  }
  visuals.dispose(); for (const material of materials) material.dispose();
});
