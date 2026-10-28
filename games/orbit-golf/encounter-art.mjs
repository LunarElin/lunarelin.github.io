import * as THREE from './assets/vendor/three.module.js';

// Local, floor-anchored render assets. The scene owns the collider transform and
// disposal; animation below never moves the asset's root or invents a flight path.
const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const ENCOUNTER_ART_TYPES = Object.freeze(['beast', 'giant-alien', 'cookie']);

function workshop() {
  const materials = new Map();
  const sphere = new THREE.SphereGeometry(1, 18, 12);
  const pebble = new THREE.IcosahedronGeometry(1, 0);
  const torus = new THREE.TorusGeometry(1, .085, 6, 28);
  const material = (color, roughness = .56, metalness = .04, emission = 0) => {
    const key = `${color}:${roughness}:${metalness}:${emission}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness, metalness, emissive: emission ? color : 0x000000, emissiveIntensity: emission,
    }));
    return materials.get(key);
  };
  const mesh = (parent, geometry, color, name, position = [0, 0, 0], scale = [1, 1, 1], roughness = .56, metalness = .04, emission = 0) => {
    const object = new THREE.Mesh(geometry, material(color, roughness, metalness, emission));
    object.name = name; object.position.set(...position); object.scale.set(...scale); parent.add(object);
    return object;
  };
  const round = (parent, color, name, position, scale, roughness, metalness, emission) =>
    mesh(parent, sphere, color, name, position, scale, roughness, metalness, emission);
  return { sphere, pebble, torus, mesh, round, material };
}

function eye(w, parent, x, y, z, size, name, iris = 0x21384d) {
  const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); parent.add(group);
  w.round(group, 0xfff8e7, 'eye-white', [0, 0, 0], [size, size * 1.1, size * .48], .3);
  w.round(group, iris, 'eye-pupil', [0, -.015 * size, -size * .39], [size * .46, size * .58, size * .19], .25);
  return group;
}

// The approved family seed: a warm, broad-snouted space hippo with a tactile
// belly bumper. Limbs and ears remain separate silhouettes at phone scale.
function buildBeast(w, rig, event, r, h) {
  const panda = event.skin === 'panda';
  const fur = panda ? 0xf2ead9 : 0xd49b78;
  const shade = panda ? 0x263a48 : 0xb6745f;
  const cream = panda ? 0xd6d3bd : 0xf2ccb0;
  const body = w.round(rig, fur, 'beast-heavy-body', [0, 0, .1 * r], [.88 * r, .69 * r, .78 * r], .74);
  const head = w.round(rig, fur, 'beast-broad-head', [0, .43 * r, -.31 * r], [.64 * r, .50 * r, .59 * r], .74);
  const feet = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const foot = new THREE.Group(); foot.name = 'beast-paw-joint';
    foot.position.set(side * .59 * r, -.48 * r, front * .48 * r); rig.add(foot);
    w.round(foot, shade, 'beast-round-paw', [0, .02 * r, 0], [.31 * r, .40 * r, .37 * r], .79);
    feet.push(foot);
  }
  for (const side of [-1, 1]) {
    w.round(rig, cream, 'beast-toes', [side * .59 * r, -.72 * r, -.72 * r], [.29 * r, .16 * r, .18 * r], .72);
    const ear = new THREE.Group(); ear.name = 'beast-ear-joint';
    ear.position.set(side * .46 * r, .82 * r, -.17 * r); rig.add(ear);
    w.round(ear, shade, 'beast-round-ear', [0, 0, 0], [.22 * r, .25 * r, .13 * r], .8);
    w.round(ear, panda ? 0x54706d : 0xe7b3a1, 'beast-inner-ear', [0, .015 * r, -.105 * r], [.13 * r, .15 * r, .035 * r], .83);
  }
  w.round(rig, cream, 'beast-soft-muzzle', [0, .19 * r, -.78 * r], [.59 * r, .31 * r, .23 * r], .68);
  for (const side of [-1, 1]) w.round(rig, 0x684c48, 'beast-nostril', [side * .23 * r, .25 * r, -.991 * r], [.075 * r, .055 * r, .024 * r], .85);
  const eyes = [];
  for (const side of [-1, 1]) {
    if (panda) w.round(rig, shade, 'panda-eye-patch', [side * .35 * r, .55 * r, -.76 * r], [.23 * r, .28 * r, .10 * r], .86);
    eyes.push(eye(w, rig, side * .35 * r, .55 * r, -.83 * r, .14 * r, 'beast-eye'));
    const brow = w.round(rig, shade, 'beast-eyebrow', [side * .35 * r, .72 * r, -.81 * r], [.18 * r, .045 * r, .05 * r], .84);
    brow.rotation.z = -side * .08;
  }
  const belly = w.round(rig, 0xf5ddb0, 'beast-belly-cushion', [0, -.30 * r, -.77 * r], [.47 * r, .34 * r, .22 * r], .38);
  const ring = w.mesh(rig, w.torus, 0x60cdbd, 'beast-elastic-belly-ring', [0, -.30 * r, -.93 * r], [.49 * r, .36 * r, .9], .38, .18);
  const tail = w.round(rig, shade, 'beast-tail', [0, -.03 * r, .87 * r], [.15 * r, .16 * r, .25 * r], .8);
  return { body, head, feet, eyes, belly, ring, tail, baseHeight: h };
}

function buildAlien(w, rig, event, r, h) {
  const body = w.round(rig, 0x9e77cf, 'alien-pear-body', [0, .03 * r, 0], [.72 * r, .83 * r, .61 * r], .45);
  const crown = w.round(rig, 0xc0a1e5, 'alien-domed-crown', [0, .51 * r, .01 * r], [.69 * r, .50 * r, .55 * r], .46);
  const eyes = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .43 * r, y = (i === 1 ? .57 : .38) * r;
    eyes.push(eye(w, rig, x, y, -.59 * r, .22 * r, 'alien-eye', 0x264846));
  }
  // Each broad arm is one low-segment tube; palms and cuffs make the wind-up
  // readable without a text sign or a generic floating effect.
  const arms = [], cuffs = [];
  const tips = [[-.88, -.46], [-.44, -.86], [.44, -.86], [.88, -.46]];
  for (const [i, [x, z]] of tips.entries()) {
    const arm = new THREE.Group(); arm.name = 'alien-tentacle-joint'; rig.add(arm);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * .32 * r, -.27 * r, z * .22 * r),
      new THREE.Vector3(x * .78 * r, -.46 * r, z * .59 * r),
      new THREE.Vector3(x * .95 * r, -.63 * r, z * .85 * r),
      new THREE.Vector3(x * r, -.50 * r, z * r),
    ]);
    w.mesh(arm, new THREE.TubeGeometry(curve, 12, r * .115, 7, false), i % 2 ? 0xb494df : 0x8a64bd, 'alien-curved-tentacle', [0, 0, 0], [1, 1, 1], .48);
    const palm = w.round(arm, 0x67d8c0, 'alien-sling-palm', [x * r, -.50 * r, z * r], [.18 * r, .16 * r, .22 * r], .38);
    const cuff = w.mesh(arm, w.torus, 0xf1bb69, 'alien-sling-cuff', [x * .94 * r, -.55 * r, z * .91 * r], [.19 * r, .19 * r, .65], .39, .22);
    cuff.rotation.x = Math.PI / 2;
    arms.push(arm); cuffs.push(cuff); palm.userData.armIndex = i;
  }
  const antennae = [];
  for (const side of [-1, 1]) {
    const stalk = w.round(rig, 0x8060b2, 'alien-antenna-stalk', [side * .39 * r, .94 * r, .03 * r], [.065 * r, .22 * r, .065 * r], .54);
    stalk.rotation.z = -side * .22;
    antennae.push(w.round(rig, 0x9df2ce, 'alien-antenna-tip', [side * .44 * r, 1.13 * r, .03 * r], [.12 * r, .12 * r, .12 * r], .34, .05, .12));
  }
  const mouth = w.round(rig, 0x583f7f, 'alien-small-mouth', [0, .03 * r, -.61 * r], [.22 * r, .07 * r, .035 * r], .8);
  return { body, crown, eyes, arms, cuffs, antennae, mouth, baseHeight: h };
}

function cookieSector(radius, depth, bitten) {
  const shape = new THREE.Shape(), steps = 8, angle = TAU / 6, gap = .018;
  shape.moveTo(0, 0);
  for (let i = 0; i <= steps; i++) {
    const a = gap + (angle - gap * 2) * i / steps;
    const notch = bitten && i >= 3 && i <= 5 ? .80 + Math.abs(i - 4) * .06 : 1;
    shape.lineTo(Math.cos(a) * radius * notch, Math.sin(a) * radius * notch);
  }
  shape.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .045 * radius, bevelThickness: .045 * radius, curveSegments: 4 });
}

function buildCookie(w, rig, event, r, h) {
  if (event.fragment || event.skin === 'crumb') {
    const chunk = w.mesh(rig, w.pebble, 0xd49c58, 'cookie-physical-crumb', [0, 0, 0], [r, r * .72, r * .80], .87);
    w.mesh(rig, w.pebble, 0x51352e, 'crumb-chocolate-chip', [-r * .23, r * .31, -r * .47], [r * .25, r * .19, r * .18], .8);
    return { chunk, sectors: [], crumbs: true, baseHeight: h };
  }
  const sectors = [], depth = r * .40, radius = r * .875;
  const sectorGeometry = cookieSector(radius, depth, false), bittenGeometry = cookieSector(radius, depth, true);
  for (let i = 0; i < 6; i++) {
    const sector = w.mesh(rig, i === 1 ? bittenGeometry : sectorGeometry, i % 2 ? 0xe3b770 : 0xdba95e, 'cookie-breakable-sector', [0, 0, -depth / 2], [1, 1, 1], .88);
    sector.rotation.z = i * TAU / 6; sectors.push(sector);
  }
  // Chips are faceted chunks with actual depth, not a texture or painted dots.
  const chips = [[-.48, .23, .14], [.18, .53, -.3], [.48, .08, .5], [-.23, -.47, .15], [.31, -.41, -.2], [-.39, .58, .25], [.03, -.03, -.12]];
  for (const [i, [x, y, turn]] of chips.entries()) {
    const chip = w.mesh(rig, w.pebble, i % 3 ? 0x5c3b2f : 0x764b36, 'cookie-raised-chocolate-chip', [x * radius, y * radius, -depth / 2 - .06 * r], [.13 * r, .105 * r, .075 * r], .82);
    chip.rotation.z = turn; chip.rotation.y = turn * .7;
  }
  const edge = w.mesh(rig, w.torus, 0xb87e42, 'cookie-baked-edge', [0, 0, depth / 2], [radius * .98, radius * .98, .6], .89);
  const filling = w.mesh(rig, w.torus, 0xf4d6a1, 'cookie-cream-seam', [0, 0, .06 * r], [radius * .94, radius * .94, .25], .92);
  return { sectors, edge, filling, baseHeight: h };
}

export function createEncounterVisual(event = {}) {
  if (!ENCOUNTER_ART_TYPES.includes(event.type)) return null;
  const r = Math.max(.25, finite(event.radius, event.type === 'beast' ? 2.6 : event.type === 'giant-alien' ? 2.5 : 2.25));
  const h = Math.max(.25, finite(event.height, event.type === 'beast' ? 2.3 : event.type === 'giant-alien' ? 2.4 : 2.1));
  const group = new THREE.Group(); group.name = `encounter-${event.type}`;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 18), new THREE.MeshBasicMaterial({ color: 0x071326, transparent: true, opacity: .24, depthWrite: false }));
  shadow.name = 'encounter-contact-shadow'; shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024; shadow.scale.set(r * .94, r * .76, 1); group.add(shadow);
  const rig = new THREE.Group(); rig.name = 'encounter-local-rig'; rig.position.y = h; group.add(rig);
  const w = workshop();
  const parts = event.type === 'beast' ? buildBeast(w, rig, event, r, h)
    : event.type === 'giant-alien' ? buildAlien(w, rig, event, r, h) : buildCookie(w, rig, event, r, h);
  group.userData = { encounterType: event.type, rig, parts, shadow, radius: r, colliderHeight: h };
  return group;
}

export function animateEncounterVisual(group, event = {}, elapsed = 0, hit = null, dt = 0) {
  if (!group?.userData?.rig) return;
  const { rig, parts, shadow, encounterType: type, radius: r, colliderHeight: h } = group.userData;
  const t = finite(elapsed), phase = finite(event.phase), flying = Boolean(event.body?.active);
  const progress = hit ? clamp(1 - finite(hit.life) / Math.max(.01, finite(hit.total, .6)), 0, 1) : 0;
  const pulse = hit ? Math.sin(progress * Math.PI) * clamp(finite(hit.strength, 1), .2, 1.5) : 0;
  const idle = flying ? 0 : Math.sin(t * 1.25 + phase);
  rig.position.set(0, h, 0); rig.rotation.set(0, 0, 0); rig.scale.set(1, 1, 1);
  group.visible = !event.broken || Boolean(event.fragment) || Boolean(parts.crumbs);
  shadow.visible = !flying && !event.fragment && !parts.crumbs;
  if (type === 'beast') {
    rig.scale.set(1 + pulse * .09, 1 - pulse * .13 + idle * .012, 1 + pulse * .07);
    parts.feet.forEach((foot, index) => { foot.rotation.z = flying ? (index % 2 ? -.28 : .28) : pulse * (index % 2 ? -.24 : .24); });
    parts.eyes.forEach(eyeGroup => { eyeGroup.scale.y = 1 + pulse * .2; });
    parts.belly.scale.z = .22 * r * (1 - pulse * .4);
    parts.ring.scale.set(.49 * r * (1 + pulse * .18), .36 * r * (1 + pulse * .12), .9);
    parts.tail.rotation.x = idle * .15;
  } else if (type === 'giant-alien') {
    const direction = event.direction < 0 ? -1 : 1;
    rig.scale.set(1 + pulse * .07, 1 - pulse * .09 + idle * .018, 1 + pulse * .06);
    parts.arms.forEach((arm, index) => {
      const wind = flying ? 0 : Math.sin(t * .65 + phase + index * .7) * .075;
      arm.rotation.y = wind + direction * pulse * (index === (direction > 0 ? 3 : 0) ? .42 : .12);
      arm.rotation.z = flying ? Math.sin(index * 2.1) * .16 : wind * .35;
    });
    parts.eyes.forEach((eyeGroup, index) => { eyeGroup.scale.y = 1 + pulse * .18; eyeGroup.rotation.z = idle * .025 * (index - 1); });
    parts.antennae.forEach((tip, index) => { tip.scale.setScalar(.12 * r * (1 + (flying ? 0 : Math.sin(t * 2 + phase + index)) * .07)); });
    parts.mouth.scale.y = .07 * r * (1 + pulse * 1.2);
  } else if (!parts.crumbs) {
    rig.rotation.z = flying ? 0 : idle * .018;
    parts.sectors.forEach((sector, index) => { sector.rotation.z = index * TAU / 6 + pulse * (index % 2 ? -.012 : .012); });
  }
  // dt is accepted by the scene API; absolute elapsed time makes pause, seeking
  // and fixed-step QA deterministic without accumulating a second animation clock.
}
