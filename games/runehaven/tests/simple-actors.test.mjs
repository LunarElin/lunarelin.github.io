import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ACTOR_PALETTES } from '../actor-appearance.mjs';
import { createSimpleActor, updateSimpleActor, disposeSimpleActors } from '../simple-actors.mjs';
import { createCombatRig, updateCombatMotion, disposeCombatMotion } from '../combat-motion.mjs';
import { CAMERA_OFFSET, battleCamera, followBattleCamera } from '../camera.mjs';

const instances = [];
function actor(kind = 'warrior', appearance = ACTOR_PALETTES.ally, role = '', combat = true) {
  const simple = createSimpleActor(kind, appearance, { role, combat });
  const root = new THREE.Group(); root.add(simple.body, simple.gear); root.scale.setScalar(.9);
  const result = { ...simple, root, angle: 0 };
  if (combat) createCombatRig(result, kind, role, appearance);
  instances.push(result);
  return result;
}

after(() => {
  for (const instance of instances) instance.rig.skeleton.dispose();
  disposeSimpleActors(); disposeCombatMotion();
});

test('source customers and source player apron preserve their source triangle topology with shared texture-free draws', () => {
  const customer = actor('warrior', ACTOR_PALETTES.customer, '', false);
  const second = actor('archer', ACTOR_PALETTES.customer, '', false);
  const player = actor('player', ACTOR_PALETTES.player, '', false);
  const body = customer.rig.mesh, bounds = body.geometry.boundingBox;
  assert.ok(Math.abs(bounds.min.y) < .000001); assert.ok(Math.abs(bounds.max.y - 1.3) < .000001);
  assert.equal(body.geometry, second.rig.mesh.geometry); assert.equal(body.material, player.rig.mesh.material);
  assert.equal(body.material.map, null); assert.equal(customer.gear.children.length, 0);
  assert.equal(body.geometry.index.count / 3, 196, 'the original basic customer has 196 triangles');
  assert.equal(player.rig.mesh.geometry.index.count / 3, 1274 + 566, 'source main-Character and its apron/hat are merged without decorative fairy additions');
  assert.equal(body.geometry.userData.sourceActor, 'customer');
  assert.equal(player.rig.mesh.geometry.userData.sourceActor, 'main-Character + player_cloth');
  let meshes = 0; customer.body.traverse(node => { if (node.isMesh) meshes++; }); assert.equal(meshes, 1);
  const expected = new THREE.Color(ACTOR_PALETTES.customer.body), color = new THREE.Color();
  for (let i = 0; i < body.geometry.attributes.color.count; i++) {
    color.fromBufferAttribute(body.geometry.attributes.color, i);
    for (const axis of ['r', 'g', 'b']) assert.ok(Math.abs(color[axis] - expected[axis]) < .000001, 'the source faceless silhouette only receives the role color');
  }
  const weights = player.rig.mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < weights.count; i++) {
    const row = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
    assert.ok(row.every(w => w >= 0 && w <= 1)); assert.ok(Math.abs(row.reduce((a, b) => a + b) - 1) < .000001, 'compressed fourth source weights stay normalized after conversion');
  }
});

test('walking moves opposing legs and the actual weapon binding; stopping and carrying reset the pose', () => {
  const body = actor(), rig = body.rig;
  assert.equal(body.combatRig.mount.parent, rig.hand);
  assert.equal(rig.hand.name, 'arm-right'); assert.equal(rig.hand.isBone, true);
  updateSimpleActor(rig, { time: .04, moving: true }); body.root.updateMatrixWorld(true);
  const start = new THREE.Vector3(); body.combatRig.mount.getWorldPosition(start);
  updateSimpleActor(rig, { time: .15, moving: true }); body.root.updateMatrixWorld(true);
  const end = new THREE.Vector3(); body.combatRig.mount.getWorldPosition(end);
  assert.ok(start.distanceTo(end) > .01);
  assert.ok(rig.leftLeg.rotation.x * rig.rightLeg.rotation.x < 0);
  updateSimpleActor(rig, { time: .3, moving: true, carrying: true });
  assert.equal(rig.leftArm.rotation.x, -1.1); assert.equal(rig.rightArm.rotation.x, -1.1);
  updateSimpleActor(rig, { time: .6 });
  assert.equal(rig.leftLeg.rotation.x, 0); assert.equal(rig.rightArm.rotation.x, 0);
  assert.equal(rig.root.position.y, 0);
});

test('sitting bends the knees and legs rather than replacing the actor, then returns to the same standing buffers', () => {
  const body = actor('mage', ACTOR_PALETTES.customer, '', false), rig = body.rig;
  const geometry = rig.mesh.geometry, material = rig.mesh.material;
  updateSimpleActor(rig, { eating: true });
  assert.equal(rig.leftLeg.rotation.x, -Math.PI / 2);
  assert.equal(rig.leftKnee.rotation.x, Math.PI / 2);
  assert.equal(rig.leftKnee.scale.y, 1.65);
  body.root.scale.setScalar(1); body.root.updateMatrixWorld(true); rig.skeleton.update();
  const point = new THREE.Vector3(), bounds = new THREE.Box3();
  for (let i = 0; i < rig.mesh.geometry.attributes.position.count; i++) {
    rig.mesh.getVertexPosition(i, point).applyMatrix4(rig.mesh.matrixWorld); bounds.expandByPoint(point);
  }
  assert.ok(bounds.min.y >= -.001, 'seated feet remain above the actual floor');
  assert.ok(Math.abs(rig.leftLeg.getWorldPosition(point).y - .46) < .001, 'the rounded source customer rests above the chair without lowering its source floor through the floor');
  updateSimpleActor(rig, { moving: true, time: .2 });
  assert.equal(rig.leftKnee.scale.y, 1);
  assert.equal(rig.mesh.geometry, geometry); assert.equal(rig.mesh.material, material);
  assert.equal(body.gear.children.length, 1, 'a mage has only one small hat mesh');
});

test('melee, bow, and spell attacks move the same hand that owns the weapon and stop after the actual short attack', () => {
  for (const [kind, expected] of [['warrior', 'attack-melee-right'], ['archer', 'holding-right-shoot'], ['mage', 'interact-right']]) {
    const body = actor(kind), data = { x: 0, z: 0, hp: 20, targetX: 0, targetZ: 2, attackAt: 3, attackSerial: 1 };
    const initial = updateCombatMotion(body, data, { time: 3, battle: true });
    updateSimpleActor(body.rig, { time: 3, attackAt: 3, combatMotion: initial }); body.root.updateMatrixWorld(true);
    const first = body.rig.hand.getWorldPosition(new THREE.Vector3());
    const striking = updateCombatMotion(body, data, { time: 3.2, battle: true });
    updateSimpleActor(body.rig, { time: 3.2, attackAt: 3, combatMotion: striking }); body.root.updateMatrixWorld(true);
    assert.equal(striking.clip, expected);
    assert.ok(first.distanceTo(body.rig.hand.getWorldPosition(new THREE.Vector3())) > .01, `${kind} moves the equipped hand`);
    const idle = updateCombatMotion(body, data, { time: 3.46, battle: true });
    updateSimpleActor(body.rig, { time: 3.46, attackAt: 3, combatMotion: idle });
    assert.equal(idle.attacking, false); assert.equal(body.rig.rightArm.rotation.x, 0);
  }
});

test('new hands and weapons remain inside the existing phone-camera safety margins through every attack pose', () => {
  for (const [width, height] of [[320, 338], [390, 591]]) for (const kind of ['warrior', 'archer', 'mage']) {
    const body = actor(kind), unit = { id: kind, kind, hp: 20, x: 0, z: 2, range: kind === 'warrior' ? 1 : 3.5,
      targetX: .5, targetZ: 3, attackSerial: 1, attackAt: 0 };
    body.root.position.set(unit.x, 0, unit.z);
    const enemy = { id: 'enemy', x: .5, z: 3, hp: 20, range: 1 };
    const framing = battleCamera(width, height, [unit], [enemy], 0);
    const view = followBattleCamera(null, framing.focus, framing.framing, 0, true);
    const camera = new THREE.OrthographicCamera(-view.span * width / height / 2, view.span * width / height / 2, view.span / 2, -view.span / 2, .1, 100);
    camera.position.set(view.x + CAMERA_OFFSET.x, view.focusY + CAMERA_OFFSET.y, view.z + CAMERA_OFFSET.z);
    camera.lookAt(view.x, view.focusY, view.z); camera.updateMatrixWorld();
    for (let frame = 0; frame < 28; frame++) {
      const time = frame / 60, motion = updateCombatMotion(body, unit, { time, battle: true });
      updateSimpleActor(body.rig, { time, attackAt: 0, combatMotion: motion }); body.root.updateMatrixWorld(true);
      for (const mesh of [body.combatRig.weapon, body.combatRig.arrow].filter(node => node?.visible)) {
        const point = new THREE.Vector3(), positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
          const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
          assert.ok(x >= 24 && x <= width - 24 && y >= 38 && y <= height - 42,
            `${width}px ${kind} frame ${frame}: (${x},${y}) is protected by the unchanged guard`);
        }
      }
    }
  }
});

test('shared actor geometry and materials are released once and cooperate with scene teardown ownership', () => {
  const body = actor(), geometry = body.rig.mesh.geometry, material = body.rig.mesh.material;
  let geometryCount = 0, materialCount = 0;
  geometry.addEventListener('dispose', () => geometryCount++); material.addEventListener('dispose', () => materialCount++);
  const geometries = new Set([geometry]), materials = new Set(); geometry.dispose();
  disposeSimpleActors(geometries, materials); disposeSimpleActors(geometries, materials);
  assert.equal(geometryCount, 1); assert.equal(materialCount, 1);
  assert.ok(materials.has(material));
});
