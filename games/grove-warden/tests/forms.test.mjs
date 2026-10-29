import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, normalizeForms, formRank, getFormDefinition, getFormOffer, applyFormUpgrade, chooseForm } from '../forms.mjs';

function state(level = 12) {
  return { phase: 'playing', inCamp: false, progress: { level, gold: 1000, forms: normalizeForms() },
    player: { x: 0, z: 0, hp: 100, level, attackDamage: 30, damageMult: 1.18 }, enemies: [] };
}
function enemy(id, trait, x, z = 0) { return { id, trait, x, z, hp: 100 }; }

test('form catalogs are bounded and old saves receive no extra paid growth', () => {
  assert.equal(Object.isFrozen(FORMS), true); assert.ok(FORMS.every(Object.isFrozen));
  assert.deepEqual(FORMS.map(form => [form.id, form.firstLevel, form.maxLevel, form.baseCost]), [['wolf', 4, 3, 45], ['bear', 8, 3, 70], ['dragon', 12, 3, 100]]);
  assert.deepEqual(normalizeForms(), { wolf: 0, bear: 0, dragon: 0 });
  assert.deepEqual(normalizeForms({ wolf: 100, bear: -2, dragon: '1', other: 9 }), { wolf: 2, bear: 0, dragon: 0 });
  assert.deepEqual(normalizeForms(Object.create({ wolf: 2 })), { wolf: 0, bear: 0, dragon: 0 });
  const source = { wolf: 1, bear: 2, dragon: 0 }, result = normalizeForms(source); result.wolf = 2;
  assert.equal(source.wolf, 1);
});

test('each matching character level grants its first form rank for free', () => {
  for (const definition of FORMS) {
    const locked = state(definition.firstLevel - 1), unlocked = state(definition.firstLevel);
    assert.equal(formRank(locked.progress, definition.id), 0);
    const preview = getFormOffer(locked, definition.id);
    assert.equal(preview.unlocked, false); assert.equal(preview.cost, 0); assert.equal(preview.canBuy, false);
    assert.equal(preview.requiredLevel, definition.firstLevel); assert.ok(preview.nextDamage > 0);
    assert.equal(formRank(unlocked.progress, definition.id), 1);
    assert.equal(unlocked.progress.gold, 1000); assert.equal(unlocked.progress.forms[definition.id], 0);
    assert.equal(applyFormUpgrade(unlocked.progress, definition.id), false);
  }
});

test('purchase offers use camp phase funds and the next rank level consistently', () => {
  const current = state(7);
  let offer = getFormOffer(current, 'wolf');
  assert.equal(offer.rank, 1); assert.equal(offer.level, 0); assert.equal(offer.requiredLevel, 7); assert.equal(offer.cost, 45); assert.equal(offer.locked, false);
  assert.equal(offer.canBuy, false);
  current.inCamp = true; assert.equal(getFormOffer(current, 'wolf').canBuy, true);
  current.phase = 'paused'; assert.equal(getFormOffer(current, 'wolf').canBuy, true);
  current.phase = 'ready'; assert.equal(getFormOffer(current, 'wolf').canBuy, false);
  current.phase = 'playing'; current.progress.gold = 44; assert.equal(getFormOffer(current, 'wolf').canBuy, false);
  current.progress.gold = 1000; const before = structuredClone(current);
  getFormOffer(current, 'bear'); assert.deepEqual(current, before);
  assert.equal(getFormOffer(current, 'unknown'), null);
});

test('two paid upgrades change only form purchases and gold and stop at rank three', () => {
  for (const definition of FORMS) {
    const current = state(definition.firstLevel + 6), progress = current.progress;
    progress.extra = { untouched: true };
    const otherForms = { ...progress.forms }, gold = progress.gold;
    assert.equal(applyFormUpgrade(progress, definition.id), true);
    assert.equal(formRank(progress, definition.id), 2);
    assert.equal(progress.gold, gold - definition.baseCost);
    assert.equal(applyFormUpgrade(progress, definition.id), true);
    assert.equal(formRank(progress, definition.id), 3);
    assert.equal(progress.gold, gold - definition.baseCost - Math.round(definition.baseCost * 1.8));
    for (const other of FORMS.filter(form => form.id !== definition.id)) assert.equal(progress.forms[other.id], otherForms[other.id]);
    const capped = structuredClone(progress), offer = getFormOffer(current, definition.id);
    assert.equal(offer.maxed, true); assert.equal(offer.canBuy, false);
    assert.equal(offer.nextDamage, null); assert.equal(offer.nextRange, null); assert.equal(offer.nextInterval, null);
    assert.equal(applyFormUpgrade(progress, definition.id), false); assert.deepEqual(progress, capped);
    assert.deepEqual(progress.extra, { untouched: true });
  }
});

test('invalid or underleveled purchases never mutate any saved state', () => {
  for (const [level, gold, id] of [[3, 100, 'wolf'], [4, 100, 'wolf'], [7, 44, 'wolf'], [20, 100, 'other']]) {
    const progress = state(level).progress; progress.gold = gold; const before = structuredClone(progress);
    assert.equal(applyFormUpgrade(progress, id), false); assert.deepEqual(progress, before);
  }
  assert.equal(applyFormUpgrade(null, 'wolf'), false);
});

test('attack profiles include staff gear once, retain precision, and expose their actual attack shape', () => {
  const player = { attackDamage: 31, damageMult: 1.36 };
  const wolf = getFormDefinition('wolf', 1, player), grown = getFormDefinition('wolf', 3, player);
  assert.ok(Math.abs(wolf.damage - 31 * 1.36 * 1.05) < 1e-9);
  assert.ok(Math.abs(grown.damage - wolf.damage * 1.44) < 1e-9);
  assert.equal(wolf.attackKind, 'melee'); assert.equal(wolf.interval, 0.32); assert.equal(wolf.range, 2.2);
  const bear = getFormDefinition('bear', 1, player), dragon = getFormDefinition('dragon', 1, player);
  assert.equal(bear.attackKind, 'slam'); assert.equal(bear.groundOnly, true);
  assert.equal(dragon.attackKind, 'projectile'); assert.equal(dragon.homing, true); assert.equal(dragon.airborneBonus, 1.6);
  assert.ok(dragon.missileSpeed > 0 && dragon.turnRate > 0 && dragon.life > 0);
  assert.equal(getFormDefinition('druid', 1, player), null); assert.equal(getFormDefinition('wolf', 0, player), null);
  const current = state(10); current.player = player; current.progress.forms.wolf = 1;
  const offer = getFormOffer(current, 'wolf');
  assert.equal(offer.currentDamage, Math.round(getFormDefinition('wolf', 2, player).damage));
  assert.equal(offer.nextDamage, Math.round(getFormDefinition('wolf', 3, player).damage));
});

test('airborne fast and clustered swarm select their matching unlocked forms with stable priority', () => {
  const current = state(12);
  current.enemies = [enemy(1, 'swarm', 1), enemy(2, 'swarm', 2), enemy(3, 'swarm', 3)];
  assert.deepEqual(chooseForm(current), { form: 'bear', reason: 'swarm', targetId: 1 });
  current.enemies.push(enemy(4, 'fast', 4));
  assert.deepEqual(chooseForm(current), { form: 'wolf', reason: 'fast', targetId: 4 });
  current.enemies.push(enemy(5, 'airborne', 5));
  assert.deepEqual(chooseForm(current), { form: 'dragon', reason: 'airborne', targetId: 5 });
  current.enemies.reverse(); assert.equal(chooseForm(current).targetId, 5);
  current.enemies.push(enemy(6, 'airborne', -5)); assert.equal(chooseForm(current).targetId, 5);
});

test('dead distant sparse or unavailable counters keep the druid available without granting forms', () => {
  const current = state(3);
  current.enemies = [enemy(1, 'airborne', 1), enemy(2, 'fast', 2), enemy(3, 'swarm', 3), enemy(4, 'swarm', 4), enemy(5, 'swarm', 5)];
  assert.equal(chooseForm(current).form, 'druid');
  current.progress.level = 8; current.enemies = [enemy(1, 'swarm', 1), enemy(2, 'swarm', 2), enemy(3, 'swarm', 5.6)];
  assert.equal(chooseForm(current).form, 'druid');
  current.enemies = [enemy(4, 'fast', 6.21), { ...enemy(5, 'fast', 1), hp: 0 }];
  assert.equal(chooseForm(current).form, 'druid');
  current.enemies = [enemy(6, 'normal', 1)]; assert.equal(chooseForm(current).form, 'druid');
  assert.deepEqual(current.progress.forms, normalizeForms());
});

test('camp down and paused states never request a combat form or mutate simulation state', () => {
  const current = state(20); current.enemies = [enemy(1, 'airborne', 1)];
  const before = structuredClone(current); chooseForm(current); assert.deepEqual(current, before);
  current.inCamp = true; assert.equal(chooseForm(current).reason, 'camp');
  current.inCamp = false; current.phase = 'down'; assert.equal(chooseForm(current).reason, 'down');
  current.phase = 'paused'; assert.equal(chooseForm(current).form, 'druid');
  current.phase = 'playing'; current.player.hp = 0; assert.equal(chooseForm(current).form, 'druid');
});
