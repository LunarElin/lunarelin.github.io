import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../rules.mjs';
import { buildPixelArt } from '../pixel-art.mjs';

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

test('all player forms and upgraded equipment draw without mutating any simulation data', async () => {
  const f = await fixture();
  try {
    const state = stateForDraw();
    for (const [index, form] of ['druid', 'wolf', 'bear', 'dragon'].entries()) {
      state.player.form = form; state.player.formRank = form === 'druid' ? 0 : 3; state.owl.active = form === 'druid';
      state.progress.gear.equipped = ['sprout', 'thorn', 'moon', 'ember'][index];
      state.progress.gear.items[state.progress.gear.equipped] = { copies: 1, level: 20, tier: 3 };
      const before = structuredClone(state); f.view.draw(state, 0.1, index + 1); assert.deepEqual(state, before);
    }
    const stats = f.view.stats(), art = buildPixelArt(); assert.ok(stats && typeof stats === 'object');
    assert.equal(stats.sprites, Object.keys(art.sprites).length);
    assert.equal(stats.sourceFrames, Object.values(art.sprites).reduce((sum, sprite) => sum + Object.values(sprite.frames).reduce((count, frames) => count + frames.length, 0), 0));
    assert.equal(stats.scale, 2); assert.ok(stats.frames > 0 && stats.drawCalls > 0);
    for (const value of Object.values(stats)) if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0);
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
    assert.ok(f.view.stats().effects > 0 && f.view.stats().effects <= 152);
    state.events = []; state.phase = 'paused';
    const frozen = drawSignature(f.view, state, 0.05, 1), count = f.view.stats().effects, clock = f.view.stats().clock;
    for (let frame = 0; frame < 6; frame++) assert.equal(drawSignature(f.view, state, 1, 100 + frame), frozen);
    assert.equal(f.view.stats().effects, count); assert.equal(f.view.stats().clock, clock);
    state.phase = 'playing';
    for (let frame = 0; frame < 20; frame++) { f.view.canvas.context.calls.length = 0; f.view.draw(state, 0.05, 1000 + frame); assert.ok(f.view.stats().effects <= 152); }
    assert.equal(f.view.stats().effects, 0); assert.ok(f.view.stats().clock > clock);
    f.view.draw(state, 0.05, 2000); assert.equal(f.view.stats().effects, 0);
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
