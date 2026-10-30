import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, setPaused, normalizeProgress, exportProgress, respawnAtCamp,
  STAGES, WORLD, RULES, HUNT_ZONES, MONSTER_STATS, isStageUnlocked, isZoneUnlocked, getUnlockedMinZ, getStage, getCamp, getQuest, claimQuest } from '../rules.mjs';

function advance(state, seconds, input = { manual: true }) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepGame(state, input, 1 / 60);
}
function isolated(progress = {}) {
  const state = createGame(7091, progress); state.phase = 'playing';
  state.enemies = []; state.spawners = []; state.player.attackCd = 999;
  return state;
}
function kill(state, type, stageId, options = {}) {
  const zone = HUNT_ZONES.find(item => item.stageId === stageId && item.type === type);
  const data = MONSTER_STATS[type];
  const enemy = { ...data, id: state.nextId++, type, stageId, zoneId: zone.id, trait: zone.trait,
    x: zone.x, z: zone.z, homeX: zone.x, homeZ: zone.z, hp: 1, maxHp: 1, speed: 0,
    phase: 'stunned', phaseTime: 999, attackCd: 999, ...options };
  state.enemies.push(enemy);
  state.projectiles.push({ id: state.nextId++, x: enemy.x, z: enemy.z, dx: 0, dz: 0, team: 'player', source: 'staff', damage: 9999,
    life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(state.enemies.some(item => item.id === enemy.id), false);
  return enemy;
}

test('v5 completion extends naturally into new quests while all owned progress is preserved in v8', () => {
  const old = { version: 5, gold: 247, cargo: 17, xp: 560, questIndex: 6,
    upgrades: { attack: 2, health: 1, bag: 1 }, skills: { owl: 2, roots: 1 },
    gear: { equipped: 'moon', scrolls: 12, items: { sprout: { copies: 1, level: 2, tier: 1 }, moon: { copies: 2, level: 3, tier: 1 } } },
    totals: { kills: 90, mushrooms: 50, deepKills: 20, banked: 160 }, bosses: ['meadow-guardian', 'deep-guardian'] };
  const progress = normalizeProgress(old), state = createGame(7092, old);
  assert.equal(progress.version, 8); assert.equal(progress.checkpoint, 'meadow');
  assert.deepEqual(progress.forms, { wolf: 0, bear: 0, dragon: 0 });
  for (const key of ['gold', 'cargo', 'xp', 'questIndex', 'upgrades', 'skills', 'bosses']) assert.deepEqual(progress[key], old[key]);
  for (const [key, value] of Object.entries(old.totals)) assert.equal(progress.totals[key], value);
  assert.equal(progress.gear.equipped, 'moon'); assert.equal(progress.gear.items.moon.level, 3);
  assert.equal(progress.gear.items.moon.copies, 2); assert.equal(progress.gear.scrolls, 12);
  assert.equal(getQuest(state).id, 'ancient-runners'); assert.equal(getQuest(state).complete, false);
  assert.equal(getQuest(state).zoneId, 'ancient-runners');
  assert.deepEqual(exportProgress(createGame(7093, exportProgress(state))), exportProgress(state));
});

test('stage gates independently require quest rewards and level while movement respects the unlocked frontier', () => {
  const cases = [
    [3, 0, -14, 16], [0, 120, -14, 20], [4, 0, -42, 29], [4, 120, -42, 33], [6, 420, -42, 33],
    [6, 560, -70, 52], [8, 1320, -70, 52], [9, 1100, -70, 52], [9, 1320, -98, 65],
  ];
  for (const [questIndex, xp, minZ, count] of cases) {
    const state = createGame(7094, { questIndex, xp }); state.phase = 'playing';
    assert.equal(getUnlockedMinZ(state.progress), minZ); assert.equal(state.enemies.length, count);
    assert.equal(isStageUnlocked(state.progress, 'ancient'), minZ <= -70);
    assert.equal(isStageUnlocked(state.progress, 'sky'), minZ === -98);
    state.enemies = []; state.spawners = []; state.player.x = 0; state.player.z = minZ + 0.8;
    advance(state, 0.5, { moveZ: -1, manual: true });
    assert.equal(state.player.z, minZ + state.player.radius);
    assert.ok(state.player.z >= WORLD.minZ + state.player.radius);
  }
  assert.equal(isStageUnlocked(normalizeProgress(), 'unknown'), false);
});

test('every unlocked region contains its intended bounded species and trait populations', () => {
  const state = createGame(7095, { xp: 1320, questIndex: 9 });
  assert.equal(state.enemies.length, 65); assert.ok(state.enemies.length < RULES.maxEnemies);
  assert.deepEqual(STAGES.map(stage => [stage.id, stage.minZ, stage.maxZ]),
    [['meadow', -14, 23], ['deep', -42, -14], ['ancient', -70, -42], ['sky', -98, -70]]);
  for (const zone of HUNT_ZONES) {
    const members = state.enemies.filter(enemy => enemy.zoneId === zone.id);
    assert.equal(members.length, zone.count);
    for (const enemy of members) {
      assert.equal(enemy.type, zone.type); assert.equal(enemy.trait, zone.trait); assert.equal(enemy.stageId, zone.stageId);
      assert.ok(Math.hypot(enemy.x - zone.x, enemy.z - zone.z) < zone.radius);
      assert.ok(enemy.x >= WORLD.minX + enemy.radius && enemy.x <= WORLD.maxX - enemy.radius);
      assert.ok(enemy.z >= WORLD.minZ + enemy.radius && enemy.z <= WORLD.maxZ - enemy.radius);
    }
  }
  assert.equal(state.enemies.filter(enemy => enemy.trait === 'swarm').length, 12);
  assert.equal(state.enemies.filter(enemy => enemy.trait === 'fast').length, 16);
  assert.equal(state.enemies.filter(enemy => enemy.trait === 'airborne').length, 7);
  const skyRunner = state.enemies.find(enemy => enemy.zoneId === 'sky-runners');
  assert.deepEqual([skyRunner.hp, skyRunner.damage, skyRunner.level, skyRunner.speed], [320, 14, 13, 4.9]);
  const skyBoss = state.enemies.find(enemy => enemy.bossId === 'sky-guardian');
  assert.deepEqual([skyBoss.hp, skyBoss.damage, skyBoss.xp, skyBoss.variant], [2600, 26, 400, 'sky']);
});

test('physically entering any unlocked camp banks cargo and saves that camp for reload and death recovery', () => {
  for (const stage of STAGES) {
    const state = isolated({ xp: 1320, questIndex: 9 });
    state.player.x = stage.camp.x; state.player.z = stage.camp.z + stage.camp.radius + 0.3;
    state.player.hp -= 20; state.cargo = state.progress.cargo = 7; state.inCamp = false;
    const hp = state.player.hp;
    stepGame(state, { manual: true });
    assert.equal(state.inCamp, false); assert.equal(state.cargo, 7); assert.equal(state.progress.checkpoint, 'meadow');
    assert.equal(getCamp(state).stageId, stage.id);
    advance(state, 0.2, { moveZ: -1, manual: true });
    assert.equal(state.inCamp, true); assert.equal(state.cargo, 0); assert.equal(state.progress.gold, 7);
    assert.equal(state.progress.checkpoint, stage.id); assert.ok(state.player.hp > hp);
    const restored = createGame(7096, exportProgress(state));
    assert.equal(restored.player.x, stage.camp.x); assert.equal(restored.player.z, stage.camp.z);
    assert.equal(restored.inCamp, true); assert.equal(restored.player.form, 'druid');
    state.player.x = stage.camp.x + stage.camp.radius + 3; state.player.z = stage.camp.z; state.inCamp = false;
    state.player.hp = 1; state.cargo = state.progress.cargo = 9;
    state.projectiles.push({ id: state.nextId++, x: state.player.x, z: state.player.z, dx: 0, dz: 0, team: 'enemy', damage: 2,
      life: 1, radius: 0.2, hitIds: [], pierce: 0 });
    stepGame(state, { manual: true }); assert.equal(state.phase, 'down');
    assert.equal(respawnAtCamp(state), true); assert.equal(state.cargo, 9);
    assert.deepEqual([state.player.x, state.player.z], [stage.camp.x, stage.camp.z]);
    stepGame(state, { manual: true }); assert.equal(state.cargo, 0); assert.equal(state.progress.gold, 16);
    stepGame(state, { manual: true }); assert.equal(state.progress.gold, 16);
  }
});

test('checkpoint validation rejects locked regions and saved transient form data', () => {
  const locked = normalizeProgress({ xp: 560, questIndex: 6, checkpoint: 'sky', forms: { wolf: 99, bear: -2, dragon: '2', phoenix: 3 }, player: { form: 'dragon' } });
  assert.equal(locked.checkpoint, 'meadow'); assert.deepEqual(locked.forms, { wolf: 99, bear: 0, dragon: 0 });
  const valid = createGame(7097, { xp: 560, questIndex: 6, checkpoint: 'ancient', forms: { wolf: 1 } });
  assert.equal(getStage(valid).id, 'ancient'); assert.equal(valid.player.form, 'druid'); assert.equal(valid.player.formRank, 0);
  assert.equal(valid.player.z, -44); assert.equal(exportProgress(valid).checkpoint, 'ancient');
  const noDeep = isolated({ questIndex: 3 }); noDeep.player.z = -40;
  assert.equal(getCamp(noDeep).stageId, 'meadow');
});

test('new hunt objectives count actual regional kills and reward each quest once before opening the sky', () => {
  const state = isolated({ xp: 560, questIndex: 6 });
  for (let i = 0; i < 6; i++) kill(state, 'runner', 'ancient');
  assert.equal(getQuest(state).current, 6); assert.equal(getQuest(state).zoneId, 'ancient-runners');
  assert.equal(claimQuest(state), true); assert.equal(claimQuest(state), false);
  for (let i = 0; i < 12; i++) kill(state, 'swarm', 'ancient');
  assert.equal(getQuest(state).current, 12); assert.equal(claimQuest(state), true);
  kill(state, 'boss', 'ancient', { bossId: 'ancient-guardian', xp: 260, loot: 220 });
  assert.equal(getQuest(state).zoneId, 'ancient-boss'); assert.equal(claimQuest(state), true);
  assert.equal(isStageUnlocked(state.progress, 'sky'), false);
  kill(state, 'boss', 'ancient', { bossId: 'ancient-guardian', xp: 260, loot: 220 });
  kill(state, 'boss', 'ancient', { bossId: 'ancient-guardian', xp: 260, loot: 220 });
  assert.equal(isStageUnlocked(state.progress, 'sky'), true); assert.equal(getQuest(state).id, 'sky-flyers');
  for (let i = 0; i < 6; i++) kill(state, 'flyer', 'sky');
  assert.equal(getQuest(state).current, 6); assert.equal(claimQuest(state), true);
  kill(state, 'boss', 'sky', { bossId: 'sky-guardian', xp: 400, loot: 320 });
  assert.equal(getQuest(state).zoneId, 'sky-boss'); assert.equal(claimQuest(state), true);
  assert.equal(getQuest(state).done, true); assert.equal(claimQuest(state), false);
  assert.equal(state.progress.gold, 710);
  assert.deepEqual(state.progress.bosses, ['ancient-guardian', 'sky-guardian']);
  assert.deepEqual([state.progress.totals.ancientRunners, state.progress.totals.swarms, state.progress.totals.flyers,
    state.progress.totals.ancientKills, state.progress.totals.skyKills], [6, 12, 6, 18, 6]);
});

test('both later bosses repeat on the same sixty-second active timer without duplicate live actors', () => {
  for (const zoneId of ['ancient-boss', 'sky-boss']) {
    const state = createGame(7098, { xp: 1320, questIndex: 9, bosses: ['ancient-guardian', 'sky-guardian'] }); state.phase = 'playing';
    const target = state.enemies.find(enemy => enemy.zoneId === zoneId);
    state.enemies = [target]; state.spawners = state.spawners.filter(spawn => spawn.id === target.spawnId);
    state.projectiles.push({ id: state.nextId++, x: target.x, z: target.z, dx: 0, dz: 0, team: 'player', damage: 9999,
      life: 1, radius: 0.2, hitIds: [], pierce: 0 });
    stepGame(state, { manual: true }); assert.equal(state.spawners[0].remaining, 60);
    advance(state, 59.8); assert.equal(state.enemies.length, 0);
    setPaused(state, true); const remaining = state.spawners[0].remaining;
    advance(state, 2); assert.equal(state.spawners[0].remaining, remaining);
    setPaused(state, false); advance(state, 0.25);
    assert.equal(state.enemies.length, 1); assert.equal(state.enemies[0].spawnId, target.spawnId);
    advance(state, 2); assert.equal(state.enemies.length, 1);
    assert.equal(state.enemies[0].variant, target.variant);
  }
});

test('legacy deep hunt metadata points to the nearest actual deep hunting cluster', () => {
  const state = isolated({ questIndex: 4 }); state.player.x = -7; state.player.z = -24;
  assert.equal(getQuest(state).zoneId, 'deep-boars');
  state.player.x = 6; state.player.z = -27; assert.equal(getQuest(state).zoneId, 'deep-casters');
});

test('the optional meadow runners spawn on the exact level-four gain frame without opening a stage or quest', () => {
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-runners');
  for (const xp of [0, 20, 60, 118]) {
    const novice = createGame(7100, { xp, questIndex: 0 });
    assert.equal(isZoneUnlocked(novice.progress, zone), false);
    assert.equal(novice.enemies.some(enemy => enemy.zoneId === zone.id), false);
  }
  const state = createGame(7100, { xp: 118, questIndex: 0 }); state.phase = 'playing';
  const mushroom = state.enemies.find(enemy => enemy.type === 'mushroom');
  state.projectiles.push({ id: state.nextId++, x: mushroom.x, z: mushroom.z, dx: 0, dz: 0, team: 'player', damage: 9999,
    life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(state.progress.xp, 120); assert.equal(state.player.level, 4);
  const runners = state.enemies.filter(enemy => enemy.zoneId === zone.id);
  assert.equal(runners.length, 4); assert.equal(isZoneUnlocked(state.progress, zone), true);
  for (const enemy of runners) {
    assert.deepEqual([enemy.type, enemy.trait, enemy.stageId, enemy.unlockLevel, enemy.level], ['runner', 'fast', 'meadow', 4, 4]);
    assert.deepEqual([enemy.hp, enemy.damage, enemy.speed, enemy.xp, enemy.loot], [90, 4, 4.9, 4, 6]);
  }
  assert.equal(state.progress.questIndex, 0); assert.equal(getQuest(state).id, 'mushrooms');
  assert.equal(getUnlockedMinZ(state.progress), -14); assert.equal(state.progress.unlockedDeep, false);
  assert.equal(state.spawners.find(spawn => spawn.id === mushroom.spawnId).remaining, 15);
  assert.ok(state.spawners.filter(spawn => spawn.zoneId === zone.id).every(spawn => spawn.unlockLevel === 4));
  assert.equal(MONSTER_STATS.runner.hp, 220); assert.equal(MONSTER_STATS.runner.damage, 10);
});

test('under-level hunters cannot retain the optional zone or discover field rewards and hazards there', () => {
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-runners');
  for (const xp of [0, 20, 60]) {
    const state = isolated({ xp, questIndex: 0 });
    state.player.x = zone.x; state.player.z = zone.z; state.inCamp = false;
    state.huntZoneId = zone.id; state.autoHunt = true;
    state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 0;
    state.enemies.push({ id: state.nextId++, type: 'mushroom', trait: 'normal', stageId: 'meadow', zoneId: 'test-foreign',
      x: zone.x + 2, z: zone.z, homeX: zone.x + 2, homeZ: zone.z, hp: 1000, maxHp: 1000, radius: 0.46,
      speed: 0, damage: 0, attackCd: 999, phase: 'stunned', phaseTime: 999 });
    advance(state, 0.5, {});
    assert.equal(state.huntZoneId, null); assert.equal(state.autoHunt, false);
    assert.equal(state.player.x, zone.x); assert.equal(state.player.z, zone.z); assert.equal(state.player.form, 'druid');
    assert.equal(state.fieldEvents.items.length, 0); assert.equal(state.fieldEvents.hazards.length, 0);
    assert.equal(state.fieldEvents.nextDiscovery, 0); assert.equal(state.fieldEvents.nextHazard, 0);
  }
  assert.equal(isZoneUnlocked({ xp: 120, questIndex: 0 }, zone), true);
  assert.equal(isZoneUnlocked({ xp: 120, questIndex: 0 }, HUNT_ZONES.find(item => item.id === 'deep-boars')), false);
  assert.equal(isZoneUnlocked(normalizeProgress(), null), false);
});

test('meadow runner homes and idle movement remain clear of camp safety and all existing meadow homes', () => {
  const state = createGame(7101, { xp: 120, questIndex: 0 }); state.phase = 'playing';
  const zone = HUNT_ZONES.find(item => item.id === 'meadow-runners'), camp = STAGES[0].camp;
  assert.ok(Math.hypot(zone.x - camp.x, zone.z - camp.z) > zone.radius + camp.radius);
  const runners = state.enemies.filter(enemy => enemy.zoneId === zone.id);
  const previous = state.enemies.filter(enemy => enemy.stageId === 'meadow' && enemy.zoneId !== zone.id);
  for (const runner of runners) {
    for (const other of previous) assert.ok(Math.hypot(runner.homeX - other.homeX, runner.homeZ - other.homeZ) > runner.radius + other.radius + 2.3);
    assert.ok(Math.hypot(runner.homeX - zone.x, runner.homeZ - zone.z) + 1.15 + runner.radius < zone.radius);
  }
  for (let i = 0; i < 600; i++) {
    stepGame(state, { manual: true });
    for (const runner of runners) {
      assert.equal(runner.phase, 'idle');
      assert.ok(Math.hypot(runner.x - camp.x, runner.z - camp.z) > camp.radius + runner.radius);
      assert.ok(Math.hypot(runner.x - zone.x, runner.z - zone.z) + runner.radius < zone.radius);
    }
  }
  assert.equal(state.player.hp, state.player.maxHp); assert.equal(state.inCamp, true);
});

test('the meadow variant uses its eight-second active respawn and retains level eligibility in the same v7 save', () => {
  const state = createGame(7102, { xp: 120, questIndex: 0 }); state.phase = 'playing';
  const target = state.enemies.find(enemy => enemy.zoneId === 'meadow-runners');
  state.enemies = [target]; state.spawners = state.spawners.filter(spawn => spawn.id === target.spawnId);
  state.projectiles.push({ id: state.nextId++, x: target.x, z: target.z, dx: 0, dz: 0, team: 'player', damage: 9999,
    life: 1, radius: 0.2, hitIds: [], pierce: 0 });
  stepGame(state, { manual: true });
  assert.equal(state.enemies.length, 0); assert.equal(state.spawners[0].remaining, 8);
  assert.equal(state.progress.xp, 124); assert.equal(state.loot[0].value, 6);
  assert.equal(state.progress.totals.ancientRunners, 0); assert.equal(state.progress.totals.mushrooms, 0);
  advance(state, 7.8); assert.equal(state.enemies.length, 0);
  setPaused(state, true); const remaining = state.spawners[0].remaining;
  advance(state, 2); assert.equal(state.spawners[0].remaining, remaining);
  setPaused(state, false); advance(state, 0.25);
  assert.equal(state.enemies.length, 1); assert.equal(state.enemies[0].spawnId, target.spawnId);
  assert.notEqual(state.enemies[0].id, target.id);
  assert.deepEqual([state.enemies[0].hp, state.enemies[0].damage, state.enemies[0].xp, state.enemies[0].loot], [90, 4, 4, 6]);
  const saved = exportProgress(state), restored = createGame(7103, saved);
  assert.equal(saved.version, 8); assert.deepEqual(exportProgress(restored), saved);
  assert.equal(restored.enemies.filter(enemy => enemy.zoneId === 'meadow-runners').length, 4);
  assert.equal(restored.progress.questIndex, 0); assert.equal(getUnlockedMinZ(restored.progress), -14);
});
