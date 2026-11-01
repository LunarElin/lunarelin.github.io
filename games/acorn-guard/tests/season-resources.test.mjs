import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, createGame, stepGame, seasonResourcePlan, resourcePlantVisibility, recruitFriend, beginSpring, serializeProfile } from '../rules.mjs';

const fixed = () => .5;
const trees = new Set(['oak', 'pine', 'golden']);
const expected = [
  { season: 'spring', tree: 4, berry: 1, bamboo: 3, grain: 1, total: 9 },
  { season: 'summer', tree: 3, berry: 3, bamboo: 2, grain: 2, total: 10 },
  { season: 'autumn', tree: 5, berry: 2, bamboo: 1, grain: 3, total: 11 },
];
function counts(nodes) {
  const result = { tree: 0, berry: 0, bamboo: 0, grain: 0 };
  for (const node of nodes) result[trees.has(node.kind) ? 'tree' : node.kind]++;
  return result;
}
function profile(harvests) { return { version: 4, autoMove: false, journey: { year: 2, harvests } }; }

test('each season prepares three complete zones with its own resource count and mix', () => {
  for (let season = 0; season < 3; season++) {
    const state = createGame(profile(season * 36), fixed), plan = expected[season];
    assert.deepEqual(seasonResourcePlan(state), plan);
    assert.equal(state.targets.length, [27, 30, 33][season]);
    assert.deepEqual(counts(state.targets), Object.fromEntries(['tree', 'berry', 'bamboo', 'grain'].map(kind => [kind, plan[kind] * 3])));
    for (let row = 0; row < 3; row++) {
      assert.deepEqual(counts(state.targets.slice(row * plan.total, (row + 1) * plan.total)),
        Object.fromEntries(['tree', 'berry', 'bamboo', 'grain'].map(kind => [kind, plan[kind]])));
    }
    assert.ok(state.targets.every(node => node.x >= 60 && node.x <= 840 && node.hp > 0));
  }
});

test('season changes preserve nearby targets and a pending job, then prepare the first complete new zone', () => {
  const state = createGame(profile(35), fixed), old = [...state.targets], oldMaxId = state.nextId - 1;
  const preserved = old[2], harvested = old[0];
  preserved.claimedBy = 'squirrel'; state.hero.targetId = preserved.id;
  state.hero.pendingThrow = { targetId: preserved.id, time: 10 }; state.hero.actionTimer = 1000;
  state.projectiles = [{ id: 20000, x: harvested.x - 50, y: harvested.y, vx: 1000, vy: 0, damage: 1000, radius: 6, life: 1, owner: 'squirrel' }];
  stepGame(state, .1, {}, fixed);
  assert.equal(state.journey.harvests, 36);
  assert.equal(seasonResourcePlan(state).season, 'summer');
  assert.ok(state.targets.includes(preserved)); assert.equal(preserved.claimedBy, 'squirrel');
  assert.equal(state.hero.pendingThrow.targetId, preserved.id);
  assert.ok(old.filter(node => node !== harvested).every(node => state.targets.includes(node)), 'changing season does not remove or morph existing resources');
  assert.equal(state.targets.filter(node => node.id > oldMaxId).length, 0, 'a new zone waits for enough room');
  const removed = state.targets.filter(node => node !== preserved && !node.claimedBy).slice(0, 6);
  for (const node of removed) node.hp = 0;
  stepGame(state, .1, {}, fixed);
  const fresh = state.targets.filter(node => node.id > oldMaxId);
  assert.equal(fresh.length, 10, 'the first new summer zone appears when six more previous targets have been cleared');
  assert.deepEqual(counts(fresh), { tree: 3, berry: 3, bamboo: 2, grain: 2 });
  assert.equal(state.targets.length, 30);
  assert.ok(state.targets.includes(preserved)); assert.equal(preserved.claimedBy, 'squirrel');
});

test('all season distributions restore from the existing save format without changing inventory or house data', () => {
  for (let season = 0; season < 3; season++) {
    const original = createGame({ ...profile(season * 36 + 10),
      harvested: 100, recruited: HEROES.map(hero => hero.id),
      members: { bear: { materials: 37, level: 5 } }, homestead: { decorations: { nest: { level: 2, style: 1, placed: true } } },
    }, fixed);
    const restored = createGame(serializeProfile(original, 1000), fixed);
    assert.equal(restored.journey.harvests, season * 36 + 10);
    assert.deepEqual(counts(restored.targets), counts(original.targets));
    assert.equal(restored.members.bear.materials, 37); assert.equal(restored.members.bear.level, 5);
    assert.deepEqual(restored.homestead.decorations.nest, { level: 2, style: 1, placed: true });
  }
});

test('winter prepares no resources and next spring restores a full spring forest', () => {
  const state = createGame(profile(108), fixed);
  assert.deepEqual(seasonResourcePlan(state), { season: 'winter', tree: 0, berry: 0, bamboo: 0, grain: 0, total: 0 });
  assert.equal(state.targets.length, 0); stepGame(state, .1, {}, fixed); assert.equal(state.targets.length, 0);
  assert.equal(beginSpring(state, fixed), true); assert.equal(state.journey.year, 3);
  assert.equal(state.targets.length, 27); assert.deepEqual(counts(state.targets), { tree: 12, berry: 3, bamboo: 9, grain: 3 });
});

test('scrolling through every seasonal forest keeps the node cap and replenishes every resource kind', () => {
  for (let season = 0; season < 3; season++) {
    const state = createGame(profile(season * 36), fixed);
    state.hero.actionTimer = 1000;
    for (let row = 0; row < 12; row++) {
      state.hero.y -= 230;
      stepGame(state, .1, {}, fixed);
      assert.ok(state.targets.length <= 36);
      assert.ok(state.targets.length > 0);
      assert.ok(Object.values(counts(state.targets)).every(amount => amount > 0), 'every worker retains harvestable resources along the trail');
    }
    assert.ok(state.rowIndex > 10, 'new zones continue to generate beyond the initial buffer');
  }
});

test('late autumn stops new green plants and the winter approach creates only trees', () => {
  for (const harvests of [90, 95]) {
    const state = createGame(profile(harvests), fixed);
    assert.deepEqual(seasonResourcePlan(state), { season: 'autumn', tree: 8, berry: 0, bamboo: 0, grain: 2, total: 10 });
    assert.equal(state.targets.length, 30);
    assert.deepEqual(counts(state.targets), { tree: 24, berry: 0, bamboo: 0, grain: 6 });
    state.regrowth.push({ x: state.hero.x, y: state.hero.y, time: .01 });
    stepGame(state, .1, {}, fixed);
    assert.deepEqual(state.regrowth, []); assert.ok(state.targets.every(node => node.kind !== 'berry' && node.kind !== 'bamboo'));
  }
  for (const harvests of [96, 107]) {
    const state = createGame(profile(harvests), fixed);
    assert.deepEqual(seasonResourcePlan(state), { season: 'autumn', tree: 5, berry: 0, bamboo: 0, grain: 0, total: 5 });
    assert.equal(state.targets.length, 15); assert.ok(state.targets.every(node => trees.has(node.kind)));
  }
});

test('plants fade without recoloring before retirement while tree visibility never changes', () => {
  for (const [harvests, opacity] of [[0, 1], [89, 1], [90, 1], [93, .5], [96, 0], [107, 0], [108, 0]]) {
    const state = createGame(profile(harvests), fixed);
    for (const kind of ['berry', 'bamboo', 'grain']) assert.equal(resourcePlantVisibility(state, kind), opacity);
    for (const kind of trees) assert.equal(resourcePlantVisibility(state, kind), 1);
  }
});

test('dense cold-trail trees occupy three depth rows instead of overlapping as one branch fence', () => {
  for (const harvests of [90, 95]) {
    const state = createGame(profile(harvests), fixed), plan = seasonResourcePlan(state), zone = state.targets.slice(0, plan.tree);
    assert.equal(zone.length, plan.tree); assert.equal(state.targets.length, plan.total * 3);
    assert.deepEqual([...new Set(zone.map(node => node.x))], [145, 440, 735]);
    assert.equal(new Set(zone.map(node => node.y)).size, 3);
    assert.equal(Math.max(...zone.map(node => node.y)) - Math.min(...zone.map(node => node.y)), 160);
    assert.ok(state.targets.every(node => node.x >= 60 && node.x <= 840)); assert.ok(state.targets.length <= 36);
    for (let index = 1; index < zone.length; index++) assert.ok(zone[index].id > zone[index - 1].id, 'depth staggering preserves generation order');
  }
  const spring = createGame(profile(0), fixed), autumn = createGame(profile(72), fixed);
  assert.equal(new Set(spring.targets.slice(0, 4).map(node => node.y)).size, 1);
  assert.equal(new Set(autumn.targets.slice(0, 5).map(node => node.y)).size, 1);
});

test('the 96th harvest retires plants and cancels their jobs without harvesting or spending them', () => {
  const state = createGame({ ...profile(95), harvested: 100, recruited: HEROES.map(hero => hero.id) }, fixed);
  const template = state.targets[0], leader = state.hero, bear = state.workers.find(worker => worker.id === 'bear');
  const nodes = ['oak', 'berry', 'bamboo', 'grain', 'oak'].map((kind, index) => ({ ...template, id: 50000 + index, kind,
    x: leader.x + 20 + index * 5, y: leader.y, hp: index === 0 ? 1 : kind === 'oak' ? 1000 : 100, maxHp: 1000, claimedBy: null }));
  state.targets = nodes; state.nextRowY = leader.y - 1000; leader.actionTimer = 1000;
  bear.x = leader.x; bear.y = leader.y; bear.targetId = nodes[0].id; bear.pendingAction = { targetId: nodes[0].id, time: .01 };
  for (const [index, id] of ['fox', 'redpanda', 'sparrow'].entries()) {
    const worker = state.workers.find(worker => worker.id === id), node = nodes[index + 1];
    worker.x = leader.x; worker.y = leader.y; worker.targetId = node.id; worker.pendingAction = { targetId: node.id, time: .01 };
    worker.actionTimer = 1; worker.actionDuration = .6; worker.actionFlash = .4; worker.attackFlash = .2; worker.mode = 'harvest'; node.claimedBy = id;
  }
  state.regrowth.push({ x: leader.x, y: leader.y, time: .01 });
  const before = serializeProfile(state, 1000);
  stepGame(state, .1, {}, fixed);
  assert.equal(state.journey.harvests, 96); assert.equal(state.harvested, before.harvested + 1);
  assert.ok(state.targets.every(node => trees.has(node.kind))); assert.deepEqual(state.regrowth, []);
  for (const id of ['fox', 'redpanda', 'sparrow']) {
    const worker = state.workers.find(worker => worker.id === id);
    assert.equal(worker.pendingAction, null); assert.equal(worker.pendingThrow, null); assert.equal(worker.targetId, null);
    assert.equal(worker.actionTimer, 0); assert.equal(worker.actionDuration, 0); assert.equal(worker.actionFlash, 0); assert.equal(worker.attackFlash, 0);
    assert.equal(worker.actionCancelled, true); assert.equal(worker.mode, 'follow');
    assert.equal(state.members[id].materials, before.members[id].materials); assert.equal(state.members[id].xp, before.members[id].xp);
  }
  assert.ok(nodes.slice(1, 4).every(node => node.claimedBy === null && node.hp === 100));
  assert.equal(state.members.bear.materials, before.members.bear.materials + 3);
  for (let tick = 0; tick < 40; tick++) stepGame(state, .1, {}, fixed);
  assert.ok(state.targets.every(node => trees.has(node.kind))); assert.deepEqual(state.regrowth, []);
});

test('late recruitment respects seasonal absence instead of forcing green plants into the cold trail', () => {
  for (const [harvests, count] of [[90, 2], [96, 4]]) {
    const state = createGame({ ...profile(harvests), harvested: 100, recruited: HEROES.slice(0, count).map(hero => hero.id) }, fixed);
    const friend = state.encounter, before = state.targets.length;
    state.hero.x = friend.x; state.hero.y = friend.y; friend.phase = 'ready';
    assert.equal(recruitFriend(state, friend.id), true); assert.equal(state.targets.length, before);
    assert.equal(state.workers.at(-1).targetId, null);
    assert.ok(state.targets.every(node => node.kind !== 'berry' && node.kind !== 'bamboo'));
    if (harvests >= 96) assert.ok(state.targets.every(node => trees.has(node.kind)));
  }
});

test('ordinary first-year gathering still feeds the sparrow before the cold trail and restores plants next spring', () => {
  for (let seed of [1, 7, 21]) {
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const state = createGame({}, rng);
    for (let tick = 0; tick < 6000 && state.journey.phase !== 'home'; tick++) {
      stepGame(state, .05, {}, rng);
      if (state.encounter?.phase === 'ready') recruitFriend(state, state.encounter.id);
      if (state.journey.harvests >= 96) assert.ok(state.targets.every(node => trees.has(node.kind)));
    }
    assert.equal(state.journey.phase, 'home'); assert.equal(state.recruited.length, 5);
    assert.ok(state.members.sparrow.materials >= 2, 'the first sleeping nest remains attainable');
    assert.equal(beginSpring(state, rng), true);
    assert.deepEqual(counts(state.targets), { tree: 12, berry: 3, bamboo: 9, grain: 3 });
    assert.equal(resourcePlantVisibility(state, 'bamboo'), 1);
  }
});
