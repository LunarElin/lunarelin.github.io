import { act } from './interaction-fixtures.mjs';
import { expandDining, setSeatState } from './dining-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS, CLASS_STATS, createGame, getRegion, restore, serialize, step } from '../rules.mjs';
import { BATTLE_BOUNDS, getBattleLayout } from '../battlefield.mjs';

// Controlled transition/combat fixtures; no claim that this roster was earned.
function shop(count = 8, equipmentLevel = 1, loyalty = 1) {
  const state = createGame(42);
  state.sales = Math.max(16, count); state.unlocks.inn = true;
  expandDining(state); // Explicit fully expanded fixture.

  state.patrons = Array.from({ length: count }, (_, index) => ({
    id: `buyer-${index}`, kind: 'warrior', purchases: 1, totalSpent: 50, loyalty,
    hp: CLASS_STATS.warrior.hp, maxHp: CLASS_STATS.warrior.hp, equipmentLevel,
  }));
  state.raid.timer = 0;
  return state;
}
function advance(state, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) step(state, .05, input);
}
function until(state, predicate, seconds = 15) {
  for (let frame = 0; frame < seconds * 20 && !predicate(); frame++) step(state, .05);
  assert.ok(predicate(), 'the phase must progress within its time bound');
}
function depart(state) {
  state.raid.phase = 'warning'; state.raid.timer = .01;
  step(state, .05);
  assert.equal(state.raid.phase, 'departure');
  return state;
}
function battle(state = shop()) {
  depart(state);
  until(state, () => state.raid.phase === 'battle', 2.3);
  assert.equal(state.raid.location, 'outside');
  return state;
}
function business(state) {
  return structuredClone({
    stocks: state.stocks, gold: state.gold, sales: state.sales, lodgings: state.lodgings,
    economy: state.economy, moneyPiles: state.moneyPiles, dining: state.dining,
    timers: state.timers, bag: state.player.bag,
    staff: state.staff.map(({ x, z, bag, timer }) => ({ x, z, bag, timer })),
    patrons: state.patrons,
  });
}

test('ten warning seconds precede a damage-free 2.2-second departure with outdoor units prepared under the transition', () => {
  const state = shop();
  step(state, .05);
  assert.equal(state.raid.phase, 'warning'); assert.equal(state.raid.timer, 10);
  advance(state, 9.9);
  assert.equal(state.raid.phase, 'warning'); assert.equal(state.raid.defenders.length, 0);
  act(state, 'hire');
  Object.assign(state.staff[0], { bag: { gear: 1, potion: 0, food: 0 }, phase: 'haul' });
  state.player.bag = { gear: 1, potion: 0, food: 1 };
  until(state, () => state.raid.phase === 'departure', .2);
  const before = business(state), shopHp = state.shopHp, start = state.time;
  const shopPosition = { x: state.player.x, z: state.player.z };
  assert.equal(state.raid.location, 'shop');
  let sawPrepared = false, preparedUnits;
  while (state.raid.phase === 'departure' && state.time - start < 2.3) {
    step(state, .05, { x: 1, z: 1, target: { x: 8, z: 8 } });
    assert.deepEqual(business(state), before, 'departure does not produce, sell, heal, move workers or transfer cargo');
    assert.equal(state.shopHp, shopHp);
    assert.ok(!state.effects.some(({ type }) => ['hit', 'damage', 'arrow', 'magic'].includes(type)));
    if (state.raid.location === 'shop') {
      assert.deepEqual({ x: state.player.x, z: state.player.z }, shopPosition, 'input cannot move the shopkeeper during departure');
      assert.equal(state.raid.defenders.length, 0);
    } else {
      sawPrepared = true;
      assert.ok(state.time - start >= 1.05 && state.time - start <= 2.25);
      assert.deepEqual({ x: state.player.x, z: state.player.z }, getBattleLayout(state).player);
      const units = structuredClone([...state.raid.defenders, ...state.raid.enemies]);
      assert.ok(units.length > state.patrons.length);
      assert.ok(units.every((actor) => actor.hp === actor.maxHp && actor.attackSerial === 0));
      assert.ok(units.every((actor) => actor.x >= BATTLE_BOUNDS.minX + actor.radius && actor.x <= BATTLE_BOUNDS.maxX - actor.radius
        && actor.z >= BATTLE_BOUNDS.minZ + actor.radius && actor.z <= BATTLE_BOUNDS.maxZ - actor.radius));
      if (!preparedUnits) preparedUnits = units;
      else assert.deepEqual(units, preparedUnits, 'pre-positioned units cannot move or attack before the battle');
    }
  }
  assert.equal(state.raid.phase, 'battle'); assert.ok(sawPrepared);
  assert.ok(state.time - start >= 2.19 && state.time - start <= 2.26);
  assert.equal(state.raid.timer, 0, 'battle time excludes warning and departure');
});

test('departure cancels meal claims immediately and preserves source-derived equipment and health values', () => {
  const state = shop(8, 7, 2);
  state.patrons[0].hp = 20;
  setSeatState(state, 0, 0, 'eating', { customerId: 'buyer-0' });
  setSeatState(state, 1, 0, 'reserved', { customerId: 'buyer-1' });
  state.customers = [0, 1].map((index) => ({ id: `buyer-${index}`, x: -2, z: -2, kind: 'warrior', product: 'gear',
    phase: index ? 'to-table' : 'eating', hp: 90, purchased: true, patronId: `buyer-${index}`, tableId: index, meal: Boolean(index), timer: 0, patience: 0 }));
  const meals = state.lodgings, cash = state.moneyPiles.inn;
  depart(state);
  assert.equal(state.dining.tables[0].status, 'dirty');
  assert.equal(state.dining.tables[1].status, 'clean');
  assert.ok(state.customers.every((guest) => !guest.meal && guest.tableId === null));
  assert.equal(state.lodgings, meals); assert.equal(state.moneyPiles.inn, cash);
  until(state, () => state.raid.phase === 'battle', 2.3);
  const defender = state.raid.defenders.find((actor) => actor.patronId === 'buyer-0');
  assert.equal(defender.damage, CLASS_STATS.warrior.damage * (1 + 6 * .1 + .08));
  assert.equal(defender.maxHp, CLASS_STATS.warrior.hp * (1 + 6 * .03));
  assert.equal(defender.hp, defender.maxHp * .65);
  const grunt = state.raid.enemies.find((actor) => actor.role === 'grunt');
  assert.equal(grunt.maxHp, 120); assert.equal(grunt.damage, 10);
  assert.ok(state.customers.every((guest) => guest.phase === 'leaving'));
});

test('real defender hits increment one attack serial, timestamp and target direction per cooldown', () => {
  const state = battle(), defender = state.raid.defenders[0], enemy = state.raid.enemies[0];
  state.raid.defenders = [defender]; state.raid.enemies = [enemy]; state.raid.spawnRemaining = 0;
  Object.assign(defender, { x: -.2, z: 0, attackClock: 0 });
  Object.assign(enemy, { x: .55, z: .2, attackClock: 100 });
  const hp = enemy.hp;
  step(state, .05);
  assert.equal(enemy.hp, hp - defender.damage);
  assert.equal(defender.attackSerial, 1); assert.equal(defender.attackAt, state.time);
  assert.deepEqual({ x: defender.targetX, z: defender.targetZ }, { x: enemy.x, z: enemy.z });
  const firstAttack = defender.attackAt;
  advance(state, .3);
  assert.equal(defender.attackSerial, 1); assert.equal(defender.attackAt, firstAttack);
  assert.equal(enemy.hp, hp - defender.damage, 'a retained attack pose cannot apply damage again');
  until(state, () => defender.attackSerial === 2, 1);
  assert.equal(enemy.hp, hp - 2 * defender.damage);
  assert.ok(defender.attackAt - firstAttack >= defender.interval - .05);
});

test('an enemy strikes the outdoor shop target with exact damage and meaningful attack endpoints', () => {
  const state = battle(), enemy = state.raid.enemies.find((actor) => actor.role === 'grunt');
  state.raid.defenders = []; state.raid.enemies = [enemy]; state.raid.spawnRemaining = 0;
  const target = getBattleLayout(state).shop;
  Object.assign(enemy, { x: target.x + .3, z: target.z + .5, attackClock: 0 });
  const hp = state.shopHp;
  step(state, .05);
  assert.equal(enemy.attackSerial, 1); assert.equal(enemy.attackAt, state.time);
  assert.deepEqual({ x: enemy.targetX, z: enemy.targetZ }, target);
  assert.equal(state.shopHp, hp - enemy.damage * 1.5);
  assert.equal(state.raid.damageToShop, enemy.damage * 1.5);
  const hit = state.effects.find((effect) => effect.actorId === enemy.id && effect.type === 'damage');
  assert.ok(hit); assert.deepEqual(hit.to, target); assert.equal(hit.amount, enemy.damage * 1.5);
  advance(state, .3);
  assert.equal(enemy.attackSerial, 1); assert.equal(state.shopHp, hp - enemy.damage * 1.5);
});

test('retreating ranged actors expose their target but cannot emit an attack serial or damage', () => {
  const state = battle(), enemy = state.raid.enemies[0];
  const archer = { ...state.raid.defenders[0], kind: 'archer', ...CLASS_STATS.archer, maxHp: CLASS_STATS.archer.hp,
    x: 0, z: 0, attackClock: 0, attackSerial: 0 };
  state.raid.defenders = [archer]; state.raid.enemies = [enemy]; state.raid.spawnRemaining = 0;
  Object.assign(enemy, { role: 'ranged', x: 0, z: 1, speed: .95, range: 3.75, attackClock: 0 });
  const hp = enemy.hp, archerHp = archer.hp;
  step(state, .05);
  assert.ok(archer.z < 0); assert.equal(archer.attackSerial, 0); assert.equal(archer.attackAt, undefined);
  assert.deepEqual({ x: archer.targetX, z: archer.targetZ }, { x: 0, z: 1 });
  assert.equal(enemy.hp, hp); assert.ok(!state.effects.some((effect) => effect.actorId === archer.id && effect.type === 'arrow'));
  assert.ok(enemy.z > 1); assert.equal(enemy.attackSerial, 0); assert.equal(enemy.attackAt, undefined);
  assert.equal(archer.hp, archerHp, 'enemy archers also cannot shoot while stepping back');
});

test('departure and battle saves retain the shop return position, carried food and safe preparation reload', () => {
  const state = shop();
  Object.assign(state.player, { x: 7.3, z: -6.4, bag: { gear: 1, potion: 0, food: 1 } });
  act(state, 'hire'); state.staff[0].bag.gear = 1;
  const returnPosition = { x: state.player.x, z: state.player.z }, bags = structuredClone([state.player.bag, state.staff[0].bag]);
  depart(state);
  for (const targetPhase of ['departure', 'prepared', 'battle']) {
    if (targetPhase === 'prepared') until(state, () => state.raid.location === 'outside', 1.2);
    if (targetPhase === 'battle') until(state, () => state.raid.phase === 'battle', 1.2);
    const saved = JSON.parse(serialize(state));
    assert.deepEqual({ x: saved.player.x, z: saved.player.z }, returnPosition);
    const loaded = restore(saved);
    assert.equal(loaded.saveReset, false); assert.equal(loaded.raid.location, 'shop'); assert.equal(loaded.raid.phase, 'idle');
    assert.equal(loaded.raid.timer, 45);
    assert.deepEqual({ x: loaded.player.x, z: loaded.player.z }, returnPosition);
    assert.deepEqual([loaded.player.bag, loaded.staff[0].bag], bags);
    assert.equal(loaded.raid.enemies.length, 0); assert.equal(loaded.raid.defenders.length, 0);
  }
  state.status = 'paused'; const paused = serialize(state), time = state.time;
  step(state, 1); assert.equal(serialize(state), paused); assert.equal(state.time, time);
});

test('winning holds the outdoor result until continue or the seven-second return and preserves inventory', () => {
  for (const manual of [true, false]) {
    const state = shop(); state.player.bag.gear = 1; state.moneyPiles.gear = 71;
    battle(state);
    const outside = { x: state.player.x, z: state.player.z };
    state.raid.enemies = []; state.raid.spawnRemaining = 0;
    step(state, .05);
    assert.equal(state.stage, 2); assert.equal(state.raid.wins, 1);
    assert.equal(state.raid.phase, 'victory'); assert.equal(state.raid.location, 'outside');
    assert.deepEqual({ x: state.player.x, z: state.player.z }, outside);
    assert.equal(state.player.bag.gear, 1); assert.equal(state.moneyPiles.gear, 71);
    advance(state, .5);
    assert.equal(state.raid.location, 'outside');
    if (manual) assert.equal(act(state, 'continue').ok, true);
    else { advance(state, 6.3); assert.equal(state.raid.location, 'outside'); until(state, () => state.raid.location === 'shop', .4); }
    assert.equal(state.raid.phase, 'idle');
    assert.deepEqual({ x: state.player.x, z: state.player.z }, getRegion(state).spawn);
    assert.equal(state.player.bag.gear, 1); assert.equal(state.moneyPiles.gear, 71);
  }
});

test('natural defeat remains outdoors until free repair restores the original shop position', () => {
  const state = shop(3), original = { x: state.player.x, z: state.player.z };
  state.player.bag.food = 1;
  battle(state);
  until(state, () => state.status === 'defeat', 90);
  assert.equal(state.raid.location, 'outside'); assert.equal(state.raid.summary.won, false);
  assert.equal(state.shopHp, 0); assert.equal(state.raid.summary.shopDamage, state.shopMaxHp);
  const time = state.time, gold = state.gold;
  step(state, 1); assert.equal(state.time, time);
  assert.equal(act(state, 'repair').ok, true);
  assert.equal(state.gold, gold); assert.equal(state.raid.location, 'shop'); assert.equal(state.raid.phase, 'recovery');
  assert.deepEqual({ x: state.player.x, z: state.player.z }, original);
  assert.equal(state.player.bag.food, 1); assert.equal(state.shopHp, state.shopMaxHp);
  assert.ok(state.player.x >= BOUNDS.minX && state.player.x <= BOUNDS.maxX);
  assert.ok(state.player.z >= BOUNDS.minZ && state.player.z <= BOUNDS.maxZ);
});
