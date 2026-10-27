import * as exportedRules from '../rules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, useSkill, setPaused, RULES, WORLD, HUNT_ZONES, MONSTER_STATS, SKILLS, getSkillOffer, learnSkill, normalizeProgress, exportProgress, getQuest, claimQuest, getUpgradeOffer, buyUpgrade, respawnAtCamp } from '../rules.mjs';

function playing(seed = 11) {
  const state = createGame(seed, { skills: { owl: 0, roots: 1 } });
  state.phase = 'playing';
  state.enemies = [];
  state.spawners = [];
  state.player.x = 0; state.player.z = 1; state.inCamp = false;
  state.huntZoneId = 'meadow-mushrooms'; state.autoHunt = false;
  state.player.skillCd = 0;
  state.owl.x = state.player.x - 1.25; state.owl.z = state.player.z + 0.3;
  state.player.attackCd = 999;
  return state;
}

function enemy(state, x = 0, z = 0, extra = {}) {
  const item = {
    id: state.nextId++, type: 'mushroom', zoneId: state.huntZoneId, homeX: x, homeZ: z, x, z, hp: 100, maxHp: 100,
    radius: 0.46, phase: 'stunned', phaseTime: 100, attackCd: 100,
    speed: 0, damage: 10, ...extra,
  };
  state.enemies.push(item);
  return item;
}

function advance(state, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepGame(state, input, 1 / 60);
}

test('seed and identical inputs produce identical simulations', () => {
  const a = createGame(323);
  const b = createGame(323);
  a.phase = b.phase = 'playing';
  for (let i = 0; i < 800; i++) {
    const input = { moveX: Math.sin(i / 100), moveZ: Math.cos(i / 100) };
    stepGame(a, input, 1 / 60);
    stepGame(b, input, 1 / 60);
  }
  assert.deepEqual(a, b);
});


test('movement is normalized and clamped to arena; oversized dt is bounded', () => {
  const state = playing();
  stepGame(state, { moveX: 1, moveZ: 1 }, 0.05);
  assert.ok(Math.abs(Math.hypot(state.player.x, state.player.z - 1) - RULES.playerSpeed * 0.05) < 1e-9);
  const time = state.time;
  stepGame(state, { moveX: 10, moveZ: 10 }, 100);
  assert.equal(state.time - time, RULES.maxStep);
  advance(state, 9, { moveX: 1, moveZ: 1 });
  assert.equal(state.player.x, RULES.arena.maxX - state.player.radius);
  assert.equal(state.player.z, RULES.arena.maxZ - state.player.radius);
});

test('skill uses a cast snapshot, clamps aim, and applies damage once', () => {
  const state = playing();
  const target = enemy(state, 0, -3.8);
  assert.equal(useSkill(state, { x: 0, z: -100 }), true);
  assert.equal(useSkill(state), false);
  assert.ok(Math.abs(state.pendingSkills[0].z + 3.8) < 1e-8);
  state.player.damageMult = 10;
  advance(state, 0.5);
  assert.equal(target.hp, 54);
  assert.equal(target.phase, 'stunned');
  advance(state, 1);
  assert.equal(target.hp, 54);
});

test('ordinary movement neither rolls nor grants invulnerability nor cancels committed roots', () => {
  const state = playing(); const target = enemy(state, 0, 1);
  assert.equal(useSkill(state), true);
  advance(state, 0.5, { moveX: 1, manual: true });
  assert.equal(target.hp, 54);
  assert.ok(Math.abs(state.player.x - RULES.playerSpeed * 0.5) < 1e-8);
  assert.equal(state.player.invuln, 0);
  assert.equal(exportedRules.dodge, undefined);
  assert.equal(getSkillOffer(state, 'dodge'), null);
  assert.equal(learnSkill(state, 'dodge'), false);
  assert.ok(Object.keys(state.player).every(key => !key.toLowerCase().includes('dodge')));
  assert.ok(state.effects.every(effect => effect.type !== 'dodge'));
});

test('fast projectiles sweep targets, preserve firing damage, and cannot hit twice', () => {
  const state = playing();
  const target = enemy(state, 0, 0);
  state.projectiles.push({ id: 700, x: -2, z: 0, dx: 100, dz: 0, team: 'player', damage: 17, life: 1, radius: 0.17, hitIds: [], pierce: 3 });
  stepGame(state, {}, 0.05);
  assert.equal(target.hp, 83);
  state.player.damageMult = 50;
  state.projectiles[0].dx = -100;
  stepGame(state, {}, 0.05);
  assert.equal(target.hp, 83);
});

test('non-piercing bolts hit the earliest target, independent of array order', () => {
  const state = playing();
  const far = enemy(state, 1, 0);
  const near = enemy(state, -1, 0);
  state.projectiles.push({ id: 700, x: -3, z: 0, dx: 120, dz: 0, team: 'player', damage: 20, life: 1, radius: 0.17, hitIds: [], pierce: 0 });
  stepGame(state, {}, 0.05);
  assert.equal(near.hp, 80);
  assert.equal(far.hp, 100);
  assert.equal(state.projectiles.length, 0);
});

test('a projectile resolves the final fraction of its lifetime before removal', () => {
  const state = playing();
  const target = enemy(state, 0, 0);
  state.projectiles.push({ id: 700, x: -0.7, z: 0, dx: 10, dz: 0, team: 'player', damage: 20, life: 0.01, radius: 0.17, hitIds: [], pierce: 0 });
  stepGame(state, {}, 0.05);
  assert.equal(target.hp, 80);
  assert.equal(state.projectiles.length, 0);
});

test('boar line warning and attack share geometry and only resolve once', () => {
  const state = playing();
  state.player.x = -1;
  state.player.z = 2;
  enemy(state, -1, 0, { type: 'boar', phase: 'windup', phaseTime: 0.01, warnX: -1, warnZ: 0, aimX: 0, aimZ: 1, length: 5, width: 1.6, angle: 0, chargeTime: 0.34 });
  stepGame(state, {}, 1 / 60);
  assert.equal(state.player.hp, 90);
  advance(state, 0.6);
  assert.equal(state.player.hp, 90);
  const safe = playing();
  safe.player.x = -0.19;
  safe.player.z = 2;
  enemy(safe, -1, 0, { type: 'boar', phase: 'windup', phaseTime: 0.01, warnX: -1, warnZ: 0, aimX: 0, aimZ: 1, length: 5, width: 1.6 });
  stepGame(safe, {}, 1 / 60);
  assert.equal(safe.player.hp, 100);
});

test('root stun cancels an enemy attack before its damage timing', () => {
  const state = playing();
  const target = enemy(state, 0, 1, { phase: 'windup', phaseTime: 0.45, warnX: 0, warnZ: 1, attackRadius: 2 });
  useSkill(state);
  advance(state, 0.6);
  assert.equal(target.phase, 'stunned');
  assert.equal(state.player.hp, 100);
});






test('overlapping chase bodies gain readable spacing, including coincident centers', () => {
  const state = playing();
  state.progress.skills = { owl: 0, roots: 0 };
  state.player.x = -6; state.player.z = 9;
  const a = enemy(state, -6, 4, { phase: 'chase' });
  const b = enemy(state, -6, 4, { phase: 'chase' });
  advance(state, 0.5);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > (a.radius + b.radius) * 0.9);
  assert.equal(a.phase, 'chase');
  assert.equal(b.phase, 'chase');
});

test('separation leaves locked attack, stun and charge positions and warnings intact', () => {
  const state = playing();
  state.progress.skills = { owl: 0, roots: 0 };
  state.player.x = -6; state.player.z = 9;
  const warning = enemy(state, -6, 4, { phase: 'windup', phaseTime: 100, warnX: -6, warnZ: 4, aimX: 1, aimZ: 0 });
  const stunned = enemy(state, -5.9, 4, { phase: 'stunned' });
  const charging = enemy(state, -5.8, 4, { phase: 'charge', phaseTime: 100, chargeTime: 100, length: 0, aimX: 1, aimZ: 0 });
  const chasing = enemy(state, -5.85, 4, { phase: 'chase' });
  advance(state, 0.5);
  assert.deepEqual([warning.x, warning.z, warning.warnX, warning.warnZ, warning.aimX, warning.aimZ], [-6, 4, -6, 4, 1, 0]);
  assert.deepEqual([stunned.x, stunned.z], [-5.9, 4]);
  assert.deepEqual([charging.x, charging.z], [-5.8, 4]);
  assert.ok(Math.hypot(chasing.x + 5.85, chasing.z - 4) > 0.2);
});

test('crowded boundary separation is deterministic, arena bounded and correction capped', () => {
  const a = playing();
  a.player.z = -8;
  for (let i = 0; i < RULES.maxEnemies; i++) enemy(a, 6.3, 8.3, { phase: 'chase' });
  const b = structuredClone(a);
  const before = a.enemies.map(item => ({ x: item.x, z: item.z }));
  stepGame(a, {}, 1 / 60);
  stepGame(b, {}, 1 / 60);
  assert.deepEqual(a, b);
  assert.equal(a.enemies.length, RULES.maxEnemies);
  for (let i = 0; i < a.enemies.length; i++) {
    const item = a.enemies[i];
    assert.ok(Math.hypot(item.x - before[i].x, item.z - before[i].z) <= 2.4 / 60 + 1e-9);
    assert.ok(item.x >= RULES.arena.minX + item.radius && item.x <= RULES.arena.maxX - item.radius);
    assert.ok(item.z >= RULES.arena.minZ + item.radius && item.z <= RULES.arena.maxZ - item.radius);
  }
});

test('progress normalization whitelists fields, validates values, and derives level', () => {
  const p = normalizeProgress({ gold: -10, cargo: 999, xp: 60, level: 999, questIndex: 100, upgrades: { attack: 999, health: NaN, bag: 1, magic: 3 }, totals: { kills: 5.9, banked: -3 }, bosses: ['meadow-guardian', 'other'], enemies: [1] });
  assert.equal(p.gold, 0);
  assert.equal(p.cargo, 40);
  assert.equal(p.level, 3);
  assert.equal(p.upgrades.attack, 8);
  assert.equal(p.upgrades.health, 0);
  assert.equal(p.totals.kills, 5);
  assert.equal(p.totals.banked, 0);
  assert.deepEqual(p.bosses, ['meadow-guardian']);
  assert.equal('enemies' in p, false);
  assert.equal('magic' in p.upgrades, false);
  assert.deepEqual(normalizeProgress(null), normalizeProgress({}));
});

test('carried gold survives save and deposits once after reloading at camp', () => {
  const state = playing();
  state.progress.gold = 9;
  state.cargo = 17;
  const saved = exportProgress(state);
  assert.equal(saved.cargo, 17);
  saved.upgrades.attack = 2;
  assert.equal(state.progress.upgrades.attack, 0);
  const restored = createGame(1, saved);
  restored.phase = 'playing';
  stepGame(restored);
  assert.equal(restored.progress.gold, 26);
  assert.equal(restored.cargo, 0);
  assert.equal(restored.progress.totals.banked, 17);
  const again = createGame(1, exportProgress(restored));
  again.phase = 'playing'; stepGame(again);
  assert.equal(again.progress.gold, 26);
  assert.equal(again.progress.totals.banked, 17);
});

test('loot pickup obeys cargo capacity and banked gold changes only in camp', () => {
  const state = playing();
  state.loot.push({ enemyType: 'mushroom', zoneId: state.huntZoneId, id: 100, x: 0, z: 1, value: 30, life: 50 });
  stepGame(state);
  assert.equal(state.cargo, 24);
  assert.equal(state.progress.gold, 0);
  assert.equal(state.loot[0].value, 6);
  state.player.x = WORLD.camp.x; state.player.z = WORLD.camp.z;
  stepGame(state);
  assert.equal(state.cargo, 0);
  assert.equal(state.progress.gold, 24);
  assert.equal(state.progress.totals.banked, 24);
  const revision = state.revision;
  stepGame(state);
  assert.equal(state.progress.gold, 24);
  assert.equal(state.revision, revision);
});

test('quests are claimed in the field once and quest reward is not cargo banking', () => {
  const state = playing();
  assert.equal(claimQuest(state), false);
  state.progress.totals.mushrooms = 5;
  assert.equal(getQuest(state).complete, true);
  assert.equal(claimQuest(state), true);
  assert.equal(state.progress.gold, 20);
  assert.equal(state.progress.totals.banked, 0);
  assert.equal(getQuest(state).id, 'bank');
  assert.equal(claimQuest(state), false);
  assert.equal(state.progress.gold, 20);
});

test('permanent purchases require camp and funds and survive serialization', () => {
  const state = playing();
  state.progress.gold = 100;
  assert.equal(buyUpgrade(state, 'attack'), false);
  state.player.x = 0; state.player.z = 16; stepGame(state);
  assert.equal(getUpgradeOffer(state, 'attack').cost, 30);
  assert.equal(buyUpgrade(state, 'attack'), true);
  assert.equal(state.progress.gold, 70);
  assert.equal(state.player.damageMult, 1.18);
  assert.equal(getUpgradeOffer(state, 'attack').cost, 54);
  assert.equal(buyUpgrade(state, 'bag'), true);
  assert.equal(state.player.capacity, 40);
  setPaused(state, true);
  assert.equal(buyUpgrade(state, 'health'), true);
  const restored = createGame(8, exportProgress(state));
  assert.deepEqual(restored.progress.upgrades, { attack: 1, health: 1, bag: 1 });
  assert.equal(restored.player.capacity, 40);
  assert.equal(restored.player.maxHp, 120);
  assert.equal(buyUpgrade(restored, 'attack'), false);
});

test('boss kill persists without ending play and claiming its quest unlocks the gate', () => {
  const state = createGame(3, { questIndex: 3, skills: { roots: 1 } });
  state.phase = 'playing'; state.player.x = -6; state.player.z = -8; state.inCamp = false;
  stepGame(state, { manual: true }); state.player.skillCd = 0;
  state.player.attackCd = 999;
  const boss = state.enemies.find(item => item.bossId === 'meadow-guardian');
  boss.hp = 1;
  useSkill(state);
  advance(state, 0.5);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.progress.bosses, ['meadow-guardian']);
  assert.equal(state.progress.unlockedDeep, false);
  assert.equal(claimQuest(state), true);
  assert.equal(state.progress.unlockedDeep, true);
  stepGame(state);
  assert.ok(state.enemies.some(item => item.bossId === 'deep-guardian'));
  const restored = createGame(3, exportProgress(state));
  assert.equal(restored.enemies.some(item => item.bossId === 'meadow-guardian'), false);
  assert.equal(restored.progress.unlockedDeep, true);
});

test('locked gate blocks movement until the first boss quest is claimed', () => {
  const state = playing();
  state.player.z = WORLD.gateZ + 0.45;
  advance(state, 1, { moveZ: -1 });
  assert.equal(state.player.z, WORLD.gateZ + state.player.radius);
  state.progress.questIndex = 3;
  state.progress.bosses = ['meadow-guardian'];
  claimQuest(state);
  advance(state, 1, { moveZ: -1 });
  assert.ok(state.player.z < WORLD.gateZ - 2);
});

test('normal territories regrow at their own active-time interval and pause freezes regrowth', () => {
  for (const [zoneId, seconds] of [['meadow-mushrooms', 15], ['meadow-boars', 8], ['deep-casters', 8]]) {
    const state = createGame(4, { questIndex: 4 }); state.phase = 'playing';
    const target = state.enemies.find(item => item.zoneId === zoneId);
    state.enemies = [target]; state.spawners = state.spawners.filter(item => item.id === target.spawnId);
    state.player.attackCd = 999;
    state.projectiles.push({ id: 800, x: target.x, z: target.z, dx: 0, dz: 0, team: 'player', damage: 999, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
    stepGame(state);
    assert.equal(state.enemies.length, 0);
    assert.equal(state.spawners[0].remaining, seconds);
    advance(state, seconds - 0.2);
    assert.equal(state.enemies.length, 0);
    setPaused(state, true);
    const remaining = state.spawners[0].remaining;
    advance(state, 1);
    assert.equal(state.spawners[0].remaining, remaining);
    setPaused(state, false);
    advance(state, 0.25);
    assert.equal(state.enemies.length, 1);
    assert.equal(state.enemies[0].spawnId, target.spawnId);
    assert.notEqual(state.enemies[0].id, target.id);
    assert.equal(state.enemies[0].hp, target.maxHp);
  }
});

test('death and camp recovery preserve permanent progress and carried gold', () => {
  const state = playing();
  state.progress.gold = 15; state.progress.totals.mushrooms = 4; state.cargo = state.progress.cargo = 11;
  useSkill(state);
  state.player.hp = 1;
  state.projectiles.push({ id: 700, x: 0, z: 1, dx: 0, dz: 0, team: 'enemy', damage: 10, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state);
  assert.equal(state.phase, 'down');
  assert.equal(state.pendingSkills.length, 0);
  assert.equal(state.projectiles.length, 0);
  const time = state.time; advance(state, 1); assert.equal(state.time, time);
  assert.equal(respawnAtCamp(state), true);
  assert.equal(state.cargo, 11);
  assert.equal(state.progress.gold, 15);
  assert.equal(state.progress.totals.mushrooms, 4);
  stepGame(state);
  assert.equal(state.progress.gold, 26);
  assert.equal(state.cargo, 0);
  assert.equal(state.player.hp, state.player.maxHp);
});

test('movement enters a local territory and a full bag never chooses a camp route', () => {
  const state = createGame(5); state.phase = 'playing';
  state.player.x = -6; state.player.z = 10;
  advance(state, 0.5, { moveZ: -1, manual: true });
  assert.equal(state.huntZoneId, 'meadow-mushrooms');
  assert.equal(state.autoHunt, true);
  const beforeX = state.player.x;
  advance(state, 0.2, { moveX: 1, manual: true });
  assert.ok(state.player.x > beforeX + 0.5);
  state.enemies = []; state.spawners = [];
  state.cargo = state.player.capacity;
  advance(state, 2);
  assert.equal(state.huntZoneId, 'meadow-mushrooms');
  assert.equal(state.autoHunt, true);
  assert.equal(state.inCamp, false);
  assert.equal(state.cargo, state.player.capacity);
  assert.equal(state.progress.gold, 0);
  assert.equal('returning' in state, false);
});

test('pause freezes attacks, respawns and progress; there is no run timeout', () => {
  const state = playing();
  useSkill(state);
  setPaused(state, true);
  const snapshot = structuredClone({ player: state.player, casts: state.pendingSkills, time: state.time, progress: state.progress });
  advance(state, 1);
  assert.deepEqual({ player: state.player, casts: state.pendingSkills, time: state.time, progress: state.progress }, snapshot);
  assert.equal(useSkill(state), false);
  setPaused(state, false);
  advance(state, 180);
  assert.equal(state.phase, 'playing');
  assert.equal('duration' in RULES, false);
  assert.equal('upgradeAt' in RULES, false);
});

test('the camp is safe even from a projectile fired before arrival', () => {
  const state = createGame(7);
  state.phase = 'playing'; state.player.hp = 40;
  state.projectiles.push({ id: 900, x: 0, z: 16, dx: 0, dz: 0, team: 'enemy', damage: 999, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state);
  assert.equal(state.phase, 'playing');
  assert.ok(state.player.hp > 40);
  assert.ok(state.player.hp < state.player.maxHp);
});

test('hunting never routes toward gold and the player must approach it to collect', () => {
  const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
  state.loot.push({ enemyType: 'mushroom', zoneId: state.huntZoneId, id: 900, x: -3, z: 4, value: 4, life: 30 });
  advance(state, 2);
  assert.equal(state.player.x, -6); assert.equal(state.player.z, 4);
  assert.equal(state.cargo, 0); assert.equal(state.loot[0].value, 4);
  advance(state, 0.4, { moveX: 1, manual: true });
  assert.equal(state.cargo, 4); assert.equal(state.loot.length, 0);
  state.cargo = state.player.capacity;
  state.loot.push({ id: 901, enemyType: 'mushroom', zoneId: state.huntZoneId, x: -3, z: 4, value: 8, life: 30 });
  const x = state.player.x;
  advance(state, 2);
  assert.equal(state.player.x, x); assert.equal(state.loot[0].value, 8);
  assert.equal(state.progress.gold, 0);
});

test('gold of any category never attracts automatic movement even at low health', () => {
  const state = playing(); state.player.x = -6; state.player.z = 4; state.player.hp = 20; state.autoHunt = true;
  state.loot.push({ enemyType: 'boar', zoneId: 'meadow-boars', id: 900, x: -6, z: 5.7, value: 9, life: 30 });
  state.loot.push({ enemyType: 'mushroom', zoneId: state.huntZoneId, id: 901, x: -3, z: 4, value: 4, life: 30 });
  advance(state, 1);
  assert.equal(state.cargo, 0); assert.equal(state.loot.length, 2);
  assert.equal(state.player.x, -6); assert.equal(state.player.z, 4);
  assert.equal(state.player.hp, 20); assert.equal(state.inCamp, false);
  advance(state, 0.1, { moveZ: 1, manual: true });
  assert.equal(state.cargo, 9); assert.equal(state.loot.length, 1);
  assert.equal(state.loot[0].id, 901);
});

test('v2 progression migrates to v4 with no lost gold, cargo, ranks, quests or bosses', () => {
  const old = { version: 2, gold: 215, cargo: 33, xp: 150, upgrades: { attack: 2, health: 1, bag: 2 }, questIndex: 4,
    totals: { kills: 19, mushrooms: 12, deepKills: 3, banked: 70 }, bosses: ['meadow-guardian'], unlockedDeep: true };
  const migrated = normalizeProgress(old);
  assert.equal(migrated.version, 4);
  for (const key of ['gold', 'cargo', 'xp', 'questIndex', 'unlockedDeep']) assert.equal(migrated[key], old[key]);
  for (const key of ['upgrades', 'totals', 'bosses']) assert.deepEqual(migrated[key], old[key]);
  assert.deepEqual(migrated.skills, { owl: 0, roots: 0 });
  const restored = createGame(99, migrated);
  assert.deepEqual(exportProgress(restored), migrated);
});

test('stat ranks and learned druid skills require their displayed level and cost', () => {
  const novice = createGame(1, { gold: 200 }); novice.phase = 'playing';
  assert.equal(getSkillOffer(novice, 'owl').requiredLevel, 2);
  assert.equal(getSkillOffer(novice, 'owl').locked, true);
  assert.equal(learnSkill(novice, 'owl'), false);
  assert.equal(buyUpgrade(novice, 'attack'), true);
  assert.equal(getUpgradeOffer(novice, 'attack').requiredLevel, 3);
  assert.equal(getUpgradeOffer(novice, 'attack').locked, true);
  assert.equal(buyUpgrade(novice, 'attack'), false);
  const apprentice = createGame(2, { xp: 20, gold: 100 }); apprentice.phase = 'playing';
  assert.equal(learnSkill(apprentice, 'owl'), true);
  assert.equal(apprentice.progress.gold, 80);
  assert.equal(apprentice.progress.skills.owl, 1);
  assert.equal(getSkillOffer(apprentice, 'owl').currentInterval, 1.6);
  assert.equal(getSkillOffer(apprentice, 'owl').nextInterval, 1.4);
  assert.equal(getSkillOffer(apprentice, 'owl').requiredLevel, 5);
  assert.equal(learnSkill(apprentice, 'roots'), false);
  const druid = createGame(3, { xp: 60, gold: 100 }); druid.phase = 'playing';
  assert.equal(learnSkill(druid, 'roots'), true);
  assert.equal(druid.progress.gold, 65);
  assert.equal(getSkillOffer(druid, 'roots').currentInterval, 8);
  assert.equal(getSkillOffer(druid, 'roots').requiredLevel, 6);
  assert.equal(getSkillOffer(druid, 'roots').nextInterval, 7.2);
});

test('unlearned skills never activate and learned roots execute automatically in combat', () => {
  const state = playing();
  state.progress.skills = { owl: 0, roots: 0 };
  state.player.x = -6; state.player.z = 5;
  const target = enemy(state, -6, 4, { hp: 10000, maxHp: 10000 });
  assert.equal(useSkill(state), false);
  advance(state, 10);
  assert.equal(target.hp, 10000);
  assert.equal(state.player.castId, 0);
  state.progress.skills.roots = 1; state.player.skillCd = 0;
  advance(state, 0.6);
  assert.equal(target.hp, 9954);
  assert.ok(state.player.skillCd > 7);
  advance(state, 8);
  assert.equal(target.hp, 9908);
});

test('a learned owl fires alongside roots without cancelling their committed cast', () => {
  const state = playing(); state.progress.skills.owl = 1;
  const target = enemy(state, 0, 0, { hp: 1000, maxHp: 1000 });
  stepGame(state, { manual: true });
  assert.equal(state.pendingSkills.length, 1);
  assert.equal(state.owl.active, true);
  assert.ok(state.projectiles.some(bolt => bolt.source === 'owl'));
  advance(state, 0.6, { manual: true });
  assert.equal(state.pendingSkills.length, 0);
  assert.equal(target.hp, 944);
  assert.equal(state.player.castId, 1);
  assert.equal(state.player.invuln, 0);
});

test('automatic learned skills stay idle in camp and without a local enemy', () => {
  const state = createGame(8, { xp: 60, skills: { owl: 0, roots: 1 } });
  state.phase = 'playing';
  advance(state, 15);
  assert.equal(state.player.castId, 0);
  assert.equal(state.pendingSkills.length, 0);
  state.enemies = []; state.spawners = [];
  state.player.x = -6; state.player.z = 4;
  advance(state, 10);
  assert.equal(state.player.castId, 0);
  assert.equal(state.pendingSkills.length, 0);
});

test('hunting territories contain one species and stay within the global actor cap', () => {
  const state = createGame(2, { questIndex: 4 });
  assert.equal(state.enemies.length, 29);
  assert.equal(state.enemies.filter(item => item.type !== 'boss').length, 27);
  assert.equal(state.enemies.filter(item => item.type === 'boss').length, 2);
  assert.deepEqual(HUNT_ZONES.map(zone => zone.count), [9, 6, 1, 6, 6, 1]);
  assert.equal(createGame(2).enemies.length, 16);
  assert.equal(RULES.maxEnemies, 36);
  assert.ok(state.enemies.length <= RULES.maxEnemies);
  for (const zone of HUNT_ZONES) {
    const members = state.enemies.filter(item => item.zoneId === zone.id);
    assert.equal(members.length, zone.count);
    assert.ok(members.every(item => item.type === zone.type && Math.hypot(item.x - zone.x, item.z - zone.z) < zone.radius));
  }
});

test('an in-range foreign category stops local pursuit while basic attacks keep firing', () => {
  const state = playing(); state.player.x = 6; state.player.z = -3;
  state.player.attackCd = 0; state.progress.skills = { owl: 0, roots: 0 };
  const local = enemy(state, 9.5, -3, { type: 'boar', zoneId: 'meadow-boars' });
  const foreign = enemy(state, 6, -3.2, { zoneId: 'meadow-mushrooms' });
  stepGame(state);
  const shot = state.events.find(item => item.type === 'shoot');
  assert.equal(shot.targetId, foreign.id); assert.ok(shot.aimZ < -0.9);
  assert.equal(state.player.x, 6); assert.equal(state.player.z, -3);
  advance(state, 0.2);
  assert.equal(foreign.hp, 84); assert.equal(local.hp, 100);
  assert.equal(state.player.x, 6);
  foreign.hp = 0; local.x = 10.8;
  advance(state, 0.3);
  assert.ok(state.player.x > 6);
  assert.ok(Math.hypot(local.x - state.player.x, local.z - state.player.z) <= RULES.attackRange);
  const x = state.player.x;
  advance(state, 0.5);
  assert.equal(state.player.x, x);
  assert.equal(state.huntZoneId, 'meadow-boars');
});

test('cleared territories wait locally and leaving cancels hunting instead of roaming', () => {
  const state = playing();
  state.player.x = -6; state.player.z = 4; state.autoHunt = true;
  enemy(state, 6, -3, { type: 'boar', zoneId: 'meadow-boars' });
  advance(state, 5);
  assert.equal(state.player.x, -6);
  assert.equal(state.player.z, 4);
  assert.equal(state.huntZoneId, 'meadow-mushrooms');
  advance(state, 2.2, { moveZ: 1, manual: true });
  assert.equal(state.huntZoneId, null);
  assert.equal(state.autoHunt, false);
  const x = state.player.x;
  advance(state, 2);
  assert.equal(state.player.x, x);
});

test('the player chooses when to leave a real local hunt and physically walks to bank loot', () => {
  const state = createGame(42); state.phase = 'playing';
  let entered = false, choseCamp = false, banked = false;
  const eventTypes = new Set();
  for (let i = 0; i < 3600; i++) {
    let input = {};
    if (!entered) input = { moveX: -6 - state.player.x, moveZ: 8 - state.player.z, manual: true };
    if (choseCamp) input = { moveX: WORLD.camp.x - state.player.x, moveZ: WORLD.camp.z - state.player.z, manual: true };
    stepGame(state, input, 1 / 60);
    for (const item of state.events) eventTypes.add(item.type);
    if (state.huntZoneId === 'meadow-mushrooms') entered = true;
    if (entered && !choseCamp && state.cargo >= 4) {
      assert.equal(state.inCamp, false);
      assert.equal(state.progress.gold, 0);
      choseCamp = true;
    }
    if (choseCamp && state.inCamp && state.progress.totals.banked > 0) { banked = true; break; }
  }
  assert.equal(entered, true);
  assert.equal(choseCamp, true);
  assert.equal(banked, true);
  assert.equal(state.cargo, 0);
  assert.equal(state.progress.gold, state.progress.totals.banked);
  assert.equal(state.phase, 'playing');
  assert.equal(state.autoHunt, false);
  assert.ok(eventTypes.has('zone-enter'));
  assert.ok(eventTypes.has('pickup'));
  assert.ok(eventTypes.has('deposit'));
  assert.equal(eventTypes.has('skill'), false);
  assert.equal(eventTypes.has('dodge'), false);
});

test('automatic roots damage all enemy categories inside the impact circle', () => {
  const state = playing();
  const local = enemy(state, 0, 0);
  const foreign = enemy(state, 0.1, 0, { type: 'boar', zoneId: 'meadow-boars' });
  advance(state, 0.6);
  assert.equal(local.hp, 54);
  assert.equal(foreign.hp, 54);
});

test('leaving a hunting territory keeps its already committed automatic cast alive', () => {
  const state = playing();
  state.player.x = -6; state.player.z = 4;
  const target = enemy(state, -6, 4);
  stepGame(state, { manual: true });
  assert.equal(state.pendingSkills.length, 1);
  state.player.x = -6; state.player.z = 14;
  stepGame(state, { manual: true });
  advance(state, 0.6, { manual: true });
  assert.equal(state.huntZoneId, null);
  assert.equal(state.autoHunt, false);
  assert.equal(state.pendingSkills.length, 0);
  assert.equal(target.hp, 54);
});

test('outlying own-territory coins and enemies cannot pull local hunting across its boundary', () => {
  const state = playing();
  const zone = HUNT_ZONES.find(item => item.id === 'deep-casters');
  state.progress.questIndex = 4; state.progress.unlockedDeep = true;
  state.player.x = zone.x; state.player.z = zone.z;
  state.huntZoneId = zone.id; state.autoHunt = true;
  enemy(state, zone.x + 9, zone.z, { zoneId: zone.id, hp: 10000, maxHp: 10000 });
  state.loot.push({ id: 900, enemyType: zone.type, zoneId: zone.id, x: zone.x + 9, z: zone.z, value: 4, life: 30 });
  advance(state, 3);
  assert.equal(state.huntZoneId, zone.id);
  assert.equal(state.autoHunt, true);
  assert.equal(state.player.x, zone.x);
  assert.equal(state.player.z, zone.z);
  assert.equal(state.cargo, 0);
});

test('boundary loot is left in place until manual movement reaches it', () => {
  const state = playing(); const zone = HUNT_ZONES.find(item => item.id === 'meadow-mushrooms');
  state.player.x = zone.x; state.player.z = zone.z; state.autoHunt = true;
  state.loot.push({ id: 900, enemyType: zone.type, zoneId: zone.id, x: zone.x + zone.radius + 0.1, z: zone.z, value: 4, life: 30 });
  advance(state, 5);
  assert.equal(state.player.x, zone.x); assert.equal(state.player.z, zone.z);
  assert.equal(state.cargo, 0); assert.equal(state.loot.length, 1);
  advance(state, 1, { moveX: 1, manual: true });
  assert.equal(state.cargo, 4); assert.equal(state.loot.length, 0);
  const x = state.player.x;
  advance(state, 1); assert.equal(state.player.x, x);
});

test('a boar keeps its locked charge but returns home after finishing outside the territory', () => {
  const state = playing();
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-boars');
  state.player.x = zone.x; state.player.z = zone.z;
  state.huntZoneId = zone.id; state.progress.skills = { owl: 0, roots: 0 };
  const boar = enemy(state, zone.x + 3, zone.z, { type: 'boar', zoneId: zone.id, homeX: zone.x, homeZ: zone.z,
    speed: 1.65, phase: 'charge', phaseTime: 0.34, chargeTime: 0.34, length: 5.4,
    aimX: 1, aimZ: 0, warnX: zone.x + 3, warnZ: zone.z, attackCd: 1000 });
  advance(state, 0.2, { manual: true });
  assert.equal(boar.phase, 'charge');
  assert.deepEqual([boar.warnX, boar.warnZ, boar.aimX, boar.aimZ], [zone.x + 3, zone.z, 1, 0]);
  advance(state, 0.1, { manual: true });
  assert.equal(boar.phase, 'charge');
  advance(state, 0.1, { manual: true });
  assert.equal(boar.phase, 'return');
  advance(state, 3, { manual: true });
  assert.ok(Math.hypot(boar.x - zone.x, boar.z - zone.z) < zone.radius);
});

test('a retreating caster uses its physical home leash independently of hunting circles', () => {
  const state = playing();
  const zone = HUNT_ZONES.find(item => item.id === 'deep-casters');
  state.progress.questIndex = 4; state.progress.unlockedDeep = true;
  state.player.x = zone.x + 6; state.player.z = zone.z; state.huntZoneId = zone.id;
  state.progress.skills = { owl: 0, roots: 0 };
  const caster = enemy(state, zone.x + 6.9, zone.z, { type: 'caster', zoneId: zone.id, homeX: zone.x, homeZ: zone.z,
    hp: 37, maxHp: 68, phase: 'chase', speed: 1.76, attackCd: 1000 });
  let furthest = 0;
  for (let i = 0; i < 120; i++) {
    stepGame(state, { manual: true }, 1 / 60);
    furthest = Math.max(furthest, Math.hypot(caster.x - zone.x, caster.z - zone.z));
  }
  assert.ok(furthest > zone.radius);
  assert.ok(furthest < 7.1);
  assert.equal(caster.phase, 'return');
  assert.equal(caster.hp, 37);
});

test('stat offers show actual current and purchased values and no fictional next rank at cap', () => {
  const state = createGame(9, { xp: 60, gold: 1000 }); state.phase = 'playing';
  for (const id of ['attack', 'health', 'bag']) {
    const offer = getUpgradeOffer(state, id);
    assert.equal(buyUpgrade(state, id), true);
    const after = getUpgradeOffer(state, id);
    assert.equal(after.currentValue, offer.nextValue);
    assert.ok(after.currentValue > offer.currentValue);
    assert.ok(offer.unit.length > 0);
  }
  const capped = createGame(10, { xp: 10000, upgrades: { attack: 8, health: 6, bag: 6 } });
  for (const id of ['attack', 'health', 'bag']) {
    assert.equal(getUpgradeOffer(capped, id).maxed, true);
    assert.equal(getUpgradeOffer(capped, id).nextValue, null);
  }
});

test('a cleared boss leaves loot and the camp trip entirely to manual movement', () => {
  const state = createGame(11, { gold: 27, questIndex: 4, bosses: ['meadow-guardian'], totals: { banked: 9 } });
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-boss');
  state.phase = 'playing'; state.enemies = []; state.spawners = [];
  state.player.x = zone.x; state.player.z = zone.z; state.inCamp = false;
  state.huntZoneId = zone.id; state.autoHunt = true;
  state.loot.push({ id: 900, enemyType: zone.type, zoneId: zone.id, x: zone.x + 2, z: zone.z, value: 18, life: 30 });
  advance(state, 0.5);
  assert.equal(state.loot.length, 1); assert.equal(state.cargo, 0);
  assert.equal(state.player.x, zone.x); assert.equal(state.player.z, zone.z);
  advance(state, 0.2, { moveX: 1, manual: true });
  assert.equal(state.loot.length, 0); assert.equal(state.cargo, 18);
  const x = state.player.x, z = state.player.z;
  advance(state, 3);
  assert.equal(state.player.x, x); assert.equal(state.player.z, z);
  assert.equal(state.progress.gold, 27);
  for (let i = 0; i < 600; i++) stepGame(state, { moveX: WORLD.camp.x - state.player.x, moveZ: WORLD.camp.z - state.player.z, manual: true }, 1 / 60);
  assert.equal(state.inCamp, true); assert.equal(state.cargo, 0);
  assert.equal(state.progress.gold, 45); assert.equal(state.progress.totals.banked, 27);
  assert.equal(state.progress.totals.kills, 0); assert.equal(state.progress.xp, 0);
  assert.equal(state.progress.questIndex, 4);
  advance(state, 1); assert.equal(state.progress.gold, 45);
});

test('low health and a full bag do not disable local combat or learned automatic skills', () => {
  const state = playing();
  state.player.x = -6; state.player.z = 4; state.player.hp = 20;
  state.cargo = state.player.capacity; state.autoHunt = true;
  const target = enemy(state, -6, 3);
  advance(state, 0.6);
  assert.equal(target.hp, 54);
  assert.ok(state.effects.some(effect => effect.type === 'root-burst'));
  assert.equal(state.player.hp, 20);
  assert.equal(state.cargo, state.player.capacity);
  assert.equal(state.inCamp, false);
  assert.equal(state.huntZoneId, 'meadow-mushrooms');
  assert.equal(state.autoHunt, true);
  assert.equal(state.progress.gold, 0);
});

test('camp healing and cargo banking require the player to physically enter the camp', () => {
  const state = playing();
  state.player.x = -6; state.player.z = 4; state.player.hp = 20;
  state.cargo = 12; state.autoHunt = true;
  advance(state, 2);
  assert.equal(state.player.x, -6);
  assert.equal(state.player.z, 4);
  assert.equal(state.player.hp, 20);
  assert.equal(state.cargo, 12);
  assert.equal(state.progress.gold, 0);
  for (let i = 0; i < 600; i++) stepGame(state, {
    moveX: WORLD.camp.x - state.player.x, moveZ: WORLD.camp.z - state.player.z, manual: true,
  }, 1 / 60);
  assert.equal(state.inCamp, true);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.cargo, 0);
  assert.equal(state.progress.gold, 12);
  assert.equal(state.progress.totals.banked, 12);
  advance(state, 1);
  assert.equal(state.progress.gold, 12);
});

test('each web archetype spawns with its configured durability, danger, movement and rewards', () => {
  const state = createGame(31, { questIndex: 4 });
  const cases = [
    ['meadow-mushrooms', 48, 2, 0.88, 2, 2],
    ['meadow-boars', 228, 8, 1.76, 8, 22],
    ['deep-boars', 228, 8, 1.76, 8, 22],
    ['deep-casters', 68, 4, 1.76, 6, 18],
    ['meadow-boss', 252, 12, 2.64, 20, 42],
    ['deep-boss', 1024, 36, 2.64, 200, 188],
  ];
  for (const [zoneId, hp, damage, speed, xp, loot] of cases) {
    const members = state.enemies.filter(item => item.zoneId === zoneId);
    assert.ok(members.length > 0);
    for (const actor of members) assert.deepEqual([actor.hp, actor.maxHp, actor.damage, actor.speed, actor.xp, actor.loot], [hp, hp, damage, speed, xp, loot]);
  }
  assert.equal(Object.isFrozen(MONSTER_STATS), true);
  assert.equal(Object.isFrozen(MONSTER_STATS.deepBoss), true);
  assert.equal(state.player.hp, 100);
  assert.equal(state.player.attackDamage, 16);
});

test('actual boss drops last ten minutes for manual trips while normal drops last three', () => {
  for (const [zoneId, lifetime, value, xp] of [['meadow-mushrooms', 180, 2, 2], ['meadow-boss', 600, 42, 20], ['deep-boss', 600, 188, 200]]) {
    const state = createGame(32, { questIndex: 4 }); state.phase = 'playing';
    const target = state.enemies.find(item => item.zoneId === zoneId);
    state.enemies = [target]; state.spawners = state.spawners.filter(item => item.id === target.spawnId);
    state.player.x = target.x; state.player.z = target.z; state.player.attackCd = 999;
    state.projectiles.push({ id: 900, zoneId, x: target.x, z: target.z, dx: 0, dz: 0, team: 'player', damage: 2000, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
    stepGame(state, { manual: true });
    assert.equal(state.loot.length, 1);
    assert.equal(state.loot[0].life, lifetime);
    assert.equal(state.loot[0].value, value);
    assert.equal(state.progress.xp, xp);
    assert.equal(state.phase, 'playing');
    assert.equal(state.inCamp, false);
    assert.equal('returning' in state, false);
  }
});

test('boar and caster territory corrections preserve damage until the hunter actually leaves', () => {
  for (const [zoneId, type, maxHp] of [['meadow-boars', 'boar', 228], ['deep-casters', 'caster', 68]]) {
    const state = playing();
    const zone = HUNT_ZONES.find(item => item.id === zoneId);
    state.progress.questIndex = 4; state.progress.unlockedDeep = true;
    state.progress.skills = { owl: 0, roots: 0 };
    state.player.x = zone.x; state.player.z = zone.z; state.huntZoneId = zoneId;
    const target = enemy(state, zone.x + 7.1, zone.z, { zoneId, type, hp: 37, maxHp,
      homeX: zone.x, homeZ: zone.z, phase: 'recovery', phaseTime: 0.5, speed: 1.76, damage: 0, attackCd: 1000 });
    stepGame(state, { manual: true });
    assert.equal(target.phase, 'return');
    assert.equal(target.restoreOnReturn, false);
    advance(state, 3, { manual: true });
    assert.equal(target.hp, 37);
    assert.equal(state.huntZoneId, zoneId);
    advance(state, 3, { moveX: -1, manual: true });
    advance(state, 3, { manual: true });
    assert.equal(target.hp, maxHp);
  }
});

test('leaving during a non-healing territory return upgrades it to an encounter reset', () => {
  const state = playing();
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-boars');
  state.progress.skills = { owl: 0, roots: 0 };
  state.player.x = zone.x; state.player.z = zone.z; state.huntZoneId = zone.id;
  const target = enemy(state, zone.x + 7.1, zone.z, { zoneId: zone.id, type: 'boar', hp: 40, maxHp: 228,
    homeX: zone.x, homeZ: zone.z, phase: 'recovery', speed: 1.76, damage: 0 });
  stepGame(state, { manual: true });
  assert.equal(target.restoreOnReturn, false);
  state.player.x = -14; state.player.z = 4;
  stepGame(state, { manual: true });
  assert.equal(target.restoreOnReturn, true);
  advance(state, 3, { manual: true });
  assert.equal(target.hp, 228);
});

test('basic attacks work while moving or standing outside all hunting circles', () => {
  for (const input of [{ manual: true }, { manual: true, moveZ: -1 }]) {
    const state = playing(); state.player.x = 14; state.player.z = 10;
    state.progress.skills = { owl: 0, roots: 0 }; state.player.attackCd = 0;
    const target = enemy(state, 12, 10, { zoneId: 'meadow-boars' });
    stepGame(state, input);
    assert.equal(state.huntZoneId, null);
    assert.equal(state.autoHunt, false);
    assert.equal(state.events.find(item => item.type === 'shoot').targetId, target.id);
    advance(state, 0.25, input);
    assert.equal(target.hp, 84);
    assert.equal(state.fightTargetId, target.id);
  }
});

test('an already fired bolt survives hunt changes and hits the closest foreign category', () => {
  const state = playing(); state.player.x = 0; state.player.z = 10;
  state.progress.skills = { owl: 0, roots: 0 }; state.player.attackCd = 0;
  const target = enemy(state, 3, 10, { type: 'caster', zoneId: 'deep-casters' });
  stepGame(state, { manual: true });
  assert.equal(state.projectiles.length, 1);
  state.projectiles[0].zoneId = 'former-hunt';
  state.player.x = -6; state.player.z = 4;
  advance(state, 0.3, { manual: true });
  assert.equal(state.huntZoneId, 'meadow-mushrooms');
  assert.equal(target.hp, 84);
  assert.equal(state.projectiles.length, 0);
});

test('physical coin pickup works outside hunting areas for every category', () => {
  const state = playing(); state.player.x = 14; state.player.z = 10;
  state.loot.push({ id: 900, x: 14, z: 10, value: 7, life: 30, zoneId: 'deep-boss', enemyType: 'boss' });
  stepGame(state, { manual: true });
  assert.equal(state.huntZoneId, null);
  assert.equal(state.cargo, 7);
  assert.equal(state.progress.gold, 0);
  assert.equal(state.loot.length, 0);
});

test('enemies aggro by proximity or fresh damage outside hunting areas', () => {
  const state = playing(); state.player.x = 14; state.player.z = 10;
  state.progress.skills = { owl: 0, roots: 0 };
  const near = enemy(state, 12, 10, { phase: 'idle', speed: 1, zoneId: 'meadow-boars' });
  const damaged = enemy(state, 7, 10, { phase: 'idle', hp: 70, maxHp: 100, speed: 1, zoneId: 'deep-casters' });
  stepGame(state, { manual: true });
  assert.equal(state.huntZoneId, null);
  assert.equal(near.phase, 'chase');
  assert.equal(damaged.phase, 'chase');
  assert.ok(near.x > 12);
  assert.equal(damaged.hp, 70);
});

test('learned automatic skills fight nearby enemies without any active hunt region', () => {
  const state = playing(); state.player.x = 14; state.player.z = 10;
  const target = enemy(state, 12, 10, { type: 'boar', zoneId: 'meadow-boars' });
  state.progress.skills = { owl: 0, roots: 0 };
  advance(state, 0.5, { manual: true });
  assert.equal(target.hp, 100);
  state.progress.skills = { owl: 0, roots: 1 };
  state.player.skillCd = 0;
  state.owl.x = state.player.x - 1.25; state.owl.z = state.player.z + 0.3;
  advance(state, 0.6, { manual: true });
  assert.equal(target.hp, 54);
  assert.ok(state.effects.some(effect => effect.type === 'root-burst'));
  assert.equal(state.huntZoneId, null);
  assert.equal(state.player.z, 10);
});

test('an outside-hunt owl stays world-bounded and never moves or shields the player', () => {
  const state = playing(); state.progress.questIndex = 4; state.progress.unlockedDeep = true;
  state.player.x = WORLD.maxX - state.player.radius; state.player.z = WORLD.minZ + state.player.radius;
  state.progress.skills = { owl: 1, roots: 0 };
  state.owl.x = state.player.x - 1.25; state.owl.z = state.player.z + 0.3;
  enemy(state, state.player.x - 2, state.player.z, { zoneId: 'deep-casters' });
  const x = state.player.x, z = state.player.z;
  advance(state, 0.3, { manual: true });
  assert.equal(state.huntZoneId, null);
  assert.equal(state.owl.active, true);
  assert.ok(state.owl.fireCd > 0);
  assert.equal(state.player.x, x); assert.equal(state.player.z, z);
  assert.equal(state.player.invuln, 0);
  assert.ok(state.owl.x >= WORLD.minX && state.owl.x <= WORLD.maxX);
  assert.ok(state.owl.z >= WORLD.minZ && state.owl.z <= WORLD.maxZ);
});

test('hunt approach and departure use padded proximity rather than a sharp circle boundary', () => {
  const state = playing(); const zone = HUNT_ZONES.find(item => item.id === 'meadow-mushrooms');
  state.huntZoneId = null; state.autoHunt = false; state.player.x = zone.x;
  state.player.z = zone.z + zone.radius + 2.05;
  stepGame(state, { manual: true }); assert.equal(state.huntZoneId, null);
  state.player.z = zone.z + zone.radius + 1.99;
  stepGame(state, { manual: true }); assert.equal(state.huntZoneId, zone.id);
  state.player.z = zone.z + zone.radius + 3.24;
  stepGame(state, { manual: true }); assert.equal(state.huntZoneId, zone.id);
  state.player.z = zone.z + zone.radius + 3.26;
  stepGame(state, { manual: true }); assert.equal(state.huntZoneId, null);
});

test('overlapping hunt approaches choose the nearest anchor edge with a stable tie', () => {
  for (const z of [-3.2, -2.85]) {
    const state = playing(); state.huntZoneId = null; state.autoHunt = false;
    state.player.x = -6; state.player.z = z;
    stepGame(state, { manual: true });
    assert.equal(state.huntZoneId, 'meadow-boss');
  }
});

test('fresh in-range damage reengages a returning enemy instead of silently healing it away', () => {
  const state = playing(); state.player.x = 8.2; state.player.z = -3;
  state.progress.skills = { owl: 0, roots: 0 };
  const target = enemy(state, 8, -3, { type: 'boar', zoneId: 'meadow-boars', homeX: 6, homeZ: -3,
    hp: 50, maxHp: 228, phase: 'return', restoreOnReturn: true, speed: 1.76 });
  state.projectiles.push({ id: 900, x: 8, z: -3, dx: 0, dz: 0, team: 'player', damage: 10, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(target.hp, 40);
  assert.equal(target.restoreOnReturn, false);
  advance(state, 1, { manual: true });
  assert.equal(target.hp, 40);
  assert.notEqual(target.phase, 'return');
});

test('fight target reflects actual staff range after kills and is never persisted', () => {
  const state = playing(); state.player.x = 14; state.player.z = 10;
  state.progress.skills = { owl: 0, roots: 0 };
  const target = enemy(state, 12, 10, { hp: 1, zoneId: 'meadow-boars' });
  stepGame(state, { manual: true });
  assert.equal(state.fightTargetId, target.id);
  state.player.attackCd = 0;
  advance(state, 0.3, { manual: true });
  assert.equal(state.enemies.length, 0);
  assert.equal(state.fightTargetId, null);
  assert.equal('fightTargetId' in exportProgress(state), false);
  const far = enemy(state, 9.5, 10);
  stepGame(state, { manual: true }); assert.equal(state.fightTargetId, null);
  far.x = 9.7;
  stepGame(state, { manual: true }); assert.equal(state.fightTargetId, far.id);
  state.player.x = 0; state.player.z = 16;
  far.x = 1; far.z = 16;
  stepGame(state, { manual: true }); assert.equal(state.fightTargetId, null);
  assert.equal(state.projectiles.length, 0);
});

function owlField(rank = 1) {
  const state = playing();
  state.progress.skills = { owl: rank, roots: 0 };
  state.player.x = 0; state.player.z = 10;
  state.owl.x = -1.25; state.owl.z = 10.3; state.owl.fireCd = 0;
  state.huntZoneId = null; state.autoHunt = false;
  return state;
}

test('v3 learned movement ranks become an owl without losing purchases or existing progress', () => {
  for (const rank of [1, 2, 3]) {
    const old = { version: 3, gold: 73, cargo: 33, xp: 720, upgrades: { attack: 2, health: 1, bag: 2 },
      skills: { dodge: rank, roots: 2 }, questIndex: 4, totals: { kills: 31, mushrooms: 20, deepKills: 2, banked: 89 }, bosses: ['meadow-guardian'] };
    const migrated = normalizeProgress(old);
    assert.equal(migrated.version, 4);
    assert.deepEqual(migrated.skills, { owl: rank, roots: 2 });
    for (const key of ['gold', 'cargo', 'xp', 'questIndex']) assert.equal(migrated[key], old[key]);
    for (const key of ['upgrades', 'totals', 'bosses']) assert.deepEqual(migrated[key], old[key]);
    assert.deepEqual(normalizeProgress(migrated), migrated);
    assert.equal('dodge' in migrated.skills, false);
  }
  assert.equal(normalizeProgress({ skills: { owl: 0, dodge: 3 } }).skills.owl, 0);
  assert.equal(normalizeProgress({ skills: { owl: 1, dodge: 3 } }).skills.owl, 1);
});

test('owl ranks retain their level gates and purchase prices and expose rounded damage offers', () => {
  for (const [rank, xp, cost, requiredLevel, interval] of [[0, 20, 20, 2, 1.6], [1, 200, 37, 5, 1.4], [2, 560, 54, 8, 1.2]]) {
    const state = createGame(1, { xp, gold: 100, upgrades: { attack: 1 }, skills: { owl: rank } }); state.phase = 'playing';
    const before = getSkillOffer(state, 'owl');
    assert.equal(before.name, '숲의 부엉이');
    assert.equal(before.cost, cost); assert.equal(before.requiredLevel, requiredLevel);
    assert.equal(learnSkill(state, 'owl'), true);
    assert.equal(state.progress.gold, 100 - cost);
    const after = getSkillOffer(state, 'owl');
    assert.equal(after.currentInterval, interval);
    assert.equal(after.currentDamage, Math.round(state.owl.damage));
    if (rank === 2) { assert.equal(after.nextInterval, null); assert.equal(after.nextDamage, null); }
  }
});

test('there is exactly one learned companion that follows smoothly and stays beside the left wall', () => {
  const state = owlField(); const companion = state.owl;
  state.player.x = 5; state.player.z = 5;
  stepGame(state, { manual: true });
  assert.ok(state.owl.x > -1.25 && state.owl.x < state.player.x - 1.25);
  advance(state, 1, { moveX: 1, manual: true });
  advance(state, 1, { manual: true });
  assert.equal(state.owl, companion);
  assert.equal(state.owl.active, true);
  assert.ok(Math.abs(state.owl.x - (state.player.x - 1.25)) < 0.01);
  assert.ok(Math.abs(state.owl.z - (state.player.z + 0.3)) < 0.01);
  state.player.x = WORLD.minX + state.player.radius;
  advance(state, 2, { manual: true });
  assert.ok(state.owl.x > state.player.x + 1);
  assert.ok(Math.hypot(state.owl.x - state.player.x, state.owl.z - state.player.z) > 1);
  assert.ok(state.owl.x >= WORLD.minX && state.owl.x <= WORLD.maxX);
  assert.ok(state.owl.z >= WORLD.minZ && state.owl.z <= WORLD.maxZ);
  assert.equal(state.owl, companion);
  assert.equal('owl' in exportProgress(state), false);
});

test('an unlearned owl never fires and a learned owl remains idle in camp', () => {
  const unlearned = owlField(0); const target = enemy(unlearned, 2, 10.3, { hp: 1000, maxHp: 1000 });
  advance(unlearned, 2, { manual: true });
  assert.equal(unlearned.owl.active, false);
  assert.equal(unlearned.projectiles.length, 0);
  assert.equal(target.hp, 1000);
  const camp = createGame(1, { xp: 20, skills: { owl: 1 } }); camp.phase = 'playing'; camp.player.attackCd = 999;
  enemy(camp, 1, 16, { phase: 'idle' });
  advance(camp, 2, { manual: true });
  assert.equal(camp.owl.active, true);
  assert.equal(camp.owl.targetId, null);
  assert.equal(camp.projectiles.length, 0);
});

test('owl targeting measures range from the companion and launches from its actual position', () => {
  const state = owlField();
  const target = enemy(state, -6.3, 10.3, { hp: 1000, maxHp: 1000, zoneId: 'deep-casters' });
  assert.ok(Math.hypot(target.x - state.player.x, target.z - state.player.z) > 5.5);
  stepGame(state, { manual: true });
  const shot = state.events.find(item => item.type === 'owl-shoot');
  const bolt = state.projectiles.find(item => item.source === 'owl');
  assert.equal(shot.targetId, target.id);
  assert.equal(shot.x, state.owl.x); assert.equal(shot.z, state.owl.z);
  assert.equal(bolt.targetId, target.id);
  assert.equal(bolt.team, 'player'); assert.equal(bolt.life, 2 - 1 / 60);
  assert.equal(state.huntZoneId, null);
});

test('owl missiles steer toward a moving locked target with bounded turn and continuous travel', () => {
  const state = owlField();
  const target = enemy(state, 2, 10.3, { hp: 1000, maxHp: 1000 });
  stepGame(state, { manual: true });
  const bolt = state.projectiles.find(item => item.source === 'owl');
  const previous = { x: bolt.x, z: bolt.z, dx: bolt.dx, dz: bolt.dz };
  target.z = 11.4;
  stepGame(state, { manual: true }, 0.05);
  const turn = Math.acos(Math.max(-1, Math.min(1, (bolt.dx * previous.dx + bolt.dz * previous.dz) / 64)));
  assert.ok(turn > 0 && turn <= 6 * 0.05 + 1e-8);
  assert.ok(bolt.dz > 0);
  assert.ok(Math.abs(Math.hypot(bolt.dx, bolt.dz) - 8) < 1e-8);
  assert.ok(Math.abs(Math.hypot(bolt.x - previous.x, bolt.z - previous.z) - 8 * 0.05) < 1e-8);
  for (let i = 0; i < 60 && state.projectiles.includes(bolt); i++) {
    target.z += 0.002;
    stepGame(state, { manual: true });
    assert.ok([bolt.x, bolt.z, bolt.dx, bolt.dz].every(Number.isFinite));
    assert.equal(bolt.targetId, target.id);
  }
  assert.equal(target.hp, 990);
  assert.equal(state.projectiles.includes(bolt), false);
});

test('an owl missile never retargets after its target dies and expires at its finite lifetime', () => {
  const state = owlField(); const target = enemy(state, 3, 10.3);
  stepGame(state, { manual: true });
  const bolt = state.projectiles.find(item => item.source === 'owl');
  const dx = bolt.dx, dz = bolt.dz;
  target.hp = 0;
  const other = enemy(state, -2, 12, { hp: 1000, maxHp: 1000 });
  state.owl.fireCd = 99;
  advance(state, 0.3, { manual: true });
  assert.equal(bolt.targetId, target.id);
  assert.equal(bolt.dx, dx); assert.equal(bolt.dz, dz);
  assert.equal(other.hp, 1000);
  advance(state, 2, { manual: true });
  assert.equal(state.projectiles.includes(bolt), false);
  assert.ok(bolt.life <= 0);
});

test('owl damage is a firing snapshot and its missile hits only the first swept collider', () => {
  const state = owlField(); const target = enemy(state, 3.5, 10.3, { hp: 1000, maxHp: 1000 });
  stepGame(state, { manual: true });
  const bolt = state.projectiles.find(item => item.source === 'owl');
  assert.equal(bolt.damage, 10);
  state.player.damageMult = 3;
  advance(state, 0.8, { manual: true });
  assert.equal(state.owl.damage, 30);
  assert.equal(target.hp, 990);
  const blocked = owlField(); const far = enemy(blocked, 3, 10.3);
  stepGame(blocked, { manual: true });
  const missile = blocked.projectiles.find(item => item.source === 'owl');
  const near = enemy(blocked, -0.5, 10.3, { type: 'caster', zoneId: 'deep-casters' });
  stepGame(blocked, { manual: true }, 0.05);
  assert.equal(near.hp, 90); assert.equal(far.hp, 100);
  assert.equal(blocked.projectiles.includes(missile), false);
  advance(blocked, 0.2, { manual: true });
  assert.equal(near.hp, 90);
});

test('pause freezes the owl and its missiles; death clears them and recovery restores one idle companion', () => {
  const state = owlField(); enemy(state, 3, 10.3, { hp: 1000, maxHp: 1000 });
  stepGame(state, { manual: true });
  const companion = state.owl;
  setPaused(state, true);
  const snapshot = structuredClone({ owl: state.owl, projectiles: state.projectiles });
  advance(state, 1, { moveX: 1, manual: true });
  assert.deepEqual({ owl: state.owl, projectiles: state.projectiles }, snapshot);
  setPaused(state, false);
  state.projectiles.push({ id: 900, x: state.player.x, z: state.player.z, dx: 0, dz: 0, team: 'enemy', damage: 999, life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(state.phase, 'down'); assert.equal(state.owl.active, false);
  assert.equal(state.projectiles.length, 0);
  assert.equal(respawnAtCamp(state), true);
  assert.equal(state.owl, companion); assert.equal(state.owl.active, true);
  assert.equal(state.owl.x, WORLD.camp.x - 1.25); assert.equal(state.owl.z, WORLD.camp.z + 0.3);
  advance(state, 0.2, { manual: true });
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.progress.skills.owl, 1);
});

test('companion fire respects the shared projectile cap and resumes when a slot is available', () => {
  const state = owlField(); enemy(state, 2, 10.3, { hp: 1000, maxHp: 1000 });
  for (let i = 0; i < RULES.maxProjectiles; i++) state.projectiles.push({ id: 1000 + i, x: 0, z: -40, dx: 0, dz: 0, team: 'player', damage: 0, life: 100, radius: 0.1, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(state.projectiles.length, RULES.maxProjectiles);
  assert.equal(state.events.some(item => item.type === 'owl-shoot'), false);
  state.projectiles.pop();
  stepGame(state, { manual: true });
  assert.equal(state.projectiles.length, RULES.maxProjectiles);
  assert.equal(state.projectiles.filter(item => item.source === 'owl').length, 1);
  assert.equal(state.events.some(item => item.type === 'owl-shoot'), true);
});

test('ranged combat holds position despite closer loot and a farther local pursuit target', () => {
  for (const foreign of [false, true]) {
    const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
    state.progress.skills = { owl: 0, roots: 0 }; state.player.attackCd = 0;
    const target = enemy(state, -6, 0.3, { hp: 10000, maxHp: 10000,
      type: foreign ? 'caster' : 'mushroom', zoneId: foreign ? 'deep-casters' : state.huntZoneId });
    enemy(state, -1.2, 4, { hp: 10000, maxHp: 10000 });
    state.loot.push({ id: 900, x: -3, z: 4, value: 8, life: 30, zoneId: state.huntZoneId, enemyType: 'mushroom' });
    advance(state, 2);
    assert.equal(state.player.x, -6); assert.equal(state.player.z, 4);
    assert.ok(target.hp < 10000); assert.equal(state.fightTargetId, target.id);
    assert.equal(state.cargo, 0); assert.equal(state.loot[0].value, 8);
  }
});

test('local pursuit stops around full staff range and maximum-step penetration stays bounded', () => {
  for (const dt of [1 / 60, RULES.maxStep]) {
    const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
    state.progress.skills = { owl: 0, roots: 0 }; state.player.attackCd = 0;
    const target = enemy(state, -6 + RULES.attackRange + 0.01, 4, { hp: 10000, maxHp: 10000 });
    stepGame(state, {}, dt);
    const separation = Math.hypot(target.x - state.player.x, target.z - state.player.z);
    assert.ok(separation <= RULES.attackRange);
    assert.ok(separation >= RULES.attackRange - RULES.playerSpeed * dt - 1e-9);
    assert.equal(state.events.find(item => item.type === 'shoot').targetId, target.id);
    const x = state.player.x;
    advance(state, 1);
    assert.equal(state.player.x, x);
    assert.equal(state.player.z, 4);
  }
});

test('the inclusive staff-range boundary agrees with automatic stop and target reporting', () => {
  const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
  state.progress.skills = { owl: 0, roots: 0 }; state.player.attackCd = 0;
  const target = enemy(state, -6 + RULES.attackRange, 4, { hp: 10000, maxHp: 10000 });
  stepGame(state);
  assert.equal(state.player.x, -6);
  assert.equal(state.fightTargetId, target.id);
  assert.equal(state.events.find(item => item.type === 'shoot').targetId, target.id);
});

test('manual input remains authoritative in combat and a held zero stick blocks automatic pursuit', () => {
  const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
  state.progress.skills = { owl: 0, roots: 0 };
  const target = enemy(state, -6, 0.3, { hp: 10000, maxHp: 10000 });
  advance(state, 0.25, { moveX: 1, manual: true });
  assert.ok(Math.abs(state.player.x - (-6 + RULES.playerSpeed * 0.25)) < 1e-8);
  target.x = state.player.x + 4.8; target.z = state.player.z;
  const x = state.player.x;
  advance(state, 0.3, { manual: true });
  assert.equal(state.player.x, x);
});

test('idle hunting never recenters the player merely because they stand near a region edge', () => {
  const state = playing(); const zone = HUNT_ZONES.find(item => item.id === 'meadow-mushrooms');
  state.player.x = zone.x + zone.radius + 1; state.player.z = zone.z; state.autoHunt = true;
  state.loot.push({ id: 900, x: zone.x, z: zone.z, value: 8, life: 30 });
  const x = state.player.x, z = state.player.z;
  advance(state, 2);
  assert.equal(state.player.x, x); assert.equal(state.player.z, z);
  assert.equal(state.huntZoneId, zone.id);
  assert.equal(state.cargo, 0);
});

test('learned roots and the owl keep attacking while the player holds ranged distance', () => {
  const state = playing(); state.player.x = -6; state.player.z = 4; state.autoHunt = true;
  state.progress.skills = { owl: 1, roots: 1 };
  state.owl.x = -7.25; state.owl.z = 4.3; state.player.attackCd = 0;
  const target = enemy(state, -6, 0.3, { hp: 10000, maxHp: 10000 });
  let roots = false, owl = false;
  for (let i = 0; i < 120; i++) {
    stepGame(state);
    roots ||= state.events.some(item => item.type === 'burst');
    owl ||= state.events.some(item => item.type === 'owl-shoot');
    assert.equal(state.player.x, -6); assert.equal(state.player.z, 4);
  }
  assert.equal(roots, true); assert.equal(owl, true);
  assert.ok(target.hp < 10000 - state.player.skillDamage);
});
