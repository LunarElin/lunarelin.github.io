import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { DINING_RULES, createDiningState, getDiningLayout } from '../dining.mjs';
import { createDiningVisuals } from '../dining-visuals.mjs';

async function fixture(t) {
  const scene = new THREE.Scene(), loads = [], geometry = new THREE.BoxGeometry(1, 1, 1), materials = [];
  const library = { async load(key, options) {
    loads.push({ key, options });
    const object = new THREE.Group(), material = new THREE.MeshStandardMaterial(); materials.push(material);
    object.add(new THREE.Mesh(geometry, material));
    return { object };
  } };
  const visuals = await createDiningVisuals(scene, library);
  t.after(() => { visuals.dispose(); geometry.dispose(); });
  const state = { stage: 1, unlocks: { inn: true }, dining: createDiningState() };
  const group = scene.getObjectByName('inn-dining');
  return { scene, loads, geometry, materials, visuals, state, group };
}

test('simple dining furniture needs no model loads and reuses pooled food and table dishes across service cycles', async (t) => {
  const { loads, visuals, state, group } = await fixture(t);
  assert.equal(loads.length, 0, 'simple furniture must not request detailed GLB models');
  group.traverse((node) => { if (node.isMesh) assert.equal(node.material.map, null); });
  const prepared = group.getObjectByName('dining-prepared-food'), table = group.getObjectByName('dining-table-0');
  const dish = table.getObjectByName('dining-table-dish'), top = table.getObjectByName('dining-table-top');
  const cleanColor = top.material.color.getHex();
  const meshCount = [], food = prepared.geometry;
  for (let cycle = 0; cycle < 20; cycle++) {
    for (const status of ['clean', 'reserved', 'eating', 'dirty']) {
      state.dining.tables[0].status = status; state.dining.food = cycle % 9; visuals.update(state);
      assert.equal(prepared.count, cycle % 9);
      assert.equal(dish.visible, status === 'eating' || status === 'dirty');
      assert.equal(dish.geometry === food, status !== 'dirty');
      assert.equal(top.material.color.getHex() === cleanColor, status !== 'dirty', 'used tables must be visibly different without detailed decals');
      assert.equal(group.getObjectByName('dining-table-0').getObjectByName('dining-table-dish'), dish);
      let count = 0; group.traverse((node) => { if (node.isMesh) count++; }); meshCount.push(count);
    }
  }
  assert.equal(new Set(meshCount).size, 1);
  assert.equal(prepared.instanceMatrix.count, DINING_RULES.foodCapacity);
  assert.equal(loads.length, 0);
});

test('region updates place all furniture at the rules layout and locked inn hides dining', async (t) => {
  const { visuals, state, group } = await fixture(t);
  state.unlocks.inn = false; visuals.update(state); assert.equal(group.visible, false);
  state.unlocks.inn = true;
  for (let stage = 1; stage <= 10; stage++) {
    state.stage = stage; visuals.update(state);
    const layout = getDiningLayout(state), counter = group.getObjectByName('dining-counter'), kitchen = group.getObjectByName('dining-kitchen');
    assert.equal(group.visible, true); assert.equal(counter.position.x, layout.counter.x); assert.equal(counter.position.z, layout.counter.z);
    assert.equal(kitchen.position.x, layout.kitchen.x); assert.equal(kitchen.position.z, layout.kitchen.z);
    for (const table of layout.tables) {
      const furniture = group.getObjectByName(`dining-table-${table.id}`), chair = group.getObjectByName(`dining-chair-${table.id}`);
      assert.equal(furniture.position.x, table.x); assert.equal(furniture.position.z, table.z);
      assert.equal(chair.position.x, table.seat.x); assert.equal(chair.position.z, table.seat.z); assert.equal(chair.rotation.y, Math.PI);
    }
  }
});

test('unbought tables and chairs stay hidden, then appear without replacing their buffers', async (t) => {
  const { visuals, state, group } = await fixture(t);
  visuals.update(state);
  const first = group.getObjectByName('dining-table-0'), next = group.getObjectByName('dining-table-1');
  const chair = group.getObjectByName('dining-chair-1');
  const geometry = next.getObjectByName('dining-table-top').geometry;
  assert.equal(first.visible, true); assert.equal(next.visible, false); assert.equal(chair.visible, false);
  state.dining.tableCount = 2; state.dining.tables[1].status = 'clean'; visuals.update(state);
  assert.equal(next.visible, true); assert.equal(chair.visible, true);
  assert.equal(next.getObjectByName('dining-table-top').geometry, geometry);
  assert.equal(group.getObjectByName('dining-table-2').visible, false);
});

test('carried meals reuse the same one-mesh dish and share buffers without touching existing cargo', async (t) => {
  const { visuals, group } = await fixture(t);
  const actor = { carry: new THREE.Group() }, cargo = new THREE.Group(); actor.carry.add(cargo);
  visuals.setGuestMeal(actor, false); assert.equal(actor.carry.children.length, 1);
  visuals.setGuestMeal(actor, true);
  const meal = actor.carry.getObjectByName('dining-carried-meal'), prepared = group.getObjectByName('dining-prepared-food');
  assert.equal(meal.geometry, prepared.geometry); assert.equal(meal.material, prepared.material); assert.equal(meal.material.userData.diningShared, true);
  for (let i = 0; i < 30; i++) { visuals.setGuestMeal(actor, i % 2 === 0); assert.equal(meal.visible, i % 2 === 0); }
  assert.equal(actor.carry.children.length, 2); assert.equal(actor.carry.children[0], cargo);
});

test('kitchen stock and served stock stay independent and reuse uploaded matrices through transport', async (t) => {
  const { visuals, state, group } = await fixture(t);
  const kitchen = group.getObjectByName('dining-kitchen-food'), served = group.getObjectByName('dining-prepared-food');
  const kitchenMatrix = kitchen.instanceMatrix, servedMatrix = served.instanceMatrix;
  const kitchenVersion = kitchenMatrix.version, servedVersion = servedMatrix.version;
  for (const [cooked, ready] of [[4, 0], [2, 0], [2, 2], [0, 4], [0, 0], [20, 30], [-2, -4]]) {
    state.dining.kitchen = cooked; state.dining.food = ready; visuals.update(state);
    assert.equal(kitchen.count, Math.max(0, Math.min(8, cooked))); assert.equal(served.count, Math.max(0, Math.min(8, ready)));
    assert.equal(kitchen.visible, cooked > 0); assert.equal(served.visible, ready > 0);
    assert.equal(kitchen.instanceMatrix, kitchenMatrix); assert.equal(served.instanceMatrix, servedMatrix);
    assert.equal(kitchenMatrix.version, kitchenVersion); assert.equal(servedMatrix.version, servedVersion);
  }
  assert.equal(kitchen.geometry, served.geometry); assert.equal(kitchen.material, served.material);
});

test('multiple food stacks reuse shared dishes and change counts without uploading matrices or touching mixed-cargo offsets', async (t) => {
  const { visuals, group } = await fixture(t);
  const parents = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  parents.forEach((parent, index) => parent.position.set(0, index * .17, 0));
  const prepared = group.getObjectByName('dining-prepared-food');
  const stacks = parents.map((parent) => visuals.setFoodStack(parent, 1));
  const versions = stacks.map((stack) => stack.instanceMatrix.version);
  for (let cycle = 0; cycle < 3; cycle++) for (let count = 0; count <= 22; count++) {
    parents.forEach((parent, index) => {
      const stack = visuals.setFoodStack(parent, count);
      assert.equal(stack, stacks[index]); assert.equal(stack.count, count); assert.equal(stack.visible, count > 0);
      assert.equal(stack.instanceMatrix.version, versions[index]); assert.equal(parent.children.length, 1); assert.equal(parent.position.y, index * .17);
      assert.equal(stack.geometry, prepared.geometry); assert.equal(stack.material, prepared.material);
    });
  }
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  stacks[0].getMatrixAt(21, matrix); position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.y - 21 * .22) < .00001);
  visuals.setFoodStack(parents[0], 100, 2, .25);
  assert.equal(stacks[0].count, 60); stacks[0].getMatrixAt(3, matrix); position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x - .25) < .00001); assert.ok(Math.abs(position.y - .25) < .00001);
  assert.ok(stacks[0].boundingBox && Number.isFinite(stacks[0].boundingSphere.radius));
});

test('disposal releases shared procedural furniture once and never frees external library geometry', async (t) => {
  const { visuals, state, group, geometry } = await fixture(t);
  state.dining.tables[0].status = 'dirty'; visuals.update(state);
  const prepared = group.getObjectByName('dining-prepared-food'), dirty = group.getObjectByName('dining-table-0').getObjectByName('dining-table-dish');
  const materials = new Set(), furnitureGeometry = new Set();
  group.traverse((node) => {
    if (!node.isMesh) return;
    materials.add(node.material);
    if (node.geometry !== prepared.geometry && node.geometry !== dirty.geometry) furnitureGeometry.add(node.geometry);
  });
  const liveStack = visuals.setFoodStack(new THREE.Group(), 3), removedStack = visuals.setFoodStack(new THREE.Group(), 2);
  const counts = { food: 0, dirty: 0, furniture: 0, sharedGeometry: 0, prepared: 0, stacks: 0, materials: 0 };
  prepared.geometry.addEventListener('dispose', () => counts.food++); dirty.geometry.addEventListener('dispose', () => counts.dirty++);
  for (const resource of furnitureGeometry) resource.addEventListener('dispose', () => counts.furniture++);
  geometry.addEventListener('dispose', () => counts.sharedGeometry++); prepared.addEventListener('dispose', () => counts.prepared++);
  for (const stack of [liveStack, removedStack]) stack.addEventListener('dispose', () => counts.stacks++);
  for (const material of materials) material.addEventListener('dispose', () => counts.materials++);
  const disposedGeometries = new Set([prepared.geometry]), disposedMaterials = new Set([prepared.material]);
  prepared.geometry.dispose(); prepared.material.dispose(); prepared.dispose(); removedStack.dispose();
  visuals.dispose(disposedGeometries, disposedMaterials); visuals.dispose(disposedGeometries, disposedMaterials);
  assert.deepEqual(counts, { food: 1, dirty: 1, furniture: furnitureGeometry.size, sharedGeometry: 0, prepared: 1, stacks: 2, materials: materials.size });
  assert.equal(group.parent, null);
});
