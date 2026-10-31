import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, normalizeWeapon, activeWeapon, getWeaponAttack, legacyEquipmentRefund } from '../equipment.mjs';
import { createGame, selectWeapon, exportProgress, normalizeProgress } from '../rules.mjs';

test('seven free combat patterns have finite profiles and share the same stat growth', () => {
  assert.deepEqual(WEAPONS.map(w => w.id), ['sprout', 'thorn', 'moon', 'ember', 'sword', 'axe', 'spear']);
  for (const weapon of WEAPONS) {
    const base = getWeaponAttack(weapon.id, { attackDamage: 20, damageMult: 1 });
    const grown = getWeaponAttack(weapon.id, { attackDamage: 20, damageMult: 2 });
    assert.equal(base.weaponId, weapon.id); assert.equal(grown.damage, base.damage * 2);
    assert.ok(base.range > 0 && base.interval > 0 && base.damage > 0);
    assert.ok([base.range, base.interval, base.damage].every(Number.isFinite));
    assert.equal(base.groundOnly, ['sword', 'axe', 'spear'].includes(weapon.id));
    assert.equal(activeWeapon({ weapon: weapon.id }), weapon);
  }
  assert.ok(getWeaponAttack('sword').interval < getWeaponAttack('axe').interval);
  assert.ok(getWeaponAttack('sword').range < getWeaponAttack('spear').range);
  assert.ok(getWeaponAttack('axe').arc > getWeaponAttack('sword').arc);
});

test('invalid choices and inherited item ids fall back safely without inventory', () => {
  for (const id of [null, undefined, {}, [], '__proto__', 'unknown', 0]) {
    assert.equal(normalizeWeapon(id), 'sprout');
    assert.equal(getWeaponAttack(id).weaponId, 'sprout');
  }
  assert.equal(normalizeWeapon(null, { equipped: 'moon', items: { moon: { copies: 1 } } }), 'moon');
  assert.equal(normalizeWeapon(null, { equipped: 'moon', items: { moon: { copies: 0 } } }), 'sprout');
  assert.equal(normalizeWeapon('axe', { equipped: 'moon', items: { moon: { copies: 1 } } }), 'axe');
});

test('selection requires a live or paused camp visit and never costs gold or changes derived stats', () => {
  const state = createGame(91, { gold: 37 }), original = exportProgress(state);
  assert.equal(selectWeapon(state, 'sword'), false);
  state.phase = 'playing'; state.inCamp = false;
  assert.equal(selectWeapon(state, 'sword'), false); assert.deepEqual(exportProgress(state), original);
  state.inCamp = true;
  const stats = [state.player.attackDamage, state.player.maxHp, state.player.skillDamage, state.player.hp];
  for (const { id } of WEAPONS.slice(1)) {
    const revision = state.revision;
    state.pendingStaffShots.push({ time: 1 });
    assert.equal(selectWeapon(state, id), true);
    assert.equal(state.revision, revision + 1); assert.equal(state.pendingStaffShots.length, 0);
    assert.equal(state.progress.weapon, id); assert.equal(state.progress.gold, 37);
    assert.deepEqual([state.player.attackDamage, state.player.maxHp, state.player.skillDamage, state.player.hp], stats);
    assert.equal(selectWeapon(state, id), false);
    assert.equal(selectWeapon(state, '__proto__'), false);
  }
  state.phase = 'paused'; assert.equal(selectWeapon(state, 'sprout'), true);
  state.phase = 'down'; assert.equal(selectWeapon(state, 'sword'), false);
  assert.equal('gear' in exportProgress(state), false);
});

test('v8 removed inventory is refunded once while stats skills forms and checkpoint are preserved', () => {
  const old = { version: 8, gold: 81, xp: 1320, questIndex: 9, checkpoint: 'sky', cargo: 7,
    upgrades: { attack: 5, health: 4, bag: 1 }, skills: { owl: 3, roots: 2 }, forms: { wolf: 2, bear: 1, dragon: 0 },
    gear: { equipped: 'moon', scrolls: 17, items: { sprout: { copies: 3, level: 20, tier: 3 }, moon: { copies: 5, level: 12, tier: 2 } } } };
  const before = structuredClone(old), migrated = normalizeProgress(old);
  // 20*45 + 5*20*19 + 15*3*4 + 2*10; 12*35 + 5*12*11 + 15*2*3 + 4*10; 17*5.
  const refund = 900 + 1900 + 180 + 20 + 420 + 660 + 90 + 40 + 85;
  assert.equal(legacyEquipmentRefund(old.gear), refund);
  assert.equal(migrated.gold, old.gold + refund); assert.equal(migrated.weapon, 'moon');
  assert.equal(migrated.version, 9); assert.equal('gear' in migrated, false);
  for (const key of ['xp', 'cargo', 'questIndex', 'checkpoint', 'upgrades', 'skills', 'forms']) assert.deepEqual(migrated[key], old[key]);
  assert.deepEqual(old, before); assert.deepEqual(normalizeProgress(migrated), migrated);
  const state = createGame(92, migrated); assert.deepEqual(exportProgress(state), migrated);
  const injected = normalizeProgress({ ...migrated, gear: old.gear });
  assert.equal(injected.gold, migrated.gold);
});

test('fresh progress receives no phantom refund and invalid legacy values cannot overflow storage', () => {
  assert.equal(normalizeProgress().gold, 0); assert.equal(legacyEquipmentRefund(), 0);
  assert.equal(legacyEquipmentRefund({ scrolls: Infinity, items: { sprout: { copies: 0, level: 100, tier: 100 } } }), 0);
  const state = normalizeProgress({ version: 8, gold: 999999999, gear: { scrolls: 999999999, items: {
    sprout: { copies: 99999, level: 99999, tier: 99999 }, unknown: { copies: 100, level: 100, tier: 100 } } } });
  assert.equal(state.gold, 1000000000); assert.ok(Number.isSafeInteger(state.gold));
});
