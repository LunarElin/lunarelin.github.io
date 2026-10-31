import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, getActionZone, getActionZones, getMoneyPiles, getStationApproach, getWorkZone, step } from '../rules.mjs';
import { projectShopTarget, getShopObstacles, SHOP_RADIUS } from '../shop-navigation.mjs';
import { expandDining, setSeatState } from './dining-fixtures.mjs';

function quiet() {
  const state = createGame(42); state.gold = 1e6;
  state.raid.timer = state.raid.triggerSales = state.timers.customer = 1e6;
  return state;
}
function run(state, seconds, input = {}) { for (let n = 0; n < Math.round(seconds * 20); n++) step(state, .05, input); }
function stand(state, zone) { Object.assign(state.player, { x: zone.x, z: zone.z, moving: false, target: null }); }

test('every enabled floor circle has a reachable unobstructed center in all ten expanded regions', () => {
  let checked = 0;
  for (let stage = 1; stage <= 10; stage++) {
    const state = quiet(); state.stage = stage; state.unlocks.alchemy = state.unlocks.inn = true; expandDining(state);
    for (const zone of getActionZones(state).filter(zone => zone.enabled)) {
      assert.deepEqual(projectShopTarget(state, zone), { x: zone.x, z: zone.z }, `${stage}:${zone.id}`);
      assert.ok(zone.radius >= .48 && zone.radius <= .55);
      checked++;
    }
    for (const key of ['forge', 'counter', 'alchemy', 'potionCounter', 'kitchen', 'meal']) {
      const zone = getWorkZone(state, key);
      assert.deepEqual(getStationApproach(state, key), { x: zone.x, z: zone.z });
    }
  }
  assert.equal(checked, 200);
});

test('a facility side within the old broad radius cannot transfer; only its visible work circle dwells and transfers', () => {
  const state = quiet(), zone = getWorkZone(state, 'forge');
  stand(state, { x: zone.x + .65, z: zone.z });
  run(state, 1); assert.equal(state.player.bag.gear, 0);
  stand(state, zone); run(state, .3); assert.equal(state.player.bag.gear, 0);
  run(state, .15); assert.equal(state.player.bag.gear, 1);
  run(state, .25); assert.equal(state.player.bag.gear, 2);
});

test('passing through cash cannot collect and standing just outside its ring cannot collect', () => {
  const state = quiet(); state.moneyPiles.gear = 100;
  const pile = getMoneyPiles(state).find(pile => pile.id === 'gear'), original = state.gold;
  stand(state, { x: pile.x - .4, z: pile.z }); run(state, .1, { x: 1 });
  assert.equal(state.gold, original); assert.equal(state.moneyPiles.gear, 100);
  stand(state, { x: pile.x + pile.radius + .01, z: pile.z }); run(state, .5);
  assert.equal(state.gold, original);
  stand(state, pile); step(state, .05);
  assert.equal(state.gold, original + 100); assert.equal(state.moneyPiles.gear, 0);
  run(state, .5); assert.equal(state.gold, original + 100);
});

test('player, worker, facility upgrades and hiring require their own standing circles before money changes', () => {
  for (const [action, payload] of [['upgrade', { kind: 'capacity' }], ['upgrade-worker', { kind: 'speed' }], ['upgrade-facility', { kind: 'forge' }], ['hire', {}]]) {
    const state = quiet(), gold = state.gold, zone = getActionZone(state, action, payload);
    const denied = act(state, action, payload);
    assert.equal(denied.ok, false); assert.equal(denied.requiresZone.id, zone.id); assert.equal(state.gold, gold);
    stand(state, zone); state.player.moving = true;
    assert.equal(act(state, action, payload).ok, false); assert.equal(state.gold, gold);
    state.player.moving = false;
    assert.equal(act(state, action, payload).ok, true, action);
  }
});

test('either counter has its own upgrade circle while both retain the same purchased counter level', () => {
  const state = quiet(); state.unlocks.alchemy = true;
  const zones = getActionZones(state), gear = zones.find(zone => zone.id === 'upgrade:counter'), potion = zones.find(zone => zone.id === 'upgrade:potionCounter');
  assert.ok(gear.enabled && potion.enabled); assert.deepEqual(potion.payload, { kind: 'counter' });
  stand(state, potion);
  assert.equal(getActionZone(state, 'upgrade-facility', { kind: 'counter' }).id, potion.id);
  assert.equal(act(state, 'upgrade-facility', { kind: 'counter' }).ok, true);
  assert.equal(state.facilityLevels.counter, 2);
  stand(state, gear);
  assert.equal(getActionZone(state, 'upgrade-facility', { kind: 'counter' }).id, gear.id);
  assert.equal(act(state, 'upgrade-facility', { kind: 'counter' }).ok, true);
  assert.equal(state.facilityLevels.counter, 3);
  const locked = quiet();
  assert.equal(getActionZones(locked).find(zone => zone.id === potion.id).enabled, false);
  stand(locked, potion);
  const gold = locked.gold;
  assert.equal(act(locked, 'upgrade-facility', { kind: 'counter' }).ok, false);
  assert.equal(locked.gold, gold);
});

test('facility construction and sequential table expansion need the actual plot circle', () => {
  const state = quiet(); state.sales = 16;
  const zone = getActionZone(state, 'unlock', { kind: 'inn' });
  assert.equal(act(state, 'unlock', { kind: 'inn' }).ok, false);
  stand(state, zone); assert.equal(act(state, 'unlock', { kind: 'inn' }).ok, true);
  const plot = getActionZone(state, 'unlock-table');
  assert.equal(act(state, 'unlock-table').ok, false);
  stand(state, plot); assert.equal(act(state, 'unlock-table').ok, true);
  assert.equal(state.dining.tableCount, 2);
  assert.deepEqual(projectShopTarget(state, state.player), { x: state.player.x, z: state.player.z }, 'the purchased furniture never appears around the standing owner');
  assert.equal(act(state, 'unlock-table').ok, false, 'the next plot is a different circle');
});

test('table cleaning only advances inside the matching seat circle', () => {
  const state = quiet(); state.unlocks.inn = true;
  setSeatState(state, 0, 0, 'dirty');
  const zone = getActionZones(state).find(zone => zone.id === 'clean:table-0-seat-0');
  stand(state, { x: zone.x + zone.radius + .01, z: zone.z }); run(state, 1.5);
  assert.equal(state.dining.cleaned, 0);
  stand(state, zone); run(state, 1.2); assert.equal(state.dining.cleaned, 1);
});

test('furniture bodies and the actor radius stop continuous joystick motion before crossing a counter', () => {
  const state = quiet();
  const counter = getShopObstacles(state).find(body => body.id === 'counter');
  stand(state, { x: (counter.minX + counter.maxX) / 2, z: counter.minZ - SHOP_RADIUS - 1 });
  run(state, 2, { z: 1 });
  assert.ok(state.player.z <= counter.minZ - SHOP_RADIUS + 1e-6);
  assert.equal(state.player.bag.gear, 0);
});
