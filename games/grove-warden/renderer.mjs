import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { WORLD, HUNT_ZONES, STAGES, isStageUnlocked, isZoneUnlocked, getCamp } from './rules.mjs';

const TAU = Math.PI * 2;
const palette = { grass: 0xbbe6b4, pale: 0xfff2d4, green: 0x88d7c4, dark: 0x6c668d, bark: 0xc8a9b5, gold: 0xffd577, skin: 0xffe4da, red: 0xf5a6c9 };
const gearColors = { sprout: 0x8fea6b, thorn: 0xef987b, moon: 0xaaa4ff, ember: 0xff934f };
const staffColors = { single: gearColors.sprout, burst: gearColors.thorn, spread: gearColors.moon, explosive: gearColors.ember };
const materials = new Map();
const geometries = new Map();
function material(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .54, metalness: 0, flatShading: false, ...extra }));
  return materials.get(key);
}
function geometry(type, args) {
  const key = `${type}:${args}`;
  if (!geometries.has(key)) geometries.set(key, new THREE[type](...args));
  return geometries.get(key);
}
function impactGeometry() {
  if (!geometries.has('impact-star')) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU, radius = i % 2 ? .23 : 1, x = Math.sin(angle) * radius, y = Math.cos(angle) * radius;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath(); geometries.set('impact-star', new THREE.ShapeGeometry(shape));
  }
  return geometries.get('impact-star');
}
function mesh(parent, type, args, color, x = 0, y = 0, z = 0, scale = [1, 1, 1], extra) {
  const m = new THREE.Mesh(geometry(type, args), material(color, extra));
  m.position.set(x, y, z); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(p, color, x, y, z, sx, sy = sx, sz = sx) { return mesh(p, 'SphereGeometry', [1, 14, 10], color, x, y, z, [sx, sy, sz]); }
function bone(p, from, to, radius, color) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a);
  const m = mesh(p, 'CylinderGeometry', [radius * .78, radius, d.length(), 8], color);
  m.position.copy(a.add(b).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
function circle(p, radius, color, opacity = 1) {
  const m = mesh(p, 'CircleGeometry', [radius, 40], color, 0, .025, 0, [1, 1, 1], { transparent: opacity < 1, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.rotation.x = -Math.PI / 2; m.castShadow = m.receiveShadow = false; m.renderOrder = 2; return m;
}
function ring(p, inner, outer, color, opacity = 1) {
  const m = mesh(p, 'RingGeometry', [inner, outer, 48], color, 0, .035, 0, [1, 1, 1], { transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  m.rotation.x = -Math.PI / 2; m.castShadow = m.receiveShadow = false; m.renderOrder = 3; return m;
}
function heart(parent, color, x, y, z, size = .2, extra) {
  if (!geometries.has('toy-heart')) {
    const shape = new THREE.Shape(); shape.moveTo(0, -.82);
    shape.bezierCurveTo(-.18, -.58, -.92, -.05, -.92, .4);
    shape.bezierCurveTo(-.92, 1.02, -.25, 1.08, 0, .58);
    shape.bezierCurveTo(.25, 1.08, .92, 1.02, .92, .4);
    shape.bezierCurveTo(.92, -.05, .18, -.58, 0, -.82); shape.closePath();
    const shapeGeometry = new THREE.ExtrudeGeometry(shape, { depth: .22, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: .055, bevelThickness: .045, curveSegments: 5 });
    shapeGeometry.translate(0, -.08, -.11); geometries.set('toy-heart', shapeGeometry);
  }
  const part = new THREE.Mesh(geometries.get('toy-heart'), material(color, extra));
  part.position.set(x, y, z); part.scale.setScalar(size); part.castShadow = part.receiveShadow = true; parent.add(part); return part;
}
function eyes(p, y, z, x = .17, color = 0x6e54a1, size = .08) {
  for (const side of [-1, 1]) {
    ball(p, 0xfffcff, side * x, y, z, size * 1.19, size * 1.38, size * .34);
    const iris = ball(p, color, side * x, y - size * .05, z + size * .3, size * .81, size * 1.04, size * .24);
    iris.material = material(color, { roughness: .45 });
    ball(p, 0xffffff, side * x - size * .26, y + size * .42, z + size * .52, size * .3, size * .35, size * .13);
  }
}
function toySmile(p, y, z, size = .055) { return ball(p, 0xae719d, 0, y, z, size, size * .45, size * .24); }
function makeDruid() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  circle(root, .58, 0x7d729d, .18); ring(root, .65, .71, 0xffe9ba, .8);
  const left = ball(rig, 0xd2b5ef, -.23, .15, .06, .21, .15, .3), right = ball(rig, 0xd2b5ef, .23, .15, .06, .21, .15, .3);
  ball(rig, 0xb5eddb, 0, .81, -.015, .36, .43, .3);
  for (const side of [-1, 0, 1]) {
    const petal = ball(rig, side ? 0xa2e4cf : 0xd6f7df, side * .29, .55, side ? .02 : .22, .26, .3, .2); petal.rotation.z = -side * .22;
  }
  heart(rig, 0xf1a6cd, 0, .93, .3, .12);
  ball(rig, 0xcab4ef, 0, 1.55, -.055, .56, .55, .46);
  ball(rig, palette.skin, 0, 1.5, .21, .46, .43, .35);
  for (const side of [-1, 1]) {
    ball(rig, side < 0 ? 0xafdfd6 : 0xc8b3ed, side * .4, 1.48, .08, .21, .41, .3);
    const bang = ball(rig, side < 0 ? 0xb5e9dc : 0xd3bff1, side * .2, 1.85, .33, .28, .19, .23); bang.rotation.z = side * .25;
    ball(rig, 0xf4adc7, side * .29, 1.39, .493, .075, .045, .025);
  }
  eyes(rig, 1.57, .555, .185, 0x7351ac, .105); toySmile(rig, 1.36, .558, .048);
  const crown = mesh(rig, 'TorusGeometry', [.25, .042, 5, 16], palette.gold, 0, 2.045, .08, [1, .7, 1]); crown.rotation.x = Math.PI / 2;
  heart(rig, 0xf8b7d8, 0, 2.15, .26, .13);
  const shoulders = [ball(rig, 0xcaf3df, -.39, 1.04, .015, .2, .18, .2), ball(rig, 0xcaf3df, .39, 1.04, .015, .2, .18, .2)];
  const arm = bone(rig, [.4, .99, 0], [.61, .78, .22], .12, 0xb6e9d9);
  bone(rig, [-.4, .99, 0], [-.48, .72, .25], .12, 0xb6e9d9);
  ball(rig, palette.skin, .61, .79, .23, .13); ball(rig, palette.skin, -.48, .72, .25, .13);
  const bag = new THREE.Group(); rig.add(bag); bag.visible = false;
  ball(bag, 0xd4b3e9, 0, .87, -.37, .3, .31, .22); heart(bag, 0xffdfa0, 0, .93, -.59, .12);
  const staff = new THREE.Group(); staff.position.set(.69, .8, .25); rig.add(staff);
  bone(staff, [0, -.72, 0], [0, 1.22, 0], .055, 0xffd7ab);
  const surround = heart(staff, palette.gold, 0, 1.35, 0, .3); surround.scale.z = .48;
  const jewel = heart(staff, 0xc6f3e0, 0, 1.35, .055, .22, { emissive: 0x94ceb3, emissiveIntensity: .5 }); jewel.name = 'equipped-jewel';
  const castGlow = ball(staff, 0xffeaf8, 0, 1.35, .055, .27); castGlow.material = new THREE.MeshBasicMaterial({ color: 0xffeaf8, transparent: true, opacity: .8, depthWrite: false }); castGlow.castShadow = false; castGlow.visible = false;
  makeWings(rig, 0xf5bddb, .45);
  return { root, rig, left, right, jewel, arm, shoulders, bag, staff, castGlow };
}
function makeOwl() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = 'owl-companion'; root.add(rig); root.visible = false;
  const shadow = circle(root, .43, 0x79739c, .16);
  ball(rig, 0xd5c3ed, 0, -.06, -.025, .39, .42, .31); ball(rig, 0xffefdc, 0, -.12, .21, .27, .29, .13);
  ball(rig, 0xc5b1e5, 0, .22, .015, .43, .34, .32);
  const irisMaterial = material(0x7654a8, { emissive: 0x9e7ac8, emissiveIntensity: .15, roughness: .45 });
  for (const side of [-1, 1]) {
    ball(rig, 0xfff4e4, side * .175, .2, .29, .235, .245, .085);
    const iris = ball(rig, 0x7654a8, side * .17, .21, .369, .125, .145, .039); iris.material = irisMaterial;
    ball(rig, 0xffffff, side * .17 - .035, .261, .402, .04, .045, .015);
    const tuft = ball(rig, 0xccb4ed, side * .28, .515, -.015, .1, .2, .09); tuft.rotation.z = -side * .35;
    ball(rig, 0xffd7a5, side * .135, -.43, .115, .1, .055, .13);
    ball(rig, 0xf5b3d1, side * .3, .06, .348, .065, .035, .018);
  }
  const beak = mesh(rig, 'ConeGeometry', [.075, .15, 8], 0xffcf8d, 0, .07, .415); beak.rotation.x = -Math.PI / 2;
  const scarf = mesh(rig, 'TorusGeometry', [.27, .065, 5, 14], 0x9edfcf, 0, -.225, .035, [1, 1, .82]); scarf.rotation.x = Math.PI / 2;
  heart(rig, 0xffd9a2, 0, -.25, .3, .1);
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .31, .03, -.03); rig.add(wing);
    const feather = ball(wing, 0xd8c5ef, side * .17, -.015, 0, .3, .14, .19); feather.rotation.z = side * .2;
    ball(wing, 0xf2e3fa, side * .32, -.055, .025, .16, .085, .13); return wing;
  });
  const launchGlow = ball(rig, 0xe3edff, 0, .04, .49, .16);
  launchGlow.material = material(0xe3edff, { emissive: 0xb5bbff, emissiveIntensity: 1, transparent: true, opacity: .55, depthWrite: false });
  launchGlow.castShadow = false; launchGlow.visible = false;
  return { root, rig, shadow, wings, launchGlow, irisMaterial };
}
function makeWings(parent, color, size = 1) {
  return [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .38, 1.15, -.2); wing.scale.setScalar(size); parent.add(wing);
    const key = `toy-wing-${side}`;
    if (!geometries.has(key)) {
      const shape = new THREE.Shape(); shape.moveTo(0, -.13);
      shape.bezierCurveTo(side * .14, .44, side * .8, 1.15, side * 1.19, .91);
      shape.bezierCurveTo(side * 1.58, .64, side * 1.18, .15, side * .7, .06);
      shape.bezierCurveTo(side * 1.32, -.1, side * 1.03, -.69, side * .65, -.53);
      shape.bezierCurveTo(side * .32, -.49, side * .12, -.26, 0, -.13); shape.closePath();
      geometries.set(key, new THREE.ExtrudeGeometry(shape, { depth: .07, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: .035, bevelThickness: .025, curveSegments: 5 }));
    }
    const membrane = new THREE.Mesh(geometries.get(key), material(color, { side: THREE.DoubleSide })); membrane.castShadow = false; membrane.receiveShadow = true; wing.add(membrane);
    const spot = ball(wing, 0xfff1e0, side * .88, .53, .11, .2, .3, .035); spot.rotation.z = -side * .5; spot.castShadow = false;
    return wing;
  });
}
function makeForm(form) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = `player-${form}`; root.add(rig); root.visible = false;
  circle(root, form === 'bear' ? .84 : .65, 0x79739c, .18); ring(root, .74, .8, 0xffe6b1, .8);
  const feet = [], arms = [], wings = [];
  const foot = (x, y, z, color, size = .2) => { const part = ball(rig, color, x, y, z, size, size * .75, size * 1.35); feet.push({ part, y, z }); };
  const head = new THREE.Group(); rig.add(head);
  if (form === 'wolf') {
    ball(rig, 0xa9d9ee, 0, .7, -.14, .43, .4, .69); ball(rig, 0xfff2e5, 0, .8, .3, .32, .4, .29);
    head.position.set(0, 1.12, .45); ball(head, 0xb3ddf1, 0, 0, 0, .48, .45, .43); ball(head, 0xfff2e5, 0, -.14, .33, .28, .18, .22); ball(head, 0x777da6, 0, -.08, .54, .1, .075, .055);
    for (const side of [-1, 1]) { const ear = mesh(head, 'ConeGeometry', [.2, .47, 8], 0xa3cce9, side * .3, .38, -.03); ear.rotation.z = -side * .16; ball(head, 0xf4c6df, side * .3, .4, .09, .1, .14, .035); }
    eyes(head, .09, .414, .205, 0x6b64a8, .09);
    for (const x of [-.29, .29]) for (const z of [-.46, .38]) foot(x, .17, z, 0xc8e7f4, .2);
    const tail = bone(rig, [0, .7, -.61], [0, 1.1, -1.12], .23, 0xb3daf1); ball(rig, 0xfff0e4, 0, 1.14, -1.13, .2, .23, .2);
    heart(rig, 0xf4b6d6, 0, .93, .485, .15);
    return { root, rig, feet, arms, wings, head, tail };
  }
  if (form === 'bear') {
    ball(rig, 0xf5b8c9, 0, .86, -.025, .68, .73, .55); ball(rig, 0xffe8d8, 0, .84, .43, .43, .46, .14);
    head.position.set(0, 1.58, .16); ball(head, 0xf8c0cc, 0, 0, 0, .61, .56, .48); ball(head, 0xffeddb, 0, -.15, .38, .31, .22, .16); ball(head, 0xa5729e, 0, -.06, .53, .115, .075, .055); eyes(head, .09, .46, .235, 0x80578f, .105);
    for (const side of [-1, 1]) { ball(head, 0xefafc4, side * .43, .39, -.03, .2, .2, .14); ball(head, 0xffe2dd, side * .43, .4, .08, .115, .11, .035); const arm = new THREE.Group(); arm.position.set(side * .59, 1.12, .1); rig.add(arm); ball(arm, 0xf4b8cb, side * .09, -.29, .03, .25, .43, .25); arms.push(arm); foot(side * .4, .2, .12, 0xe7a8c0, .29); }
    heart(rig, 0xc9b6ee, 0, 1.01, .575, .2);
    return { root, rig, feet, arms, wings, head };
  }
  ball(rig, 0xc8b3eb, 0, .87, -.1, .48, .55, .66); ball(rig, 0xffeddb, 0, .83, .4, .33, .4, .14);
  head.position.set(0, 1.39, .46); ball(head, 0xcebcf0, 0, 0, 0, .51, .47, .46); ball(head, 0xffebdb, 0, -.14, .34, .31, .2, .28); eyes(head, .11, .44, .22, 0x7656a6, .1);
  for (const side of [-1, 1]) { const horn = mesh(head, 'ConeGeometry', [.1, .31, 8], 0xffdfac, side * .29, .43, -.1); horn.rotation.z = -side * .18; for (const z of [-.4, .32]) foot(side * .34, .23, z, 0xb7a0dc, .19); }
  wings.push(...makeWings(rig, 0xf2c0df, .7));
  bone(rig, [0, .68, -.52], [.25, .51, -1.06], .17, 0xbfa6e4); heart(rig, 0xf2badb, .31, .65, -1.15, .19);
  for (let i = 0; i < 2; i++) ball(rig, 0xffd9af, 0, 1.35 - i * .07, -.12 - i * .3, .11, .17, .1);
  const flame = ball(head, 0xffe6b7, 0, -.08, .69, .12); flame.material = material(0xffe6b7, { emissive: 0xffa981, emissiveIntensity: 1 }); flame.visible = false; flame.castShadow = false;
  return { root, rig, feet, arms, wings, head, flame };
}
function makeEnemy(type, variant = '', trait = 'normal') {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = `enemy-${type}`; root.add(rig);
  const feet = [], wings = [];
  const foot = (...args) => { const part = ball(rig, ...args); feet.push({ part, y: part.position.y, z: part.position.z }); return part; };
  const boss = type === 'boss';
  circle(root, boss ? 1.25 : .47, 0x7b7294, .18);
  if (type === 'runner') {
    ball(rig, 0xa0d6ed, 0, .84, -.15, .29, .32, .58); ball(rig, 0xb8e3f4, 0, 1.05, .36, .39, .36, .35); ball(rig, 0xffecdf, 0, .92, .62, .21, .14, .18); eyes(rig, 1.12, .678, .17, 0x6c65a5, .075);
    for (const side of [-1, 1]) { const ear = ball(rig, 0xc5b8ec, side * .27, 1.43, .24, .105, .23, .08); ear.rotation.z = -side * .2; for (const z of [-.4, .32]) { bone(rig, [side * .22, .77, z], [side * .24, .16, z], .065, 0xa3c6e6); foot(0xe6e7fa, side * .24, .13, z, .125, .1, .19); } }
    bone(rig, [0, .8, -.55], [0, 1.06, -1.03], .13, 0xc4bcec);
  } else if (type === 'swarm') {
    ball(rig, 0xffd889, 0, .39, -.06, .35, .3, .39); ball(rig, 0xffe8a9, -.15, .47, -.06, .17, .25, .31); ball(rig, 0xffe4a2, .15, .47, -.06, .17, .25, .31); ball(rig, 0xf3bb99, 0, .34, .3, .28, .23, .22); eyes(rig, .41, .508, .13, 0x9b6a95, .063);
    for (const side of [-1, 1]) for (const z of [-.22, .04, .24]) foot(0xd8b1c6, side * .36, .12, z + .05, .13, .075, .09);
    for (const side of [-1, 1]) ball(rig, 0xe9b7db, side * .16, .67, .27, .05, .13, .045);
  } else if (type === 'flyer') {
    ball(rig, 0xcfb8ed, 0, .53, -.02, .34, .35, .3); ball(rig, 0xe2cef5, 0, .87, .1, .4, .37, .34); eyes(rig, .94, .43, .18, 0x8760b2, .085); toySmile(rig, .73, .435, .045);
    wings.push(...makeWings(rig, 0xf5c6e2, .55)); heart(rig, 0xffdfac, 0, .52, .295, .13);
  } else if (type === 'boar') {
    ball(rig, 0xf4b5ca, 0, .59, -.08, .52, .43, .65); ball(rig, 0xf9c4d5, 0, .73, .4, .5, .43, .41); ball(rig, 0xffe0dc, 0, .56, .77, .29, .18, .13);
    for (const side of [-1, 1]) { const ear = ball(rig, 0xe8add0, side * .31, 1.12, .31, .16, .25, .1); ear.rotation.z = -side * .35; mesh(rig, 'ConeGeometry', [.065, .19, 8], 0xffeccf, side * .31, .5, .76).rotation.x = -.6; }
    eyes(rig, .83, .754, .22, 0x92628f, .075);
    for (const x of [-.31, .31]) for (const z of [-.36, .34]) foot(0xce9cbe, x, .16, z, .14, .17, .17);
  } else if (type === 'caster') {
    ball(rig, 0xa8dcd9, 0, .59, 0, .45, .51, .4); ball(rig, 0xd9f0e9, 0, 1.02, .08, .46, .37, .37);
    const cap = mesh(rig, 'ConeGeometry', [.48, .61, 12], 0xcab6ee, 0, 1.44, -.04); cap.rotation.z = -.22;
    ball(rig, 0xffe5b3, -.08, 1.76, -.04, .11); eyes(rig, 1.08, .44, .19, 0x8462ab, .085);
    bone(rig, [.52, .18, .1], [.52, 1.25, .1], .045, 0xe4bed9); heart(rig, 0xf4bbd9, .52, 1.42, .1, .18);
  } else if (boss) {
    const bodyColor = variant === 'sky' ? 0xc4b8ee : variant === 'ancient' ? 0xb1decf : 0xafd7de;
    ball(rig, bodyColor, 0, 1, -.04, .98, 1.03, .77); ball(rig, 0xffefdc, 0, .91, .65, .63, .67, .16);
    ball(rig, variant === 'sky' ? 0xd7c8f4 : 0xc8e7de, 0, 1.92, .15, .87, .77, .65);
    for (const side of [-1, 1]) { ball(rig, bodyColor, side * .92, 1.02, .08, .36, .6, .35); foot(0xb4adc8, side * .57, .26, .12, .42, .29, .45); const ear = ball(rig, variant === 'sky' ? 0xe8bfdc : 0xb3d5b7, side * .65, 2.52, -.1, .25, .39, .21); ear.rotation.z = -side * .3; }
    eyes(rig, 1.99, .778, .34, 0x7a5a9e, .15); toySmile(rig, 1.68, .798, .1);
    heart(rig, 0xffcf9d, 0, 1.05, .83, .28, { emissive: 0xeab3a1, emissiveIntensity: .2 });
    if (variant === 'sky') wings.push(...makeWings(rig, 0xe6c7ef, 1.25));
    if (variant === 'ancient') for (const side of [-1, 1]) mesh(rig, 'OctahedronGeometry', [.25, 0], 0xf0c3e2, side * .79, 1.54, .44, [1, 1.35, .8]);
  } else {
    ball(rig, 0xffefdf, 0, .48, 0, .38, .46, .32); ball(rig, 0xf5b1d0, 0, .99, -.03, .68, .35, .6);
    ball(rig, 0xffefdf, -.25, 1.18, .22, .15, .055, .13); ball(rig, 0xe4cdf6, .28, 1.16, .06, .17, .055, .14);
    eyes(rig, .59, .322, .15, 0x8d629e, .073); toySmile(rig, .41, .33, .045);
    foot(0xe6bad7, -.25, .13, .05, .15, .14, .22); foot(0xe6bad7, .25, .13, .05, .15, .14, .22);
  }
  const flying = type === 'flyer' || variant === 'sky' || trait === 'airborne';
  const bar = new THREE.Group(); bar.position.y = flying ? boss ? 4.15 : 2.7 : boss ? 3.15 : 1.85; root.add(bar);
  const backing = mesh(bar, 'PlaneGeometry', [boss ? 2.3 : .9, .11], 0x6f6384); backing.castShadow = false;
  const fill = mesh(bar, 'PlaneGeometry', [boss ? 2.22 : .82, .065], boss ? 0xf4b7d2 : 0xffd996, 0, 0, .005); fill.castShadow = false;
  const danger = new THREE.Group(); root.add(danger); danger.visible = false;
  const warningDisk = circle(danger, 1, 0xff6048, .25), warningRing = ring(danger, .94, 1, 0xbd4c78, .95);
  const warningLine = mesh(danger, 'PlaneGeometry', [1, 1], 0xff6945, 0, .045, 0, [1, 1, 1], { transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide }); warningLine.rotation.x = -Math.PI / 2; warningLine.castShadow = false;
  // Only the visual body owns flash materials; health bars and telegraphs stay unchanged.
  const copies = new Map(), hitMaterials = [];
  rig.traverse(part => {
    if (!part.isMesh) return;
    const own = base => {
      if (!copies.has(base)) {
        const copy = base.clone(); copies.set(base, copy);
        hitMaterials.push({ material: copy, emissive: base.emissive.clone(), intensity: base.emissiveIntensity });
      }
      return copies.get(base);
    };
    part.material = Array.isArray(part.material) ? part.material.map(own) : own(part.material);
  });
  return { root, rig, bar, fill, danger, warningDisk, warningRing, warningLine, type, variant, trait, flying, wings, poolKey: `${type}:${variant}`, feet, hitMaterials, hitTime: 0, recoilX: 0, recoilZ: 0, walkBlend: 0, lastX: null, lastZ: null, moveAngle: 0 };
}

export async function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute('aria-label', '거점과 사냥터가 이어진 입체적인 숲 필드'); container.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1e5fa); scene.fog = new THREE.Fog(0xf1e5fa, 52, 95);
  const camera = new THREE.OrthographicCamera(-10, 10, 13, -13, .1, 110); camera.position.set(0, 27, 21 + WORLD.camp.z); camera.lookAt(0, 0, WORLD.camp.z);
  scene.add(new THREE.HemisphereLight(0xfff8ff, 0xaaa8cf, 1.25));
  const light = new THREE.DirectionalLight(0xfff4ed, 2.2); light.position.set(-8, 19, 12); light.castShadow = true; light.shadow.mapSize.set(1536, 1536); Object.assign(light.shadow.camera, { left: -17, right: 17, top: 18, bottom: -18, near: 1, far: 60 }); light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -.0007; light.shadow.normalBias = .04; scene.add(light, light.target);
  const land = new THREE.Group(); scene.add(land);
  const worldLength = WORLD.maxZ - WORLD.minZ;
  mesh(land, 'BoxGeometry', [70, 1, worldLength + 12], palette.grass, 0, -.5, (WORLD.maxZ + WORLD.minZ) / 2);
  const stageColors = { meadow: 0xa3dca7, deep: 0x9ddbd3, ancient: 0xc7bee9, sky: 0xb9dfef };
  for (const stage of STAGES) {
    const ground = mesh(land, 'PlaneGeometry', [70, stage.maxZ - stage.minZ], stageColors[stage.id], 0, .006, (stage.minZ + stage.maxZ) / 2); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  }
  const pathPoints = [[0, 23], [0, 16], [0, 9], [-1, 3], [1, -5], [0, -14], [0, -17], [-1, -28], [0, -42], [0, -44], [-1, -56], [0, -70], [0, -72], [1, -84], [0, -98]];
  // A single road polygon replaces overlapping coplanar segment ends.
  const roadShape = new THREE.Shape();
  const roadOutline = [...pathPoints.map(([x, z]) => [x - 1.45, -z]), ...[...pathPoints].reverse().map(([x, z]) => [x + 1.45, -z])];
  roadOutline.forEach(([x, y], i) => i === 0 ? roadShape.moveTo(x, y) : roadShape.lineTo(x, y)); roadShape.closePath();
  if (!geometries.has('world-road')) geometries.set('world-road', new THREE.ShapeGeometry(roadShape));
  const road = new THREE.Mesh(geometries.get('world-road'), material(0xffe6c6)); road.name = 'continuous-road'; road.rotation.x = -Math.PI / 2; road.position.y = .016; road.receiveShadow = true; land.add(road);
  function worldHeart(parent, color, x, y, z, size = .3) {
    if (!geometries.has('world-fairy-heart')) {
      const shape = new THREE.Shape(); shape.moveTo(0, .22);
      shape.bezierCurveTo(-.58, .87, -1, .25, -.64, -.18); shape.bezierCurveTo(-.43, -.46, -.14, -.64, 0, -.78);
      shape.bezierCurveTo(.14, -.64, .43, -.46, .64, -.18); shape.bezierCurveTo(1, .25, .58, .87, 0, .22);
      const heartGeometry = new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 2, steps: 1, curveSegments: 7 });
      heartGeometry.center(); geometries.set('world-fairy-heart', heartGeometry);
    }
    const charm = new THREE.Mesh(geometries.get('world-fairy-heart'), material(color)); charm.position.set(x, y, z); charm.scale.setScalar(size); charm.castShadow = true; parent.add(charm); return charm;
  }
  const camp = new THREE.Group(); camp.position.set(WORLD.camp.x, 0, WORLD.camp.z); scene.add(camp);
  circle(camp, 5.8, 0xffdfeb).position.y = .023; ring(camp, WORLD.camp.radius - .03, WORLD.camp.radius + .03, 0xfffcdf, .8).position.y = .04;
  const bonfire = new THREE.Group(); bonfire.position.x = -1.7; camp.add(bonfire);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const stone = ball(bonfire, i % 2 ? 0xe1c6f2 : 0xffe8b5, Math.cos(a) * 1.15, .25, Math.sin(a) * 1.15, .3, .23, .3); stone.rotation.y = a; }
  mesh(bonfire, 'CylinderGeometry', [.79, .95, .32, 16], 0xe6b9db, 0, .24, 0); mesh(bonfire, 'CylinderGeometry', [.64, .79, .13, 16], 0xfff3ce, 0, .46, 0);
  const fire = new THREE.Group(); bonfire.add(fire);
  const campCrystal = mesh(fire, 'OctahedronGeometry', [.53, 0], 0xa6eadb, 0, 1.03, 0, [1, 1.55, 1], { emissive: 0x62c7c1, emissiveIntensity: .22 }); campCrystal.rotation.z = .08;
  worldHeart(fire, 0xffc2de, 0, 1.12, .48, .29);
  circle(bonfire, 1.85, 0xf3dcff, .2).position.y = .045;
  const chest = new THREE.Group(); chest.position.set(-3.1, 0, 1.5); camp.add(chest);
  mesh(chest, 'BoxGeometry', [1.2, .72, .82], 0xcba7e6, 0, .43, 0); ball(chest, 0xf4bada, 0, .82, 0, .62, .3, .43);
  for (const s of [-1, 1]) mesh(chest, 'BoxGeometry', [.1, .91, .9], palette.gold, s * .38, .53, 0);
  worldHeart(chest, 0xfff1b3, 0, .54, .46, .2);
  const forge = new THREE.Group(); forge.position.set(3.8, 0, -.5); camp.add(forge);
  mesh(forge, 'CylinderGeometry', [.96, 1.02, .35, 16], 0xc7b3e5, 0, .2, 0); mesh(forge, 'CylinderGeometry', [.7, .78, 1.55, 16], 0xffebdf, 0, 1.12, 0);
  ball(forge, 0xdbb2ee, 0, 2.01, -.06, .96, .54, .84); mesh(forge, 'TorusGeometry', [.76, .07, 6, 16], 0xffdc8f, 0, 1.69, -.06).rotation.x = Math.PI / 2;
  mesh(forge, 'OctahedronGeometry', [.34, 0], 0x9de4d1, 0, 2.68, -.06, [1, 1.3, 1]); worldHeart(forge, 0xf6b1d1, 0, 1.08, .77, .29);
  mesh(forge, 'CylinderGeometry', [.42, .36, .18, 12], 0xffe5a7, -.94, .73, .8); mesh(forge, 'CylinderGeometry', [.15, .2, .65, 10], 0xcbb1de, -.94, .35, .8);
  const npc = new THREE.Group(); npc.position.set(-3.4, 0, -2.3); camp.add(npc);
  ball(npc, 0xbfa6e7, 0, .59, 0, .43, .53, .34); ball(npc, palette.skin, 0, 1.25, .04, .43, .42, .36); eyes(npc, 1.29, .365, .16, 0x5b498a, .09);
  ball(npc, 0xffbacd, -.33, 1.17, .31, .085, .045, .035); ball(npc, 0xffbacd, .33, 1.17, .31, .085, .045, .035);
  ball(npc, 0xffedc7, 0, 1.63, -.035, .45, .19, .36); worldHeart(npc, 0x9cdcc9, 0, 1.72, .25, .15); bone(npc, [.45, .05, .15], [.45, 1.5, .15], .045, palette.gold);
  const questMark = new THREE.Group(); questMark.position.set(0, 2.27, 0); npc.add(questMark); mesh(questMark, 'BoxGeometry', [.13, .39, .13], 0xf5d67d, 0, .15, 0); ball(questMark, 0xf5d67d, 0, -.18, 0, .09);
  const gates = STAGES.slice(1).map(stage => {
    const root = new THREE.Group(); root.name = `gate-${stage.id}`; root.position.z = stage.maxZ; scene.add(root);
    const barrier = new THREE.Group(); root.add(barrier);
    for (let x = WORLD.minX; x <= WORLD.maxX; x += 2) {
      mesh(barrier, 'CylinderGeometry', [.12, .14, 1.4, 8], 0xffe9ce, x, .7, 0);
      if (x < WORLD.maxX) for (const y of [.45, .95]) mesh(barrier, 'BoxGeometry', [2.1, .15, .12], 0xb7dcd3, x + 1, y, 0);
    }
    const arch = new THREE.Group(); arch.name = 'fairy-gate-arch'; root.add(arch);
    for (const x of [-2, 2]) { mesh(arch, 'CylinderGeometry', [.28, .36, 3.2, 12], 0xffecd9, x, 1.6, 0); ball(arch, 0xe2c0eb, x, 3.22, 0, .4, .35, .38); }
    mesh(arch, 'BoxGeometry', [4.8, .4, .6], 0xd3b4e4, 0, 3.2, 0); worldHeart(arch, stage.id === 'sky' ? 0x9adeeb : 0xffb2d2, 0, 3.72, 0, .46);
    const archMaterials = [];
    arch.traverse(part => { if (!part.isMesh) return; part.material = part.material.clone(); part.material.transparent = true; part.material.depthWrite = false; archMaterials.push(part.material); });
    const lock = new THREE.Group(); lock.position.set(0, 2, .35); barrier.add(lock); mesh(lock, 'BoxGeometry', [.62, .55, .17], palette.gold); mesh(lock, 'TorusGeometry', [.23, .065, 6, 14], 0xffe39a, 0, .35, 0); mesh(lock, 'BoxGeometry', [.07, .18, .04], 0x775d35, 0, 0, .1);
    return { stage, root, barrier, archMaterials, opacity: 1 };
  });
  const restCamps = STAGES.slice(1).map(stage => {
    const root = new THREE.Group(); root.name = `camp-${stage.id}`; root.position.set(stage.camp.x, 0, stage.camp.z); scene.add(root);
    circle(root, stage.camp.radius, stage.id === 'sky' ? 0xe8ddfa : 0xffe0e9).position.y = .028;
    ring(root, stage.camp.radius - .035, stage.camp.radius + .035, 0xfff5d4, .8).position.y = .055;
    for (let i = 0; i < 7; i++) { const angle = i / 7 * TAU; ball(root, 0xdbbce7, -1 + Math.cos(angle) * .65, .13, Math.sin(angle) * .65, .22, .16, .2); }
    mesh(root, 'OctahedronGeometry', [.43, 0], 0xa1e5d5, -1, .72, 0, [1, 1.5, 1], { emissive: 0x7ac7c6, emissiveIntensity: .22 }); worldHeart(root, 0xffc3de, -1, .75, .36, .2);
    mesh(root, 'BoxGeometry', [.9, .6, .65], 0xc9a5e2, 1.1, .35, .5); mesh(root, 'BoxGeometry', [.12, .66, .7], palette.gold, 1.1, .4, .5);
    for (const x of [-.5, .5]) mesh(root, 'CylinderGeometry', [.12, .12, 1.2, 8], 0xe1bad2, x, .4, -1.4).rotation.z = Math.PI / 2;
    return { stage, root };
  });
  const landmarks = new THREE.Group(); scene.add(landmarks);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) { const pillar = mesh(landmarks, 'CylinderGeometry', [.4, .55, 2.8 + i * .3, 12], 0xffe9d1, side * (11.5 + i % 2), 1.4 + i * .15, -50 - i * 4); pillar.rotation.z = side * .08; worldHeart(pillar, 0xd8a7e5, 0, 1.6 + i * .15, 0, .38); }
    for (let i = 0; i < 4; i++) mesh(landmarks, 'OctahedronGeometry', [.6, 0], i % 2 ? 0xb8aff0 : 0x8ac8ed, side * (11.5 + i % 2), .9, -77 - i * 4, [.65, 1.7, .7]);
  }
  const territories = HUNT_ZONES.map(zone => {
    const root = new THREE.Group(); root.position.set(zone.x, .03, zone.z); scene.add(root);
    circle(root, zone.radius, zone.deep ? 0x99cbe4 : 0xc4f1ba, .1);
    const edge = ring(root, zone.radius - .035, zone.radius + .035, 0xfff4d1, .24); edge.material = edge.material.clone();
    if (zone.bossId) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; mesh(root, 'OctahedronGeometry', [.35, 0], 0xd8b5e6, Math.cos(a) * (zone.radius + .2), .18, Math.sin(a) * (zone.radius + .2), [1, .9, 1]); }
    return { zone, root, edge, label: null };
  });
  const decorations = new THREE.Group(); scene.add(decorations);
  const occludingTrees = [];
  // Seeded decoration placement stays independent from combat randomness.
  let seed = 47281; const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 76; i++) {
    const patch = mesh(decorations, 'CircleGeometry', [.7 + random() * 1.6, 12], i % 2 ? 0x67bd95 : 0xe7efb6, (random() - .5) * 30, .024, WORLD.minZ + random() * worldLength, [1.6, .65, 1], { transparent: true, opacity: .12, depthWrite: false });
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = random() * TAU; patch.castShadow = patch.receiveShadow = false; patch.renderOrder = 1;
  }
  for (let i = 0; i < Math.ceil(worldLength) + 2; i++) {
    const side = i % 2 ? 1 : -1, z = WORLD.minZ + Math.floor(i / 2) * 2;
    const rock = mesh(decorations, 'DodecahedronGeometry', [1, 0], i % 3 ? 0xc3b3df : 0xf0cadd, side * 16.1, .6, z, [.8 + random() * .5, .8 + random() * .9, 1.1 + random() * .4]); rock.rotation.y = random() * TAU;
  }
  for (const z of [WORLD.minZ - .8, WORLD.maxZ + .8]) for (let x = -15; x <= 15; x += 1.5) mesh(decorations, 'DodecahedronGeometry', [1, 0], 0xddbfdf, x, .48, z, [.9, .75, .75]);
  const grass = new THREE.InstancedMesh(geometry('ConeGeometry', [.16, .38, 6]), material(0x72c59f), 680); grass.castShadow = false; scene.add(grass);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 680; i++) { let x = (random() - .5) * 31, z = WORLD.minZ + random() * worldLength; if (Math.abs(x) < 2.1) x += 3.4; dummy.position.set(x, .12, z); dummy.rotation.set(0, random() * TAU, (random() - .5) * .4); dummy.scale.setScalar(.5 + random() * .9); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); }
  for (let i = 0; i < 36; i++) {
    const p = new THREE.Group(); p.position.set((random() - .5) * 27, .04, WORLD.minZ + random() * worldLength); decorations.add(p);
    for (let j = 0; j < 5; j++) { const angle = j / 5 * TAU; const petal = ball(p, i % 2 ? 0xffc3df : 0xe5c9fb, Math.cos(angle) * .19, .065, Math.sin(angle) * .19, .16, .045, .105); petal.rotation.y = -angle; }
    ball(p, 0xffedb2, 0, .08, 0, .115, .065, .115);
  }
  const druid = makeDruid(); druid.rig.scale.setScalar(1.15); scene.add(druid.root);
  const forms = { wolf: makeForm('wolf'), bear: makeForm('bear'), dragon: makeForm('dragon') }; for (const form of Object.values(forms)) scene.add(form.root);
  const owl = makeOwl(); scene.add(owl.root);
  const aimMarker = new THREE.Group(); ring(aimMarker, .96, 1, 0xe3ffb3, .9); circle(aimMarker, 1, 0xc8f2a1, .14); scene.add(aimMarker); aimMarker.visible = false;
  const actors = new Map(), actorPool = [], bolts = new Map(), boltPool = [], fx = new Map(), fxPool = [], coins = new Map(), coinPool = [];
  const zonesById = new Map(HUNT_ZONES.map(zone => [zone.id, zone]));
  const dyingActors = [], pulsePool = [], pulses = [], impactPool = [], impacts = [], feedbackMaterials = new Set();
  const formBursts = [], formBurstPool = [];
  const fieldLootVisuals = new Map(), fieldLootPool = [], discoveryVisuals = new Map(), discoveryPool = [], hazardVisuals = new Map(), hazardPool = [];
  druid.jewel.material = druid.jewel.material.clone(); feedbackMaterials.add(druid.jewel.material);
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const hitColor = new THREE.Color(0xffefbd);
  // One fixed-size instance buffer handles all sparks, fragments and reward motes.
  const particleCapacity = 96, particleData = Array.from({ length: particleCapacity }, () => ({ life: 0 }));
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); feedbackMaterials.add(particleMaterial);
  const particles = new THREE.InstancedMesh(geometry('OctahedronGeometry', [1, 0]), particleMaterial, particleCapacity);
  particles.name = 'feedback-particles'; particles.castShadow = particles.receiveShadow = false; particles.frustumCulled = false;
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(particles);
  const particleDummy = new THREE.Object3D(), particleColor = new THREE.Color(); let particleCursor = 0;
  particleDummy.scale.setScalar(0); particleDummy.updateMatrix();
  for (let i = 0; i < particleCapacity; i++) particles.setMatrixAt(i, particleDummy.matrix);
  const boonAura = new THREE.Group(); boonAura.name = 'field-boon-aura'; scene.add(boonAura); boonAura.visible = false;
  ring(boonAura, .65, .72, 0x9bffb2, .7);
  const boonLeaves = [];
  for (let i = 0; i < 3; i++) { const leaf = mesh(boonAura, 'OctahedronGeometry', [.09, 0], 0xb6ff8f); leaf.castShadow = false; boonLeaves.push(leaf); }
  const boltMaterials = {
    player: material(0xdbffab, { emissive: 0x669656, emissiveIntensity: .7 }),
    enemy: material(0xf5b36f, { emissive: 0x8c4837, emissiveIntensity: .7 }),
    owl: material(0xf7d488, { emissive: 0xc29242, emissiveIntensity: .85 }),
    owlCore: material(0xb8f5db, { emissive: 0x60bd9e, emissiveIntensity: 1 }),
    owlTail: material(0x9ae4c6, { emissive: 0x5caa8e, emissiveIntensity: .8, transparent: true, opacity: .46, depthWrite: false }),
    staffTail: material(0x7effbd, { emissive: 0x37dca2, emissiveIntensity: .9, transparent: true, opacity: .75, depthWrite: false }),
    dragon: material(0xff8d42, { emissive: 0xff5d23, emissiveIntensity: .9 }),
    fireCore: material(0xffe8ac, { emissive: 0xffbe63, emissiveIntensity: .9 }),
    fireTail: material(0xffb657, { emissive: 0xe86925, emissiveIntensity: .6, transparent: true, opacity: .7, depthWrite: false }),
  };
  const staffMaterials = Object.fromEntries(Object.entries(staffColors).map(([style, color]) => [style, {
    body: material(color, { emissive: color, emissiveIntensity: .45 }),
    tail: material(color, { emissive: color, emissiveIntensity: .6, transparent: true, opacity: .65, depthWrite: false }),
    core: material(style === 'explosive' ? 0xffe1a0 : style === 'burst' ? 0xffd6c9 : style === 'spread' ? 0xeee6ff : 0xeaffcc, { emissive: color, emissiveIntensity: .5 }),
  }]));
  const boltGeometry = { sphere: geometry('SphereGeometry', [1, 7, 5]), needle: geometry('ConeGeometry', [.105, .85, 5]), shard: geometry('OctahedronGeometry', [1, 0]) };
  const labels = document.createElement('div'); labels.className = 'combat-labels'; container.append(labels);
  const floaters = []; const vector = new THREE.Vector3();
  for (const territory of territories) {
    const label = document.createElement('span'); label.className = 'territory-label'; label.textContent = `${territory.zone.name} · Lv.${territory.zone.level}`;
    labels.append(label); territory.label = label;
    territory.labelHalfWidth = [...label.textContent].reduce((width, character) => width + (character.codePointAt(0) > 0x2e80 ? 16 : 9), 0) / 2 + 10;
  }
  let width = 0, height = 0, lastPlayer = { x: 0, z: WORLD.camp.z }, previousHp = 100, shake = 0, castFlash = 0, castAngle = 0, castStyle = 'single', owlFlash = 0, owlAngle = 0, owlAppeared = 0, owlWasActive = false, depositFlash = 0, renderTime = 0, walkBlend = 0, formAttack = 0, formAngle = 0, formAppeared = 1, lastForm = 'druid', disposed = false;
  const shadowDirection = new THREE.Vector3(-8, 19, 12), shadowNormal = shadowDirection.clone().normalize();
  const shadowX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), shadowNormal).normalize(), shadowY = new THREE.Vector3().crossVectors(shadowNormal, shadowX).normalize();
  const shadowAnchor = new THREE.Vector3();
  const resize = () => {
    const rect = container.getBoundingClientRect(), nextWidth = Math.max(1, Math.round(rect.width)), nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth; height = nextHeight; renderer.setSize(width, height, false);
    const ratio = width / height, horizontal = width > 500 ? 18.8 : 15.6, vertical = horizontal / ratio;
    camera.left = -horizontal / 2; camera.right = horizontal / 2; camera.top = vertical / 2; camera.bottom = -vertical / 2; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const loader = new GLTFLoader();
  // Optional scenery uses a small local selection from Kenney; gameplay is independent of model loading.
  const nature = [
    ['tree', './assets/nature/tree_oak.glb'], ['pine', './assets/nature/tree_pineRoundA.glb'],
    ['rock', './assets/nature/rock_largeA.glb'], ['plant', './assets/nature/flower_yellowC.glb'],
    ['mushroom', './assets/nature/mushroom_redGroup.glb'],
  ];
  const sceneryStatus = await Promise.allSettled(nature.map(async ([kind, url]) => {
    const gltf = await loader.loadAsync(url); if (disposed) return;
    const isTree = kind === 'tree' || kind === 'pine';
    const model = gltf.scene; model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const parts = Array.isArray(o.material) ? o.material : [o.material];
      if (isTree && parts.some(m => /leaf/i.test(m.name))) {
        o.geometry.computeBoundingBox();
        const bounds = o.geometry.boundingBox, center = bounds.getCenter(new THREE.Vector3()), extent = bounds.getSize(new THREE.Vector3());
        o.position.add(center.multiply(o.scale).applyQuaternion(o.quaternion));
        o.scale.multiply(extent.multiplyScalar(.55)); o.geometry = geometry('SphereGeometry', [1, 12, 8]);
      }
      for (const m of parts) {
        m.metalness = 0; m.roughness = .62; m.flatShading = false;
        if (/leaf/i.test(m.name)) m.color.setHex(kind === 'pine' ? /dark/i.test(m.name) ? 0xd795c3 : 0xf0b7d8 : /dark/i.test(m.name) ? 0x88c9b7 : 0xb4e4c9);
        if (/wood|bark/i.test(m.name)) m.color.setHex(0xd0adbd);
        if (kind === 'rock') m.color.setHex(0xd6bfeb);
        if (kind === 'plant') m.color.setHex(/leaf|stem/i.test(m.name) ? 0x9ad4b3 : 0xffdf9e);
        if (kind === 'mushroom') m.color.setHex(/stem/i.test(m.name) ? 0xffedda : 0xf8b2ce);
      }
    });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const scale = (isTree ? 4.2 : kind === 'rock' ? 1.35 : .55) / Math.max(size.x, size.y, size.z, .01);
    model.scale.setScalar(scale); model.position.y = -box.min.y * scale;
    const n = isTree ? 46 : kind === 'rock' ? 24 : 36;
    for (let i = 0; i < n; i++) {
      let x, z;
      if (isTree) { x = (i % 2 ? 1 : -1) * (i < 34 ? 16.2 + random() * 1.7 : 12.8); z = i < 34 ? WORLD.minZ - 1 + Math.floor(i / 2) * 7 + (kind === 'pine' ? 2.8 : 0) : WORLD.minZ + Math.floor((i - 34) / 2) * 19 + (kind === 'pine' ? 3.5 : 0); }
      else { x = (random() - .5) * 28; z = WORLD.minZ + random() * worldLength; if (Math.abs(x) < 2.5) x += 4.5; if (STAGES.some(stage => Math.hypot(x - stage.camp.x, z - stage.camp.z) < stage.camp.radius + 1)) x += 4; }
      const instance = new THREE.Group(); instance.add(model.clone(true)); instance.position.set(x, -.02, z); instance.rotation.y = random() * TAU; instance.scale.setScalar(.8 + random() * .5); decorations.add(instance);
      if (isTree) {
        const treeMaterials = [];
        instance.traverse(o => {
          if (!o.isMesh) return;
          const copy = m => { const own = m.clone(); own.transparent = true; own.depthWrite = false; treeMaterials.push(own); return own; };
          o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
        });
        occludingTrees.push({ instance, materials: treeMaterials, opacity: 1 });
      }
    }
  }));
  if (sceneryStatus.some(r => r.status === 'rejected')) console.warn('일부 숲 장식을 불러오지 못했습니다. 전투는 정상 실행됩니다.');
  function tintActor(actor, strength) {
    for (const part of actor.hitMaterials) {
      part.material.emissive.copy(part.emissive).lerp(hitColor, strength);
      part.material.emissiveIntensity = part.intensity + strength * .65;
    }
  }
  function ownBasic(color, extra = {}) {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }); feedbackMaterials.add(m); return m;
  }
  function makeFieldLoot() {
    const root = new THREE.Group(), icon = new THREE.Group(); root.name = 'field-loot'; root.add(icon);
    const base = ring(root, .4, .51, palette.gold, .85); base.material = ownBasic(palette.gold, { transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide });
    const beam = mesh(root, 'CylinderGeometry', [.1, .35, 1.9, 8, 1, true], palette.gold, 0, 1, 0);
    beam.material = ownBasic(palette.gold, { transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }); beam.castShadow = beam.receiveShadow = false;
    const staff = new THREE.Group(); staff.name = 'dropped-staff'; icon.add(staff);
    bone(staff, [0, -.45, 0], [0, .45, 0], .055, 0xffead5);
    bone(staff, [0, .24, 0], [-.16, .52, 0], .045, 0xffd279); bone(staff, [0, .24, 0], [.16, .52, 0], .045, 0xffd279);
    const jewel = worldHeart(staff, 0xa5e8ce, 0, .51, 0, .23); jewel.material = jewel.material.clone(); feedbackMaterials.add(jewel.material);
    const scroll = new THREE.Group(); scroll.name = 'dropped-scroll'; icon.add(scroll);
    mesh(scroll, 'BoxGeometry', [.48, .64, .07], 0xffedc2);
    for (const y of [-.32, .32]) { const roll = mesh(scroll, 'CylinderGeometry', [.085, .085, .6, 8], 0xe7b4cf, 0, y, 0); roll.rotation.z = Math.PI / 2; }
    mesh(scroll, 'OctahedronGeometry', [.105, 0], 0x735cba, 0, -.04, .075, [1, 1, .45]);
    return { root, icon, base, beam, staff, scroll, jewel };
  }
  function makeDiscovery() {
    const root = new THREE.Group(), icon = new THREE.Group(); root.name = 'field-discovery'; root.add(icon);
    const base = ring(root, .65, .75, palette.gold, .85); base.material = ownBasic(palette.gold, { transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide });
    const chest = new THREE.Group(); icon.add(chest);
    mesh(chest, 'BoxGeometry', [.95, .52, .69], 0xd1b4ec, 0, -.06, 0);
    ball(chest, 0xf7bdd9, 0, .23, 0, .5, .22, .36);
    for (const x of [-.3, .3]) mesh(chest, 'BoxGeometry', [.1, .69, .76], 0xffd34e, x, .02, 0);
    worldHeart(chest, 0xffefba, 0, -.04, .39, .18);
    const blessing = new THREE.Group(); icon.add(blessing);
    mesh(blessing, 'CylinderGeometry', [.56, .65, .23, 12], 0xd4bee8, 0, .14, 0);
    const seed = mesh(blessing, 'OctahedronGeometry', [.33, 0], 0x94ff9c, 0, .4, 0, [1, 1.4, 1], { emissive: 0x48bc7f, emissiveIntensity: .55 });
    for (let i = 0; i < 3; i++) { const angle = i / 3 * TAU, leaf = ball(blessing, 0xa1dcca, Math.sin(angle) * .27, .3, Math.cos(angle) * .27, .25, .07, .13); leaf.rotation.y = -angle; }
    return { root, icon, base, chest, blessing, seed };
  }
  function makeFieldHazard() {
    const root = new THREE.Group(); root.name = 'field-hazard';
    const circles = [];
    for (let n = 0; n < 3; n++) {
      const group = new THREE.Group(); group.name = 'field-danger-circle'; root.add(group);
      const disk = circle(group, 1, 0xff653f, .2), edge = ring(group, .94, 1, 0xa13232, .95), inner = ring(group, .955, .985, 0xffcd63, .95);
      disk.material = ownBasic(0xff653f, { transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
      edge.material = ownBasic(0x9c2932, { transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide });
      inner.material = ownBasic(0xffcd63, { transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide });
      const fill = circle(group, 1, 0xffa148, .27); fill.position.y = .029; fill.material = ownBasic(0xffa148, { transparent: true, opacity: .27, depthWrite: false, side: THREE.DoubleSide });
      const spores = new THREE.Group(), thorns = new THREE.Group(); group.add(spores, thorns);
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * TAU, x = Math.sin(angle) * .46, z = Math.cos(angle) * .46;
        const cloud = ball(spores, i % 2 ? 0xffc06b : 0xee7655, x, .25 + i % 2 * .2, z, .27, .32, .27); cloud.castShadow = false;
        const spike = mesh(thorns, 'ConeGeometry', [.17, 1.05, 5], i % 2 ? 0x8c303e : 0xc85b43, x, .48, z); spike.rotation.z = Math.sin(angle) * -.25; spike.castShadow = false;
      }
      circles.push({ root: group, disk, edge, inner, fill, spores, thorns });
    }
    return { root, circles };
  }
  function drawField(state, time, reduced) {
    const p = state.player, motion = reduced ? .25 : 1;
    const gear = state.progress?.gear, equipped = gear?.equipped || 'sprout', color = gearColors[equipped] ?? gearColors.sprout;
    const tier = Math.max(0, Math.min(3, gear?.items?.[equipped]?.tier || 0)), level = Math.max(0, Math.min(20, gear?.items?.[equipped]?.level || 0));
    druid.jewel.material.color.setHex(color); druid.jewel.material.emissive.setHex(color).multiplyScalar(.45);
    druid.jewel.material.emissiveIntensity = .5 + tier * .18 + level * .015;
    const drops = (state.fieldLoot || []).slice(0, 30), dropIds = new Set(drops.map(item => item.id));
    for (const [id, visual] of fieldLootVisuals) if (!dropIds.has(id)) { scene.remove(visual.root); visual.root.visible = false; fieldLootPool.push(visual); fieldLootVisuals.delete(id); }
    for (const item of drops) {
      if (!fieldLootVisuals.has(item.id)) { const visual = fieldLootPool.pop() || makeFieldLoot(); scene.add(visual.root); fieldLootVisuals.set(item.id, visual); }
      const visual = fieldLootVisuals.get(item.id), scroll = item.kind === 'scroll', hue = scroll ? 0xffd58b : gearColors[item.equipmentId] ?? gearColors.sprout, phase = typeof item.id === 'number' ? item.id : 0;
      visual.root.name = scroll ? 'field-scroll' : 'field-equipment'; visual.root.visible = true; visual.root.position.set(item.x, .04, item.z);
      visual.staff.visible = !scroll; visual.scroll.visible = scroll;
      visual.icon.position.set(0, .72 + Math.sin(time * 3 + phase) * .08 * motion, 0);
      visual.icon.rotation.set(-.12, -.25 + Math.sin(time * 1.2 + phase) * .15 * motion, scroll ? -.18 : .3);
      visual.base.material.color.setHex(hue); visual.base.material.opacity = .85; visual.base.scale.setScalar(1 + Math.sin(time * 2 + phase) * .06 * motion);
      visual.beam.material.color.setHex(hue); visual.beam.material.opacity = reduced ? .12 : .14 + Math.sin(time * 3 + phase) * .035;
      visual.beam.scale.set(1, 1, 1); visual.jewel.material.color.setHex(hue); visual.jewel.material.emissive.setHex(hue).multiplyScalar(.3); visual.jewel.material.emissiveIntensity = .6;
    }
    const field = state.fieldEvents, discoveries = (field?.items || []).slice(0, 2), discoveryIds = new Set(discoveries.map(item => item.id));
    for (const [id, visual] of discoveryVisuals) if (!discoveryIds.has(id)) { scene.remove(visual.root); visual.root.visible = false; discoveryPool.push(visual); discoveryVisuals.delete(id); }
    for (const item of discoveries) {
      if (!discoveryVisuals.has(item.id)) { const visual = discoveryPool.pop() || makeDiscovery(); scene.add(visual.root); discoveryVisuals.set(item.id, visual); }
      const visual = discoveryVisuals.get(item.id), blessing = item.kind === 'blessing', phase = typeof item.id === 'number' ? item.id : 0;
      visual.root.name = blessing ? 'field-blessing' : 'field-chest'; visual.root.visible = true; visual.root.position.set(item.x, .04, item.z);
      visual.chest.visible = !blessing; visual.blessing.visible = blessing;
      visual.icon.position.set(0, blessing ? 0 : .58 + Math.sin(time * 2.5 + phase) * .075 * motion, 0);
      visual.icon.rotation.set(0, blessing ? 0 : .28 + Math.sin(time * .8 + phase) * .08 * motion, 0);
      visual.seed.position.y = .85 + Math.sin(time * 3 + phase) * .1 * motion; visual.seed.rotation.y = time * .7 * motion;
      visual.base.material.color.setHex(blessing ? 0x94ff9c : palette.gold); visual.base.material.opacity = .75 + Math.sin(time * 2 + phase) * .1 * motion;
    }
    const hazards = (field?.hazards || []).slice(0, 2), hazardIds = new Set(hazards.map(item => item.id));
    for (const [id, visual] of hazardVisuals) if (!hazardIds.has(id)) { scene.remove(visual.root); visual.root.visible = false; hazardPool.push(visual); hazardVisuals.delete(id); }
    for (const hazard of hazards) {
      if (!hazardVisuals.has(hazard.id)) { const visual = hazardPool.pop() || makeFieldHazard(); scene.add(visual.root); hazardVisuals.set(hazard.id, visual); }
      const visual = hazardVisuals.get(hazard.id), warning = hazard.phase === 'warning'; visual.root.visible = true;
      const duration = warning ? hazard.warnTime || 1.15 : hazard.blastTime || .35, progress = Math.max(0, Math.min(1, 1 - hazard.time / duration));
      for (let i = 0; i < 3; i++) {
        const circle = visual.circles[i], center = hazard.centers?.[i]; circle.root.visible = !!center;
        if (!center) continue;
        circle.root.position.set(center.x, .04, center.z); circle.root.scale.set(center.radius, 1, center.radius);
        circle.disk.material.color.setHex(warning ? 0xff653f : 0xff4f32); circle.disk.material.opacity = warning ? .16 + progress * .15 : (1 - progress) * .3;
        circle.edge.material.opacity = 1; circle.inner.material.opacity = reduced ? .9 : .7 + Math.sin(time * 12) * .2;
        circle.fill.scale.setScalar(warning ? Math.sqrt(progress) : 1); circle.fill.material.opacity = warning ? .27 : (1 - progress) * .2;
        circle.spores.visible = !warning && hazard.pattern === 'spores'; circle.thorns.visible = !warning && hazard.pattern === 'thorn-line';
        circle.spores.position.y = progress * .65 * motion; circle.spores.scale.setScalar(.3 + Math.sin(progress * Math.PI / 2) * .7);
        circle.thorns.scale.set(1, reduced ? .8 : .15 + Math.sin(progress * Math.PI) * .9, 1);
      }
    }
    boonAura.visible = (field?.boon?.remaining || 0) > 0 && p.hp > 0; boonAura.position.set(p.x, .06, p.z);
    for (let i = 0; i < boonLeaves.length; i++) { const angle = time * 1.8 * motion + i / 3 * TAU; boonLeaves[i].position.set(Math.sin(angle) * .8, .25 + Math.sin(angle * 2) * .06 * motion, Math.cos(angle) * .8); }
  }
  function recycleActor(actor) {
    actor.root.visible = false; scene.remove(actor.root); actor.root.scale.setScalar(1);
    actor.rig.position.set(0, 0, 0); actor.rig.rotation.x = actor.rig.rotation.z = 0; actor.rig.scale.setScalar(1);
    actor.hitTime = 0; actor.recoilX = actor.recoilZ = 0; actor.walkBlend = 0; actor.lastX = actor.lastZ = null;
    for (const foot of actor.feet) { foot.part.position.y = foot.y; foot.part.position.z = foot.z; foot.part.rotation.x = 0; }
    tintActor(actor, 0); actorPool.push(actor);
  }
  function getActor(enemy) {
    const key = `${enemy.type}:${enemy.variant || ''}`;
    if (actors.has(enemy.id) && actors.get(enemy.id).poolKey !== key) { recycleActor(actors.get(enemy.id)); actors.delete(enemy.id); }
    if (!actors.has(enemy.id)) {
      const i = actorPool.findIndex(a => a.poolKey === key), a = i < 0 ? makeEnemy(enemy.type, enemy.variant || '', enemy.trait || 'normal') : actorPool.splice(i, 1)[0];
      for (const part of a.hitMaterials) feedbackMaterials.add(part.material);
      a.root.visible = true; scene.add(a.root); actors.set(enemy.id, a);
    }
    return actors.get(enemy.id);
  }
  function emitParticles(x, y, z, color, count, kind = 'burst', target = null) {
    const reduce = motionPreference?.matches;
    for (let i = 0, total = reduce ? Math.ceil(count / 2) : count; i < total; i++) {
      const index = particleCursor++ % particleCapacity, particle = particleData[index], angle = random() * TAU;
      const speed = kind === 'explosion' ? 2.2 + random() * 2.6 : kind === 'hit' ? .6 + random() * 1.2 : 1 + random() * 2;
      Object.assign(particle, {
        x, y, z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 1.1 + random() * 1.8,
        life: kind === 'hit' ? .2 + random() * .12 : .4 + random() * .22,
        size: kind === 'explosion' ? .1 + random() * .07 : kind === 'hit' ? .08 + random() * .04 : .06 + random() * .055,
        kind, targetX: target?.x ?? x, targetZ: target?.z ?? z, spin: random() * TAU,
      });
      particle.maxLife = particle.life;
      particles.setColorAt(index, particleColor.setHex(color));
    }
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  }
  function rewardPulse(x, z, level = false) {
    if (pulses.length >= 4) return;
    let pulse = pulsePool.pop();
    if (!pulse) {
      const root = new THREE.Group(), edge = ring(root, .92, 1, palette.gold, .8);
      edge.material = new THREE.MeshBasicMaterial({ color: palette.gold, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
      const charm = worldHeart(root, 0xffb9d9, 0, .7, 0, .28); charm.castShadow = false;
      charm.material = ownBasic(0xffb9d9, { transparent: true, opacity: .8, depthWrite: false });
      feedbackMaterials.add(edge.material); pulse = { root, edge, charm };
    }
    pulse.age = 0; pulse.life = level ? .75 : .55; pulse.level = level;
    pulse.root.position.set(x, .06, z); pulse.root.visible = true; pulse.edge.material.color.setHex(level ? 0xf4c1ef : palette.gold);
    scene.add(pulse.root); pulses.push(pulse);
  }
  function emitFormBurst(event) {
    if (event.form === 'dragon') { emitParticles(event.x, 1.5, event.z, 0xffbd67, 5, 'hit'); return; }
    if (formBursts.length >= 8) { const old = formBursts.shift(); scene.remove(old.root); formBurstPool.push(old); }
    let burst = formBurstPool.pop();
    if (!burst) {
      const root = new THREE.Group(), claws = new THREE.Group(), slam = new THREE.Group(); root.name = 'form-attack-fx'; root.add(claws, slam);
      const clawParts = [], rings = [];
      for (let i = 0; i < 3; i++) { const claw = new THREE.Mesh(geometry('RingGeometry', [.66, .76, 18, 1, .2, Math.PI * .8]), ownBasic(i === 1 ? 0xffffff : 0x8df6ff, { transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); claw.position.x = (i - 1) * .26; claw.rotation.z = -.6; claw.renderOrder = 21; claws.add(claw); clawParts.push(claw); }
      for (let i = 0; i < 2; i++) { const edge = ring(slam, .94, 1, i === 0 ? 0xffd087 : 0x8e6446, 1); edge.material = ownBasic(i === 0 ? 0xffd087 : 0x8e6446, { transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }); edge.position.y = .025 + i * .015; rings.push(edge); }
      burst = { root, claws, slam, clawParts, rings };
    }
    burst.form = event.form; burst.age = 0; burst.life = event.form === 'staff-explosion' ? .42 : event.form === 'bear' ? .45 : .25; burst.radius = event.radius || (event.form === 'bear' ? 2.6 : 1);
    burst.root.name = event.form === 'staff-explosion' ? 'staff-explosion-fx' : 'form-attack-fx';
    burst.root.position.set(event.form === 'wolf' ? event.targetX ?? event.x : event.x, event.form === 'wolf' ? 1.05 : .07, event.form === 'wolf' ? event.targetZ ?? event.z : event.z);
    burst.claws.visible = event.form === 'wolf'; burst.slam.visible = event.form === 'bear' || event.form === 'staff-explosion'; burst.root.visible = true;
    for (let i = 0; i < burst.rings.length; i++) burst.rings[i].material.color.setHex(event.form === 'staff-explosion' ? i === 0 ? 0xffa761 : 0xffdf97 : i === 0 ? 0xffd087 : 0x8e6446);
    burst.root.quaternion.identity(); scene.add(burst.root); formBursts.push(burst);
    if (event.form === 'bear') emitParticles(event.x, .2, event.z, 0xb68b54, 14);
    else if (event.form === 'staff-explosion') emitParticles(event.x, .55, event.z, gearColors.ember, 18, 'explosion');
  }
  function emitImpact(event, enemy) {
    // Keep the impact wider than its damage text on portrait screens.
    if (impacts.length >= 20) {
      const oldest = impacts.shift(); scene.remove(oldest.root); oldest.root.visible = false; impactPool.push(oldest);
    }
    let impact = impactPool.pop();
    if (!impact) {
      const root = new THREE.Group(), flash = new THREE.Group(); root.name = 'combat-impact'; root.add(flash);
      const own = color => {
        const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        feedbackMaterials.add(m); return m;
      };
      const outer = new THREE.Mesh(impactGeometry(), own(0x775285)); outer.scale.setScalar(.95); flash.add(outer);
      const fill = new THREE.Mesh(impactGeometry(), own(0x8df8ff)); fill.scale.setScalar(.74); fill.position.z = .005; flash.add(fill);
      const core = new THREE.Mesh(impactGeometry(), own(0xffffff)); core.scale.setScalar(.32); core.rotation.z = .22; core.position.z = .01; flash.add(core);
      const shock = new THREE.Mesh(geometry('RingGeometry', [.86, 1, 32]), own(0xffe48d)); shock.position.z = -.005; root.add(shock);
      for (const part of [outer, fill, core, shock]) { part.castShadow = part.receiveShadow = false; part.renderOrder = 20; }
      impact = { root, flash, outer, fill, core, shock };
    }
    const source = event.source || 'staff', color = source === 'owl' ? 0x62b9ff : source === 'roots' ? 0x80ff76 : source === 'bear' ? 0xffcc82 : source === 'dragon' ? 0xff9e58 : source === 'staff' && event.weaponStyle !== 'single' && staffColors[event.weaponStyle] ? staffColors[event.weaponStyle] : 0x8df8ff;
    impact.age = 0; impact.life = .28; impact.source = source;
    impact.fill.material.color.setHex(color); impact.shock.material.color.setHex(color);
    impact.root.position.set(event.x, enemy?.variant === 'sky' ? 2.9 : enemy?.type === 'boss' ? 1.75 : enemy?.type === 'flyer' ? 1.9 : 1.05, event.z);
    impact.root.position.y += .2; impact.root.position.z += .3; impact.root.visible = true;
    impact.flash.rotation.z = source === 'owl' ? -.35 : source === 'roots' ? .65 : .2;
    scene.add(impact.root); impacts.push(impact);
  }
  function makeRootVines(parent) {
    const root = new THREE.Group(); root.name = 'root-vines'; parent.add(root);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU, side = i % 2 ? 1 : -1;
      const at = (radius, height, offset = 0) => new THREE.Vector3(Math.sin(angle + offset) * radius, height, Math.cos(angle + offset) * radius);
      const curve = new THREE.CatmullRomCurve3([at(.05, .03), at(.3, .27, side * .3), at(.6, .38, -side * .16), at(.88, .16, side * .1), at(.96, .3, side * .25)]);
      for (const [width, color] of [[.055, 0x145b39], [.035, 0x65e88c]]) {
        const key = `root-vine-${i}-${width}`;
        if (!geometries.has(key)) geometries.set(key, new THREE.TubeGeometry(curve, 12, width, 4, false));
        const stem = new THREE.Mesh(geometries.get(key), material(color, { emissive: color, emissiveIntensity: .25 })); stem.castShadow = false; root.add(stem);
      }
      const tip = at(.83, .2, side * .05);
      for (const sign of [-1, 1]) {
        const leaf = ball(root, sign > 0 ? 0xa4ff79 : 0x36c974, tip.x + Math.cos(angle) * sign * .1, tip.y + .05, tip.z - Math.sin(angle) * sign * .1, .15, .045, .08);
        leaf.rotation.y = -angle + sign * .45; leaf.castShadow = false;
      }
      const bud = mesh(root, 'OctahedronGeometry', [.1, 0], 0xffe9a3, tip.x, .34, tip.z); bud.castShadow = false;
    }
    return root;
  }
  function makeFx() {
    const g = new THREE.Group(); const disk = circle(g, 1, 0xaddd8a, .2), edge = ring(g, .92, 1, 0xd4efae, .9);
    disk.material = disk.material.clone(); edge.material = edge.material.clone();
    feedbackMaterials.add(disk.material); feedbackMaterials.add(edge.material);
    return { root: g, disk, edge, vines: null };
  }
  function makeBolt() {
    const root = new THREE.Group();
    const body = mesh(root, 'SphereGeometry', [1, 7, 5], 0xc8f5a1);
    const tail = mesh(root, 'SphereGeometry', [1, 7, 5], 0x9ae4c6);
    const core = mesh(root, 'SphereGeometry', [1, 7, 5], 0xb8f5db);
    for (const part of [body, tail, core]) { part.castShadow = false; part.receiveShadow = false; }
    tail.visible = core.visible = false;
    return { root, body, tail, core };
  }
  function showNumber(e, y = 1.8) {
    if (floaters.length >= 24) return;
    if (e.type === 'hit' && floaters.filter(f => f.type === 'hit' && f.age < .24 && Math.hypot(f.x - e.x, f.z - e.z) < 2.2).length >= 3) return;
    const el = document.createElement('span'); el.className = `combat-number ${e.type === 'player-hit' ? 'hurt' : ''}`; el.textContent = e.damage ? `${e.type === 'player-hit' ? '−' : ''}${Math.round(e.damage)}` : e.type === 'skill' ? '덩굴' : e.type === 'pickup' ? `+${e.amount}` : e.type === 'deposit' ? `보관 +${e.amount}` : e.type === 'level-up' ? '레벨 업!' : e.type === 'gear-pickup' ? e.copies > 0 ? '장비 획득!' : `두루마리 +${e.scrolls}` : e.type === 'field-chest' ? '보물 발견!' : e.type === 'field-boon' ? '숲의 축복!' : '';
    if (!el.textContent) return; labels.append(el); floaters.push({ el, type: e.type, x: e.x ?? 0, z: e.z ?? 0, y, age: 0 });
  }
  return {
    canvas: renderer.domElement,
    setAim(point) { aimMarker.visible = !!point; if (point) { aimMarker.position.set(point.x, .06, point.z); aimMarker.scale.setScalar(point.radius); } },
    screenToWorld(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect(); const p = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(p, camera); const target = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target) ? { x: target.x, z: target.z } : null;
    },
    draw(state, dt, visualTime) {
      if (disposed) return;
      // Simulation owns time and collisions; all extra motion is render-only and freezes with menus/tabs.
      dt = !document.hidden && (state.phase === 'playing' || state.phase === 'ready') ? Math.max(0, Math.min(.1, dt)) : 0;
      visualTime = renderTime += dt;
      const reduceMotion = !!motionPreference?.matches, motion = reduceMotion ? .25 : 1;
      const events = state.events || [], hits = new Map(), kills = new Set();
      const p = state.player, moving = Math.hypot(p.x - lastPlayer.x, p.z - lastPlayer.z) > .005;
      const currentForm = forms[p.form] ? p.form : 'druid';
      formAttack = Math.max(0, formAttack - dt);
      if (currentForm !== lastForm) { formAppeared = 0; formAttack = 0; lastForm = currentForm; }
      formAppeared = Math.min(1, formAppeared + dt / .18);
      for (const e of events) {
        if (e.type === 'hit') {
          hits.set(e.targetId, e);
          const target = state.enemies.find(enemy => enemy.id === e.targetId) || actors.get(e.targetId);
          emitImpact(e, target); showNumber(e, target?.variant === 'sky' ? 4.4 : target?.type === 'boss' ? 3.3 : target?.type === 'flyer' ? 3.4 : 2.45);
          emitParticles(e.x, 1.05, e.z, e.source === 'owl' ? 0x80cfff : e.source === 'roots' ? 0xa4ff79 : 0xbafaff, 6, 'hit');
        } else if (e.type === 'kill') {
          kills.add(e.targetId);
          const color = e.enemyType === 'boar' ? 0xf18c9d : e.enemyType === 'caster' ? 0x85d0e5 : e.enemyType === 'boss' ? 0xa6c084 : palette.red;
          emitParticles(e.x, e.enemyType === 'boss' ? 1.2 : .7, e.z, color, e.bossId ? 16 : 8);
        } else if (e.type === 'pickup') emitParticles(e.x, .35, e.z, palette.gold, 5, 'pickup', p);
        else if (e.type === 'deposit') {
          depositFlash = .65; rewardPulse(p.x, p.z);
          const activeCamp = getCamp(state);
          emitParticles(activeCamp.x + (activeCamp.stageId === 'meadow' ? -3.1 : 1.1), .9, activeCamp.z + (activeCamp.stageId === 'meadow' ? 1.5 : .5), palette.gold, 14);
        } else if (e.type === 'level-up' || e.type === 'quest' || e.type === 'upgrade') {
          rewardPulse(p.x, p.z, e.type === 'level-up');
          emitParticles(p.x, .5, p.z, e.type === 'level-up' ? 0xd6ff96 : palette.gold, e.type === 'level-up' ? 18 : 8, 'rise');
        } else if (e.type === 'field-discovery') emitParticles(e.x, .6, e.z, e.kind === 'blessing' ? 0x94ff9c : palette.gold, 8, 'rise');
        else if (e.type === 'field-chest' || e.type === 'gear-pickup') {
          rewardPulse(e.x, e.z); emitParticles(e.x, .7, e.z, gearColors[e.equipmentId] ?? palette.gold, e.type === 'field-chest' ? 18 : 9, 'rise');
        } else if (e.type === 'field-boon') {
          rewardPulse(e.x, e.z, true); emitParticles(e.x, .5, e.z, 0x94ff9c, 14, 'rise');
        } else if (e.type === 'field-hazard') emitParticles(e.x, .5, e.z, 0xffa052, 10);
        else if (e.type === 'staff-explosion') emitFormBurst({ ...e, form: 'staff-explosion' });
        else if (e.type === 'transform') { emitParticles(e.x, .7, e.z, e.form === 'dragon' ? 0xffcb7c : e.form === 'bear' ? 0xffdf99 : 0xb6fff3, 16, 'rise'); rewardPulse(e.x, e.z, true); }
        else if (e.type === 'form-attack') { formAttack = .35; formAngle = Math.atan2((e.targetX ?? e.x) - e.x, (e.targetZ ?? e.z + 1) - e.z); emitFormBurst(e); }
      }
      for (const tree of occludingTrees) {
        const dx = tree.instance.position.x - p.x, dz = tree.instance.position.z - p.z;
        // Layered leaves accumulate alpha; keep overlapping trees almost invisible.
        const targetOpacity = Math.abs(dx) < 2.8 && dz > -.5 && dz < 4 ? .04 : 1;
        tree.opacity += (targetOpacity - tree.opacity) * Math.min(1, dt * 9);
        for (const m of tree.materials) m.opacity = tree.opacity > .995 ? 1 : tree.opacity;
      }
      shake = Math.max(0, shake - dt); camera.position.set(p.x + (shake && !reduceMotion ? Math.sin(visualTime * 50) * shake * .45 : 0), 27, 21 + p.z); camera.lookAt(p.x, 0, p.z); camera.updateMatrixWorld();
      // Quantize the shadow camera in light-space texels to stop ground-shadow shimmer while walking.
      shadowAnchor.set(p.x, 0, p.z);
      const sx = shadowAnchor.dot(shadowX), sy = shadowAnchor.dot(shadowY), texelX = 34 / 1536, texelY = 36 / 1536;
      shadowAnchor.addScaledVector(shadowX, Math.round(sx / texelX) * texelX - sx).addScaledVector(shadowY, Math.round(sy / texelY) * texelY - sy);
      light.position.copy(shadowAnchor).add(shadowDirection); light.target.position.copy(shadowAnchor); light.target.updateMatrixWorld();
      for (const territory of territories) {
        const { zone, root, edge, label } = territory, active = state.huntZoneId === zone.id;
        root.visible = isZoneUnlocked(state.progress, zone);
        edge.material.opacity = active ? .35 + Math.sin(visualTime * 2) * .08 : .12;
        vector.set(zone.x, .2, zone.z + zone.radius * .75).project(camera);
        // Nearby names belong in the HUD; keep approaching-territory labels off the fighters too.
        const nearby = Math.hypot(zone.x - p.x, zone.z - p.z) <= zone.radius + 2;
        const labelX = (vector.x * .5 + .5) * width, labelY = (-vector.y * .5 + .5) * height;
        const inset = label.hidden ? 16 : 8, top = label.hidden ? 84 : 72, bottom = height - (label.hidden ? 160 : 148);
        label.hidden = active || nearby || !root.visible || Math.abs(vector.z) > 1 || labelX < territory.labelHalfWidth + inset || labelX > width - territory.labelHalfWidth - inset || labelY < top || labelY > bottom;
        label.classList.toggle('active', active);
        if (!label.hidden) label.style.transform = `translate(${(vector.x * .5 + .5) * width}px,${(-vector.y * .5 + .5) * height}px) translate(-50%,-50%)`;
      }
      fire.scale.set(1 + Math.sin(visualTime * 8) * .05, 1 + Math.sin(visualTime * 11) * .1, 1); fire.rotation.y = Math.sin(visualTime * 2) * .12;
      questMark.position.y = 2.27 + Math.sin(visualTime * 3) * .1; questMark.visible = (state.progress?.questIndex ?? 0) < 6;
      for (const gate of gates) {
        gate.barrier.visible = !isStageUnlocked(state.progress, gate.stage.id);
        const obscuresPlayer = Math.abs(p.x) < 3 && p.z < gate.stage.maxZ + .5 && p.z > gate.stage.maxZ - 5;
        gate.opacity += ((obscuresPlayer ? .12 : 1) - gate.opacity) * Math.min(1, dt * 9);
        for (const m of gate.archMaterials) m.opacity = gate.opacity > .995 ? 1 : gate.opacity;
      }
      for (const rest of restCamps) rest.root.visible = isStageUnlocked(state.progress, rest.stage.id);
      depositFlash = Math.max(0, depositFlash - dt);
      const chestPop = depositFlash > 0 ? Math.sin((1 - depositFlash / .65) * Math.PI) : 0;
      chest.position.y = chestPop * .18 * motion; chest.rotation.z = Math.sin((1 - depositFlash / .65) * TAU * 1.5) * depositFlash * .06 * motion;
      castFlash = Math.max(0, castFlash - dt);
      for (const e of events) if (e.type === 'shoot') { castFlash = .22; castAngle = Math.atan2(e.aimX ?? p.facingX, e.aimZ ?? p.facingZ); castStyle = staffColors[e.weaponStyle] ? e.weaponStyle : 'single'; }
      walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, dt * 14);
      const stride = Math.sin(visualTime * 13) * walkBlend * motion;
      const castPose = castFlash > 0 ? Math.sin(castFlash / .22 * Math.PI) : 0;
      druid.root.position.set(p.x, .035, p.z); druid.rig.rotation.y = state.inCamp && !moving ? 0 : castFlash > 0 ? castAngle : Math.atan2(p.facingX ?? 0, p.facingZ ?? 1);
      druid.rig.position.y = (Math.abs(stride) * .075 + Math.sin(visualTime * 2) * .025 * (1 - walkBlend)) * motion;
      druid.rig.rotation.x = (walkBlend * .055 - castPose * .055) * motion; druid.rig.rotation.z = stride * .035;
      druid.arm.rotation.x = -.6 * castPose; druid.staff.rotation.x = -.14 * castPose * motion; druid.staff.rotation.z = -.05 * castPose * motion;
      druid.castGlow.visible = castFlash > .1; druid.castGlow.scale.setScalar(.27 * (.7 + castFlash * 3)); druid.castGlow.material.opacity = reduceMotion ? .3 : .8; druid.castGlow.material.color.setHex(staffColors[castStyle]);
      druid.bag.visible = state.cargo > 0; druid.bag.scale.setScalar(.75 + Math.min(1, (state.cargo || 0) / (p.capacity || 24)) * .4);
      druid.bag.rotation.z = -stride * .07;
      druid.left.position.z = .06 + stride * .17; druid.right.position.z = .06 - stride * .17;
      druid.left.position.y = .15 + Math.max(0, stride) * .08; druid.right.position.y = .15 + Math.max(0, -stride) * .08; druid.jewel.rotation.y = visualTime;
      // A complete actor must stay visible while hurt; high-frequency visibility blinking looked like a rendering fault.
      druid.root.visible = currentForm === 'druid'; druid.rig.visible = true;
      for (const [name, form] of Object.entries(forms)) {
        form.root.visible = currentForm === name;
        if (!form.root.visible) continue;
        const attack = formAttack > 0 ? Math.sin(formAttack / .35 * Math.PI) : 0, pace = visualTime * (name === 'wolf' ? 18 : name === 'bear' ? 8 : 11), appear = reduceMotion ? 1 : .85 + .15 * (1 - (1 - formAppeared) ** 3);
        form.root.position.set(p.x, .04, p.z); form.rig.rotation.y = formAttack > 0 ? formAngle : Math.atan2(p.facingX ?? 0, p.facingZ ?? 1);
        form.rig.scale.setScalar(appear); form.rig.position.y = name === 'dragon' ? .35 + Math.sin(visualTime * 3) * .08 * motion : Math.abs(Math.sin(pace)) * walkBlend * (name === 'bear' ? .065 : .1) * motion;
        form.rig.rotation.x = name === 'bear' ? -attack * .16 * motion : name === 'wolf' ? -attack * .12 * motion : 0; form.rig.rotation.z = Math.sin(pace) * walkBlend * .025 * motion;
        form.head.rotation.x = name === 'dragon' ? -attack * .2 : attack * -.08;
        for (let i = 0; i < form.feet.length; i++) { const foot = form.feet[i], stride = Math.sin(pace + i % 2 * Math.PI) * walkBlend * motion; foot.part.position.set(foot.part.position.x, foot.y + Math.max(0, stride) * .12, foot.z + stride * .17); foot.part.rotation.x = stride * .18; }
        for (const arm of form.arms) arm.rotation.x = -attack * 1.05 * motion;
        for (let i = 0; i < form.wings.length; i++) form.wings[i].rotation.z = (i === 0 ? -1 : 1) * (.15 + Math.sin(visualTime * 9) * .28 * motion);
        if (form.flame) { form.flame.visible = formAttack > .1; form.flame.scale.setScalar(.12 + attack * .12); }
        if (form.tail) form.tail.rotation.z = Math.sin(pace * .4) * .08 * motion;
      }
      lastPlayer = { x: p.x, z: p.z };
      const owlActive = currentForm === 'druid' && state.owl?.active === true && p.hp > 0 && state.phase !== 'down';
      const owlDelta = state.phase === 'playing' || state.phase === 'ready' ? dt : 0;
      if (owlActive && !owlWasActive) { owlAppeared = 0; owlFlash = 0; }
      owl.root.visible = owlActive;
      if (owlActive) {
        owlAppeared = Math.min(1, owlAppeared + owlDelta / .25); owlFlash = Math.max(0, owlFlash - owlDelta);
        for (const event of events) if (event.type === 'owl-shoot') {
          owlFlash = .24;
          const target = state.enemies.find(enemy => enemy.id === event.targetId && enemy.hp > 0);
          owlAngle = target ? Math.atan2(target.x - state.owl.x, target.z - state.owl.z) : Math.atan2(event.aimX ?? p.facingX ?? 0, event.aimZ ?? p.facingZ ?? 1);
        }
        const appear = Math.max(.05, 1 - (1 - owlAppeared) ** 3), pulse = owlFlash / .24;
        owl.root.position.set(state.owl.x, .04, state.owl.z);
        owl.rig.position.y = 1.9 + Math.sin(visualTime * 3.6) * .065;
        owl.rig.scale.setScalar(appear * 1.12); owl.rig.rotation.set(-.1, owlFlash > 0 ? owlAngle : .2, Math.sin(visualTime * 3) * .045);
        const flap = Math.sin(visualTime * (walkBlend > .3 ? 17 : 8)) * (walkBlend > .3 ? .62 : .3);
        owl.wings[0].rotation.z = -.08 - flap; owl.wings[1].rotation.z = .08 + flap;
        owl.shadow.scale.setScalar(.85 + Math.sin(visualTime * 3.6) * .04);
        owl.launchGlow.visible = pulse > .15; owl.launchGlow.scale.setScalar(.1 + pulse * .15);
        owl.irisMaterial.emissiveIntensity = .15 + pulse * 1.4;
      } else { owlAppeared = 0; owlFlash = 0; }
      owlWasActive = owlActive;
      if (p.hp < previousHp && !reduceMotion) shake = .12; previousHp = p.hp;
      const alive = new Set();
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || !isZoneUnlocked(state.progress, zonesById.get(enemy.zoneId) || enemy)) continue; alive.add(enemy.id); const a = getActor(enemy); a.root.position.set(enemy.x, .03, enemy.z);
        const stepX = a.lastX === null ? 0 : enemy.x - a.lastX, stepZ = a.lastZ === null ? 0 : enemy.z - a.lastZ;
        const walking = Math.hypot(stepX, stepZ) > .0001 && !['windup', 'stunned'].includes(enemy.phase);
        if (walking) a.moveAngle = Math.atan2(stepX, stepZ);
        a.walkBlend += ((walking ? 1 : 0) - a.walkBlend) * Math.min(1, dt * 12);
        a.lastX = enemy.x; a.lastZ = enemy.z;
        a.hitTime = Math.max(0, a.hitTime - dt);
        if (hits.has(enemy.id)) {
          a.hitTime = .18; const distance = Math.hypot(enemy.x - p.x, enemy.z - p.z) || 1;
          a.recoilX = (enemy.x - p.x) / distance; a.recoilZ = (enemy.z - p.z) / distance;
        }
        const impact = a.hitTime / .18, recoil = impact * (enemy.type === 'boss' ? .045 : .13) * motion;
        a.rig.position.x = a.recoilX * recoil; a.rig.position.z = a.recoilZ * recoil;
        const beat = visualTime * (enemy.type === 'boss' ? 5.5 : 10) + enemy.id, breath = Math.sin(visualTime * (enemy.type === 'boss' ? 1.3 : 2.4) + enemy.id) * .025 * motion;
        a.rig.scale.set(1 + impact * .1 * motion - breath * .3, 1 - impact * .15 * motion + breath, 1 + impact * .1 * motion - breath * .3);
        tintActor(a, impact * (reduceMotion ? .12 : .32));
        if (enemy.phase === 'windup' || enemy.phase === 'charge') a.rig.rotation.y = enemy.angle ?? Math.atan2(enemy.aimX ?? 0, enemy.aimZ ?? 1);
        else {
          const observe = enemy.phase === 'idle' && a.walkBlend < .2 ? Math.sin(visualTime * .75 + enemy.id) * .22 * motion : 0;
          const facing = enemy.phase === 'idle' ? (enemy.angle ?? a.moveAngle) + observe : enemy.phase === 'return' ? Math.atan2(enemy.homeX - enemy.x, enemy.homeZ - enemy.z) : walking ? a.moveAngle : Math.atan2(p.x - enemy.x, p.z - enemy.z);
          const turn = Math.atan2(Math.sin(facing - a.rig.rotation.y), Math.cos(facing - a.rig.rotation.y));
          a.rig.rotation.y += turn * Math.min(1, dt * 10);
        }
        const gait = Math.sin(beat) * a.walkBlend * motion;
        a.rig.position.y = (a.flying ? 1.05 + Math.sin(visualTime * 3 + enemy.id) * .1 * motion : 0) + (enemy.phase === 'windup' ? -.06 + Math.sin(visualTime * 24) * .025 : Math.abs(gait) * (enemy.type === 'boss' ? .07 : .11) + breath);
        a.rig.rotation.x = Math.cos(beat) * a.walkBlend * .055 * motion;
        a.rig.rotation.z = gait * (enemy.type === 'boss' ? .025 : .065);
        for (let i = 0; i < a.wings.length; i++) a.wings[i].rotation.z = (i === 0 ? -1 : 1) * (.15 + Math.sin(visualTime * (enemy.type === 'boss' ? 5 : 12) + enemy.id) * .3 * motion);
        for (let i = 0; i < a.feet.length; i++) {
          const foot = a.feet[i], stride = Math.sin(beat + i % 2 * Math.PI) * a.walkBlend * motion;
          foot.part.position.z = foot.z + stride * .14; foot.part.position.y = foot.y + Math.max(0, stride) * .1; foot.part.rotation.x = stride * .2;
        }
        a.fill.scale.x = Math.max(0, enemy.hp / enemy.maxHp); a.bar.quaternion.copy(camera.quaternion); a.bar.visible = enemy.hp < enemy.maxHp || enemy.type === 'boss';
        a.danger.visible = enemy.phase === 'windup';
        if (a.danger.visible) {
          // World-space telegraphs share the simulation's locked origin and dimensions.
          a.danger.position.set((enemy.warnX ?? enemy.x) - enemy.x, .01, (enemy.warnZ ?? enemy.z) - enemy.z); a.danger.rotation.y = enemy.angle ?? Math.atan2(enemy.aimX || 0, enemy.aimZ || 1);
          const line = enemy.type === 'boar' || enemy.type === 'caster' || enemy.type === 'flyer'; a.warningLine.visible = line; a.warningDisk.visible = a.warningRing.visible = !line;
          a.warningLine.scale.set(enemy.width || 1.4, enemy.length || 5.5, 1); a.warningLine.position.z = (enemy.length || 5.5) / 2;
          const radius = enemy.attackRadius || (enemy.type === 'boss' ? 3 : 1.15); a.warningDisk.scale.setScalar(radius); a.warningRing.scale.setScalar(radius);
          a.warningRing.material.opacity = .65 + Math.sin(visualTime * 14) * .3;
        }
      }
      for (const [id, a] of actors) if (!alive.has(id)) {
        actors.delete(id);
        if (kills.has(id) && dyingActors.length < 12 && !reduceMotion) {
          a.deathTime = .26; a.bar.visible = a.danger.visible = false; tintActor(a, 0); dyingActors.push(a);
        } else recycleActor(a);
      }
      for (let i = dyingActors.length - 1; i >= 0; i--) {
        const a = dyingActors[i]; a.deathTime = Math.max(0, a.deathTime - dt);
        if (a.deathTime === 0) { recycleActor(a); dyingActors.splice(i, 1); continue; }
        const remaining = a.deathTime / .26, collapse = 1 - remaining;
        a.rig.scale.set(remaining * (1 + collapse * .25), remaining * remaining, remaining * (1 + collapse * .25));
        a.rig.position.y = -.1 * collapse; a.rig.rotation.z = collapse * .18;
      }
      const activeBolts = new Set();
      for (const b of state.projectiles) {
        activeBolts.add(b.id);
        if (!bolts.has(b.id)) { const bolt = boltPool.pop() || makeBolt(); bolt.startLife = b.life; bolt.root.visible = true; scene.add(bolt.root); bolts.set(b.id, bolt); }
        const bolt = bolts.get(b.id), fromOwl = b.team === 'player' && b.source === 'owl', fromDragon = b.team === 'player' && b.source === 'dragon';
        const fromStaff = b.team === 'player' && !fromOwl && !fromDragon, weaponStyle = fromStaff && staffColors[b.weaponStyle] ? b.weaponStyle : 'single';
        const flight = Math.min(1, Math.max(0, ((b.maxLife ?? bolt.startLife) - b.life) / (fromOwl ? .5 : .35)));
        // Reset every visual property so one shared pool can safely change projectile sources.
        bolt.root.name = fromDragon ? 'dragon-flame' : fromOwl ? 'owl-missile' : b.team === 'player' ? 'staff-bolt' : 'enemy-bolt';
        bolt.root.userData.source = fromStaff ? 'staff' : fromOwl ? 'owl' : fromDragon ? 'dragon' : 'enemy'; bolt.root.userData.weaponStyle = fromStaff ? weaponStyle : null; bolt.root.userData.weaponId = fromStaff ? b.weaponId || null : null;
        bolt.root.position.set(b.x, fromDragon ? 1.7 + (b.targetId && state.enemies.find(enemy => enemy.id === b.targetId)?.trait === 'airborne' ? .45 : 0) : fromOwl ? 1.95 - flight : b.team === 'player' ? 2.25 - flight * 1.35 : 1.25, b.z);
        bolt.root.rotation.set(0, Math.atan2(b.dx, b.dz), 0); bolt.root.scale.set(1, 1, 1);
        bolt.body.geometry = boltGeometry.sphere; bolt.body.material = fromDragon ? boltMaterials.dragon : fromOwl ? boltMaterials.owl : boltMaterials[b.team] || boltMaterials.enemy;
        bolt.body.position.set(0, 0, 0); bolt.body.rotation.set(0, 0, 0);
        bolt.body.scale.set(fromDragon ? .25 : fromOwl ? .125 : b.team === 'player' ? .18 : .24, fromDragon ? .23 : fromOwl ? .13 : .18, fromDragon ? .46 : fromOwl ? .24 : .4);
        bolt.tail.visible = b.team === 'player'; bolt.tail.material = fromDragon ? boltMaterials.fireTail : fromOwl ? boltMaterials.owlTail : boltMaterials.staffTail;
        bolt.tail.position.set(0, 0, fromDragon ? -.55 : fromOwl ? -.39 : -.46); bolt.tail.rotation.set(0, 0, 0); bolt.tail.scale.set(fromDragon ? .16 : fromOwl ? .075 : .1, fromDragon ? .14 : fromOwl ? .07 : .085, fromDragon ? .65 : fromOwl ? .35 : .5);
        bolt.core.visible = b.team === 'player'; bolt.core.material = fromDragon ? boltMaterials.fireCore : boltMaterials.owlCore;
        bolt.core.position.set(0, 0, .12); bolt.core.rotation.set(0, 0, 0); bolt.core.scale.set(fromDragon ? .14 : fromOwl ? .075 : .105, fromDragon ? .14 : fromOwl ? .085 : .105, fromDragon ? .23 : fromOwl ? .115 : .16);
        if (fromStaff) {
          const visualMaterials = staffMaterials[weaponStyle]; bolt.body.material = visualMaterials.body; bolt.tail.material = visualMaterials.tail; bolt.core.material = visualMaterials.core;
          if (weaponStyle === 'burst') {
            bolt.body.geometry = boltGeometry.needle; bolt.body.rotation.x = Math.PI / 2; bolt.body.scale.setScalar(1);
            bolt.tail.position.z = -.53; bolt.tail.scale.set(.045, .045, .4); bolt.core.scale.set(.065, .065, .12);
          } else if (weaponStyle === 'spread') {
            bolt.body.geometry = boltGeometry.shard; bolt.body.scale.set(.17, .14, .28);
            bolt.tail.position.z = -.28; bolt.tail.scale.set(.075, .06, .28); bolt.core.scale.set(.08, .08, .12);
          } else if (weaponStyle === 'explosive') {
            bolt.body.scale.set(.26, .25, .3); bolt.tail.position.z = -.36; bolt.tail.scale.set(.13, .1, .45); bolt.core.scale.set(.14, .14, .2);
          }
        }
      }
      for (const [id, bolt] of bolts) if (!activeBolts.has(id)) { bolt.root.visible = false; scene.remove(bolt.root); boltPool.push(bolt); bolts.delete(id); }
      const activeCoins = new Set();
      for (const item of state.loot || []) {
        activeCoins.add(item.id);
        if (!coins.has(item.id)) { const coin = coinPool.pop() || mesh(scene, 'CylinderGeometry', [.19, .19, .075, 10], palette.gold); scene.add(coin); coin.visible = true; coins.set(item.id, coin); }
        const coin = coins.get(item.id); coin.position.set(item.x, .3 + Math.sin(visualTime * 3 + item.id) * .06, item.z); coin.rotation.set(Math.PI / 2, 0, visualTime * 1.7);
      }
      for (const [id, coin] of coins) if (!activeCoins.has(id)) { scene.remove(coin); coin.visible = false; coinPool.push(coin); coins.delete(id); }
      drawField(state, visualTime, reduceMotion);
      const activeFx = new Set();
      for (const e of state.effects) {
        activeFx.add(e.id); if (!fx.has(e.id)) { const f = fxPool.pop() || makeFx(); scene.add(f.root); f.root.visible = true; fx.set(e.id, f); }
        const f = fx.get(e.id), progress = 1 - e.life / (e.maxLife || .6), warning = e.type.includes('warning');
        const hostile = e.team === 'enemy' || e.type === 'charge';
        f.disk.material.color.setHex(hostile ? 0xff7548 : 0x78e8a4); f.edge.material.color.setHex(hostile ? 0xffcf68 : 0xe1ffae);
        f.disk.visible = e.type !== 'death'; f.edge.material.color.setHex(e.type === 'death' ? 0xffd58b : hostile ? 0xbd4c78 : 0xe1ffae);
        f.root.position.set(e.x, .045, e.z); f.root.rotation.y = e.angle || 0;
        const scale = (e.radius || .7) * (warning ? 1 : .65 + progress * .5); f.root.scale.set(scale, scale, e.type === 'charge' ? (e.length || 5) * .5 : scale);
        if (e.type === 'root-burst' && !f.vines) f.vines = makeRootVines(f.root);
        if (f.vines) {
          f.vines.visible = e.type === 'root-burst';
          const growth = reduceMotion ? .9 : .3 + Math.sin(Math.min(1, progress / .7) * Math.PI / 2) * .7;
          f.vines.scale.set(growth, Math.max(.05, Math.sin(progress * Math.PI)) * (reduceMotion ? .6 : 1), growth);
          f.vines.rotation.y = reduceMotion ? 0 : progress * .15;
        }
        f.disk.material.opacity = warning ? .12 + progress * .18 : (1 - progress) * .32; f.edge.material.opacity = warning ? .8 : 1 - progress;
      }
      for (const [id, f] of fx) if (!activeFx.has(id)) { scene.remove(f.root); f.root.visible = false; fxPool.push(f); fx.delete(id); }
      let activeParticles = 0;
      for (let i = 0; i < particleCapacity; i++) {
        const particle = particleData[i]; particle.life = Math.max(0, particle.life - dt);
        if (particle.life > 0) {
          activeParticles++; const age = particle.maxLife - particle.life, progress = age / particle.maxLife;
          if (particle.kind === 'pickup') {
            const travel = progress * progress;
            particleDummy.position.set(particle.x + (particle.targetX - particle.x) * travel, .35 + progress * .65 + Math.sin(progress * Math.PI) * .3, particle.z + (particle.targetZ - particle.z) * travel);
          } else {
            const rising = particle.kind === 'rise';
            particleDummy.position.set(particle.x + particle.vx * age * (rising ? .35 : 1), Math.max(.05, particle.y + particle.vy * age - (rising ? .4 : 3.5) * age * age), particle.z + particle.vz * age * (rising ? .35 : 1));
          }
          particleDummy.rotation.set(age * 5 + particle.spin, particle.spin + age * 3, age * 2);
          particleDummy.scale.setScalar(particle.size * Math.min(1, particle.life / .15));
        } else particleDummy.scale.setScalar(0);
        particleDummy.updateMatrix(); particles.setMatrixAt(i, particleDummy.matrix);
      }
      particles.visible = activeParticles > 0; particles.instanceMatrix.needsUpdate = true;
      for (let i = formBursts.length - 1; i >= 0; i--) {
        const burst = formBursts[i]; burst.age += dt;
        if (burst.age >= burst.life) { scene.remove(burst.root); burst.root.visible = false; formBurstPool.push(burst); formBursts.splice(i, 1); continue; }
        const progress = burst.age / burst.life, fade = 1 - progress;
        if (burst.form === 'wolf') { burst.root.quaternion.copy(camera.quaternion); burst.claws.scale.setScalar(reduceMotion ? 1 : .7 + progress * .7); for (const part of burst.clawParts) part.material.opacity = fade; }
        else {
          burst.root.quaternion.identity();
          for (let j = 0; j < burst.rings.length; j++) {
            const scale = burst.form === 'staff-explosion' ? j === 0 ? 1 : .2 + (1 - (1 - progress) ** 3) * .8 : Math.max(.1, .25 + progress * (.85 - j * .1));
            burst.rings[j].scale.setScalar(burst.radius * scale); burst.rings[j].material.opacity = fade * (reduceMotion ? .45 : .8);
          }
        }
      }
      for (let i = impacts.length - 1; i >= 0; i--) {
        const impact = impacts[i]; impact.age += dt;
        if (impact.age >= impact.life) { scene.remove(impact.root); impact.root.visible = false; impactPool.push(impact); impacts.splice(i, 1); continue; }
        const progress = impact.age / impact.life, fade = Math.min(1, (1 - progress) / .4);
        impact.root.quaternion.copy(camera.quaternion);
        impact.flash.scale.setScalar(reduceMotion ? 1 : 1 + Math.sin(Math.min(1, progress / .35) * Math.PI) * .14 - progress * .15);
        impact.outer.material.opacity = fade; impact.fill.material.opacity = fade * (reduceMotion ? .75 : 1); impact.core.material.opacity = fade;
        impact.shock.scale.setScalar(reduceMotion ? .8 : .35 + (1 - (1 - progress) ** 2) * .65);
        impact.shock.material.opacity = (1 - progress) * .85;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]; pulse.age += dt;
        if (pulse.age >= pulse.life) { scene.remove(pulse.root); pulse.root.visible = false; pulsePool.push(pulse); pulses.splice(i, 1); continue; }
        const progress = pulse.age / pulse.life, ease = 1 - (1 - progress) ** 3;
        pulse.root.scale.setScalar((pulse.level ? .75 : .55) + ease * (pulse.level ? 1.35 : .8) * motion);
        pulse.edge.material.opacity = (1 - progress) * (reduceMotion ? .3 : .75);
        pulse.charm.position.y = .7 + progress * .65 * motion; pulse.charm.material.opacity = (1 - progress) * .8;
      }
      for (const e of events) if (['enemy-hit', 'player-hit', 'pickup', 'deposit'].includes(e.type)) showNumber(e, e.type === 'player-hit' ? 1.8 : 2.7);
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i]; f.age += dt;
        if (f.age > .8) { f.el.remove(); floaters.splice(i, 1); continue; }
        const pop = reduceMotion ? 1 : 1 + Math.sin(Math.min(1, f.age / .18) * Math.PI) * .2;
        vector.set(f.x, f.y + f.age * 1.3 * motion, f.z).project(camera);
        f.el.style.transform = `translate(${(vector.x * .5 + .5) * width}px,${(-vector.y * .5 + .5) * height}px) translate(-50%,-50%) scale(${pop})`;
        f.el.style.opacity = String(Math.min(1, (1 - f.age / .8) * 2));
      }
      renderer.render(scene, camera);
    },
    stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }; },
    dispose() {
      disposed = true; observer.disconnect(); for (const f of floaters) f.el.remove(); labels.remove();
      const ownedGeometry = new Set(geometries.values()), ownedMaterials = new Set([...materials.values(), ...feedbackMaterials]), externalGeometry = new Set(), externalMaterials = new Set();
      scene.traverse(o => { if (!o.isMesh) return; if (o.geometry && !ownedGeometry.has(o.geometry)) externalGeometry.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !ownedMaterials.has(m)) externalMaterials.add(m); });
      for (const g of externalGeometry) g.dispose(); for (const m of externalMaterials) m.dispose(); light.shadow.dispose(); particles.dispose(); grass.dispose();
      for (const m of feedbackMaterials) m.dispose(); feedbackMaterials.clear();
      for (const g of geometries.values()) g.dispose(); for (const m of materials.values()) m.dispose(); geometries.clear(); materials.clear(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
