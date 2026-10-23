import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { createProductVisuals } from '../product-visuals.mjs';

function fixture(t) {
  const materials = new Map();
  const parents = [];
  const visuals = createProductVisuals((color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color }));
    return materials.get(color);
  });
  t.after(() => {
    for (const parent of parents) parent.traverse((node) => { if (node.isInstancedMesh) node.dispose(); });
    visuals.dispose();
    for (const material of materials.values()) material.dispose();
  });
  function parent() {
    const group = new THREE.Group();
    parents.push(group);
    return group;
  }
  return { visuals, parent, materials };
}

function position(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

function near(actual, expected) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < .00001,
      `${axis}: expected ${expected[axis]}, got ${actual[axis]}`);
  }
}

test('repeated carry-count changes reuse meshes, four shared geometries and uploaded instance matrices', (t) => {
  const { visuals, parent } = fixture(t);
  const stacks = ['gear', 'gear', 'potion', 'potion'].map((product) => {
    const group = parent();
    const { base, detail } = visuals.set(group, 1, product);
    return {
      group, product, base, detail,
      baseGeometry: base.geometry, detailGeometry: detail.geometry,
      baseMatrix: base.instanceMatrix, detailMatrix: detail.instanceMatrix,
      baseVersion: base.instanceMatrix.version, detailVersion: detail.instanceMatrix.version,
    };
  });
  assert.equal(new Set(stacks.flatMap(({ base, detail }) => [base.geometry, detail.geometry])).size, 4);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let count = 1; count <= 22; count++) {
      for (const stack of stacks) {
        const next = visuals.set(stack.group, count, stack.product);
        assert.equal(next.base, stack.base);
        assert.equal(next.detail, stack.detail);
        assert.equal(next.base.geometry, stack.baseGeometry);
        assert.equal(next.detail.geometry, stack.detailGeometry);
        assert.equal(next.base.instanceMatrix, stack.baseMatrix);
        assert.equal(next.detail.instanceMatrix, stack.detailMatrix);
        assert.equal(next.base.instanceMatrix.version, stack.baseVersion);
        assert.equal(next.detail.instanceMatrix.version, stack.detailVersion);
        assert.equal(next.base.count, count);
        assert.equal(next.detail.count, count);
        assert.equal(stack.group.children.length, 2);
      }
    }
  }
});

test('zero hides both meshes and counts stay within the preallocated sixty-instance capacity', (t) => {
  const { visuals, parent } = fixture(t);
  const group = parent();
  const initial = visuals.set(group, 0, 'gear');
  for (const mesh of [initial.base, initial.detail]) {
    assert.equal(mesh.count, 0);
    assert.equal(mesh.visible, false);
    assert.equal(mesh.instanceMatrix.count, 60);
    assert.ok(mesh.boundingBox && mesh.boundingSphere);
    assert.ok(Number.isFinite(mesh.boundingSphere.radius));
  }
  for (const [requested, expected] of [[99, 60], [60, 60], [-4, 0], [NaN, 0], [8, 8], [0, 0]]) {
    const stack = visuals.set(group, requested, 'gear');
    assert.equal(stack.base, initial.base);
    for (const mesh of [stack.base, stack.detail]) {
      assert.equal(mesh.count, expected);
      assert.equal(mesh.visible, expected > 0);
    }
  }
});

test('gear rows and potion bottles retain their base and detail placement', (t) => {
  const { visuals, parent } = fixture(t);
  const gear = visuals.set(parent(), 6, 'gear', 3, .17);
  near(position(gear.base, 0), { x: -.61, y: .09, z: 0 });
  near(position(gear.detail, 0), { x: -.61, y: .18, z: .08 });
  near(position(gear.base, 5), { x: .61, y: .26, z: 0 });
  near(position(gear.detail, 5), { x: .61, y: .35, z: .08 });
  const potion = visuals.set(parent(), 8, 'potion', 1, .31);
  near(position(potion.base, 0), { x: 0, y: .09, z: 0 });
  near(position(potion.detail, 0), { x: 0, y: .28, z: 0 });
  near(position(potion.base, 7), { x: 0, y: 7 * .31 + .09, z: 0 });
  near(position(potion.detail, 7), { x: 0, y: 7 * .31 + .28, z: 0 });
  assert.equal(gear.base.castShadow, true);
  assert.equal(potion.base.castShadow, true);
  assert.equal(gear.detail.castShadow, false);
  assert.equal(potion.detail.castShadow, false);
});

test('a parent cleared by the caller receives fresh instance meshes while retaining shared geometry', (t) => {
  const { visuals, parent } = fixture(t);
  const group = parent();
  const first = visuals.set(group, 12, 'gear');
  group.remove(first.base, first.detail);
  first.base.dispose();
  first.detail.dispose();
  const next = visuals.set(group, 5, 'gear');
  assert.notEqual(next.base, first.base);
  assert.notEqual(next.detail, first.detail);
  assert.notEqual(next.base.instanceMatrix, first.base.instanceMatrix);
  assert.equal(next.base.geometry, first.base.geometry);
  assert.equal(next.detail.geometry, first.detail.geometry);
  assert.equal(next.base.parent, group);
  assert.equal(next.detail.parent, group);
  assert.equal(group.children.length, 2);
  assert.equal(next.base.count, 5);
});

test('factory disposal releases each shared geometry once and leaves mesh and material ownership to the caller', (t) => {
  const { visuals, parent, materials } = fixture(t);
  const gear = visuals.set(parent(), 1, 'gear');
  const potion = visuals.set(parent(), 1, 'potion');
  const meshes = [gear.base, gear.detail, potion.base, potion.detail];
  const geometries = new Set(meshes.map((mesh) => mesh.geometry));
  assert.equal(geometries.size, 4);
  let geometryDisposals = 0, meshDisposals = 0, materialDisposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => meshDisposals++);
  for (const material of materials.values()) material.addEventListener('dispose', () => materialDisposals++);
  visuals.dispose();
  visuals.dispose();
  assert.equal(geometryDisposals, 4);
  assert.equal(meshDisposals, 0);
  assert.equal(materialDisposals, 0);
});

test('factory disposal skips geometry already released by scene teardown and records the remaining releases', (t) => {
  const { visuals, parent } = fixture(t);
  const gear = visuals.set(parent(), 1, 'gear');
  const potion = visuals.set(parent(), 1, 'potion');
  const geometries = [gear.base.geometry, gear.detail.geometry, potion.base.geometry, potion.detail.geometry];
  const releases = new Map(geometries.map((geometry) => [geometry, 0]));
  for (const geometry of geometries) {
    geometry.addEventListener('dispose', () => releases.set(geometry, releases.get(geometry) + 1));
  }
  const alreadyDisposed = new Set([gear.base.geometry, potion.detail.geometry]);
  for (const geometry of alreadyDisposed) geometry.dispose();
  const before = [...releases.values()].reduce((sum, count) => sum + count, 0);
  visuals.dispose(alreadyDisposed);
  const after = [...releases.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(after - before, 2);
  assert.deepEqual([...releases.values()], [1, 1, 1, 1]);
  assert.equal(alreadyDisposed.size, 4);
  assert.ok(geometries.every((geometry) => alreadyDisposed.has(geometry)));
  visuals.dispose(alreadyDisposed);
  assert.deepEqual([...releases.values()], [1, 1, 1, 1]);
});
