import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { BATTLE_BOUNDS, getBattleLayout } from '../battlefield.mjs';
import { createBattlefieldVisuals } from '../battlefield-visuals.mjs';

test('courtyard combat anchors stay separate from regional shop coordinates and expansion', () => {
  assert.deepEqual(BATTLE_BOUNDS, { minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 });
  for (let stage = 1; stage <= 10; stage++) {
    const state = { stage, raid: { phase: 'battle' } }, before = JSON.stringify(state), layout = getBattleLayout(state);
    assert.equal(layout.bounds, BATTLE_BOUNDS);
    assert.deepEqual(layout.gate, { x: 0, z: 6 });
    assert.deepEqual(layout.shop, { x: 0, z: -3.8 });
    assert.deepEqual(layout.player, { x: 0, z: -3.4 });
    for (const point of [layout.shop, layout.player, layout.doorway]) {
      assert.ok(point.x >= BATTLE_BOUNDS.minX && point.x <= BATTLE_BOUNDS.maxX);
      assert.ok(point.z >= BATTLE_BOUNDS.minZ && point.z <= BATTLE_BOUNDS.maxZ);
    }
    assert.ok(layout.backdrop.z < BATTLE_BOUNDS.minZ, 'the exterior sits behind the playable yard');
    assert.equal(JSON.stringify(state), before);
    assert.equal(getBattleLayout({ stage: stage + 10 }), layout);
    assert.throws(() => { layout.player.x = 100; }, TypeError);
    assert.throws(() => { layout.palette.grass = '#000000'; }, TypeError);
  }
});

test('outdoor scene toggles as one group without showing any interior furniture', (t) => {
  const scene = new THREE.Scene(), visuals = createBattlefieldVisuals(scene);
  t.after(() => visuals.dispose());
  assert.equal(visuals.group.parent, scene);
  assert.equal(visuals.group.visible, false);
  for (const phase of ['departure', 'battle', 'victory', 'defeat']) {
    visuals.update({ stage: 1, raid: { phase } }, true);
    assert.equal(visuals.group.visible, true);
    assert.ok(visuals.group.getObjectByName('battlefield-shop-exterior'));
    assert.ok(visuals.group.getObjectByName('battlefield-road-entrance'));
  }
  visuals.update({ stage: 1 }, false);
  assert.equal(visuals.group.visible, false);
  const names = [];
  visuals.group.traverse((node) => names.push(node.name));
  assert.ok(names.every((name) => !/chair|table|bed|forge|alchemy|dining|counter/i.test(name)));
});

test('the fighting yard stays clear above ground and all scenery is outside its central area', (t) => {
  const visuals = createBattlefieldVisuals(new THREE.Scene());
  t.after(() => visuals.dispose());
  const yard = new THREE.Box3(new THREE.Vector3(-6, .11, -3.8), new THREE.Vector3(6, 4, 6));
  for (const zone of visuals.group.children) {
    if (zone.name === 'battlefield-ground') continue;
    const bounds = new THREE.Box3().setFromObject(zone);
    assert.equal(bounds.intersectsBox(yard), false, `${zone.name} must leave room for the battle`);
  }
  const ground = new THREE.Box3().setFromObject(visuals.group.getObjectByName('battlefield-ground'));
  assert.ok(ground.min.x <= BATTLE_BOUNDS.minX && ground.max.x >= BATTLE_BOUNDS.maxX);
  assert.ok(ground.min.z <= BATTLE_BOUNDS.minZ && ground.max.z >= BATTLE_BOUNDS.maxZ);
  assert.ok(ground.max.y <= .04);
});

test('regional palette changes reuse bounded meshes, geometry and materials without textures or lights', (t) => {
  const visuals = createBattlefieldVisuals(new THREE.Scene());
  t.after(() => visuals.dispose());
  const meshes = [], materials = new Set(), geometries = new Set();
  visuals.group.traverse((node) => {
    if (!node.isMesh) return;
    meshes.push(node); materials.add(node.material); geometries.add(node.geometry);
    assert.equal(node.material.map, null);
  });
  assert.ok(meshes.length <= 28, `${meshes.length} static meshes`);
  assert.ok(materials.size < meshes.length, 'zones share their color materials');
  for (let cycle = 0; cycle < 3; cycle++) for (let stage = 1; stage <= 10; stage++) {
    visuals.update({ stage }, true);
    const layout = getBattleLayout({ stage });
    assert.equal(visuals.group.userData.layoutId, layout.id);
    for (const material of materials) assert.equal(material.color.getHex(), new THREE.Color(layout.palette[material.userData.battlefieldRole]).getHex());
    const current = [];
    visuals.group.traverse((node) => {
      assert.ok(!node.isLight, 'the existing game light is reused');
      if (node.isMesh) { current.push(node); assert.ok(geometries.has(node.geometry)); assert.ok(materials.has(node.material)); }
    });
    assert.deepEqual(current, meshes);
    visuals.update({ stage }, false);
  }
});

test('teardown disposes shared resources once and cooperates with the main scene cleanup', () => {
  const scene = new THREE.Scene(), visuals = createBattlefieldVisuals(scene);
  const geometries = new Set(), materials = new Set(), disposals = new Map();
  visuals.group.traverse((node) => { if (node.isMesh) { geometries.add(node.geometry); materials.add(node.material); } });
  for (const resource of [...geometries, ...materials]) {
    disposals.set(resource, 0); resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  }
  const geometry = [...geometries][0], material = [...materials][0];
  geometry.dispose(); material.dispose();
  const disposedGeometries = new Set([geometry]), disposedMaterials = new Set([material]);
  visuals.dispose(disposedGeometries, disposedMaterials);
  visuals.dispose(disposedGeometries, disposedMaterials);
  visuals.update({ stage: 2 }, true);
  assert.equal(visuals.group.parent, null);
  assert.equal(visuals.group.visible, false);
  assert.equal(disposedGeometries.size, geometries.size);
  assert.equal(disposedMaterials.size, materials.size);
  assert.ok([...disposals.values()].every((count) => count === 1));
});
