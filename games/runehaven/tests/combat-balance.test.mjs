import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act, BOUNDS, CLASS_STATS, createGame, getCapacity, getHireInfo, getMoneyPiles,
  getRaidPlan, getStationApproach, getUpgradeInfo, step,
} from '../rules.mjs';

// Controlled combat fixtures, not earned-progress saves: isolate the same seed,
// roster and campaign stage so equipment investment can be compared fairly.
function muster({ stage = 1, count = 18, equipmentLevel = 1, loyalty = 1, allWarriors = false } = {}) {
  const state = createGame(42);
  state.stage = stage;
  state.sales = count;
  state.raid.wins = stage - 1;
  state.patrons = Array.from({ length: count }, (_, index) => {
    const kind = allWarriors || index < 6 ? 'warrior' : index < 12 || stage === 1 ? 'archer' : 'mage';
    const hp = CLASS_STATS[kind].hp;
    return { id: `paid-${index}`, kind, purchases: 1, totalSpent: 50, loyalty, hp, maxHp: hp, equipmentLevel };
  });
  state.raid.phase = 'warning'; state.raid.timer = 0.01;
  return state;
}

function begin(state) {
  step(state, 0.05);
  assert.equal(state.raid.phase, 'battle');
  return state;
}

function fight(options) {
  const state = begin(muster(options));
  const plan = structuredClone(state.raid.plan);
  for (let frame = 0; frame < 2400 && state.raid.phase === 'battle'; frame++) {
    step(state, 0.05);
    assert.ok(state.raid.enemies.length <= 20, 'reinforcements cannot create an unbounded crowd');
    for (const actor of [...state.raid.defenders, ...state.raid.enemies].filter((item) => item.hp > 0)) {
      assert.ok(Number.isFinite(actor.hp) && Number.isFinite(actor.x) && Number.isFinite(actor.z));
      assert.ok(actor.x >= BOUNDS.minX + actor.radius && actor.x <= BOUNDS.maxX - actor.radius);
      assert.ok(actor.z >= BOUNDS.minZ + actor.radius && actor.z <= BOUNDS.maxZ - actor.radius);
    }
  }
  assert.ok(state.raid.summary, 'combat resolves within two minutes');
  return { state, plan, summary: state.raid.summary };
}

// Earn every item and upgrade through the same actions as the browser. This
// intentionally makes no fixture assignments to stock, sales, stats or patrons.
function campaign(seed, upgradeEquipment = true) {
  const state = createGame(seed);
  act(state, 'hire');
  let carrying = false, product = 'gear', cashKind = null, phase = state.raid.phase;
  let start = null, crowd = 0;
  const raids = [];
  for (let frame = 0; frame < 20000 && raids.length < 6 && state.status === 'playing'; frame++) {
    if (state.unlocks.alchemyAvailable && !state.unlocks.alchemy && state.gold >= 230) act(state, 'unlock', { kind: 'alchemy' });
    if (state.unlocks.innAvailable && !state.unlocks.inn) act(state, 'unlock', { kind: 'inn' });
    if (state.staff.length < 3 && state.gold > 900 && getHireInfo(state).canBuy) act(state, 'hire');
    if (state.player.capacityLevel < 4 && getUpgradeInfo(state, 'capacity').canBuy) act(state, 'upgrade', { kind: 'capacity' });
    for (const kind of upgradeEquipment ? ['price', 'speed'] : ['speed']) {
      if (state.player[`${kind}Level`] < Math.min(21, 2 + state.stage * 3) && getUpgradeInfo(state, kind).canBuy) act(state, 'upgrade', { kind });
    }
    if (state.raid.phase === 'victory') act(state, 'continue');
    const bag = state.player.bag.gear + state.player.bag.potion;
    if (bag >= getCapacity(state)) carrying = true;
    if (bag === 0) { carrying = false; product = state.unlocks.mage && state.stocks.potion < 3 ? 'potion' : 'gear'; }
    const piles = getMoneyPiles(state);
    if (cashKind && !state.moneyPiles[cashKind]) cashKind = null;
    if (bag === 0 && !cashKind) cashKind = piles.filter((pile) => pile.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.kind ?? null;
    const station = carrying ? (state.player.bag.gear > 0 ? 'counter' : 'potionCounter') : product === 'gear' ? 'forge' : 'alchemy';
    step(state, .1, { target: cashKind ? piles.find((pile) => pile.kind === cashKind) : getStationApproach(state, station) });
    crowd = Math.max(crowd, state.customers.length);
    if (phase !== 'battle' && state.raid.phase === 'battle') {
      start = { stage: state.stage, priceLevel: state.player.priceLevel, classes: state.raid.defenders.reduce((counts, actor) => { counts[actor.kind]++; return counts; }, { warrior: 0, archer: 0, mage: 0 }) };
    }
    if (phase === 'battle' && state.raid.phase !== 'battle') raids.push({ ...start, ...state.raid.summary });
    phase = state.raid.phase;
  }
  return { state, raids, crowd };
}

test('raid budgets grow by campaign and bounded muster, never by equipment or loyalty', () => {
  const small = getRaidPlan(muster({ count: 3 }));
  const large = getRaidPlan(muster());
  assert.equal(small.total, 4);
  assert.equal(large.total, 19);
  assert.ok(large.initialBatch >= 12 && large.initialBatch < large.total);
  assert.ok(large.reinforcementBatch > 1 && large.reinforcementSeconds > 1);
  assert.deepEqual(getRaidPlan(muster({ equipmentLevel: 21, loyalty: 10 })), large);
  assert.deepEqual(getRaidPlan(muster({ count: 60 })), large, 'only the latest eighteen patrons can muster');
  assert.ok(getRaidPlan(muster({ stage: 6 })).total > large.total);
  assert.equal(getRaidPlan(muster({ stage: 100 })).total, 32);
  assert.deepEqual(new Set(large.roles), new Set(['grunt', 'raider']));
  assert.ok(getRaidPlan(muster({ stage: 2 })).roles.includes('ranged'));
  assert.ok(getRaidPlan(muster({ stage: 2 })).roles.includes('elite'), 'the second raid includes a durable frontline');
  assert.ok(getRaidPlan(muster({ stage: 3 })).roles.includes('elite'));
});

test('first defense has real attrition but eight prepared purchasers can beat it', () => {
  const unprepared = fight({ count: 3, allWarriors: true });
  const prepared = fight({ count: 8, allWarriors: true });
  assert.equal(unprepared.summary.won, false);
  assert.equal(unprepared.summary.fallen, 3);
  assert.equal(unprepared.summary.shopDamage, unprepared.state.shopMaxHp);
  assert.equal(prepared.summary.won, true);
  assert.ok(prepared.summary.duration >= 8 && prepared.summary.duration <= 35);
  assert.ok(prepared.summary.fallen >= 1 && prepared.summary.fallen < 8);
  assert.ok(prepared.summary.injured > 0);
  assert.equal(prepared.state.stage, 2);
});

test('mid-campaign equipment and inn loyalty improve survival against the identical attack budget', () => {
  const baseline = fight({ stage: 6 });
  const invested = fight({ stage: 6, equipmentLevel: 6, loyalty: 2 });
  const stronger = fight({ stage: 6, equipmentLevel: 10, loyalty: 3 });
  assert.deepEqual(baseline.plan, invested.plan);
  assert.deepEqual(invested.plan, stronger.plan);
  assert.equal(baseline.summary.won, false);
  assert.equal(invested.summary.won, true);
  assert.ok(invested.summary.duration > 10 && invested.summary.duration < 45);
  assert.ok(invested.summary.fallen > 0 && invested.summary.fallen < baseline.summary.fallen);
  assert.ok(invested.summary.shopDamage > 0 && invested.summary.shopDamage < baseline.summary.shopDamage);
  assert.equal(stronger.summary.won, true);
  assert.ok(stronger.summary.fallen < invested.summary.fallen);
  assert.ok(stronger.summary.duration < invested.summary.duration);
  assert.ok(stronger.summary.shopDamage < invested.summary.shopDamage);
});

test('late armies challenge an established shop while full growth retains a clear advantage', () => {
  const underprepared = fight({ stage: 10 });
  const weakEquipment = fight({ stage: 10, equipmentLevel: 10, loyalty: 3 });
  const established = fight({ stage: 10, equipmentLevel: 12, loyalty: 3 });
  const fullyGrown = fight({ stage: 10, equipmentLevel: 21, loyalty: 5 });
  assert.equal(underprepared.summary.won, false);
  assert.equal(weakEquipment.summary.won, false, 'level ten equipment cannot rely on free retreat attacks');
  assert.equal(established.summary.enemies, 32);
  assert.equal(established.summary.won, true);
  assert.ok(established.summary.fallen >= 5 && established.summary.fallen < 18);
  assert.ok(established.summary.shopDamage > 0);
  assert.equal(fullyGrown.summary.won, true);
  assert.ok(fullyGrown.summary.duration >= 8 && fullyGrown.summary.duration < established.summary.duration);
  assert.ok(fullyGrown.summary.fallen < established.summary.fallen);
  assert.ok(fullyGrown.summary.shopDamage < established.summary.shopDamage);
});

test('enemy roles have distinct bodies, movement and actual ranged projectile endpoints', () => {
  const state = begin(muster({ stage: 3, equipmentLevel: 5, loyalty: 2 }));
  const enemy = Object.fromEntries(['grunt', 'raider', 'ranged', 'elite'].map((role) => [role, state.raid.enemies.find((actor) => actor.role === role)]));
  assert.ok(Object.values(enemy).every(Boolean));
  assert.ok(enemy.raider.speed > enemy.grunt.speed);
  assert.ok(enemy.raider.speed > CLASS_STATS.archer.speed, 'raiders can reach a retreating archer');
  assert.ok(enemy.raider.range > enemy.grunt.range);
  assert.ok(enemy.ranged.range > 3 * enemy.grunt.range);
  assert.ok(enemy.ranged.range > CLASS_STATS.archer.range, 'enemy archers can answer the defenders from range');
  assert.ok(enemy.elite.maxHp > 2 * enemy.grunt.maxHp);
  assert.ok(enemy.elite.damage > enemy.grunt.damage);
  assert.equal(state.raid.totalEnemies, state.raid.plan.total);
  assert.match(state.raid.threatLabel, /정예.*원거리/);
  let rangedProjectile = null;
  for (let frame = 0; frame < 400 && state.raid.phase === 'battle' && !rangedProjectile; frame++) {
    step(state, 0.05);
    rangedProjectile = state.effects.find((effect) => effect.team === 'enemy' && ['arrow', 'magic'].includes(effect.type));
  }
  assert.ok(rangedProjectile, 'enemy archers attack rather than remaining presentation-only');
  assert.ok(rangedProjectile.actorId.startsWith('enemy-'));
  for (const point of [rangedProjectile.from, rangedProjectile.to]) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
  assert.ok(Math.hypot(rangedProjectile.from.x - rangedProjectile.to.x, rangedProjectile.from.z - rangedProjectile.to.z) > 1);
});

test('fixed-seed combat and casualty summaries remain deterministic', () => {
  const options = { stage: 6, equipmentLevel: 5, loyalty: 2 };
  const first = fight(options), second = fight(options);
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.state.raid.defenders, second.state.raid.defenders);
  assert.equal(first.state.gold, second.state.gold);
});

test('a ranged defender cannot deal damage on the same tick as retreating', () => {
  const state = begin(muster({ stage: 2 }));
  const archer = state.raid.defenders.find((actor) => actor.kind === 'archer');
  const enemy = state.raid.enemies[0];
  for (const actor of state.raid.defenders) actor.hp = actor === archer ? actor.maxHp : 0;
  for (const actor of state.raid.enemies) actor.hp = actor === enemy ? actor.maxHp : 0;
  Object.assign(archer, { x: 0, z: 0, attackClock: 0 });
  Object.assign(enemy, { x: 0, z: 1, attackClock: 100 });
  const health = enemy.hp;
  step(state, .05);
  assert.ok(archer.z < 0, 'the defender really retreats');
  assert.equal(enemy.hp, health, 'retreat movement and a shot cannot happen together');
  assert.ok(archer.attackClock <= 0, 'the cooldown continues while moving');
});

test('five normally earned campaigns retain crowds and combat pressure through the sixth raid', (context) => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    const { state, raids, crowd } = campaign(seed);
    assert.equal(state.status, 'playing', `seed ${seed}: earned equipment is enough to continue`);
    assert.equal(raids.length, 6, `seed ${seed}: the campaign cannot stall`);
    assert.ok(crowd >= 20 && crowd <= 30, `seed ${seed}: real customers remain visible and bounded`);
    assert.equal(state.patrons.reduce((sum, patron) => sum + patron.purchases, 0), state.sales);
    assert.equal(state.gold + Object.values(state.moneyPiles).reduce((sum, amount) => sum + amount, 0), 80 + state.economy.earned - state.economy.spent);
    assert.ok(raids.every((raid) => raid.won && raid.duration >= 6 && raid.duration < 35));
    assert.ok(raids.slice(0, 2).every((raid) => raid.fallen + raid.injured > 0), `seed ${seed}: the opening raids cannot be damage-free`);
    context.diagnostic(JSON.stringify({ seed, crowd, raids: raids.map(({ stage, priceLevel, duration, fallen, injured, shopDamage }) => ({ stage, priceLevel, duration: Number(duration.toFixed(2)), fallen, injured, shopDamage })) }));
  }
  const unprepared = campaign(42, false);
  assert.equal(unprepared.state.status, 'defeat', 'skipping equipment eventually loses despite running the same shop');
  assert.ok(unprepared.raids.length <= 6);
});
