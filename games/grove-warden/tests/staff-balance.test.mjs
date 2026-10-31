import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../rules.mjs';
import { getWeaponAttack } from '../equipment.mjs';

const WEAPONS = ['sprout', 'thorn', 'moon', 'ember'];
const GROWTH = [
  { level: 3, attack: 0 }, { level: 10, attack: 5 },
  { level: 12, attack: 10 }, { level: 20, attack: 20 },
];
const SECONDS = 10, STEP = 1 / 60, CACHE = new Map();
const ring = count => Array.from({ length: count }, (_, index) => [3 * Math.cos(index * Math.PI * 2 / count), 3 * Math.sin(index * Math.PI * 2 / count), 0.46]);
const LAYOUTS = {
  boss: [[3, 0, 1.05]], largeBoss: [[3, 0, 2.4]],
  compact4: [[2.6, 0, 0.46], [2.6, 0.95, 0.46], [2.6, -0.95, 0.46], [3.6, 0, 0.46]],
  compact6: [[2.6, 0, 0.46], [2.6, 0.95, 0.46], [2.6, -0.95, 0.46], [3.6, 0, 0.46], [3.6, 0.95, 0.46], [3.6, -0.95, 0.46]],
  grid4: [[2.5, -0.5, 0.46], [2.5, 0.5, 0.46], [3.5, -0.5, 0.46], [3.5, 0.5, 0.46]],
  grid6: [2.5, 3.5].flatMap(x => [-1, 0, 1].map(z => [x, z, 0.46])),
  scattered4: ring(4), scattered6: ring(6), rangeBand: [[4.6, 0, 0.46]],
};

// Stationary high-life bodies isolate offensive roles; these are not live boss difficulty measurements.
function measure(growth, layout, weaponId) {
  const key = `${growth.level}:${growth.attack}:${layout}:${weaponId}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const state = createGame(3621, { xp: 10 * (growth.level - 1) * growth.level,
    weapon: weaponId, upgrades: { attack: growth.attack } });
  state.phase = 'playing'; state.player.x = 0; state.player.z = 0; state.inCamp = false;
  state.enemies = []; state.spawners = [];
  state.fieldEvents.nextDiscovery = state.fieldEvents.nextHazard = 1e9;
  for (const [x, z, radius] of LAYOUTS[layout]) state.enemies.push({ id: state.nextId++, type: layout.includes('Boss') || layout === 'boss' ? 'boss' : 'mushroom',
    trait: 'normal', stageId: 'meadow', zoneId: 'test-layout', x, z, homeX: x, homeZ: z,
    hp: 1000000, maxHp: 1000000, radius, speed: 0, damage: 0, phase: 'stunned', phaseTime: 1000, attackCd: 999 });
  const bodies = [...state.enemies], hits = [], shots = [], events = new Set();
  for (let frame = 0; frame < SECONDS / STEP; frame++) {
    stepGame(state, { manual: true, moveX: 0, moveZ: 0 }, STEP);
    for (const event of state.events) {
      events.add(event.type);
      if (event.type === 'hit') hits.push(event);
      if (event.type === 'shoot') shots.push(event);
    }
  }
  const damage = bodies.reduce((sum, actor) => sum + actor.maxHp - actor.hp, 0);
  const result = { damage, dps: damage / SECONDS, hits, shots, events,
    targets: new Set(hits.map(hit => hit.targetId)), level: state.player.level,
    attack: state.progress.upgrades.attack, equipped: state.progress.weapon,
    player: { x: state.player.x, z: state.player.z, hp: state.player.hp, maxHp: state.player.maxHp, form: state.player.form },
    kills: state.progress.totals.kills, bodies };
  CACHE.set(key, result); return result;
}
function row(growth, layout) { return Object.fromEntries(WEAPONS.map(id => [id, measure(growth, layout, id)])); }
function focusedWin(results, label) {
  const broad = Math.max(results.moon.damage, results.ember.damage);
  assert.ok(results.sprout.damage > broad, `${label}: single must beat both area weapons on one victim`);
  assert.ok(results.thorn.damage > results.sprout.damage, `${label}: burst must concentrate more damage than single`);
}

test('single and burst outperform area weapons on both normal and very large stationary bosses at every matched growth tier', () => {
  for (const growth of GROWTH) for (const layout of ['boss', 'largeBoss']) focusedWin(row(growth, layout), `Lv.${growth.level}/${layout}`);
});

test('both area weapons beat focus by at least ten percent in four-body compact and occluded grid packs', () => {
  for (const growth of GROWTH) for (const layout of ['compact4', 'grid4']) {
    const results = row(growth, layout), focused = Math.max(results.sprout.damage, results.thorn.damage);
    assert.ok(results.moon.damage >= focused * 1.1, `Lv.${growth.level}/${layout}: spread must retain a clear crowd advantage`);
    assert.ok(results.ember.damage >= focused * 1.1, `Lv.${growth.level}/${layout}: explosion must retain a clear crowd advantage`);
    assert.ok(results.moon.targets.size >= 3); assert.equal(results.ember.targets.size, 4);
  }
});

test('six-body compact and occluded grid packs retain at least ten percent area advantage', () => {
  for (const growth of GROWTH) for (const layout of ['compact6', 'grid6']) {
    const results = row(growth, layout), focused = Math.max(results.sprout.damage, results.thorn.damage);
    assert.ok(results.moon.damage >= focused * 1.1); assert.ok(results.ember.damage >= focused * 1.1);
    assert.equal(results.ember.targets.size, 6);
    assert.ok(results.ember.damage > measure(growth, layout === 'grid6' ? 'grid4' : 'compact4', 'ember').damage);
    assert.equal(results.sprout.targets.size, 1); assert.equal(results.thorn.targets.size, 1);
  }
});

test('spaced four-body and six-body layouts favor focus even though every initial target is within the shortest staff range', () => {
  for (const growth of GROWTH) for (const layout of ['scattered4', 'scattered6']) {
    const results = row(growth, layout); focusedWin(results, `Lv.${growth.level}/${layout}`);
    for (const result of Object.values(results)) assert.equal(result.targets.size, 1);
  }
});

test('spread volleys hit each victim once regardless of boss size while still reaching several pack victims', () => {
  for (const growth of GROWTH) {
    for (const layout of ['boss', 'largeBoss', 'compact4', 'compact6', 'grid4', 'grid6']) {
      const result = measure(growth, layout, 'moon'), pairs = new Map(), volleys = new Map();
      assert.ok(result.hits.length > 0);
      for (const hit of result.hits) {
        assert.notEqual(hit.volleyId, undefined);
        const key = `${hit.volleyId}:${hit.targetId}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
        if (!volleys.has(hit.volleyId)) volleys.set(hit.volleyId, new Set());
        volleys.get(hit.volleyId).add(hit.targetId);
      }
      assert.ok([...pairs.values()].every(count => count === 1));
      if (layout === 'boss' || layout === 'largeBoss') assert.ok([...volleys.values()].every(targets => targets.size === 1));
      else assert.ok([...volleys.values()].some(targets => targets.size >= 3));
    }
    const normal = measure(growth, 'boss', 'moon'), large = measure(growth, 'largeBoss', 'moon');
    const average = result => result.hits.reduce((sum, hit) => sum + hit.damage, 0) / result.hits.length;
    assert.ok(Math.abs(average(normal) - average(large)) < 1e-8);
  }
});

test('the long-range band grants actual damage only to the single staff without steering the player closer', () => {
  for (const growth of GROWTH) {
    const results = row(growth, 'rangeBand');
    assert.ok(results.sprout.damage > 0 && results.sprout.shots.length > 0);
    for (const id of ['thorn', 'moon', 'ember']) { assert.equal(results[id].damage, 0); assert.equal(results[id].shots.length, 0); }
    for (const result of Object.values(results)) assert.deepEqual([result.player.x, result.player.z], [0, 0]);
  }
});

test('the comparison preserves equal growth and valid body spacing and measures only actual staff damage', () => {
  for (const growth of GROWTH) for (const layout of Object.keys(LAYOUTS)) for (const id of WEAPONS) {
    const result = measure(growth, layout, id);
    assert.equal(result.level, growth.level); assert.equal(result.equipped, id);
    assert.equal(result.attack, growth.attack); assert.ok(getWeaponAttack(id).range > 0);
    assert.equal(result.player.form, 'druid'); assert.equal(result.player.hp, result.player.maxHp); assert.equal(result.kills, 0);
    assert.deepEqual([result.player.x, result.player.z], [0, 0]);
    assert.equal(result.events.has('owl-shoot') || result.events.has('skill') || result.events.has('form-attack'), false);
    assert.ok(result.hits.every(hit => hit.source === 'staff'));
    const eventDamage = result.hits.reduce((sum, hit) => sum + hit.damage, 0);
    assert.ok(Math.abs(eventDamage - result.damage) < 0.0001);
    for (let i = 0; i < result.bodies.length; i++) {
      const a = result.bodies[i]; assert.ok(Math.hypot(a.x, a.z) > a.radius + 0.4);
      for (let j = i + 1; j < result.bodies.length; j++) {
        const b = result.bodies[j]; assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius);
      }
    }
  }
});
