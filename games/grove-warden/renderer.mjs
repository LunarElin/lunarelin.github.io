import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { WORLD, HUNT_ZONES } from './rules.mjs';

const TAU = Math.PI * 2;
const palette = { grass: 0x9bd650, pale: 0xe1f6a0, green: 0x20a466, dark: 0x145f4b, bark: 0xa86c36, gold: 0xffc735, skin: 0xffd2a0, red: 0xff684a };
const gearColors = { sprout: 0x8fea6b, thorn: 0xef987b, moon: 0xaaa4ff };
const materials = new Map();
const geometries = new Map();
function material(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...extra }));
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
function ball(p, color, x, y, z, sx, sy = sx, sz = sx) { return mesh(p, 'SphereGeometry', [1, 10, 7], color, x, y, z, [sx, sy, sz]); }
function bone(p, from, to, radius, color) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a);
  const m = mesh(p, 'CylinderGeometry', [radius * .72, radius, d.length(), 7], color);
  m.position.copy(a.add(b).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
function circle(p, radius, color, opacity = 1) {
  const m = mesh(p, 'CircleGeometry', [radius, 40], color, 0, .025, 0, [1, 1, 1], { transparent: opacity < 1, opacity, depthWrite: false });
  m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
}
function ring(p, inner, outer, color, opacity = 1) {
  const m = mesh(p, 'RingGeometry', [inner, outer, 48], color, 0, .035, 0, [1, 1, 1], { transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
}
function eyes(p, y, z, x = .17, color = 0x243c34, size = .055) {
  ball(p, color, -x, y, z, size, size * 1.3, size * .7); ball(p, color, x, y, z, size, size * 1.3, size * .7);
  ball(p, 0xffffff, -x - .014, y + .025, z + .015, size * .25); ball(p, 0xffffff, x - .014, y + .025, z + .015, size * .25);
}
function makeDruid() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  circle(root, .58, 0x183b31, .24); ring(root, .65, .71, 0xb5f7a1, .85);
  const left = ball(rig, 0x473b2f, -.23, .15, .06, .2, .15, .31), right = ball(rig, 0x473b2f, .23, .15, .06, .2, .15, .31);
  mesh(rig, 'ConeGeometry', [.58, 1.12, 9], palette.green, 0, .76, -.03, [1, 1, .8]);
  ball(rig, 0x38b66a, 0, .88, 0, .44, .47, .32);
  mesh(rig, 'TorusGeometry', [.35, .085, 5, 14], palette.gold, 0, .66, .1, [1, 1, .9]).rotation.x = Math.PI / 2;
  ball(rig, 0x216b4d, 0, 1.52, -.04, .48, .46, .43);
  ball(rig, palette.skin, 0, 1.48, .18, .35, .34, .29);
  ball(rig, 0x7c5738, 0, 1.71, .18, .38, .17, .3);
  ball(rig, palette.green, -.29, 1.63, .1, .19, .29, .25); ball(rig, palette.green, .29, 1.63, .1, .19, .29, .25);
  eyes(rig, 1.51, .445, .12, 0x2b3834, .05);
  ball(rig, palette.skin, 0, 1.39, .47, .055, .055, .055);
  const shoulders = [ball(rig, 0xa5d855, -.43, 1.1, 0, .26, .22, .25), ball(rig, 0xa5d855, .43, 1.1, 0, .26, .22, .25)];
  const arm = bone(rig, [.45, 1.05, 0], [.62, .78, .22], .13, palette.green);
  const bag = new THREE.Group(); rig.add(bag); bag.visible = false;
  ball(bag, 0xa67336, 0, .91, -.36, .35, .36, .24);
  mesh(bag, 'BoxGeometry', [.43, .1, .09], 0xffcb55, 0, 1.05, -.59);
  for (let i = 0; i < 3; i++) mesh(bag, 'CylinderGeometry', [.14, .14, .065, 10], palette.gold, (i - 1) * .13, 1.24 + i * .04, -.39);
  bone(rig, [-.45, 1.05, 0], [-.48, .72, .25], .13, palette.green);
  ball(rig, palette.skin, .62, .79, .23, .135); ball(rig, palette.skin, -.48, .72, .25, .135);
  const staff = new THREE.Group(); staff.position.set(.69, .8, .25); rig.add(staff);
  bone(staff, [0, -.72, 0], [0, 1.23, 0], .055, palette.bark);
  bone(staff, [0, .92, 0], [-.26, 1.34, 0], .045, palette.bark);
  bone(staff, [0, 1.06, 0], [.22, 1.34, 0], .04, palette.bark);
  const jewel = mesh(staff, 'OctahedronGeometry', [.18, 0], 0xc8f6a4, 0, 1.35, 0, [1, 1.4, 1], { emissive: 0x85b567, emissiveIntensity: .5 }); jewel.name = 'equipped-jewel';
  const castGlow = ball(staff, 0xf4ffb7, 0, 1.35, 0, .27); castGlow.material = new THREE.MeshBasicMaterial({ color: 0xe3ffae, transparent: true, opacity: .8, depthWrite: false }); castGlow.castShadow = false; castGlow.visible = false;
  for (const sign of [-1, 1]) {
    bone(rig, [sign * .24, 1.81, 0], [sign * .4, 2.17, 0], .055, palette.bark);
    bone(rig, [sign * .4, 2.17, 0], [sign * .36, 2.4, .04], .04, palette.bark);
    bone(rig, [sign * .37, 2.08, 0], [sign * .61, 2.17, .02], .04, palette.bark);
    const leaf = ball(rig, 0xaedc59, sign * .57, 2.18, .03, .17, .075, .09); leaf.rotation.z = sign * .4;
  }
  return { root, rig, left, right, jewel, arm, shoulders, bag, staff, castGlow };
}
function makeOwl() {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = 'owl-companion'; root.add(rig); root.visible = false;
  const shadow = circle(root, .43, 0x173b2c, .18);
  ball(rig, 0xa57a4c, 0, -.04, -.025, .39, .43, .31);
  ball(rig, 0xcfab71, 0, -.12, .21, .27, .32, .13);
  ball(rig, 0x956c43, 0, .22, .015, .4, .32, .31);
  for (const side of [-1, 1]) {
    ball(rig, 0xf0dfb1, side * .16, .18, .27, .23, .25, .085);
    ball(rig, 0x775936, side * .155, .205, .343, .143, .15, .044);
    const iris = ball(rig, 0xf1ca69, side * .155, .21, .376, .116, .125, .037);
    iris.material = material(0xf1ca69, { emissive: 0xb98935, emissiveIntensity: .15 });
    ball(rig, 0x2b4235, side * .155, .21, .409, .054, .076, .019);
    ball(rig, 0xfff7d6, side * .155 - .025, .249, .425, .022, .024, .012);
    const tuft = mesh(rig, 'ConeGeometry', [.115, .29, 5], 0x8b6842, side * .25, .505, -.015); tuft.rotation.z = -side * .3;
    ball(rig, 0xd3a764, side * .135, -.435, .115, .11, .055, .14);
  }
  const beak = mesh(rig, 'ConeGeometry', [.085, .18, 5], 0xe7b45e, 0, .055, .405); beak.rotation.x = -Math.PI / 2;
  const scarf = mesh(rig, 'TorusGeometry', [.27, .065, 5, 14], 0x648c54, 0, -.225, .035, [1, 1, .82]); scarf.rotation.x = Math.PI / 2;
  const scarfEnd = ball(rig, 0x86ad65, .075, -.35, .3, .085, .19, .045); scarfEnd.rotation.z = -.25;
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .31, .03, -.03); rig.add(wing);
    ball(wing, 0x8e6945, side * .17, -.015, 0, .29, .13, .18);
    for (let i = 0; i < 3; i++) ball(wing, i % 2 ? 0xb4915f : 0xc5a471, side * (.28 + i * .035), -.06, -.12 + i * .1, .15, .055, .065);
    return wing;
  });
  const launchGlow = ball(rig, 0xdbf9bf, 0, .04, .49, .16);
  launchGlow.material = material(0xdbf9bf, { emissive: 0x90d2a4, emissiveIntensity: 1, transparent: true, opacity: .55, depthWrite: false });
  launchGlow.castShadow = false; launchGlow.visible = false;
  const irisMaterial = material(0xf1ca69, { emissive: 0xb98935, emissiveIntensity: .15 });
  return { root, rig, shadow, wings, launchGlow, irisMaterial };
}
function makeEnemy(type) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = `enemy-${type}`; root.add(rig);
  const feet = [];
  const foot = (...args) => { const part = ball(rig, ...args); feet.push({ part, y: part.position.y, z: part.position.z }); return part; };
  const boss = type === 'boss';
  circle(root, boss ? 1.25 : .47, 0x18352c, .22);
  if (type === 'boar') {
    ball(rig, 0xd76889, 0, .6, 0, .55, .48, .76); ball(rig, 0xf18c9d, 0, .7, .46, .48, .4, .4);
    ball(rig, 0xffc1a6, 0, .57, .78, .28, .19, .15);
    for (const s of [-1, 1]) { mesh(rig, 'ConeGeometry', [.17, .42, 5], 0xbe4e7c, s * .3, 1.12, .34).rotation.z = -s * .3; mesh(rig, 'ConeGeometry', [.075, .3, 6], 0xffedbd, s * .32, .51, .79).rotation.x = -.6; }
    eyes(rig, .79, .75, .22, 0x4f3547, .055);
    for (const x of [-.32, .32]) for (const z of [-.38, .38]) foot(0x744767, x, .17, z, .13, .2, .17);
  } else if (type === 'caster') {
    ball(rig, 0x4d9fd3, 0, .62, 0, .54, .6, .46); ball(rig, 0x85d0e5, 0, 1.05, .06, .43, .31, .39);
    mesh(rig, 'ConeGeometry', [.51, .72, 7], 0x2f8ea9, 0, 1.4, -.03).rotation.z = -.2;
    eyes(rig, 1.1, .4, .16, 0xa7efeb, .07);
    bone(rig, [.55, .2, .1], [.55, 1.3, .1], .045, 0x36778d); mesh(rig, 'OctahedronGeometry', [.19, 0], 0x70efd8, .55, 1.46, .1);
  } else if (boss) {
    ball(rig, 0x637e9b, 0, 1.05, 0, 1.12, 1.2, .84);
    ball(rig, 0x94a8b7, 0, 1.91, .22, .72, .62, .58);
    for (const s of [-1, 1]) { ball(rig, 0x739f84, s * .93, 1.13, .1, .42, .75, .4); foot(0x486d84, s * .6, .28, .15, .46, .33, .5); ball(rig, 0x72c84a, s * .85, 1.78, -.04, .6, .32, .51); bone(rig, [s * .43, 2.29, 0], [s * .87, 2.93, 0], .12, 0x9b7845); bone(rig, [s * .68, 2.65, 0], [s * 1.06, 2.73, .04], .09, 0x9b7845); }
    eyes(rig, 1.95, .78, .29, 0xffbe72, .12);
    mesh(rig, 'OctahedronGeometry', [.32, 0], 0xffcb80, 0, 1.03, .8, [1, 1.5, .5], { emissive: 0xb86537, emissiveIntensity: .35 });
  } else {
    ball(rig, 0xffedb8, 0, .47, 0, .33, .47, .31);
    ball(rig, palette.red, 0, .93, 0, .7, .39, .63);
    ball(rig, 0xfff4c3, -.26, 1.15, .22, .14, .05, .12); ball(rig, 0xfff4c3, .29, 1.12, .03, .17, .06, .14); ball(rig, 0xfff4c3, -.14, 1.21, -.23, .15, .05, .14);
    eyes(rig, .58, .29, .12, 0x503c38, .05); foot(0xe0b583, -.27, .13, .05, .15, .14, .23); foot(0xe0b583, .27, .13, .05, .15, .14, .23);
  }
  const bar = new THREE.Group(); bar.position.y = boss ? 3.15 : 1.85; root.add(bar);
  const backing = mesh(bar, 'PlaneGeometry', [boss ? 2.3 : .9, .11], 0x33473b); backing.castShadow = false;
  const fill = mesh(bar, 'PlaneGeometry', [boss ? 2.22 : .82, .065], boss ? 0xffb379 : 0xf3c977, 0, 0, .005); fill.castShadow = false;
  const danger = new THREE.Group(); root.add(danger); danger.visible = false;
  const warningDisk = circle(danger, 1, 0xff6048, .25), warningRing = ring(danger, .94, 1, 0xffa044, .95);
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
  return { root, rig, bar, fill, danger, warningDisk, warningRing, warningLine, type, feet, hitMaterials, hitTime: 0, recoilX: 0, recoilZ: 0, walkBlend: 0, lastX: null, lastZ: null, moveAngle: 0 };
}

export async function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute('aria-label', '거점과 사냥터가 이어진 입체적인 숲 필드'); container.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xb8e4e8); scene.fog = new THREE.Fog(0xb8e4e8, 52, 95);
  const camera = new THREE.OrthographicCamera(-10, 10, 13, -13, .1, 110); camera.position.set(0, 27, 21 + WORLD.camp.z); camera.lookAt(0, 0, WORLD.camp.z);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7ca6b6, 1.2));
  const light = new THREE.DirectionalLight(0xffffff, 2.7); light.position.set(-8, 19, 12); light.castShadow = true; light.shadow.mapSize.set(1536, 1536); Object.assign(light.shadow.camera, { left: -17, right: 17, top: 18, bottom: -18, near: 1, far: 60 }); light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -.0007; light.shadow.normalBias = .04; scene.add(light, light.target);
  const land = new THREE.Group(); scene.add(land);
  mesh(land, 'BoxGeometry', [70, 1, 120], palette.grass, 0, -.5, -10);
  mesh(land, 'PlaneGeometry', [70, 46], 0x70c56b, 0, .008, -37).rotation.x = -Math.PI / 2;
  const pathPoints = [[0, 22], [0, 16], [0, 9], [-1, 3], [1, -5], [0, -14], [-2, -22], [1, -28], [-5, -36]];
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const [x, z] = pathPoints[i], [nx, nz] = pathPoints[i + 1], length = Math.hypot(nx - x, nz - z), color = z > -14 ? 0xffd57a : 0xefd17b;
    const road = mesh(land, 'PlaneGeometry', [2.9, length + .2], color, (x + nx) / 2, .014, (z + nz) / 2); road.rotation.set(-Math.PI / 2, 0, -Math.atan2(nx - x, nz - z)); road.castShadow = false;
    const turn = circle(land, 1.46, color); turn.position.set(x, .016, z);
  }
  const camp = new THREE.Group(); camp.position.set(WORLD.camp.x, 0, WORLD.camp.z); scene.add(camp);
  circle(camp, 5.8, 0xffda83).position.y = .023; ring(camp, WORLD.camp.radius - .03, WORLD.camp.radius + .03, 0xffedbc, .55).position.y = .04;
  const bonfire = new THREE.Group(); bonfire.position.x = -1.7; camp.add(bonfire);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const stone = mesh(bonfire, 'DodecahedronGeometry', [1, 0], 0x93a5b4, Math.cos(a) * 1.15, .25, Math.sin(a) * 1.15, [.34, .25, .31]); stone.rotation.y = a; }
  for (const a of [-.55, .55]) { const log = mesh(bonfire, 'CylinderGeometry', [.15, .18, 1.8, 7], 0x8b6140, 0, .28, 0); log.rotation.set(Math.PI / 2, a, 0); }
  const fire = new THREE.Group(); bonfire.add(fire);
  mesh(fire, 'ConeGeometry', [.55, 1.25, 7], 0xf38f42, 0, .9, 0, [1, 1, 1], { emissive: 0xe46e23, emissiveIntensity: .7 });
  mesh(fire, 'ConeGeometry', [.29, .9, 7], 0xffe4a2, -.06, .76, .18, [1, 1, 1], { emissive: 0xf9b54f, emissiveIntensity: .9 });
  circle(bonfire, 1.85, 0xf6cf77, .16).position.y = .045;
  const chest = new THREE.Group(); chest.position.set(-3.1, 0, 1.5); camp.add(chest);
  mesh(chest, 'BoxGeometry', [1.2, .72, .82], 0xa86b37, 0, .43, 0); ball(chest, 0xc99042, 0, .82, 0, .62, .3, .43);
  for (const s of [-1, 1]) mesh(chest, 'BoxGeometry', [.1, .91, .9], palette.gold, s * .38, .53, 0);
  mesh(chest, 'BoxGeometry', [.22, .27, .08], 0xffde69, 0, .54, .46);
  const forge = new THREE.Group(); forge.position.set(3.8, 0, -.5); camp.add(forge);
  mesh(forge, 'BoxGeometry', [1.5, .4, 1.35], 0x657d95, 0, .2, 0); mesh(forge, 'BoxGeometry', [1.2, 1.7, 1.1], 0xa4b4c8, 0, 1.12, 0);
  mesh(forge, 'BoxGeometry', [.64, .62, .035], 0xe5a15e, 0, .94, .575, [1, 1, 1], { emissive: 0xb36a2d, emissiveIntensity: .65 });
  mesh(forge, 'BoxGeometry', [.7, .8, .7], 0x7e97ad, 0, 2.27, -.12); mesh(forge, 'BoxGeometry', [.83, .16, .84], 0xb6c6d2, 0, 2.74, -.12);
  mesh(forge, 'BoxGeometry', [.8, .2, .45], 0x586f72, -.9, .73, .8); mesh(forge, 'BoxGeometry', [.34, .65, .34], 0x718382, -.9, .35, .8);
  const npc = new THREE.Group(); npc.position.set(-3.4, 0, -2.3); camp.add(npc);
  mesh(npc, 'ConeGeometry', [.43, .95, 8], 0x42b98a, 0, .59, 0); ball(npc, palette.skin, 0, 1.16, .04, .31, .33, .29); eyes(npc, 1.2, .3, .1, 0x364a3a, .045); ball(npc, 0xfff0c8, 0, .99, .2, .24, .23, .13);
  mesh(npc, 'ConeGeometry', [.39, .55, 8], 0x398d51, 0, 1.63, 0); bone(npc, [.42, .05, .15], [.42, 1.5, .15], .045, palette.bark);
  const questMark = new THREE.Group(); questMark.position.set(0, 2.27, 0); npc.add(questMark); mesh(questMark, 'BoxGeometry', [.13, .39, .13], 0xf5d67d, 0, .15, 0); ball(questMark, 0xf5d67d, 0, -.18, 0, .09);
  const barrier = new THREE.Group(); barrier.position.z = WORLD.gateZ; scene.add(barrier);
  for (let x = WORLD.minX; x <= WORLD.maxX; x += 2) {
    mesh(barrier, 'BoxGeometry', [.17, 1.4, .2], 0x8b7953, x, .7, 0);
    if (x < WORLD.maxX) for (const y of [.45, .95]) mesh(barrier, 'BoxGeometry', [2.1, .15, .12], 0xb09c6b, x + 1, y, 0);
  }
  const arch = new THREE.Group(); arch.position.z = WORLD.gateZ; scene.add(arch);
  for (const x of [-2, 2]) mesh(arch, 'BoxGeometry', [.45, 3.2, .45], 0x74856b, x, 1.6, 0);
  mesh(arch, 'BoxGeometry', [4.8, .5, .6], 0x98a27b, 0, 3.2, 0); mesh(arch, 'OctahedronGeometry', [.33, 0], 0xc4df98, 0, 3.64, 0);
  const territories = HUNT_ZONES.map(zone => {
    const root = new THREE.Group(); root.position.set(zone.x, .012, zone.z); scene.add(root);
    circle(root, zone.radius, zone.deep ? 0x46ba76 : 0xb7df68, .1);
    const edge = ring(root, zone.radius - .035, zone.radius + .035, 0xefe5a3, .24); edge.material = edge.material.clone();
    if (zone.bossId) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; mesh(root, 'DodecahedronGeometry', [.35, 0], 0x8b9b87, Math.cos(a) * (zone.radius + .2), .12, Math.sin(a) * (zone.radius + .2), [1, .6, 1]); }
    return { zone, root, edge, label: null };
  });
  const decorations = new THREE.Group(); scene.add(decorations);
  const occludingTrees = [];
  // Seeded decoration placement stays independent from combat randomness.
  let seed = 47281; const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 48; i++) {
    const patch = mesh(decorations, 'CircleGeometry', [.7 + random() * 1.6, 9], i % 2 ? 0x78bd45 : 0xc3e87a, (random() - .5) * 30, .028, -42 + random() * 63, [1.6, .65, 1], { transparent: true, opacity: .14, depthWrite: false });
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = random() * TAU; patch.castShadow = false;
  }
  for (let i = 0; i < 68; i++) {
    const side = i % 2 ? 1 : -1, z = WORLD.minZ + Math.floor(i / 2) * 2;
    const rock = mesh(decorations, 'DodecahedronGeometry', [1, 0], i % 3 ? 0x8195a8 : 0xc1c9cf, side * 16.1, .6, z, [.8 + random() * .5, .8 + random() * .9, 1.1 + random() * .4]); rock.rotation.y = random() * TAU;
  }
  for (const z of [WORLD.minZ - .8, WORLD.maxZ + .8]) for (let x = -15; x <= 15; x += 1.5) mesh(decorations, 'DodecahedronGeometry', [1, 0], 0x98afa8, x, .48, z, [.9, .75, .75]);
  const grass = new THREE.InstancedMesh(geometry('ConeGeometry', [.16, .45, 4]), material(0x31b67d), 380); grass.castShadow = false; scene.add(grass);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 380; i++) { let x = (random() - .5) * 31, z = -42 + random() * 65; if (Math.abs(x) < 2.1) x += 3.4; dummy.position.set(x, .12, z); dummy.rotation.set(0, random() * TAU, (random() - .5) * .4); dummy.scale.setScalar(.5 + random() * .9); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); }
  for (let i = 0; i < 45; i++) {
    const p = new THREE.Group(); p.position.set((random() - .5) * 27, .04, -41 + random() * 62); decorations.add(p);
    for (let j = 0; j < 3; j++) ball(p, i % 2 ? 0xf0d29a : 0xf0e9bb, (j - 1) * .1, .05, j % 2 * .1, .065, .035, .065);
  }
  const druid = makeDruid(); druid.rig.scale.setScalar(1.15); scene.add(druid.root);
  const owl = makeOwl(); scene.add(owl.root);
  const aimMarker = new THREE.Group(); ring(aimMarker, .96, 1, 0xe3ffb3, .9); circle(aimMarker, 1, 0xc8f2a1, .14); scene.add(aimMarker); aimMarker.visible = false;
  const actors = new Map(), actorPool = [], bolts = new Map(), boltPool = [], fx = new Map(), fxPool = [], coins = new Map(), coinPool = [];
  const dyingActors = [], pulsePool = [], pulses = [], impactPool = [], impacts = [], feedbackMaterials = new Set();
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
  };
  const labels = document.createElement('div'); labels.className = 'combat-labels'; container.append(labels);
  const floaters = []; const vector = new THREE.Vector3();
  for (const territory of territories) { const label = document.createElement('span'); label.className = 'territory-label'; label.textContent = `${territory.zone.name} · Lv.${territory.zone.level}`; labels.append(label); territory.label = label; }
  let width = 1, height = 1, lastPlayer = { x: 0, z: WORLD.camp.z }, previousHp = 100, shake = 0, castFlash = 0, castAngle = 0, owlFlash = 0, owlAngle = 0, owlAppeared = 0, owlWasActive = false, depositFlash = 0, renderTime = 0, walkBlend = 0, disposed = false;
  const resize = () => {
    const rect = container.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); renderer.setSize(width, height, false);
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
    const model = gltf.scene; model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.metalness = 0; m.roughness = 1;
        if (/leaf/i.test(m.name)) m.color.setHex(/dark/i.test(m.name) ? 0x288d59 : 0x67bf45);
        if (/wood|bark/i.test(m.name)) m.color.setHex(0xb17b41);
      }
    });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const isTree = kind === 'tree' || kind === 'pine';
    const scale = (isTree ? 4.2 : kind === 'rock' ? 1.35 : .55) / Math.max(size.x, size.y, size.z, .01);
    model.scale.setScalar(scale); model.position.y = -box.min.y * scale;
    const n = isTree ? 30 : kind === 'rock' ? 14 : 22;
    for (let i = 0; i < n; i++) {
      let x, z;
      if (isTree) { x = (i % 2 ? 1 : -1) * (i < 22 ? 16.2 + random() * 1.7 : 12.8); z = i < 22 ? WORLD.minZ - 1 + Math.floor(i / 2) * 6.6 + (kind === 'pine' ? 2.8 : 0) : -36 + Math.floor((i - 22) / 2) * 14 + (kind === 'pine' ? 3.5 : 0); }
      else { x = (random() - .5) * 28; z = WORLD.minZ + random() * 65; if (Math.abs(x) < 2.5) x += 4.5; if (Math.hypot(x - WORLD.camp.x, z - WORLD.camp.z) < 6) z -= 9; }
      const instance = new THREE.Group(); instance.add(model.clone(true)); instance.position.set(x, -.02, z); instance.rotation.y = random() * TAU; instance.scale.setScalar(.8 + random() * .5); decorations.add(instance);
      if (isTree) {
        const treeMaterials = [];
        instance.traverse(o => {
          if (!o.isMesh) return;
          const copy = m => { const own = m.clone(); treeMaterials.push(own); return own; };
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
    bone(staff, [0, -.45, 0], [0, .45, 0], .055, 0x92643d);
    bone(staff, [0, .24, 0], [-.16, .52, 0], .045, 0xffd279); bone(staff, [0, .24, 0], [.16, .52, 0], .045, 0xffd279);
    const jewel = mesh(staff, 'OctahedronGeometry', [.18, 0], 0x8fea6b, 0, .51, 0, [1, 1.3, 1]); jewel.material = jewel.material.clone(); feedbackMaterials.add(jewel.material);
    const scroll = new THREE.Group(); scroll.name = 'dropped-scroll'; icon.add(scroll);
    mesh(scroll, 'BoxGeometry', [.48, .64, .07], 0xffedc2);
    for (const y of [-.32, .32]) { const roll = mesh(scroll, 'CylinderGeometry', [.085, .085, .6, 8], 0xd49b51, 0, y, 0); roll.rotation.z = Math.PI / 2; }
    mesh(scroll, 'OctahedronGeometry', [.105, 0], 0x735cba, 0, -.04, .075, [1, 1, .45]);
    return { root, icon, base, beam, staff, scroll, jewel };
  }
  function makeDiscovery() {
    const root = new THREE.Group(), icon = new THREE.Group(); root.name = 'field-discovery'; root.add(icon);
    const base = ring(root, .65, .75, palette.gold, .85); base.material = ownBasic(palette.gold, { transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide });
    const chest = new THREE.Group(); icon.add(chest);
    mesh(chest, 'BoxGeometry', [.95, .52, .69], 0xa96b37, 0, -.06, 0);
    ball(chest, 0xd69b4b, 0, .23, 0, .5, .22, .36);
    for (const x of [-.3, .3]) mesh(chest, 'BoxGeometry', [.1, .69, .76], 0xffd34e, x, .02, 0);
    mesh(chest, 'BoxGeometry', [.2, .23, .1], 0xffed9d, 0, -.04, .39);
    const blessing = new THREE.Group(); icon.add(blessing);
    mesh(blessing, 'CylinderGeometry', [.56, .65, .23, 7], 0x819b9c, 0, .14, 0);
    const seed = mesh(blessing, 'OctahedronGeometry', [.33, 0], 0x94ff9c, 0, .4, 0, [1, 1.4, 1], { emissive: 0x48bc7f, emissiveIntensity: .55 });
    for (let i = 0; i < 3; i++) { const angle = i / 3 * TAU, leaf = ball(blessing, 0x28b36c, Math.sin(angle) * .27, .3, Math.cos(angle) * .27, .25, .07, .13); leaf.rotation.y = -angle; }
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
    if (!actors.has(enemy.id)) {
      const i = actorPool.findIndex(a => a.type === enemy.type), a = i < 0 ? makeEnemy(enemy.type) : actorPool.splice(i, 1)[0];
      for (const part of a.hitMaterials) feedbackMaterials.add(part.material);
      a.root.visible = true; scene.add(a.root); actors.set(enemy.id, a);
    }
    return actors.get(enemy.id);
  }
  function emitParticles(x, y, z, color, count, kind = 'burst', target = null) {
    const reduce = motionPreference?.matches;
    for (let i = 0, total = reduce ? Math.ceil(count / 2) : count; i < total; i++) {
      const index = particleCursor++ % particleCapacity, particle = particleData[index], angle = random() * TAU;
      const speed = kind === 'hit' ? .6 + random() * 1.2 : 1 + random() * 2;
      Object.assign(particle, {
        x, y, z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 1.1 + random() * 1.8,
        life: kind === 'hit' ? .2 + random() * .12 : .4 + random() * .22,
        size: kind === 'hit' ? .08 + random() * .04 : .06 + random() * .055,
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
      feedbackMaterials.add(edge.material); pulse = { root, edge };
    }
    pulse.age = 0; pulse.life = level ? .75 : .55; pulse.level = level;
    pulse.root.position.set(x, .06, z); pulse.root.visible = true; pulse.edge.material.color.setHex(level ? 0xb9ff9c : palette.gold);
    scene.add(pulse.root); pulses.push(pulse);
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
      const outer = new THREE.Mesh(impactGeometry(), own(0x174c58)); outer.scale.setScalar(.95); flash.add(outer);
      const fill = new THREE.Mesh(impactGeometry(), own(0x8df8ff)); fill.scale.setScalar(.74); fill.position.z = .005; flash.add(fill);
      const core = new THREE.Mesh(impactGeometry(), own(0xffffff)); core.scale.setScalar(.32); core.rotation.z = .22; core.position.z = .01; flash.add(core);
      const shock = new THREE.Mesh(geometry('RingGeometry', [.86, 1, 32]), own(0xffe48d)); shock.position.z = -.005; root.add(shock);
      for (const part of [outer, fill, core, shock]) { part.castShadow = part.receiveShadow = false; part.renderOrder = 20; }
      impact = { root, flash, outer, fill, core, shock };
    }
    const source = event.source || 'staff', color = source === 'owl' ? 0x62b9ff : source === 'roots' ? 0x80ff76 : 0x8df8ff;
    impact.age = 0; impact.life = .28; impact.source = source;
    impact.fill.material.color.setHex(color); impact.shock.material.color.setHex(color);
    impact.root.position.set(event.x, enemy?.type === 'boss' ? 1.75 : 1.05, event.z);
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
    const el = document.createElement('span'); el.className = `combat-number ${e.type === 'player-hit' ? 'hurt' : ''}`; el.textContent = e.damage ? `${e.type === 'player-hit' ? '−' : ''}${Math.round(e.damage)}` : e.type === 'skill' ? '덩굴' : e.type === 'pickup' ? `+${e.amount}` : e.type === 'deposit' ? `보관 +${e.amount}` : e.type === 'level-up' ? '레벨 업!' : e.type === 'gear-pickup' ? e.copies > 0 ? '장비 획득!' : `두루마리 +${e.scrolls}` : e.type === 'field-chest' ? '보물 발견!' : e.type === 'field-boon' ? '숲의 축복!' : '';
    if (!el.textContent) return; labels.append(el); floaters.push({ el, x: e.x ?? 0, z: e.z ?? 0, y, age: 0 });
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
      for (const e of events) {
        if (e.type === 'hit') {
          hits.set(e.targetId, e);
          const target = state.enemies.find(enemy => enemy.id === e.targetId) || actors.get(e.targetId);
          emitImpact(e, target); showNumber(e, target?.type === 'boss' ? 3.3 : 2.45);
          emitParticles(e.x, 1.05, e.z, e.source === 'owl' ? 0x80cfff : e.source === 'roots' ? 0xa4ff79 : 0xbafaff, 6, 'hit');
        } else if (e.type === 'kill') {
          kills.add(e.targetId);
          const color = e.enemyType === 'boar' ? 0xf18c9d : e.enemyType === 'caster' ? 0x85d0e5 : e.enemyType === 'boss' ? 0xa6c084 : palette.red;
          emitParticles(e.x, e.enemyType === 'boss' ? 1.2 : .7, e.z, color, e.bossId ? 16 : 8);
        } else if (e.type === 'pickup') emitParticles(e.x, .35, e.z, palette.gold, 5, 'pickup', p);
        else if (e.type === 'deposit') {
          depositFlash = .65; rewardPulse(p.x, p.z);
          emitParticles(chest.position.x + WORLD.camp.x, .9, chest.position.z + WORLD.camp.z, palette.gold, 14);
        } else if (e.type === 'level-up' || e.type === 'quest' || e.type === 'upgrade') {
          rewardPulse(p.x, p.z, e.type === 'level-up');
          emitParticles(p.x, .5, p.z, e.type === 'level-up' ? 0xd6ff96 : palette.gold, e.type === 'level-up' ? 18 : 8, 'rise');
        } else if (e.type === 'field-discovery') emitParticles(e.x, .6, e.z, e.kind === 'blessing' ? 0x94ff9c : palette.gold, 8, 'rise');
        else if (e.type === 'field-chest' || e.type === 'gear-pickup') {
          rewardPulse(e.x, e.z); emitParticles(e.x, .7, e.z, gearColors[e.equipmentId] ?? palette.gold, e.type === 'field-chest' ? 18 : 9, 'rise');
        } else if (e.type === 'field-boon') {
          rewardPulse(e.x, e.z, true); emitParticles(e.x, .5, e.z, 0x94ff9c, 14, 'rise');
        } else if (e.type === 'field-hazard') emitParticles(e.x, .5, e.z, 0xffa052, 10);
      }
      for (const tree of occludingTrees) {
        const dx = tree.instance.position.x - p.x, dz = tree.instance.position.z - p.z;
        // Layered leaves accumulate alpha; keep overlapping trees almost invisible.
        const targetOpacity = Math.abs(dx) < 2.8 && dz > -.5 && dz < 4 ? .04 : 1;
        tree.opacity += (targetOpacity - tree.opacity) * Math.min(1, dt * 9);
        for (const m of tree.materials) {
          const fading = tree.opacity < .995;
          if (m.transparent !== fading) { m.transparent = fading; m.depthWrite = !fading; m.needsUpdate = true; }
          m.opacity = fading ? tree.opacity : 1;
        }
      }
      shake = Math.max(0, shake - dt); camera.position.set(p.x + (shake && !reduceMotion ? Math.sin(visualTime * 50) * shake * .45 : 0), 27, 21 + p.z); camera.lookAt(p.x, 0, p.z); camera.updateMatrixWorld();
      light.position.set(p.x - 8, 19, p.z + 12); light.target.position.set(p.x, 0, p.z); light.target.updateMatrixWorld();
      for (const territory of territories) {
        const { zone, root, edge, label } = territory, active = state.huntZoneId === zone.id;
        root.visible = !zone.deep || state.progress.unlockedDeep;
        edge.material.opacity = active ? .35 + Math.sin(visualTime * 2) * .08 : .12;
        vector.set(zone.x, .2, zone.z + zone.radius * .75).project(camera);
        // Nearby names belong in the HUD; keep approaching-territory labels off the fighters too.
        const nearby = Math.hypot(zone.x - p.x, zone.z - p.z) <= zone.radius + 2;
        label.hidden = active || nearby || !root.visible || Math.abs(vector.x) > .92 || Math.abs(vector.y) > .92;
        label.classList.toggle('active', active);
        if (!label.hidden) label.style.transform = `translate(${(vector.x * .5 + .5) * width}px,${(-vector.y * .5 + .5) * height}px) translate(-50%,-50%)`;
      }
      fire.scale.set(1 + Math.sin(visualTime * 8) * .05, 1 + Math.sin(visualTime * 11) * .1, 1); fire.rotation.y = Math.sin(visualTime * 2) * .12;
      questMark.position.y = 2.27 + Math.sin(visualTime * 3) * .1; questMark.visible = (state.progress?.questIndex ?? 0) < 6;
      barrier.visible = !state.progress?.unlockedDeep;
      depositFlash = Math.max(0, depositFlash - dt);
      const chestPop = depositFlash > 0 ? Math.sin((1 - depositFlash / .65) * Math.PI) : 0;
      chest.position.y = chestPop * .18 * motion; chest.rotation.z = Math.sin((1 - depositFlash / .65) * TAU * 1.5) * depositFlash * .06 * motion;
      castFlash = Math.max(0, castFlash - dt);
      for (const e of events) if (e.type === 'shoot') { castFlash = .22; castAngle = Math.atan2(e.aimX ?? p.facingX, e.aimZ ?? p.facingZ); }
      walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, dt * 14);
      const stride = Math.sin(visualTime * 13) * walkBlend * motion;
      const castPose = castFlash > 0 ? Math.sin(castFlash / .22 * Math.PI) : 0;
      druid.root.position.set(p.x, .035, p.z); druid.rig.rotation.y = castFlash > 0 ? castAngle : Math.atan2(p.facingX ?? 0, p.facingZ ?? 1);
      druid.rig.position.y = (Math.abs(stride) * .075 + Math.sin(visualTime * 2) * .025 * (1 - walkBlend)) * motion;
      druid.rig.rotation.x = (walkBlend * .055 - castPose * .055) * motion; druid.rig.rotation.z = stride * .035;
      druid.arm.rotation.x = -.6 * castPose; druid.staff.rotation.x = -.14 * castPose * motion; druid.staff.rotation.z = -.05 * castPose * motion;
      druid.castGlow.visible = castFlash > .1; druid.castGlow.scale.setScalar(.27 * (.7 + castFlash * 3)); druid.castGlow.material.opacity = reduceMotion ? .3 : .8;
      druid.bag.visible = state.cargo > 0; druid.bag.scale.setScalar(.75 + Math.min(1, (state.cargo || 0) / (p.capacity || 24)) * .4);
      druid.bag.rotation.z = -stride * .07;
      druid.left.position.z = .06 + stride * .17; druid.right.position.z = .06 - stride * .17;
      druid.left.position.y = .15 + Math.max(0, stride) * .08; druid.right.position.y = .15 + Math.max(0, -stride) * .08; druid.jewel.rotation.y = visualTime;
      druid.rig.visible = reduceMotion || !(p.invuln > 0 && Math.floor(visualTime * 22) % 2); lastPlayer = { x: p.x, z: p.z };
      const owlActive = state.owl?.active === true && p.hp > 0 && state.phase !== 'down';
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
        if (enemy.hp <= 0) continue; alive.add(enemy.id); const a = getActor(enemy); a.root.position.set(enemy.x, .03, enemy.z);
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
        a.rig.position.y = enemy.phase === 'windup' ? -.06 + Math.sin(visualTime * 24) * .025 : Math.abs(gait) * (enemy.type === 'boss' ? .07 : .11) + breath;
        a.rig.rotation.x = Math.cos(beat) * a.walkBlend * .055 * motion;
        a.rig.rotation.z = gait * (enemy.type === 'boss' ? .025 : .065);
        for (let i = 0; i < a.feet.length; i++) {
          const foot = a.feet[i], stride = Math.sin(beat + i % 2 * Math.PI) * a.walkBlend * motion;
          foot.part.position.z = foot.z + stride * .14; foot.part.position.y = foot.y + Math.max(0, stride) * .1; foot.part.rotation.x = stride * .2;
        }
        a.fill.scale.x = Math.max(0, enemy.hp / enemy.maxHp); a.bar.quaternion.copy(camera.quaternion); a.bar.visible = enemy.hp < enemy.maxHp || enemy.type === 'boss';
        a.danger.visible = enemy.phase === 'windup';
        if (a.danger.visible) {
          // World-space telegraphs share the simulation's locked origin and dimensions.
          a.danger.position.set((enemy.warnX ?? enemy.x) - enemy.x, .01, (enemy.warnZ ?? enemy.z) - enemy.z); a.danger.rotation.y = enemy.angle ?? Math.atan2(enemy.aimX || 0, enemy.aimZ || 1);
          const line = enemy.type === 'boar' || enemy.type === 'caster'; a.warningLine.visible = line; a.warningDisk.visible = a.warningRing.visible = !line;
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
        if (!bolts.has(b.id)) { const bolt = boltPool.pop() || makeBolt(); bolt.root.visible = true; scene.add(bolt.root); bolts.set(b.id, bolt); }
        const bolt = bolts.get(b.id), fromOwl = b.team === 'player' && b.source === 'owl';
        const flight = Math.min(1, Math.max(0, ((fromOwl ? 2 : 1.5) - b.life) / (fromOwl ? .5 : .35)));
        // Reset every visual property so one shared pool can safely change projectile sources.
        bolt.root.name = fromOwl ? 'owl-missile' : b.team === 'player' ? 'staff-bolt' : 'enemy-bolt';
        bolt.root.position.set(b.x, fromOwl ? 1.95 - flight : b.team === 'player' ? 2.25 - flight * 1.35 : 1.25, b.z);
        bolt.root.rotation.set(0, Math.atan2(b.dx, b.dz), 0); bolt.root.scale.set(1, 1, 1);
        bolt.body.material = fromOwl ? boltMaterials.owl : boltMaterials[b.team] || boltMaterials.enemy;
        bolt.body.position.set(0, 0, 0); bolt.body.rotation.set(0, 0, 0);
        bolt.body.scale.set(fromOwl ? .125 : b.team === 'player' ? .18 : .24, fromOwl ? .13 : .18, fromOwl ? .24 : .4);
        bolt.tail.visible = b.team === 'player'; bolt.tail.material = fromOwl ? boltMaterials.owlTail : boltMaterials.staffTail;
        bolt.tail.position.set(0, 0, fromOwl ? -.39 : -.46); bolt.tail.rotation.set(0, 0, 0); bolt.tail.scale.set(fromOwl ? .075 : .1, fromOwl ? .07 : .085, fromOwl ? .35 : .5);
        bolt.core.visible = b.team === 'player'; bolt.core.material = boltMaterials.owlCore;
        bolt.core.position.set(0, 0, .12); bolt.core.rotation.set(0, 0, 0); bolt.core.scale.set(fromOwl ? .075 : .105, fromOwl ? .085 : .105, fromOwl ? .115 : .16);
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
        f.disk.visible = e.type !== 'death'; f.edge.material.color.setHex(e.type === 'death' ? 0xffd58b : hostile ? 0xffcf68 : 0xe1ffae);
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
      }
      for (const e of events) if (['enemy-hit', 'player-hit', 'pickup', 'deposit', 'gear-pickup'].includes(e.type)) showNumber(e, e.type === 'player-hit' ? 1.8 : 2.7);
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
      for (const g of externalGeometry) g.dispose(); for (const m of externalMaterials) m.dispose(); light.shadow.dispose(); particles.dispose();
      for (const m of feedbackMaterials) m.dispose(); feedbackMaterials.clear();
      for (const g of geometries.values()) g.dispose(); for (const m of materials.values()) m.dispose(); geometries.clear(); materials.clear(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
