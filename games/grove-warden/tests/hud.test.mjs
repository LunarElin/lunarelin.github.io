import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as rules from '../rules.mjs';
import * as equipment from '../equipment.mjs';
import * as theme from '../theme.mjs';

// Execute the complete client body with real rules; only browser/render/audio boundaries
// are replaced. Parsing the actual HTML makes removed or misspelled IDs fail normally.
const gameSource = await readFile(new URL('../game.mjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options = {}) {
    if (options.signal?.aborted) return;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    options.signal?.addEventListener('abort', () => this.listeners.get(type)?.delete(listener));
  }
  dispatch(type, detail = {}) {
    const event = { type, target: this, bubbles: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...detail };
    for (let current = this; current; current = event.bubbles && !event.stopped ? current.parentElement : null) {
      event.currentTarget = current;
      for (const listener of current.listeners.get(type) ?? []) listener(event);
    }
    return event;
  }
}
class Controller {
  signal = new EventTarget();
  abort() { this.signal.aborted = true; this.signal.dispatch('abort', { bubbles: false }); }
}
class Element extends EventTarget {
  constructor(tagName, document) {
    super(); this.tagName = tagName; this.ownerDocument = document; this.children = []; this.attrs = {};
    this.dataset = new Proxy({}, {
      set: (target, key, value) => { target[key] = String(value); this.attrs[`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = String(value); return true; },
      deleteProperty: (target, key) => { delete target[key]; delete this.attrs[`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`]; return true; },
    });
    this.style = {}; this.hidden = false; this.disabled = false; this.captures = new Set(); this.text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  get className() { return this.attrs.class ?? ''; }
  set className(value) { this.attrs.class = value; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  set innerHTML(value) { this.text = value; this.replaceChildren(); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(child) { child.parentElement = this; this.children.unshift(child); }
  replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      const tag = part.match(/^[a-z]+/i)?.[0];
      if (tag && this.tagName !== tag.toLowerCase()) return false;
      for (const [, name] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, name, value] of part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
        if (!(name in this.attrs) || value !== undefined && this.attrs[name] !== value) return false;
      }
      return Boolean(tag || part.startsWith('.') || part.startsWith('['));
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep) { const copy = new Element(this.tagName, this.ownerDocument); for (const [key, value] of Object.entries(this.attrs)) copy.setAttribute(key, value); copy.text = this.text; if (deep) copy.append(...this.children.map(child => child.cloneNode(true))); return copy; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) this.dispatch('click'); }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 320, height: 640, right: 320, bottom: 640 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}
function documentFromHtml() {
  const document = new EventTarget(); document.hidden = false;
  const root = new Element('document', document), stack = [root];
  const voidTags = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<!')) continue;
    if (!token.startsWith('<')) { stack.at(-1).text += token; continue; }
    const tag = token.match(/^<([\w-]+)/)?.[1].toLowerCase();
    if (!tag) continue;
    const element = new Element(tag, document);
    for (const [, name, double, single, bare] of token.slice(tag.length + 1).matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) element.setAttribute(name, double ?? single ?? bare ?? '');
    stack.at(-1).append(element);
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(element);
  }
  document.createElement = tag => new Element(tag, document);
  document.getElementById = id => root.querySelectorAll('[id]').find(node => node.attrs.id === id) ?? null;
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  return document;
}

async function boot(saved = [], { failWrites = false } = {}) {
  const document = documentFromHtml(), window = new EventTarget(), values = new Map(saved), writes = [], sounds = [], errors = [];
  const frames = new Map(); let nextFrame = 1, now = 0, state, drawCount = 0;
  const $ = id => { const node = document.getElementById(id); assert.ok(node, `HTML element #${id} exists`); return node; };
  const ruleBindings = { ...rules, createGame: (...args) => (state = rules.createGame(...args)) };
  const modules = {
    './rules.mjs': ruleBindings, './equipment.mjs': equipment, './theme.mjs': theme,
    './renderer.mjs': { createRenderer: async container => { const canvas = document.createElement('canvas'); container.append(canvas); return { canvas, draw: () => { drawCount++; }, dispose() { canvas.remove(); } }; } },
    './audio.mjs': { createGameAudio: () => ({ wake() {}, suspend() {}, dispose() {}, setEnabled() {}, play: name => sounds.push(name) }) },
  };
  const bindings = {};
  const body = gameSource.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\r?$/gm, (_, names, file) => {
    assert.ok(modules[file], `mocked browser boundary ${file}`);
    for (const name of names.split(',').map(name => name.trim())) { assert.ok(name in modules[file], `module export ${name}`); bindings[name] = modules[file][name]; }
    return '';
  });
  assert.doesNotMatch(body, /^import /m);
  Object.assign(bindings, {
    document, window, Element, AbortController: Controller,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error('storage unavailable'); writes.push(key); values.set(key, value); } },
    performance: { now: () => now },
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    console: { error: (...args) => errors.push(args) },
  });
  await new AsyncFunction(...Object.keys(bindings), body)(...Object.values(bindings));
  assert.deepEqual(errors, []); assert.equal($('start-btn').disabled, false);
  return { $, document, window, values, writes, sounds, get state() { return state; }, get drawCount() { return drawCount; },
    tick(ms = 50) { now += ms; const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(now); assert.deepEqual(errors, []); },
    touch(target, type, x, y) { return target.dispatch(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }); },
    dispose() { window.dispatch('pagehide', { persisted: false }); },
  };
}
const envelope = progress => JSON.stringify({ progress, sound: false });

test('play starts without central guidance cards while numeric HUD and quest icon remain', async () => {
  const app = await boot([['grove-warden:v9', envelope({ xp: 120, skills: { owl: 1, roots: 1 } })]]);
  try {
    app.$('start-btn').click(); app.tick();
    assert.equal(app.state.phase, 'playing');
    for (const id of ['skill-status', 'form-status', 'direction-guide', 'hunt-status', 'field-status']) assert.equal(app.document.getElementById(id), null, `${id} is removed from play DOM`);
    assert.ok(!app.document.getElementById('toast')?.textContent.trim(), 'start creates no central toast');
    for (const id of ['hp-value', 'gold-value', 'level-value', 'xp-value', 'cargo-value']) assert.match(app.$(id).textContent, /\d/);
    assert.equal(app.$('quest-menu').hidden, true); assert.equal(app.$('quest-btn').disabled, false);
    assert.equal(app.$('quest-menu').contains(app.$('quest-title')), true);
    assert.equal(app.$('quest-menu').contains(app.$('claim-btn')), true);
  } finally { app.dispose(); }
});

test('quest dialog pauses touch play, blocks movement, and resumes without stale held input', async () => {
  const app = await boot();
  try {
    app.$('start-btn').click();
    app.touch(app.$('viewport'), 'pointerdown', 50, 300); app.touch(app.$('game-shell'), 'pointermove', 74, 300); app.tick();
    assert.ok(app.state.player.x > 0, 'touch movement worked before dialog');
    app.$('quest-btn').click();
    assert.equal(app.state.phase, 'paused'); assert.equal(app.$('quest-menu').hidden, false);
    assert.equal(app.document.activeElement, app.$('quest-close-btn'));
    assert.equal(app.$('joystick').hidden, true); assert.equal(app.$('game-shell').hasPointerCapture(7), false);
    const before = structuredClone(app.state);
    app.touch(app.$('quest-title'), 'pointerdown', 80, 320); app.touch(app.$('game-shell'), 'pointermove', 110, 320);
    app.window.dispatch('keydown', { code: 'KeyD' }); app.tick(200);
    assert.equal(app.state.time, before.time); assert.equal(app.state.player.x, before.player.x); assert.deepEqual(app.state.enemies, before.enemies);
    app.$('quest-close-btn').click(); app.tick();
    assert.equal(app.state.phase, 'playing'); assert.equal(app.$('quest-menu').hidden, true);
    assert.equal(app.state.player.x, before.player.x, 'closing does not resume the old stick or paused key');
    app.touch(app.$('viewport'), 'pointerdown', 50, 300); app.touch(app.$('game-shell'), 'pointermove', 74, 300); app.tick();
    assert.ok(app.state.player.x > before.player.x, 'new touch movement works after closing');
  } finally { app.dispose(); }
});

test('completed boss quest claims once while paused, opens deep forest, and saves before closing', async () => {
  const bossId = rules.HUNT_ZONES.find(zone => zone.id === 'meadow-boss').bossId;
  const app = await boot([['grove-warden:v9', envelope({ questIndex: 3, bosses: [bossId], gold: 10 })]]);
  try {
    app.$('start-btn').click(); const before = app.state.progress.gold;
    assert.equal(rules.isStageUnlocked(app.state.progress, 'deep'), false);
    assert.equal(app.$('quest-badge').hidden, false);
    app.$('claim-btn').click(); assert.equal(app.state.progress.questIndex, 3, 'claim is unavailable outside the quest dialog');
    app.$('quest-btn').click(); assert.equal(app.$('claim-btn').disabled, false);
    app.$('claim-btn').click();
    assert.equal(app.state.phase, 'paused'); assert.equal(app.state.progress.questIndex, 4);
    assert.equal(app.state.progress.gold, before + 65); assert.equal(rules.isStageUnlocked(app.state.progress, 'deep'), true);
    assert.equal(app.$('quest-badge').hidden, true);
    const after = structuredClone(app.state.progress);
    app.$('claim-btn').click(); app.tick();
    assert.deepEqual(app.state.progress, after); assert.equal(app.sounds.filter(name => name === 'quest').length, 1);
    const saved = JSON.parse(app.values.get('grove-warden:v9')).progress;
    assert.equal(saved.questIndex, 4); assert.equal(saved.gold, before + 65); assert.equal(saved.unlockedDeep, true);
    app.$('quest-close-btn').click(); app.tick();
    assert.equal(app.state.phase, 'playing'); assert.equal(app.sounds.filter(name => name === 'quest').length, 1, 'queued UI acknowledgement prevents reward replay');
  } finally { app.dispose(); }
});

test('client prefers v9, preserves old saves and applies the v8 inventory migration once', async () => {
  const legacy = { version: 8, gold: 812, xp: 2400, cargo: 12, checkpoint: 'ancient', questIndex: 9,
    upgrades: { attack: 8, health: 6, bag: 6 }, skills: { owl: 3, roots: 3 }, forms: { wolf: 2, bear: 2, dragon: 2 },
    gear: { equipped: 'moon', scrolls: 17, items: { moon: { copies: 5, level: 20, tier: 3 } } } };
  const legacySeven = { ...legacy, version: 7 };
  const modern = { ...rules.normalizeProgress(legacy), gold: 999, weapon: 'axe', skills: { owl: 100, roots: 100 } };
  for (const [entries, expected] of [
    [[['grove-warden:v8', envelope(legacy)]], legacy],
    [[['grove-warden:v9', 'broken'], ['grove-warden:v8', envelope(legacy)]], legacy],
    [[['grove-warden:v7', envelope(legacySeven)]], legacySeven],
    [[['grove-warden:v9', envelope(modern)], ['grove-warden:v8', envelope(legacy)]], modern],
  ]) {
    const app = await boot(entries);
    try {
      assert.deepEqual(rules.exportProgress(app.state), rules.normalizeProgress(expected));
      app.$('start-btn').click(); assert.ok(app.writes.every(key => key === 'grove-warden:v9'));
      for (const [key, value] of entries.filter(([key]) => key !== 'grove-warden:v9')) assert.equal(app.values.get(key), value);
      const saved = JSON.parse(app.values.get('grove-warden:v9')).progress;
      assert.equal(saved.version, 9); assert.equal(saved.gear, undefined);
      const reloaded = await boot([...app.values]);
      try { assert.deepEqual(rules.exportProgress(reloaded.state), saved, 'v9 reload neither loses progress nor repeats the old inventory refund'); }
      finally { reloaded.dispose(); }
    } finally { app.dispose(); }
  }
  const app = await boot([], { failWrites: true });
  try { app.$('start-btn').click(); app.tick(); assert.equal(app.state.phase, 'playing'); assert.equal(app.$('save-warning').hidden, false); assert.equal(app.$('save-indicator').hidden, false); assert.ok(app.drawCount > 0); }
  finally { app.dispose(); }
});

test('four growth menus keep animal tabs informational and purchase only the viewed form', async () => {
  const app = await boot([['grove-warden:v9', envelope({ xp: 120, gold: 500 })]]);
  try {
    app.$('start-btn').click();
    assert.deepEqual(app.document.querySelectorAll('[data-growth]').map(button => button.dataset.growth), ['stats', 'druid', 'forms', 'weapons']);
    for (const id of ['growth-wolf-btn', 'growth-bear-btn', 'growth-dragon-btn', 'stats-pages', 'equipment-panel', 'equipment-list', 'equipment-scrolls']) assert.equal(app.document.getElementById(id), null);
    app.$('growth-forms-btn').click();
    assert.equal(app.state.phase, 'paused'); assert.equal(app.$('growth-title').textContent, '변신');
    assert.equal(app.$('form-tabs').hidden, false); assert.equal(app.$('weapon-panel').hidden, true);
    const progress = structuredClone(app.state.progress), player = structuredClone(app.state.player);
    app.$('form-bear-tab').click(); app.$('form-dragon-tab').click();
    assert.deepEqual(app.state.progress, progress); assert.deepEqual(app.state.player, player);
    assert.equal(app.document.activeElement, app.$('form-dragon-tab'));
    assert.equal(app.$('form-dragon-tab').getAttribute('aria-pressed'), 'true');
    assert.match(app.$('growth-list').textContent, /용/);
    assert.equal(app.$('growth-list').querySelector('button').disabled, true, 'locked forms remain viewable without becoming available');
    app.$('form-wolf-tab').click();
    const offer = rules.getFormOffer(app.state, 'wolf');
    app.$('growth-list').querySelector('button').click();
    assert.equal(app.state.progress.forms.wolf, 1); assert.equal(app.state.progress.forms.bear, 0); assert.equal(app.state.progress.forms.dragon, 0);
    assert.equal(app.state.progress.gold, progress.gold - offer.cost); assert.equal(app.state.player.form, 'druid');
    assert.match(app.$('growth-list').textContent, /2\/100/);
  } finally { app.dispose(); }
});

test('all seven free weapons select once at camp, save immediately, and reject field selection', async () => {
  const app = await boot([['grove-warden:v9', envelope({ xp: 120, gold: 1000 })]]);
  try {
    app.$('start-btn').click(); app.$('growth-weapons-btn').click();
    assert.equal(app.state.phase, 'paused'); assert.equal(app.$('growth-title').textContent, '무기');
    assert.equal(app.$('growth-resources').hidden, true); assert.equal(app.$('form-tabs').hidden, true);
    const buttons = app.$('weapon-list').querySelectorAll('button[data-weapon]');
    assert.deepEqual(buttons.map(button => button.dataset.weapon), equipment.WEAPONS.map(weapon => weapon.id));
    assert.equal(buttons.length, 7); assert.match(app.$('weapon-list').textContent, /숲의 검/); assert.match(app.$('weapon-list').textContent, /숲의 도끼/); assert.match(app.$('weapon-list').textContent, /숲의 창/);
    assert.doesNotMatch(app.$('weapon-list').textContent, /두루마리|승급|보유|강화/);
    const before = structuredClone(app.state.progress), revision = app.state.revision;
    const axe = buttons.find(button => button.dataset.weapon === 'axe'); axe.click();
    assert.equal(app.state.progress.weapon, 'axe'); assert.equal(app.state.progress.gold, before.gold);
    assert.equal(app.state.revision, revision + 1); assert.equal(app.state.player.form, 'druid');
    assert.equal(axe.disabled, true); assert.equal(axe.getAttribute('aria-pressed'), 'true');
    const selected = structuredClone(app.state.progress); axe.click(); assert.deepEqual(app.state.progress, selected);
    assert.equal(app.sounds.filter(name => name === 'upgrade').length, 1);
    assert.equal(JSON.parse(app.values.get('grove-warden:v9')).progress.weapon, 'axe');
    app.$('growth-close-btn').click(); app.tick();
    assert.equal(app.sounds.filter(name => name === 'upgrade').length, 1, 'queued selection feedback is acknowledged once');
    app.state.player.x = 0; app.state.player.z = 0; app.state.enemies = []; app.state.spawners = []; app.tick();
    assert.equal(app.state.inCamp, false); app.$('growth-weapons-btn').click();
    const sword = app.$('weapon-list').querySelectorAll('button').find(button => button.dataset.weapon === 'sword');
    assert.equal(sword.disabled, true); sword.dispatch('click');
    assert.equal(app.state.progress.weapon, 'axe'); assert.equal(app.state.progress.gold, before.gold);
  } finally { app.dispose(); }
});

test('actual melee swings use the existing light or heavy sound once per attack event', async () => {
  for (const weapon of ['sword', 'axe', 'spear']) {
    const app = await boot([['grove-warden:v9', envelope({ weapon })]]);
    try {
      app.$('start-btn').click();
      app.state.player.x = 0; app.state.player.z = 0; app.state.player.attackCd = 0;
      app.state.spawners = [];
      app.state.fieldEvents.nextDiscovery = app.state.fieldEvents.nextHazard = 1e9;
      app.state.enemies = [{ id: app.state.nextId++, type: 'mushroom', trait: 'normal', stageId: 'meadow', zoneId: 'meadow-mushrooms',
        x: 1, z: 0, homeX: 1, homeZ: 0, hp: 1000, maxHp: 1000, radius: .4, speed: 0, damage: 0, attackCd: 999, phase: 'stunned', phaseTime: 999 }];
      app.tick(50);
      assert.ok(app.state.enemies[0].hp < 1000);
      assert.equal(app.sounds.filter(name => name === (weapon === 'axe' ? 'bear-slam' : 'wolf-swipe')).length, 1);
      assert.equal(app.sounds.includes('melee-attack'), false);
    } finally { app.dispose(); }
  }
});
