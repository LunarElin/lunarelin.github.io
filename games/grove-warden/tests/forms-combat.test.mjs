import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, setPaused, useSkill, getFormOffer, buyFormUpgrade, exportProgress, respawnAtCamp, STAGES, HUNT_ZONES, RULES } from '../rules.mjs';
import { getFormDefinition } from '../forms.mjs';

function field(saved = {}) {
  const state = createGame(1741, { xp: 3800, questIndex: 11, ...saved });
  state.phase = 'playing'; state.player.x = 0; state.player.z = -55; state.inCamp = false;
  state.enemies = []; state.spawners = []; state.player.attackCd = 0; state.player.skillCd = 999;
  state.owl.x = state.player.x - 1.25; state.owl.z = state.player.z + 0.3; state.owl.fireCd = 999;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  return state;
}
function enemy(state, trait, x, z = 0, extra = {}) {
  const actor = { id: state.nextId++, type: trait === 'airborne' ? 'flyer' : trait === 'fast' ? 'runner' : trait === 'swarm' ? 'swarm' : 'mushroom',
    trait, stageId: 'ancient', zoneId: 'ancient-runners', x: state.player.x + x, z: state.player.z + z,
    hp: 10000, maxHp: 10000, radius: 0.4, speed: 0, damage: 0, attackCd: 999, phase: 'stunned', phaseTime: 999, ...extra };
  actor.homeX ??= actor.x; actor.homeZ ??= actor.z;
  state.enemies.push(actor); return actor;
}
function tick(state, frames, input = { manual: true }) {
  const events = [];
  for (let i = 0; i < frames; i++) { stepGame(state, input, 0.05); events.push(...state.events); }
  return events;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('the wolf prefers an in-range fast enemy and damages only one melee target', () => {
  const state = field({ xp: 120, questIndex: 0 }); state.player.z = 0;
  const near = enemy(state, 'normal', 0.75), fast = enemy(state, 'fast', 2.1);
  const expected = getFormDefinition('wolf', 1, state.player).damage;
  const events = tick(state, 1);
  assert.equal(state.player.form, 'wolf'); assert.equal(state.player.formRank, 1);
  close(fast.hp, fast.maxHp - expected); assert.equal(near.hp, near.maxHp);
  assert.equal(events.filter(event => event.type === 'hit').length, 1);
  assert.equal(events.find(event => event.type === 'hit').source, 'wolf');
  assert.equal(events.find(event => event.type === 'form-attack').targetId, fast.id);
  assert.equal(events.filter(event => event.type === 'form-attack').length, 1);
  assert.equal(events.some(event => event.type === 'shoot' || event.type === 'skill'), false);
  assert.equal(state.projectiles.length, 0);
});

test('the bear damages every overlapping ground body once using one pre-level-up snapshot', () => {
  const state = field({ xp: 560, questIndex: 6 });
  const first = enemy(state, 'swarm', 1, 0, { hp: 1, maxHp: 1, xp: 1000 });
  const second = enemy(state, 'swarm', 2), third = enemy(state, 'swarm', 0, 2), normal = enemy(state, 'normal', 0, -2.5);
  const air = enemy(state, 'airborne', 0, 1.2);
  const beforeLevel = state.player.level, damage = getFormDefinition('bear', 1, state.player).damage;
  const events = tick(state, 1);
  assert.equal(state.player.form, 'bear'); assert.equal(first.hp, 0); assert.ok(state.player.level > beforeLevel);
  for (const actor of [second, third, normal]) close(actor.hp, actor.maxHp - damage);
  assert.equal(air.hp, air.maxHp);
  const hits = events.filter(event => event.type === 'hit');
  assert.equal(hits.length, 4); assert.ok(hits.every(event => event.source === 'bear' && event.damage === damage));
  assert.equal(new Set(hits.map(event => event.targetId)).size, 4);
  assert.equal(events.filter(event => event.type === 'form-attack').length, 1);
  assert.equal(events.some(event => event.type === 'shoot' || event.type === 'skill'), false);
});

test('dragon fire prioritizes air, steers to its locked victim and applies the airborne bonus at impact', () => {
  const state = field();
  const ground = enemy(state, 'normal', 0, 1), air = enemy(state, 'airborne', 4);
  const damage = getFormDefinition('dragon', 1, state.player).damage;
  const events = tick(state, 1), bolt = state.projectiles.find(projectile => projectile.source === 'dragon');
  assert.equal(state.player.form, 'dragon'); assert.ok(bolt); assert.equal(bolt.targetId, air.id);
  assert.equal(events.find(event => event.type === 'form-attack').targetId, air.id);
  close(bolt.damage, damage); close(Math.hypot(bolt.dx, bolt.dz), 9);
  air.z += 1; state.player.attackCd = 999;
  const heading = Math.atan2(bolt.dx, bolt.dz);
  events.push(...tick(state, 1));
  assert.ok(bolt.dz > 0); assert.ok(Math.abs(Math.atan2(bolt.dx, bolt.dz) - heading) <= 5.5 * 0.05 + 1e-9);
  events.push(...tick(state, 20));
  const hits = events.filter(event => event.type === 'hit' && event.source === 'dragon');
  assert.equal(hits.length, 1); assert.equal(hits[0].targetId, air.id); close(hits[0].damage, damage * 1.6);
  close(air.hp, air.maxHp - damage * 1.6); assert.equal(ground.hp, ground.maxHp);
  assert.equal(events.filter(event => event.type === 'form-attack').length, 1);
  assert.equal(events.some(event => event.type === 'shoot' || event.type === 'skill'), false);
});

test('an air target beyond actual dragon range never suppresses the nearby ground fallback or causes advance', () => {
  const state = field(); state.player.x = -6; state.player.z = -80;
  state.player.form = 'dragon'; state.player.formRank = 1; state.player.formTime = 0;
  const ground = enemy(state, 'normal', 1), air = enemy(state, 'airborne', 6.21);
  const damage = getFormDefinition('dragon', 1, state.player).damage, origin = { x: state.player.x, z: state.player.z };
  const events = tick(state, 1, {});
  assert.equal(state.huntZoneId, 'sky-flyers');
  assert.equal(events.find(event => event.type === 'form-attack').targetId, ground.id);
  assert.deepEqual({ x: state.player.x, z: state.player.z }, origin);
  close(ground.hp, ground.maxHp - damage); assert.equal(air.hp, air.maxHp);
});

test('form hold and quiet time freeze druid cooldowns and restore exactly one unchanged companion', () => {
  const state = field({ skills: { owl: 1, roots: 1 } }), owl = state.owl;
  state.player.attackCd = 999; state.player.skillCd = 3; state.owl.fireCd = 1.2;
  const base = [state.player.attackDamage, state.player.skillDamage, state.player.damageMult, state.player.maxHp];
  enemy(state, 'fast', 4); tick(state, 1);
  assert.equal(state.player.form, 'wolf'); assert.equal(state.owl.active, false);
  assert.equal(state.player.skillCd, 3); assert.equal(state.owl.fireCd, 1.2);
  state.enemies = []; enemy(state, 'airborne', 4); tick(state, 49);
  assert.equal(state.player.form, 'wolf'); tick(state, 1); assert.equal(state.player.form, 'dragon');
  assert.equal(state.player.skillCd, 3); assert.equal(state.owl.fireCd, 1.2);
  state.enemies = []; tick(state, 49); assert.equal(state.player.form, 'dragon');
  tick(state, 1); assert.equal(state.player.form, 'druid'); assert.equal(state.owl, owl); assert.equal(state.owl.active, true);
  close(state.player.skillCd, 2.95); close(state.owl.fireCd, 1.15);
  enemy(state, 'fast', 4); tick(state, 61); assert.equal(state.player.form, 'wolf');
  state.enemies = []; tick(state, 39); assert.equal(state.player.form, 'wolf');
  tick(state, 1); assert.equal(state.player.form, 'druid');
  assert.equal(state.owl, owl); assert.equal(state.owl.active, true);
  assert.deepEqual([state.player.attackDamage, state.player.skillDamage, state.player.damageMult, state.player.maxHp], base);
});

test('pause freezes a form and camp or death immediately restores the druid without companion duplication', () => {
  const state = field({ skills: { owl: 1, roots: 1 } }), owl = state.owl;
  state.player.attackCd = 999; enemy(state, 'fast', 4); tick(state, 1);
  setPaused(state, true); const frozen = structuredClone({ player: state.player, owl: state.owl, projectiles: state.projectiles });
  tick(state, 20); assert.deepEqual({ player: state.player, owl: state.owl, projectiles: state.projectiles }, frozen);
  setPaused(state, false);
  const camp = STAGES.find(stage => stage.id === 'ancient').camp;
  state.player.x = camp.x; state.player.z = camp.z; tick(state, 1);
  assert.equal(state.player.form, 'druid'); assert.equal(state.inCamp, true); assert.equal(state.owl, owl); assert.equal(state.owl.active, true);
  state.player.x = 0; state.player.z = -55; state.enemies = []; enemy(state, 'fast', 4); tick(state, 1);
  assert.equal(state.player.form, 'wolf'); state.player.hp = 1; state.player.invuln = 0;
  state.projectiles.push({ id: state.nextId++, x: state.player.x, z: state.player.z, dx: 0, dz: 0, team: 'enemy', damage: 2, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  tick(state, 1); assert.equal(state.phase, 'down'); assert.equal(state.player.form, 'druid'); assert.equal(state.owl.active, false);
  assert.equal(state.projectiles.length, 0); assert.equal(respawnAtCamp(state), true);
  assert.equal(state.player.form, 'druid'); assert.equal(state.owl, owl); assert.equal(state.owl.active, true);
});

test('already fired druid bolts and committed roots finish during transformation while new druid skills wait', () => {
  const state = field({ skills: { owl: 1, roots: 1 } }), target = enemy(state, 'normal', 3);
  state.player.skillCd = 0; state.owl.fireCd = 0;
  const staffDamage = state.player.attackDamage * state.player.damageMult, owlDamage = state.owl.damage;
  assert.equal(useSkill(state, target), true); const rootDamage = state.pendingSkills[0].damage;
  const events = tick(state, 1), staff = state.projectiles.find(bolt => bolt.source === 'staff'), owl = state.projectiles.find(bolt => bolt.source === 'owl');
  assert.ok(staff && owl); const ids = new Set([staff.id, owl.id]);
  enemy(state, 'fast', 4, 1); events.push(...tick(state, 1));
  assert.equal(state.player.form, 'wolf'); assert.equal(state.owl.active, false);
  assert.ok(state.projectiles.some(bolt => ids.has(bolt.id))); assert.equal(state.pendingSkills.length, 1);
  state.player.skillCd = 0; state.owl.fireCd = 0; state.player.damageMult = 2;
  assert.equal(useSkill(state, target), false);
  const duringForm = tick(state, 12); events.push(...duringForm);
  assert.equal(duringForm.some(event => ['shoot', 'skill', 'owl-shoot'].includes(event.type)), false);
  assert.equal(state.pendingSkills.length, 0);
  for (const [source, damage] of [['staff', staffDamage], ['owl', owlDamage], ['roots', rootDamage]]) {
    const hits = events.filter(event => event.type === 'hit' && event.source === source && event.targetId === target.id);
    assert.equal(hits.length, 1, `${source} resolves exactly once`); close(hits[0].damage, damage);
  }
});

test('the level-four wolf buys 100 ranks with gold alone and preserves its actual maximum attack after reload', () => {
  const state = createGame(1742, { xp: 120, questIndex: 0, gold: 500_000 }), before = exportProgress(state);
  assert.equal(buyFormUpgrade(state, 'wolf'), false); assert.deepEqual(exportProgress(state), before);
  state.phase = 'playing'; state.inCamp = false;
  assert.equal(buyFormUpgrade(state, 'wolf'), false); assert.deepEqual(exportProgress(state), before);
  state.inCamp = true; setPaused(state, true); const revision = state.revision;
  let paid = 0;
  for (let rank = 1; rank < 100; rank++) {
    const offer = getFormOffer(state, 'wolf');
    assert.equal(offer.rank, rank); assert.equal(offer.requiredLevel, 4); assert.equal(offer.canBuy, true);
    paid += offer.cost;
    assert.equal(buyFormUpgrade(state, 'wolf'), true);
    assert.equal(state.progress.gold, before.gold - paid);
    assert.equal(state.progress.forms.wolf, rank); assert.equal(state.revision, revision + rank);
  }
  assert.equal(state.player.level, 4);
  assert.equal(state.queuedEvents.filter(event => event.type === 'upgrade' && event.id === 'wolf').length, 99);
  const restored = createGame(1743, exportProgress(state)); assert.equal(getFormOffer(restored, 'wolf').rank, 100);
  assert.equal(restored.player.form, 'druid'); assert.equal(restored.progress.forms.wolf, 99);
  const capped = exportProgress(state), cappedRevision = state.revision, cappedEvents = state.queuedEvents.length;
  assert.equal(buyFormUpgrade(state, 'wolf'), false); assert.deepEqual(exportProgress(state), capped);
  assert.equal(state.revision, cappedRevision); assert.equal(state.queuedEvents.length, cappedEvents);
  setPaused(state, false); state.player.x = 7; state.player.z = 7; state.enemies = []; state.spawners = []; state.inCamp = false;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9; state.player.attackCd = 0;
  const target = enemy(state, 'fast', 2), damage = getFormDefinition('wolf', 100, state.player).damage;
  const events = tick(state, 1); assert.equal(state.player.formRank, 100); close(target.hp, target.maxHp - damage);
  const hit = events.find(event => event.type === 'hit' && event.source === 'wolf');
  assert.equal(hit.targetId, target.id); close(hit.damage, damage);
});

test('v7 paid forms migrate to v8 and all three maximum ranks survive save death and recovery without extra charges', () => {
  const legacy = { version: 7, xp: 1320, questIndex: 11, gold: 1_000_000, cargo: 17,
    forms: { wolf: 2, bear: 1, dragon: 0 }, skills: { owl: 2, roots: 3 }, upgrades: { attack: 2, health: 1, bag: 1 } };
  const state = createGame(1745, legacy);
  assert.equal(state.progress.version, 8);
  assert.deepEqual(state.progress.forms, legacy.forms);
  assert.deepEqual(state.progress.skills, legacy.skills);
  assert.deepEqual(state.progress.upgrades, legacy.upgrades);
  assert.equal(state.progress.gold, legacy.gold); assert.equal(state.cargo, legacy.cargo);
  state.phase = 'playing'; state.inCamp = true;
  let paid = 0;
  for (const id of ['wolf', 'bear', 'dragon']) {
    while (!getFormOffer(state, id).maxed) {
      paid += getFormOffer(state, id).cost;
      assert.equal(buyFormUpgrade(state, id), true);
    }
    const offer = getFormOffer(state, id);
    assert.equal(offer.rank, 100); assert.ok(Number.isFinite(offer.currentDamage));
    assert.equal(offer.canBuy, false); assert.equal(buyFormUpgrade(state, id), false);
  }
  assert.equal(state.progress.gold, legacy.gold - paid);
  const saved = exportProgress(state);
  assert.equal(saved.version, 8); assert.deepEqual(saved.forms, { wolf: 99, bear: 99, dragon: 99 });
  const restored = createGame(1746, saved);
  assert.deepEqual(exportProgress(restored), saved);
  for (const id of ['wolf', 'bear', 'dragon']) assert.equal(getFormOffer(restored, id).rank, 100);
  restored.phase = 'playing'; restored.player.x = 0; restored.player.z = 0; restored.inCamp = false;
  restored.enemies = []; restored.spawners = []; restored.player.hp = 1; restored.player.invuln = 0;
  restored.fieldEvents.nextDiscovery = restored.fieldEvents.nextHazard = 1e9;
  restored.projectiles.push({ id: restored.nextId++, x: 0, z: 0, dx: 0, dz: 0, team: 'enemy', damage: 2, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  tick(restored, 1); assert.equal(restored.phase, 'down'); assert.deepEqual(exportProgress(restored), saved);
  assert.equal(respawnAtCamp(restored), true); assert.deepEqual(exportProgress(restored), saved);
});

test('an unlearned low-level druid can damage all new traits without transformation or forced movement', () => {
  for (const trait of ['fast', 'swarm', 'airborne']) {
    const state = field({ xp: 0, questIndex: 0 }); state.player.z = 0;
    const target = enemy(state, trait, 3), origin = { x: state.player.x, z: state.player.z };
    const events = tick(state, 7);
    assert.equal(state.player.form, 'druid'); assert.ok(target.hp < target.maxHp);
    assert.ok(events.some(event => event.type === 'hit' && event.source === 'staff' && event.targetId === target.id));
    assert.deepEqual({ x: state.player.x, z: state.player.z }, origin);
  }
});

test('released local hunting stops at wolf range while manual retreat and a held neutral stick remain authoritative', () => {
  const state = field(), zone = HUNT_ZONES.find(item => item.id === 'ancient-runners');
  state.player.x = zone.x; state.player.z = zone.z; state.player.attackCd = 999;
  const target = enemy(state, 'fast', 4), origin = { x: state.player.x, z: state.player.z };
  const range = getFormDefinition('wolf', 1, state.player).range;
  tick(state, 20, {});
  assert.equal(state.player.form, 'wolf'); assert.equal(state.huntZoneId, zone.id); assert.equal(state.autoHunt, true);
  assert.ok(state.player.x > origin.x);
  const distance = Math.hypot(target.x - state.player.x, target.z - state.player.z);
  assert.ok(distance <= range + 1e-9);
  assert.ok(distance >= range - RULES.playerSpeed * RULES.maxStep - 1e-9);
  const held = { x: state.player.x, z: state.player.z };
  tick(state, 20, {}); assert.deepEqual({ x: state.player.x, z: state.player.z }, held);
  tick(state, 5, { moveX: -1, moveZ: 0, manual: true });
  assert.ok(state.player.x < held.x - 1);
  assert.ok(Math.hypot(target.x - state.player.x, target.z - state.player.z) > range);
  const manualStop = { x: state.player.x, z: state.player.z };
  tick(state, 20, { moveX: 0, moveZ: 0, manual: true });
  assert.deepEqual({ x: state.player.x, z: state.player.z }, manualStop);
  tick(state, 1, {}); assert.ok(state.player.x > manualStop.x);
  assert.equal(target.hp, target.maxHp);
});

test('the level-four meadow runner territory provides a free wolf hunt and manually collected kill reward', () => {
  const state = createGame(1744, { xp: 120, questIndex: 0 }), zone = HUNT_ZONES.find(item => item.id === 'meadow-runners');
  assert.ok(zone);
  const members = state.enemies.filter(actor => actor.zoneId === zone.id);
  assert.equal(state.player.level, 4); assert.equal(members.length, 4);
  assert.equal(state.progress.forms.wolf, 0);
  const target = members.reduce((rightmost, actor) => actor.x > rightmost.x ? actor : rightmost);
  assert.deepEqual([target.type, target.trait, target.maxHp, target.damage, target.speed, target.xp, target.loot], ['runner', 'fast', 90, 4, 4.9, 4, 6]);
  state.enemies = [target]; state.spawners = state.spawners.filter(spawn => spawn.id === target.spawnId);
  // Hold this body's intent still so ranged stopping and manual pickup are separate from its melee approach.
  target.phase = 'stunned'; target.phaseTime = 999; target.attackCd = 999;
  state.phase = 'playing'; state.player.x = zone.x - 3.5; state.player.z = zone.z; state.inCamp = false;
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  const origin = { x: state.player.x, z: state.player.z }, events = tick(state, 1, {});
  assert.equal(state.huntZoneId, zone.id); assert.equal(state.autoHunt, true);
  assert.equal(state.player.form, 'wolf'); assert.equal(state.player.formRank, 1);
  assert.ok(state.player.x > origin.x);
  tick(state, 1, { moveX: -1, moveZ: 0, manual: true }); close(state.player.x, origin.x);
  const held = { x: state.player.x, z: state.player.z };
  tick(state, 1, { moveX: 0, moveZ: 0, manual: true }); assert.deepEqual({ x: state.player.x, z: state.player.z }, held);
  for (let i = 0; i < 200 && target.hp > 0; i++) events.push(...tick(state, 1, {}));
  assert.equal(target.hp, 0); assert.equal(state.progress.totals.kills, 1);
  assert.equal(state.progress.xp, 124); assert.equal(state.progress.forms.wolf, 0);
  assert.ok(events.some(event => event.type === 'hit' && event.source === 'wolf' && event.targetId === target.id));
  assert.equal(events.filter(event => event.type === 'kill' && event.targetId === target.id).length, 1);
  assert.equal(state.loot.length, 1); assert.equal(state.loot[0].value, 6); assert.equal(state.cargo, 0);
  const drop = state.loot[0], stopped = { x: state.player.x, z: state.player.z };
  tick(state, 10, {});
  assert.deepEqual({ x: state.player.x, z: state.player.z }, stopped);
  assert.equal(state.cargo, 0); assert.equal(state.loot[0].value, 6);
  const pickups = [];
  for (let i = 0; i < 20 && state.cargo < 6; i++) pickups.push(...tick(state, 1, { moveX: drop.x - state.player.x, moveZ: drop.z - state.player.z, manual: true }));
  assert.equal(state.cargo, 6); assert.equal(state.progress.gold, 0); assert.equal(state.loot.length, 0);
  assert.equal(pickups.filter(event => event.type === 'pickup').length, 1);
  assert.equal(pickups.find(event => event.type === 'pickup').amount, 6);
});
