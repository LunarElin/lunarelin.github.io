import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, createGame, stepGame, seasonResourcePlan, beginSpring, serializeProfile } from '../rules.mjs';

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
