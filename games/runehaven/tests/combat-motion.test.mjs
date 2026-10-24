import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THREE, GLTFLoader } from '../asset-loader.mjs';
import { clone as cloneSkeleton } from '../vendor/SkeletonUtils.js';
import { COMBAT_ATTACK_SECONDS, createCombatRig, updateCombatMotion, disposeCombatMotion } from '../combat-motion.mjs';

const parsedModels = new Map();
async function model(kind) {
  if (!parsedModels.has(kind)) parsedModels.set(kind, (async () => {
    const bytes = readFileSync(new URL(`../assets/models/mini-dungeon/character-${kind}.glb`, import.meta.url));
    const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
    // Only browser image decoding is omitted. Real geometry, bones, skinning and
    // all animation tracks remain the original GLB data.
    for (const material of json.materials) delete material.pbrMetallicRoughness.baseColorTexture;
    const encoded = Buffer.from(JSON.stringify(json)), paddedLength = Math.ceil(encoded.length / 4) * 4;
    const glb = Buffer.alloc(20 + paddedLength + bytes.length - 20 - jsonLength, 32);
    bytes.copy(glb, 0, 0, 12); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(paddedLength, 12); glb.writeUInt32LE(0x4e4f534a, 16);
    encoded.copy(glb, 20); bytes.copy(glb, 20 + paddedLength, 20 + jsonLength);
    return new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  })());
  return parsedModels.get(kind);
}

after(async () => {
  disposeCombatMotion();
  for (const source of parsedModels.values()) {
    const parsed = await source, geometries = new Set(), materials = new Set();
    parsed.scene.traverse((node) => { if (node.isMesh) { geometries.add(node.geometry); materials.add(node.material); } });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
});

async function actor(t, asset = 'human', kind = 'warrior', role = '') {
  const parsed = await model(asset), content = cloneSkeleton(parsed.scene);
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  content.scale.setScalar(1.3 / (bounds.max.y - bounds.min.y));
  const root = new THREE.Group(), body = new THREE.Group(), gear = new THREE.Group(); body.add(content); root.add(body, gear); root.scale.setScalar(.9);
  const result = { root, body, gear, angle: 0 };
  createCombatRig(result, kind, role, { trim: '#d6b36d' });
  t.after(() => {
    const skeletons = new Set(); content.traverse((node) => { if (node.skeleton) skeletons.add(node.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
  });
  return { actor: result, mixer: new THREE.AnimationMixer(content), clips: parsed.animations, content };
}

function tip(actor) {
  actor.root.updateMatrixWorld(true);
  return new THREE.Vector3(0, .75, 0).applyMatrix4(actor.combatRig.weapon.matrixWorld);
}

test('real human and orc attack clips move the equipped hand and weapon together', async (t) => {
  for (const kind of ['human', 'orc']) {
    const { actor: body, mixer, clips } = await actor(t, kind);
    const rig = body.combatRig, clip = clips.find((clip) => clip.name === 'attack-melee-right');
    assert.ok(clip && Math.abs(clip.duration - .4166667) < .00001);
    assert.ok(clip.tracks.some((track) => track.name === 'arm-right.quaternion'));
    assert.equal(rig.mount.parent, body.body.getObjectByName('arm-right'));
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    mixer.setTime(0); const start = tip(body), armStart = rig.hand.quaternion.clone();
    mixer.setTime(.2); const strike = tip(body);
    assert.ok(armStart.angleTo(rig.hand.quaternion) > .5, `${kind} has actual arm rotation`);
    assert.ok(start.distanceTo(strike) > .3, `${kind} equipped weapon follows its animated arm`);
    assert.ok(Math.abs(rig.mount.getWorldScale(new THREE.Vector3()).x - body.root.getWorldScale(new THREE.Vector3()).x) < .001, 'GLB scale is canceled while actor scale remains effective');
  }
});

test('attack serials start one short swing, settle to idle or walk, and restart on the next real hit', async (t) => {
  const { actor: body } = await actor(t);
  const data = { x: 0, z: 0, hp: 40, targetX: 3, targetZ: 0, attackSerial: 1, attackAt: 2 };
  const first = updateCombatMotion(body, data, { time: 2, battle: true });
  assert.deepEqual(first, { clip: 'attack-melee-right', attackSerial: 1, attacking: true, restart: true });
  assert.ok(Math.abs(body.angle - Math.PI / 2) < .000001); assert.equal(body.root.rotation.y, body.angle);
  const before = tip(body), running = updateCombatMotion(body, data, { time: 2.23, battle: true });
  assert.equal(running.restart, false); assert.equal(running.attacking, true); assert.ok(before.distanceTo(tip(body)) > .12);
  const resting = updateCombatMotion(body, data, { time: 2 + COMBAT_ATTACK_SECONDS + .01, battle: true });
  assert.equal(resting.clip, 'idle'); assert.equal(resting.attacking, false); assert.equal(body.body.rotation.x, 0); assert.equal(body.gear.rotation.x, 0);
  assert.equal(body.combatRig.swing.rotation.x, .12); assert.equal(body.combatRig.swing.rotation.z, -.55);
  const walk = updateCombatMotion(body, data, { time: 3, moving: true, battle: true });
  assert.equal(walk.clip, 'walk'); assert.equal(walk.attacking, false); assert.equal(walk.restart, false);
  data.attackSerial++; data.attackAt = 3.1;
  assert.equal(updateCombatMotion(body, data, { time: 3.1, battle: true }).restart, true);
  assert.equal(updateCombatMotion(body, data, { time: 3.2, battle: false }).attacking, false);
});

test('stale attacks and defeated units cannot replay attack loops during movement', async (t) => {
  const { actor: body } = await actor(t);
  const stale = { hp: 20, attackSerial: 8, attackAt: 1 };
  assert.deepEqual(updateCombatMotion(body, stale, { time: 10, moving: true, battle: true }), { clip: 'walk', attackSerial: 8, attacking: false, restart: false });
  assert.equal(updateCombatMotion(body, { hp: 0, attackSerial: 9, attackAt: 10 }, { time: 10, battle: true }).attacking, false);
  assert.equal(updateCombatMotion(body, { hp: 20, attackSerial: 0 }, { time: 10, battle: true }).clip, 'idle');
});

test('weapon roles choose their matching actual clip and bow draw/release returns to its loaded pose', async (t) => {
  for (const [kind, role, style, clip] of [['warrior', '', 'sword', 'attack-melee-right'], ['orc', 'raider', 'axe', 'attack-melee-right'], ['soldier', 'elite', 'axe', 'attack-melee-right'], ['archer', '', 'bow', 'holding-right-shoot'], ['soldier', 'ranged', 'bow', 'holding-right-shoot'], ['orc', 'ranged', 'staff', 'interact-right'], ['mage', '', 'staff', 'interact-right']]) {
    const { actor: body, clips } = await actor(t, kind === 'orc' ? 'orc' : 'human', kind, role);
    const data = { hp: 20, attackSerial: 1, attackAt: 0 };
    assert.ok(clips.some((entry) => entry.name === clip)); assert.equal(body.combatRig.style, style);
    assert.equal(updateCombatMotion(body, data, { time: .3, battle: true }).clip, clip);
    if (style === 'bow') {
      assert.ok(body.combatRig.arrow.position.z > .1);
      updateCombatMotion(body, data, { time: .6, battle: true });
      assert.equal(body.combatRig.arrow.position.z, 0); assert.equal(body.combatRig.arrow.visible, true);
    }
  }
});

test('rig creation rebinds a loaded skeleton without adding meshes and shares buffers across actors', async (t) => {
  const { actor: loaded } = await actor(t), { actor: other } = await actor(t);
  const fallback = { root: new THREE.Group(), body: new THREE.Group(), gear: new THREE.Group(), angle: 0 }; fallback.root.add(fallback.body, fallback.gear);
  const rig = createCombatRig(fallback, 'warrior', '', { trim: '#d6b36d' }), weapon = rig.weapon;
  assert.equal(rig.mount.parent, fallback.root);
  fallback.body.removeFromParent(); loaded.body.removeFromParent(); fallback.body = loaded.body; fallback.root.add(loaded.body);
  for (let i = 0; i < 50; i++) {
    assert.equal(createCombatRig(fallback, 'warrior', '', { trim: '#d6b36d' }), rig);
    assert.equal(rig.weapon, weapon); assert.equal(rig.mount.parent, fallback.body.getObjectByName('arm-right'));
    updateCombatMotion(fallback, { hp: 10, attackSerial: 1, attackAt: 0 }, { time: i / 60, battle: true });
  }
  assert.equal(rig.swing.children.length, 1);
  assert.equal(rig.weapon.geometry, other.combatRig.weapon.geometry); assert.equal(rig.weapon.material, other.combatRig.weapon.material);
  assert.equal(rig.weapon.material.userData.combatShared, true);
});

test('shared geometry and materials are released once while respecting scene teardown ownership', async (t) => {
  const { actor: body } = await actor(t), geometry = body.combatRig.weapon.geometry, material = body.combatRig.weapon.material;
  let geometryReleases = 0, materialReleases = 0;
  geometry.addEventListener('dispose', () => geometryReleases++); material.addEventListener('dispose', () => materialReleases++);
  const disposedGeometries = new Set([geometry]), disposedMaterials = new Set(); geometry.dispose();
  disposeCombatMotion(disposedGeometries, disposedMaterials); disposeCombatMotion(disposedGeometries, disposedMaterials);
  assert.equal(geometryReleases, 1); assert.equal(materialReleases, 1); assert.ok(disposedMaterials.has(material));
});
