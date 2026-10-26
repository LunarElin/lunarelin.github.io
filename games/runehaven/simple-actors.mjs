import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { COMBAT_ATTACK_SECONDS } from './combat-motion.mjs';

// One small, shared skinned mesh per actor. There are no model downloads,
// texture maps, facial details, or per-character material clones.
const bodies = new Map();
let bodyMaterial, hatGeometry;
const hats = new Map();

function bodyGeometry(bodyColor, headColor) {
  const key = `${bodyColor}:${headColor}`;
  if (bodies.has(key)) return bodies.get(key);
  const parts = [];
  function part(geometry, color, bone, x, y, z = 0) {
    geometry.translate(x, y, z);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3), indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    const rgb = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = rgb.r; colors[i * 3 + 1] = rgb.g; colors[i * 3 + 2] = rgb.b;
      indices[i * 4] = bone; weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    parts.push(geometry);
  }
  part(new THREE.CapsuleGeometry(.19, .24, 1, 8), bodyColor, 0, 0, .74);
  part(new THREE.SphereGeometry(.2, 8, 6), headColor, 0, 0, 1.1);
  for (const [side, thigh, knee, arm] of [[-1, 1, 3, 5], [1, 2, 4, 6]]) {
    part(new THREE.CapsuleGeometry(.07, .09, 1, 6), bodyColor, thigh, side * .105, .345);
    part(new THREE.CapsuleGeometry(.07, .09, 1, 6), bodyColor, knee, side * .105, .115);
    part(new THREE.CapsuleGeometry(.06, .24, 1, 6), bodyColor, arm, side * .26, .72);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  bodies.set(key, geometry);
  return geometry;
}

function sharedBodyMaterial() {
  if (!bodyMaterial) {
    bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    bodyMaterial.userData.simpleActorShared = true;
  }
  return bodyMaterial;
}

function mageHat(color) {
  if (!hatGeometry) {
    hatGeometry = new THREE.ConeGeometry(.17, .2, 8);
    hatGeometry.translate(0, 1.36, 0);
  }
  if (!hats.has(color)) {
    const material = new THREE.MeshLambertMaterial({ color });
    material.userData.simpleActorShared = true;
    hats.set(color, material);
  }
  return new THREE.Mesh(hatGeometry, hats.get(color));
}

export function createSimpleActor(kind, appearance, { role = '', combat = false } = {}) {
  const body = new THREE.Group(), gear = new THREE.Group();
  body.name = 'simple-actor'; gear.name = 'simple-actor-gear';
  const root = new THREE.Bone(); root.name = 'simple-root';
  const leftLeg = new THREE.Bone(), rightLeg = new THREE.Bone();
  const leftKnee = new THREE.Bone(), rightKnee = new THREE.Bone();
  const leftArm = new THREE.Bone(), rightArm = new THREE.Bone(), hand = new THREE.Bone();
  leftLeg.name = 'simple-leg-left'; rightLeg.name = 'simple-leg-right';
  leftKnee.name = 'simple-knee-left'; rightKnee.name = 'simple-knee-right';
  leftArm.name = 'simple-arm-left'; rightArm.name = 'simple-arm-right'; hand.name = 'arm-right';
  leftLeg.position.set(-.105, .46, 0); rightLeg.position.set(.105, .46, 0);
  leftKnee.position.y = rightKnee.position.y = -.23;
  leftArm.position.set(-.26, .9, 0); rightArm.position.set(.26, .9, 0);
  // The existing combat mount has a -.245 native-X offset. This invisible
  // binding bone cancels that offset at the end of this short, straight arm.
  hand.position.set(.245, -.3, .085);
  root.add(leftLeg, rightLeg, leftArm, rightArm); leftLeg.add(leftKnee); rightLeg.add(rightKnee); rightArm.add(hand);
  const headColor = appearance.key === 'player' ? '#fff4e5' : appearance.body;
  const mesh = new THREE.SkinnedMesh(bodyGeometry(appearance.body, headColor), sharedBodyMaterial());
  mesh.name = 'simple-body'; mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.frustumCulled = false; // The caller already culls the whole actor.
  const skeleton = new THREE.Skeleton([root, leftLeg, rightLeg, leftKnee, rightKnee, leftArm, rightArm, hand]);
  body.add(root, mesh); body.updateMatrixWorld(true); mesh.bind(skeleton);
  if (kind === 'mage' || kind === 'orc' && role === 'ranged') gear.add(mageHat(appearance.body));
  const rig = { body, gear, mesh, skeleton, root, leftLeg, rightLeg, leftKnee, rightKnee, leftArm, rightArm, hand, combat };
  return { body, gear, rig };
}

export function updateSimpleActor(rig, { time = 0, moving = false, eating = false, carrying = false, working = false, combatMotion = null, attackAt = time } = {}) {
  const phase = Number.isFinite(time) ? time : 0;
  const stride = moving && !eating ? Math.sin(phase * 11) : 0;
  rig.root.position.y = eating ? -.08 : moving ? Math.abs(stride) * .015 : 0;
  rig.gear.position.y = rig.root.position.y;
  rig.leftLeg.rotation.x = stride * .6; rig.rightLeg.rotation.x = -stride * .6;
  rig.leftKnee.rotation.x = Math.max(0, -stride) * .35; rig.rightKnee.rotation.x = Math.max(0, stride) * .35;
  rig.leftKnee.scale.y = rig.rightKnee.scale.y = 1;
  rig.leftArm.rotation.set(-stride * .45, 0, 0); rig.rightArm.rotation.set(stride * .45, 0, 0);
  if (eating) {
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -Math.PI / 2;
    rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = Math.PI / 2;
    rig.leftKnee.scale.y = rig.rightKnee.scale.y = 1.65;
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -.7;
  } else if (carrying) {
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -1.1;
  } else if (working && !rig.combat) {
    rig.rightArm.rotation.x = -.75 + Math.sin(phase * 9) * .25;
  }
  if (combatMotion?.attacking) {
    const age = Number.isFinite(attackAt) ? phase - attackAt : 0;
    const t = Math.max(0, Math.min(1, age / COMBAT_ATTACK_SECONDS));
    const swing = Math.sin(t * Math.PI);
    if (combatMotion.clip === 'holding-right-shoot') {
      rig.leftArm.rotation.x = -1.05; rig.rightArm.rotation.x = -1.05 + swing * .15;
    } else if (combatMotion.clip === 'interact-right') {
      rig.rightArm.rotation.x = -.35 - swing * .8;
    } else {
      rig.rightArm.rotation.x = -.25 - swing * 1.25;
      rig.rightArm.rotation.z = -.15 + Math.sin(t * Math.PI * 2) * .25;
    }
  }
}

export function disposeSimpleActors(disposedGeometries = new Set(), disposedMaterials = new Set()) {
  for (const geometry of [...bodies.values(), hatGeometry].filter(Boolean)) if (!disposedGeometries.has(geometry)) {
    disposedGeometries.add(geometry); geometry.dispose();
  }
  for (const material of [bodyMaterial, ...hats.values()].filter(Boolean)) if (!disposedMaterials.has(material)) {
    disposedMaterials.add(material); material.dispose();
  }
  bodies.clear(); hats.clear(); bodyMaterial = hatGeometry = null;
}
