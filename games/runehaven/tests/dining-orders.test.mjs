import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, getCustomerQueueSlots, getDiningLayout, getFacilityStats, getSalePrice, restore, serialize, step } from '../rules.mjs';
import { setSeatState, expandDining } from './dining-fixtures.mjs';
const run = (state, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds * 20); i++) step(state, .05, input); };
function shop(count = 1, seed = 42) {
  const state = createGame(seed); state.sales = 20; state.unlocks.inn = state.unlocks.alchemy = true;
  expandDining(state, count); state.gold = 10000; state.raid.timer = state.raid.triggerSales = state.timers.customer = 1e6;
  Object.assign(state.player, { x: 5.8, z: 5.8 }); return state;
}
function order(product, total) { return { product, total, served: 0, remaining: total, unitPrice: null, equipmentLevel: null }; }
function customer(state, id, phase = 'food-queue', total = 1, seatId = null) {
  const layout = getDiningLayout(state), dining = ['food-queue', 'to-table', 'eating'].includes(phase);
  const position = phase === 'eating' ? layout.tables[0].seats[seatId].seatPoint : dining ? layout.queue[0] : getCustomerQueueSlots(state)[0];
  const value = { id, ...position, kind: 'warrior', product: 'gear', phase, hp: 90, purchased: dining, patronId: dining ? id : null, patience: 0,
    timer: 0, foodJoinedAt: state.time, tableId: seatId === null ? null : 0, seatId, order: order(dining ? 'food' : 'gear', total) };
  state.customers.push(value);
  if (dining) state.patrons.push({ id, kind: 'warrior', purchases: 1, totalSpent: 50, loyalty: 1, hp: 90, maxHp: 90, equipmentLevel: 1 });
  if (phase === 'eating') setSeatState(state, 0, seatId, 'eating', { customerId: id });
  return value;
}

test('one purchased table seats two diners opposite each other and a third waits without spending food', () => {
  const state = shop(); state.dining.food = 4;
  const a = customer(state, 'a'), b = customer(state, 'b'), c = customer(state, 'c'); run(state, 3);
  assert.equal(a.phase, 'eating'); assert.equal(b.phase, 'eating'); assert.equal(c.phase, 'food-queue');
  assert.equal(a.tableId, 0); assert.equal(b.tableId, 0); assert.deepEqual(new Set([a.seatId, b.seatId]), new Set([0, 1]));
  assert.equal(Math.abs(a.seatYaw - b.seatYaw), Math.PI); assert.ok(Math.abs(a.z - b.z) > 1.2);
  assert.equal(c.waitReason, 'seats'); assert.equal(state.dining.food, 2);
});

test('cleaning one dirty seat preserves the other diner, claim, timer, and shared table money', () => {
  const state = shop(); const eater = customer(state, 'eater', 'eating', 1, 1); state.dining.tables[0].cash = 321;
  setSeatState(state, 0, 0, 'dirty'); Object.assign(state.player, getDiningLayout(state).tables[0].seats[0].cleanPoint);
  run(state, .6); assert.equal(state.player.workKind, 'clean'); assert.ok(state.player.workProgress >= .49);
  assert.deepEqual(state.player.workTarget, { tableId: 0, seatId: 0 }); run(state, .6);
  assert.equal(state.dining.tables[0].seats[0].status, 'clean'); assert.equal(state.dining.tables[0].seats[1].status, 'eating');
  assert.equal(state.dining.tables[0].seats[1].customerId, eater.id); assert.equal(eater.phase, 'eating'); assert.ok(eater.timer >= 1.19);
  assert.equal(state.dining.tables[0].cash, 321); assert.equal(state.dining.cleaned, 1);
});

test('opposite dirty seats can have independent helper claims and both clean exactly once', () => {
  const state = shop(); const layout = getDiningLayout(state);
  for (let seatId = 0; seatId < 2; seatId++) {
    setSeatState(state, 0, seatId, 'dirty'); act(state, 'hire'); const helper = state.staff.at(-1);
    act(state, 'assign-worker', { id: helper.id, job: 'clean' }); Object.assign(helper, layout.tables[0].seats[seatId].cleanPoint);
  }
  step(state, .05); assert.deepEqual(state.staff.map(helper => helper.cleanSeatId), [0, 1]);
  assert.deepEqual(state.dining.tables[0].seats.map(seat => seat.cleanerId), state.staff.map(helper => helper.id));
  run(state, 1.15); assert.equal(state.dining.cleaned, 2); assert.ok(state.dining.tables[0].seats.every(seat => seat.status === 'clean'));
});

test('legacy one-chair saves migrate only that used seat, while new occupied seats restore dirty independently', () => {
  const state = shop(2); state.dining.tables[0].cash = 350; setSeatState(state, 0, 0, 'eating'); setSeatState(state, 0, 1, 'reserved');
  const raw = JSON.parse(serialize(state)); const loaded = restore(raw);
  assert.equal(loaded.saveReset, false); assert.equal(loaded.dining.tableCount, 2); assert.equal(loaded.dining.tables[0].cash, 350);
  assert.deepEqual(loaded.dining.tables[0].seats.map(seat => seat.status), ['dirty', 'dirty']);
  raw.dining.tables.forEach(table => delete table.seats); const old = restore(raw);
  assert.equal(old.saveReset, false); assert.deepEqual(old.dining.tables[0].seats.map(seat => seat.status), ['dirty', 'clean']);
  for (const bad of [[], [{ status: 'dirty' }], [{ status: 'clean' }, { status: 'invalid' }]]) {
    const broken = structuredClone(raw); broken.dining.tables[0].seats = bad; assert.equal(restore(broken).saveReset, true);
  }
});

test('spawned quantities use table milestones, are deterministic, and stay fixed after further purchases', () => {
  const seen = new Set();
  for (const count of [1, 2, 3, 4]) for (let seed = 1; seed <= 8; seed++) {
    const state = shop(count, seed); state.timers.customer = 0; step(state, .05);
    const buyer = state.customers[0], total = buyer.order.total; seen.add(count + ':' + total);
    assert.ok(count === 1 ? total === 1 : count === 4 ? total >= 2 && total <= 3 : total >= 1 && total <= 2);
    const other = shop(count, seed); other.timers.customer = 0; step(other, .05); assert.equal(other.customers[0].order.total, total);
    if (count < 4) act(state, 'unlock-table'); run(state, 1); assert.equal(buyer.order.total, total);
  }
  assert.ok(seen.has('2:1') && seen.has('2:2') && seen.has('4:2') && seen.has('4:3'));
});

test('a partial retail order waits for real stock, transfers one at a time and pays its quoted total only once', () => {
  const state = shop(4); state.unlocks.inn = false; const buyer = customer(state, 'buyer', 'queue', 3), price = getSalePrice(state, 'gear');
  state.stocks.gear = 1; run(state, getFacilityStats(state, 'counter').seconds);
  assert.equal(buyer.order.served, 1); assert.equal(buyer.order.remaining, 2); assert.equal(buyer.waitReason, 'stock');
  assert.equal(state.sales, 20); assert.equal(state.moneyPiles.gear, 0); assert.equal(state.patrons.length, 0);
  state.player.priceLevel = 2; state.stocks.gear = 2; run(state, .2); assert.equal(buyer.order.served, 1); run(state, .05);
  assert.equal(buyer.order.served, 2); assert.equal(buyer.order.remaining, 1); run(state, .25);
  assert.equal(state.sales, 21); assert.equal(state.moneyPiles.gear, price * 3); assert.equal(state.patrons.length, 1);
  assert.equal(state.patrons[0].purchases, 1); assert.equal(state.patrons[0].equipmentLevel, 1);
  const deliveries = state.events.filter(event => event.type === 'order-transfer'); assert.deepEqual(deliveries.map(event => event.remaining), [2, 1, 0]);
  run(state, 3); assert.equal(state.moneyPiles.gear, price * 3); assert.equal(state.sales, 21);
});

test('partial meal order holds one seat, waits for the remaining food, then eats and pays every received unit once', () => {
  const state = shop(4); const guest = customer(state, 'guest', 'food-queue', 3); state.dining.food = 1; step(state, .05);
  assert.equal(guest.phase, 'food-queue'); assert.equal(guest.order.served, 1); assert.equal(guest.order.remaining, 2);
  assert.equal(state.dining.tables[0].seats[0].status, 'reserved'); assert.equal(guest.seatId, 0); assert.equal(state.lodgings, 0);
  run(state, 1); assert.equal(guest.order.served, 1); state.dining.food = 2; run(state, .5);
  assert.equal(guest.phase, 'to-table'); assert.equal(guest.mealCount, 3); assert.equal(state.dining.food, 0);
  run(state, 8); assert.equal(state.lodgings, 1); assert.equal(state.dining.tables[0].cash, 720); assert.equal(state.patrons[0].loyalty, 2);
});

test('partial orders survive save/reload and departure through durable stock returns without loss, double payment or overflow', () => {
  for (const product of ['gear', 'food']) {
    const state = shop(4), guest = customer(state, product, product === 'food' ? 'food-queue' : 'queue', 3);
    const pool = product === 'food' ? state.dining : state.stocks; pool[product] = 1;
    run(state, product === 'food' ? .05 : getFacilityStats(state, 'counter').seconds); assert.equal(guest.order.served, 1);
    pool[product] = product === 'food' ? 8 : 60; const saved = serialize(state); assert.equal(guest.order.served, 1, 'saving is a pure snapshot');
    const loaded = restore(saved); assert.equal(loaded.saveReset, false); assert.equal(loaded.returnedStock[product], 1); assert.equal(loaded.customers.length, 0);
    step(loaded, .05); assert.equal(loaded.returnedStock[product], 1, 'full shelf retains the overflow');
    const loadedPool = product === 'food' ? loaded.dining : loaded.stocks; loadedPool[product]--; step(loaded, .05);
    assert.equal(loaded.returnedStock[product], 0); assert.equal(loadedPool[product], product === 'food' ? 8 : 60);
    state.raid.phase = 'warning'; state.raid.timer = .01; step(state, .05); assert.equal(state.returnedStock[product], 1);
    run(state, 2.2); assert.equal(state.returnedStock[product], 1, 'repeated cancellation cannot duplicate returns');
    assert.equal(state.economy.earned, 0); assert.equal(state.lodgings, 0); assert.ok(state.dining.tables.every(table => table.seats.every(seat => seat.customerId === null)));
  }
});
