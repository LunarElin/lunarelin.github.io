import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../rules.mjs';
import { buildPixelArt } from '../pixel-art.mjs';
import { PIXEL_COLORS as C } from '../theme.mjs';

let fixtureId = 0;
const integerArgs = values => assert.ok(values.every(value => Number.isFinite(value) && Number.isInteger(value)), `fractional raster coordinates: ${values}`);
function makeEnvironment(width, height, dpr = 1) {
  const canvases = [], observers = [], globals = new Map();
  const bounds = { left: 17, top: 23, width, height };
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.style = {}; this.children = []; this.classList = { toggle() {}, add() {}, remove() {} }; this.removed = false; }
    append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
    appendChild(child) { this.append(child); return child; }
    setAttribute(name, value) { this[name] = value; }
    remove() { this.removed = true; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    getBoundingClientRect() {
      const rect = this.parentElement?.getBoundingClientRect() || bounds;
      return { left: rect.left + (parseFloat(this.style.left) || 0), top: rect.top + (parseFloat(this.style.top) || 0),
        width: parseFloat(this.style.width) || rect.width, height: parseFloat(this.style.height) || rect.height };
    }
  }
  class Context {
    constructor(canvas) { this.canvas = canvas; this.calls = []; this.images = []; this.reset(); }
    reset() { this.imageSmoothingEnabled = true; this.globalAlpha = 1; this.fillStyle = '#000000'; this.stack = []; }
    fillRect(...args) { integerArgs(args); this.calls.push(['fillRect', ...args, this.fillStyle, this.globalAlpha]); }
    clearRect(...args) { integerArgs(args); this.calls.push(['clearRect', ...args]); }
    drawImage(source, ...args) {
      assert.ok(source instanceof Canvas); assert.ok([2, 4, 8].includes(args.length)); integerArgs(args);
      if (args.length === 8) { assert.equal(args[2], args[6]); assert.equal(args[3], args[7]); }
      this.calls.push(['drawImage', source.id, ...args, this.globalAlpha]);
    }
    createImageData(w, h) { integerArgs([w, h]); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
    putImageData(image, x, y) { integerArgs([x, y]); assert.equal(image.data.length, image.width * image.height * 4); this.images.push({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }); }
    save() { this.stack.push({ imageSmoothingEnabled: this.imageSmoothingEnabled, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle }); }
    restore() { const saved = this.stack.pop(); if (saved) Object.assign(this, saved); }
    arc() { assert.fail('Canvas arcs are not native pixel geometry'); }
    rotate() { assert.fail('sprite rotation would resample pixels'); }
    scale() { assert.fail('Canvas scaling must be replaced by the integer CSS grid'); }
    fillText() { assert.fail('Canvas text must not introduce antialiased glyphs'); }
    strokeText() { assert.fail('Canvas text must not introduce antialiased glyphs'); }
    set shadowBlur(value) { assert.equal(value, 0); }
    set filter(value) { assert.equal(value, 'none'); }
  }
  class Canvas extends Element {
    constructor() { super('canvas'); this.id = canvases.length; this._width = 300; this._height = 150; this.context = new Context(this); canvases.push(this); }
    get width() { return this._width; } set width(value) { integerArgs([value]); this._width = value; this.context?.reset(); }
    get height() { return this._height; } set height(value) { integerArgs([value]); this._height = value; this.context?.reset(); }
    getContext(type) { assert.equal(type, '2d'); return this.context; }
  }
  const document = { hidden: false, fonts: { ready: Promise.resolve() }, createElement: tag => tag === 'canvas' ? new Canvas() : new Element(tag) };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    trigger() { if (!this.disconnected) this.callback([{ target: this.target }]); }
  }
  const media = { matches: false, addEventListener() {}, removeEventListener() {} };
  const values = { document, ResizeObserver, devicePixelRatio: dpr, window: { devicePixelRatio: dpr }, matchMedia: () => media };
  for (const [key, value] of Object.entries(values)) { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const container = new Element('div'); container.getBoundingClientRect = () => ({ ...bounds });
  return { canvases, observers, document, container, bounds, restore() { for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}
async function fixture(width = 390, height = 680, dpr = 1) {
  const env = makeEnvironment(width, height, dpr);
  try {
    const module = await import(`../renderer.mjs?pixel-test=${fixtureId++}`), view = await module.createRenderer(env.container);
    for (const observer of env.observers) observer.trigger();
    return { ...env, module, view, close() { view.dispose(); env.restore(); } };
  } catch (error) { env.restore(); throw error; }
}
function stateForDraw() {
  const state = createGame(8021, { xp: 3800, questIndex: 11, skills: { owl: 1, roots: 1 } });
  state.phase = 'playing'; state.player.x = 2.25; state.player.z = -3.5;
  state.enemies = state.enemies.slice(0, 9).map((enemy, index) => ({ ...enemy, x: -4 + index, z: -2 + index % 3, phase: index % 2 ? 'windup' : 'chase', phaseTime: 0.4, warnX: -4 + index, warnZ: -2, shape: 'circle', attackRadius: 1.4 }));
  state.projectiles = ['staff', 'owl', 'dragon'].map((source, index) => ({ id: 900 + index, source, team: 'player', weaponId: 'moon', weaponStyle: 'spread', x: 2.1 + index, z: -2.2, dx: 3, dz: -1, life: 0.2, maxLife: 0.36 }));
  state.effects = [{ id: 910, type: 'root-warning', x: 1.25, z: -3.2, radius: 2.7, life: 0.2, maxLife: 0.38 }];
  state.loot = [{ id: 911, x: 1.3, z: -2.2, value: 5, life: 180 }];
  state.fieldLoot = [{ id: 912, x: 3.1, z: -2.4, kind: 'equipment', equipmentId: 'ember', amount: 1, life: 180 }];
  state.fieldEvents.items = [{ id: 913, kind: 'chest', x: 4, z: -3, life: 45 }];
  state.fieldEvents.hazards = [{ id: 914, pattern: 'spores', centers: [{ x: 2.2, z: -4.1, radius: 1.45 }], phase: 'warning', time: 0.7, warnTime: 1.15, blastTime: 0.35 }];
  state.owl.x = 1; state.owl.z = -3.2; state.owl.active = true; state.events = [];
  return state;
}
function drawSignature(view, state, dt = 0.1, time = 1) {
  const ctx = view.canvas.context; ctx.calls.length = 0; view.draw(state, dt, time); return JSON.stringify(ctx.calls);
}

test('pixel viewport sizes use a fixed integer CSS scale independent of device pixel ratio', async () => {
  for (const [width, height, dpr] of [[320, 568, 1], [390, 680, 2], [560, 800, 3], [321, 569, 3]]) {
    const f = await fixture(width, height, dpr);
    try {
      assert.deepEqual(f.module.PIXEL_GRID, { scale: 2, worldPixels: 12 });
      const viewport = f.module.computePixelViewport(width, height);
      assert.deepEqual(viewport, { width: Math.floor(width / 2), height: Math.floor(height / 2), scale: 2, offsetX: 0, offsetY: 0 });
      assert.equal(f.view.canvas.width, viewport.width); assert.equal(f.view.canvas.height, viewport.height);
      assert.equal(f.view.canvas.style.width, `${viewport.width * 2}px`); assert.equal(f.view.canvas.style.height, `${viewport.height * 2}px`);
      assert.equal(f.view.canvas.style.imageRendering, 'pixelated');
      assert.equal(parseFloat(f.view.canvas.style.left), viewport.offsetX); assert.equal(parseFloat(f.view.canvas.style.top), viewport.offsetY);
      f.view.draw(stateForDraw(), 1 / 60, 0); assert.equal(f.view.canvas.context.imageSmoothingEnabled, false);
      f.bounds.width = 319; f.bounds.height = 641; f.observers.forEach(observer => observer.trigger());
      f.view.draw(stateForDraw(), 1 / 60, 0);
      assert.equal(f.view.canvas.width, 159); assert.equal(f.view.canvas.height, 320); assert.equal(f.view.canvas.context.imageSmoothingEnabled, false);
    } finally { f.close(); }
  }
});

test('projection and pointer inversion share the same twelve-pixel world grid and real canvas rectangle', async () => {
  const f = await fixture(391, 681, 3);
  try {
    const state = stateForDraw(), viewport = f.module.computePixelViewport(391, 681);
    f.view.draw(state, 1 / 60, 0);
    const cameraX = Math.round(state.player.x * 12), cameraZ = Math.round(state.player.z * 12);
    const point = f.module.projectPixel(state.player.x, state.player.z, cameraX, cameraZ, viewport);
    integerArgs([point.x, point.y]);
    const rect = f.view.canvas.getBoundingClientRect(), world = f.view.screenToWorld(rect.left + point.x * 2, rect.top + point.y * 2);
    assert.ok(Math.abs(world.x - state.player.x) < 1e-9); assert.ok(Math.abs(world.z - state.player.z) < 1e-9);
    const other = f.view.screenToWorld(rect.left + point.x * 2 + 24, rect.top + point.y * 2 + 24);
    assert.ok(Math.abs(other.x - world.x - 1) < 1e-9); assert.ok(Math.abs(other.z - world.z - 1) < 1e-9);
    const shifted = f.module.projectPixel(state.player.x + 1, state.player.z - 1, cameraX, cameraZ, viewport);
    assert.deepEqual(shifted, { x: point.x + 12, y: point.y - 12 });
  } finally { f.close(); }
});

test('native sprite conversion contains only transparent or opaque alpha and preserves integer raster operations', async () => {
  const f = await fixture();
  try {
    f.view.setAim({ x: 2.125, z: -1.375, radius: 2.7 }); f.view.draw(stateForDraw(), 1 / 60, 0);
    let images = 0, transparent = 0, opaque = 0;
    for (const canvas of f.canvases) for (const image of canvas.context.images) {
      images++; for (let index = 3; index < image.data.length; index += 4) { const alpha = image.data[index]; assert.ok(alpha === 0 || alpha === 255); if (alpha) opaque++; else transparent++; }
    }
    assert.ok(images > 0); assert.ok(transparent > 0 && opaque > 0);
    assert.ok(f.view.canvas.context.calls.some(call => call[0] === 'drawImage'));
    assert.ok(f.view.canvas.context.calls.some(call => call[0] === 'fillRect'));
    f.view.setAim(null); f.view.draw(stateForDraw(), 1 / 60, 0);
  } finally { f.close(); }
});

test('all player forms and selected weapons draw without mutating any simulation data', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw();
    for (const [index, form] of ['druid', 'wolf', 'bear', 'dragon'].entries()) {
      state.player.form = form; state.player.formRank = form === 'druid' ? 0 : 3; state.owl.active = form === 'druid';
      state.progress.weapon = ['sprout', 'sword', 'axe', 'spear'][index];
      const before = structuredClone(state); f.view.draw(state, 0.1, index + 1); assert.deepEqual(state, before);
    }
    const stats = f.view.stats(), art = buildPixelArt(); assert.ok(stats && typeof stats === 'object');
    assert.equal(stats.sprites, Object.keys(art.sprites).length);
    assert.equal(stats.sourceFrames, Object.values(art.sprites).reduce((sum, sprite) => sum + Object.values(sprite.frames).reduce((count, frames) => count + frames.length, 0), 0));
    assert.equal(stats.scale, 2); assert.ok(stats.frames > 0 && stats.drawCalls > 0);
    for (const value of Object.values(stats)) if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0);
  } finally { f.close(); }
});

test('selected melee weapons replace the held staff with distinct native sprites in every facing direction', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.enemies = []; state.projectiles = []; state.owl.active = false; state.player.form = 'druid';
    const actor = () => {
      const viewport = f.module.computePixelViewport(f.bounds.width, f.bounds.height);
      const p = f.module.projectPixel(state.player.x, state.player.z, Math.round(state.player.x * 12), Math.round(state.player.z * 12), viewport);
      const call = f.view.canvas.context.calls.find(item => item[0] === 'drawImage' && f.canvases[item[1]].width === 32 && f.canvases[item[1]].height === 32 && item[2] === p.x - 16 && item[3] === p.y - 30);
      assert.ok(call); return call[1];
    };
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      state.player.facingX = x; state.player.facingZ = z;
      const sprites = [];
      for (const weapon of ['sprout', 'sword', 'axe', 'spear']) { state.progress.weapon = weapon; drawSignature(f.view, state, 0); sprites.push(actor()); }
      assert.equal(new Set(sprites).size, 4);
      state.player.form = 'bear'; state.progress.weapon = 'spear'; drawSignature(f.view, state, 0);
      assert.ok(f.view.canvas.context.calls.some(item => item[0] === 'drawImage' && f.canvases[item[1]].width === 48));
      state.player.form = 'druid';
    }
  } finally { f.close(); }
});

test('native melee poses follow preparation, impact, and recovery frames without changing the body foot anchor', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(), art = buildPixelArt(); state.player.x = state.player.z = 0; state.player.form = 'druid'; state.player.facingX = 0; state.player.facingZ = -1;
    state.enemies = []; state.projectiles = []; state.effects = []; state.loot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    const foot = f.module.projectPixel(0, 0, 0, 0, f.module.computePixelViewport(f.bounds.width, f.bounds.height));
    const palette = art.palette.map(color => color ? [...Buffer.from(color.slice(1), 'hex'), 255] : [0, 0, 0, 0]);
    for (const [weapon, id, attackType] of [['sword', 'druidSwordAttack', 'slash'], ['axe', 'druidAxeAttack', 'cleave'], ['spear', 'druidSpearAttack', 'thrust']]) {
      const asset = art.sprites[id]; assert.ok(asset, `${id} must supply native preparation/impact/recovery artwork`);
      state.progress.weapon = weapon; state.events = [{ type: 'melee-attack', weaponId: weapon, attackType, x: 0, z: 0, aimX: 1, aimZ: 0, range: 2, arc: 1.6 }];
      const frame = (dt, index) => {
        const before = structuredClone(state); drawSignature(f.view, state, dt); assert.deepEqual(state, before);
        const call = f.view.canvas.context.calls.find(call => call[0] === 'drawImage' && f.canvases[call[1]].width === 48 && f.canvases[call[1]].height === 48 && call[2] === foot.x - 24 && call[3] === foot.y - 38);
        assert.ok(call, `${id} frame ${index} must retain its padded foot anchor`);
        const pixels = f.canvases[call[1]].context.images[0].data, expected = asset.frames.right[index];
        for (let i = 0; i < expected.length; i++) assert.deepEqual([...pixels.slice(i * 4, i * 4 + 4)], palette[expected[i]], `${id}/right/${index}/${i}`);
        return call[1];
      };
      const preparation = frame(0, 0); state.events = []; const impact = frame(.05, 1); assert.notEqual(preparation, impact);
      frame(.05, 1); const recovery = frame(.04, 2); assert.notEqual(impact, recovery);
      state.phase = 'paused'; assert.equal(frame(.05, 2), recovery); state.phase = 'playing';
      for (let i = 0; i < 4; i++) drawSignature(f.view, state, .05);
      assert.ok(f.view.canvas.context.calls.some(call => call[0] === 'drawImage' && f.canvases[call[1]].width === 32 && f.canvases[call[1]].height === 32 && call[2] === foot.x - 16 && call[3] === foot.y - 30), 'ordinary idle pose returns after the swing');
    }
  } finally { f.close(); }
});

test('melee sweeps and thrusts remain native pixels, bounded, direction-aware, and frozen while paused', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.player.x = state.player.z = 0; state.enemies = []; state.projectiles = []; state.effects = []; state.loot = []; state.fieldLoot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    state.events = []; drawSignature(f.view, state, 0); const base = f.view.canvas.context.calls.length;
    const shapes = [];
    for (const [weaponId, attackType] of [['sword', 'slash'], ['axe', 'cleave'], ['spear', 'thrust']]) {
      for (const aimX of [1, -1]) {
        state.events = [{ type: 'melee-attack', x: 0, z: 0, weaponId, attackType, aimX, aimZ: 0, range: 2.4, arc: 1.8 }];
        const before = structuredClone(state); drawSignature(f.view, state, 0); assert.deepEqual(state, before);
        assert.equal(f.view.stats().effects, 1); const extra = f.view.canvas.context.calls.slice(base); assert.ok(extra.length > 15);
        shapes.push(JSON.stringify(extra));
        const center = Math.floor(f.view.canvas.width / 2), cream = extra.filter(item => item[0] === 'fillRect' && item[5] === C.cream);
        assert.ok(cream.length > 0); assert.ok(cream.every(item => aimX > 0 ? item[1] > center : item[1] < center));
        state.events = []; state.phase = 'paused'; const frozen = drawSignature(f.view, state, .05), clock = f.view.stats().clock;
        assert.equal(drawSignature(f.view, state, 10), frozen); assert.equal(f.view.stats().clock, clock);
        state.phase = 'playing'; for (let frame = 0; frame < 9; frame++) drawSignature(f.view, state, .05);
        assert.equal(f.view.stats().effects, 0);
      }
    }
    assert.equal(new Set(shapes).size, 6);
    state.events = Array.from({ length: 80 }, () => ({ type: 'melee-attack', x: 0, z: 0, weaponId: 'axe', attackType: 'cleave', aimX: 1, aimZ: 0, range: 2 }));
    drawSignature(f.view, state, 0); assert.equal(f.view.stats().effects, 8);
    state.events = []; state.phase = 'playing'; for (let frame = 0; frame < 9; frame++) drawSignature(f.view, state, .05);
    assert.equal(f.view.stats().effects, 0);
  } finally { f.close(); }
});

test('paused hidden and down render frames freeze animation despite changing wall-clock input', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); f.view.draw(state, 0.1, 0);
    for (const phase of ['paused', 'down']) {
      state.phase = phase;
      const before = drawSignature(f.view, state, 0.1, 100);
      const clock = f.view.stats().clock;
      assert.equal(drawSignature(f.view, state, 0.1, 10000), before);
      assert.equal(f.view.stats().clock, clock);
    }
    state.phase = 'playing'; f.document.hidden = true;
    const hidden = drawSignature(f.view, state, 0.1, 20000);
    assert.equal(drawSignature(f.view, state, 0.1, 90000), hidden);
    const clock = f.view.stats().clock; f.document.hidden = false; f.view.draw(state, 10, 999999);
    assert.ok(Math.abs(f.view.stats().clock - clock - 0.05) < 1e-9);
  } finally { f.close(); }
});

test('a mixed combat and reward burst stays bounded freezes when paused and expires after active time resumes', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(), types = ['hit', 'kill', 'transform', 'form-attack', 'staff-explosion', 'pickup', 'level-up'];
    state.events = Array.from({ length: 196 }, (_, index) => ({ type: types[index % types.length], x: state.player.x, z: state.player.z,
      targetId: state.enemies[index % state.enemies.length].id, damage: 12, enemyType: 'mushroom', from: 'druid', form: 'bear',
      targetX: state.player.x + 1, targetZ: state.player.z, radius: 2, amount: 3, level: 4 }));
    const before = structuredClone(state); f.view.draw(state, 0.05, 0); assert.deepEqual(state, before);
    assert.ok(f.view.stats().effects > 0 && f.view.stats().effects <= 136);
    state.events = []; state.phase = 'paused';
    const frozen = drawSignature(f.view, state, 0.05, 1), count = f.view.stats().effects, clock = f.view.stats().clock;
    for (let frame = 0; frame < 6; frame++) assert.equal(drawSignature(f.view, state, 1, 100 + frame), frozen);
    assert.equal(f.view.stats().effects, count); assert.equal(f.view.stats().clock, clock);
    state.phase = 'playing';
    for (let frame = 0; frame < 20; frame++) { f.view.canvas.context.calls.length = 0; f.view.draw(state, 0.05, 1000 + frame); assert.ok(f.view.stats().effects <= 136); }
    assert.equal(f.view.stats().effects, 0); assert.ok(f.view.stats().clock > clock);
    f.view.draw(state, 0.05, 2000); assert.equal(f.view.stats().effects, 0);
  } finally { f.close(); }
});

test('terrain is baked once and copied without scaling while hunting does not add permanent rings or markers', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.enemies = []; state.projectiles = []; state.effects = []; state.loot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    drawSignature(f.view, state, 0);
    const terrain = f.canvases.find(canvas => canvas.width > 300 && canvas.height > 1000); assert.ok(terrain);
    const bakedCalls = terrain.context.calls.length; assert.ok(bakedCalls > 1000); assert.ok(f.view.stats().terrainPixels < 800000);
    const surface = terrain.context.images[0]; assert.ok(surface);
    assert.equal(surface.data[(surface.width * surface.height - 1) * 4 + 3], 0, 'beyond the cliff, transparent cache pixels reveal the valley rather than a hard rectangle');
    assert.ok(f.view.canvas.context.calls.some(call => call[0] === 'fillRect' && call[1] === 0 && call[2] === 0 && call[3] === f.view.canvas.width && call[4] === f.view.canvas.height && call[5] === C.sky));
    const original = drawSignature(f.view, state, 0);
    state.huntZoneId = 'meadow-mushrooms'; state.autoHunt = true;
    assert.equal(drawSignature(f.view, state, 0), original, 'an active hunt must not draw an oversized permanent circle over the field');
    for (const z of [8, -28, -57, -82]) {
      state.player.z = z; drawSignature(f.view, state, 0);
      const copies = f.view.canvas.context.calls.filter(call => call[0] === 'drawImage' && call[1] === terrain.id);
      assert.equal(copies.length, 1); const copy = copies[0]; assert.equal(copy.length, 11);
      assert.equal(copy[4], copy[8]); assert.equal(copy[5], copy[9]);
      assert.equal(terrain.context.calls.length, bakedCalls, 'camera movement must not rebuild the terrain');
    }
  } finally { f.close(); }
});

test('one simulation event creates one transient attack even when the same event list is rendered at high refresh rates', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.enemies = []; state.projectiles = []; state.effects = []; state.owl.active = false; state.events = [{ type: 'melee-attack', weaponId: 'sword', attackType: 'slash', x: 0, z: 0, aimX: 1, aimZ: 0, range: 2, arc: 1.6 }];
    const event = state.events[0]; drawSignature(f.view, state, 0);
    assert.equal(f.view.stats().effects, 1);
    for (let i = 0; i < 12; i++) { drawSignature(f.view, state, 1 / 144); assert.equal(f.view.stats().effects, 1); }
    for (let i = 0; i < 30; i++) drawSignature(f.view, state, 1 / 144);
    assert.equal(f.view.stats().effects, 0, 'the consumed event must not renew itself on every render');
    state.events = [{ ...event }]; state.phase = 'paused'; drawSignature(f.view, state, .05); assert.equal(f.view.stats().effects, 0);
    state.phase = 'playing'; f.document.hidden = true; drawSignature(f.view, state, .05); assert.equal(f.view.stats().effects, 0);
    f.document.hidden = false; drawSignature(f.view, state, 0); assert.equal(f.view.stats().effects, 1, 'a newly produced event is consumed after resuming');
    assert.deepEqual(event, { type: 'melee-attack', weaponId: 'sword', attackType: 'slash', x: 0, z: 0, aimX: 1, aimZ: 0, range: 2, arc: 1.6 });
  } finally { f.close(); }
});

test('the initial heavy swing has a broad white strike core that quickly resolves to a thin recovery trace', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.player.x = state.player.z = 0; state.progress.weapon = 'axe'; state.enemies = []; state.projectiles = []; state.effects = []; state.loot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    state.events = [{ type: 'melee-attack', x: 0, z: 0, weaponId: 'axe', attackType: 'cleave', aimX: 1, aimZ: 0, range: 1.9, arc: 2.7 }];
    const whiteArea = () => f.view.canvas.context.calls.filter(call => call[0] === 'fillRect' && call[5] === C.cream).reduce((sum, call) => sum + call[3] * call[4], 0);
    drawSignature(f.view, state, 0); const strike = whiteArea(); assert.ok(strike > 60);
    state.events = []; for (let i = 0; i < 3; i++) drawSignature(f.view, state, .05);
    const recovery = whiteArea(); assert.ok(recovery > 0); assert.ok(strike > recovery * 2, `${strike} strike pixels should clearly exceed ${recovery} recovery pixels`);
  } finally { f.close(); }
});

test('form attacks, transformation leaves, spell missiles, roots, and explosions have distinct local pixel silhouettes', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.player.x = state.player.z = 0; state.enemies = []; state.projectiles = []; state.effects = []; state.loot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    const shapes = [];
    for (const detail of [{ type: 'form-attack', form: 'wolf' }, { type: 'form-attack', form: 'bear' }, { type: 'form-attack', form: 'dragon' }, { type: 'staff-explosion' }, { type: 'transform', form: 'wolf' }, { type: 'shoot', weaponStyle: 'single' }, { type: 'owl-shoot' }]) {
      state.events = [{ ...detail, x: 0, z: 0, targetX: 1, targetZ: 0, aimX: 1, aimZ: 0, radius: 2 }];
      const before = structuredClone(state); drawSignature(f.view, state, 0); assert.deepEqual(state, before);
      state.events = []; const signature = drawSignature(f.view, state, .05); shapes.push(signature);
      assert.ok(f.view.stats().effects > 0);
      for (const call of f.view.canvas.context.calls) if (call[0] === 'fillRect') assert.ok(Object.values(C).includes(call[5]), `${detail.type}: unshared render color ${call[5]}`);
      for (let i = 0; i < 12; i++) drawSignature(f.view, state, .05);
      assert.equal(f.view.stats().effects, 0);
    }
    assert.equal(new Set(shapes).size, shapes.length);
    state.effects = [{ type: 'root-burst', x: 0, z: 0, radius: 2.7, life: .85, maxLife: 1 }];
    const sprouting = drawSignature(f.view, state, 0); state.effects[0].life = .4;
    assert.notEqual(drawSignature(f.view, state, 0), sprouting, 'native vine stems and thorns grow with the simulated root cast');
  } finally { f.close(); }
});

test('ordinary wounded health bars stay compact while one current target and bosses retain clear bars', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.effects = []; state.projectiles = []; state.events = []; state.owl.active = false;
    state.enemies = [
      { id: 5001, type: 'mushroom', x: 0, z: 0, hp: 5, maxHp: 10 },
      { id: 5002, type: 'mushroom', x: 2, z: 0, hp: 5, maxHp: 10 },
      { id: 5003, type: 'boss', x: -2, z: 0, hp: 5, maxHp: 10 },
    ]; state.player.x = state.player.z = 0; state.fightTargetId = 5002;
    drawSignature(f.view, state, 0);
    const red = f.view.canvas.context.calls.filter(call => call[0] === 'fillRect' && call[5] === C.red);
    assert.ok(red.some(call => call[3] === 7 && call[4] === 2 && call[6] === .8));
    assert.ok(red.some(call => call[3] === 9 && call[4] === 3 && call[6] === 1));
    assert.ok(red.some(call => call[3] === 15 && call[4] === 3 && call[6] === 1));
  } finally { f.close(); }
});

test('outgoing damage uses small native glyphs and incoming damage takes priority with a larger red warning', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); state.player.x = state.player.z = 0; state.enemies = []; state.effects = []; state.projectiles = []; state.events = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [] };
    const y = Math.floor(f.view.canvas.height * .54), glyphs = (color, scale) => f.view.canvas.context.calls.filter(call => call[0] === 'fillRect' && call[3] === scale && call[4] === scale && call[5] === color && call[2] < y - 25);
    state.events = [{ type: 'hit', damage: 88, x: 0, z: 0 }]; drawSignature(f.view, state, 0);
    assert.ok(glyphs(C.cream, 1).length > 20); assert.equal(glyphs(C.cream, 2).length, 0);
    state.events = [{ type: 'player-hit', damage: 17, x: 0, z: 0 }]; drawSignature(f.view, state, 0);
    assert.ok(glyphs(C.red, 2).length > 20); assert.equal(glyphs(C.cream, 1).length, 0, 'incoming damage replaces nearby decorative outgoing numbers');
    state.events = [{ type: 'hit', damage: 99, x: 0, z: 0 }]; drawSignature(f.view, state, 0);
    assert.equal(glyphs(C.cream, 1).length, 0, 'nearby outgoing numbers cannot obscure the danger warning');
    for (const form of ['bear', 'dragon']) {
      state.events = []; for (let i = 0; i < 10; i++) drawSignature(f.view, state, .05);
      state.player.form = form; state.events = [{ type: 'player-hit', damage: 7, x: 0, z: 0 }]; drawSignature(f.view, state, 0);
      assert.equal(Math.min(...glyphs(C.red, 2).map(call => call[2])), y - 58, `${form}: incoming damage must clear the larger form's head`);
    }
  } finally { f.close(); }
});

test('a focused damage burst shows one bitmap number until active-time expiry and omits zero damage', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw();
    state.player.x = state.player.z = 0; state.enemies = []; state.projectiles = []; state.effects = [];
    state.loot = []; state.fieldLoot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [], boon: null };
    const labelBottom = Math.floor(f.view.canvas.height * .54) - 24;
    const digits = () => f.view.canvas.context.calls.filter(call => call[0] === 'fillRect' && call[3] === 1 && call[4] === 1 && call[5] === C.cream && call[2] <= labelBottom);
    state.events = [{ type: 'hit', x: 0, z: 0, damage: 7 }]; drawSignature(f.view, state, 0);
    const original = structuredClone(digits()); assert.ok(original.length > 0);
    state.events = Array.from({ length: 80 }, (_, index) => ({ type: 'hit', x: [0, 2.2, -2.19, 0][index % 4], z: index % 4 === 3 ? 2.19 : 0, damage: 88 }));
    drawSignature(f.view, state, 0); assert.deepEqual(digits(), original, 'nearby hits must leave the first readable number in place');
    state.events = []; state.phase = 'paused';
    for (let frame = 0; frame < 12; frame++) { drawSignature(f.view, state, .05); assert.deepEqual(digits(), original); }
    state.phase = 'playing'; f.document.hidden = true; drawSignature(f.view, state, .05); assert.deepEqual(digits(), original); f.document.hidden = false;
    for (let frame = 0; frame < 9; frame++) drawSignature(f.view, state, .05);
    assert.equal(digits().length, original.length, 'the number remains readable for at least .45 seconds');
    drawSignature(f.view, state, .04); assert.equal(digits().length, 0, 'the number expires before .5 seconds of active time');
    state.events = [0, .1, -5, NaN, Infinity].flatMap(damage => ['hit', 'player-hit'].map(type => ({ type, x: 0, z: 0, damage })));
    drawSignature(f.view, state, 0); assert.equal(digits().length, 0);
    state.events = [{ type: 'hit', x: 0, z: 0, damage: 7 }]; drawSignature(f.view, state, 0);
    assert.deepEqual(digits(), original, 'the same location can display damage again after expiry');
  } finally { f.close(); }
});

test('separated damage bursts draw at most eight numbers without replacing any active one', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw();
    state.player.x = state.player.z = 0; state.enemies = []; state.projectiles = []; state.effects = [];
    state.loot = []; state.fieldLoot = []; state.owl.active = false; state.fieldEvents = { items: [], hazards: [], boon: null };
    const targets = [-3, 0, 3].flatMap(z => [-3, 0, 3].map(x => ({ x, z })));
    const viewport = f.module.computePixelViewport(f.bounds.width, f.bounds.height);
    const digits = () => f.view.canvas.context.calls.filter(call => call[0] === 'fillRect' && call[3] === 1 && call[4] === 1 && call[5] === C.cream && targets.some(target => {
      const p = f.module.projectPixel(target.x, target.z, 0, 0, viewport);
      return call[1] >= p.x - 5 && call[1] < p.x + 5 && call[2] >= p.y - 37 && call[2] < p.y - 30;
    }));
    state.events = [{ type: 'hit', x: -3, z: -3, damage: 1 }]; drawSignature(f.view, state, 0);
    const perNumber = digits().length; assert.ok(perNumber > 0);
    state.events = []; for (let frame = 0; frame < 10; frame++) drawSignature(f.view, state, .05);
    state.events = targets.map(point => ({ type: 'hit', ...point, damage: 1 })); drawSignature(f.view, state, 0);
    assert.equal(digits().length, perNumber * 8);
    const drawnAt = target => {
      const p = f.module.projectPixel(target.x, target.z, 0, 0, viewport);
      return digits().some(call => call[1] >= p.x - 5 && call[1] < p.x + 5 && call[2] >= p.y - 37 && call[2] < p.y - 23);
    };
    targets.slice(0, 8).forEach(target => assert.equal(drawnAt(target), true));
    assert.equal(drawnAt(targets[8]), false, 'the ninth number is omitted instead of evicting an existing number');
    state.events = []; for (let frame = 0; frame < 10; frame++) drawSignature(f.view, state, .05);
    assert.equal(digits().length, 0);
    state.events = [{ type: 'hit', ...targets[8], damage: 1 }]; drawSignature(f.view, state, 0);
    assert.equal(digits().length, perNumber); assert.equal(drawnAt(targets[8]), true);
  } finally { f.close(); }
});

test('the same foreground tree fades to reveal the player and becomes opaque when their screen footprints no longer overlap', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(), tree = buildPixelArt().sprites.tree;
    const treeCalls = () => f.view.canvas.context.calls.filter(call => call[0] === 'drawImage' && f.canvases[call[1]]?.width === tree.width && f.canvases[call[1]]?.height === tree.height);
    const destination = call => call.length === 11 ? { x: call[6], y: call[7] } : { x: call[2], y: call[3] };
    drawSignature(f.view, state);
    const original = treeCalls()[0]; assert.ok(original);
    const foot = destination(original), rect = f.view.canvas.getBoundingClientRect();
    const world = f.view.screenToWorld(rect.left + (foot.x + tree.anchorX) * 2, rect.top + (foot.y + tree.anchorY) * 2);
    const matchingCall = () => {
      const viewport = f.module.computePixelViewport(f.bounds.width, f.bounds.height);
      const projected = f.module.projectPixel(world.x, world.z, Math.round(state.player.x * 12), Math.round(state.player.z * 12), viewport);
      return treeCalls().find(call => { const dest = destination(call); return dest.x === projected.x - tree.anchorX && dest.y === projected.y - tree.anchorY; });
    };
    state.player.x = world.x; state.player.z = world.z - 2; drawSignature(f.view, state);
    assert.equal(matchingCall()?.at(-1), 0.22);
    assert.ok(treeCalls().some(call => call.at(-1) === 1));
    state.player.x += world.x >= 0 ? -6 : 6; drawSignature(f.view, state);
    assert.equal(matchingCall()?.at(-1), 1);
    assert.equal(f.view.canvas.context.imageSmoothingEnabled, false);
  } finally { f.close(); }
});

test('repeated high-refresh renders hold an enemy walk frame until a real stop without mutating the simulation', async () => {
  const f = await fixture();
  try {
    const state = createGame(8022), actor = state.enemies.find(enemy => enemy.type === 'mushroom'), asset = buildPixelArt().sprites.mushroom;
    state.phase = 'playing'; state.player.x = state.player.z = 0; state.spawners = []; state.enemies = [actor]; state.events = [];
    actor.x = 2; actor.z = 1; actor.phase = 'chase';
    const frame = dt => {
      const before = structuredClone(state); drawSignature(f.view, state, dt, 10000); assert.deepEqual(state, before);
      const viewport = f.module.computePixelViewport(f.bounds.width, f.bounds.height);
      const p = f.module.projectPixel(actor.x, actor.z, 0, 0, viewport);
      const call = f.view.canvas.context.calls.find(item => {
        if (item[0] !== 'drawImage') return false;
        const image = f.canvases[item[1]], x = item.length === 11 ? item[6] : item[2], y = item.length === 11 ? item[7] : item[3];
        return image.width === asset.width && image.height === asset.height && x === p.x - asset.anchorX && y === p.y - asset.anchorY;
      });
      assert.ok(call); return call[1];
    };
    const idle = frame(0); let walking;
    for (let step = 0; step < 3; step++) { actor.z += 0.1; walking = frame(0.05); }
    assert.notEqual(walking, idle);
    assert.equal(frame(0.007), walking);
    state.phase = 'paused'; const clock = f.view.stats().clock;
    for (let repeat = 0; repeat < 4; repeat++) assert.equal(frame(0.1), walking);
    assert.equal(f.view.stats().clock, clock);
    state.phase = 'playing';
    for (let step = 0; step < 3; step++) walking = frame(0.05);
    assert.equal(walking, idle);
    // Continue beyond the next animated walk frame so an accidental phase-zero match cannot pass.
    assert.equal(frame(0.05), idle); assert.equal(frame(0.05), idle);
  } finally { f.close(); }
});

test('disposing disconnects resize observation removes the canvas and prevents further drawing', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw(); f.view.draw(state, 1 / 60, 0); f.view.dispose();
    assert.ok(f.observers.every(observer => observer.disconnected)); assert.equal(f.view.canvas.removed, true);
    const calls = f.view.canvas.context.calls.length; f.view.draw(state, 0.1, 100);
    assert.equal(f.view.canvas.context.calls.length, calls);
  } finally { f.restore(); }
});
