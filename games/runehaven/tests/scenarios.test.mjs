import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { act, COMBAT_RADIUS, getRepairInfo, restore, serialize, step } from '../rules.mjs';
import { BATTLE_BOUNDS } from '../battlefield.mjs';
import { buildScenario, SCENARIO_INFO } from './scenarios.mjs';

function assertEarnedProgress(state) {
  assert.equal(state.qaScenario.artificial, false);
  assert.equal(state.seed, 42);
  assert.equal(state.gold + Object.values(state.moneyPiles).reduce((sum, amount) => sum + amount, 0), BALANCE.web.startingCoins + state.economy.earned - state.economy.spent);
  assert.equal(state.patrons.reduce((sum, patron) => sum + patron.purchases, 0), state.sales);
  assert.ok(state.patrons.every((patron) => patron.purchases > 0));
}

test('late scenario reaches an earned late shop with blink, both businesses and all patron classes', () => {
  const state = buildScenario('late');
  assertEarnedProgress(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.raid.phase, 'idle');
  assert.ok(state.raid.wins > 0);
  assert.equal(state.stage, state.raid.wins + 1);
  assert.equal(state.player.speedLevel, BALANCE.magic.teleportAtLevel);
  assert.equal(state.unlocks.alchemy, true);
  assert.equal(state.unlocks.inn, true);
  assert.equal(state.staff.length, BALANCE.web.helperCap);
  assert.ok(Object.values(state.moneyPiles).some((amount) => amount > 0));
  for (const kind of ['warrior', 'archer', 'mage']) assert.ok(state.patrons.some((patron) => patron.kind === kind));
  const before = { x: state.player.x, z: state.player.z };
  assert.equal(act(state, 'blink', { x: 0, z: 0 }).ok, true);
  assert.ok(Math.hypot(state.player.x - before.x, state.player.z - before.z) > 0);
  assert.equal(state.player.blinkCooldown, BALANCE.magic.cooldown);
  const loaded = restore(serialize(state));
  assert.equal(loaded.saveReset, false, 'combat equipment health returns to the canonical patron save scale');
  assert.equal(loaded.stage, state.stage);
  assert.equal(loaded.sales, state.sales);
  assert.deepEqual(loaded.patrons, state.patrons);
});

test('defense scenario pauses a normally triggered first warning with paid defenders ready', () => {
  const state = buildScenario('defense');
  assertEarnedProgress(state);
  assert.equal(state.raid.phase, 'warning');
  assert.equal(state.raid.wins, 0);
  assert.ok(state.raid.timer > 7.8 && state.raid.timer <= 8);
  assert.ok(state.sales >= state.raid.triggerSales);
  assert.ok(state.patrons.length >= 8);
  for (let index = 0; index < 9; index++) step(state, 1);
  assert.equal(state.raid.phase, 'departure');
  for (let frame = 0; frame < 40 && state.raid.phase !== 'battle'; frame++) step(state, .05);
  assert.equal(state.raid.phase, 'battle');
  assert.ok(state.raid.defenders.length >= 8);
  assert.ok(state.raid.defenders.every((defender) => state.patrons.some((patron) => patron.id === defender.patronId && patron.purchases > 0)));
});

test('an earned eighteen-patron first raid preserves visible same-side clearance on every battle frame and wins', () => {
  const state = buildScenario('defense');
  assert.ok(state.patrons.length >= 18);
  let battleFrames = 0;
  for (let frame = 0; frame < 5400 && state.raid.wins === 0 && state.status === 'playing'; frame++) {
    step(state, 1 / 60);
    if (state.raid.phase !== 'battle') continue;
    battleFrames++;
    for (const group of [state.raid.defenders, state.raid.enemies]) {
      const living = group.filter((actor) => actor.hp > 0);
      for (const actor of living) {
        assert.equal(actor.radius, COMBAT_RADIUS);
        assert.ok(actor.x >= BATTLE_BOUNDS.minX + COMBAT_RADIUS && actor.x <= BATTLE_BOUNDS.maxX - COMBAT_RADIUS);
        assert.ok(actor.z >= BATTLE_BOUNDS.minZ + COMBAT_RADIUS && actor.z <= BATTLE_BOUNDS.maxZ - COMBAT_RADIUS);
      }
      for (let left = 0; left < living.length; left++) for (let right = left + 1; right < living.length; right++) {
        assert.ok(Math.hypot(living[left].x - living[right].x, living[left].z - living[right].z) >= 0.9, `frame ${frame}: visible clearance`);
      }
    }
  }
  assert.ok(battleFrames >= 100);
  assert.equal(state.raid.wins, 1);
  assert.equal(state.status, 'playing');
});

test('defeat scenario retains the natural three-patron defeat across reload and permits free recovery', () => {
  const state = buildScenario('defeat');
  assertEarnedProgress(state);
  assert.equal(state.saveReset, false);
  assert.equal(state.status, 'defeat');
  assert.equal(state.raid.phase, 'defeat');
  assert.equal(state.shopHp, 0);
  assert.equal(state.sales, 3);
  assert.equal(state.patrons.length, 3);
  assert.ok(state.raid.wave >= 1);
  assert.equal(state.raid.wins, state.raid.wave - 1);
  assert.equal(getRepairInfo(state).cost, 0);
  const gold = state.gold;
  assert.equal(act(state, 'repair').ok, true);
  assert.equal(state.gold, gold);
  assert.equal(state.shopHp, state.shopMaxHp);
  assert.equal(state.patrons.length, 3);
  for (let index = 0; index < 5; index++) step(state, 1);
  assert.equal(state.raid.phase, 'idle');
  assert.equal(state.status, 'playing');
});

test('every named scenario produces an identical saved state on repeated construction', () => {
  for (const name of Object.keys(SCENARIO_INFO)) {
    assert.equal(serialize(buildScenario(name)), serialize(buildScenario(name)), name);
  }
});

test('queue previews are explicit artificial fixtures with real unpaid shoppers and no invented earnings', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = buildScenario('queues', stage);
    assert.equal(state.qaScenario.artificial, true);
    assert.equal(state.stage, stage);
    assert.equal(state.customers.length, 24);
    assert.ok(state.customers.every((customer) => ['entrance', 'branching', 'entering', 'queue'].includes(customer.phase) && !customer.purchased));
    assert.equal(state.patrons.length, 0);
    assert.equal(state.economy.earned, 0);
    assert.equal(state.gold, BALANCE.web.startingCoins);
  }
});

test('dining previews mark their supplied inventory and reach eating and dirty tables through real simulation', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = buildScenario('dining', stage);
    assert.equal(state.qaScenario.artificial, true);
    assert.equal(state.stage, stage);
    assert.ok(state.dining.tables.some((table) => table.status === 'dirty'));
    assert.ok(state.dining.tables.some((table) => table.status === 'eating'));
    assert.ok(state.customers.some((customer) => customer.phase === 'eating'));
    assert.ok(state.lodgings > 0);
    assert.ok(state.moneyPiles.inn > 0);
    assert.ok(state.customers.filter((customer) => customer.meal).every((customer) => customer.phase === 'to-table'));
  }
});
