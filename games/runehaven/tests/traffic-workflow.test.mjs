import { BALANCE } from '../balance.mjs';
import { BATTLE_BOUNDS } from '../battlefield.mjs';
import { getShopObstacles, projectShopTarget, SHOP_RADIUS, shopLineClear } from '../shop-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, getMoneyPiles, getStationApproach, getStations, restore, serialize, step } from '../rules.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function controlledShop(stage, openAlchemy = true) {
  // Deliberate movement/worker fixture, not progression earned by playing.
  const state = createGame(42);
  state.stage = stage;
  state.sales = 20;
  state.gold = 100000;
  state.unlocks.alchemy = openAlchemy;
  state.unlocks.inn = true;
  state.raid.timer = state.raid.triggerSales = 1e6;
  return state;
}

function assertOnLine(point, from, target) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length) assert.ok(Math.abs((point.x - from.x) * dz - (point.z - from.z) * dx) / length < .000001);
}

test('cash remains on the central side of both counters, including mirrored regions', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage), stations = getStations(state);
    for (const pile of getMoneyPiles(state).filter((pile) => pile.kind !== 'inn')) {
      const counter = stations[pile.kind === 'gear' ? 'counter' : 'potionCounter'];
      assert.ok(Math.abs(pile.x) < Math.abs(counter.x), `region ${stage}: cash remains visible beside its counter`);
    }
  }
});

test('all regional work and cash targets remain reachable, using direct lines only where furniture is clear', () => {
  let trips = 0;
  for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage);
    for (let index = 1; index < 4; index++) assert.equal(act(state, 'unlock-table').ok, true);
    state.timers.customer = 1e6;
    const points = ['forge', 'counter', 'alchemy', 'potionCounter', 'inn'].map((key) => getStationApproach(state, key))
      .concat(getMoneyPiles(state));
    for (const from of points) for (const target of points) {
      if (from === target) continue;
      const start = projectShopTarget(state, from), goal = projectShopTarget(state, target);
      Object.assign(state.player, { ...start, target: null });
      const direct = shopLineClear(state, start, goal);
      let frames = 0;
      while (distance(state.player, goal) > .1 && frames < 400) {
        const before = { x: state.player.x, z: state.player.z };
        step(state, .05, { target });
        if (direct) assertOnLine(state.player, start, goal);
        assert.ok(shopLineClear(state, before, state.player), 'each segment clears static furniture');
        assert.ok(distance(before, state.player) > 0, 'the route never stalls at a furniture corner');
        frames++;
      }
      assert.ok(frames < 400, 'regional destination is reached promptly');
      assert.ok(distance(state.player, goal) <= .1);
      trips++;
    }
  }
  assert.equal(trips, 1320, 'all five work points, three legacy piles, and four table piles are reachable without crossing furniture');
});

test('a full waiting line does not block a straight floor tap through its shoppers', () => {
  const state = controlledShop(1, false);
  for (let frame = 0; frame < 500; frame++) step(state, .05);
  assert.ok(state.customers.length >= 12, 'actual unpaid shoppers occupy the waiting line');
  const from = { x: -7.8, z: 5.09 }, target = { x: 7.8, z: 5.09 };
  Object.assign(state.player, { ...from, target: null });
  let frames = 0;
  while (distance(state.player, target) > .1 && frames < 400) {
    step(state, .05, { target });
    assertOnLine(state.player, from, target);
    frames++;
  }
  assert.ok(frames < 400);
  assert.ok(distance(state.player, target) <= .1, 'overlap is allowed without a route around the queue');
});

test('workers share work points and carry their loads directly to each regional counter', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage, false);
    state.timers.customer = 1e6;
    const supply = getStationApproach(state, 'forge');
    for (let index = 0; index < 3; index++) assert.equal(act(state, 'hire').ok, true);
    for (const helper of state.staff) assert.deepEqual({ x: helper.x, z: helper.z }, supply);
    Object.assign(state.player, { ...supply, target: null });
    state.stocks.forge = 0;
    step(state, .05);
    for (const helper of state.staff) assert.deepEqual({ x: helper.x, z: helper.z }, supply, 'shared work point needs no separation');
    const target = getStationApproach(state, 'counter');
    for (const helper of state.staff) Object.assign(helper, { ...supply, phase: 'haul', bag: { gear: 1, potion: 0 }, timer: 0 });
    let frames = 0;
    while (state.staff.some((helper) => helper.phase === 'haul') && frames < 400) {
      const before = state.staff.filter((helper) => helper.phase === 'haul').map((helper) => ({ helper, remaining: distance(helper, target) }));
      step(state, .05);
      for (const { helper, remaining } of before) {
        assertOnLine(helper, supply, target);
        assert.ok(Math.abs(distance(helper, target) - Math.max(0, remaining - helper.speed * .05)) < .000001,
          'movement uses the original worker speed without a corner or collision delay');
      }
      frames++;
    }
    assert.ok(frames < 400);
    assert.equal(state.stocks.gear, 3, 'only the three physically carried pieces reach the shelf');
    assert.ok(state.staff.every((helper) => helper.bag.gear === 0));
  }
});

test('three workers sustain paid commerce with natural production while overlaps are allowed', () => {
  for (const openAlchemy of [false, true]) for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage, openAlchemy);
    for (let index = 0; index < 3; index++) assert.equal(act(state, 'hire').ok, true);
    for (let frame = 0; frame < 2000; frame++) {
      step(state, .05);
      assert.ok(state.staff.every((helper) => Number.isFinite(helper.x) && Number.isFinite(helper.z)));
    }
    // Only natural production and physical worker deliveries supplied these sales.
    assert.ok(state.sales > 30, `region ${stage}: direct transport sustains purchases`);
    assert.ok(state.patrons.length > 0);
  }
});

function insideFurniture(state, point) {
  return getShopObstacles(state).some(r => point.x > r.minX - SHOP_RADIUS + 1e-6 && point.x < r.maxX + SHOP_RADIUS - 1e-6
    && point.z > r.minZ - SHOP_RADIUS + 1e-6 && point.z < r.maxZ + SHOP_RADIUS - 1e-6);
}

test('joystick stops at furniture while taps normalize a solid destination and finish safely', () => {
  const state = controlledShop(1), forge = getShopObstacles(state).find(r => r.id === 'forge'); state.timers.customer = 1e6;
  Object.assign(state.player, { x: forge.minX - SHOP_RADIUS - .3, z: (forge.minZ + forge.maxZ) / 2 });
  for (let frame = 0; frame < 60; frame++) { step(state, .05, { x: 1 }); assert.equal(insideFurniture(state, state.player), false); }
  assert.ok(state.player.x <= forge.minX - SHOP_RADIUS + 1e-6, 'direct input cannot walk through a solid forge');
  const target = getStations(state).forge, goal = projectShopTarget(state, target);
  for (let frame = 0; frame < 200 && distance(state.player, goal) > .1; frame++) { step(state, .05, { target }); assert.equal(insideFurniture(state, state.player), false); }
  assert.ok(distance(state.player, goal) <= .1);
  for (let frame = 0; frame < 20 && state.player.target; frame++) step(state, .05);
  assert.equal(state.player.target, null);
});

test('blink and restore keep shop characters out of solid furniture without extending the source blink range', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage), target = getStations(state).forge; state.player.speedLevel = 21;
    for (const offset of [-3.5, -2, 2, 3.5]) {
      const origin = projectShopTarget(state, { x: target.x + offset, z: target.z + 1.5 });
      Object.assign(state.player, { ...origin, blinkCooldown: 0 }); act(state, 'blink', { target });
      assert.equal(insideFurniture(state, state.player), false); assert.ok(distance(origin, state.player) <= BALANCE.magic.range + .000001);
    }
  }
  const state = createGame(42); Object.assign(state.player, getStations(state).forge); const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false); assert.equal(insideFurniture(loaded, loaded.player), false);
});

test('outdoor blink uses the outdoor boundary instead of the shop boundary', () => {
  const state = createGame(42); state.player.speedLevel = 21; state.raid.location = 'outside';
  const start = { x: BATTLE_BOUNDS.maxX - .2, z: BATTLE_BOUNDS.maxZ - .2 }; Object.assign(state.player, start);
  assert.equal(act(state, 'blink', { target: { x: start.x + 10, z: start.z + 10 } }).ok, true);
  assert.equal(state.player.x, BATTLE_BOUNDS.maxX); assert.equal(state.player.z, BATTLE_BOUNDS.maxZ);
  assert.ok(distance(start, state.player) <= BALANCE.magic.range);
});
