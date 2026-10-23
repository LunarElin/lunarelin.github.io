import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { createActorMarkers } from '../actor-markers.mjs';

function fixture(t) {
  let materialCalls = 0;
  const materials = [];
  const markers = createActorMarkers((color, options) => {
    materialCalls++;
    const material = new THREE.MeshStandardMaterial({ color, ...options });
    materials.push(material);
    return material;
  });
  const health = markers.group.children.find((node) => node.geometry.type === 'BoxGeometry');
  const rings = markers.group.children.find((node) => node.geometry.type === 'TorusGeometry');
  t.after(() => {
    markers.group.traverse((node) => {
      if (node.isInstancedMesh) { node.dispose(); node.geometry.dispose(); }
    });
    for (const material of materials) material.dispose();
  });
  return { markers, health, rings, materialCalls: () => materialCalls };
}

function entry(overrides = {}) {
  return { visible: true, x: 2, z: -1, scale: 1, healthVisible: true, healthRatio: 1,
    enemy: false, ringVisible: true, ringRadius: .32, ringColor: '#90cf96', ...overrides };
}

function transform(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
}

function near(actual, expected) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < .00001,
      `${axis}: expected ${expected[axis]}, got ${actual[axis]}`);
  }
}

function color(mesh, index) {
  const value = new THREE.Color();
  mesh.getColorAt(index, value);
  return value;
}

test('visible health bars and floor rings compact independently into exactly two batches', (t) => {
  const { markers, health, rings } = fixture(t);
  assert.equal(markers.group.children.length, 2);
  markers.update(new Set([
    entry({ visible: false, x: 50 }),
    entry({ x: -2, ringVisible: false }),
    entry({ x: 3, healthVisible: false }),
    entry({ x: 4 }),
    entry({ healthVisible: false, ringVisible: false }),
  ]));
  assert.equal(health.count, 2);
  assert.equal(rings.count, 2);
  assert.equal(health.visible, true);
  assert.equal(rings.visible, true);
  near(transform(health, 0).position, { x: -2, y: 1.85, z: -1 });
  near(transform(health, 1).position, { x: 4, y: 1.85, z: -1 });
  near(transform(rings, 0).position, { x: 3, y: .035, z: -1 });
  near(transform(rings, 1).position, { x: 4, y: .035, z: -1 });
  for (const mesh of [health, rings]) {
    assert.equal(mesh.instanceMatrix.count, 80);
    assert.equal(mesh.instanceColor.count, 80);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.frustumCulled, false);
  }
});

test('marker transforms retain actor scale, health ratio, floor height and horizontal torus geometry', (t) => {
  const { markers, health, rings } = fixture(t);
  markers.update([entry({ x: -3, z: 2, scale: .72, healthRatio: .25, ringRadius: .46 })]);
  assert.equal(health.geometry.parameters.width, .65);
  assert.equal(health.geometry.parameters.height, .06);
  assert.equal(health.geometry.parameters.depth, .07);
  near(transform(health, 0).position, { x: -3, y: 1.85 * .72, z: 2 });
  near(transform(health, 0).scale, { x: .25 * .72, y: .72, z: .72 });
  near(transform(rings, 0).position, { x: -3, y: .035, z: 2 });
  near(transform(rings, 0).scale, { x: .46 * .72, y: .46 * .72, z: .46 * .72 });
  rings.geometry.computeBoundingBox();
  const size = rings.geometry.boundingBox.getSize(new THREE.Vector3());
  near(size, { x: 2.22, y: .22, z: 2.22 });
});

test('instance colors represent enemies, low health and caller-provided rings without vertex colors', (t) => {
  const { markers, health, rings } = fixture(t);
  markers.update([
    entry({ healthRatio: .8, ringColor: '#ff9969' }),
    entry({ healthRatio: .3, ringColor: 0x234567 }),
    entry({ enemy: true, healthRatio: 1, ringColor: new THREE.Color('#456789') }),
  ]);
  assert.equal(health.material, rings.material);
  assert.equal(health.material.color.getHex(), 0xffffff);
  assert.equal(health.material.vertexColors, false);
  assert.equal(health.geometry.hasAttribute('color'), false);
  assert.equal(color(health, 0).getHex(), 0x8bd1a0);
  assert.equal(color(health, 1).getHex(), 0xe8877a);
  assert.equal(color(health, 2).getHex(), 0xe8877a);
  assert.equal(color(rings, 0).getHex(), 0xff9969);
  assert.equal(color(rings, 1).getHex(), 0x234567);
  assert.equal(color(rings, 2).getHex(), 0x456789);
});

test('zero and hidden updates clear both draw counts before a smaller batch returns', (t) => {
  const { markers, health, rings } = fixture(t);
  markers.update(Array.from({ length: 38 }, () => entry()));
  assert.equal(health.count, 38);
  assert.equal(rings.count, 38);
  for (const entries of [[], [entry({ visible: false })]]) {
    markers.update(entries);
    assert.equal(health.count, 0);
    assert.equal(rings.count, 0);
    assert.equal(health.visible, false);
    assert.equal(rings.visible, false);
  }
  markers.update([entry({ x: -4, z: 3, ringVisible: false })]);
  assert.equal(health.count, 1);
  assert.equal(rings.count, 0);
  near(transform(health, 0).position, { x: -4, y: 1.85, z: 3 });
});

test('repeated moving crowds reuse geometry, material and matrix/color buffers within the eighty-marker cap', (t) => {
  const { markers, health, rings, materialCalls } = fixture(t);
  const snapshots = [health, rings].map((mesh) => ({
    geometry: mesh.geometry, material: mesh.material,
    matrix: mesh.instanceMatrix, matrixArray: mesh.instanceMatrix.array,
    color: mesh.instanceColor, colorArray: mesh.instanceColor.array,
  }));
  const entries = Array.from({ length: 95 }, (_, index) => entry({ x: index / 20, z: index % 4 }));
  for (let frame = 0; frame < 60; frame++) {
    for (let index = 0; index < entries.length; index++) {
      entries[index].visible = index % 5 !== frame % 5;
      entries[index].x += .01;
      entries[index].healthRatio = (frame + index) % 11 / 10;
    }
    markers.update(entries);
    for (const [index, mesh] of [health, rings].entries()) {
      const snapshot = snapshots[index];
      assert.equal(mesh.geometry, snapshot.geometry);
      assert.equal(mesh.material, snapshot.material);
      assert.equal(mesh.instanceMatrix, snapshot.matrix);
      assert.equal(mesh.instanceMatrix.array, snapshot.matrixArray);
      assert.equal(mesh.instanceColor, snapshot.color);
      assert.equal(mesh.instanceColor.array, snapshot.colorArray);
      assert.equal(mesh.count, 76);
    }
  }
  for (const item of entries) item.visible = true;
  markers.update(entries);
  assert.equal(health.count, 80);
  assert.equal(rings.count, 80);
  assert.equal(materialCalls(), 1);
  assert.equal(markers.group.children.length, 2);
});
