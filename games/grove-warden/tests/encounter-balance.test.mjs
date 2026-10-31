import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, HUNT_ZONES, RULES } from '../rules.mjs';

// Actual authored enemies and attack AI, isolated from other territories and
// random discoveries. This measures combat rules, not human play or frame rate.
function encounter(zoneId, { level = 1, attack = 0, health = 0, skill = 0, form = 0, seed = 73491 } = {}, strategy = 'hold') {
  const zone = HUNT_ZONES.find(item => item.id === zoneId);
  const state = createGame(seed, { xp: 10 * (level - 1) * level, questIndex: 11,
    upgrades: { attack, health }, skills: { owl: skill, roots: skill }, forms: { wolf: form, bear: form, dragon: form } });
  state.phase = 'playing'; state.player.x = zone.x; state.player.z = zone.z + (zone.type === 'boss' ? 4.5 : 1);
  state.inCamp = false; state.enemies = state.enemies.filter(enemy => enemy.zoneId === zoneId); state.spawners = [];
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  const bodies = [...state.enemies], start = { x: state.player.x, z: state.player.z }, initialHp = state.player.hp;
  let hits = 0, damage = 0;
  for (let frame = 0; frame < 60 * 60 && state.phase === 'playing' && state.enemies.length; frame++) {
    let moveX = 0, moveZ = 0;
    if (strategy === 'circle') {
      const nearest = state.enemies.reduce((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) < Math.hypot(b.x - state.player.x, b.z - state.player.z) ? a : b);
      const dx = state.player.x - nearest.x, dz = state.player.z - nearest.z, length = Math.hypot(dx, dz) || 1;
      const radial = (length - 4.2) * .65;
      moveX = -dz / length * .9 - dx / length * radial;
      moveZ = dx / length * .9 - dz / length * radial;
    }
    stepGame(state, { manual: true, moveX, moveZ }, 1 / 60);
    for (const event of state.events) if (event.type === 'player-hit') { hits++; damage += event.damage; }
    assert.ok(state.projectiles.length <= RULES.maxProjectiles && state.effects.length <= RULES.maxEffects);
  }
  return { state, initialHp, start, hits, damage, clear: bodies.every(enemy => enemy.hp <= 0), seconds: state.time, bodies };
}

test('an ungrown character cannot stand through the first guardian, but movement or modest camp growth wins', () => {
  for (const seed of [73491, 1973, 421]) {
    const idle = encounter('meadow-boss', { seed });
    assert.equal(idle.state.phase, 'down'); assert.equal(idle.clear, false);
    assert.ok(idle.seconds >= 9 && idle.seconds <= 17); assert.equal(idle.hits, 5);
    assert.deepEqual([idle.state.player.x, idle.state.player.z], [idle.start.x, idle.start.z]);
    const moving = encounter('meadow-boss', { seed }, 'circle');
    assert.equal(moving.clear, true); assert.equal(moving.state.phase, 'playing');
    assert.ok(moving.damage < idle.damage / 2); assert.ok(moving.seconds <= 24);
    const grown = encounter('meadow-boss', { seed, level: 3, attack: 2, health: 1, skill: 1 });
    assert.equal(grown.clear, true); assert.ok(grown.state.player.hp > 0);
    assert.ok(grown.seconds < moving.seconds * .75);
  }
});

test('successive guardians punish stationary fighting while telegraphed attacks remain avoidable at matched growth', () => {
  const builds = [
    ['deep-boss', { level: 8, attack: 4, health: 3, skill: 2, form: 1 }],
    ['ancient-boss', { level: 10, attack: 7, health: 5, skill: 3, form: 1 }],
    ['sky-boss', { level: 14, attack: 10, health: 8, skill: 4, form: 1 }],
  ];
  let lastDamage = 24;
  for (const [zoneId, build] of builds) {
    for (const seed of [73491, 1973, 421]) {
      const idle = encounter(zoneId, { ...build, seed });
      assert.equal(idle.clear, false); assert.equal(idle.state.phase, 'down');
      assert.ok(idle.hits >= 4 && idle.hits <= 6); assert.ok(idle.seconds < 19);
      const moving = encounter(zoneId, { ...build, seed }, 'circle');
      assert.equal(moving.clear, true); assert.equal(moving.state.phase, 'playing');
      assert.ok(moving.seconds >= 10 && moving.seconds <= 32);
      assert.ok(moving.damage < idle.damage / 2);
    }
    const { bodies } = encounter(zoneId, build);
    assert.ok(bodies[0].damage > lastDamage); lastDamage = bodies[0].damage;
  }
});

test('a whole meadow pack consumes health and manually avoiding boar charges improves the result', () => {
  const tutorial = encounter('meadow-mushrooms');
  assert.equal(tutorial.clear, true); assert.equal(tutorial.bodies.length, 9);
  assert.ok(tutorial.damage >= tutorial.initialHp * .5);
  const build = { level: 4, attack: 2, health: 2, skill: 1, form: 1 };
  const standing = encounter('meadow-boars', build), moving = encounter('meadow-boars', build, 'circle');
  assert.equal(standing.clear, true); assert.equal(moving.clear, true);
  assert.ok(standing.damage >= standing.initialHp * .7); assert.ok(moving.damage < standing.damage / 2);
  assert.equal(standing.state.progress.checkpoint, 'meadow');
  assert.deepEqual([standing.state.player.x, standing.state.player.z], [standing.start.x, standing.start.z]);
});

test('authored difficulty is independent of saved character power and high-rank growth remains useful', () => {
  const weak = createGame(731, { xp: 1320, questIndex: 11 });
  const strong = createGame(731, { xp: 24500, questIndex: 11, upgrades: { attack: 100, health: 100, bag: 100 }, forms: { wolf: 99, bear: 99, dragon: 99 } });
  const stats = state => state.enemies.map(({ spawnId, maxHp, damage, speed }) => ({ spawnId, maxHp, damage, speed }));
  assert.deepEqual(stats(weak), stats(strong));
  assert.ok(strong.player.attackDamage * strong.player.damageMult > weak.player.attackDamage * weak.player.damageMult);
  assert.ok(strong.player.maxHp > weak.player.maxHp);
});
