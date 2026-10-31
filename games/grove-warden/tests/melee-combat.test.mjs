import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, setPaused, selectWeapon, exportProgress, MONSTER_STATS, WORLD } from '../rules.mjs';
import { getWeaponAttack } from '../equipment.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
function field(weapon = 'sword', saved = {}) {
  const state = createGame(6842, { version: 9, weapon, ...saved });
  state.phase = 'playing'; state.inCamp = false; state.player.x = state.player.z = 0;
  state.enemies = []; state.spawners = []; state.player.attackCd = 0;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  return state;
}
function enemy(state, x, z = 0, extra = {}) {
  const actor = { ...MONSTER_STATS.mushroom, id: state.nextId++, type: 'mushroom', trait: 'normal', zoneId: 'melee-test', stageId: 'meadow',
    x, z, homeX: x, homeZ: z, hp: 100000, maxHp: 100000, radius: .4, speed: 0, damage: 0,
    phase: 'stunned', phaseTime: 999, attackCd: 999, attackNumber: 0, ...extra };
  state.enemies.push(actor); return actor;
}
function tick(state, frames = 1, input = { manual: true }, dt = 1 / 60) {
  const events = [];
  for (let i = 0; i < frames; i++) { stepGame(state, input, dt); events.push(...state.events); }
  return events;
}
const hits = events => events.filter(event => event.type === 'hit' && event.source === 'melee');

test('the sword delivers the most sustained single-target melee damage at equal growth', () => {
  const measured = {};
  for (const weapon of ['sword', 'axe', 'spear']) {
    const state = field(weapon, { upgrades: { attack: 6 } }), target = enemy(state, 1.2);
    const events = tick(state, 600), damage = target.maxHp - target.hp;
    close(events.filter(event => event.type === 'hit').reduce((sum, hit) => sum + hit.damage, 0), damage);
    assert.ok(hits(events).length > 0); assert.ok(events.every(event => !['shoot', 'form-attack', 'skill', 'owl-shoot'].includes(event.type)));
    assert.equal(state.player.form, 'druid'); assert.equal(state.progress.totals.kills, 0);
    assert.equal(state.player.hp, state.player.maxHp); assert.deepEqual([state.player.x, state.player.z], [0, 0]);
    measured[weapon] = damage;
  }
  assert.ok(measured.sword > measured.axe * 1.25, `${JSON.stringify(measured)}: sword must retain a clear focused advantage`);
  assert.ok(measured.sword > measured.spear * 1.25);
});

test('the axe covers a broad forward pack while the sword remains narrow and neither hits enemies behind', () => {
  for (const weapon of ['sword', 'axe']) {
    const state = field(weapon), front = enemy(state, 1.2), upper = enemy(state, .4, 1.5), lower = enemy(state, .4, -1.5);
    const behind = enemy(state, -1.4), outside = enemy(state, 2.2);
    const damage = getWeaponAttack(weapon, state.player).damage, events = tick(state), damaged = hits(events).map(hit => hit.targetId);
    assert.deepEqual(damaged, weapon === 'axe' ? [front.id, upper.id, lower.id] : [front.id]);
    close(front.hp, front.maxHp - damage);
    for (const flank of [upper, lower]) close(flank.hp, flank.maxHp - (weapon === 'axe' ? damage : 0));
    assert.equal(behind.hp, behind.maxHp); assert.equal(outside.hp, outside.maxHp);
    assert.equal(events.filter(event => event.type === 'melee-attack').length, 1); assert.equal(state.projectiles.length, 0);
  }
});

test('the spear pierces several aligned ground enemies but misses lateral, rear, distant, and airborne enemies', () => {
  const state = field('spear'), line = [.8, 1.7, 2.7].map(x => enemy(state, x));
  const lateral = enemy(state, 1.8, 1.2), rear = enemy(state, -1.3), distant = enemy(state, 3.2);
  const air = enemy(state, 1.1, .1, { type: 'flyer', trait: 'airborne' });
  const damage = getWeaponAttack('spear', state.player).damage, events = tick(state);
  assert.deepEqual(hits(events).map(hit => hit.targetId), line.map(actor => actor.id));
  for (const actor of line) close(actor.hp, actor.maxHp - damage);
  for (const actor of [lateral, rear, distant, air]) assert.equal(actor.hp, actor.maxHp);
  const attack = events.find(event => event.type === 'melee-attack');
  assert.equal(attack.weaponId, 'spear'); assert.equal(attack.attackType, 'thrust'); close(attack.aimX, 1); close(attack.aimZ, 0);
  assert.equal(state.projectiles.length, 0); assert.equal(state.pendingStaffShots.length, 0);
});

test('melee attacks need only a ground target in range and continue automatically during movement', () => {
  for (const weapon of ['sword', 'axe', 'spear']) {
    for (const mode of ['outside', 'airborne']) {
      const state = field(weapon), profile = getWeaponAttack(weapon, state.player);
      const target = enemy(state, mode === 'outside' ? profile.range + .1 : 1, 0, mode === 'airborne' ? { type: 'flyer', trait: 'airborne' } : {});
      const events = tick(state, 20);
      assert.equal(hits(events).length, 0); assert.equal(events.some(event => event.type === 'melee-attack'), false);
      assert.equal(target.hp, target.maxHp); assert.deepEqual([state.player.x, state.player.z], [0, 0]);
    }
    const idle = field(weapon), waiting = enemy(idle, 1.2);
    const idleEvents = tick(idle, 1, {});
    assert.equal(hits(idleEvents).length, 1); assert.ok(waiting.hp < waiting.maxHp);
    assert.deepEqual([idle.player.x, idle.player.z], [0, 0]);
    const moving = field(weapon), target = enemy(moving, 1.2);
    const movedEvents = tick(moving, 1, { moveZ: 1 }, .05);
    assert.ok(moving.player.z > 0); assert.equal(moving.player.x, 0); assert.ok(target.hp < target.maxHp);
    assert.equal(hits(movedEvents).length, 1);
  }
});

test('one melee swing snapshots damage before a first kill changes the player level and attack stat', () => {
  const state = field('axe'), first = enemy(state, 1.1, 0, { hp: 1, maxHp: 1, xp: 1000 });
  const survivors = [enemy(state, 1.4, .8), enemy(state, 1.4, -.8)], damage = getWeaponAttack('axe', state.player).damage;
  const oldAttack = state.player.attackDamage, events = tick(state);
  assert.equal(first.hp, 0); assert.ok(state.player.level > 1); assert.ok(state.player.attackDamage > oldAttack);
  assert.equal(hits(events).length, 3); assert.ok(hits(events).every(hit => hit.damage === damage));
  for (const survivor of survivors) close(survivor.hp, survivor.maxHp - damage);
  assert.equal(events.filter(event => event.type === 'melee-attack').length, 1);
});

test('holding a melee position exposes the player to live enemy attacks while staff distance buys safety', () => {
  const near = field('sword'), far = field('sprout');
  for (const [state, x] of [[near, 1.1], [far, 5.2]]) enemy(state, x, 0, { phase: 'chase', phaseTime: 0, attackCd: 0,
    speed: MONSTER_STATS.mushroom.speed, damage: MONSTER_STATS.mushroom.damage, radius: MONSTER_STATS.mushroom.radius });
  const nearEvents = tick(near, 180), farEvents = tick(far, 180);
  assert.ok(nearEvents.some(event => event.type === 'player-hit')); assert.ok(near.player.hp < near.player.maxHp);
  assert.equal(farEvents.some(event => event.type === 'player-hit'), false); assert.equal(far.player.hp, far.player.maxHp);
  assert.ok(hits(nearEvents).length > 0); assert.ok(farEvents.some(event => event.type === 'hit' && event.source === 'staff'));
  assert.deepEqual([near.player.x, near.player.z], [0, 0]); assert.deepEqual([far.player.x, far.player.z], [0, 0]);
});

test('camp, pause, death, and automatic transformations retain combat and weapon-selection authority', () => {
  const camp = field('sword'); camp.player.x = WORLD.camp.x; camp.player.z = WORLD.camp.z;
  const visitor = enemy(camp, WORLD.camp.x + 1, WORLD.camp.z);
  const campEvents = tick(camp, 90); assert.equal(camp.inCamp, true); assert.equal(visitor.hp, visitor.maxHp);
  assert.equal(campEvents.some(event => event.type === 'melee-attack'), false);
  const paused = field('axe'), target = enemy(paused, 1.2);
  setPaused(paused, true); const before = structuredClone({ hp: target.hp, player: paused.player, time: paused.time });
  assert.equal(tick(paused, 90).some(event => event.type === 'melee-attack'), false);
  assert.deepEqual({ hp: target.hp, player: paused.player, time: paused.time }, before);
  assert.equal(selectWeapon(paused, 'spear'), false); assert.equal(paused.progress.weapon, 'axe');
  setPaused(paused, false); assert.equal(hits(tick(paused)).length, 1);
  paused.phase = 'down'; assert.equal(tick(paused, 90).some(event => event.type === 'melee-attack'), false);
  for (const [saved, extra, expected] of [
    [{ xp: 120 }, { type: 'runner', trait: 'fast' }, 'wolf'],
    [{ xp: 1320 }, { type: 'flyer', trait: 'airborne' }, 'dragon'],
  ]) {
    const state = field('sword', saved); enemy(state, 1.2, 0, extra);
    const events = tick(state); assert.equal(state.player.form, expected); assert.equal(state.progress.weapon, 'sword');
    assert.equal(events.some(event => event.type === 'melee-attack'), false); assert.ok(events.some(event => event.type === 'form-attack'));
    assert.equal(exportProgress(state).weapon, 'sword');
  }
  const bear = field('spear', { xp: 560 });
  for (const [x, z] of [[1.2, 0], [1.2, 1], [1.2, -1]]) enemy(bear, x, z, { type: 'swarm', trait: 'swarm' });
  const bearEvents = tick(bear); assert.equal(bear.player.form, 'bear'); assert.equal(bearEvents.some(event => event.type === 'melee-attack'), false);
  assert.ok(bearEvents.some(event => event.type === 'form-attack'));
});
