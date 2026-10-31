import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, WORLD, STORAGE_KEY, RECRUIT_THRESHOLDS, createGame, stepGame,
  recruitFriend, selectHero, upgradeDefinitions, upgradeValue, upgradeCost, upgrade, useSkill,
  restartRun, serializeProfile, loadProfile, saveProfile, beginSpring } from '../rules.mjs';
const fixed = () => .5;
function seeded(seed = 1) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function advance(state, seconds, input = {}, rng = fixed, autoRecruit = false) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    stepGame(state, 1 / 60, input, rng);
    if (autoRecruit && state.encounter?.phase === 'ready') recruitFriend(state, state.encounter.id);
    if (autoRecruit && state.journey.phase === 'home') beginSpring(state, rng);
  }
}
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function fullProfile(extra = {}) { return { version: 3, harvested: 100, recruited: HEROES.map(h => h.id), ...extra }; }
function node(id, kind, x, y, hp = 100) { return { id, kind, x, y, hp, maxHp: hp, radius: 20, size: 1, hurtTimer: 0, animTime: 0, claimedBy: null }; }
function shot(x, y, damage = 20) { return { id: 10001, x, y, vx: 1000, vy: 0, damage, radius: 6, life: 1, owner: 'squirrel' }; }
function isolate(state, targets) { state.targets = targets; state.nextRowY = state.hero.y - 1000; state.hero.actionTimer = 1000; }

test('only squirrel starts and the roster cannot unlock or replace the leader', () => {
  const state = createGame({}, fixed);
  assert.deepEqual(state.recruited, ['squirrel']); assert.equal(state.workers.length, 1);
  assert.strictEqual(state.hero, state.workers[0]); assert.equal(state.hero.id, 'squirrel');
  assert.equal(selectHero(state, 'bear'), false); assert.equal(upgradeCost(state, 'impact', 'bear'), null);
  assert.equal(state.encounter, null); assert.equal(state.hero.hp, undefined);
  assert.ok(state.targets.some(n => n.kind === 'berry'));
  assert.ok(state.targets.some(n => n.kind === 'bamboo'));
  assert.ok(state.targets.some(n => n.kind === 'grain'));
});

test('friends require thresholds, physical approach and sequential explicit recruitment', () => {
  const state = createGame({ harvested: 100 }, fixed);
  const leader = state.hero;
  assert.equal(state.encounter.id, 'bear'); assert.equal(state.encounter.phase, 'waiting');
  assert.equal(recruitFriend(state, 'bear'), false); assert.equal(recruitFriend(state, 'sparrow'), false);
  for (const id of ['bear', 'fox', 'redpanda', 'sparrow']) {
    assert.equal(state.encounter.id, id);
    const start = { x: leader.x, y: leader.y };
    for (let i = 0; i < 240 && state.encounter.phase !== 'ready'; i++) stepGame(state, 1 / 60, {}, fixed);
    assert.equal(state.encounter.phase, 'ready'); assert.ok(Math.hypot(leader.x - start.x, leader.y - start.y) > 40);
    assert.equal(recruitFriend(state, id), true); assert.equal(recruitFriend(state, id), false);
    assert.strictEqual(state.hero, leader); assert.equal(state.workers.at(-1).id, id);
    assert.ok(state.targets.some(n => n.kind === (id === 'bear' ? 'oak' : id === 'fox' ? 'berry' : id === 'redpanda' ? 'bamboo' : 'grain')));
    stepGame(state, 1 / 60, {}, fixed);
  }
  assert.equal(state.workers.length, 5); assert.equal(state.encounter, null);
  assert.equal(new Set(state.workers.map(w => w.id)).size, 5);
});

test('natural progress recruits one at a time and all five simultaneously produce their own materials', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const rng = seeded(seed), state = createGame({}, rng);
    advance(state, 300, {}, rng, true);
    assert.equal(state.recruited.length, 5);
    for (const worker of state.workers) {
      assert.ok(state.members[worker.id].materials > 5, worker.id);
      assert.ok(state.members[worker.id].level > 1, worker.id);
      assert.ok(Math.hypot(worker.x - state.hero.x, worker.y - state.hero.y) < 500, worker.id);
    }
    assert.ok(state.targets.length <= 36 && state.projectiles.length <= 90 && state.effects.length <= 120);
    assert.equal(state.hero.id, 'squirrel'); assert.ok(state.distance > 1000);
  }
});

test('bear reserves a nearby tree and cannot slam it from ranged distance', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed), bear = state.workers.find(w => w.id === 'bear');
  isolate(state, [node(1000, 'oak', 500, state.hero.y, 1000)]);
  bear.x = 150; bear.y = state.hero.y;
  const before = state.targets[0].hp;
  stepGame(state, .1, {}, fixed);
  assert.equal(state.targets[0].hp, before); assert.equal(bear.actionCount, 0);
  assert.equal(state.targets[0].claimedBy, 'bear');
  advance(state, 3);
  assert.ok(bear.actionCount > 0); assert.ok(state.targets[0].hp < before);
  assert.ok(Math.hypot(bear.x - state.targets[0].x, bear.y - state.targets[0].y) <= bear.range + .01);
});

test('reserved bear trees cannot be stolen by the leader acorns', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed), bear = state.workers.find(w => w.id === 'bear');
  isolate(state, [node(1000, 'oak', 500, state.hero.y, 100)]);
  bear.x = 500; bear.y = state.hero.y; bear.actionTimer = 10;
  state.projectiles = [shot(450, state.hero.y, 200)];
  stepGame(state, .1, {}, fixed);
  assert.equal(state.targets[0].hp, 100); assert.equal(state.members.squirrel.materials, 0);
  bear.actionTimer = 0; advance(state, 3);
  assert.ok(state.members.bear.materials > 0); assert.equal(state.members.squirrel.materials, 0);
});

test('fox directly picks berries, and only its material and experience counters increase', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed), fox = state.workers.find(w => w.id === 'fox');
  fox.x = state.hero.x; fox.y = state.hero.y;
  isolate(state, Array.from({ length: 5 }, (_, i) => node(1000 + i, 'berry', fox.x + 20 + i, fox.y, 18)));
  const before = state.harvested;
  advance(state, 4);
  assert.equal(state.harvested - before, 5); assert.ok(state.members.fox.materials >= 10);
  assert.equal(state.members.fox.level, 2);
  for (const id of ['squirrel', 'bear', 'redpanda', 'sparrow']) {
    assert.equal(state.members[id].materials, 0); assert.equal(state.members[id].level, 1);
  }
});

test('fox personal levels increase actual picking output without improving other members', () => {
  const results = [];
  for (const level of [1, 6]) {
    const state = createGame(fullProfile({ autoMove: false, members: { fox: { level } } }), fixed);
    const fox = state.workers.find(w => w.id === 'fox');
    fox.x = state.hero.x; fox.y = state.hero.y;
    isolate(state, Array.from({ length: 30 }, (_, i) => node(1000 + i, 'berry', fox.x + 20 + i * .2, fox.y, 18)));
    const rate = fox.rate;
    advance(state, 12);
    results.push({ rate, materials: state.members.fox.materials });
    for (const id of ['squirrel', 'bear', 'redpanda', 'sparrow']) {
      assert.equal(state.members[id].level, 1);
      assert.equal(state.members[id].materials, 0);
    }
  }
  assert.ok(results[1].rate > results[0].rate);
  assert.ok(results[1].materials > results[0].materials);
});

test('red panda cuts nearby bamboo together while sparrow pecks only grain', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed);
  const panda = state.workers.find(w => w.id === 'redpanda'), bird = state.workers.find(w => w.id === 'sparrow');
  panda.x = bird.x = state.hero.x; panda.y = bird.y = state.hero.y;
  isolate(state, [node(1000, 'bamboo', panda.x + 20, panda.y, 100), node(1001, 'bamboo', panda.x + 45, panda.y, 100), node(1002, 'grain', bird.x - 20, bird.y, 100)]);
  stepGame(state, .1, {}, fixed);
  advance(state, .36);
  assert.ok(state.targets.find(n => n.id === 1000).hp < 100);
  assert.ok(state.targets.find(n => n.id === 1001).hp < 100);
  assert.ok(state.targets.find(n => n.id === 1002).hp < 100);
  assert.equal(panda.actionCount, 1); assert.equal(bird.actionCount, 1);
  assert.equal(state.hero.actionCount, 0);
});

test('bear combo and sparrow multi-peck continue into another nearby node after a weak target breaks', () => {
  for (const [id, key, kind, hp] of [['bear', 'combo', 'oak', 25], ['sparrow', 'multiPeck', 'grain', 11]]) {
    const harvested = [];
    for (const level of [0, 1]) {
      const state = createGame(fullProfile({ autoMove: false, members: { [id]: { upgrades: { [key]: level } } } }), fixed);
      const worker = state.workers.find(w => w.id === id);
      worker.x = state.hero.x; worker.y = state.hero.y;
      isolate(state, [node(1000, kind, worker.x + 20, worker.y, hp), node(1001, kind, worker.x + 55, worker.y, hp)]);
      const before = state.harvested;
      stepGame(state, .1, {}, fixed);
      advance(state, .36);
      harvested.push(state.harvested - before);
    }
    assert.deepEqual(harvested, [1, 2], id);
  }
});

test('red panda regrowth recreates harvested bamboo while the team remains nearby', () => {
  const state = createGame(fullProfile({ autoMove: false, members: { redpanda: { upgrades: { regrowth: 30 } } } }), fixed);
  const worker = state.workers.find(w => w.id === 'redpanda');
  worker.x = state.hero.x; worker.y = state.hero.y;
  isolate(state, [node(1000, 'bamboo', worker.x + 20, worker.y, 1)]);
  stepGame(state, .1, {}, () => 0);
  advance(state, .36, {}, () => 0);
  assert.equal(state.regrowth.length, 1);
  advance(state, 2.51, {}, () => 0);
  assert.ok(state.targets.some(n => n.kind === 'bamboo' && n.id !== 1000));
});

test('a companion anticipates before impact and grants each harvest only once at the contact frame', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed), bear = state.workers.find(w => w.id === 'bear');
  bear.x = state.hero.x; bear.y = state.hero.y;
  isolate(state, [node(1000, 'oak', bear.x + 20, bear.y, 25)]);
  const before = state.harvested;
  stepGame(state, 1 / 60, {}, fixed);
  assert.equal(bear.actionCount, 1); assert.ok(bear.pendingAction);
  advance(state, .30);
  assert.equal(state.targets[0].hp, 25); assert.equal(state.harvested, before);
  assert.equal(state.members.bear.materials, 0);
  advance(state, .05);
  assert.equal(bear.pendingAction, null); assert.equal(state.harvested, before + 1);
  assert.equal(state.members.bear.materials, 3);
  advance(state, .2);
  assert.equal(state.harvested, before + 1); assert.equal(state.members.bear.materials, 3);
});

test('a helper finishes recovery with planted feet before walking to the next job', () => {
  const state=createGame(fullProfile({autoMove:false}),fixed),bear=state.workers.find(w=>w.id==='bear');
  bear.x=state.hero.x;bear.y=state.hero.y;
  isolate(state,[node(1000,'oak',bear.x+20,bear.y,25),node(1001,'oak',bear.x+150,bear.y,100)]);
  stepGame(state,1/60,{},fixed);advance(state,.36);
  assert.equal(state.harvested,101);
  const position={x:bear.x,y:bear.y};
  advance(state,.15);
  assert.equal(bear.mode,'recover');assert.equal(bear.moving,false);
  assert.deepEqual({x:bear.x,y:bear.y},position);
  advance(state,.2);
  assert.ok(bear.x>position.x);assert.ok(bear.travelled>0);
});

test('squirrel releases the acorn after its throw preparation instead of at pose start', () => {
  const state=createGame({autoMove:false},fixed);
  isolate(state,[node(1000,'oak',state.hero.x+200,state.hero.y,1000)]);state.hero.actionTimer=0;
  stepGame(state,1/60,{},fixed);
  assert.equal(state.hero.actionCount,1);assert.equal(state.shotCount,0);assert.ok(state.hero.pendingThrow);
  advance(state,.2);assert.equal(state.shotCount,0);
  advance(state,.12);assert.equal(state.shotCount,1);
  assert.equal(state.hero.pendingThrow,null);assert.ok(state.projectiles.length>0);
});

test('a vanished throw target cancels the squirrel pose without releasing an acorn', () => {
  const state=createGame({},fixed);state.autoMove=false;
  isolate(state,[node(9000,'oak',state.hero.x+80,state.hero.y)]);
  state.hero.actionTimer=0;
  stepGame(state,1/60,{},fixed);
  assert.ok(state.hero.pendingThrow);
  state.targets=[];
  advance(state,.36);
  assert.equal(state.hero.pendingThrow,null);
  assert.equal(state.hero.actionCancelled,true);
  assert.equal(state.shotCount,0);
});

test('pending contact is cancelled when the target disappears, leaves range or the leader pulls the worker away', () => {
  for (const change of ['gone', 'range', 'leash']) {
    const state = createGame(fullProfile({ autoMove: false }), fixed), bear = state.workers.find(w => w.id === 'bear');
    bear.x = state.hero.x; bear.y = state.hero.y;
    const target = node(1000, 'oak', bear.x + 20, bear.y, 25);
    isolate(state, [target]);
    stepGame(state, 1 / 60, {}, fixed);
    assert.ok(bear.pendingAction);
    if (change === 'gone') state.targets = [];
    if (change === 'range') target.x += 300;
    if (change === 'leash') state.hero.y -= 500;
    stepGame(state, .1, {}, fixed);
    assert.equal(bear.pendingAction, null, change);
    advance(state, .3);
    assert.equal(target.hp, 25, change); assert.equal(state.members.bear.materials, 0, change);
  }
});

test('two acorns cannot duplicate reward from a single chopped node', () => {
  const state = createGame({ autoMove: false }, fixed);
  isolate(state, [node(1000, 'oak', 500, state.hero.y, 1)]);
  state.projectiles = [shot(450, state.hero.y), { ...shot(450, state.hero.y), id: 10002 }];
  stepGame(state, .1, {}, fixed);
  assert.equal(state.harvested, 1); assert.equal(state.coins, 24); assert.equal(state.members.squirrel.materials, 2);
});

test('each animal has different upgrades and inspection leaves all workers and camera leader intact', () => {
  const members = Object.fromEntries(HEROES.map(h => [h.id, { materials: 100 }]));
  const state = createGame(fullProfile({ coins: 10000, members }), fixed), leader = state.hero, position = { x: leader.x, y: leader.y };
  assert.equal(new Set(HEROES.flatMap(h => upgradeDefinitions(h.id).map(d => d.key))).size, 15);
  for (const { id } of HEROES) {
    const definition = upgradeDefinitions(id)[0], otherBefore = state.members.squirrel.upgrades.power;
    if (id !== state.selectedHeroId) assert.equal(selectHero(state, id), true);
    const value = upgradeValue(state, definition.key), cost = upgradeCost(state, definition.key);
    assert.equal(cost.resource, HEROES.find(h => h.id === id).resource);
    assert.equal(upgrade(state, definition.key), true); assert.ok(upgradeValue(state, definition.key) > value);
    if (id !== 'squirrel') assert.equal(state.members.squirrel.upgrades.power, otherBefore);
    assert.strictEqual(state.hero, leader); assert.equal(leader.x, position.x); assert.equal(leader.y, position.y);
    assert.equal(state.workers.length, 5);
  }
});

test('insufficient materials and locked upgrades cannot spend shared coins', () => {
  const state = createGame({ coins: 10000 }, fixed), before = state.coins;
  assert.equal(upgrade(state, 'power'), false); assert.equal(upgrade(state, 'impact', 'bear'), false);
  assert.equal(state.coins, before); assert.equal(state.members.bear.upgrades.impact, 0);
  assert.equal(selectHero(state, 'invalid'), false);
});

test('manual movement overrides automation and followers return after the leader leaves their node', () => {
  const state = createGame(fullProfile({ autoMove: false }), fixed), start = { x: state.hero.x, y: state.hero.y };
  stepGame(state, .1, { x: 1, y: -1 }, fixed);
  assert.ok(Math.abs(Math.hypot(state.hero.x - start.x, state.hero.y - start.y) - state.hero.speed * .1) < 1e-8);
  advance(state, 20, { x: 1, y: -1 });
  assert.ok(state.hero.x <= WORLD.width - WORLD.margin); assert.ok(state.hero.y < 0);
  for (const worker of state.workers.slice(1)) assert.ok(Math.hypot(worker.x - state.hero.x, worker.y - state.hero.y) < 600);
  const distanceBefore = state.distance;
  advance(state, 25, { y: 1 }); assert.equal(state.distance, distanceBefore);
  const before = state.hero.y; stepGame(state, 10000, { y: -1 }, fixed);
  assert.ok(before - state.hero.y <= state.hero.speed * .1 + 1e-8);
});

test('stage progress counts thirty trees while other resources still count towards encounters', () => {
  const state = createGame({ autoMove: false, harvested: 29, treesHarvested: 29, groveHarvested: 29 }, fixed);
  isolate(state, [node(1000, 'oak', 500, state.hero.y, 1)]); state.projectiles = [shot(450, state.hero.y)];
  stepGame(state, .1, {}, fixed);
  assert.equal(state.tier, 2); assert.equal(state.waveKills, 0); assert.equal(state.waveTotal, 30);
});

test('skill cooldown and restarting preserve all recruited members and personal growth', () => {
  const state = createGame(fullProfile({ coins: 123, members: { bear: { level: 3, materials: 20, upgrades: { impact: 2 } } } }), fixed);
  assert.equal(useSkill(state), true); assert.equal(useSkill(state), false);
  advance(state, 1); const profile = serializeProfile(state, 1); restartRun(state, fixed);
  assert.deepEqual(state.recruited, profile.recruited); assert.deepEqual(state.members, profile.members);
  assert.equal(state.coins, profile.coins); assert.equal(state.distance, profile.distance);
  assert.equal(state.hero.id, 'squirrel'); assert.equal(state.hero.y, WORLD.height * .65);
});

test('v2 migration preserves earned growth but schedules friends one at a time from squirrel', () => {
  const store = storage({ 'acorn-guard:v2': JSON.stringify({ version: 2, heroId: 'fox', coins: 180, harvested: 100,
    tier: 7, bestTier: 8, level: 4, xp: 8, upgrades: { damage: 2, rate: 1, yield: 3 }, savedAt: 1000 }) });
  const p = loadProfile(store, 1000), state = createGame(p, fixed);
  assert.equal(p.version, 4); assert.deepEqual(p.recruited, ['squirrel']); assert.equal(p.coins, 180);
  assert.deepEqual(p.members.squirrel.upgrades, { power: 2, burst: 1, bounty: 3 });
  assert.equal(p.members.squirrel.level, 4); assert.equal(p.members.squirrel.xp, 8);
  assert.equal(state.encounter.id, 'bear'); assert.equal(state.encounter.phase, 'waiting');
  assert.equal(state.selectedHeroId, 'squirrel'); assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).version, 4);
});

test('saved pending encounters cannot skip recruitment and corrupt rosters never create more than five workers', () => {
  const state = createGame({ harvested: RECRUIT_THRESHOLDS.bear }, fixed), store = storage();
  saveProfile(store, state, 1000); const restored = createGame(loadProfile(store, 1000), fixed);
  assert.equal(restored.encounter.id, 'bear'); assert.equal(restored.encounter.phase, 'waiting');
  for (const recruited of [['squirrel', 'sparrow', 'bear'], ['squirrel', 'bear', 'bear', 'fox'], HEROES.map(h => h.id).concat('fox')]) {
    const fresh = createGame({ version: 3, harvested: 100, recruited }, fixed);
    assert.ok(fresh.workers.length <= 5); assert.equal(new Set(fresh.recruited).size, fresh.recruited.length);
  }
  assert.equal(createGame(fullProfile({ harvested: 0 }), fixed).workers.length, 1);
});

test('null and malformed personal growth records recover without blocking game startup', () => {
  for (const members of [{ squirrel: null }, { squirrel: 'bad' }, { bear: null }]) {
    const saved = { version: 3, harvested: 8, recruited: ['squirrel', 'bear'], members };
    const profile = loadProfile(storage({ [STORAGE_KEY]: JSON.stringify(saved) }), 1000);
    const state = createGame(profile, fixed);
    assert.equal(state.workers.length, 2);
    assert.equal(state.members.squirrel.level, 1);
    assert.equal(state.members.bear.level, 1);
    assert.equal(state.members.bear.upgrades.impact, 0);
  }
});

test('offline income caps at eight hours, consumes once, and storage denial does not stop gathering', () => {
  const store = storage(), state = createGame(fullProfile({ tier: 8, bestTier: 8, coins: 80 }), fixed), start = 1000000;
  saveProfile(store, state, start);
  const p = loadProfile(store, start + 86400000); assert.equal(p.offlineReward, 480 * 20);
  const again = loadProfile(store, start + 86400000); assert.equal(again.offlineReward, 0); assert.equal(again.coins, p.coins);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const fallback = createGame(loadProfile(denied, 1000), fixed); assert.equal(saveProfile(denied, fallback), false);
  advance(fallback, 6); assert.ok(fallback.harvested > 0);
  const bad = loadProfile(storage({ [STORAGE_KEY]: '{' }), 1000); assert.equal(bad.coins, 0); assert.deepEqual(bad.recruited, ['squirrel']);
});
