import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldState, advanceFieldEvents, clearFieldCombat } from '../field-events.mjs';

function fixture() {
  const state = { rng: 9017, phase: 'playing', inCamp: false, progress: { unlockedDeep: false },
    player: { x: 0, z: 0, hp: 100, maxHp: 100, level: 1, radius: .4 },
    enemies: [{ hp: 100, x: 3, z: 0 }], events: [], fieldEvents: createFieldState(), hurts: 0, opened: 0 };
  const context = {
    world: { minX: -15, maxX: 15, minZ: -42, maxZ: 23, gateZ: -14, camp: { x: 0, z: 16, radius: 4.6 } },
    zones: [{ id: 'field', x: 0, z: 0, radius: 6, type: 'mushroom' }, { id: 'locked', x: 0, z: -25, radius: 5, deep: true }],
    random(current) { current.rng = (Math.imul(current.rng, 1664525) + 1013904223) >>> 0; return current.rng / 4294967296; },
    hurtPlayer(current, damage) { if (!current.inCamp) { current.hurts++; current.player.hp -= damage; } },
    openTreasure(current, item) { current.opened++; return { copies: 1, scrolls: item.scrolls, gold: item.gold, equipmentId: item.equipmentId }; },
  };
  const tick = seconds => { for (let remaining = seconds; remaining > 1e-8; remaining -= .05) advanceFieldEvents(state, Math.min(.05, remaining), context); };
  return { state, context, tick };
}

test('first field treasure appears away from the player and never steers movement', () => {
  const { state, context, tick } = fixture(); tick(9.1);
  assert.equal(state.fieldEvents.items.length, 1);
  const item = state.fieldEvents.items[0]; assert.equal(item.kind, 'chest');
  assert.ok(Math.hypot(item.x, item.z) >= 2.6);
  assert.ok(Math.hypot(item.x, item.z - 16) > context.world.camp.radius + 1.5);
  assert.equal(state.opened, 0); assert.deepEqual([state.player.x, state.player.z], [0, 0]);
  state.player.x = item.x; state.player.z = item.z; tick(.1);
  assert.equal(state.opened, 1); assert.equal(state.fieldEvents.items.length, 0);
  assert.equal(state.events.filter(event => event.type === 'field-chest').length, 1);
  tick(1); assert.equal(state.opened, 1);
});

test('discoveries and hazards are seeded, bounded, and frozen while paused', () => {
  const a = fixture(), b = fixture(); a.tick(70); b.tick(70);
  assert.deepEqual(a.state, b.state);
  assert.ok(a.state.fieldEvents.items.length <= 2); assert.ok(a.state.fieldEvents.hazards.length <= 2);
  a.state.phase = 'paused'; const frozen = structuredClone(a.state); a.tick(5);
  assert.deepEqual(a.state, frozen);
});

test('a collected blessing gives one burst and timed healing without exceeding max life', () => {
  const { state, tick } = fixture(); state.player.hp = 20;
  state.fieldEvents.items.push({ id: 1, kind: 'blessing', x: 0, z: 0, life: 45 }); tick(.05);
  assert.equal(state.player.hp, 35); assert.equal(state.fieldEvents.boon.remaining, 15);
  tick(1); assert.ok(Math.abs(state.player.hp - 36) < 1e-8);
  assert.equal(state.events.filter(event => event.type === 'field-boon').length, 1);
  state.player.hp = 100; tick(1); assert.equal(state.player.hp, 100);
  state.fieldEvents.nextHazard = 100; tick(14); assert.equal(state.fieldEvents.boon, null);
});

test('a hazard warns first, hits once at the same circles, and expires after its burst', () => {
  const { state, tick } = fixture();
  state.fieldEvents.hazards.push({ id: 1, pattern: 'spores', x: 0, z: 0, centers: [{ x: 0, z: 0, radius: 1.45 }], phase: 'warning', time: 1.15, warnTime: 1.15, blastTime: .35, damage: 4, resolved: false });
  tick(1.1); assert.equal(state.hurts, 0); tick(.05);
  assert.equal(state.hurts, 1); assert.equal(state.player.hp, 96);
  tick(.4); assert.equal(state.hurts, 1); assert.equal(state.fieldEvents.hazards.length, 0);
  assert.equal(state.events.filter(event => event.type === 'field-hazard').length, 1);
});

test('moving out of a warning avoids it and camp never creates new encounters', () => {
  const { state, context, tick } = fixture(); state.fieldEvents.nextHazard = 0;
  context.random = () => .1; tick(.05);
  assert.equal(state.fieldEvents.hazards[0].pattern, 'spores');
  state.player.x = 5; tick(1.2); assert.equal(state.hurts, 0);
  state.fieldEvents.hazards = []; state.fieldEvents.nextHazard = 0; context.random = () => .9; tick(.05);
  assert.equal(state.fieldEvents.hazards[0].centers.length, 3);
  state.inCamp = true; state.fieldEvents.items = []; state.fieldEvents.hazards = [];
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 0; tick(10);
  assert.equal(state.fieldEvents.items.length, 0); assert.equal(state.fieldEvents.hazards.length, 0);
});

test('leaving combat clears temporary danger and blessing but preserves uncollected treasure', () => {
  const { state } = fixture();
  state.fieldEvents.items.push({ id: 1, kind: 'chest', x: 2, z: 2, life: 30 });
  state.fieldEvents.boon = { remaining: 4 }; state.fieldEvents.hazards.push({ id: 2 });
  clearFieldCombat(state);
  assert.equal(state.fieldEvents.boon, null); assert.deepEqual(state.fieldEvents.hazards, []);
  assert.equal(state.fieldEvents.items.length, 1); assert.equal(state.player.hp, 100);
});

test('a locked later stage creates neither discoveries nor combat hazards', () => {
  const { state, context, tick } = fixture();
  state.progress.unlockedDeep = true; state.player.z = -60; state.enemies[0].z = -60;
  context.world.minZ = -98; context.zones = [{ id: 'later', stageId: 'sky', x: 0, z: -60, radius: 6, deep: true }];
  context.zoneUnlocked = () => false; context.unlockedMinZ = () => -42;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 0; tick(20);
  assert.deepEqual(state.fieldEvents.items, []); assert.deepEqual(state.fieldEvents.hazards, []);
  assert.equal(state.opened, 0); assert.equal(state.hurts, 0);
});

test('later-stage discoveries respect the unlocked boundary and every local safe camp', () => {
  let discoveries = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const { state, context, tick } = fixture(); state.rng = seed * 7919;
    state.player.z = -67; context.world.minZ = -98;
    context.zones = [{ id: 'later', stageId: 'ancient', x: 0, z: -67, radius: 6 }];
    const camps = [context.world.camp, { x: -3, z: -65, radius: 1.2 }];
    context.zoneUnlocked = () => true; context.unlockedMinZ = () => -70; context.camps = () => camps;
    state.fieldEvents.nextDiscovery = 0; tick(.05);
    for (const item of state.fieldEvents.items) {
      discoveries++;
      assert.ok(item.z >= -69.2);
      assert.ok(camps.every(camp => Math.hypot(item.x - camp.x, item.z - camp.z) >= camp.radius + 1.5));
      assert.ok(Math.hypot(item.x - state.player.x, item.z - state.player.z) >= 2.6);
    }
  }
  assert.ok(discoveries > 10);
});

test('later-stage warnings never overlap a local camp or extend past a locked gate', () => {
  const { state, context, tick } = fixture();
  state.player.z = -48; state.enemies[0].z = -48; context.world.minZ = -98;
  context.zones = [{ id: 'later', stageId: 'ancient', x: 0, z: -48, radius: 6 }];
  const camp = { x: 0, z: -44, radius: 3 };
  context.zoneUnlocked = () => true; context.camps = () => [context.world.camp, camp];
  context.unlockedMinZ = () => -50; context.random = () => .1;
  state.fieldEvents.nextDiscovery = 100; state.fieldEvents.nextHazard = 0; tick(.05);
  assert.equal(state.fieldEvents.hazards.length, 0);
  state.player.z = state.enemies[0].z = -50; state.fieldEvents.nextHazard = 0; tick(.05);
  assert.equal(state.fieldEvents.hazards.length, 1);
  for (const center of state.fieldEvents.hazards[0].centers) {
    assert.ok(center.z - center.radius >= -50 - 1e-9);
    assert.ok(Math.hypot(center.x - camp.x, center.z - camp.z) > camp.radius + center.radius);
  }
});
