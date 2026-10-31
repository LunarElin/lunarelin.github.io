import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, SEASONS, YEAR_HARVESTS, DECORATIONS, STORAGE_KEY, LEGACY_STORAGE_KEY,
  createGame, stepGame, recruitFriend, seasonStatus, decorationCost, craftDecoration,
  cycleDecorationStyle, toggleDecoration, homeComfort, beginSpring, useSkill,
  restartRun, serializeProfile, saveProfile, loadProfile } from '../rules.mjs';

const fixed = () => .5;
const roster = HEROES.map(hero => hero.id);
function profile(extra = {}) {
  return { version: 4, harvested: 100, recruited: roster, autoMove: false,
    members: Object.fromEntries(roster.map(id => [id, { level: 3, materials: 100 }])), ...extra };
}
function winter(extra = {}) { return createGame(profile({ journey: { year: 2, harvests: YEAR_HARVESTS, foodByType: { acorn: 20, berries: 10, grain: 6 } }, ...extra }), fixed); }
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function target(id, kind, x, y, hp = 1) {
  return { id, kind, x, y, hp, maxHp: hp, radius: 20, size: 1, hurtTimer: 0, animTime: 0, claimedBy: null };
}
function singleTree(state) {
  state.targets = [{ ...target(10000, 'oak', 500, state.hero.y), claimedBy: 'squirrel' }];
  state.nextRowY = state.hero.y - 1000; state.hero.actionTimer = 1000; state.hero.targetId = 10000;
  state.projectiles = [{ id: 20000, x: 450, y: state.hero.y, vx: 1000, vy: 0, damage: 100, radius: 6, life: 1, owner: 'squirrel' }];
  stepGame(state, .1, {}, fixed);
}
function advance(state, seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) stepGame(state, 1 / 60, {}, fixed); }

test('a new year begins in spring and exact harvest boundaries advance through all seasons', () => {
  assert.deepEqual(SEASONS.map(season => season.id), ['spring', 'summer', 'autumn', 'winter']);
  const fresh = createGame({}, fixed), start = seasonStatus(fresh);
  assert.equal(start.year, 1); assert.equal(start.index, 0); assert.equal(start.progress, 0);
  assert.equal(start.food, 0); assert.equal(start.foodGoal, 120); assert.equal(start.atHome, false);
  for (const [before, after, season] of [[0, 1, 0], [35, 36, 1], [71, 72, 2], [107, 108, 3]]) {
    const state = createGame({ version: 4, autoMove: false, journey: { harvests: before } }, fixed);
    const earlier = seasonStatus(state); singleTree(state); const later = seasonStatus(state);
    assert.equal(later.harvests, after); assert.equal(later.index, season);
    assert.equal(later.position, after / 36); assert.ok(later.position > earlier.position);
    assert.equal(later.progress, after / YEAR_HARVESTS);
    assert.equal(later.atHome, after === YEAR_HARVESTS);
  }
});

test('walking, waiting and offline coins do not skip seasons or add food', () => {
  const state = createGame({ version: 4, journey: { harvests: 10 } }, fixed);
  state.targets = []; state.nextRowY = state.hero.y - 1000; state.hero.actionTimer = 1000;
  stepGame(state, .1, { x: 1 }, fixed);
  assert.equal(state.journey.harvests, 10); assert.equal(state.journey.food, 0);
  const store = storage(); saveProfile(store, state, 1000);
  const loaded = loadProfile(store, 1000 + 8 * 60 * 60 * 1000);
  assert.ok(loaded.offlineReward > 0); assert.equal(loaded.journey.harvests, 10); assert.equal(loaded.journey.food, 0);
});

test('pantry bookkeeping counts actual food rewards and leaves all personal materials usable', () => {
  const state = createGame(profile(), fixed);
  singleTree(state);
  assert.equal(state.members.squirrel.materials, 102);
  assert.deepEqual(state.journey.foodByType, { acorn: 2, berries: 0, grain: 0 });
  for (const [id, kind] of [['fox', 'berry'], ['sparrow', 'grain'], ['bear', 'oak']]) {
    const worker = state.workers.find(item => item.id === id);
    worker.x = state.hero.x; worker.y = state.hero.y; worker.actionTimer = 0;
    state.targets = [target(30000 + state.harvested, kind, worker.x + 20, worker.y)];
    state.nextRowY = state.hero.y - 1000; state.hero.actionTimer = 1000; state.projectiles = [];
    if (id === 'bear') state.targets[0].claimedBy = 'bear';
    advance(state, .5);
  }
  assert.equal(state.journey.harvests, 4);
  assert.deepEqual(state.journey.foodByType, { acorn: 2, berries: 2, grain: 2 });
  assert.equal(state.journey.food, 6); assert.equal(state.members.bear.materials, 103);
  assert.equal(state.members.fox.materials, 102); assert.equal(state.members.sparrow.materials, 102);
});

test('the final harvest enters winter once and cancels all pending work and projectiles', () => {
  const state = createGame(profile({ journey: { harvests: 107 } }), fixed);
  const bear = state.workers.find(worker => worker.id === 'bear');
  bear.x = state.hero.x; bear.y = state.hero.y; bear.combo = 5;
  state.targets = [target(50001, 'oak', bear.x + 20, bear.y), target(50002, 'oak', bear.x + 30, bear.y)];
  state.nextRowY = state.hero.y - 1000; state.hero.actionTimer = 1000;
  bear.targetId = 50001; bear.pendingAction = { targetId: 50001, time: .01 };
  state.hero.pendingThrow = { targetId: 50002, time: .01 };
  state.projectiles = [{ id: 60001, x: bear.x, y: bear.y, vx: 1000, vy: 0, damage: 999, radius: 100, life: 1 }];
  stepGame(state, .1, {}, fixed);
  assert.equal(state.harvested, 101); assert.equal(state.journey.harvests, 108); assert.equal(state.journey.phase, 'home');
  assert.deepEqual(state.projectiles, []); assert.deepEqual(state.regrowth, []); assert.equal(state.encounter, null);
  for (const worker of state.workers) {
    assert.equal(worker.pendingAction, null); assert.equal(worker.pendingThrow, null);
    assert.equal(worker.moving, false); assert.equal(worker.targetId, null);
  }
  const before = serializeProfile(state, 1000), position = { x: state.hero.x, y: state.hero.y };
  advance(state, 5); stepGame(state, .1, { x: 1, y: -1 }, fixed);
  assert.equal(useSkill(state), false); assert.equal(recruitFriend(state, 'sparrow'), false);
  assert.deepEqual(serializeProfile(state, 1000), before); assert.deepEqual({ x: state.hero.x, y: state.hero.y }, position);
});

test('natural gathering reaches the winter home without overshooting the annual quota', () => {
  let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const state = createGame({}, rng);
  for (let tick = 0; tick < 60 * 300 && state.journey.phase !== 'home'; tick++) {
    stepGame(state, 1 / 60, {}, rng);
    if (state.encounter?.phase === 'ready') recruitFriend(state, state.encounter.id);
  }
  assert.equal(state.journey.phase, 'home'); assert.equal(state.journey.harvests, 108);
  assert.equal(state.harvested, 108); assert.equal(state.recruited.length, 5);
  assert.ok(state.journey.food > 0); assert.equal(state.journey.year, 1);
});

test('decorating spends both real material costs atomically and never charges coins', () => {
  const state = winter(), coins = state.coins;
  assert.deepEqual(decorationCost(state, 'nest'), { wood: 12, grain: 2 });
  assert.equal(craftDecoration(state, 'nest'), true);
  assert.equal(state.members.bear.materials, 88); assert.equal(state.members.sparrow.materials, 98);
  assert.equal(state.homestead.decorations.nest.level, 1); assert.equal(state.homestead.decorations.nest.placed, true);
  assert.equal(homeComfort(state), 1); assert.equal(state.coins, coins);
  assert.deepEqual(decorationCost(state, 'nest'), { wood: 24, grain: 4 });
  state.members.sparrow.materials = 0;
  const wood = state.members.bear.materials;
  assert.equal(craftDecoration(state, 'nest'), false); assert.equal(state.members.bear.materials, wood);
  assert.equal(state.homestead.decorations.nest.level, 1);
  assert.equal(craftDecoration(state, 'invalid'), false); assert.equal(decorationCost(state, 'invalid'), null);
  const travelling = createGame(profile(), fixed);
  assert.equal(craftDecoration(travelling, 'nest'), false);
});

test('all six decorations have bounded levels, selectable style and reversible placement', () => {
  const state = winter();
  assert.equal(DECORATIONS.length, 6);
  assert.equal(cycleDecorationStyle(state, 'nest'), false); assert.equal(toggleDecoration(state, 'nest'), false);
  for (const decoration of DECORATIONS) {
    for (const hero of HEROES) state.members[hero.id].materials = 999;
    for (let level = 1; level <= 3; level++) {
      assert.equal(craftDecoration(state, decoration.id), true); assert.equal(state.homestead.decorations[decoration.id].level, level);
    }
    assert.equal(craftDecoration(state, decoration.id), false); assert.equal(decorationCost(state, decoration.id), null);
    assert.equal(cycleDecorationStyle(state, decoration.id), true);
    assert.equal(cycleDecorationStyle(state, decoration.id), true);
    assert.equal(cycleDecorationStyle(state, decoration.id), true);
    assert.equal(state.homestead.decorations[decoration.id].style, 0);
    assert.equal(toggleDecoration(state, decoration.id), true); assert.equal(state.homestead.decorations[decoration.id].placed, false);
    assert.equal(toggleDecoration(state, decoration.id), true); assert.equal(state.homestead.decorations[decoration.id].placed, true);
  }
  assert.equal(homeComfort(state), 18);
  assert.equal(toggleDecoration(state, 'nest'), true); assert.equal(homeComfort(state), 15);
  assert.equal(cycleDecorationStyle(state, 'invalid'), false);
});

test('next spring resets only the annual trip and preserves home, companions and growth', () => {
  const state = winter({ selectedHeroId: 'fox', coins: 456, tier: 5, bestTier: 6, distance: 1234 });
  craftDecoration(state, 'nest'); cycleDecorationStyle(state, 'nest'); toggleDecoration(state, 'nest');
  const old = serializeProfile(state, 1000);
  assert.equal(beginSpring(state, fixed), true); assert.equal(beginSpring(state, fixed), false);
  assert.deepEqual(state.journey, { year: 3, harvests: 0, foodByType: { acorn: 0, berries: 0, grain: 0 }, food: 0, phase: 'journey' });
  for (const key of ['members', 'recruited', 'selectedHeroId', 'coins', 'tier', 'bestTier', 'distance', 'homestead']) assert.deepEqual(state[key], old[key], key);
  assert.equal(state.targets.length > 0, true); assert.equal(state.hero.id, 'squirrel');
  assert.deepEqual(state.projectiles, []); assert.equal(seasonStatus(state).index, 0);
});

test('a friend ready on the final harvest remains an available encounter after winter and loading', () => {
  const state = createGame(profile({ recruited: roster.slice(0, 4), journey: { harvests: 107 } }), fixed);
  assert.equal(state.encounter.id, 'sparrow');
  state.hero.x = state.encounter.x; state.hero.y = state.encounter.y;
  singleTree(state);
  assert.equal(state.journey.phase, 'home'); assert.equal(state.encounter, null);
  assert.equal(state.recruited.includes('sparrow'), false);
  const store = storage(); saveProfile(store, state, 1000);
  const restored = createGame(loadProfile(store, 1000), fixed);
  assert.equal(beginSpring(restored, fixed), true);
  assert.equal(restored.encounter.id, 'sparrow'); assert.equal(restored.encounter.phase, 'waiting');
  assert.equal(recruitFriend(restored, 'sparrow'), false);
  restored.autoMove = true;
  for (let tick = 0; tick < 240 && restored.encounter.phase !== 'ready'; tick++) stepGame(restored, 1 / 60, {}, fixed);
  assert.equal(restored.encounter.phase, 'ready'); assert.equal(recruitFriend(restored, 'sparrow'), true);
  assert.equal(restored.recruited.length, 5);
});

test('saving and restarting in winter retain the home phase, inventory and decorations', () => {
  const state = winter(); craftDecoration(state, 'pantry'); cycleDecorationStyle(state, 'pantry');
  const store = storage(), before = serializeProfile(state, 1000);
  assert.equal(saveProfile(store, state, 1000), true);
  const restored = createGame(loadProfile(store, 1000), fixed);
  assert.deepEqual(serializeProfile(restored, 1000), before); assert.equal(restored.targets.length, 0);
  restartRun(restored, fixed);
  assert.deepEqual(serializeProfile(restored, 1000), before); assert.equal(restored.journey.phase, 'home');
});

test('v3 migration retains personal progress and starts a fresh spring without retroactive food', () => {
  const old = { ...profile({ coins: 789, selectedHeroId: 'fox', tier: 4 }), version: 3, savedAt: 1000,
    journey: { year: 9, harvests: 108, foodByType: { acorn: 999 } }, homestead: { decorations: { nest: { level: 3 } } } };
  const store = storage({ [LEGACY_STORAGE_KEY]: JSON.stringify(old) }), savedOld = store.getItem(LEGACY_STORAGE_KEY);
  const loaded = loadProfile(store, 1000);
  assert.equal(loaded.version, 4); assert.deepEqual(loaded.members, createGame(old, fixed).members);
  assert.deepEqual(loaded.recruited, roster); assert.equal(loaded.selectedHeroId, 'fox'); assert.equal(loaded.coins, 789);
  assert.equal(loaded.journey.year, 1); assert.equal(loaded.journey.harvests, 0); assert.equal(loaded.journey.food, 0);
  assert.equal(homeComfort(createGame(loaded, fixed)), 0); assert.equal(store.getItem(LEGACY_STORAGE_KEY), savedOld);
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).version, 4);
});

test('corrupted nested annual data and decoration records recover to bounded valid state', () => {
  const state = createGame(profile({ journey: { year: -10, harvests: -5, phase: 'home', food: 99999, foodByType: { acorn: NaN, grain: -1 } },
    homestead: { decorations: { nest: { level: 99, style: 99, placed: false }, pantry: null, rug: 'bad', unknown: { level: 99 } } } }), fixed);
  assert.equal(state.journey.year, 1); assert.equal(state.journey.harvests, 0); assert.equal(state.journey.phase, 'journey');
  assert.equal(state.journey.food, 0); assert.deepEqual(state.journey.foodByType, { acorn: 0, berries: 0, grain: 0 });
  assert.deepEqual(state.homestead.decorations.nest, { level: 3, style: 2, placed: false });
  assert.equal(state.homestead.decorations.pantry.level, 0); assert.equal(state.homestead.decorations.rug.level, 0);
  assert.equal(Object.keys(state.homestead.decorations).length, 6);
  for (const invalid of [null, 'bad', 4, []]) {
    const fresh = createGame(profile({ journey: invalid, homestead: invalid }), fixed);
    assert.equal(fresh.journey.phase, 'journey'); assert.equal(homeComfort(fresh), 0);
  }
});

test('corrupt new JSON can recover the intact previous save and denied storage stays playable', () => {
  const old = { ...profile({ coins: 71 }), version: 3, savedAt: 1000 };
  const restored = loadProfile(storage({ [STORAGE_KEY]: '{', [LEGACY_STORAGE_KEY]: JSON.stringify(old) }), 1000);
  assert.equal(restored.coins, 71); assert.equal(restored.version, 4);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const state = createGame(loadProfile(denied, 1000), fixed);
  assert.equal(saveProfile(denied, state), false); advance(state, 6); assert.ok(state.journey.harvests > 0);
});
