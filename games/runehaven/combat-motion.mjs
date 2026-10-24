import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const COMBAT_ATTACK_SECONDS = .45;

const geometries = new Map();
let material;
const worldScale = new THREE.Vector3(), rootScale = new THREE.Vector3();

function sharedMaterial() {
  if (!material) {
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65 });
    material.userData.combatShared = true;
  }
  return material;
}

function geometryFor(style, trim) {
  const key = `${style}:${trim}`;
  if (geometries.has(key)) return geometries.get(key);
  const parts = [];
  function part(geometry, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
  }
  if (style === 'bow') {
    part(new THREE.TorusGeometry(.29, .035, 4, 12, Math.PI), '#b58454', 0, .04, 0, 0, 0, -Math.PI / 2);
    part(new THREE.BoxGeometry(.025, .58, .025), '#f3e6c4', 0, .04, 0);
    part(new THREE.BoxGeometry(.07, .15, .08), trim, 0, .04, 0);
  } else if (style === 'arrow') {
    part(new THREE.CylinderGeometry(.015, .015, .56, 4), '#cead77', 0, 0, .2, Math.PI / 2);
    part(new THREE.ConeGeometry(.055, .13, 4), '#e3e9e7', 0, 0, .54, Math.PI / 2);
    part(new THREE.BoxGeometry(.11, .03, .13), trim, 0, 0, -.08);
  } else if (style === 'staff') {
    part(new THREE.CylinderGeometry(.035, .045, .92, 6), '#8b6844', 0, .29, 0);
    part(new THREE.IcosahedronGeometry(.14, 0), '#a8f0d4', 0, .82, 0);
    part(new THREE.CylinderGeometry(.09, .055, .1, 6), trim, 0, .66, 0);
  } else if (style === 'axe') {
    part(new THREE.CylinderGeometry(.035, .045, .83, 6), '#78533a', 0, .24, 0);
    part(new THREE.BoxGeometry(.4, .26, .07), '#c9d7db', .09, .54, 0);
    part(new THREE.BoxGeometry(.055, .3, .085), '#eff4ed', .29, .54, 0);
    part(new THREE.BoxGeometry(.1, .11, .1), trim, 0, .51, 0);
  } else {
    part(new THREE.BoxGeometry(.095, .56, .055), '#cddce1', 0, .31, 0);
    part(new THREE.ConeGeometry(.068, .16, 4), '#f5f6e9', 0, .67, 0, 0, Math.PI / 4);
    part(new THREE.BoxGeometry(.28, .065, .09), trim, 0, .025, 0);
    part(new THREE.CylinderGeometry(.035, .035, .2, 6), '#765139', 0, -.1, 0);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometries.set(key, geometry);
  return geometry;
}

function weaponStyle(kind, role) {
  if (kind === 'mage' || kind === 'orc' && role === 'ranged') return 'staff';
  if (kind === 'archer' || role === 'ranged') return 'bow';
  return role === 'raider' || role === 'elite' ? 'axe' : 'sword';
}

function bindHand(actor, rig) {
  const hand = actor.body?.getObjectByName('arm-right');
  const parent = hand?.isBone ? hand : actor.root;
  if (rig.mount.parent === parent) return;
  parent.add(rig.mount);
  if (hand?.isBone) {
    actor.root.updateWorldMatrix(true, true);
    hand.getWorldScale(worldScale); actor.root.getWorldScale(rootScale);
    // The real human/orc right arm extends along local -X. Its hand is .245
    // native units from the shoulder; cancel only the GLB height normalization.
    rig.mount.position.set(-.245, 0, .035);
    rig.mount.scale.set(rootScale.x / worldScale.x, rootScale.y / worldScale.y, rootScale.z / worldScale.z);
  } else {
    rig.mount.position.set(.38, .58, .12); rig.mount.scale.setScalar(1);
  }
  rig.hand = hand?.isBone ? hand : null;
}

export function createCombatRig(actor, kind, role = '', palette = {}) {
  if (actor.combatRig) { bindHand(actor, actor.combatRig); return actor.combatRig; }
  const style = weaponStyle(kind, role), trim = palette.trim || '#d6b36d';
  const mount = new THREE.Group(), swing = new THREE.Group(); mount.name = 'combat-hand'; swing.name = 'combat-swing'; mount.add(swing);
  const weapon = new THREE.Mesh(geometryFor(style, trim), sharedMaterial()); weapon.name = `combat-${style}`; swing.add(weapon);
  let arrow = null;
  if (style === 'bow') { arrow = new THREE.Mesh(geometryFor('arrow', trim), sharedMaterial()); arrow.name = 'combat-arrow'; swing.add(arrow); }
  const rig = { mount, swing, weapon, arrow, style, hand: null, lastSerial: 0, attackTime: -Infinity };
  actor.combatRig = rig; bindHand(actor, rig);
  swing.rotation.set(.12, 0, -.55);
  return rig;
}

export function updateCombatMotion(actor, data, { time = 0, moving = false, battle = false } = {}) {
  const rig = actor.combatRig;
  if (!rig) return { clip: moving ? 'walk' : 'idle', attackSerial: 0, attacking: false, restart: false };
  const serial = Math.max(0, Math.trunc(Number(data.attackSerial) || 0)), changed = serial !== rig.lastSerial;
  if (changed) {
    rig.lastSerial = serial;
    rig.attackTime = Number.isFinite(data.attackAt) ? data.attackAt : time;
  }
  const age = time - rig.attackTime;
  const attacking = battle && serial > 0 && age >= 0 && age < COMBAT_ATTACK_SECONDS && !(data.hp <= 0);
  const progress = attacking ? age / COMBAT_ATTACK_SECONDS : 0;
  if (battle && Number.isFinite(data.targetX) && Number.isFinite(data.targetZ)) {
    const dx = data.targetX - (Number(data.x) || 0), dz = data.targetZ - (Number(data.z) || 0);
    if (dx * dx + dz * dz > .00001) actor.angle = Math.atan2(dx, dz);
    actor.root.rotation.y = actor.angle;
  }
  let rx = .12, rz = -.55;
  if (attacking && rig.style !== 'bow') {
    // The actual arm animation supplies the main swing. A second full rotation
    // would turn a single slash into two distracting circles.
    if (rig.hand) { rx += Math.sin(progress * Math.PI) * .32; rz += Math.sin(progress * Math.PI * 2) * .28; }
    else if (progress < .28) { const t = progress / .28; rx = .12 - .92 * t; rz = -.55 - .7 * t; }
    else if (progress < .68) { const t = (progress - .28) / .4; rx = -.8 + 1.8 * t; rz = -1.25 + 2.1 * t; }
    else { const t = (progress - .68) / .32; rx = 1 - .88 * t; rz = .85 - 1.4 * t; }
  }
  if (rig.style === 'bow') {
    rx -= attacking ? Math.sin(progress * Math.PI) * .18 : 0;
    rig.arrow.position.z = attacking ? (progress < .55 ? -progress * .2 : (progress - .55) * 2.2) : 0;
    rig.arrow.visible = !attacking || progress < .9;
  }
  rig.swing.rotation.set(rx, 0, rz);
  const lean = attacking ? Math.sin(progress * Math.PI) * .1 : 0;
  if (actor.body) actor.body.rotation.x = lean;
  if (actor.gear) actor.gear.rotation.x = lean;
  const clip = attacking ? rig.style === 'bow' ? 'holding-right-shoot' : rig.style === 'staff' ? 'interact-right' : 'attack-melee-right' : moving ? 'walk' : 'idle';
  return { clip, attackSerial: serial, attacking, restart: attacking && changed };
}

export function disposeCombatMotion(disposedGeometries = new Set(), disposedMaterials = new Set()) {
  for (const geometry of geometries.values()) if (!disposedGeometries.has(geometry)) {
    disposedGeometries.add(geometry); geometry.dispose();
  }
  geometries.clear();
  if (material && !disposedMaterials.has(material)) { disposedMaterials.add(material); material.dispose(); }
  material = null;
}
