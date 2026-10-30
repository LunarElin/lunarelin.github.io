import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, DINING_RULES, CLASS_STATS, createGame, getDiningLayout, getCustomerQueueSlots, getCustomerEntrySlots, getCustomerBranchPoint, getFacilityStats, getStations, getCoinMultiplier, serialize, restore, step } from '../rules.mjs';

function run(state, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) step(state, .05, input);
}

function shop(seed = 42) {
  const state = createGame(seed);
  state.sales = 16;
  state.unlocks.inn = true;
  state.dining.tableCount = 4; state.dining.tables.forEach((table) => { table.status = 'clean'; }); // Explicit fully expanded fixture.
  state.dining.food = 4; // Deliberate stocked dining fixture, not automatic service.
  state.raid.timer = state.raid.triggerSales = 1e6;
  state.timers.customer = 1000;
  Object.assign(state.player, { x: 5.8, z: 5.8 });
  return state;
}

function addGuest(state, id = 'guest', phase = 'food-queue', tableId = null) {
  const stats = CLASS_STATS.warrior;
  state.patrons.push({ id, kind: 'warrior', purchases: 1, totalSpent: 50, loyalty: 1, hp: 20, maxHp: stats.hp, equipmentLevel: 1 });
  const layout = getDiningLayout(state);
  const position = phase === 'eating' ? layout.tables[tableId].seat : layout.queue[0];
  const customer = { id, ...position, kind: 'warrior', product: 'gear', phase, hp: stats.hp, purchased: true, patronId: id, timer: 0, patience: 0, tableId, meal: phase === 'to-table', foodJoinedAt: state.time };
  state.customers.push(customer);
  if (phase === 'eating' || phase === 'to-table') state.dining.tables[tableId] = { status: phase === 'eating' ? 'eating' : 'reserved', customerId: id, cleanProgress: 0 };
  return customer;
}

function mealPrice(state) {
  const inn = getFacilityStats(state, 'inn');
  return Math.round(BALANCE.facilities.inn.salePrice * getCoinMultiplier(state) * (1 + inn.bonusPercent / 100));
}

test('dining furniture and short food queue stay in bounds in every regional layout', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const layout = getDiningLayout({ stage });
    assert.equal(layout.tables.length, 4);
    assert.equal(layout.queue.length, 4);
    assert.equal(getDiningLayout({ stage }), layout, 'layout is cached, without per-frame allocation');
    for (const point of [layout.kitchen, layout.kitchenPoint, layout.counter, layout.counterPoint, ...layout.queue, ...layout.tables.flatMap((table) => [table, table.seat, table.cleanPoint])]) {
      assert.ok(point.x >= BOUNDS.minX && point.x <= BOUNDS.maxX);
      assert.ok(point.z >= BOUNDS.minZ && point.z <= BOUNDS.maxZ);
    }
    assert.ok(Math.abs(layout.kitchen.x - layout.counter.x) >= 2.7 - .00001);
    assert.equal(new Set(layout.tables.map(({ x, z }) => `${x}:${z}`)).size, 4);
  }
});

test('kitchen cooks only into its own stock after opening, and never restocks the serving counter', () => {
  const closed = createGame(42);
  run(closed, 20);
  assert.equal(closed.dining.kitchen, 4);
  assert.equal(closed.dining.food, 0);
  assert.equal(closed.dining.cookClock, 0);
  const state = shop();
  state.dining.food = 0;
  run(state, 2.95);
  assert.equal(state.dining.kitchen, 4);
  run(state, .05);
  assert.equal(state.dining.kitchen, 5);
  run(state, 30);
  assert.equal(state.dining.kitchen, 8);
  assert.equal(state.dining.food, 0, 'cooked food requires physical delivery');
  assert.equal(state.lodgings, 0, 'cooking alone does not pay or grant loyalty');
  state.dining.kitchen--;
  run(state, 2.9);
  assert.equal(state.dining.kitchen, 7, 'a full kitchen does not bank instant production');
});

test('a paid guest takes one meal, reserves a unique seat, eats, and pays once leaving a dirty table', () => {
  const state = shop();
  const guest = addGuest(state);
  step(state, .05);
  assert.equal(guest.phase, 'to-table');
  assert.equal(guest.meal, true);
  assert.equal(state.dining.food, 3);
  const tableId = guest.tableId;
  assert.equal(state.dining.tables[tableId].status, 'reserved');
  assert.equal(state.dining.tables[tableId].customerId, guest.id);
  for (let frame = 0; frame < 200 && guest.phase !== 'eating'; frame++) step(state, .05);
  assert.equal(guest.phase, 'eating');
  assert.equal(guest.meal, false);
  const position = getDiningLayout(state).tables[tableId].seat;
  assert.ok(Math.hypot(guest.x - position.x, guest.z - position.z) <= .026);
  run(state, getFacilityStats(state, 'inn').seconds - .1);
  assert.equal(state.lodgings, 0);
  run(state, .15);
  assert.equal(guest.phase, 'leaving');
  assert.equal(state.dining.tables[tableId].status, 'dirty');
  assert.equal(state.dining.tables[tableId].cash, mealPrice(state));
  assert.equal(state.lodgings, 1);
  assert.equal(state.patrons[0].loyalty, 2);
  assert.equal(state.patrons[0].hp, state.patrons[0].maxHp);
  assert.equal(state.gold, BALANCE.web.startingCoins, 'the meal bill waits in its money pile');
  run(state, 20);
  assert.equal(state.lodgings, 1);
  assert.equal(state.dining.tables[tableId].cash, mealPrice(state));
  assert.equal(state.patrons[0].loyalty, 2);
});

test('dirty or occupied seats block meal pickup until cleaning creates a clean seat', () => {
  const state = shop();
  state.dining.tables.forEach((table) => { table.status = 'dirty'; });
  const guest = addGuest(state);
  run(state, 2);
  assert.equal(guest.phase, 'food-queue');
  assert.equal(guest.meal, false);
  assert.equal(state.dining.food, 4, 'a waiting guest does not spend a meal');
  state.dining.cookClock = 0;
  Object.assign(state.player, getDiningLayout(state).tables[0].cleanPoint);
  run(state, DINING_RULES.cleanSeconds - .05);
  assert.equal(state.dining.cleaned, 0);
  run(state, .05);
  assert.equal(state.dining.cleaned, 1);
  assert.equal(guest.phase, 'to-table');
  assert.equal(guest.tableId, 0);
  assert.equal(state.dining.food, 3);
  assert.equal(state.dining.tables[0].status, 'reserved');
  assert.equal(state.dining.tables.filter(({ status }) => status === 'dirty').length, 3);
});

test('a dirty table requires a stationary nearby player, and movement resets partial cleaning', () => {
  const state = shop();
  state.dining.tables[0].status = 'dirty';
  const target = getDiningLayout(state).tables[0].cleanPoint;
  run(state, 3);
  assert.equal(state.dining.cleaned, 0, 'distant player does not clean');
  Object.assign(state.player, target);
  run(state, .6);
  assert.equal(state.player.workKind, 'clean');
  assert.ok(state.dining.tables[0].cleanProgress > .5);
  step(state, .05, { x: 1, z: 0 });
  assert.equal(state.dining.tables[0].cleanProgress, 0);
  run(state, .7);
  assert.equal(state.dining.cleaned, 0);
  run(state, .5);
  assert.equal(state.dining.cleaned, 1);
  assert.equal(state.dining.tables[0].status, 'clean');
  assert.equal(state.events.filter((event) => event.type === 'table-clean').length, 1);
  assert.equal(state.moneyPiles.inn, 0, 'cleaning is work, without a second sale');
});

test('four food guests reserve different tables and a fifth purchaser cannot exceed dining occupancy', () => {
  const state = shop();
  for (let index = 0; index < 4; index++) addGuest(state, `guest-${index}`);
  run(state, 2.5);
  const held = state.customers.filter((guest) => ['to-table', 'eating'].includes(guest.phase));
  assert.equal(held.length, 4);
  assert.equal(new Set(held.map(({ tableId }) => tableId)).size, 4);
  const front = getCustomerQueueSlots(state)[0];
  state.stocks.gear = 1;
  state.customers.push({ id: 'buyer', ...front, kind: 'warrior', product: 'gear', phase: 'queue', purchased: false, hp: 90, timer: getFacilityStats(state, 'counter').seconds, patience: 0 });
  step(state, .05);
  assert.equal(state.sales, 17);
  assert.equal(state.customers.find(({ id }) => id === 'buyer').phase, 'leaving');
});

test('a meal queue waits for carried food even with a full cooked-food kitchen', () => {
  const state = shop();
  state.dining.food = 0;
  const guest = addGuest(state);
  run(state, 15);
  assert.equal(guest.phase, 'food-queue');
  assert.equal(state.lodgings, 0);
  assert.equal(state.dining.kitchen, 8);
  assert.ok(state.dining.tables.every(({ status }) => status === 'clean'));
  const layout = getDiningLayout(state);
  Object.assign(state.player, layout.kitchenPoint);
  run(state, .4);
  assert.equal(state.player.bag.food, 1);
  assert.equal(guest.phase, 'food-queue');
  Object.assign(state.player, { ...layout.counterPoint, dwell: 0, transferClock: 0 });
  run(state, .4);
  assert.equal(guest.phase, 'to-table');
  assert.equal(state.dining.food, 0);
});

test('dining v1 saves keep food and dirty tables, convert occupied seats safely, and accept old records', () => {
  const state = shop();
  state.dining.kitchen = 6;
  state.dining.food = 2;
  state.dining.cleaned = 7;
  state.dining.tables[0].status = 'dirty';
  state.dining.tables[1].status = 'reserved';
  state.dining.tables[2].status = 'eating';
  const saved = JSON.parse(serialize(state));
  const loaded = restore(saved);
  assert.equal(loaded.saveReset, false);
  assert.equal(loaded.dining.kitchen, 6);
  assert.equal(loaded.dining.food, 2);
  assert.equal(loaded.dining.cleaned, 7);
  assert.deepEqual(loaded.dining.tables.map(({ status }) => status), ['dirty', 'dirty', 'dirty', 'clean']);
  assert.ok(loaded.dining.tables.every(({ customerId, cleanProgress }) => customerId === null && cleanProgress === 0));
  assert.equal(loaded.customers.length, 0, 'transient customers are not serialized');
  delete saved.dining.kitchen;
  const previousDining = restore(saved);
  assert.equal(previousDining.dining.kitchen, 4);
  assert.equal(previousDining.dining.food, 2, 'existing serving stock remains usable');
  delete saved.dining;
  const old = restore(saved);
  assert.equal(old.saveReset, false);
  assert.equal(old.dining.kitchen, 4);
  assert.equal(old.dining.food, 0);
  assert.ok(old.dining.tables.every(({ status }) => status === 'clean'));
  for (const badDining of [null, { ...state.dining, kitchen: 9 }, { ...state.dining, food: 9 }, { ...state.dining, cleaned: -1 }, { ...state.dining, tables: [] }, { ...state.dining, tables: [{ status: 'bad' }, ...state.dining.tables.slice(1)] }]) {
    assert.equal(restore({ ...saved, dining: badDining }).saveReset, true);
  }
});

test('departure cancels meals without paying, releases reservations, and leaves used seats dirty', () => {
  const state = shop();
  addGuest(state, 'eater', 'eating', 0);
  addGuest(state, 'carrier', 'to-table', 1);
  addGuest(state, 'waiting');
  state.raid.phase = 'warning';
  state.raid.timer = .01;
  step(state, .05);
  assert.equal(state.raid.phase, 'departure');
  assert.equal(state.lodgings, 0);
  assert.equal(state.moneyPiles.inn, 0);
  assert.equal(state.dining.tables[0].status, 'dirty');
  assert.equal(state.dining.tables[1].status, 'clean');
  assert.ok(state.customers.every(({ meal, tableId }) => !meal && tableId === null));
  run(state, 1.2);
  assert.equal(state.raid.location, 'outside');
  assert.ok(state.customers.every(({ phase }) => phase === 'leaving'));
  assert.equal(state.lodgings, 0);
  assert.ok(state.dining.tables.every(({ customerId }) => customerId === null));
  assert.ok(state.patrons.every(({ loyalty }) => loyalty === 1));
});

test('customers walk directly through other characters to their waiting slot and regional exit', () => {
  const state = createGame(42);
  state.timers.customer = 1000;
  const gate = getStations(state).gate;
  const target = getCustomerBranchPoint(state);
  const customer = { id: 'walker', ...getCustomerEntrySlots(state)[0], kind: 'warrior', product: 'gear', phase: 'entrance', hp: 90, purchased: false, timer: 0, patience: 0 };
  state.customers.push(customer);
  const before = { x: customer.x, z: customer.z };
  step(state, .05);
  const cross = (customer.x - before.x) * (target.z - before.z) - (customer.z - before.z) * (target.x - before.x);
  assert.ok(Math.abs(cross) < 1e-8, 'entry takes a straight segment through the doorway to the shared branch');
  assert.ok(Math.abs(Math.hypot(customer.x - before.x, customer.z - before.z) - 1.8 * .05) < 1e-8);
  const overlapping = [0, 1].map((id) => ({ ...customer, id: `leaving-${id}`, x: -3, z: -2, phase: 'leaving', purchased: true }));
  state.customers = overlapping;
  step(state, .05);
  assert.equal(overlapping[0].x, overlapping[1].x);
  assert.equal(overlapping[0].z, overlapping[1].z, 'there is no pedestrian separation or forced aisle detour');
  const exit = { x: gate.x, z: gate.z - .15 };
  const crossExit = (overlapping[0].x + 3) * (exit.z + 2) - (overlapping[0].z + 2) * (exit.x + 3);
  assert.ok(Math.abs(crossExit) < 1e-8);
  run(state, 10);
  assert.equal(state.customers.length, 0);
});
