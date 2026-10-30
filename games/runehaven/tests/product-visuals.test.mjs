import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { CARRY_SPACING, createProductVisuals } from '../product-visuals.mjs';

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
  const potion = visuals.set(parent(), 8, 'potion');
  near(position(potion.base, 0), { x: 0, y: .125, z: 0 });
  near(position(potion.detail, 0), { x: 0, y: .2675, z: 0 });
  near(position(potion.base, 7), { x: 0, y: 7 * CARRY_SPACING.potion + .125, z: 0 });
  near(position(potion.detail, 7), { x: 0, y: 7 * CARRY_SPACING.potion + .2675, z: 0 });
  assert.equal(gear.base.castShadow, true);
  assert.equal(potion.base.castShadow, true);
  assert.equal(gear.detail.castShadow, false);
  assert.equal(potion.detail.castShadow, false);
});

test('compact potion rows have a nonnegative base and no silhouette penetration at the shared carry pitch', (t) => {
  const { visuals, parent } = fixture(t), stack = visuals.set(parent(), 2, 'potion');
  const matrix = new THREE.Matrix4();
  function bounds(index) {
    const result = new THREE.Box3();
    for (const mesh of [stack.base, stack.detail]) {
      mesh.geometry.computeBoundingBox(); mesh.getMatrixAt(index, matrix);
      result.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    return result;
  }
  const first = bounds(0), next = bounds(1);
  assert.ok(first.min.y >= -.000001);
  assert.ok(first.max.y - first.min.y <= .30 + .000001, 'compact bottle stays at most 0.30 units tall');
  assert.ok(first.max.y - first.min.y <= CARRY_SPACING.potion);
  assert.ok(next.min.y >= first.max.y, 'bottle and cap remain clear of the next bottle');
  assert.equal(CARRY_SPACING.potion, .31);
  assert.equal(CARRY_SPACING.food, .16); assert.equal(CARRY_SPACING.gear, .17);
});

test('only carried stacks sway by layer, pop their new top briefly, and settle into the same matrices and buffers', (t) => {
  const { visuals, parent } = fixture(t), carried = parent(), shelf = parent();
  const stack = visuals.set(carried, 22, 'gear'), still = visuals.set(shelf, 22, 'gear');
  const baseline = stack.base.instanceMatrix.array.slice(), detailBaseline = stack.detail.instanceMatrix.array.slice();
  const matrixBuffer = stack.base.instanceMatrix, version = still.base.instanceMatrix.version;
  for (let frame = 1; frame <= 30; frame++) visuals.animate(carried, { time: frame / 60, moving: true, dt: 1 / 60 });
  assert.equal(stack.base.instanceMatrix, matrixBuffer); assert.equal(still.base.instanceMatrix.version, version);
  assert.ok(Math.abs(position(stack.base, 21).x) > .001); assert.equal(position(stack.base, 0).x, 0);
  visuals.set(carried, 21, 'gear'); visuals.animate(carried, { time: .55, moving: false, dt: .05 });
  const original = new THREE.Matrix4(), current = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  stack.base.getMatrixAt(20, current); current.decompose(a, rotation, scale);
  assert.ok(scale.x > 1 && scale.x <= 1.035001, 'only a small 180 ms top-item pop is added');
  for (const [mesh, matrices] of [[stack.base, baseline], [stack.detail, detailBaseline]]) {
    for (let i = 0; i < mesh.count; i++) {
      original.fromArray(matrices, i * 16); mesh.getMatrixAt(i, current);
      for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
        a.fromBufferAttribute(mesh.geometry.attributes.position, vertex).applyMatrix4(original);
        b.fromBufferAttribute(mesh.geometry.attributes.position, vertex).applyMatrix4(current);
        assert.ok(a.distanceTo(b) < .04, 'sway and pop preserve a bounded silhouette');
      }
    }
  }
  for (let frame = 1; frame <= 60; frame++) visuals.animate(carried, { time: .55 + frame / 60, moving: false, dt: 1 / 60 });
  near(position(stack.base, 20), { x: 0, y: 20 * CARRY_SPACING.gear + .09, z: 0 });
  stack.base.getMatrixAt(20, current); current.decompose(a, rotation, scale); near(scale, { x: 1, y: 1, z: 1 });
  const settledVersion = stack.base.instanceMatrix.version;
  visuals.animate(carried, { time: 2, moving: false, dt: 1 / 60 }); assert.equal(stack.base.instanceMatrix.version, settledVersion);
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
