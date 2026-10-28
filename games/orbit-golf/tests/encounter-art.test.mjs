import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { createEncounterVisual, animateEncounterVisual } from '../encounter-art.mjs';

// Actual authored Three.js geometry and animation math. These checks do not
// claim GPU performance, native phone readability, or real-device rendering.
const variants = [
  { type: 'beast', skin: 'hippo', radius: 2.6, height: 2.3 },
  { type: 'beast', skin: 'panda', radius: 2.6, height: 2.3 },
  { type: 'giant-alien', radius: 2.5, height: 2.4, direction: -1 },
  { type: 'cookie', radius: 2.25, height: 2.1 },
  { type: 'cookie', skin: 'crumb', fragment: true, radius: .55, height: .55 },
  { type: 'anvil', radius: 1.8, height: 1.6 },
  { type: 'tar', radius: 2.35, height: .16 },
];

function asset(t, event) {
  const group = createEncounterVisual(event);
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    group.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  });
  return group;
}

function pose(group) {
  const result = [];
  group.traverse(node => {
    node.updateMatrix();
    result.push({ name: node.name, matrix: [...node.matrix.elements], visible: node.visible });
  });
  return result;
}

test('authored encounter silhouettes have finite geometry, floor anchors and bounded mobile asset costs', t => {
  assert.equal(createEncounterVisual({ type: 'unknown' }), null);
  for (const event of variants) {
    const group = asset(t, event);
    assert.ok(group instanceof THREE.Group);
    let meshes = 0, triangles = 0;
    group.traverse(node => {
      if (!node.isMesh) return;
      meshes++;
      const geometry = node.geometry, positions = geometry.attributes.position;
      assert.ok(positions.count > 0);
      for (const attribute of [positions, geometry.attributes.normal]) {
        for (const value of attribute.array) assert.ok(Number.isFinite(value), `${event.type} has a non-finite vertex or normal`);
      }
      for (const index of geometry.index?.array || []) assert.ok(index < positions.count);
      triangles += (geometry.index?.count ?? positions.count) / 3;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        assert.equal(material.map, null, 'the native 3D family must not silently add large color textures');
      }
    });
    assert.ok(meshes > 1 && meshes <= 30, `${event.type}: ${meshes} draw meshes exceeds the per-asset budget`);
    assert.ok(triangles <= 11000, `${event.type}: ${triangles} triangles exceeds the per-asset budget`);
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group, true);
    assert.ok(bounds.min.y >= -.05, `${event.type} is embedded below its ground anchor`);
    assert.ok(bounds.max.y < 7 && bounds.max.y > event.height);
    assert.ok(bounds.max.x - bounds.min.x < 7, 'a giant must leave room on the 20-world-wide course');
  }
});

test('dense block and low sticky basin signal different risks through geometry and preserve consumed tar',t=>{
  const anvil=asset(t,{type:'anvil'}),tarEvent={type:'tar',radius:2.35,height:.16,used:true},tar=asset(t,tarEvent);
  anvil.updateMatrixWorld(true);tar.updateMatrixWorld(true);
  const blockBounds=new THREE.Box3().setFromObject(anvil,true),basinBounds=new THREE.Box3().setFromObject(tar,true);
  assert.ok(blockBounds.max.y>3&&blockBounds.max.y<3.3,'a dense block should have a tall solid blocking silhouette');
  assert.ok(basinBounds.max.y<.5&&basinBounds.getSize(new THREE.Vector3()).x>4.5,'tar should remain a wide low footprint, not a reskinned block');
  assert.ok(anvil.getObjectByName('anvil-flat-impact-face')?.isMesh);
  assert.ok(anvil.getObjectByName('anvil-diagonal-warning-stripe')?.isMesh);
  assert.ok(tar.getObjectByName('tar-concave-sticky-surface')?.isMesh);
  assert.ok(tar.getObjectByName('tar-stretched-viscous-strand')?.isMesh);
  const surface=tar.getObjectByName('tar-concave-sticky-surface').geometry;
  for(let i=0;i<surface.attributes.normal.count;i++)assert.ok(surface.attributes.normal.getY(i)>0,'the open concave surface must face the chase camera and sky lighting');
  animateEncounterVisual(tar,tarEvent,2,{life:1.2,total:2.6,strength:1,powered:true},1/60);
  assert.equal(tar.visible,true,'a consumed tar interaction cannot erase the still-fixed footprint');
  assert.equal(tar.userData.colliderHeight,.16,'the shallow physical contract must not be clamped to a generic solid height');
  assert.ok(tar.position.equals(new THREE.Vector3()));
});

test('local reactions animate without teleporting the physics root and freeze at a fixed elapsed time', t => {
  for (const event of variants) {
    const group = asset(t, { ...event, phase: .7 });
    group.position.set(12, -3, 8); group.rotation.set(.2, .8, -.3); group.scale.setScalar(1.2); group.updateMatrix();
    const rootBefore = group.matrix.clone(), before = pose(group);
    const hit = { life: .4, total: .9, strength: 1.2, powered: true };
    animateEncounterVisual(group, { ...event, phase: .7 }, 3.7, hit, 1 / 60);
    const active = pose(group);
    assert.ok(group.matrix.equals(rootBefore), 'the scene-owned physical transform must stay unchanged');
    if (!event.fragment) assert.notDeepEqual(active, before, `${event.type} must visibly react through its local parts`);
    animateEncounterVisual(group, { ...event, phase: .7 }, 3.7, hit, 0);
    assert.deepEqual(pose(group), active, 'paused elapsed time cannot accumulate limb, scale, or rotation drift');
    animateEncounterVisual(group, { ...event, phase: .7 }, 3.7, hit, 1);
    assert.deepEqual(pose(group), active, 'absolute-time animation must also be independent of render delta');
  }
});

test('contact shadows disappear during actual flight and do not follow flying crumbs as fake floor shadows', t => {
  for (const event of variants) {
    const group = asset(t, event), shadow = group.getObjectByName('encounter-contact-shadow');
    assert.ok(shadow);
    animateEncounterVisual(group, { ...event, body: { active: true } }, 1);
    assert.equal(shadow.visible, false);
    animateEncounterVisual(group, { ...event, body: { active: false } }, 1);
    assert.equal(shadow.visible, !event.fragment);
  }
});

test('a broken whole cookie hides while actual broken:true fragment bodies remain visible', t => {
  const wholeEvent = { type: 'cookie', radius: 2.25, height: 2.1, broken: true, used: true };
  const whole = asset(t, wholeEvent);
  animateEncounterVisual(whole, wholeEvent, 1, { life: .4, total: .6, powered: true });
  assert.equal(whole.visible, false, 'the consumed giant cookie cannot remain as an intact obstacle');

  const fragmentEvent = { type: 'cookie', skin: 'crumb', radius: .55, height: .55, fragment: true, broken: true,
    body: { active: true, s: 100, x: 1, height: 2 } };
  const fragment = asset(t, fragmentEvent);
  animateEncounterVisual(fragment, fragmentEvent, 1, null, 1 / 60);
  assert.equal(fragment.visible, true, 'broken:true belongs to the real crumb contract and must not hide the flying fragment');
  assert.ok(fragment.getObjectByName('cookie-physical-crumb')?.isMesh);
  assert.equal(fragment.getObjectByName('cookie-breakable-sector'), undefined, 'a crumb must not render a second full-size cookie');
  assert.equal(fragment.getObjectByName('encounter-contact-shadow').visible, false);
});
