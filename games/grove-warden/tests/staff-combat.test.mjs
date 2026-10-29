import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, setPaused, equipmentAction, exportProgress, RULES } from '../rules.mjs';
import { getStaffAttack } from '../equipment.mjs';

function field(weaponId = 'sprout', saved = {}) {
  const state = createGame(2461, { gear: { equipped: weaponId, items: { [weaponId]: { copies: 1 } } }, ...saved });
  state.phase = 'playing'; state.player.x = 0; state.player.z = 0; state.inCamp = false;
  state.enemies = []; state.spawners = []; state.player.attackCd = 0; state.player.skillCd = 999;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  return state;
}
function enemy(state, x, z = 0, extra = {}) {
  const actor = { id: state.nextId++, type: 'mushroom', trait: 'normal', zoneId: 'meadow-mushrooms', stageId: 'meadow',
    x, z, homeX: x, homeZ: z, hp: 10000, maxHp: 10000, radius: 0.4, speed: 0, damage: 0,
    phase: 'stunned', phaseTime: 999, attackCd: 999, ...extra };
  state.enemies.push(actor); return actor;
}
function tick(state, frames, input = { manual: true }, dt = 0.05) {
  const events = [];
  for (let i = 0; i < frames; i++) { stepGame(state, input, dt); events.push(...state.events); }
  return events;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('sprout fires one finite single bolt and reports its real style on shooting and impact', () => {
  const state = field(), target = enemy(state, 3.5), profile = getStaffAttack('sprout', state.player);
  const events = tick(state, 1), bolt = state.projectiles.find(item => item.source === 'staff');
  assert.ok(bolt); assert.equal(state.projectiles.length, 1); assert.equal(state.pendingStaffShots.length, 0);
  assert.equal(bolt.weaponId, 'sprout'); assert.equal(bolt.weaponStyle, 'single'); assert.equal(bolt.blastRadius, 0);
  close(bolt.damage, profile.damage); assert.ok(bolt.life > 0 && bolt.life <= 0.55); assert.equal(bolt.maxLife, profile.projectileLife);
  assert.equal(events.filter(event => event.type === 'shoot').length, 1);
  assert.equal(events.find(event => event.type === 'shoot').weaponStyle, 'single');
  state.player.attackCd = 999; events.push(...tick(state, 16));
  const hits = events.filter(event => event.type === 'hit');
  assert.equal(hits.length, 1); assert.equal(hits[0].source, 'staff'); assert.equal(hits[0].weaponStyle, 'single');
  close(target.hp, target.maxHp - profile.damage); assert.equal(state.projectiles.length, 0);
});

test('thorn fires three real shots from the current moving position with one original damage snapshot', () => {
  const state = field('thorn'), target = enemy(state, 3.4), profile = getStaffAttack('thorn', state.player), damage = profile.damage;
  const events = tick(state, 1); assert.equal(state.pendingStaffShots.length, 2);
  state.player.attackCd = 999; state.player.attackDamage = 100; state.player.damageMult = 5;
  for (let i = 0; i < 8; i++) {
    const frame = tick(state, 1, { moveX: 0, moveZ: 1, manual: true });
    for (const shot of frame.filter(event => event.type === 'shoot')) { close(shot.x, state.player.x); close(shot.z, state.player.z); }
    events.push(...frame);
    assert.ok(state.projectiles.filter(bolt => bolt.source === 'staff').every(bolt => bolt.damage === damage && bolt.weaponStyle === 'burst' && bolt.weaponId === 'thorn' && bolt.maxLife === profile.projectileLife));
  }
  events.push(...tick(state, 16));
  const shots = events.filter(event => event.type === 'shoot'), hits = events.filter(event => event.type === 'hit');
  assert.equal(shots.length, 3); assert.ok(shots[1].z > shots[0].z && shots[2].z > shots[1].z);
  assert.ok(shots.every(event => event.weaponStyle === 'burst' && event.targetId === target.id));
  assert.equal(hits.length, 3); assert.ok(hits.every(event => event.damage === damage && event.weaponStyle === 'burst'));
  close(target.hp, target.maxHp - damage * 3); assert.equal(state.pendingStaffShots.length, 0);
});

test('remaining burst shots reacquire a living in-range target or stop when no replacement exists', () => {
  for (const mode of ['dead', 'out-of-range', 'missing']) {
    const state = field('thorn'), original = enemy(state, 3.4), first = tick(state, 1);
    state.player.attackCd = 999;
    if (mode === 'out-of-range') original.x = 10; else original.hp = 0;
    const replacement = mode === 'missing' ? null : enemy(state, 2.5, 2);
    const events = tick(state, 14), shots = events.filter(event => event.type === 'shoot');
    assert.equal(first.filter(event => event.type === 'shoot').length, 1);
    assert.equal(shots.length, replacement ? 2 : 0);
    if (replacement) {
      assert.ok(shots.every(event => event.targetId === replacement.id));
      assert.equal(events.filter(event => event.type === 'hit' && event.targetId === replacement.id).length, 2);
    }
    assert.equal(state.pendingStaffShots.length, 0);
  }
});

test('moon launches five distinct spread directions but only one volley sound event', () => {
  const state = field('moon'), target = enemy(state, 3), profile = getStaffAttack('moon', state.player);
  const events = tick(state, 1), bolts = state.projectiles.filter(bolt => bolt.source === 'staff');
  assert.equal(bolts.length, 5); assert.equal(state.pendingStaffShots.length, 0);
  assert.equal(events.filter(event => event.type === 'shoot').length, 1);
  const angles = bolts.map(bolt => Math.atan2(bolt.dx, bolt.dz) - Math.PI / 2).sort((a, b) => a - b);
  for (let i = 0; i < angles.length; i++) close(angles[i], profile.spreadAngles[i]);
  assert.ok(bolts.every(bolt => bolt.weaponStyle === 'spread' && bolt.weaponId === 'moon' && bolt.damage === profile.damage && bolt.life <= 0.36 && bolt.maxLife === 0.36));
  state.player.attackCd = 999; events.push(...tick(state, 12));
  const hits = events.filter(event => event.type === 'hit' && event.targetId === target.id);
  assert.equal(hits.length, 1); close(target.hp, target.maxHp - profile.damage);
  assert.equal(state.projectiles.length, 0);
});

test('ember explodes at the first swept contact and snapshots one hit per ground or air victim across a level-up', () => {
  const state = field('ember'), far = enemy(state, 4), primary = enemy(state, 2, 0, { hp: 1, maxHp: 1, xp: 1000 });
  const fast = enemy(state, 2, 1.5, { type: 'runner', trait: 'fast' }), air = enemy(state, 2, -1.6, { type: 'flyer', trait: 'airborne' });
  const outside = enemy(state, 2, 3), damage = getStaffAttack('ember', state.player).damage, initialLevel = state.player.level;
  const events = tick(state, 1); assert.equal(state.projectiles[0].maxLife, 0.65); state.player.attackCd = 999; events.push(...tick(state, 12));
  const blasts = events.filter(event => event.type === 'staff-explosion'), hits = events.filter(event => event.type === 'hit');
  assert.equal(blasts.length, 1); assert.equal(blasts[0].radius, 2);
  close(blasts[0].x, primary.x - primary.radius - 0.17); close(blasts[0].z, 0);
  assert.equal(primary.hp, 0); assert.ok(state.player.level > initialLevel);
  assert.equal(hits.filter(event => event.targetId === primary.id).length, 1);
  assert.equal(hits.length, 3); assert.ok(hits.every(event => event.damage === damage && event.source === 'staff' && event.weaponStyle === 'explosive'));
  close(fast.hp, fast.maxHp - damage); close(air.hp, air.maxHp - damage);
  assert.equal(far.hp, far.maxHp); assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.projectiles.filter(bolt => bolt.source === 'staff').length, 0);
});

test('pause freezes scheduled bursts while camp transformation and death cancel only the appropriate attacks', () => {
  const paused = field('thorn'); enemy(paused, 3.4); tick(paused, 1); paused.player.attackCd = 999;
  setPaused(paused, true); const frozen = structuredClone({ pending: paused.pendingStaffShots, bolts: paused.projectiles });
  tick(paused, 10); assert.deepEqual({ pending: paused.pendingStaffShots, bolts: paused.projectiles }, frozen);
  setPaused(paused, false); assert.equal(tick(paused, 5).filter(event => event.type === 'shoot').length, 2);
  for (const mode of ['camp', 'transform', 'death']) {
    const state = field('thorn', mode === 'transform' ? { xp: 120 } : {}), target = enemy(state, 3.4);
    const damage = getStaffAttack('thorn', state.player).damage; tick(state, 1); state.player.attackCd = 999;
    const firedId = state.projectiles[0].id;
    if (mode === 'camp') { state.player.x = 0; state.player.z = 16; }
    if (mode === 'transform') enemy(state, 0, 3, { type: 'runner', trait: 'fast' });
    if (mode === 'death') state.projectiles.push({ id: state.nextId++, x: state.player.x, z: state.player.z, dx: 0, dz: 0, team: 'enemy', damage: 999, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
    const events = tick(state, 1);
    assert.equal(state.pendingStaffShots.length, 0);
    if (mode === 'death') { assert.equal(state.phase, 'down'); assert.equal(state.projectiles.length, 0); }
    else {
      assert.ok(state.projectiles.some(bolt => bolt.id === firedId));
      events.push(...tick(state, 12)); close(target.hp, target.maxHp - damage);
      assert.equal(events.some(event => event.type === 'shoot'), false);
      if (mode === 'camp') assert.equal(state.inCamp, true); else assert.equal(state.player.form, 'wolf');
    }
  }
});

test('partial volleys and adversarial burst requests respect shared projectile and pending-shot caps', () => {
  const spread = field('moon'); enemy(spread, 3);
  for (let i = 0; i < RULES.maxProjectiles - 1; i++) spread.projectiles.push({ id: spread.nextId++, x: -14, z: 20, dx: 0, dz: 0, team: 'enemy', damage: 0, life: 100, radius: 0.2, hitIds: [], pierce: 0 });
  const events = tick(spread, 1);
  assert.equal(spread.projectiles.length, RULES.maxProjectiles);
  assert.equal(spread.projectiles.filter(bolt => bolt.source === 'staff').length, 1);
  assert.equal(events.filter(event => event.type === 'shoot').length, 1);
  const burst = field('thorn'); enemy(burst, 3.4); let maxPending = 0;
  for (let i = 0; i < 100; i++) {
    burst.player.attackCd = 0; tick(burst, 1, { manual: true }, 0.001);
    maxPending = Math.max(maxPending, burst.pendingStaffShots.length);
    assert.ok(burst.projectiles.length <= RULES.maxProjectiles); assert.ok(burst.pendingStaffShots.length <= RULES.maxPendingStaffShots);
  }
  assert.equal(RULES.maxPendingStaffShots, 12); assert.equal(maxPending, RULES.maxPendingStaffShots); assert.equal(burst.projectiles.length, RULES.maxProjectiles);
});

test('local pursuit uses the selected staff range and stops without manual input taking a back seat', () => {
  for (const weaponId of ['sprout', 'moon']) {
    const state = field(weaponId); state.player.x = -6; state.player.z = 4; state.player.attackCd = 999;
    enemy(state, -2, 4); const origin = state.player.x, range = getStaffAttack(weaponId, state.player).range;
    tick(state, 10, {});
    if (weaponId === 'sprout') close(state.player.x, origin);
    else {
      assert.ok(state.player.x > origin); const distance = -2 - state.player.x;
      assert.ok(distance <= range); assert.ok(distance >= range - RULES.playerSpeed * RULES.maxStep - 1e-9);
    }
    const held = state.player.x; tick(state, 10, {}); close(state.player.x, held);
    tick(state, 1, { moveX: -1, manual: true }); assert.ok(state.player.x < held);
    const manual = state.player.x; tick(state, 4, { moveX: 0, moveZ: 0, manual: true }); close(state.player.x, manual);
  }
});

test('camp selection unlocks ember once and version-seven saves preserve old gear and progression', () => {
  const old = { version: 6, xp: 120, questIndex: 4, gold: 37, cargo: 10, checkpoint: 'deep', forms: { wolf: 1 },
    skills: { owl: 1, roots: 1 }, gear: { equipped: 'thorn', scrolls: 4, items: {
      sprout: { copies: 3, level: 2, tier: 1 }, thorn: { copies: 2, level: 3, tier: 1 }, moon: { copies: 5, level: 4, tier: 2 },
    } } };
  const state = createGame(2462, old), before = exportProgress(state);
  assert.equal(before.version, 7); assert.equal(before.gear.items.ember.copies, 0);
  for (const id of ['sprout', 'thorn', 'moon']) assert.deepEqual(before.gear.items[id], old.gear.items[id]);
  assert.equal(before.gear.scrolls, old.gear.scrolls); assert.equal(before.forms.wolf, old.forms.wolf);
  assert.deepEqual(before.skills, old.skills); assert.equal(before.cargo, old.cargo); assert.equal(before.checkpoint, 'deep');
  assert.equal(equipmentAction(state, 'ember', 'unlock'), false); assert.deepEqual(exportProgress(state), before);
  state.phase = 'playing'; state.inCamp = false;
  assert.equal(equipmentAction(state, 'ember', 'unlock'), false); assert.deepEqual(exportProgress(state), before);
  state.inCamp = true; setPaused(state, true); const revision = state.revision;
  assert.equal(equipmentAction(state, 'ember', 'unlock'), true);
  assert.equal(state.progress.gear.equipped, 'ember'); assert.equal(state.progress.gear.items.ember.copies, 1);
  assert.equal(state.progress.gold, 37); assert.equal(state.revision, revision + 1);
  for (const id of ['sprout', 'thorn', 'moon']) assert.deepEqual(state.progress.gear.items[id], old.gear.items[id]);
  assert.equal(getStaffAttack(state.progress.gear.equipped, state.player).weaponStyle, 'explosive');
  const saved = exportProgress(state); assert.equal(equipmentAction(state, 'ember', 'unlock'), false);
  assert.deepEqual(exportProgress(state), saved); assert.equal('pendingStaffShots' in saved, false);
  const restored = createGame(2463, saved);
  assert.deepEqual(exportProgress(restored), saved); assert.equal(restored.pendingStaffShots.length, 0);
});
