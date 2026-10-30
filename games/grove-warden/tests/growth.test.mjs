import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, UPGRADES, SKILLS, RULES, getUpgradeOffer, buyUpgrade, getSkillOffer, learnSkill, exportProgress, normalizeProgress, setPaused } from '../rules.mjs';

test('all stat tracks can reach 100 at player level one and charge exactly once per rank', () => {
  for (const definition of UPGRADES) {
    const state = createGame(810, { gold: 1_000_000 }); state.phase = 'playing';
    const startingGold = state.progress.gold; let spent = 0;
    assert.equal(definition.maxLevel, 100);
    for (let rank = 0; rank < 100; rank++) {
      const offer = getUpgradeOffer(state, definition.id);
      assert.equal(offer.level, rank); assert.equal(offer.locked, false); assert.equal(offer.requiredLevel, 1);
      assert.ok(Number.isSafeInteger(offer.cost) && offer.cost > 0);
      assert.ok(Number.isFinite(offer.nextValue) && offer.nextValue > offer.currentValue);
      spent += offer.cost; assert.equal(buyUpgrade(state, definition.id), true);
      assert.equal(state.progress.gold, startingGold - spent);
      assert.equal(getUpgradeOffer(state, definition.id).currentValue, offer.nextValue);
      assert.equal(state.progress.level, 1);
    }
    const cap = getUpgradeOffer(state, definition.id), before = structuredClone(state.progress);
    assert.equal(cap.level, 100); assert.equal(cap.maxed, true); assert.equal(cap.nextValue, null);
    assert.equal(buyUpgrade(state, definition.id), false); assert.deepEqual(state.progress, before);
    assert.deepEqual(exportProgress(createGame(811, exportProgress(state))), exportProgress(state));
  }
});

test('each druid skill learns at level one and improves through rank 100 with positive finite timing', () => {
  for (const definition of SKILLS) {
    const state = createGame(812, { gold: 1_000_000 }); state.phase = 'playing';
    let spent = 0, previousInterval = Infinity;
    assert.equal(definition.maxLevel, 100);
    for (let rank = 0; rank < 100; rank++) {
      const offer = getSkillOffer(state, definition.id);
      assert.equal(offer.level, rank); assert.equal(offer.locked, false); assert.equal(offer.requiredLevel, 1);
      assert.ok(Number.isFinite(offer.nextInterval) && offer.nextInterval > 0 && offer.nextInterval < previousInterval);
      assert.ok(Number.isFinite(offer.nextDamage) && offer.nextDamage > 0);
      spent += offer.cost; assert.equal(learnSkill(state, definition.id), true);
      assert.equal(state.progress.gold, 1_000_000 - spent); assert.equal(state.progress.level, 1);
      const after = getSkillOffer(state, definition.id);
      assert.equal(after.currentInterval, offer.nextInterval); assert.equal(after.currentDamage, offer.nextDamage);
      previousInterval = after.currentInterval;
    }
    const cap = getSkillOffer(state, definition.id), before = structuredClone(state.progress);
    assert.equal(cap.level, 100); assert.equal(cap.maxed, true); assert.equal(cap.nextInterval, null); assert.equal(cap.nextDamage, null);
    assert.equal(learnSkill(state, definition.id), false); assert.deepEqual(state.progress, before);
    assert.ok(cap.currentInterval > (definition.id === 'owl' ? .4 : 1.8));
    assert.deepEqual(exportProgress(createGame(813, exportProgress(state))), exportProgress(state));
  }
});

test('rank 100 automatic skills deal actual damage within shared object caps and still freeze when paused', () => {
  const state = createGame(814, { skills: { owl: 100, roots: 100 } });
  state.phase = 'playing'; state.inCamp = false; state.player.x = -6; state.player.z = 4; state.player.attackCd = 999;
  const target = { ...state.enemies.find(e => e.type === 'mushroom'), x: -3, z: 4, homeX: -3, homeZ: 4,
    hp: 1_000_000, maxHp: 1_000_000, phase: 'stunned', phaseTime: 100, speed: 0, damage: 0 };
  state.enemies = [target]; state.spawners = []; state.fieldEvents.nextHazard = 999; state.fieldEvents.nextDiscovery = 999;
  let owlShots = 0, rootHits = 0;
  for (let tick = 0; tick < 1800; tick++) {
    stepGame(state, { manual: true }, 1 / 60);
    owlShots += state.events.filter(e => e.type === 'owl-shoot').length;
    rootHits += state.events.filter(e => e.type === 'hit' && e.source === 'roots').length;
    assert.ok(state.projectiles.length <= RULES.maxProjectiles && state.effects.length <= RULES.maxEffects);
    assert.ok(state.pendingSkills.length <= 1);
    assert.ok(state.projectiles.every(p => Number.isFinite(p.damage) && p.damage > 0 && p.life > 0));
  }
  assert.ok(owlShots >= 60); assert.ok(rootHits >= 12); assert.ok(target.hp < target.maxHp);
  assert.equal(state.player.form, 'druid'); assert.equal(state.owl.rank, 100);
  setPaused(state, true); const before = structuredClone(state);
  for (let i = 0; i < 120; i++) stepGame(state, {}, 1 / 60);
  assert.equal(state.player.skillCd, before.player.skillCd); assert.equal(state.owl.fireCd, before.owl.fireCd);
  assert.deepEqual(state.projectiles, before.projectiles); assert.equal(target.hp, before.enemies[0].hp);
});

test('version eight preserves previous progression and accepts all new rank-100 bounds without saving runtime state', () => {
  const legacy = { version: 7, gold: 812, xp: 2400, cargo: 12, checkpoint: 'ancient', questIndex: 9,
    upgrades: { attack: 8, health: 6, bag: 6 }, skills: { owl: 3, roots: 3 }, forms: { wolf: 2, bear: 2, dragon: 2 },
    gear: { equipped: 'moon', scrolls: 17, items: { moon: { copies: 5, level: 20, tier: 3 } } } };
  const migrated = normalizeProgress(legacy);
  assert.equal(migrated.version, 8);
  for (const key of ['gold', 'xp', 'cargo', 'checkpoint', 'questIndex', 'upgrades', 'skills', 'forms']) assert.deepEqual(migrated[key], legacy[key]);
  assert.deepEqual(migrated.gear.items.moon, legacy.gear.items.moon);
  const capped = normalizeProgress({ ...legacy, upgrades: { attack: 1000, health: 100, bag: 100 }, skills: { owl: 100, roots: 1000 },
    forms: { wolf: 1000, bear: 99, dragon: 99 }, gear: { equipped: 'moon', scrolls: 17, items: { moon: { copies: 5, level: 1000, tier: 1000 } } } });
  assert.deepEqual(capped.upgrades, { attack: 100, health: 100, bag: 100 });
  assert.deepEqual(capped.skills, { owl: 100, roots: 100 }); assert.deepEqual(capped.forms, { wolf: 99, bear: 99, dragon: 99 });
  assert.equal(capped.gear.items.moon.level, 100); assert.equal(capped.gear.items.moon.tier, 100);
  const state = createGame(815, capped); assert.deepEqual(exportProgress(state), capped);
  assert.equal('player' in exportProgress(state), false); assert.equal(state.player.form, 'druid');
});
