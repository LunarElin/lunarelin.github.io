// This executes the production module graph in jsdom, not a real browser.
// Canvas, decoded images, layout and clocks are stubs; visual quality and touch
// behavior on actual devices require separate browser/device verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const gameRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const html = readFileSync(path.join(gameRoot, 'index.html'), 'utf8');
const CURRENT_KEY = 'acorn-guard:v4', PREVIOUS_KEY = 'acorn-guard:v3';
const ids = ['squirrel', 'bear', 'fox', 'redpanda', 'sparrow'];

async function boot({ saved = {}, seed = 7 } = {}) {
  const failures = [], imageRequests = [], imageFailures = [], frames = new Map(), timers = new Map();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => failures.push(error.message));
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8124/games/acorn-guard/',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom, document = window.document;
  let clock = 0, nextId = 0;
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  window.Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  window.Date.now = () => 1000000 + clock;
  Object.defineProperty(window.performance, 'now', { value: () => clock });
  window.matchMedia = () => ({ matches: false });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.requestAnimationFrame = callback => { const id = ++nextId; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = (callback, delay = 0) => { const id = ++nextId; timers.set(id, { callback, at: clock + delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.addEventListener('error', event => failures.push(event.error?.stack || event.message));
  window.fetch = async reference => {
    const url = new URL(String(reference));
    assert.equal(path.basename(fileURLToPath(url)), 'runtime-assets.json', 'No network fetch is allowed in this DOM simulation');
    return { ok: true, json: async () => JSON.parse(readFileSync(url, 'utf8')) };
  };
  window.Image = class {
    width = 1024; height = 1024;
    async decode() {
      if (String(this.src).startsWith('data:')) return;
      try {
        const url = new URL(String(this.src)), filename = fileURLToPath(url);
        assert.ok(filename.startsWith(gameRoot + path.sep), 'Image must remain inside this game');
        assert.ok(statSync(filename).isFile(), `Image exists: ${filename}`);
        imageRequests.push(path.basename(filename));
      } catch (error) { imageFailures.push(error.message); throw error; }
    }
  };
  const contexts = new WeakMap();
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (contexts.has(this)) return contexts.get(this);
    const values = { canvas: this, globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over' }, stack = [];
    const context = new Proxy(values, { get(target, key) {
      if (key in target) return target[key];
      if (key === 'save') return () => stack.push({ ...target });
      if (key === 'restore') return () => { const state = stack.pop(); if (state) Object.assign(target, state); };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'createPattern') return () => ({});
      if (key === 'measureText') return text => ({ width: String(text).length * 8 });
      return (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `Finite Canvas ${String(key)} argument`); };
    } });
    contexts.set(this, context); return context;
  };
  window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const home = document.querySelector('#game').classList.contains('home-mode');
    const rect = this.id === 'game' || this.id === 'world' ? { x: 0, y: 0, width: 390, height: 844 }
      : this.classList.contains('bottom-hud') ? { x: 0, y: 844 - (home ? 230 : 190), width: 390, height: home ? 230 : 190 }
      : this.classList.contains('wave-hud') ? { x: 15, y: 105, width: 360, height: 52 }
      : { x: 0, y: 0, width: 44, height: 44 };
    return { ...rect, left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height, toJSON: () => rect };
  };
  const moduleCache = new Map(), context = dom.getInternalVMContext();
  async function loadModule(identifier) {
    if (moduleCache.has(identifier)) return moduleCache.get(identifier);
    const module = new vm.SourceTextModule(readFileSync(new URL(identifier), 'utf8'), {
      identifier, context, initializeImportMeta(meta) { meta.url = identifier; },
    });
    moduleCache.set(identifier, module);
    await module.link((specifier, parent) => loadModule(new URL(specifier, parent.identifier).href));
    return module;
  }
  const entry = await loadModule(new URL('../game.mjs', import.meta.url).href);
  await entry.evaluate();
  const query = selector => { const element = document.querySelector(selector); assert.ok(element, selector); return element; };
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const harness = {
    window, document, query, imageRequests,
    saved: () => JSON.parse(window.localStorage.getItem(CURRENT_KEY)),
    click(selector) {
      const element = query(selector);
      assert.equal(element.closest('[hidden]'), null, `Visible target: ${selector}`);
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) assert.notEqual(ancestor.inert, true, `Active target: ${selector}`);
      assert.notEqual(element.disabled, true, `Enabled target: ${selector}`); element.click();
    },
    tick(seconds = .05) {
      clock += seconds * 1000;
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(clock);
      for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
    },
    async advance(seconds) { for (let i = 0; i < Math.ceil(seconds / .05); i++) harness.tick(); await settle(); },
    settle,
    assertClean() {
      assert.deepEqual(failures, [], 'Production UI raised no DOM or finite-coordinate errors');
      assert.deepEqual(imageFailures, [], 'Every production image URL decoded by the stub resolves to a local file');
    },
    close() {
      window.dispatchEvent(new window.Event('pagehide')); frames.clear(); timers.clear(); dom.window.close();
    },
  };
  await settle(); harness.assertClean(); return harness;
}

test('production UI completes a natural year, decorates the winter home and departs with persistent growth', async t => {
  const app = await boot(); t.after(() => app.close());
  assert.equal(app.query('#load-indicator').hidden, true);
  assert.equal(app.query('#overlay').hidden, false);
  assert.equal(app.query('#year').textContent, '1');
  assert.equal(app.query('#food').textContent, '0');
  assert.equal(app.imageRequests.includes('shelter-room.webp'), false, 'The winter interior is not eagerly loaded on a fresh spring');
  app.click('#overlay [data-action="resume"]');
  assert.equal(app.query('#overlay').hidden, true);
  let frameCount = 0, recruits = 0; const seenSeasons = new Set();
  for (; frameCount < 6000 && app.saved().journey.phase !== 'home'; frameCount++) {
    app.tick();
    seenSeasons.add(app.query('[data-season].current').dataset.season);
    if (!app.query('#overlay').hidden) {
      assert.ok(app.document.querySelector('#overlay [data-action="recruit"]'), 'Only normal physical recruitment interrupts the journey');
      app.click('#overlay [data-action="recruit"]'); recruits++;
    }
  }
  assert.ok(frameCount < 6000, 'Ordinary automatic play reaches winter within five simulated minutes');
  assert.equal(recruits, 4); assert.equal(app.saved().harvested, 108);
  assert.deepEqual([...seenSeasons].filter(id => id !== 'winter'), ['spring', 'summer', 'autumn']);
  assert.equal(app.saved().journey.harvests, 108); assert.equal(app.query('#home-tools').hidden, true, 'Arrival animation precedes the interior');
  await app.advance(2.5);
  assert.match(app.query('#dialog').getAttribute('aria-label'), /겨울 집에 도착/);
  assert.equal(app.query('[data-season="winter"]').classList.contains('current'), true);
  assert.equal(app.query('#year-fill').style.width, '100%');
  assert.ok(app.imageRequests.includes('shelter-room.webp'));
  app.click('#overlay [data-action="resume"]');
  assert.equal(app.query('#home-tools').hidden, false); assert.equal(app.query('#game').classList.contains('home-mode'), true);
  assert.equal(app.document.querySelectorAll('[data-decoration]').length, 6);
  const before = app.saved();
  assert.ok(before.members.sparrow.materials >= 2, 'This unmodified first-year run can make a sleeping nest');
  app.click('[data-decoration="nest"]'); app.click('#craft-button');
  const crafted = app.saved();
  assert.equal(crafted.homestead.decorations.nest.level, 1); assert.equal(crafted.homestead.decorations.nest.placed, true);
  assert.equal(crafted.members.bear.materials, before.members.bear.materials - 12);
  assert.equal(crafted.members.sparrow.materials, before.members.sparrow.materials - 2);
  assert.equal(crafted.coins, before.coins); assert.equal(app.query('#comfort').textContent, '1');
  app.click('#style-button'); app.click('#place-button');
  assert.deepEqual(app.saved().homestead.decorations.nest, { level: 1, style: 1, placed: false });
  assert.equal(app.query('#place-button').getAttribute('aria-pressed'), 'false');
  app.click('#place-button');
  app.click('#pause-button'); app.click('#overlay [data-action="restart"]');
  assert.equal(app.saved().journey.phase, 'home'); assert.equal(app.query('#home-tools').hidden, false);
  const winter = app.saved();
  app.click('#spring-button');
  const spring = app.saved();
  assert.equal(spring.journey.year, 2); assert.equal(spring.journey.phase, 'journey');
  assert.equal(spring.journey.harvests, 0); assert.equal(spring.journey.food, 0);
  assert.deepEqual(spring.homestead, winter.homestead); assert.deepEqual(spring.members, winter.members);
  assert.deepEqual(spring.recruited, ids); assert.equal(app.query('#year').textContent, '2');
  assert.equal(app.query('#home-tools').hidden, true); assert.equal(app.query('[data-season="spring"]').classList.contains('current'), true);
  await app.advance(6); app.click('#pause-button'); const travelling = app.saved();
  assert.ok(travelling.journey.harvests > 0);
  app.click('#overlay [data-action="restart"]');
  assert.deepEqual(app.saved().journey, travelling.journey); assert.deepEqual(app.saved().homestead, travelling.homestead);
  app.assertClean();
});

test('a saved winter opens in the furnished home and never gathers or advances automatically', async t => {
  const saved = {
    version: 4, harvested: 250, recruited: ids, selectedHeroId: 'fox', coins: 80, savedAt: 1000000,
    members: Object.fromEntries(ids.map(id => [id, { level: 4, materials: 100 }])),
    journey: { year: 3, harvests: 108, foodByType: { acorn: 81, berries: 29, grain: 12 } },
    homestead: { decorations: { nest: { level: 2, style: 1, placed: true }, lantern: { level: 1, style: 2, placed: false } } },
  };
  const app = await boot({ saved: { [CURRENT_KEY]: saved } }); t.after(() => app.close());
  assert.equal(app.query('#game').classList.contains('home-mode'), true);
  assert.equal(app.query('#year').textContent, '3'); assert.equal(app.query('#food').textContent, '122');
  app.click('#overlay [data-action="resume"]'); const before = app.saved();
  await app.advance(10);
  const after = app.saved();
  assert.deepEqual(after.journey, before.journey); assert.deepEqual(after.members, before.members);
  assert.deepEqual(after.homestead, before.homestead); assert.equal(after.harvested, before.harvested);
  assert.equal(app.query('#home-tools').hidden, false); assert.equal(app.query('#comfort').textContent, '2');
  assert.equal(app.query('#overlay').hidden, true, 'Restoring winter does not replay arrival or force another trip');
  app.assertClean();
});

test('the actual UI migrates v3 companions and resources into a fresh first spring', async t => {
  const legacy = {
    version: 3, harvested: 100, recruited: ids, selectedHeroId: 'fox', coins: 321, savedAt: 1000000,
    members: Object.fromEntries(ids.map((id, index) => [id, { level: 2 + index, materials: 20 + index, upgrades: {} }])),
  };
  const app = await boot({ saved: { [PREVIOUS_KEY]: legacy } }); t.after(() => app.close());
  const migrated = app.saved();
  assert.equal(migrated.version, 4); assert.deepEqual(migrated.recruited, ids); assert.equal(migrated.coins, 321);
  for (const [index, id] of ids.entries()) {
    assert.equal(migrated.members[id].level, 2 + index); assert.equal(migrated.members[id].materials, 20 + index);
  }
  assert.equal(migrated.journey.year, 1); assert.equal(migrated.journey.harvests, 0); assert.equal(migrated.journey.food, 0);
  assert.equal(app.query('#materials').textContent, '22'); assert.equal(app.query('#party-count').textContent, '5/5');
  assert.equal(app.query('#home-tools').hidden, true); assert.equal(app.query('#food').textContent, '0');
  assert.equal(app.window.localStorage.getItem(PREVIOUS_KEY), JSON.stringify(legacy), 'The previous profile is preserved');
  app.click('#overlay [data-action="resume"]');
  assert.equal(app.query('#overlay').hidden, true); app.assertClean();
});
