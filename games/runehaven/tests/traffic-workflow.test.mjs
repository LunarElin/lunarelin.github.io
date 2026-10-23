import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, getMoneyPiles, getStationApproach, getStations, step } from '../rules.mjs';

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

test('all regional work and cash targets are reached on one straight line without detours', () => {
  let trips = 0;
  for (let stage = 1; stage <= 10; stage++) {
    const state = controlledShop(stage);
    state.timers.customer = 1e6;
    const points = ['forge', 'counter', 'alchemy', 'potionCounter', 'inn'].map((key) => getStationApproach(state, key))
      .concat(getMoneyPiles(state));
    for (const from of points) for (const target of points) {
      if (from === target) continue;
      Object.assign(state.player, { x: from.x, z: from.z, target: null });
      let frames = 0, previousDistance = distance(from, target);
      while (distance(state.player, target) > .1 && frames < 250) {
        step(state, .05, { target });
        assertOnLine(state.player, from, target);
        const remaining = distance(state.player, target);
        assert.ok(remaining < previousDistance, `region ${stage}: every frame advances toward the destination`);
        previousDistance = remaining;
        frames++;
      }
      assert.ok(frames < 250, `region ${stage}: destination is reached promptly`);
      assert.ok(distance(state.player, target) <= .1);
      trips++;
    }
  }
  assert.equal(trips, 560);
});

test('a full waiting line does not block a straight floor tap through its shoppers', () => {
  const state = controlledShop(1, false);
  for (let frame = 0; frame < 500; frame++) step(state, .05);
  assert.ok(state.customers.length >= 12, 'actual unpaid shoppers occupy the waiting line');
  const from = { x: -5.8, z: 4.45 }, target = { x: 5.8, z: 4.45 };
  Object.assign(state.player, { ...from, target: null });
  let frames = 0;
  while (distance(state.player, target) > .1 && frames < 200) {
    step(state, .05, { target });
    assertOnLine(state.player, from, target);
    frames++;
  }
  assert.ok(frames < 200);
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
