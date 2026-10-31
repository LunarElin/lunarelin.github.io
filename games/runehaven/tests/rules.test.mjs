import { act, actWhileTraveling, getPendingActionTarget } from './interaction-fixtures.mjs';
import { setSeatState } from './dining-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, CLASS_STATS, COMBAT_RADIUS, createGame, getCapacity, getFacilityStats, getFacilityUpgradeInfo, getHireInfo, getMoneyPiles, getRegion, getSalePrice, getStationApproach, getStations, getUpgradeInfo, getWorkerUpgradeInfo, restore, separateCombatants, serialize, STATIONS, step } from '../rules.mjs';
import { BATTLE_BOUNDS, getBattleLayout } from '../battlefield.mjs';

function run(state, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) step(state, Math.min(0.1, seconds - elapsed), input);
}

function patron(id, kind = 'warrior') {
  return { id, kind, purchases: 1, totalSpent: 50, loyalty: 1, hp: CLASS_STATS[kind].hp, maxHp: CLASS_STATS[kind].hp, equipmentLevel: 1 };
}

function enterBattle(state) {
  for (let frame = 0; frame < 300 && state.raid.phase !== 'battle'; frame++) step(state, .05);
  assert.equal(state.raid.phase, 'battle');
  assert.equal(state.raid.location, 'outside');
}

test('upgrade transaction preserves exact imported cost, capacity and speed curves', () => {
  const state = createGame(1);
  const initial = state.gold;
  const info = getUpgradeInfo(state, 'capacity');
  assert.equal(info.cost, BALANCE.playerLevels[0].capacityCost);
  assert.equal(act(state, 'upgrade', { kind: 'capacity' }).ok, true);
  assert.equal(state.gold, initial - info.cost);
  assert.equal(getCapacity(state), BALANCE.playerLevels[1].capacity);
  const before = serialize(state);
  assert.equal(act(state, 'upgrade', { kind: 'speed' }).ok, false);
  assert.equal(state.gold, JSON.parse(before).gold);
  state.gold = 1e7;
  for (let level = 2; level <= 21; level++) assert.equal(act(state, 'upgrade', { kind: 'speed' }).ok, true);
  assert.equal(state.player.speedLevel, 21);
  assert.equal(getUpgradeInfo(state, 'speed').nextValue, null);
  assert.equal(act(state, 'upgrade', { kind: 'speed' }).ok, false);
});

test('movement, collection and deposit enforce shared bag capacity and shop bounds', () => {
  const state = createGame(2);
  Object.assign(state.player, getStationApproach(state, 'forge'));
  run(state, 2);
  assert.equal(state.player.bag.gear, 2);
  assert.equal(state.player.bag.gear + state.player.bag.potion, getCapacity(state));
  Object.assign(state.player, getStationApproach(state, 'counter'));
  run(state, 1);
  assert.equal(state.player.bag.gear, 0);
  assert.equal(state.stocks.gear, 2);
  run(state, 20, { x: 1, z: 1 });
  assert.equal(state.player.x, BOUNDS.maxX);
  assert.equal(state.player.z, BOUNDS.maxZ);
});

test('the first paid customer is a warrior; unpaid visitors never enter the patron ledger', () => {
  const state = createGame(3);
  run(state, 10);
  assert.ok(state.customers.length > 0);
  assert.equal(state.customers[0].kind, 'warrior');
  assert.equal(state.patrons.length, 0);
  state.stocks.gear = 4;
  run(state, 3);
  assert.ok(state.sales > 0);
  assert.equal(state.patrons[0].kind, 'warrior');
  assert.equal(state.patrons[0].totalSpent, getSalePrice(state));
  assert.ok(state.patrons.every((item) => item.purchases > 0));
});

test('archer, alchemy, inn and mage unlocks require paid progression and facility purchase', () => {
  const state = createGame(4);
  state.gold = 2000;
  assert.equal(act(state, 'unlock', { kind: 'alchemy' }).ok, false);
  state.sales = 8;
  step(state, 0.1);
  assert.equal(state.unlocks.archer, true);
  assert.equal(state.unlocks.mage, false);
  const before = state.gold;
  assert.equal(act(state, 'unlock', { kind: 'alchemy' }).ok, true);
  assert.equal(state.gold, before - BALANCE.facilities.alchemy.costs[0]);
  state.sales = 16;
  assert.equal(act(state, 'unlock', { kind: 'inn' }).ok, true);
  state.sales = 20;
  step(state, 0.1);
  assert.equal(state.unlocks.mage, true);
});

test('hired helper physically carries source-stat stock and hiring caps at the original five', () => {
  const state = createGame(5);
  assert.equal(getHireInfo(state).cost, BALANCE.worker.employCosts[0]);
  assert.equal(act(state, 'hire').ok, true);
  const helper = state.staff[0];
  const source = BALANCE.staffs.find((item) => item.id === helper.sourceId);
  assert.equal(helper.capacity, source.capacity);
  assert.equal(helper.speed, source.speed);
  run(state, 0.7);
  assert.ok(helper.bag.gear > 0);
  assert.equal(state.stocks.gear, 0);
  run(state, 12);
  assert.ok(state.sales > 0 || state.stocks.gear > 0);
  state.gold = 10000;
  for (let index = 1; index < BALANCE.worker.maxEmploy; index++) act(state, 'hire');
  assert.equal(state.staff.length, BALANCE.worker.maxEmploy);
  assert.equal(act(state, 'hire').ok, false);
});

test('only purchased patrons return as defenders and the first raid is winnable', () => {
  const state = createGame(6);
  state.patrons = Array.from({ length: 8 }, (_, index) => patron(`paid-${index}`));
  state.customers.push({ id: 'unpaid', x: 0, z: 5, kind: 'mage', product: 'potion', phase: 'queue', hp: 55, purchased: false, timer: 0, patience: 0 });
  state.raid.phase = 'warning'; state.raid.timer = 0.1;
  run(state, 0.2);
  assert.equal(state.raid.phase, 'departure');
  enterBattle(state);
  assert.equal(state.raid.defenders.length, 8);
  assert.ok(state.raid.defenders.every((item) => state.patrons.some((paid) => paid.id === item.patronId && paid.purchases > 0)));
  assert.equal(state.raid.defenders.some((item) => item.patronId === 'unpaid'), false);
  run(state, 45);
  assert.equal(state.raid.wins, 1);
  assert.equal(state.stage, 2);
  assert.equal(state.milestone, true);
  assert.ok(state.gold >= 80 + BALANCE.web.raidCoinRewards[0]);
});

test('learning without purchases never starts a raid; an expired timer waits for three paid patrons', () => {
  const state = createGame(61);
  run(state, 100);
  assert.equal(state.sales, 0);
  assert.equal(state.patrons.length, 0);
  assert.equal(state.raid.phase, 'idle');
  assert.equal(state.raid.timer, 0);
  state.stocks.gear = 2;
  run(state, 15);
  assert.equal(state.sales, 2);
  assert.equal(state.patrons.length, 2);
  assert.equal(state.raid.phase, 'idle');
  state.stocks.gear = 1;
  // A newly arriving third buyer must traverse the common entrance and branch.
  for (let wait = 0; wait < 200 && state.sales < 3; wait++) step(state, .1);
  assert.equal(state.sales, 3);
  assert.equal(state.patrons.length, 3);
  assert.equal(state.raid.phase, 'warning');
  run(state, 10);
  assert.equal(state.raid.phase, 'departure');
  enterBattle(state);
  assert.equal(state.raid.defenders.length, 3);
});

test('archer range and mage splash differ from warrior melee behavior', () => {
  assert.ok(CLASS_STATS.archer.range > CLASS_STATS.warrior.range);
  assert.ok(CLASS_STATS.mage.range > CLASS_STATS.warrior.range);
  const state = createGame(7);
  state.raid.phase = 'battle'; state.raid.spawnRemaining = 0;
  state.raid.defenders = [{ id: 'mage', patronId: 'paid', kind: 'mage', x: 0, z: 0, hp: 55, maxHp: 55, damage: 22, range: 3.1, speed: 1.4, interval: 1.65, attackClock: 0 }];
  state.raid.enemies = [0, 0.5, 1].map((x) => ({ id: `enemy${x}`, x, z: 2, hp: 100, maxHp: 100, damage: 1, speed: 0, range: 0.8, interval: 2, attackClock: 2 }));
  step(state, 0.1);
  assert.ok(state.raid.enemies.every((enemy) => enemy.hp === 78));
});

test('raid defeat permits free recovery and alternates monster/army stages', () => {
  const state = createGame(8);
  state.raid.phase = 'battle'; state.raid.spawnRemaining = 0; state.shopHp = 1;
  state.raid.location = 'outside'; state.raid.returnPosition = { x: state.player.x, z: state.player.z };
  state.raid.enemies = [{ id: 'attacker', kind: 'slime', x: 0, z: getBattleLayout(state).shop.z + .4, hp: 100, maxHp: 100, damage: 10, speed: 0, range: 1, interval: 1, attackClock: 0 }];
  step(state, 0.1);
  assert.equal(state.status, 'defeat');
  assert.equal(state.shopHp, 0);
  state.gold = 0;
  assert.equal(act(state, 'repair').ok, true);
  assert.equal(state.gold, 0);
  assert.equal(state.shopHp, state.shopMaxHp);
  run(state, 5);
  assert.equal(state.raid.phase, 'idle');
  state.patrons = Array.from({ length: 3 }, (_, index) => patron(`returning-${index}`));
  state.stage = 2; state.raid.wins = 1; state.raid.phase = 'idle'; state.raid.timer = 0.05;
  step(state, 0.1);
  assert.equal(state.raid.phase, 'warning');
  assert.equal(state.raid.kind, 'army');
  run(state, 10);
  assert.equal(state.raid.phase, 'departure');
  enterBattle(state);
});

test('level 21 blink respects range, world bounds and four-second cooldown', () => {
  const state = createGame(9);
  assert.equal(act(state, 'blink', { x: 6, z: 6 }).ok, false);
  state.player.speedLevel = 21;
  const start = { x: state.player.x, z: state.player.z };
  assert.equal(act(state, 'blink', { x: 100, z: 100 }).ok, true);
  assert.ok(Math.hypot(state.player.x - start.x, state.player.z - start.z) <= 3.500001);
  assert.equal(act(state, 'blink', { x: -6, z: -4 }).ok, false);
  run(state, 4.1);
  Object.assign(state.player, { x: BOUNDS.maxX - .1, z: BOUNDS.maxZ - .1 });
  assert.equal(act(state, 'blink', { x: 100, z: 100 }).ok, true);
  assert.equal(state.player.x, BOUNDS.maxX); assert.equal(state.player.z, BOUNDS.maxZ);
});

test('inn customers pay for a completed meal, heal and gain loyalty', () => {
  const state = createGame(10);
  state.sales = 16; state.unlocks.inn = true;
  state.patrons.push({ ...patron('lodger'), hp: 20 });
  setSeatState(state, 0, 0, 'eating', { customerId: 'lodger' });
  state.customers.push({ id: 'lodger', x: -1.25, z: -.75, tableId: 0, kind: 'warrior', product: 'gear', phase: 'eating', purchased: true, patronId: 'lodger', timer: 0, patience: 0 });
  const before = state.gold;
  run(state, 5.5);
  assert.equal(state.lodgings, 1);
  assert.equal(state.gold, before);
  assert.equal(state.dining.tables[0].cash, BALANCE.facilities.inn.salePrice * 10);
  assert.equal(state.patrons[0].hp, state.patrons[0].maxHp);
  assert.equal(state.patrons[0].loyalty, 2);
});

test('save roundtrip preserves progression and rejects corrupted or incompatible values', () => {
  const state = createGame(11);
  act(state, 'hire');
  run(state, 0.6);
  state.patrons.push(patron('saved')); state.sales = 1;
  const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false);
  assert.equal(loaded.gold, state.gold);
  assert.equal(loaded.patrons[0].id, 'saved');
  assert.equal(loaded.staff[0].sourceId, state.staff[0].sourceId);
  assert.deepEqual(loaded.staff[0].bag, state.staff[0].bag);
  assert.equal(loaded.staff[0].phase, state.staff[0].phase);
  assert.equal(restore('{broken').saveReset, true);
  const corrupt = JSON.parse(serialize(state));
  corrupt.player.bag.gear = 500;
  assert.equal(restore(corrupt).saveReset, true);
  corrupt.player.bag.gear = 0; corrupt.version = 999;
  assert.equal(restore(corrupt).saveReset, true);
  corrupt.version = 1; corrupt.gold = -1;
  assert.equal(restore(corrupt).saveReset, true);
  corrupt.gold = 10; corrupt.patrons[0].purchases = 0;
  assert.equal(restore(corrupt).saveReset, true);
});

test('battle saves resume at preparation checkpoint; pause and invalid dt do not advance', () => {
  const state = createGame(12);
  state.raid.phase = 'battle'; state.raid.wave = 1;
  state.sales = 22;
  const loaded = restore(serialize(state));
  assert.equal(loaded.raid.phase, 'idle');
  assert.equal(loaded.raid.enemies.length, 0);
  assert.equal(loaded.raid.timer, 45);
  step(loaded, 1);
  assert.equal(loaded.raid.phase, 'idle');
  const before = state.time;
  step(state, 0); step(state, NaN); step(state, -1);
  assert.equal(state.time, before);
  step(state, 0.1, null);
  assert.ok(state.time > before);
  const stoppedTime = state.time;
  state.status = 'defeat';
  step(state, 1);
  assert.equal(state.time, stoppedTime);
  assert.equal(act(state, 'restart').ok, true);
  assert.equal(state.sales, 0); assert.equal(state.status, 'playing');
});

test('an unmodified new game reaches its first defense milestone through normal movement and purchases', () => {
  const act = actWhileTraveling;
  const state = createGame(42);
  act(state, 'hire');
  act(state, 'upgrade', { kind: 'capacity' });
  let carrying = false;
  for (let elapsed = 0; elapsed < 150 && state.raid.wins === 0; elapsed += 0.1) {
    if (state.unlocks.alchemyAvailable && !state.unlocks.alchemy && state.gold >= 230) act(state, 'unlock', { kind: 'alchemy' });
    if (state.unlocks.innAvailable && !state.unlocks.inn) act(state, 'unlock', { kind: 'inn' });
    if (state.player.bag.gear >= getCapacity(state)) carrying = true;
    if (state.player.bag.gear === 0) carrying = false;
    step(state, 0.1, { target: getPendingActionTarget(state) ?? getStationApproach(state, carrying ? 'counter' : 'forge') });
  }
  assert.equal(state.raid.wins, 1);
  assert.equal(state.milestone, true);
  assert.equal(state.status, 'playing');
  assert.ok(state.sales >= 8);
  assert.ok(state.patrons.length >= 8);
  assert.ok(state.gold >= 3000);
});

test('walking through a station never transfers stock; standing dwells then transfers one object per interval', () => {
  const state = createGame(101);
  const forge = getStationApproach(state, 'forge');
  Object.assign(state.player, { x: forge.x - .6, z: forge.z });
  run(state, 0.4, { x: 1 });
  assert.equal(state.player.bag.gear, 0);
  assert.equal(state.player.moving, true);
  assert.equal(state.player.dwell, 0);
  Object.assign(state.player, forge);
  run(state, 0.3);
  assert.equal(state.player.bag.gear, 0);
  assert.equal(state.player.workKind, 'collect');
  run(state, 0.11);
  assert.equal(state.player.bag.gear, 1);
  run(state, 0.1);
  assert.equal(state.player.bag.gear, 1);
  run(state, 0.2);
  assert.equal(state.player.bag.gear, 2);
  const counter = getStationApproach(state, 'counter');
  Object.assign(state.player, { x: counter.x - .6, z: counter.z });
  run(state, 0.4, { x: 1 });
  assert.equal(state.player.bag.gear, 2);
  assert.equal(state.stocks.gear, 0);
  Object.assign(state.player, counter);
  run(state, 0.3);
  assert.equal(state.stocks.gear, 0);
  run(state, 0.11);
  assert.equal(state.stocks.gear, 1);
  const transfer = state.effects.find((effect) => effect.type === 'deposit');
  assert.equal(transfer.actorId, 'player');
  assert.equal(transfer.product, 'gear');
  assert.equal(transfer.count, 1);
  assert.ok(Number.isFinite(transfer.from.x) && Number.isFinite(transfer.to.z));
});

test('sale proceeds remain in a physical pile across saving and are collected exactly once by proximity', () => {
  const state = createGame(102);
  state.stocks.gear = 1;
  run(state, 16);
  const amount = getSalePrice(state);
  assert.equal(state.sales, 1);
  assert.equal(state.gold, BALANCE.web.startingCoins);
  assert.equal(state.moneyPiles.gear, amount);
  const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false);
  assert.equal(loaded.moneyPiles.gear, amount);
  const pile = getMoneyPiles(loaded).find((entry) => entry.kind === 'gear');
  Object.assign(loaded.player, { x: pile.x - 1.2, z: pile.z });
  run(loaded, 0.3, { x: 1 });
  assert.equal(loaded.gold, BALANCE.web.startingCoins, 'passing through cannot collect while moving');
  Object.assign(loaded.player, { x: pile.x, z: pile.z });
  step(loaded, .05);
  assert.equal(loaded.gold, BALANCE.web.startingCoins + amount);
  assert.equal(loaded.moneyPiles.gear, 0);
  run(loaded, 0.2);
  assert.equal(loaded.gold, BALANCE.web.startingCoins + amount);
  assert.equal(loaded.events.filter((event) => event.type === 'cash-collect').length, 1);
});

test('facility upgrades use the original next-row costs and first-form production/stack values', () => {
  const state = createGame(103);
  state.gold = 20000;
  assert.equal(getFacilityUpgradeInfo(state, 'forge').cost, BALANCE.facilities.forge.costs[1]);
  let before = state.gold;
  assert.equal(act(state, 'upgrade-facility', { kind: 'forge' }).ok, true);
  assert.equal(state.gold, before - 120);
  assert.deepEqual(getFacilityStats(state, 'forge'), { seconds: 2, capacity: 10, bonusPercent: 0 });
  before = state.gold;
  assert.equal(act(state, 'upgrade-facility', { kind: 'forge' }).ok, true);
  assert.equal(state.gold, before - 1990);
  assert.equal(getFacilityStats(state, 'forge').seconds, 1);
  assert.equal(getFacilityStats(state, 'forge').capacity, 14);
  assert.equal(getFacilityUpgradeInfo(state, 'forge').canBuy, false);
  assert.equal(act(state, 'upgrade-facility', { kind: 'forge' }).ok, false);
  assert.equal(act(state, 'upgrade-facility', { kind: 'alchemy' }).ok, false);
  act(state, 'upgrade-facility', { kind: 'counter' });
  assert.equal(getFacilityStats(state, 'counter').seconds, 1.5);
  state.stocks.forge = 0;
  run(state, 2.05);
  assert.equal(state.stocks.forge, 2);
  run(state, 20);
  assert.equal(state.stocks.forge, 14);
});

test('the original inn delay and percent ability change eating time and meal pile revenue', () => {
  const state = createGame(104);
  state.gold = 20000; state.sales = 16; state.unlocks.inn = true;
  act(state, 'upgrade-facility', { kind: 'inn' });
  act(state, 'upgrade-facility', { kind: 'inn' });
  assert.equal(getFacilityStats(state, 'inn').seconds, 3.7);
  assert.equal(getFacilityStats(state, 'inn').bonusPercent, 5);
  state.patrons.push(patron('guest'));
  setSeatState(state, 0, 0, 'eating', { customerId: 'guest' });
  state.customers.push({ id: 'guest', x: -1.25, z: -.75, tableId: 0, kind: 'warrior', product: 'gear', phase: 'eating', purchased: true, patronId: 'guest', timer: 0, patience: 0 });
  const before = state.gold;
  run(state, 3.8);
  assert.equal(state.lodgings, 1);
  assert.equal(state.dining.tables[0].cash, 252);
  assert.equal(state.gold, before);
});

test('shared worker training preserves all ten original costs and applies exact source speed/capacity curves', () => {
  const state = createGame(105);
  state.gold = 20000;
  act(state, 'hire'); act(state, 'hire');
  for (const kind of ['speed', 'capacity']) for (let index = 0; index < 10; index++) {
    const info = getWorkerUpgradeInfo(state, kind);
    assert.equal(info.cost, BALANCE.worker[`${kind}Costs`][index]);
    assert.equal(info.costType, BALANCE.worker[`${kind}CostTypes`][index]);
    const before = state.gold;
    assert.equal(act(state, 'upgrade-worker', { kind }).ok, true);
    assert.equal(state.gold, before - info.cost);
  }
  for (const helper of state.staff) {
    const source = BALANCE.staffs.find((row) => row.id === helper.sourceId);
    assert.equal(helper.speed, source.speed * BALANCE.worker.speeds[10] / BALANCE.worker.speeds[0]);
    assert.equal(helper.capacity, source.capacity + BALANCE.worker.capacities[10] - BALANCE.worker.capacities[0]);
  }
  assert.equal(getWorkerUpgradeInfo(state, 'speed').canBuy, false);
  assert.equal(act(state, 'upgrade-worker', { kind: 'capacity' }).ok, false);
});

test('expanded v1 saves preserve piles and upgraded inventory while old v1 saves receive compatible defaults', () => {
  const state = createGame(106);
  const legacy = JSON.parse(serialize(state));
  delete legacy.moneyPiles; delete legacy.facilityLevels; delete legacy.workerLevels;
  const migrated = restore(legacy);
  assert.equal(migrated.saveReset, false);
  assert.deepEqual(migrated.moneyPiles, { gear: 0, potion: 0, inn: 0 });
  assert.deepEqual(migrated.workerLevels, { speed: 1, capacity: 1 });
  assert.equal(migrated.facilityLevels.forge, 1);
  state.gold = 20000;
  act(state, 'hire');
  act(state, 'upgrade-facility', { kind: 'forge' }); act(state, 'upgrade-facility', { kind: 'forge' });
  act(state, 'upgrade-worker', { kind: 'capacity' }); act(state, 'upgrade-worker', { kind: 'capacity' });
  state.stocks.forge = 14;
  state.staff[0].bag.gear = state.staff[0].capacity;
  state.moneyPiles = { gear: 17, potion: 29, inn: 51 };
  const saved = JSON.parse(serialize(state));
  const loaded = restore(saved);
  assert.equal(loaded.saveReset, false);
  assert.deepEqual(loaded.moneyPiles, state.moneyPiles);
  assert.equal(loaded.stocks.forge, 14);
  assert.equal(loaded.staff[0].bag.gear, state.staff[0].capacity);
  assert.deepEqual(loaded.workerLevels, state.workerLevels);
  saved.moneyPiles.gear = -1;
  assert.equal(restore(saved).saveReset, true);
});

test('same-side combat separation deterministically resolves coincident crowds without leaving bounds', () => {
  const crowd = Array.from({ length: 12 }, (_, index) => ({ id: `crowd-${index}`, hp: 1, radius: COMBAT_RADIUS, x: index < 6 ? 0 : BOUNDS.maxX, z: index < 6 ? 0 : BOUNDS.maxZ }));
  const copy = structuredClone(crowd);
  for (let index = 0; index < 80; index++) { separateCombatants(crowd); separateCombatants(copy); }
  assert.deepEqual(crowd, copy);
  for (const actor of crowd) {
    assert.ok(Number.isFinite(actor.x) && Number.isFinite(actor.z));
    assert.ok(actor.x >= BATTLE_BOUNDS.minX + actor.radius && actor.x <= BATTLE_BOUNDS.maxX - actor.radius);
    assert.ok(actor.z >= BATTLE_BOUNDS.minZ + actor.radius && actor.z <= BATTLE_BOUNDS.maxZ - actor.radius);
  }
  for (let left = 0; left < crowd.length; left++) for (let right = left + 1; right < crowd.length; right++) {
    assert.ok(Math.hypot(crowd[left].x - crowd[right].x, crowd[left].z - crowd[right].z) >= 0.919);
  }
  const defaultRadiusPair = [{ id: 'left', hp: 1, x: 0, z: 0 }, { id: 'right', hp: 1, x: 0, z: 0 }];
  separateCombatants(defaultRadiusPair);
  assert.ok(Math.hypot(defaultRadiusPair[0].x - defaultRadiusPair[1].x, defaultRadiusPair[0].z - defaultRadiusPair[1].z) >= 0.919);
});

test('ranged defenders retreat from melee pressure and attacks expose projectile endpoints', () => {
  const state = createGame(107);
  state.raid.phase = 'battle'; state.raid.spawnRemaining = 0;
  state.raid.defenders = [{ id: 'ranged', kind: 'archer', x: 0, z: 0, hp: 60, maxHp: 60, damage: 12, range: 3.5, speed: 1.6, interval: 0.85, attackClock: 0 }];
  state.raid.enemies = [{ id: 'close', x: 0, z: 0.5, hp: 1000, damage: 0, speed: 0, range: 0.85, interval: 1, attackClock: 1 }];
  step(state, 0.1);
  assert.ok(state.raid.defenders[0].z < 0);
  assert.equal(state.effects.find((effect) => effect.type === 'arrow'), undefined, 'retreating cannot also fire');
  assert.equal(state.raid.enemies[0].hp, 1000);
  let arrow;
  for (let frame = 0; frame < 30 && !arrow; frame++) {
    step(state, 0.05);
    arrow = state.effects.find((effect) => effect.type === 'arrow');
  }
  assert.ok(arrow, 'the defender fires after reaching a safe distance');
  assert.equal(arrow.actorId, 'ranged');
  assert.ok(Number.isFinite(arrow.from.z) && Number.isFinite(arrow.to.x));
  assert.deepEqual(arrow.from, { x: state.raid.defenders[0].x, z: state.raid.defenders[0].z });
  assert.deepEqual(arrow.to, { x: state.raid.enemies[0].x, z: state.raid.enemies[0].z });
  assert.ok(Math.hypot(arrow.from.x - arrow.to.x, arrow.from.z - arrow.to.z) > 1.5);
  assert.equal(state.raid.enemies[0].hp, 988);
});

test('production, customer entry and money positions follow all ten regional layouts', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = createGame(stage);
    state.stage = stage; state.raid.wins = stage - 1;
    const stations = getStations(state);
    Object.assign(state.player, getStationApproach(state, 'forge'));
    run(state, 1.1);
    assert.equal(state.player.bag.gear, 2, `forge stage ${stage}`);
    assert.ok(Math.abs(state.customers[0].x - stations.gate.x) < 0.8);
    const cash = getMoneyPiles(state)[0];
    assert.equal(cash.x, stations.counter.x - Math.sign(stations.counter.x) * 1.95);
    assert.ok(Math.abs(cash.x) < Math.abs(stations.counter.x), `central cash access stage ${stage}`);
  }
});

test('a regional victory keeps the outdoor result before continuing into the next shop with stock and cash intact', () => {
  const state = createGame(108);
  act(state, 'hire');
  state.staff[0].bag.gear = 1;
  state.player.bag.gear = 1;
  state.moneyPiles.gear = 71;
  state.raid.phase = 'warning'; state.raid.timer = .01;
  enterBattle(state);
  const outside = { x: state.player.x, z: state.player.z };
  const helperPosition = { x: state.staff[0].x, z: state.staff[0].z };
  state.raid.spawnRemaining = 0; state.raid.enemies = [];
  step(state, .05);
  const stations = getStations(state);
  assert.equal(state.stage, 2);
  assert.equal(state.raid.phase, 'victory');
  assert.equal(state.raid.location, 'outside');
  assert.deepEqual({ x: state.player.x, z: state.player.z }, outside);
  assert.deepEqual({ x: state.staff[0].x, z: state.staff[0].z }, helperPosition);
  assert.equal(act(state, 'continue').ok, true);
  assert.equal(state.raid.location, 'shop');
  assert.deepEqual({ x: state.player.x, z: state.player.z }, getRegion(state).spawn);
  assert.equal(state.player.bag.gear, 1);
  assert.equal(state.staff[0].bag.gear, 1);
  assert.ok(Math.hypot(state.staff[0].x - stations.forge.x, state.staff[0].z - stations.forge.z) <= 1.12);
  const playerWorkPoint = getStationApproach(state, 'forge');
  assert.ok(Math.hypot(state.staff[0].x - playerWorkPoint.x, state.staff[0].z - playerWorkPoint.z) < .1);
  assert.equal(state.moneyPiles.gear, 71);
  assert.equal(state.customers.length, 0);
});
