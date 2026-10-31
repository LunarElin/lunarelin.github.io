import { act } from './interaction-fixtures.mjs';
import { setSeatState } from './dining-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, TABLE_UNLOCK_COSTS } from '../balance.mjs';
import { createGame, getDiningLayout, getFacilityStats, getMoneyPiles, getTableUnlockInfo, restore, serialize, step } from '../rules.mjs';

function run(state, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) step(state, .05, input);
}
function inn() {
  const state = createGame(42);
  state.sales = 16; state.raid.timer = state.raid.triggerSales = 1e6; state.timers.customer = 1e6;
  assert.equal(act(state, 'unlock', { kind: 'inn' }).ok, true);
  Object.assign(state.player, { x: 5.8, z: 5.8 });
  return state;
}
function guest(state, id, phase = 'food-queue', seatId = 0) {
  state.patrons.push({ id, kind: 'warrior', purchases: 1, totalSpent: 50, loyalty: 1, hp: 90, maxHp: 90, equipmentLevel: 1 });
  const place = getDiningLayout(state);
  const customer = { id, ...(phase === 'eating' ? place.tables[0].seats[seatId].seatPoint : place.queue[0]), kind: 'warrior', product: 'gear', phase,
    hp: 90, purchased: true, patronId: id, timer: 0, patience: 0, tableId: phase === 'eating' ? 0 : null, seatId, foodJoinedAt: state.time };
  state.customers.push(customer);
  if (phase === 'eating') setSeatState(state, 0, seatId, 'eating', { customerId: id });
  return customer;
}

test('opening the inn buys one table, then the three actual opening prices unlock only the next table', () => {
  const closed = createGame(42);
  assert.deepEqual(TABLE_UNLOCK_COSTS, [5, 50, 150, 200]);
  assert.equal(getTableUnlockInfo(closed).canBuy, false);
  assert.equal(act(closed, 'unlock-table').ok, false);
  const state = inn();
  assert.equal(state.gold, BALANCE.web.startingCoins - 5);
  assert.equal(state.dining.tableCount, 1);
  assert.deepEqual(state.dining.tables.map(table => table.status), ['clean', 'locked', 'locked', 'locked']);
  assert.deepEqual(getTableUnlockInfo(state), { count: 1, max: 4, tableId: 1, cost: 50, canBuy: true });
  state.gold = 49;
  assert.equal(act(state, 'unlock-table').ok, false);
  assert.equal(state.dining.tableCount, 1);
  state.gold = 400;
  assert.equal(act(state, 'unlock-table', { tableId: 2 }).ok, false, 'later tables cannot skip a purchase');
  for (const [tableId, cost] of [[1, 50], [2, 150], [3, 200]]) {
    const before = state.gold;
    assert.equal(act(state, 'unlock-table', { tableId }).ok, true);
    assert.equal(state.gold, before - cost);
    assert.equal(state.dining.tableCount, tableId + 1);
    assert.equal(state.dining.tables[tableId].status, 'clean');
  }
  assert.equal(state.gold, 0);
  assert.equal(state.economy.spent, 405);
  assert.deepEqual(getTableUnlockInfo(state), { count: 4, max: 4, tableId: null, cost: 0, canBuy: false });
  assert.equal(act(state, 'unlock-table').ok, false);
});

test('two occupied or dirty seats keep the next guest waiting without using locked seats or spending a meal', () => {
  const state = inn(); state.dining.food = 4;
  guest(state, 'eater', 'eating'); guest(state, 'eater-2', 'eating', 1); const waiting = guest(state, 'waiting');
  run(state, .5);
  assert.equal(waiting.phase, 'food-queue');
  assert.equal(state.dining.food, 4);
  run(state, getFacilityStats(state, 'inn').seconds);
  assert.equal(state.dining.tables[0].status, 'dirty');
  assert.equal(waiting.phase, 'food-queue');
  assert.equal(state.dining.food, 4);
  assert.ok(state.dining.tables.slice(1).every(table => table.status === 'locked'));
  Object.assign(state.player, getDiningLayout(state).tables[0].cleanPoint);
  run(state, 1.2);
  assert.equal(state.dining.cleaned, 1);
  assert.equal(waiting.phase, 'to-table');
  assert.equal(waiting.tableId, 0);
  assert.equal(state.dining.food, 3);
  assert.ok(state.dining.tables[0].cash > 0, 'cleaning never collects or duplicates its bill');
});

test('each meal leaves its bill beside its table, and proximity collects only that pile once', () => {
  const state = inn(); guest(state, 'eater', 'eating');
  const originalGold = state.gold;
  run(state, 5.05);
  const bill = BALANCE.facilities.inn.salePrice * 10;
  assert.equal(state.moneyPiles.inn, 0, 'new table income never enters the legacy aggregate');
  assert.equal(state.dining.tables[0].cash, bill);
  assert.equal(state.economy.earned, bill);
  assert.equal(state.gold, originalGold);
  const tablePile = getMoneyPiles(state).find(pile => pile.id === 'table-0');
  assert.equal(tablePile.kind, 'inn'); assert.equal(tablePile.tableId, 0);
  assert.equal(getMoneyPiles(state).reduce((sum, pile) => sum + pile.amount, 0), bill);
  state.moneyPiles.inn = 51; // An uncollected bill inherited from an older save.
  Object.assign(state.player, tablePile);
  step(state, .05);
  assert.equal(state.gold, originalGold + bill);
  assert.equal(state.dining.tables[0].cash, 0);
  assert.equal(state.moneyPiles.inn, 51);
  assert.equal(state.dining.tables[0].status, 'dirty');
  run(state, .5);
  assert.equal(state.gold, originalGold + bill, 'a held position cannot pay twice');
  const legacy = getMoneyPiles(state).find(pile => pile.id === 'inn');
  Object.assign(state.player, legacy); step(state, .05);
  assert.equal(state.gold, originalGold + bill + 51);
  assert.equal(state.moneyPiles.inn, 0);
});

test('v1 saves retain partial table expansion and separate bills while older open inns retain all four seats and legacy money', () => {
  const state = inn(); state.gold = 1000;
  act(state, 'unlock-table'); setSeatState(state, 0, 0, 'dirty'); state.dining.tables[0].cash = 240; state.moneyPiles.inn = 51;
  const saved = JSON.parse(serialize(state)), loaded = restore(saved);
  assert.equal(loaded.saveReset, false);
  assert.equal(loaded.dining.tableCount, 2);
  assert.deepEqual(loaded.dining.tables.map(table => table.status), ['dirty', 'clean', 'locked', 'locked']);
  assert.equal(loaded.dining.tables[0].cash, 240); assert.equal(loaded.moneyPiles.inn, 51);
  assert.equal(getMoneyPiles(loaded).reduce((sum, pile) => sum + pile.amount, 0), 291);
  const legacy = structuredClone(saved); delete legacy.dining.tableCount;
  legacy.dining.tables = legacy.dining.tables.map(() => ({ status: 'clean' }));
  const old = restore(legacy);
  assert.equal(old.saveReset, false); assert.equal(old.dining.tableCount, 4);
  assert.ok(old.dining.tables.every(table => table.status === 'clean' && table.cash === 0));
  assert.equal(old.moneyPiles.inn, 51, 'old bills are not redistributed or lost');
  const oldClosed = JSON.parse(serialize(createGame(42))); delete oldClosed.dining.tableCount;
  oldClosed.dining.tables = oldClosed.dining.tables.map(() => ({ status: 'clean' }));
  assert.equal(restore(oldClosed).dining.tableCount, 1);
  for (const corrupt of [
    data => { data.dining.tableCount = 5; }, data => { data.dining.tableCount = 0; },
    data => { data.dining.tables[0].cash = -1; }, data => { data.dining.tables[2].cash = 1; },
    data => { data.dining.tables[2].status = 'clean'; },
  ]) {
    const invalid = structuredClone(saved); corrupt(invalid); assert.equal(restore(invalid).saveReset, true);
  }
});

test('all five source-backed helpers survive saving, while a sixth hire or saved helper is rejected', () => {
  const state = createGame(42); state.gold = 10000;
  for (let index = 0; index < BALANCE.worker.maxEmploy; index++) assert.equal(act(state, 'hire').ok, true);
  assert.equal(state.staff.length, 5);
  assert.equal(act(state, 'hire').ok, false);
  const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false); assert.equal(loaded.staff.length, 5);
  const invalid = JSON.parse(serialize(state)); invalid.staff.push({ ...invalid.staff[0], id: 'sixth' });
  assert.equal(restore(invalid).saveReset, true);
});

test('departure, victory, and the next region preserve purchased table slots and uncollected bills', () => {
  const state = inn(); state.gold = 1000; act(state, 'unlock-table');
  state.dining.tables[0].cash = 123;
  for (let index = 0; index < 3; index++) guest(state, `defender-${index}`);
  state.raid.phase = 'warning'; state.raid.timer = .01;
  step(state, .05); run(state, 2.2);
  assert.equal(state.raid.phase, 'battle');
  assert.equal(getTableUnlockInfo(state).canBuy, false);
  state.raid.enemies = []; state.raid.spawnRemaining = 0; step(state, .05);
  assert.equal(state.raid.phase, 'victory'); assert.equal(state.stage, 2);
  assert.equal(act(state, 'continue').ok, true);
  assert.equal(state.dining.tableCount, 2); assert.equal(state.dining.tables[0].cash, 123);
  assert.equal(getMoneyPiles(state).find(pile => pile.id === 'table-0').amount, 123);
});
