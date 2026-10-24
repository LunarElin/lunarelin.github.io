import { THREE, createAssetLibrary } from './asset-loader.mjs';
import { BALANCE } from './balance.mjs';
import { BOUNDS, createGame, step, act, serialize, restore, getUpgradeInfo, getStageInfo, getMoneyPiles, getFacilityUpgradeInfo, getWorkerUpgradeInfo, getCustomerQueueSlots, getCustomerEntrySlots, getCustomerBranchPoint, getStationApproach } from './rules.mjs';
import { REGIONS, getRegion, getStations } from './maps.mjs';
import { createMapScenery } from './map-scene.mjs';
import { CAMERA_OFFSET, CAMERA_RIGHT, CAMERA_DOWN, carryHeight, cameraFraming, cameraFocus, battleCamera, followCamera, followBattleCamera } from './camera.mjs';
import { createProductVisuals } from './product-visuals.mjs';
import { createActorMarkers } from './actor-markers.mjs';
import { applyActorAppearance, getActorPalette } from './actor-appearance.mjs';
import { DINING_RULES, getDiningLayout } from './dining.mjs';
import { createDiningVisuals } from './dining-visuals.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { getBattleLayout } from './battlefield.mjs';
import { createBattlefieldVisuals } from './battlefield-visuals.mjs';
import { createCombatRig, updateCombatMotion, disposeCombatMotion, COMBAT_ATTACK_SECONDS } from './combat-motion.mjs';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'runehaven:v1';
const query = new URLSearchParams(location.search);
const qaEnabled = query.has('qa');
const qaScenario = qaEnabled && ['late', 'late-defense', 'defense', 'defeat', 'queues', 'dining'].includes(query.get('scenario')) ? query.get('scenario') : null;
const previewRegion = qaEnabled && query.has('previewRegion') ? Math.max(1, Math.min(10, Math.trunc(Number(query.get('previewRegion'))) || 1)) : null;
const previewCargo = qaEnabled && ['gear', 'potion', 'food', 'mixed'].includes(query.get('previewCargo')) ? query.get('previewCargo') : null;
const controller = new AbortController();
const listen = (target, name, fn, options = {}) => target.addEventListener(name, fn, { ...options, signal: controller.signal });
const number = (n) => Math.floor(Number(n) || 0).toLocaleString('ko-KR');
const statNumber = (n) => Number.isFinite(n) ? Number(n.toFixed(2)) : n;
const compact = (n) => n >= 100000000 ? `${(n / 100000000).toFixed(1)}억` : n >= 10000 ? `${(n / 10000).toFixed(1)}만` : number(n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
let state;
let stored = false;
if (qaScenario) {
  const { buildScenario } = await import('./tests/scenarios.mjs');
  state = buildScenario(qaScenario, previewRegion || 1);
} else if (qaEnabled) {
  state = createGame(42);
} else {
  try { const saved = localStorage.getItem(SAVE_KEY); state = saved ? restore(saved) : null; stored = Boolean(state); } catch { /* Storage can be unavailable in private browsers. */ }
}
state ||= createGame(Math.floor(Math.random() * 0x7fffffff));
if (previewRegion) {
  // Only a visual map fixture, including the optional populated late-shop view.
  state.stage = previewRegion;
  if (!['queues', 'dining'].includes(qaScenario)) Object.assign(state.player, getRegion(state).spawn);
}
if (previewCargo) {
  // Visual capacity fixture, never a normal save or earned progression claim.
  state.player.capacityLevel = 21;
  state.player.bag = previewCargo === 'mixed' ? { gear: 7, potion: 7, food: 8 } : { gear: previewCargo === 'gear' ? 22 : 0, potion: previewCargo === 'potion' ? 22 : 0, food: previewCargo === 'food' ? 22 : 0 };
}
let started = false;
let paused = true;
let disposed = false;
let activeSheet = '';
let resetReturn = 'menu';
let saveFailed = false;
let saveClock = 0;
let uiClock = 0;
let toastTimer = 0;
let frame = 0;
let renderDirty = true;
let lastTime = 0;
let target = null;
let blinkAim = false;
let lastMessage = '';
let lastRaidPhase = state.raid?.phase;
let currentRegionId = '';
let transitionTimer = 0;
const move = { x: 0, z: 0 };
const keys = new Set();
const seenEffects = new Set();
let audioContext;
let sound = true;
let voices = 0;

function clearDestination() { target = null; }
function setDestination(point) {
  target = { x: point.x, z: point.z };
  destination.position.set(point.x, .035, point.z);
}

function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}
function tone(kind = 'tap') {
  if (!sound || voices > 4) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const t = audioContext.currentTime;
    const freq = kind === 'sale' ? 880 : kind === 'magic' ? 600 : kind === 'alarm' ? 180 : 420;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, t);
    oscillator.frequency.exponentialRampToValueAtTime(freq * (kind === 'alarm' ? .7 : 1.45), t + .12);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.045, t + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, t + .19);
    oscillator.connect(gain); gain.connect(audioContext.destination); voices++;
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices--; };
    oscillator.start(t); oscillator.stop(t + .21);
  } catch { /* Audio is optional; gameplay stays available. */ }
}
function save() {
  if (qaEnabled) return;
  try {
    const value = serialize(state);
    localStorage.setItem(SAVE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    if (!saveFailed) toast('이 브라우저에서는 저장이 어려워요. 플레이는 계속할 수 있어요.');
    saveFailed = true;
  }
}
function action(name, payload = {}) {
  tone(name === 'blink' ? 'magic' : 'tap');
  const result = act(state, name, payload);
  if (name === 'blink') cameraSnap = true;
  if (result?.ok === false && result.reason) toast(result.reason);
  else if (result?.message) toast(result.message);
  else if (result?.error) toast(result.error);
  save(); updateHud();
  return result;
}

// A compact, lit diorama. No physics engine or continuous DOM rebuilding.
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  $('renderer-error').hidden = false; $('loading').hidden = true;
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
let mobileRender = false;
let shadowClock = 1;
let animationUpdates = 0;
const viewport = { width: 1, height: 1 };
let cameraFrame;
let battleCameraFrame;
let cameraSnap = true;
const scene = new THREE.Scene();
const shopScene = new THREE.Group(); shopScene.name = 'shop-interior'; scene.add(shopScene);
scene.background = new THREE.Color('#bdcfb2');
const camera = new THREE.OrthographicCamera(-9, 9, 12, -12, .1, 100);
camera.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#fff4d5', '#7b7192', 2.5));
const sunlight = new THREE.DirectionalLight('#fff1d0', 3.1);
sunlight.position.set(-6, 13, 7); sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
Object.assign(sunlight.shadow.camera, { left: -11, right: 11, top: 10, bottom: -10, near: .1, far: 40 });
sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.00015;
sunlight.shadow.radius = 3;
scene.add(sunlight);
const materials = new Map();
const geometries = new Set();
function material(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .88, ...extra }));
  return materials.get(key);
}
const products = createProductVisuals(material);
const actorMarkers = createActorMarkers(material); scene.add(actorMarkers.group);
const markerEntries = [];
function mesh(geometry, color, parent = shopScene, extra = {}) {
  geometries.add(geometry);
  const m = new THREE.Mesh(geometry, material(color, extra));
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function releaseOwnedGeometry(group) {
  group.traverse((node) => {
    if (node.isInstancedMesh) node.dispose();
    if (node.geometry && geometries.has(node.geometry)) {
      node.geometry.dispose(); geometries.delete(node.geometry);
    }
  });
}
function emptyGroup(group) {
  for (const child of [...group.children]) { releaseOwnedGeometry(child); group.remove(child); }
}
function box(w, h, d, color, x = 0, y = 0, z = 0, parent = shopScene) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), color, parent); m.position.set(x, y, z); return m;
}
function cylinder(top, bottom, h, color, x, y, z, parent = shopScene, sides = 12, extra = {}) {
  const m = mesh(new THREE.CylinderGeometry(top, bottom, h, sides), color, parent, extra); m.position.set(x, y, z); return m;
}
function orb(radius, color, x, y, z, parent = shopScene, emissive = false) {
  const m = mesh(new THREE.IcosahedronGeometry(radius, 1), color, parent, emissive ? { emissive: color, emissiveIntensity: .7 } : {});
  m.position.set(x, y, z); m.castShadow = !emissive; return m;
}
function ring(radius, color, x, z, width = .035, parent = shopScene) {
  const m = mesh(new THREE.TorusGeometry(radius, width, 5, 42), color, parent, { emissive: color, emissiveIntensity: .15 });
  m.rotation.x = -Math.PI / 2; m.position.set(x, .025, z); m.castShadow = false; return m;
}
const mapScenery = createMapScenery({ THREE, scene: shopScene, box, cylinder, orb, mesh, ring, emptyGroup, material, geometries });
const battlefieldVisuals = createBattlefieldVisuals(scene);
let sceneLocation = '';
const queueGeometry = new THREE.CircleGeometry(.075, 8); geometries.add(queueGeometry);
const queueMarks = new THREE.InstancedMesh(queueGeometry, material('#795c41', { transparent: true, opacity: .28 }), 36);
queueMarks.receiveShadow = false; shopScene.add(queueMarks);

// A handmade furnace and anvil sit alongside the licensed Kenney furniture.
const forgeGroup = new THREE.Group(); forgeGroup.position.set(-4, 0, -2); shopScene.add(forgeGroup);
box(1.35, .75, 1.2, '#8c6260', -.5, .38, -.3, forgeGroup);
box(1.48, .18, 1.3, '#605569', -.5, .8, -.3, forgeGroup);
box(.82, .44, .06, '#332a3a', -.5, .4, .32, forgeGroup);
const fire = box(.63, .27, .07, '#ffc669', -.5, .37, .36, forgeGroup); fire.material = material('#ffb44e', { emissive: '#ff7733', emissiveIntensity: 1.2 });
box(.85, 1.1, .8, '#8c6260', -.5, 1.15, -.5, forgeGroup);
box(1.03, .17, .97, '#605569', -.5, 1.75, -.5, forgeGroup);
cylinder(.5, .57, .55, '#91633e', .7, .27, .2, forgeGroup, 10);
box(.38, .45, .45, '#5b6377', .7, .7, .2, forgeGroup);
box(1.06, .22, .52, '#9eacb8', .62, 1.02, .2, forgeGroup);
const anvilHorn = mesh(new THREE.ConeGeometry(.24, .5, 4), '#a3b0bb', forgeGroup); anvilHorn.rotation.z = -Math.PI / 2; anvilHorn.position.set(1.3, 1.02, .2);
const forgeLight = new THREE.PointLight('#ff9a4c', 3.5, 5); forgeLight.position.set(-4.5, 1, -1.5); shopScene.add(forgeLight);
const sparks = [];
for (let i = 0; i < 7; i++) sparks.push(orb(.035, '#ffd684', -4.5, 1 + i * .12, -1.7, shopScene, true));

const alchemyGroup = new THREE.Group(); alchemyGroup.position.set(3.4, 0, -2.15); shopScene.add(alchemyGroup);
const innGroup = new THREE.Group(); innGroup.position.set(0, 0, -4.25); shopScene.add(innGroup);
const counterGroup = new THREE.Group(); counterGroup.position.set(-3, 0, 2); shopScene.add(counterGroup);
const potionGroup = new THREE.Group(); potionGroup.position.set(3, 0, 2); shopScene.add(potionGroup);
box(2.25, .65, .8, '#a4734b', 0, .33, 0, counterGroup);
box(2.4, .16, 1, '#d3a36e', 0, .72, 0, counterGroup);
box(1.9, .65, .8, '#729083', 0, .33, 0, potionGroup);
box(2.1, .16, 1, '#b8c4a2', 0, .72, 0, potionGroup);
const supplyRing = ring(1.22, '#f6c16e', -4, -2);
const alchemyRing = ring(1.2, '#8cceb6', 3, -2);
const destination = ring(.35, '#fff0a5', 0, 0, .04, scene); destination.visible = false;
const playerRing = ring(.42, '#e2d7ff', 0, 0, .025, scene);
const stockVisuals = { forge: new THREE.Group(), gear: new THREE.Group(), alchemy: new THREE.Group(), potion: new THREE.Group() };
for (const g of Object.values(stockVisuals)) shopScene.add(g);
const stationLabels = new Map();
const cashVisuals = new Map();
const labelConfig = [
  ['forge', '대장간', -4, -2, 1.6], ['counter', '무기 진열', -3, 2, 1.3],
  ['alchemy', '연금 공방', 3, -2, 1.6], ['potionCounter', '물약 진열', 3, 2, 1.3], ['inn', '별빛 여관', 0, -4, 1.8],
  ['kitchen', '여관 주방', -1.35, -2.85, 1.1], ['meal', '음식 배식대', 1.35, -2.85, 1.1],
  ...Array.from({ length: 4 }, (_, i) => [`table-${i}`, `식탁 ${i + 1} 정리`, 0, 0, .9]),
];
function labelStation(key) {
  if (key === 'kitchen') return getDiningLayout(state).kitchen;
  if (key === 'meal') return getDiningLayout(state).counter;
  if (key.startsWith('table-')) return getDiningLayout(state).tables[Number(key.slice(6))];
  return getStations(state)[key];
}
function stationDestination(key) {
  const station = labelStation(key);
  if (key === 'kitchen') return getDiningLayout(state).kitchenPoint;
  if (key === 'meal') return getDiningLayout(state).counterPoint;
  if (key.startsWith('table-')) return station.cleanPoint;
  return getStationApproach(state, key);
}
const stationIcons = {
  forge: '<path d="M4 4h11v6H4zM10 10v11" fill="#b4c9ce"/><path d="M3 19h16l-3 3H6z" fill="#96704d"/>',
  counter: '<path d="M12 2l3 4-3 10-3-10z" fill="#b8d4dd"/><path d="M6 16h12M12 16v6" stroke="#b88a43" stroke-width="3"/>',
  alchemy: '<path d="M4 11h16l-2 10H6z" fill="#65aa8d"/><path d="M3 11h18M7 21v2M17 21v2"/><circle cx="9" cy="6" r="2" fill="#b9e3ac"/><circle cx="16" cy="3" r="1.5" fill="#b9e3ac"/>',
  potionCounter: '<path d="M9 3h6v7l5 6v6H4v-6l5-6z" fill="#88c6ba"/><path d="M8 3h8M7 16h10" stroke="#ae8d54" stroke-width="3"/>',
  inn: '<path d="M3 5v17M21 11v11M3 17h18M3 11h18v6H3z" fill="#a48dbb"/><path d="M6 9h5v4H6z" fill="#ffefc9"/>',
  meal: '<path d="M3 11h18c-1 8-4 10-9 10S4 19 3 11z" fill="#bc8457"/><path d="M3 11h18M8 3c-3 3 3 3 0 6M15 2c-3 3 3 3 0 6" stroke="#d67a3e" stroke-width="2"/>',
  kitchen: '<path d="M4 10h16l-2 10H6z" fill="#6c7569"/><path d="M2 10h20M8 3c-3 2 3 3 0 5M15 2c-3 3 3 3 0 6" stroke="#e7b467" stroke-width="2"/>',
  table: '<path d="M5 20L16 4l4 3L9 23z" fill="#a77a4a"/><path d="M2 18l5-3 6 5-1 3H3z" fill="#e7d8b3"/><path d="M3 4h5M5 2v5" stroke="#bd84c5" stroke-width="2"/>',
};
for (const [key, text, x, z, y] of labelConfig) {
  const el = document.createElement('button'); el.className = 'station-label';
  el.dataset.symbol = key.startsWith('table-') ? '✦' : { forge: '⚒', counter: '⚔', alchemy: '⚗', potionCounter: '◈', inn: '☾', kitchen: '♨', meal: '🍲' }[key];
  el.innerHTML = `<svg class="station-symbol" viewBox="0 0 24 24" aria-hidden="true" stroke="#6a5343" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${stationIcons[key] || stationIcons.table}</svg><strong>${key.startsWith('table-') ? '식탁 정리' : text}</strong><small></small>`; $('station-labels').append(el);
  el.setAttribute('aria-label', key.startsWith('table-') ? text : `${text}(으)로 이동`);
  listen(el, 'click', () => {
    if (paused || !started) return;
    setDestination(stationDestination(key));
    blinkAim = false;
    toast(key.startsWith('table-') ? '식탁 옆에 멈추면 정리해요' : `${text} ${['counter', 'potionCounter', 'meal'].includes(key) ? '뒤로' : '앞으로'} 이동`);
  });
  stationLabels.set(key, { el, point: new THREE.Vector3(x, y, z), text, height: y });
}

for (const [kind, name] of [['gear', '무기 대금'], ['potion', '물약 대금'], ['inn', '식사 대금']]) {
  const group = new THREE.Group(); shopScene.add(group);
  const el = document.createElement('button'); el.className = 'cash-label'; el.hidden = true;
  $('station-labels').append(el);
  listen(el, 'click', () => { if (paused || !started) return; const pile = getMoneyPiles(state).find((p) => p.kind === kind); if (pile) { setDestination(pile); blinkAim = false; } });
  cashVisuals.set(kind, { group, el, name, amount: -1 });
}

const actors = new Map();
const classGear = new Map();
const classGeometries = new Set();
const temporary = [];
let library;
let diningVisuals;
const actorPalette = { player: '#8354a7', warrior: '#b86951', archer: '#4c9373', mage: '#7763b7', staff: '#daac58', orc: '#82a269', soldier: '#a34d61' };
function basicActor(kind, group, color) {
  const base = new THREE.Group(); group.add(base);
  cylinder(.23, .33, .62, color, 0, .52, 0, base, 8);
  orb(.22, kind === 'orc' ? '#91ae70' : '#e6bd91', 0, .99, 0, base);
  box(.16, .25, .2, '#5b4b47', -.13, .15, 0, base); box(.16, .25, .2, '#5b4b47', .13, .15, 0, base);
  return base;
}
function addClassGear(root, kind, role, appearance, combat = false) {
  const key = `${appearance.key}:${kind}:${role}:${combat}`;
  if (classGear.has(key)) {
    const copy = classGear.get(key).clone(); root.add(copy); return copy;
  }
  const group = new THREE.Group(); root.add(group);
  if (kind !== 'orc') {
    // Keep each role readable even when the shared human model is very small.
    cylinder(.24, .29, .35, appearance.body, 0, .64, .025, group, 8);
    box(.41, .44, .055, appearance.body, 0, .65, -.23, group);
  }
  if (kind === 'player' || kind === 'mage') {
    const hat = mesh(new THREE.ConeGeometry(.3, .6, 7), appearance.body, group); hat.position.set(0, 1.45, 0);
    cylinder(.35, .35, .05, appearance.trim, 0, 1.15, 0, group);
    if (!combat) {
      cylinder(.035, .035, 1.1, '#8b6844', .4, .7, .05, group, 6);
      orb(.11, '#a8f0d4', .4, 1.3, .05, group, true);
    }
  } else if (kind === 'archer' || role === 'ranged') {
    if (!combat) {
      const bow = mesh(new THREE.TorusGeometry(.28, .025, 4, 12, Math.PI), '#cda364', group);
      bow.position.set(.39, .68, .12); bow.rotation.z = -Math.PI / 2;
      box(.03, .55, .03, '#eee3c3', .39, .68, .12, group);
    }
    const feather = mesh(new THREE.ConeGeometry(.07, .38, 4), '#e1d2a6', group); feather.position.set(-.12, 1.37, -.06); feather.rotation.z = .4;
  } else if (kind === 'warrior' || kind === 'soldier') {
    if (!combat) {
      box(.09, .65, .05, '#cbd3d6', .38, .7, .12, group);
      box(.27, .06, .07, '#d0ae56', .38, .4, .12, group);
    }
    cylinder(.2, .2, .05, kind === 'soldier' ? '#a54d60' : '#b8a683', -.32, .67, .12, group, 8).rotation.x = Math.PI / 2;
  }
  if (role === 'elite') {
    cylinder(.3, .36, .43, '#6b3e54', 0, .68, 0, group, 8);
    cylinder(.28, .31, .25, '#71495c', 0, 1.22, 0, group, 8);
    for (const x of [-.24, .24]) {
      const horn = mesh(new THREE.ConeGeometry(.09, .32, 5), '#e8c376', group);
      horn.position.set(x, 1.45, 0); horn.rotation.z = -Math.sign(x) * .4;
    }
    box(.48, .08, .1, '#d7b163', 0, .81, .28, group);
  } else if (role === 'raider') {
    if (!combat) {
      cylinder(.035, .035, .85, '#654b39', .4, .65, .08, group, 6);
      box(.31, .26, .07, '#bfc8c7', .4, .99, .08, group);
    }
    box(.5, .13, .36, '#995954', 0, .85, 0, group);
  }
  // Class accessories are rigid: bake their transforms and colors into one
  // shared mesh per role, retaining the glowing staff tip as a separate mesh.
  const parts = [], removed = [];
  for (const node of group.children) {
    if (!node.isMesh || node.material.emissiveIntensity > 0 && node.material.emissive.getHex() !== 0) continue;
    node.updateMatrix();
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrix);
    const colors = new Float32Array(geometry.attributes.position.count * 3), color = node.material.color;
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry); removed.push(node);
  }
  if (parts.length) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (geometry) {
      for (const node of removed) { releaseOwnedGeometry(node); group.remove(node); }
      group.add(new THREE.Mesh(geometry, material('#ffffff', { vertexColors: true })));
    }
  }
  group.traverse((node) => { if (node.geometry) { geometries.delete(node.geometry); classGeometries.add(node.geometry); } });
  classGear.set(key, group.clone());
  return group;
}
function createActor(id, kind, role = '') {
  const root = new THREE.Group(); scene.add(root);
  const appearance = getActorPalette({ id, kind });
  const body = basicActor(kind, root, appearance.body);
  const combat = id.startsWith('d-') || id.startsWith('e-');
  const gear = addClassGear(root, kind, role, appearance, combat);
  gear.traverse((node) => { node.castShadow = false; });
  const carry = new THREE.Group(); carry.position.set(0, 1.8, .14); root.add(carry);
  const marker = { visible: true, x: 0, z: 0, scale: 1, healthVisible: false, healthRatio: 1, enemy: id.startsWith('e-'), ringVisible: false, ringRadius: role === 'elite' ? .46 : .32, ringColor: role === 'elite' ? '#ff9969' : id.startsWith('e-') ? '#d97674' : actorPalette[kind] || '#90cf96' };
  const upper = new THREE.Group(), food = new THREE.Group(); carry.add(upper, food);
  const actor = { id, kind, appearance, root, body, gear, carry, upper, food, marker, animationClock: 0, x: 0, z: 0, angle: 0, mixer: null, animations: null, currentAnimation: '', count: -1, ready: false };
  actors.set(id, actor);
  if (combat) createCombatRig(actor, kind, role, appearance);
  if (library) {
    library.load(kind === 'orc' ? 'orc' : 'human', { height: 1.3 }).then(({ object, animations }) => {
      if (actors.get(id) !== actor || disposed) return;
      applyActorAppearance(object, { id, kind });
      releaseOwnedGeometry(body); root.remove(body); root.add(object); actor.body = object;
      actor.mixer = new THREE.AnimationMixer(object); actor.animations = animations;
      if (combat) createCombatRig(actor, kind, role, appearance);
      actor.ready = true;
      renderDirty = true;
    }).catch(() => { /* Procedural character remains usable if an optional model fails. */ });
  }
  return actor;
}
function removeActor(actor) {
  actor.mixer?.stopAllAction();
  scene.remove(actor.root);
  releaseOwnedGeometry(actor.root);
  const skeletons = new Set();
  actor.root.traverse((node) => { if (node.skeleton && !skeletons.has(node.skeleton)) { skeletons.add(node.skeleton); node.skeleton.dispose(); } });
  // Actor clones own materials, but share source geometry and texture buffers.
  actor.root.traverse((node) => { if (node.isMesh && node.material && ![...materials.values()].includes(node.material)) {
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (!m.userData.diningShared && !m.userData.combatShared) m.dispose();
  } });
  actors.delete(actor.id);
}
function animation(actor, name, serial = 0) {
  if (!actor.mixer || actor.currentAnimation === name && actor.animationSerial === serial) return;
  const clip = actor.animations.find((a) => a.name === name) || actor.animations.find((a) => a.name === 'idle');
  if (!clip) return;
  const next = actor.mixer.clipAction(clip).reset();
  next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
  const attack = ['attack-melee-right', 'holding-right-shoot', 'interact-right'].includes(name) && serial > 0;
  next.setLoop(attack ? THREE.LoopOnce : THREE.LoopRepeat, attack ? 1 : Infinity);
  next.clampWhenFinished = attack;
  if (attack) next.setDuration(COMBAT_ATTACK_SECONDS);
  next.play();
  if (actor.action && actor.action !== next) actor.action.crossFadeTo(next, .07, false);
  actor.action = next; actor.currentAnimation = name; actor.animationSerial = serial;
}
function productInstances(parent, count, product, columns = 1, spacing = .17) {
  products.set(parent, count, product, columns, spacing);
}
function drawCarry(actor, bag) {
  const gear = Math.min(44, bag.gear || 0), potion = Math.min(44, bag.potion || 0), food = Math.min(44, bag.food || 0);
  const key = `${gear}-${potion}-${food}`;
  if (actor.count === key) return;
  actor.count = key;
  productInstances(actor.carry, gear, 'gear');
  actor.upper.position.y = gear * .17;
  productInstances(actor.upper, potion, 'potion', 1, .31);
  actor.food.position.y = gear * .17 + potion * .31;
  diningVisuals?.setFoodStack(actor.food, food);
}
function updateActor(data, id, kind, dt, battle = false) {
  let actor = actors.get(id);
  if (!actor) actor = createActor(id, kind, data.role || '');
  const customer = id.startsWith('c-');
  const scale = customer ? .72 : id.startsWith('s-') ? .92 : id.startsWith('d-') ? .9 : id.startsWith('e-') ? (data.role === 'elite' ? 1.22 : data.role === 'ranged' || data.role === 'raider' ? .9 : .95) : 1;
  actor.root.scale.setScalar(scale);
  const x = Number(data.x) || 0, z = Number(data.z) || 0;
  const dx = x - actor.x, dz = z - actor.z;
  const moving = dx * dx + dz * dz > .00002;
  const eating = customer && data.phase === 'eating';
  if (eating) actor.angle = Math.PI;
  else if (moving) actor.angle = Math.atan2(dx, dz);
  // The source sit clip lowers the small customer's feet .132 below ground.
  actor.root.position.set(x, eating ? .14 : 0, z); actor.root.rotation.y = actor.angle;
  actor.x = x; actor.z = z;
  actor.gear.visible = !eating;
  const feet = projectXYZ(x, 0, z), head = projectXYZ(x, carryHeight(data.bag) * scale, z);
  const sheltering = state.raid.location === 'outside' && (customer || id.startsWith('s-'));
  actor.root.visible = !sheltering && feet.x > -70 && feet.x < viewport.width + 70 && head.y < viewport.height + 80 && feet.y > -80;
  const combatMotion = actor.combatRig ? updateCombatMotion(actor, data, { time: state.time, dt, moving, battle }) : null;
  if (actor.ready && actor.root.visible) animation(actor, combatMotion?.clip || (eating ? 'sit' : moving ? 'walk' : data.workKind ? 'interact-right' : 'idle'), combatMotion?.attacking ? combatMotion.attackSerial : 0);
  else if (!actor.ready) actor.body.rotation.z = moving ? Math.sin(state.time * 15 + x) * .055 : 0;
  actor.animationClock += dt;
  if (actor.mixer && actor.root.visible && (kind === 'player' || actor.animationClock >= (mobileRender ? 1 / (customer ? 15 : 30) : 1 / 60))) {
    actor.mixer.update(Math.min(.1, actor.animationClock)); actor.animationClock = 0; animationUpdates++;
  }
  const marker = actor.marker;
  marker.visible = actor.root.visible; marker.x = x; marker.z = z; marker.scale = scale;
  marker.healthVisible = battle && Number.isFinite(data.hp);
  marker.healthRatio = Math.max(0, data.hp / (data.maxHp || data.hp || 1));
  marker.ringVisible = battle || kind === 'player' || kind === 'staff';
  const bag = data.bag;
  actor.carry.visible = state.raid.location !== 'outside';
  if (bag) { drawCarry(actor, bag); actor.carry.rotation.z = moving ? Math.sin(state.time * 7) * .045 : Math.sin(state.time * 2) * .012; }
  diningVisuals?.setGuestMeal(actor, customer && Boolean(data.meal) && !eating);
  return actor;
}

async function place(key, parent, x, z, height, rotation = 0) {
  const { object } = await library.load(key, { height });
  object.position.set(x, 0, z); object.rotation.y = rotation; parent.add(object); return object;
}
async function populate() {
  library = await createAssetLibrary();
  await library.preload(Object.keys(library.manifest.models));
  await Promise.all([
    place('table', alchemyGroup, 0, -.2, .73), place('cauldron', alchemyGroup, -.25, .1, .85),
    place('potion', alchemyGroup, .6, .1, .6), place('bookshelf', shopScene, 7.9, -7.3, 1.8, -.12),
    place('barrel', shopScene, -8.2, -7.3, .85), place('barrel', shopScene, -7.5, -7.3, .7),
    place('bed', innGroup, 0, -.65, .9, Math.PI / 2), place('chair', innGroup, 0, .45, .75),
    place('chest', shopScene, 7.9, -.1, .65, -.3), place('marketStall', counterGroup, 0, 0, 1.4),
    place('sword', forgeGroup, 1.2, .3, 1.1, 1.8), place('shield', shopScene, -8.5, -1.2, .8, .9),
    place('coin', counterGroup, .7, .2, .25), place('lantern', shopScene, -8.6, -6.6, 1.5),
    place('lantern', shopScene, 8.6, -6.6, 1.5),
  ]);
  diningVisuals = await createDiningVisuals(shopScene, library);
  // Small products are raised to the tables after ground-normalized loading.
  for (const g of [alchemyGroup, counterGroup]) for (const child of g.children) {
    if (['asset-potion', 'asset-coin', 'asset-cauldron'].includes(child.name)) child.position.y += .75;
  }
  // Actual shopkeeper model is animated; moving customers use the same shared source.
  createActor('player', 'player');
}

const vector = new THREE.Vector3();
function project(point) {
  vector.copy(point).project(camera);
  return { x: (vector.x + 1) * viewport.width / 2, y: (1 - vector.y) * viewport.height / 2 };
}
function projectXYZ(x, y, z) { vector.set(x, y, z); return project(vector); }
function positionLabels() {
  if (state.raid.location === 'outside' || state.raid.phase === 'departure') {
    for (const { el } of stationLabels.values()) el.hidden = true;
    for (const { el } of cashVisuals.values()) el.hidden = true;
    return;
  }
  const width = viewport.width, height = viewport.height, short = mobileRender || height < 430;
  const labels = [];
  for (const [key, { el, point, height: labelHeight }] of stationLabels) {
    const side = key === 'counter' ? -1.3 : key === 'potionCounter' ? 1.3 : 0;
    const station = labelStation(key);
    point.set(station.x + side, key === 'inn' ? 1.6 : short ? labelHeight : .04, station.z + (key === 'inn' ? -.2 : short ? 0 : .95));
    const entry = stationLabels.get(key);
    el.hidden = Boolean(entry.unavailable);
    if (el.hidden) continue;
    const p = project(point), w = entry.width || (short ? 52 : 104), h = entry.heightPx || 52, anchor = short ? h * .55 : 0;
    const x = Math.max(w / 2 + 6, Math.min(width - w / 2 - 6, p.x));
    const y = Math.max(8, Math.min(height - 126 - h, p.y - anchor));
    el.classList.toggle('offscreen', Math.abs(p.x - x) > w || Math.abs(p.y - y - anchor) > h);
    labels.push({ el, w, h, anchor, x, y, avoidActor: key.startsWith('table-') || key === 'kitchen' || key === 'meal' });
  }
  // Money has its own physical pickup targets; keep work buttons clear of them.
  const placed = [...cashVisuals.values()].filter(({ el }) => !el.hidden).map(({ el }) => ({
    x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) - 22, w: 44, h: 44,
  }));
  const head = projectXYZ(state.player.x, carryHeight(state.player.bag), state.player.z);
  const feet = projectXYZ(state.player.x, .1, state.player.z);
  for (const label of labels.sort((a, b) => Number(b.avoidActor) - Number(a.avoidActor) || a.y - b.y)) {
    const candidates = [[0, 0], [0, -label.h - 7], [0, label.h + 7], [-label.w / 2 - 10, 0], [label.w / 2 + 10, 0], [0, -2 * label.h - 14]];
    for (const row of [0, -1, 1, -2, 2]) for (const column of [-1, 1, -2, 2]) {
      candidates.push([column * (label.w + 7), row * (label.h + 7)]);
    }
    // A compact screen grid also covers the fragmented space on 320px phones.
    // Local offsets alone can exhaust their options around the inn tables.
    for (let y = 8; y <= height - 126 - label.h; y += label.h + 4) {
      for (let x = label.w / 2 + 4; x <= width - label.w / 2 - 4; x += label.w + 4) candidates.push([x - label.x, y - label.y]);
    }
    let chosen;
    for (const [dx, dy] of candidates) {
      const x = Math.max(label.w / 2 + 4, Math.min(width - label.w / 2 - 4, label.x + dx));
      const y = Math.max(8, Math.min(height - 126 - label.h, label.y + dy));
      if (label.avoidActor && x + label.w / 2 > head.x - 28 && x - label.w / 2 < head.x + 28 && y + label.h > head.y - 8 && y < feet.y + 5) continue;
      if (placed.every((other) => x + label.w / 2 + 4 <= other.x - other.w / 2 || x - label.w / 2 - 4 >= other.x + other.w / 2 || y + label.h + 4 <= other.y || y - 4 >= other.y + other.h)) { chosen = { x, y }; break; }
    }
    Object.assign(label, chosen || { x: label.x, y: label.y }); placed.push(label);
    label.el.style.left = `${label.x}px`; label.el.style.top = `${label.y + label.anchor}px`;
    // Keep the physical cargo readable when its screen silhouette crosses a sign.
    if (!label.avoidActor && label.x + label.w / 2 > head.x - 28 && label.x - label.w / 2 < head.x + 28 && label.y + label.h > head.y - 8 && label.y < feet.y + 5) label.el.hidden = true;
  }
}
function updateCamera(dt) {
  let framing = cameraFraming(viewport.width, viewport.height, state.player.bag);
  let focus = cameraFocus(state.player, framing, viewport.width, viewport.height, state.player.bag, BOUNDS);
  if (state.raid.location === 'outside') {
    const battle = battleCamera(viewport.width, viewport.height, state.raid.defenders, state.raid.enemies, state.time, battleCameraFrame);
    framing = battle.framing; focus = battle.focus;
    cameraFrame = followBattleCamera(battleCameraFrame, focus, framing, dt, cameraSnap);
    battleCameraFrame = cameraFrame;
  } else {
    battleCameraFrame = null;
    cameraFrame = followCamera(cameraFrame, focus, framing, dt, cameraSnap);
  }
  cameraSnap = false;
  const aspect = viewport.width / viewport.height, span = cameraFrame.span;
  camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
  camera.top = span / 2; camera.bottom = -span / 2;
  camera.updateProjectionMatrix();
  camera.position.set(cameraFrame.x + CAMERA_OFFSET.x, cameraFrame.focusY + CAMERA_OFFSET.y, cameraFrame.z + CAMERA_OFFSET.z);
  camera.lookAt(cameraFrame.x, cameraFrame.focusY, cameraFrame.z);
  camera.updateMatrixWorld();
}
function resize() {
  const rect = $('world').getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  viewport.width = rect.width; viewport.height = rect.height;
  mobileRender = rect.width < 760 || matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileRender ? 1.25 : 1.6));
  renderer.setSize(rect.width, rect.height, false);
  const shadowSize = mobileRender ? 512 : 1024;
  if (sunlight.shadow.mapSize.x !== shadowSize) {
    sunlight.shadow.map?.dispose(); sunlight.shadow.map = null;
    sunlight.shadow.mapSize.set(shadowSize, shadowSize);
  }
  renderer.shadowMap.needsUpdate = true;
  cameraSnap = true; updateCamera(0);
  for (const entry of stationLabels.values()) {
    entry.el.classList.toggle('short-label', mobileRender || rect.height < 430);
    entry.width = entry.el.offsetWidth; entry.heightPx = entry.el.offsetHeight;
  }
  positionLabels();
  renderDirty = true;
}
const resizeObserver = new ResizeObserver(resize); resizeObserver.observe($('world'));
listen(window.visualViewport || window, 'resize', resize);

function setStockVisual(group, amount, x, z, potion) {
  const count = Math.min(60, Math.max(0, Math.floor(amount || 0)));
  group.position.set(x, .88, z);
  if (group.userData.count === count) return;
  group.userData.count = count;
  const columns = group === stockVisuals.gear || group === stockVisuals.potion ? 4 : 3;
  productInstances(group, count, potion ? 'potion' : 'gear', columns, potion ? .31 : .17);
}

function syncRegion() {
  const region = getRegion(state);
  if (currentRegionId === region.id) return;
  const previous = currentRegionId; currentRegionId = region.id;
  cameraSnap = true; shadowClock = 1; sceneLocation = '';
  stopInput(); blinkAim = false;
  mapScenery.apply(region);
  const stations = region.stations;
  const queueMatrix = new THREE.Matrix4(), queueRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const queuePoints = [...getCustomerEntrySlots(state), ...getCustomerQueueSlots(state, 'gear'), ...getCustomerQueueSlots(state, 'potion')];
  queuePoints.forEach((point, index) => {
    queueMatrix.compose(new THREE.Vector3(point.x, .145, point.z), queueRotation, new THREE.Vector3(.7, 1, 1));
    queueMarks.setMatrixAt(index, queueMatrix);
  });
  queueMarks.count = queuePoints.length; queueMarks.instanceMatrix.needsUpdate = true; queueMarks.computeBoundingSphere();
  for (const [key, group] of [['forge', forgeGroup], ['alchemy', alchemyGroup], ['inn', innGroup], ['counter', counterGroup], ['potionCounter', potionGroup]]) group.position.set(stations[key].x, 0, stations[key].z);
  supplyRing.position.set(stations.forge.x, .025, stations.forge.z + .8);
  alchemyRing.position.set(stations.alchemy.x, .025, stations.alchemy.z + .8);
  forgeLight.position.set(stations.forge.x - .5, 1, stations.forge.z + .5);
  for (const [key, label] of stationLabels) {
    const station = labelStation(key);
    const side = key === 'counter' ? -1.3 : key === 'potionCounter' ? 1.3 : 0;
    label.point.set(station.x + side, key === 'inn' ? 1.6 : .04, station.z + (key === 'inn' ? -.2 : .95));
  }
  positionLabels(); renderDirty = true;
  for (const flight of flights.splice(0)) { scene.remove(flight.node); releaseOwnedGeometry(flight.node); }
  if (previous !== '') {
    clearTimeout(transitionTimer); $('region-banner').querySelector('strong').textContent = region.name;
    $('region-banner').hidden = false;
    transitionTimer = setTimeout(() => { $('region-banner').hidden = true; }, 2600);
  }
}

function updateCashVisuals() {
  for (const pile of getMoneyPiles(state)) {
    const visual = cashVisuals.get(pile.kind); if (!visual) continue;
    visual.group.position.set(pile.x, .08, pile.z);
    const count = pile.amount ? Math.min(30, Math.max(6, Math.ceil(pile.amount / 50))) : 0;
    if (visual.group.userData.count !== count) {
      emptyGroup(visual.group); visual.group.userData.count = count;
      if (count) {
        const geometry = new THREE.CylinderGeometry(.18, .18, .1, 8); geometries.add(geometry);
        const coins = new THREE.InstancedMesh(geometry, material('#ffd36d', { emissive: '#da9d25', emissiveIntensity: .25 }), count); coins.castShadow = true;
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          const x = (i % 3 - 1) * .29, z = Math.floor(i / 3) % 2 * .27, y = Math.floor(i / 6) * .11;
          matrix.makeTranslation(x, y, z); coins.setMatrixAt(i, matrix);
        }
        visual.group.add(coins);
        ring(.7, '#fbd579', 0, 0, .045, visual.group);
      }
    }
    const p = projectXYZ(pile.x, .3, pile.z);
    visual.el.style.left = `${p.x}px`; visual.el.style.top = `${p.y}px`;
    visual.el.hidden = state.raid.location === 'outside' || state.raid.phase === 'departure' || !pile.amount || p.x < 0 || p.x > viewport.width || p.y < 0 || p.y > viewport.height - 120;
    if (visual.amount !== pile.amount) {
      visual.amount = pile.amount;
      visual.el.setAttribute('aria-label', `${visual.name} ${number(pile.amount)} 골드 줍기`);
    }
  }
}

const flights = [];
function flyAttack(effect) {
  if (!effect.from || !effect.to || flights.length > 35) return;
  const node = new THREE.Group();
  if (effect.type === 'arrow') box(.055, .055, .42, effect.team === 'enemy' ? '#ef9986' : '#e5dfa8', 0, 0, 0, node);
  else orb(.11, effect.team === 'enemy' ? '#ef8b91' : '#ccadff', 0, 0, 0, node, true);
  const from = { ...effect.from, y: 1.15 }, to = { ...effect.to, y: .65 };
  node.position.set(from.x, from.y, from.z); node.lookAt(to.x, to.y, to.z); scene.add(node);
  flights.push({ node, from, to, age: 0, duration: .24, arc: .12 });
}
function flyProduct(effect) {
  if (flights.length > 35) return;
  const node = new THREE.Group();
  if (effect.type === 'cash-collect') cylinder(.14, .14, .08, '#ffe18c', 0, 0, 0, node, 8);
  else if (effect.product === 'food') diningVisuals?.setFoodStack(node, 1);
  else productInstances(node, 1, effect.product || 'gear');
  const actor = effect.actorId === 'player' || !effect.actorId ? state.player : state.staff.find((h) => h.id === effect.actorId);
  const head = { x: actor?.x ?? state.player.x, y: (carryHeight(actor?.bag || state.player.bag) - .2) * (effect.actorId && effect.actorId !== 'player' ? .92 : 1), z: actor?.z ?? state.player.z };
  const station = { x: effect.x, y: 1.02, z: effect.z };
  const from = effect.type === 'collect' || effect.type === 'cash-collect' ? { ...station, ...(effect.from || {}) } : head;
  const to = effect.type === 'deposit' ? { ...station, ...(effect.to || {}) } : head;
  if (effect.type === 'cash-collect') from.y = .2;
  node.position.set(from.x, from.y, from.z); scene.add(node);
  flights.push({ node, from, to, age: 0, duration: .32 });
}
function burst(x, z, color = '#ffdb8a', count = 8) {
  if (temporary.length > 75) return;
  for (let i = 0; i < count; i++) {
    const node = orb(.055, color, x, .4, z, scene, true);
    temporary.push({ node, age: 0, vx: Math.sin(i * 2.4) * .7, vz: Math.cos(i * 2.4) * .7 });
  }
}
const floatingTexts = [];
function floatText(text, x, z) {
  if (floatingTexts.length >= 12) floatingTexts.shift().el.remove();
  const el = document.createElement('span'); el.className = 'floater'; el.textContent = text;
  $('floaters').append(el); floatingTexts.push({ el, x, z, age: 0 });
}
const renderSamples = [];
function visuals(dt) {
  syncRegion();
  const outside = state.raid.location === 'outside';
  if (sceneLocation !== (outside ? 'outside' : 'shop')) {
    sceneLocation = outside ? 'outside' : 'shop'; cameraSnap = true; shadowClock = 1;
    stopInput();
    for (const flight of flights.splice(0)) { scene.remove(flight.node); releaseOwnedGeometry(flight.node); }
    scene.background.set(outside ? getBattleLayout(state).background : getRegion(state).groundColor);
  }
  shopScene.visible = !outside;
  battlefieldVisuals.update(state, outside);
  const departure = state.raid.phase === 'departure';
  $('battle-transition').hidden = !departure;
  if (departure) $('battle-transition').style.opacity = String(Math.max(0, Math.min(1, (2.2 - state.raid.timer) / .35, state.raid.timer / .55)));
  updateCamera(dt); animationUpdates = 0;
  const stations = getStations(state);
  queueMarks.visible = !outside;
  const present = new Set(['player']);
  updateActor(state.player, 'player', 'player', dt);
  playerRing.position.set(state.player.x, .025, state.player.z);
  for (const c of state.customers || []) { const id = `c-${c.id}`; present.add(id); updateActor(c, id, c.kind || 'warrior', dt); }
  for (const s of state.staff || []) { const id = `s-${s.id}`; present.add(id); updateActor(s, id, 'staff', dt); }
  for (const d of state.raid?.defenders || []) {
    if (d.hp <= 0) continue;
    const id = `d-${d.id}`; present.add(id); updateActor(d, id, d.kind || 'warrior', dt, state.raid.phase === 'battle');
  }
  for (const e of state.raid?.enemies || []) {
    if (e.hp <= 0) continue;
    const id = `e-${e.id}`; present.add(id); updateActor(e, id, state.raid.kind === 'army' ? 'soldier' : 'orc', dt, state.raid.phase === 'battle');
  }
  for (const actor of actors.values()) if (!present.has(actor.id)) removeActor(actor);
  markerEntries.length = 0;
  for (const actor of actors.values()) markerEntries.push(actor.marker);
  actorMarkers.update(markerEntries);
  alchemyGroup.visible = Boolean(state.unlocks.alchemy); innGroup.visible = Boolean(state.unlocks.inn); potionGroup.visible = Boolean(state.unlocks.alchemy);
  alchemyRing.visible = state.unlocks.alchemy;
  diningVisuals?.update(state);
  setStockVisual(stockVisuals.forge, state.stocks.forge, stations.forge.x + .8, stations.forge.z + .6, false);
  setStockVisual(stockVisuals.gear, state.stocks.gear, stations.counter.x, stations.counter.z, false);
  setStockVisual(stockVisuals.alchemy, state.unlocks.alchemy ? state.stocks.alchemy : 0, stations.alchemy.x, stations.alchemy.z, true);
  setStockVisual(stockVisuals.potion, state.unlocks.alchemy ? state.stocks.potion : 0, stations.potionCounter.x, stations.potionCounter.z, true);
  updateCashVisuals();
  destination.visible = Boolean(target) || blinkAim;
  if (target) destination.position.set(target.x, .035, target.z);
  destination.rotation.z += dt * .8;
  fire.scale.y = 1 + Math.sin(state.time * 8) * .12; forgeLight.intensity = 3.5 + Math.sin(state.time * 7) * .4;
  for (let i = 0; i < sparks.length; i++) {
    const a = (state.time * .65 + i / sparks.length) % 1;
    sparks[i].position.set(stations.forge.x - .5 + Math.sin(a * 6 + i) * .15, .8 + a * 1.25, stations.forge.z + .3); sparks[i].scale.setScalar(1 - a * .8);
  }
  supplyRing.scale.setScalar(1 + Math.sin(state.time * 2) * .025);
  for (let i = flights.length - 1; i >= 0; i--) {
    const flight = flights[i]; flight.age += dt;
    const t = Math.min(1, flight.age / flight.duration), curve = Math.sin(t * Math.PI) * (flight.arc ?? .7);
    flight.node.position.set(THREE.MathUtils.lerp(flight.from.x, flight.to.x, t), THREE.MathUtils.lerp(flight.from.y, flight.to.y, t) + curve, THREE.MathUtils.lerp(flight.from.z, flight.to.z, t));
    if (t === 1) { scene.remove(flight.node); releaseOwnedGeometry(flight.node); flights.splice(i, 1); }
  }
  for (let i = temporary.length - 1; i >= 0; i--) {
    const p = temporary[i]; p.age += dt;
    p.node.position.x += p.vx * dt; p.node.position.z += p.vz * dt; p.node.position.y += dt * .9;
    p.node.scale.setScalar(Math.max(.01, 1 - p.age));
    if (p.age > 1) { scene.remove(p.node); p.node.geometry.dispose(); geometries.delete(p.node.geometry); temporary.splice(i, 1); }
  }
  for (const effect of state.effects || []) {
    if (seenEffects.has(effect.id)) continue; seenEffects.add(effect.id);
    if (seenEffects.size > 250) seenEffects.delete(seenEffects.values().next().value);
    if (effect.type === 'collect' || effect.type === 'deposit') flyProduct(effect);
    else if (effect.type === 'cash-collect') {
      flyProduct(effect); floatText(`+${compact(effect.amount || 0)} 골드`, state.player.x, state.player.z); tone('sale');
      $('gold').animate([{ transform: 'scale(1.16)', color: '#ffffff' }, { transform: 'scale(1)', color: '#ffdc7a' }], { duration: 320 });
    } else if (effect.type === 'table-clean') {
      burst(effect.x, effect.z, '#cfb2eb', 5); tone();
    } else if (effect.type === 'sale' || effect.type === 'income' || effect.type === 'inn') {
      floatText(`대금 +${compact(effect.amount || 0)}`, effect.x ?? -3, effect.z ?? 2);
      burst(effect.x ?? -3, effect.z ?? 2, '#f5d170', 4);
    } else if (effect.type === 'arrow' || effect.type === 'magic') { flyAttack(effect); burst(effect.x ?? 0, effect.z ?? 4, effect.team === 'enemy' ? '#ef9986' : effect.type === 'magic' ? '#cfb7ff' : '#afe7c1', 3); }
    else if (['blink', 'upgrade'].includes(effect.type)) burst(effect.x ?? state.player.x, effect.z ?? state.player.z, '#d0b7ff', 10);
    else if (['hit', 'damage'].includes(effect.type)) burst(effect.x ?? 0, effect.z ?? 4, '#edb07a', 3);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const text = floatingTexts[i]; text.age += dt;
    if (text.age > 1.05) { text.el.remove(); floatingTexts.splice(i, 1); continue; }
    const p = projectXYZ(text.x, 1.5, text.z);
    text.el.style.left = `${p.x}px`; text.el.style.top = `${p.y}px`;
  }
  positionLabels();
  shadowClock += dt;
  if (shadowClock >= (mobileRender ? 1 / 30 : 1 / 60)) { renderer.shadowMap.needsUpdate = true; shadowClock = 0; }
  renderer.render(scene, camera);
  if (qaEnabled && !paused) {
    renderSamples.push({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, animations: animationUpdates });
    if (renderSamples.length > 60) renderSamples.shift();
  }
}

function updateHud() {
  const stageInfo = getStageInfo(state);
  $('district').textContent = state.raid.location === 'outside' ? '상점 앞마당' : stageInfo.name;
  $('world-caption').textContent = `${stageInfo.name} · 상권 ${state.stage} · 방어 ${state.raid.wins}회`;
  if (qaEnabled) {
    canvas.dataset.qaFrame = String(renderer.info.render.frame);
    canvas.dataset.customers = String(state.customers.length);
    canvas.dataset.customerTraffic = JSON.stringify(state.customers.map(({ id, product, phase, x, z, queueCursor, routeIndex }) => ({ id, product, phase, x, z, queueCursor, routeIndex })));
    canvas.dataset.raidDetails = JSON.stringify({ total: state.raid.totalEnemies, threat: state.raid.threatLabel, plan: state.raid.plan, summary: state.raid.summary });
    canvas.dataset.actorSizes = JSON.stringify([...actors.values()].map((actor) => ({
      id: actor.id, kind: actor.kind, palette: actor.appearance.key, scale: actor.root.scale.x, ready: actor.ready, visible: actor.root.visible,
      bodyPixels: projectXYZ(actor.x, 0, actor.z).y - projectXYZ(actor.x, 1.3 * actor.root.scale.y, actor.z).y,
      screenX: projectXYZ(actor.x, 0, actor.z).x, screenTop: projectXYZ(actor.x, 2.1 * actor.root.scale.y, actor.z).y, screenBottom: projectXYZ(actor.x, 0, actor.z).y,
    })));
    const motions = [...actors.values()].filter((actor) => actor.combatRig).map((actor) => {
      const tip = actor.combatRig.weapon.getWorldPosition(new THREE.Vector3());
      return { id: actor.id, clip: actor.currentAnimation, serial: actor.animationSerial, weapon: { x: tip.x, y: tip.y, z: tip.z } };
    });
    canvas.dataset.combatMotion = JSON.stringify(motions);
    canvas.dataset.enemyAttacking = String(motions.filter((motion) => motion.id.startsWith('e-') && motion.serial > 0).length);
    canvas.dataset.aliveEnemies = String(state.raid.enemies.filter((enemy) => enemy.hp > 0).length);
    canvas.dataset.pendingEnemies = String(state.raid.spawnRemaining || 0);
    canvas.dataset.rangedAttacking = String(motions.filter((motion) => motion.serial > 0 && ['holding-right-shoot', 'interact-right'].includes(motion.clip)).length);
    canvas.dataset.scene = JSON.stringify({ location: state.raid.location, interior: shopScene.visible, courtyard: battlefieldVisuals.group.visible, transition: state.raid.phase === 'departure' });
    canvas.dataset.entry = JSON.stringify({ slots: getCustomerEntrySlots(state), branch: getCustomerBranchPoint(state) });
    let inspection = $('qa-state');
    if (!inspection) { inspection = document.createElement('script'); inspection.id = 'qa-state'; inspection.type = 'application/json'; document.body.append(inspection); }
    const feet = projectXYZ(state.player.x, 0, state.player.z), head = projectXYZ(state.player.x, carryHeight(state.player.bag), state.player.z);
    const body = projectXYZ(state.player.x, 1.75, state.player.z);
    const samples = renderSamples.length || 1;
    inspection.textContent = JSON.stringify({ state: JSON.parse(serialize(state)), visualFixture: previewRegion, cargoFixture: previewCargo, region: getRegion(state).theme, battle: { defenders: state.raid.defenders, enemies: state.raid.enemies }, paused, started, target, dining: { ...state.dining, layout: getDiningLayout(state), guests: state.customers.filter((c) => ["food-queue", "to-table", "eating"].includes(c.phase)) }, camera: { ...cameraFrame, width: viewport.width, height: viewport.height, feet, head, bodyPixels: feet.y - body.y }, quality: { mobile: mobileRender, pixelRatio: renderer.getPixelRatio(), shadowSize: sunlight.shadow.mapSize.x }, average: { calls: renderSamples.reduce((n, s) => n + s.calls, 0) / samples, triangles: renderSamples.reduce((n, s) => n + s.triangles, 0) / samples, animations: renderSamples.reduce((n, s) => n + s.animations, 0) / samples }, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, renderedFrames: renderer.info.render.frame, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, actors: actors.size, visibleActors: [...actors.values()].filter((a) => a.root.visible).length });
  }
  $('gold').textContent = compact(state.gold);
  $('patrons').textContent = number(state.patrons?.length || 0);
  const capacity = getUpgradeInfo(state, 'capacity').value || 2;
  const gear = state.player.bag.gear || 0, potion = state.player.bag.potion || 0, food = state.player.bag.food || 0;
  $('carry').textContent = `${gear + potion + food} / ${capacity}`;
  const workKind = state.player.workKind;
  $('carry-kind').textContent = workKind === 'clean' ? '식탁 정리 중' : workKind ? (state.player.dwell < .4 ? '잠깐 멈춰요' : workKind === 'deposit' ? '내려놓는 중' : '쌓는 중') : food ? (gear || potion ? '물건 · 음식' : '배식대로 운반') : potion ? (gear ? '무기 · 물약' : '물약') : gear ? '진열대로 운반' : '빈 가방';
  const cleanProgress = Math.max(0, ...(state.dining?.tables || []).filter((table) => table.cleanerId === 'player').map((table) => table.cleanProgress || 0));
  $('work-progress').style.width = `${workKind === 'clean' ? cleanProgress / DINING_RULES.cleanSeconds * 100 : workKind ? Math.min(1, state.player.dwell / .4) * 100 : 0}%`;
  const uncollected = Object.values(state.moneyPiles).reduce((total, value) => total + value, 0);
  const raid = state.raid;
  const inRaid = ['warning', 'departure', 'battle'].includes(raid.phase);
  const outside = raid.location === 'outside', travelling = raid.phase === 'departure';
  document.querySelector('.actions').hidden = outside || travelling;
  $('battle-status').hidden = !outside && !travelling;
  $('joystick').hidden = outside || travelling;
  $('magic').hidden = outside || travelling;
  document.querySelector('.carry-hud').hidden = outside || travelling;
  $('world').setAttribute('aria-label', outside ? '상점 밖 마당에서 펼쳐지는 단골 수호대 방어전' : '상점. 바닥을 누르면 이동합니다.');
  document.querySelector('.quest-hud').classList.toggle('in-raid', inRaid);
  $('raid-health').hidden = !inRaid;
  $('health-fill').style.width = `${Math.max(0, state.shopHp / state.shopMaxHp * 100)}%`;
  $('health-value').textContent = number(state.shopHp);
  if (raid.phase === 'warning') {
    $('quest-title').textContent = `${raid.kind === 'army' ? '왕국군' : '몬스터'} 습격 · ${Math.max(0, Math.ceil(raid.timer))}초`;
    $('quest-detail').textContent = `적 ${raid.totalEnemies}명 · 준비 후 상점 밖으로 이동`; $('quest-symbol').textContent = '⚔';
  } else if (raid.phase === 'departure') {
    $('quest-title').textContent = '단골 수호대 출전'; $('quest-detail').textContent = '상점 밖 마당에서 적을 맞이합니다'; $('quest-symbol').textContent = '⚔';
  } else if (raid.phase === 'battle') {
    $('quest-title').textContent = `단골 수호대 · ${raid.wave}차 방어`;
    $('quest-detail').textContent = `남은 적 ${(raid.enemies || []).filter((e) => e.hp > 0).length + (raid.spawnRemaining || 0)} · 수호대 ${(raid.defenders || []).filter((d) => d.hp > 0).length}`;
    $('quest-symbol').textContent = '⚔';
  } else if (!state.sales) {
    $('quest-title').textContent = gear ? '진열대 앞에서 멈춰요' : '대장간 앞에서 멈춰요';
    $('quest-detail').textContent = gear ? '서 있으면 머리 위 물건을 내려놓아요' : '완성된 무기가 머리 위에 쌓여요'; $('quest-symbol').textContent = '✦';
  } else if (uncollected > 0 && state.sales < 8) {
    $('quest-title').textContent = '바닥의 대금을 주우세요'; $('quest-detail').textContent = `반짝이는 금화로 이동 · 미회수 ${compact(uncollected)}`; $('quest-symbol').textContent = '●';
  } else if (state.unlocks.alchemyAvailable && !state.unlocks.alchemy) {
    $('quest-title').textContent = '연금 공방을 열 수 있어요'; $('quest-detail').textContent = '시설 → 공방을 열고 궁수를 맞이하세요'; $('quest-symbol').textContent = '✦';
  } else if (state.unlocks.innAvailable && !state.unlocks.inn) {
    $('quest-title').textContent = '여관 식당을 열어보세요'; $('quest-detail').textContent = '시설 → 별빛 여관 · 배식과 식탁'; $('quest-symbol').textContent = '✦';
  } else if (state.unlocks.inn && state.dining.tables.some((table) => table.status === 'dirty')) {
    const dirty = state.dining.tables.filter((table) => table.status === 'dirty').length;
    $('quest-title').textContent = '식탁을 정리해요'; $('quest-detail').textContent = `정리 ${dirty}곳 · 식탁 옆에서 멈춰요`; $('quest-symbol').textContent = '✦';
  } else if (state.unlocks.inn && (food > 0 || state.dining.food === 0)) {
    $('quest-title').textContent = food ? '배식대에 음식을 놓아요' : '주방에서 음식을 받아요';
    $('quest-detail').textContent = food ? '배식대 뒤에서 멈추면 내려놓아요' : `주방 ${state.dining.kitchen}개 · 음식을 머리 위로 운반`; $('quest-symbol').textContent = '✦';
  } else {
    $('quest-title').textContent = state.unlocks.mage ? '검사 · 궁수 · 마법사와 함께' : state.unlocks.archer ? '궁수 손님이 찾아왔어요' : '손님이 단골이 되는 가게';
    $('quest-detail').textContent = `손님 ${state.customers.length}명 · ${uncollected ? `대금 ${compact(uncollected)}` : `판매 ${number(state.sales)}회`}`; $('quest-symbol').textContent = '✦';
  }
  const speedLevel = state.player.speedLevel || 1;
  const canBlink = speedLevel >= BALANCE.magic.teleportAtLevel;
  const cooldown = Math.max(0, Number(state.player.blinkCooldown || 0));
  $('magic').classList.toggle('armed', blinkAim || canBlink);
  $('magic').querySelector('strong').textContent = canBlink ? '순간이동' : '마법';
  $('magic-level').textContent = canBlink ? (cooldown > 0 ? `${cooldown.toFixed(1)}초` : '누르고 바닥 선택') : `수련 ${speedLevel} / 21`;
  $('upgrade-hint').textContent = `수련 ${speedLevel}단계`;
  $('worker-hint').textContent = `조수 ${state.staff.length} / 3`;
  $('build-hint').textContent = state.unlocks.inn ? '시설 강화' : state.unlocks.alchemy ? '여관 · 강화' : '건설 · 강화';
  $('build').classList.toggle('notification', Boolean((state.unlocks.alchemyAvailable && !state.unlocks.alchemy) || (state.unlocks.innAvailable && !state.unlocks.inn)));
  // One nearby cleanup prompt keeps four identical buttons from covering the
  // small phone view. Every table can also be approached with a floor tap.
  const nearestDirty = getDiningLayout(state).tables.filter(({ id }) => state.dining.tables[id].status === 'dirty')
    .sort((a, b) => Math.hypot(state.player.x - a.cleanPoint.x, state.player.z - a.cleanPoint.z) - Math.hypot(state.player.x - b.cleanPoint.x, state.player.z - b.cleanPoint.z))[0]?.id;
  for (const [key, entry] of stationLabels) {
    let detail = '', locked = false;
    if (key === 'forge') detail = `완성 ${Math.floor(state.stocks.forge || 0)}`;
    if (key === 'counter') detail = `진열 ${Math.floor(state.stocks.gear || 0)}`;
    if (key === 'alchemy') { locked = !state.unlocks.alchemy; detail = locked ? (state.unlocks.alchemyAvailable ? '시설에서 개방' : '판매 8회 후') : `완성 ${Math.floor(state.stocks.alchemy || 0)}`; }
    if (key === 'potionCounter') { locked = !state.unlocks.alchemy; detail = locked ? '공방 개방 후' : `진열 ${Math.floor(state.stocks.potion || 0)}`; }
    if (key === 'inn') { locked = !state.unlocks.inn; detail = locked ? (state.unlocks.innAvailable ? '시설에서 개방' : '판매 16회 후') : '단골의 휴식처'; }
    if (key === 'meal') { locked = !state.unlocks.inn; detail = `음식 ${state.dining?.food || 0}개`; }
    if (key === 'kitchen') { locked = !state.unlocks.inn; detail = `완성 ${state.dining?.kitchen || 0}개`; }
    const table = key.startsWith('table-') ? state.dining?.tables[Number(key.slice(6))] : null;
    if (table) detail = table.cleanProgress > 0 ? '정리 중' : '멈추면 정리';
    entry.el.classList.toggle('locked', locked); entry.el.querySelector('small').textContent = detail;
    entry.el.dataset.count = table ? '정리' : locked ? '잠김' : key === 'inn' ? '휴식' : detail.match(/\d+/)?.[0] || '0';
    const station = labelStation(key);
    const future = locked && (key === 'alchemy' ? !state.unlocks.alchemyAvailable : key === 'inn' ? !state.unlocks.innAvailable : true);
    entry.unavailable = future || outside || travelling || (!locked && Math.hypot(state.player.x - station.x, state.player.z - station.z) < 1.5);
    if (key === 'inn' && state.unlocks.inn) entry.unavailable = true;
    if (key === 'meal' || key === 'kitchen') entry.unavailable = !state.unlocks.inn || raid.phase === 'battle';
    if (key.startsWith('table-')) entry.unavailable = !state.unlocks.inn || raid.phase === 'battle' || table?.status !== 'dirty' || Number(key.slice(6)) !== nearestDirty;
    entry.el.hidden = entry.unavailable;
    if (!entry.unavailable) { entry.width = entry.el.offsetWidth; entry.heightPx = entry.el.offsetHeight; }
  }
  positionLabels();
  if (state.message && state.message !== lastMessage) {
    lastMessage = state.message;
    if (!/^(매출 |식사 매출 |회수 \+)/.test(lastMessage) && !(raid.phase === 'battle' && /습격/.test(lastMessage))) toast(lastMessage);
  }
  if (lastRaidPhase !== raid.phase) {
    if (raid.phase === 'departure') { stopInput(); tone('alarm'); renderDirty = true; openDeparture(); }
    if (raid.phase === 'warning') tone('alarm');
    if (['victory', 'defeat'].includes(raid.phase)) openResult();
    lastRaidPhase = raid.phase;
  }
  if (activeSheet === 'upgrades') updateUpgradeButtons();
}

function stopInput() { move.x = 0; move.z = 0; keys.clear(); clearDestination(); $('stick').style.transform = ''; }
function openSheet(title, content, name, canClose = true) {
  paused = true; renderDirty = true; stopInput(); activeSheet = name;
  $('sheet-title').textContent = title; $('sheet-content').innerHTML = content;
  $('close-sheet').hidden = !canClose;
  if (!$('sheet').open) $('sheet').showModal();
}
function closeSheet() {
  if (!started) return;
  $('sheet').close(); activeSheet = ''; paused = false; renderDirty = true; lastTime = performance.now();
}
function openIntro() {
  openSheet('룬빛 상회', `<div class="intro"><img class="intro-rune" src="icon.svg" alt=""><h2>오늘의 손님이<br>내일의 영웅으로.</h2><p>작은 대장간에서 시작하는<br>당신만의 마법 상회.</p><div class="intro-steps"><div><b>⚒</b><span>만들고</span></div><div><b>♜</b><span>가게를 키우고</span></div><div><b>⚔</b><span>함께 지켜요</span></div></div><button class="gold-button full" data-command="start">${stored ? '상회로 돌아가기' : '가게 열기'}</button><button class="secondary-button full danger" data-command="reset-confirm">진행 초기화</button><p class="muted">화면을 누르면 이동 · 멈추면 물건을 옮겨요</p></div>`, 'intro', false);
}
const upgradeNames = { speed: '순간이동 수련', capacity: '공간 주머니', price: '물건 마법 부여' };
const upgradeDescriptions = { speed: '이동 속도 상승 · 21단계에서 3.5 거리 순간이동', capacity: '한 번에 운반하는 물건 수가 늘어납니다', price: '판매가 상승 · 새로 구매할 단골의 장비 공격력과 체력도 강화합니다' };
function upgradeCards() {
  return ['speed', 'capacity', 'price'].map((kind) => {
    const info = getUpgradeInfo(state, kind);
    return `<section class="upgrade-card"><div class="card-top"><h2>${upgradeNames[kind]}</h2><span class="level-chip" data-level="${kind}">${info.currentLevel} / ${info.maxLevel}</span></div><div class="stat-line" data-value="${kind}">${statNumber(info.value)}<span>→</span>${statNumber(info.nextValue) ?? '완성'}</div><p>${upgradeDescriptions[kind]}</p><button class="gold-button" data-command="upgrade" data-kind="${kind}"><span data-buy="${kind}">강화</span><b data-cost="${kind}">${info.currentLevel >= info.maxLevel ? '최고 단계' : `${number(info.cost)} 골드`}</b></button></section>`;
  }).join('');
}
function updateUpgradeButtons() {
  for (const kind of ['speed', 'capacity', 'price']) {
    const info = getUpgradeInfo(state, kind), el = $('sheet-content').querySelector(`[data-kind="${kind}"]`);
    if (!el) continue;
    el.disabled = !info.canBuy;
    $('sheet-content').querySelector(`[data-level="${kind}"]`).textContent = `${info.currentLevel} / ${info.maxLevel}`;
    $('sheet-content').querySelector(`[data-value="${kind}"]`).innerHTML = `${statNumber(info.value)}<span>→</span>${statNumber(info.nextValue) ?? '완성'}`;
    $('sheet-content').querySelector(`[data-cost="${kind}"]`).textContent = info.currentLevel >= info.maxLevel ? '최고 단계' : `${number(info.cost)} 골드`;
  }
}
function openUpgrades() {
  openSheet('마법 공방', `<p class="sheet-description">물건을 팔아 수련하고, 더 큰 마법을 익히세요.</p><div class="gold-note">보유 <strong>${number(state.gold)}</strong> 골드</div>${upgradeCards()}<button class="secondary-button full" data-command="resume">상회로</button>`, 'upgrades'); updateUpgradeButtons();
}
function hireCost() { return BALANCE.worker?.employCosts?.[state.staff.length] ?? [0, 450, 700][state.staff.length] ?? 0; }
const workerJobs = { gear: '무기 운반', potion: '물약 운반', food: '음식 운반', clean: '식탁 정리' };
function openWorkers() {
  const count = state.staff.length;
  const roster = count ? state.staff.map((s) => {
    const job = s.job || s.product;
    const jobs = Object.entries(workerJobs).map(([kind, name]) => {
      const locked = kind === 'potion' ? !state.unlocks.alchemy : ['food', 'clean'].includes(kind) && !state.unlocks.inn;
      return `<button class="secondary-button${kind === job ? ' selected' : ''}" data-command="assign-worker" data-worker="${esc(s.id)}" data-job="${kind}" aria-pressed="${kind === job}" ${locked ? 'disabled' : ''}>${name}${locked ? '<small>시설 개방 후</small>' : ''}</button>`;
    }).join('');
    return `<section class="worker-card"><div class="card-top"><h2>${esc(s.name || '조수')}</h2><span class="level-chip">${workerJobs[job]}</span></div><p>운반 ${s.capacity}개 · 속도 ${Number(s.speed).toFixed(1)}</p><div class="worker-jobs" aria-label="${esc(s.name || '조수')} 담당 업무">${jobs}</div></section>`;
  }).join('') : '<p class="muted">아직 조수가 없어요</p>';
  const training = ['speed', 'capacity'].map((kind) => {
    const info = getWorkerUpgradeInfo(state, kind);
    const title = kind === 'speed' ? '조수 신속 훈련' : '조수 운반 훈련';
    const value = kind === 'speed' ? Number(info.value).toFixed(1) + '배' : '+' + (info.value - 1) + '개';
    const next = info.nextValue == null ? '완성' : kind === 'speed' ? Number(info.nextValue).toFixed(1) + '배' : '+' + (info.nextValue - 1) + '개';
    return '<section class="upgrade-card"><div class="card-top"><h2>' + title + '</h2><span class="level-chip">' + info.currentLevel + ' / ' + info.maxLevel + '</span></div><div class="stat-line">' + value + '<span>→</span>' + next + '</div><p>' + (kind === 'speed' ? '모든 조수의 원래 이동 속도에 적용합니다.' : '모든 조수의 원래 운반량에 더합니다.') + '</p><button class="gold-button" data-command="upgrade-worker" data-kind="' + kind + '" ' + (!info.canBuy ? 'disabled' : '') + '>' + (info.currentLevel === info.maxLevel ? '최고 단계' : '훈련 · ' + number(info.cost) + ' 골드') + '</button></section>';
  }).join('');
  openSheet('조수 길드', '<p class="sheet-description">조수마다 맡길 일을 선택하세요.<br>첫 조수는 무료예요.</p><div class="stat-line">' + count + '<span>/</span>3명</div>' + roster + '<p class="muted">담당 변경은 무료이며 들고 있던 짐은 사라지지 않아요.</p><button class="gold-button full" data-command="hire" ' + (count >= 3 || state.gold < hireCost() ? 'disabled' : '') + '>' + (count >= 3 ? '고용 완료' : '조수 고용 · ' + number(hireCost()) + ' 골드') + '</button><h2 class="section-title">함께 훈련</h2><p class="muted">현재 조수와 앞으로 고용할 조수 모두 성장합니다.</p>' + training + '<button class="secondary-button full" data-command="resume">상회로</button>', 'workers');
}
const facilityNames = { forge: '대장간', counter: '무기·물약 진열', alchemy: '연금 공방', inn: '별빛 여관' };
function facilityStatText(kind, stats) {
  if (!stats) return '완성';
  if (kind === 'forge' || kind === 'alchemy') return '제작 ' + statNumber(stats.seconds) + '초 · 보관 ' + stats.capacity + '개';
  if (kind === 'counter') return '결제 ' + statNumber(stats.seconds) + '초';
  return '식사 ' + statNumber(stats.seconds) + '초' + (stats.bonusPercent ? ' · 수입 +' + statNumber(stats.bonusPercent) + '%' : '');
}
function openBuild() {
  const cards = ['forge', 'counter', 'alchemy', 'inn'].map((kind) => {
    const info = getFacilityUpgradeInfo(state, kind);
    if (!info.unlocked) {
      const sales = kind === 'alchemy' ? 8 : 16, available = state.sales >= sales, cost = BALANCE.facilities[kind].costs[0];
      return '<section class="build-card"><div class="card-top"><h2>' + facilityNames[kind] + '</h2><span class="level-chip">미개방</span></div><p>' + (kind === 'alchemy' ? '물약 생산과 마법사 손님을 준비해요.' : '주방 음식을 배식대에 나르고, 빈 식탁을 정리해 주세요.') + '</p><button class="gold-button" data-command="unlock" data-kind="' + kind + '" ' + (!available || state.gold < cost ? 'disabled' : '') + '>' + (available ? '건설 · ' + number(cost) + ' 골드' : '판매 ' + sales + '회 필요') + '</button></section>';
    }
    return '<section class="build-card"><div class="card-top"><h2>' + facilityNames[kind] + '</h2><span class="level-chip">' + info.currentLevel + ' / ' + info.maxLevel + '</span></div><p class="facility-stat">' + facilityStatText(kind, info.value) + '</p><p class="facility-next">' + (info.nextValue ? '다음: ' + facilityStatText(kind, info.nextValue) : '최고 단계에 도달했어요') + '</p><button class="gold-button" data-command="upgrade-facility" data-kind="' + kind + '" ' + (!info.canBuy ? 'disabled' : '') + '>' + (info.currentLevel === info.maxLevel ? '최고 단계' : '시설 강화 · ' + number(info.cost) + ' 골드') + '</button></section>';
  }).join('');
  openSheet('상회 시설', '<div class="gold-note">보유 ' + number(state.gold) + ' 골드</div>' + cards + '<button class="secondary-button full" data-command="resume">상회로</button>', 'build');
}
function openRegions() {
  const current = getRegion(state);
  const unlocked = Math.min(10, state.stage);
  const regions = REGIONS.map((region, index) => '<div class="region-row ' + (current.index === index ? 'current' : index >= unlocked ? 'unopened' : '') + '"><span class="region-number">' + (index + 1) + '</span><div><strong>' + region.name + '</strong><span>' + (current.index === index ? '지금 영업 중' : index < unlocked ? '개방한 상권' : '앞 지역 방어 후 개방') + '</span></div><b>' + (current.index === index ? '✦' : index < unlocked ? '✓' : '♜') + '</b></div>').join('');
  openSheet('열 곳의 상권', '<p class="sheet-description">방어에 성공하면 다음 상권으로 떠나요.<br>시설 배치와 풍경이 모두 달라집니다.<br>강화·물건·미회수 대금은 함께 옮겨요.</p><div class="region-list">' + regions + '</div><p class="muted">10개 지역을 지나면 다음 방어 차수로 순환합니다.</p><button class="gold-button full" data-command="resume">상회로</button>', 'regions');
}
function openMagic() {
  if ((state.player.speedLevel || 1) >= BALANCE.magic.teleportAtLevel) {
    closeSheet(); blinkAim = !blinkAim;
    toast(blinkAim ? '이동할 바닥을 누르세요 · 최대 3.5 거리' : '순간이동 선택 취소'); return;
  }
  openUpgrades();
}
function openMenu() {
  openSheet('메뉴', `<button class="gold-button full" data-command="resume">계속하기</button><button class="secondary-button full danger" data-command="reset-confirm">진행 초기화</button><button class="secondary-button full" data-command="help">놀이 방법</button><button class="secondary-button full" data-command="sound">효과음 ${sound ? '켜짐 ♪' : '꺼짐'}</button><button class="secondary-button full" data-command="ledger">단골 수첩 · ${state.patrons.length}명</button><a class="menu-link" href="../../">홈으로 돌아가기</a>`, 'menu');
}
function cancelReset() { if (resetReturn === 'intro') openIntro(); else openMenu(); }
function dismissSheet() { if (activeSheet === 'confirm') cancelReset(); else closeSheet(); }
function openHelp() {
  openSheet('놀이 방법', `<ol class="help-list"><li>조이스틱을 움직이거나 작업장 표식·바닥을 누르세요. 대장간 앞에서 멈추면 무기가 머리 위에 하나씩 쌓여요.</li><li>진열대 앞에서 멈추면 물건을 하나씩 내려놓아요. 이동 중에는 상하차하지 않아요.</li><li>손님이 낸 돈은 바닥에 쌓여요. 금화 더미나 금액을 눌러 직접 다가가 주워야 내 골드가 돼요.</li><li>시설에서 제작·결제·식사를 강화하고 고용에서 모든 조수를 훈련하세요. 판매가 늘면 공방과 여관이 열려요.</li><li>여관 주방에서 음식을 머리 위에 쌓고 배식대 뒤에서 내려놓으세요. 손님이 먹고 떠난 식탁 옆에서 멈추면 정리해요. 고용에서 조수에게 음식 운반·식탁 정리를 맡길 수 있어요.</li><li>물건을 산 검사·궁수·마법사가 습격 때 돌아와요. 방어에 성공하면 배치와 풍경이 다른 다음 지역으로 옮겨요.</li><li>이동 수련 21단계! 순간이동을 누른 뒤 가까운 바닥을 선택하세요. 재사용 4초.</li></ol><p class="muted">화면을 벗어나면 시간이 멈춥니다.<br>${saveFailed ? '현재 브라우저 저장을 사용할 수 없습니다.' : '진행은 이 브라우저에 자동으로 저장됩니다.'}</p><button class="gold-button full" data-command="resume">알겠어요</button>`, 'help');
}
function openLedger() {
  const count = (kind) => state.patrons.filter((p) => p.kind === kind).length;
  openSheet('단골 수첩', `<div class="result-stats"><div><strong>${count('warrior')}</strong><span>검사</span></div><div><strong>${count('archer')}</strong><span>궁수</span></div><div><strong>${count('mage')}</strong><span>마법사</span></div></div><p class="sheet-description">상회에서 물건을 산 손님만 단골이 됩니다.<br>습격이 시작되면 이들이 돌아와 싸워줘요.<br>여관에서 식사한 단골은 더욱 든든합니다.</p><div class="gold-note">방어 ${number(state.raid.wave || 0)}차 · 판매 ${number(state.sales)}회</div><button class="gold-button full" data-command="resume">상회로</button>`, 'ledger');
}
function openDeparture() {
  const raid = state.raid;
  openSheet('상점 밖을 지켜요', `<div class="result-emblem">⚔</div><h2 class="result-title">마당 방어 준비</h2><p class="sheet-description intro">손님들은 대피하고,<br>단골 수호대가 밖에서 적을 맞이해요.</p><div class="result-stats"><div><strong>${Math.min(18, state.patrons.filter((p) => p.purchases > 0).length)}</strong><span>단골 수호대</span></div><div><strong>${raid.totalEnemies}</strong><span>${raid.kind === 'army' ? '왕국군' : '몬스터'}</span></div></div><button class="gold-button full" data-command="depart">마당으로 출전</button>`, 'departure', false);
}
function openResult() {
  const won = state.raid.phase === 'victory';
  const reward = state.raid.reward ?? BALANCE.web.raidCoinRewards[Math.min((state.raid.wave || 1) - 1, BALANCE.web.raidCoinRewards.length - 1)];
  const summary = state.raid.summary;
  const survivors = summary ? `${summary.defenders - summary.fallen} / ${summary.defenders}` : state.patrons.length;
  const report = summary ? `<p class="battle-report">${Math.ceil(summary.duration)}초 방어 · 전투불능 ${summary.fallen}명<br>부상 ${summary.injured}명 · 상회 피해 ${Math.ceil(summary.shopDamage)}</p>` : '';
  openSheet(won ? '상회를 지켜냈어요!' : '다시 일어설 시간', `<div class="result-emblem">${won ? '✦' : '♜'}</div><h2 class="result-title">${won ? '당신이 키운 영웅들' : '단골들은 당신 곁에 있어요'}</h2><p class="sheet-description intro">${won ? '어제 건넨 물건이 오늘의 힘이 되었어요.<br>다음 침공은 더 거센 부대가 찾아와요.' : '물건과 성장, 단골은 사라지지 않아요.<br>마법 부여와 여관으로 수호대를 키워요.'}</p><div class="result-stats"><div><strong>${survivors}</strong><span>${summary ? '버틴 수호대' : '우리 단골'}</span></div><div><strong>${won ? `+${compact(reward)}` : '무료'}</strong><span>${won ? '방어 보상' : '상회 복구'}</span></div></div>${report}<button class="gold-button full" data-command="${won ? 'continue' : 'repair'}">${won ? '계속 영업' : '복구하고 계속'}</button>`, 'result', false);
}

listen($('sheet-content'), 'click', (event) => {
  const button = event.target.closest('[data-command]'); if (!button || button.disabled) return;
  const command = button.dataset.command;
  if (command === 'start') { started = true; closeSheet(); tone(); if (state.raid.phase === 'defeat') openResult(); return; }
  if (command === 'resume') { closeSheet(); return; }
  if (command === 'depart' && state.raid.phase === 'departure') { closeSheet(); return; }
  if (command === 'upgrade') { action('upgrade', { kind: button.dataset.kind }); openUpgrades(); return; }
  if (command === 'hire') { action('hire'); openWorkers(); return; }
  if (command === 'upgrade-worker') { action(command, { kind: button.dataset.kind }); openWorkers(); return; }
  if (command === 'assign-worker') { action(command, { id: button.dataset.worker, job: button.dataset.job }); openWorkers(); return; }
  if (command === 'upgrade-facility') { action(command, { kind: button.dataset.kind }); openBuild(); return; }
  if (command === 'unlock') { action('unlock', { kind: button.dataset.kind }); openBuild(); return; }
  if (command === 'help') { openHelp(); return; }
  if (command === 'ledger') { openLedger(); return; }
  if (command === 'sound') { sound = !sound; openMenu(); return; }
  if (command === 'reset-confirm') {
    resetReturn = started ? 'menu' : 'intro';
    openSheet('진행을 초기화할까요?', '<p class="sheet-description">이 상회의 골드·강화·시설·조수·단골 기록을 지우고 처음부터 시작합니다.</p><button class="gold-button full danger" data-command="reset">초기화하고 시작</button><button class="secondary-button full" data-command="reset-cancel">취소</button>', 'confirm'); return;
  }
  if (command === 'reset-cancel') { cancelReset(); return; }
  if (command === 'reset') {
    state = createGame(Math.floor(Math.random() * 0x7fffffff)); seenEffects.clear(); lastRaidPhase = state.raid.phase;
    cameraSnap = true; currentRegionId = '';
    clearTimeout(transitionTimer); $('region-banner').hidden = true;
    stored = false; started = true; action('restart'); closeSheet(); updateHud(); return;
  }
  if (command === 'continue' || command === 'repair') { action(command); closeSheet(); return; }
});
listen($('close-sheet'), 'click', dismissSheet);
listen($('sheet'), 'cancel', (event) => { event.preventDefault(); if (activeSheet === 'confirm' || started && !['result', 'departure'].includes(activeSheet)) dismissSheet(); });
listen($('pause'), 'click', () => { if (started) openMenu(); });
listen($('upgrades'), 'click', openUpgrades);
listen($('workers'), 'click', openWorkers);
listen($('build'), 'click', openBuild);
listen($('regions'), 'click', () => { if (started) openRegions(); });
listen($('magic'), 'click', openMagic);

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointer, camera);
  const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (!p) return null;
  return { x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x)), z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z)) };
}
let canvasDown = null;
listen(canvas, 'pointerdown', (e) => { if (!started || paused) return; canvasDown = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
listen(canvas, 'pointerup', (e) => {
  if (!canvasDown || canvasDown.id !== e.pointerId || paused || state.raid.location === 'outside' || state.raid.phase === 'departure') return;
  const distance = Math.hypot(e.clientX - canvasDown.x, e.clientY - canvasDown.y); canvasDown = null;
  if (distance > 22) return;
  const point = worldPoint(e); if (!point) return;
  if (blinkAim) { action('blink', point); blinkAim = false; clearDestination(); return; }
  for (const [key, station] of Object.entries(getStations(state))) {
    if (key === 'gate') continue;
    if (Math.hypot(point.x - station.x, point.z - station.z) < 1.1) { Object.assign(point, getStationApproach(state, key)); break; }
  }
  setDestination(point);
});
listen(canvas, 'pointercancel', () => { canvasDown = null; });
let joystickId = null;
function joystickMove(e) {
  if (joystickId !== e.pointerId) return;
  const rect = $('joystick').getBoundingClientRect();
  let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * .36);
  let z = (e.clientY - rect.top - rect.height / 2) / (rect.height * .36);
  const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
  if (len < .12) x = z = 0;
  $('stick').style.transform = `translate(${x * 22}px,${z * 22}px)`;
  move.x = x * CAMERA_RIGHT.x + z * CAMERA_DOWN.x; move.z = x * CAMERA_RIGHT.z + z * CAMERA_DOWN.z; clearDestination();
}
listen($('joystick'), 'pointerdown', (e) => {
  if (paused || !started) return;
  e.preventDefault(); joystickId = e.pointerId; $('joystick').setPointerCapture(e.pointerId); joystickMove(e);
});
listen($('joystick'), 'pointermove', joystickMove);
function releaseJoystick(e) { if (e.pointerId !== joystickId) return; joystickId = null; move.x = move.z = 0; $('stick').style.transform = ''; }
listen($('joystick'), 'pointerup', releaseJoystick); listen($('joystick'), 'pointercancel', releaseJoystick);
listen(window, 'keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
  if (event.key === 'Escape' && started && !$('sheet').open) openMenu();
  keys.add(event.key.toLowerCase());
});
listen(window, 'keyup', (event) => keys.delete(event.key.toLowerCase()));
listen(window, 'blur', () => { move.x = move.z = 0; keys.clear(); joystickId = null; $('stick').style.transform = ''; });
listen(document, 'visibilitychange', () => {
  if (document.hidden) { paused = true; stopInput(); save(); audioContext?.suspend().catch(() => {}); }
  else { lastTime = performance.now(); if (started && !$('sheet').open) openMenu(); }
});

function loop(time) {
  if (disposed) return;
  frame = requestAnimationFrame(loop);
  const dt = Math.min(.05, Math.max(0, (time - (lastTime || time)) / 1000)); lastTime = time;
  if (document.hidden) return;
  if (!paused && started) {
    let x = move.x, z = move.z;
    const kx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const kz = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (kx || kz) { x = kx * CAMERA_RIGHT.x + kz * CAMERA_DOWN.x; z = kx * CAMERA_RIGHT.z + kz * CAMERA_DOWN.z; clearDestination(); }
    step(state, dt, state.raid.location === 'outside' || state.raid.phase === 'departure' ? {} : { x, z, target });
    if (target && Math.hypot(state.player.x - target.x, state.player.z - target.z) < .1) target = null;
    saveClock += dt;
    if (saveClock > 5) { saveClock = 0; save(); }
  }
  if (!paused || renderDirty) { visuals(paused ? 0 : dt); renderDirty = false; }
  uiClock += dt;
  if (uiClock > .1) { uiClock = 0; updateHud(); }
}

function teardown(event) {
  paused = true; save(); stopInput();
  if (event.persisted) return;
  disposed = true; cancelAnimationFrame(frame); clearTimeout(toastTimer); clearTimeout(transitionTimer); resizeObserver.disconnect(); controller.abort();
  for (const actor of actors.values()) actor.mixer?.stopAllAction();
  const disposedMaterials = new Set(), disposedGeometries = new Set(), disposedTextures = new Set(), disposedSkeletons = new Set();
  scene.traverse((node) => {
    if (node.isInstancedMesh) node.dispose();
    if (node.skeleton && !disposedSkeletons.has(node.skeleton)) { disposedSkeletons.add(node.skeleton); node.skeleton.dispose(); }
    if (node.geometry && !disposedGeometries.has(node.geometry)) { disposedGeometries.add(node.geometry); node.geometry.dispose(); }
    for (const m of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
      if (disposedMaterials.has(m)) continue; disposedMaterials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture && !disposedTextures.has(value)) { disposedTextures.add(value); value.dispose(); }
      m.dispose();
    }
  });
  for (const geometry of geometries) if (!disposedGeometries.has(geometry)) geometry.dispose();
  for (const geometry of classGeometries) if (!disposedGeometries.has(geometry)) geometry.dispose();
  diningVisuals?.dispose(disposedGeometries, disposedMaterials);
  battlefieldVisuals.dispose(disposedGeometries, disposedMaterials);
  disposeCombatMotion(disposedGeometries, disposedMaterials);
  products.dispose(disposedGeometries); renderer.dispose(); audioContext?.close().catch(() => {});
}
listen(window, 'pagehide', teardown);
listen(window, 'pageshow', (event) => { if (event.persisted) { lastTime = performance.now(); if (started && !$('sheet').open) openMenu(); } });

// Read-only inspection is deliberately opt-in and never appears in normal play.
if (qaEnabled) {
  Object.defineProperty(window, 'runehavenQA', { value: {
    snapshot: () => JSON.parse(serialize(state)),
    renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, actors: actors.size, paused }),
  } });
}

syncRegion(); resize(); updateHud();
populate().then(() => {
  $('loading').hidden = true;
  openIntro(); lastTime = performance.now(); frame = requestAnimationFrame(loop);
}).catch((error) => {
  console.error('Runehaven asset load failed', error);
  $('loading').hidden = true; $('renderer-error').hidden = false;
  $('renderer-error').querySelector('strong').textContent = '상회 준비가 끝나지 않았어요';
  $('renderer-error').querySelector('p').textContent = '리소스를 불러오지 못했어요. 새로고침하면 다시 준비합니다.';
});
