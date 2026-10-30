import test from 'node:test';
import assert from 'node:assert/strict';
import { getStations } from '../maps.mjs';
import { getDiningLayout } from '../dining.mjs';
import { SHOP_RADIUS, getShopObstacles, projectShopTarget, planShopPath, shopLineClear, moveShopPoint, getShopWaypoint } from '../shop-navigation.mjs';

const shop = (stage = 1) => ({ stage, unlocks: { inn: true, alchemy: true }, dining: { tableCount: 4 } });
const length = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function open(state, p) {
  return getShopObstacles(state).every(r => p.x <= r.minX - SHOP_RADIUS + 1e-6 || p.x >= r.maxX + SHOP_RADIUS - 1e-6 || p.z <= r.minZ - SHOP_RADIUS + 1e-6 || p.z >= r.maxZ + SHOP_RADIUS - 1e-6);
}

test('open floor stays one straight segment and crowds never become physical barriers', () => {
  const state = shop(), from = { x: 0, z: 7 }, target = { x: 0, z: 3 };
  state.customers = Array.from({ length: 30 }, () => ({ x: 0, z: 5 }));
  assert.deepEqual(planShopPath(state, from, target), [target]);
  assert.deepEqual(moveShopPoint(state, from, target), target);
});

test('a joystick cannot tunnel through a counter and diagonal input slides along its edge', () => {
  const state = shop(), counter = getStations(state).counter;
  const from = { x: counter.x, z: counter.z + 2 }, desired = { x: counter.x, z: counter.z - 2 };
  const hit = moveShopPoint(state, from, desired);
  assert.ok(hit.z >= counter.z + .75 - 1e-7);
  assert.ok(open(state, hit));
  const sliding = moveShopPoint(state, hit, { x: counter.x + .6, z: counter.z - 1 });
  assert.ok(sliding.x > hit.x + .5);
  assert.equal(sliding.z, hit.z);
});

test('blocked taps take clear furniture corners and an interior tap ends at reachable floor', () => {
  const state = shop(), p = getStations(state).counter;
  const from = { x: p.x, z: p.z + 2 }, target = { x: p.x, z: p.z - 2 };
  const path = planShopPath(state, from, target);
  assert.ok(path.length > 1);
  let previous = from;
  for (const point of path) { assert.ok(open(state, point)); assert.ok(shopLineClear(state, previous, point)); previous = point; }
  assert.deepEqual(previous, target);
  const projected = projectShopTarget(state, p);
  assert.ok(open(state, projected)); assert.ok(length(projected, p) < 1);
});

test('all ten regions keep workshop, serving, table-cleaning and cash approaches reachable', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = shop(stage), s = getStations(state), d = getDiningLayout(state);
    const targets = [
      ...['forge', 'alchemy'].map(k => ({ x: s[k].x, z: s[k].z + .8 })),
      ...['counter', 'potionCounter'].map(k => ({ x: s[k].x, z: s[k].z - .85 })),
      d.kitchenPoint, d.counterPoint,
      ...d.tables.flatMap(t => [...t.seats.map(seat => seat.cleanPoint), { x: t.x + .95, z: t.z - .15 }]),
    ];
    for (const target of targets) {
      const from = { x: 0, z: 6.8 }, route = planShopPath(state, from, target);
      let previous = from;
      for (const point of route) { assert.ok(open(state, point), `${stage}: free target`); assert.ok(shopLineClear(state, previous, point), `${stage}: free segment`); previous = point; }
      assert.ok(length(previous, projectShopTarget(state, target)) < 1e-6, `${stage}: reaches goal`);
    }
  }
});

test('a cached route can follow its corners, then returns to straight movement without state serialization', () => {
  const state = shop(), c = getStations(state).counter, actor = { x: c.x, z: c.z + 2 }, goal = { x: c.x, z: c.z - 2 };
  for (let step = 0; step < 100 && length(actor, goal) > .03; step++) {
    const waypoint = getShopWaypoint(state, actor, goal), gap = length(actor, waypoint), amount = Math.min(gap, .12);
    if (gap > 0) Object.assign(actor, moveShopPoint(state, actor, { x: actor.x + (waypoint.x - actor.x) / gap * amount, z: actor.z + (waypoint.z - actor.z) / gap * amount }));
    assert.ok(open(state, actor));
  }
  assert.ok(length(actor, goal) < .03);
  assert.deepEqual(Object.keys(actor).sort(), ['x', 'z']);
  state.dining.tableCount = 1; state.unlocks.inn = false;
  assert.equal(getShopObstacles(state).some(r => r.id.startsWith('table-')), false);
});
