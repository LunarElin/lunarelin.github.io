import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { COMBAT_ATTACK_SECONDS } from './combat-motion.mjs';
import { createSourceGeometry } from './source-meshes.mjs';

const bodies = new Map();
let bodyMaterial, hatGeometry;
const hats = new Map();

function bodyGeometry(appearance, customer) {
  const key = `${appearance.key}:${appearance.body}:${customer}`;
  if (bodies.has(key)) return bodies.get(key);
  const scale = 1.3 / 1.779;
  const parts = [];
  if (customer) {
    const geometry = createSourceGeometry('customer', { color: appearance.body, skin: true });
    geometry.computeBoundingBox();
    const factor = 1.3 / geometry.boundingBox.max.y;
    geometry.scale(factor, factor, factor);
    // The source customer is a low-poly rounded body. Preserve that silhouette;
    // only its separate outer arms follow the lightweight web animation rig.
    const positions = geometry.attributes.position, indices = geometry.attributes.skinIndex;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      if (Math.abs(x) > .27 && y > .35 && y < .8) indices.setX(i, x < 0 ? 5 : 6);
    }
    parts.push(geometry);
  } else {
    const skinColor = appearance.key === 'enemy' ? appearance.body : '#f1bd82';
    const body = createSourceGeometry('player', { color: skinColor, skin: true });
    const apron = createSourceGeometry('apron', { color: appearance.body, skin: true });
    body.scale(scale, scale, scale); apron.scale(scale, scale, scale);
    parts.push(body, apron);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  const floor = geometry.boundingBox.min.y, height = geometry.boundingBox.max.y - floor;
  geometry.translate(0, -floor, 0); geometry.scale(1.3 / height, 1.3 / height, 1.3 / height);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.sourceActor = customer ? 'customer' : 'main-Character + player_cloth';
  bodies.set(key, geometry); return geometry;
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
    hatGeometry = new THREE.ConeGeometry(.17, .2, 8); hatGeometry.translate(0, 1.36, 0);
  }
  if (!hats.has(color)) {
    const material = new THREE.MeshLambertMaterial({ color }); material.userData.simpleActorShared = true; hats.set(color, material);
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
  leftLeg.name = 'simple-leg-left'; rightLeg.name = 'simple-leg-right'; leftKnee.name = 'simple-knee-left'; rightKnee.name = 'simple-knee-right';
  leftArm.name = 'simple-arm-left'; rightArm.name = 'simple-arm-right'; hand.name = 'arm-right';
  leftLeg.position.set(-.105, .46, 0); rightLeg.position.set(.105, .46, 0); leftKnee.position.y = rightKnee.position.y = -.23;
  const customer = appearance.key === 'customer' && !combat;
  leftArm.position.set(customer ? -.26 : -.052, .87, 0); rightArm.position.set(customer ? .26 : .052, .87, 0);
  hand.position.set(.315, -.37, .085);
  root.add(leftLeg, rightLeg, leftArm, rightArm); leftLeg.add(leftKnee); rightLeg.add(rightKnee); rightArm.add(hand);
  const mesh = new THREE.SkinnedMesh(bodyGeometry(appearance, customer), sharedBodyMaterial());
  mesh.name = 'simple-body'; mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  const skeleton = new THREE.Skeleton([root, leftLeg, rightLeg, leftKnee, rightKnee, leftArm, rightArm, hand]);
  body.add(root, mesh); body.updateMatrixWorld(true); mesh.bind(skeleton);
  if (kind === 'mage' || kind === 'orc' && role === 'ranged') gear.add(mageHat(appearance.body));
  const rig = { body, gear, mesh, skeleton, root, leftLeg, rightLeg, leftKnee, rightKnee, leftArm, rightArm, hand, combat, customer };
  return { body, gear, rig };
}

export function updateSimpleActor(rig, { time = 0, moving = false, eating = false, carrying = false, working = false, combatMotion = null, attackAt = time } = {}) {
  const phase = Number.isFinite(time) ? time : 0, stride = moving && !eating ? Math.sin(phase * 11) : 0;
  rig.root.position.y = eating ? (rig.customer ? 0 : -.08) : moving ? Math.abs(stride) * .025 : 0;
  rig.gear.position.y = rig.root.position.y;
  rig.leftLeg.rotation.x = stride * .6; rig.rightLeg.rotation.x = -stride * .6;
  rig.leftKnee.rotation.x = Math.max(0, -stride) * .35; rig.rightKnee.rotation.x = Math.max(0, stride) * .35;
  rig.leftKnee.scale.y = rig.rightKnee.scale.y = 1;
  rig.leftArm.rotation.set(-stride * .45, 0, 0); rig.rightArm.rotation.set(stride * .45, 0, 0);
  if (eating) {
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -Math.PI / 2;
    rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = Math.PI / 2; rig.leftKnee.scale.y = rig.rightKnee.scale.y = 1.65;
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -.7;
  } else if (carrying) {
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = -1.1;
  } else if (working && !rig.combat) {
    rig.rightArm.rotation.x = -.75 + Math.sin(phase * 9) * .25;
  }
  if (combatMotion?.attacking) {
    const age = Number.isFinite(attackAt) ? phase - attackAt : 0, t = Math.max(0, Math.min(1, age / COMBAT_ATTACK_SECONDS)), swing = Math.sin(t * Math.PI);
    if (combatMotion.clip === 'holding-right-shoot') { rig.leftArm.rotation.x = -1.05; rig.rightArm.rotation.x = -1.05 + swing * .15; }
    else if (combatMotion.clip === 'interact-right') rig.rightArm.rotation.x = -.35 - swing * .8;
    else { rig.rightArm.rotation.x = -.25 - swing * 1.25; rig.rightArm.rotation.z = -.15 + Math.sin(t * Math.PI * 2) * .25; }
  }
}

export function disposeSimpleActors(disposedGeometries = new Set(), disposedMaterials = new Set()) {
  for (const geometry of [...bodies.values(), hatGeometry].filter(Boolean)) if (!disposedGeometries.has(geometry)) { disposedGeometries.add(geometry); geometry.dispose(); }
  for (const material of [bodyMaterial, ...hats.values()].filter(Boolean)) if (!disposedMaterials.has(material)) { disposedMaterials.add(material); material.dispose(); }
  bodies.clear(); hats.clear(); bodyMaterial = hatGeometry = null;
}
