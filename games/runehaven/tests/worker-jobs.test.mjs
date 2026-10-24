import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { act, createGame, getCapacity, getDiningLayout, getStationApproach, getStations, restore, serialize, step } from '../rules.mjs';

const count = (bag) => bag.gear + bag.potion + (bag.food ?? 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function run(state, seconds, input = {}, inspect = () => {}) {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) { step(state, .05, input); inspect(state); }
}
function shop(seed = 42) {
  const state = createGame(seed);
  state.sales = 20; state.unlocks.inn = state.unlocks.alchemy = true; state.gold = 100000;
  state.raid.timer = state.raid.triggerSales = 1e6; state.timers.customer = 1000;
  Object.assign(state.player, { x: 5.8, z: 5.8 });
  return state;
}
function hire(state, job) {
  assert.equal(act(state, 'hire').ok, true);
  const helper = state.staff.at(-1);
  if (job) assert.equal(act(state, 'assign-worker', { id: helper.id, job }).ok, true);
  return helper;
}

test('worker jobs are free, respect facility locks, and preserve original worker stats', () => {
  const state = createGame(42), helper = hire(state);
  const original = { speed: helper.speed, capacity: helper.capacity, sourceId: helper.sourceId, gold: state.gold };
  for (const job of ['potion', 'food', 'clean']) assert.equal(act(state, 'assign-worker', { id: helper.id, job }).ok, false);
  assert.equal(helper.job, 'gear');
  assert.equal(act(state, 'assign-worker', { id: 'missing', job: 'gear' }).ok, false);
  assert.equal(act(state, 'assign-worker', { id: helper.id, job: 'invalid' }).ok, false);
  state.sales = 20; state.unlocks.alchemy = state.unlocks.inn = true;
  for (const job of ['food', 'clean', 'potion', 'gear']) {
    assert.equal(act(state, 'assign-worker', { id: helper.id, job }).ok, true);
    assert.equal(helper.job, job);
    assert.equal(helper.jobAssigned, true);
  }
  assert.deepEqual({ speed: helper.speed, capacity: helper.capacity, sourceId: helper.sourceId, gold: state.gold }, original);
});

test('manually selected jobs survive alchemy opening instead of automatic reassignment', () => {
  const state = shop(); state.unlocks.alchemy = false;
  hire(state);
  const helper = hire(state, 'clean');
  assert.equal(act(state, 'unlock', { kind: 'alchemy' }).ok, true);
  assert.equal(helper.job, 'clean');
  assert.equal(helper.product, 'gear');
});

test('player carries food with shared capacity and must dwell at a separate counter to serve it', () => {
  const state = shop(), layout = getDiningLayout(state);
  state.player.bag.gear = 1;
  Object.assign(state.player, layout.kitchenPoint);
  run(state, .35);
  assert.equal(state.player.bag.food, 0);
  run(state, .05);
  assert.equal(state.player.bag.food, 1);
  assert.equal(count(state.player.bag), getCapacity(state));
  assert.equal(state.dining.kitchen, 3);
  run(state, .6);
  assert.equal(state.player.bag.food, 1, 'gear and food cannot exceed the same bag limit');
  assert.equal(state.dining.food, 0, 'standing at the kitchen never deposits food');
  run(state, 1, { target: layout.counterPoint });
  assert.equal(state.player.bag.food, 1, 'walking never unloads food');
  assert.equal(state.dining.food, 0);
  Object.assign(state.player, { ...layout.counterPoint, target: null, dwell: 0, transferClock: 0 });
  run(state, .35);
  assert.equal(state.dining.food, 0);
  run(state, .05);
  assert.equal(state.dining.food, 1);
  assert.equal(state.player.bag.food, 0);
  assert.equal(state.player.bag.gear, 1);
  assert.ok(state.events.some((event) => event.type === 'collect' && event.product === 'food'));
  assert.ok(state.events.some((event) => event.type === 'deposit' && event.product === 'food'));
});

test('full food counters keep carried meals without loss and only accept their eight-meal capacity', () => {
  const state = shop();
  state.dining.food = 8; state.player.bag.food = 2;
  Object.assign(state.player, getDiningLayout(state).counterPoint);
  run(state, 2);
  assert.equal(state.player.bag.food, 2); assert.equal(state.dining.food, 8);
  state.dining.food--;
  run(state, .4);
  assert.equal(state.player.bag.food, 1); assert.equal(state.dining.food, 8);
  run(state, 1);
  assert.equal(state.player.bag.food, 1);
});

test('food workers collect real kitchen stock and walk directly before their first serving deposit', () => {
  const state = shop(), helper = hire(state, 'food'), layout = getDiningLayout(state);
  const initialPosition = { x: helper.x, z: helper.z };
  assert.ok(distance(helper, layout.kitchenPoint) > .1, 'job assignment does not teleport workers');
  const cooked = new Set();
  let collected = false, walkingWithFood = false, delivered = false;
  for (let frame = 0; frame < 1000 && !delivered; frame++) {
    const before = { x: helper.x, z: helper.z }, wasHauling = helper.phase === 'haul';
    step(state, .05);
    for (const event of state.events) if (event.type === 'cook') cooked.add(event.id);
    if (helper.bag.food > 0) collected = true;
    if (wasHauling && helper.bag.food > 0 && distance(before, layout.counterPoint) > helper.speed * .05) {
      walkingWithFood = true;
      const dx = layout.counterPoint.x - before.x, dz = layout.counterPoint.z - before.z;
      assert.ok(Math.abs((helper.x - before.x) * dz - (helper.z - before.z) * dx) < .000001);
      assert.ok(Math.abs(distance(before, helper) - helper.speed * .05) < .000001);
    }
    delivered = state.dining.food > 0;
    assert.ok(count(helper.bag) <= helper.capacity);
    assert.equal(state.dining.kitchen + state.dining.food + helper.bag.food, 4 + cooked.size,
      'only cooking, pickup and physical deposit change the meal inventory');
  }
  assert.ok(collected && walkingWithFood && delivered);
  assert.ok(distance(initialPosition, layout.kitchenPoint) > 0);
  const source = BALANCE.staffs.find((row) => row.id === helper.sourceId);
  assert.equal(helper.speed, source.speed);
  assert.equal(helper.capacity, source.capacity);
});

test('job changes deliver all old products first, including after saving while the new job is clean', () => {
  let state = shop(); let helper = hire(state, 'food');
  for (let level = 0; level < 4; level++) act(state, 'upgrade-worker', { kind: 'capacity' });
  helper.bag = { gear: 1, potion: 1, food: 1 };
  assert.ok(helper.capacity >= count(helper.bag));
  state.dining.tables[0].status = 'dirty';
  assert.equal(act(state, 'assign-worker', { id: helper.id, job: 'clean' }).ok, true);
  state = restore(serialize(state)); helper = state.staff[0];
  assert.equal(state.saveReset, false); assert.equal(helper.job, 'clean');
  state.raid.timer = state.raid.triggerSales = state.timers.customer = 1000;
  const delivered = { gear: 0, potion: 0, food: 0 }, events = new Set();
  for (let frame = 0; frame < 1500 && state.dining.cleaned === 0; frame++) {
    step(state, .05);
    for (const event of state.events) if (event.type === 'deposit' && !events.has(event.id)) { events.add(event.id); delivered[event.product]++; }
    if (count(helper.bag) > 0) {
      assert.equal(state.dining.cleaned, 0);
      assert.equal(helper.cleanTableId, null);
    }
  }
  assert.deepEqual(delivered, { gear: 1, potion: 1, food: 1 });
  assert.equal(count(helper.bag), 0); assert.equal(state.dining.cleaned, 1);
});

test('a reassigned cleaner carrying food can reopen dirty tables before unloading into a full counter', () => {
  const state = shop(), helper = hire(state, 'food'), layout = getDiningLayout(state);
  state.dining.food = 8; helper.bag.food = 1;
  state.dining.tables.forEach((table) => { table.status = 'dirty'; });
  Object.assign(helper, layout.tables[0].cleanPoint);
  state.patrons.push({ id: 'diner', kind: 'warrior', purchases: 1, totalSpent: 50, loyalty: 1, hp: 90, maxHp: 90, equipmentLevel: 1 });
  state.customers.push({ id: 'diner', ...layout.queue[0], kind: 'warrior', product: 'gear', phase: 'food-queue', hp: 90, purchased: true, patronId: 'diner', timer: 0, patience: 0, foodJoinedAt: 0 });
  assert.equal(act(state, 'assign-worker', { id: helper.id, job: 'clean' }).ok, true);
  run(state, .6);
  assert.equal(helper.bag.food, 1, 'full shelf keeps the previous meal in hand');
  assert.equal(helper.workKind, 'clean');
  assert.ok(state.dining.tables[0].cleanProgress > .5);
  assert.equal(state.dining.food, 8);
  for (let frame = 0; frame < 800 && helper.bag.food > 0; frame++) step(state, .05);
  assert.equal(helper.bag.food, 0, 'the diner frees a slot and the old meal is physically deposited');
  assert.equal(state.dining.food, 8);
  assert.ok(state.dining.cleaned > 0);
  assert.ok(state.customers.some((customer) => ['to-table', 'eating', 'leaving'].includes(customer.phase)));
});

test('two cleaners choose separate nearest dirty tables while player movement does not reset their work', () => {
  const state = shop(), layout = getDiningLayout(state);
  const helpers = [hire(state, 'clean'), hire(state, 'clean')];
  state.dining.tables[0].status = state.dining.tables[1].status = 'dirty';
  helpers.forEach((helper) => Object.assign(helper, layout.tables[0].cleanPoint));
  step(state, .05);
  assert.equal(helpers[0].cleanTableId, 0); assert.equal(helpers[1].cleanTableId, 1);
  assert.equal(state.dining.tables[0].cleanerId, helpers[0].id);
  assert.equal(state.dining.tables[1].cleanerId, helpers[1].id);
  run(state, .55, { x: -1, z: 0 });
  assert.ok(state.dining.tables[0].cleanProgress > .59, 'moving player only releases their own cleaning claim');
  assert.equal(state.dining.cleaned, 0);
  run(state, .6, { x: -1, z: 0 });
  assert.equal(state.dining.cleaned, 1, 'one cleaner still needs the entire 1.2 seconds');
  run(state, 8);
  assert.equal(state.dining.cleaned, 2);
  assert.ok(state.dining.tables.every((table) => table.status === 'clean'));
});

test('player and multiple cleaners cannot multiply speed or finish the same table more than once', () => {
  const state = shop(), target = getDiningLayout(state).tables[0].cleanPoint;
  const helpers = [hire(state, 'clean'), hire(state, 'clean')];
  state.dining.tables[0].status = 'dirty';
  helpers.forEach((helper) => Object.assign(helper, target));
  Object.assign(state.player, target);
  run(state, 1.15);
  assert.equal(state.dining.cleaned, 0);
  assert.equal(state.dining.tables[0].cleanerId, 'player');
  assert.ok(helpers.every((helper) => helper.cleanTableId === null));
  run(state, .05);
  assert.equal(state.dining.cleaned, 1);
  run(state, 3);
  assert.equal(state.dining.cleaned, 1);
});

test('changing a cleaning job releases its transient claim for a replacement worker', () => {
  const state = shop(), target = getDiningLayout(state).tables[0].cleanPoint;
  const first = hire(state, 'clean'), second = hire(state, 'clean');
  state.dining.tables[0].status = 'dirty';
  Object.assign(first, target); Object.assign(second, target);
  run(state, .6);
  assert.equal(state.dining.tables[0].cleanerId, first.id);
  assert.equal(act(state, 'assign-worker', { id: first.id, job: 'food' }).ok, true);
  assert.equal(state.dining.tables[0].cleanProgress, 0);
  step(state, .05);
  assert.equal(state.dining.tables[0].cleanerId, second.id);
  run(state, 1.15);
  assert.equal(state.dining.cleaned, 1);
});

test('v1 restores food cargo and worker jobs, migrates missing fields, and rejects corrupt job or bag values', () => {
  const state = shop(), helper = hire(state, 'clean');
  state.player.bag.food = 2; helper.bag.food = 1;
  state.dining.kitchen = 3; state.dining.food = 5;
  const saved = JSON.parse(serialize(state)), loaded = restore(saved);
  assert.equal(loaded.saveReset, false);
  assert.equal(loaded.player.bag.food, 2); assert.equal(loaded.staff[0].bag.food, 1);
  assert.equal(loaded.staff[0].job, 'clean'); assert.equal(loaded.staff[0].phase, 'haul');
  assert.equal(loaded.dining.kitchen, 3); assert.equal(loaded.dining.food, 5);
  const legacy = structuredClone(saved);
  delete legacy.dining.kitchen; delete legacy.player.bag.food;
  delete legacy.staff[0].bag.food; delete legacy.staff[0].job; delete legacy.staff[0].jobAssigned;
  const migrated = restore(legacy);
  assert.equal(migrated.saveReset, false); assert.equal(migrated.dining.kitchen, 4); assert.equal(migrated.dining.food, 5);
  assert.equal(migrated.player.bag.food, 0); assert.equal(migrated.staff[0].bag.food, 0); assert.equal(migrated.staff[0].job, helper.product);
  for (const corrupt of [
    (s) => { s.player.bag.food = -1; }, (s) => { s.player.bag.food = 1.5; }, (s) => { s.player.bag.food = null; }, (s) => { s.player.bag.gear = 1; },
    (s) => { s.staff[0].bag.food = s.staff[0].capacity + 1; }, (s) => { s.staff[0].job = 'unknown'; }, (s) => { s.staff[0].job = null; }, (s) => { s.staff[0].bag.food = null; },
    (s) => { s.staff[0].jobAssigned = 'yes'; }, (s) => { s.dining.kitchen = 9; }, (s) => { s.dining.kitchen = null; },
    (s) => { s.staff.push(structuredClone(s.staff[0])); },
  ]) {
    const invalid = structuredClone(saved); corrupt(invalid);
    assert.equal(restore(invalid).saveReset, true);
  }
});

test('pausing, combat and region changes preserve food cargo and clear cleaning reservations', () => {
  const state = shop(), helper = hire(state, 'clean');
  state.player.bag.food = 2; helper.bag.food = 1;
  state.status = 'paused';
  const paused = serialize(state); run(state, 1);
  assert.equal(serialize(state), paused);
  state.status = 'playing';
  state.dining.tables[0].status = 'dirty'; state.dining.tables[0].cleanerId = helper.id;
  state.dining.tables[0].cleanProgress = .5; helper.cleanTableId = 0;
  state.raid.phase = 'warning'; state.raid.timer = .01;
  step(state, .05);
  assert.equal(state.raid.phase, 'departure');
  assert.equal(state.player.bag.food, 2); assert.equal(helper.bag.food, 1);
  assert.equal(helper.cleanTableId, null); assert.equal(state.dining.tables[0].cleanerId, null);
  run(state, .5);
  assert.equal(state.player.bag.food, 2); assert.equal(helper.bag.food, 1);
  const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false); assert.equal(loaded.player.bag.food, 2); assert.equal(loaded.staff[0].bag.food, 1);
  run(state, 1.75);
  assert.equal(state.raid.phase, 'battle');
  assert.equal(state.raid.location, 'outside');
  state.raid.enemies = []; state.raid.spawnRemaining = 0;
  step(state, .05);
  assert.equal(state.stage, 2);
  assert.equal(act(state, 'continue').ok, true);
  assert.equal(state.raid.location, 'shop');
  assert.equal(state.player.bag.food, 2); assert.equal(helper.bag.food, 1);
  assert.equal(helper.phase, 'haul');
  assert.ok(distance(helper, getDiningLayout(state).kitchenPoint) > .1 || helper.product === 'food', 'relocation keeps the existing job transport origin');
});

test('food transport and cleaning workers repeat the complete dining cycle beyond four used tables', () => {
  const state = shop();
  state.timers.customer = 1; state.stocks.gear = state.stocks.potion = 60;
  hire(state, 'food'); hire(state, 'clean');
  run(state, 120, {}, () => {
    assert.ok(state.dining.food >= 0 && state.dining.food <= 8);
    assert.ok(state.dining.kitchen >= 0 && state.dining.kitchen <= 8);
    assert.ok(state.staff.every((helper) => count(helper.bag) <= helper.capacity));
  });
  assert.ok(state.lodgings >= 8, `served ${state.lodgings} completed meals`);
  assert.ok(state.dining.cleaned >= 4);
  assert.ok(state.moneyPiles.inn > 0);
});
