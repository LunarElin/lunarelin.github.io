import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT, TIERS, EQUIPMENT_MAX_LEVEL, EQUIPMENT_MAX_TIER, getTierName, normalizeGear, gearBonuses, getEquipmentOffer, applyEquipmentAction, grantEquipment, getStaffAttack } from '../equipment.mjs';

const progress = (overrides = {}) => ({ gold: 1000, level: 20, gear: normalizeGear(), ...overrides });
const snapshot = value => structuredClone(value);
function unchangedAfterFailure(state, id, action) {
  const before = snapshot(state), gear = state.gear;
  assert.equal(applyEquipmentAction(state, id, action), false);
  assert.deepEqual(state, before);
  assert.equal(state.gear, gear);
}

test('each staff has a distinct bounded attack profile computed from actual player damage once', () => {
  const player = { attackDamage: 40, damageMult: 1.5 }, before = snapshot(player);
  const single = getStaffAttack('sprout', player), burst = getStaffAttack('thorn', player);
  const spread = getStaffAttack('moon', player), blast = getStaffAttack('ember', player);
  const expected = [60, 40.8, 72, 48];
  [single.damage, burst.damage, spread.damage, blast.damage].forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
  assert.deepEqual([single.weaponStyle, burst.weaponStyle, spread.weaponStyle, blast.weaponStyle], ['single', 'burst', 'spread', 'explosive']);
  assert.equal(burst.burstCount, 3); assert.equal(burst.burstSpacing, .12);
  assert.equal(spread.spreadAngles.length, 5); assert.equal(spread.spreadAngles[2], 0);
  assert.equal(spread.volleyHitLimit, 1); assert.equal(spread.pierce, 1);
  assert.deepEqual([single.range, burst.range, spread.range, blast.range], [5.4, 3.8, 3.2, 4.2]);
  assert.ok(spread.range < single.range); assert.ok(spread.projectileLife < single.projectileLife);
  assert.equal(blast.blastRadius, 2); assert.ok(blast.interval > single.interval);
  assert.ok(Object.isFrozen(spread.spreadAngles)); assert.deepEqual(player, before);
  assert.equal(getStaffAttack('__proto__', { attackDamage: NaN, damageMult: Infinity }).damage, 16);
});

test('a missing base staff can be received and equipped once without spending earned resources', () => {
  const state = progress({ gold: 0 }); state.gear.scrolls = 7; state.gear.items.sprout.level = 3;
  for (const id of ['thorn', 'moon', 'ember']) {
    assert.equal(getEquipmentOffer(state, id).canUnlock, true);
    assert.equal(applyEquipmentAction(state, id, 'unlock'), true);
    assert.equal(state.gear.equipped, id);
    assert.deepEqual(state.gear.items[id], { copies: 1, level: 0, tier: 0 });
    assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 7); assert.equal(state.gear.items.sprout.level, 3);
    unchangedAfterFailure(state, id, 'unlock');
  }
  unchangedAfterFailure(state, 'unknown', 'unlock');
});

test('receiving a base staff cannot restore corrupt unowned growth or overwrite an owned staff', () => {
  const state = progress({ gear: { equipped: 'sprout', scrolls: 0, items: { ember: { copies: 0, level: 20, tier: 3 } } } });
  assert.equal(applyEquipmentAction(state, 'ember', 'unlock'), true);
  assert.deepEqual(state.gear.items.ember, { copies: 1, level: 0, tier: 0 });
  assert.deepEqual(gearBonuses(state.gear), { damage: 1, health: 8 });
  state.gear.items.ember = { copies: 4, level: 3, tier: 1 };
  unchangedAfterFailure(state, 'ember', 'unlock');
  assert.deepEqual(normalizeGear(JSON.parse(JSON.stringify(state.gear))), state.gear);
});

test('the explosive staff uses the same enhancement and duplicate promotion economy', () => {
  const state = progress(); assert.equal(applyEquipmentAction(state, 'ember', 'unlock'), true);
  assert.equal(applyEquipmentAction(state, 'ember', 'enhance'), false);
  state.gear.scrolls = 4; grantEquipment(state.gear, 'ember', 2);
  assert.equal(applyEquipmentAction(state, 'ember', 'enhance'), true);
  assert.equal(applyEquipmentAction(state, 'ember', 'promote'), true);
  assert.deepEqual(state.gear.items.ember, { copies: 1, level: 1, tier: 1 });
  assert.equal(state.gold, 955); assert.equal(state.gear.scrolls, 0);
  assert.deepEqual(gearBonuses(state.gear), { damage: 6, health: 21 });
});

test('the equipment and tier catalogs are bounded immutable data', () => {
  assert.deepEqual(EQUIPMENT.map(item => item.id), ['sprout', 'thorn', 'moon', 'ember']);
  assert.deepEqual(TIERS, ['일반', '고급', '희귀', '영웅']);
  assert.equal(EQUIPMENT_MAX_LEVEL, 100); assert.equal(EQUIPMENT_MAX_TIER, 100);
  assert.deepEqual([0, 1, 2, 3, 4, 100].map(getTierName), ['일반', '고급', '희귀', '영웅', '영웅 2단계', '영웅 98단계']);
  assert.ok(Object.isFrozen(EQUIPMENT) && Object.isFrozen(TIERS));
  for (const item of EQUIPMENT) {
    assert.ok(Object.isFrozen(item));
    assert.equal(typeof item.color, 'number');
    assert.ok(item.name && item.description);
  }
});

test('a new save owns one basic sprout and adds no combat stats', () => {
  const a = normalizeGear(), b = normalizeGear();
  assert.deepEqual(a, { equipped: 'sprout', scrolls: 0, items: {
    sprout: { copies: 1, level: 0, tier: 0 }, thorn: { copies: 0, level: 0, tier: 0 }, moon: { copies: 0, level: 0, tier: 0 }, ember: { copies: 0, level: 0, tier: 0 },
  } });
  assert.deepEqual(gearBonuses(a), { damage: 0, health: 0 });
  a.items.sprout.level = 5;
  assert.equal(b.items.sprout.level, 0);
});

test('normalization deeply whitelists saved data, rejects coercion and copies no references', () => {
  const raw = { equipped: 'thorn', scrolls: 100004.9, secret: 'discard', items: {
    sprout: { copies: -1, level: 101, tier: 101, derivedDamage: 9999 },
    thorn: { copies: 1008.7, level: 4.8, tier: 1.9 },
    moon: { copies: '9', level: NaN, tier: Infinity }, dragon: { copies: 20 },
  } };
  const before = snapshot(raw), gear = normalizeGear(raw);
  assert.deepEqual(gear, { equipped: 'thorn', scrolls: 99999, items: {
    sprout: { copies: 1, level: 100, tier: 100 }, thorn: { copies: 999, level: 4, tier: 1 }, moon: { copies: 0, level: 0, tier: 0 }, ember: { copies: 0, level: 0, tier: 0 },
  } });
  assert.deepEqual(raw, before);
  gear.items.thorn.level++;
  assert.equal(raw.items.thorn.level, 4.8);
  assert.deepEqual(normalizeGear([raw]), normalizeGear());
  assert.deepEqual(normalizeGear(Object.create(raw)), normalizeGear());
});

test('only a known owned item can be restored as equipped', () => {
  for (const equipped of ['thorn', 'unknown', '__proto__', null]) {
    assert.equal(normalizeGear({ equipped }).equipped, 'sprout');
  }
  assert.equal(normalizeGear({ equipped: 'moon', items: { moon: { copies: 1 } } }).equipped, 'moon');
});

test('unowned items discard corrupt enhancement and tier before their first drop', () => {
  const raw = { equipped: 'moon', items: { thorn: { copies: 0, level: 20, tier: 3 }, moon: { copies: -1, level: 12, tier: 2 } } };
  const gear = normalizeGear(raw);
  for (const id of ['thorn', 'moon']) {
    assert.deepEqual(gear.items[id], { copies: 0, level: 0, tier: 0 });
    assert.deepEqual(grantEquipment(gear, id), { copies: 1, scrolls: 0 });
    const state = { gear };
    assert.equal(applyEquipmentAction(state, id, 'equip'), true);
    assert.deepEqual(gearBonuses(state.gear), id === 'thorn' ? { damage: 2, health: 0 } : { damage: 1, health: 20 });
  }
  const owned = normalizeGear({ items: { thorn: { copies: 1, level: 20, tier: 3 } } });
  assert.deepEqual(owned.items.thorn, { copies: 1, level: 20, tier: 3 });
  assert.equal(raw.items.thorn.level, 20);
});

test('bonuses recompute each staff exactly and never mutate the saved gear', () => {
  const gear = normalizeGear({ items: {
    sprout: { copies: 1, level: 4, tier: 2 }, thorn: { copies: 1, level: 4, tier: 2 }, moon: { copies: 1, level: 4, tier: 2 },
  } });
  const expected = { sprout: { damage: 14, health: 32 }, thorn: { damage: 20, health: 20 }, moon: { damage: 11, health: 72 } };
  for (const id of ['sprout', 'thorn', 'moon', 'sprout']) {
    gear.equipped = id; const before = snapshot(gear);
    assert.deepEqual(gearBonuses(gear), expected[id]);
    assert.deepEqual(gear, before);
  }
});

test('offers preview unowned items without granting them and do not mutate progress', () => {
  const state = progress({ gold: 15, level: 1 }), before = snapshot(state);
  const sprout = getEquipmentOffer(state, 'sprout');
  assert.equal(sprout.owned, true); assert.equal(sprout.equipped, true);
  assert.deepEqual([sprout.damage, sprout.health, sprout.nextDamage, sprout.nextHealth], [0, 0, 2, 3]);
  assert.deepEqual([sprout.enhanceCost, sprout.scrollCost, sprout.requiredLevel], [15, 1, 1]);
  assert.equal(sprout.canEnhance, false);
  const thorn = getEquipmentOffer(state, 'thorn');
  assert.equal(thorn.owned, false); assert.equal(thorn.canEnhance, false); assert.equal(thorn.canPromote, false);
  assert.deepEqual([thorn.damage, thorn.health], [2, 0]);
  assert.equal(getEquipmentOffer(state, 'unknown'), null);
  assert.deepEqual(state, before);
});

test('offer costs, tier bonuses and next values use current gear with no character level gates', () => {
  const state = progress({ gold: 85, level: 1 });
  state.gear.items.thorn = { copies: 3, level: 6, tier: 1 }; state.gear.scrolls = 6;
  const offer = getEquipmentOffer(state, 'thorn');
  assert.deepEqual([offer.damage, offer.health, offer.nextDamage, offer.nextHealth], [23, 10, 26, 10]);
  assert.deepEqual([offer.enhanceCost, offer.scrollCost, offer.requiredLevel], [85, 2, 1]);
  assert.deepEqual([offer.promoteCost, offer.promoteScrollCost, offer.promoteRequiredLevel, offer.promoteCopies], [60, 6, 1, 2]);
  assert.equal(offer.canEnhance, true); assert.equal(offer.canPromote, true);
  assert.equal(offer.tierName, '고급');
});

test('enhancing charges exactly once and changes only gear and gold', () => {
  const marker = { untouched: true }, state = progress({ gold: 15, level: 1, marker, revision: 7 });
  state.gear.scrolls = 1;
  assert.equal(applyEquipmentAction(state, 'sprout', 'enhance'), true);
  assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 0);
  assert.deepEqual(state.gear.items.sprout, { copies: 1, level: 1, tier: 0 });
  assert.deepEqual(gearBonuses(state.gear), { damage: 2, health: 3 });
  assert.equal(state.level, 1); assert.equal(state.revision, 7); assert.equal(state.marker, marker);
  unchangedAfterFailure(state, 'sprout', 'enhance');
});

test('failed enhancement or invalid actions preserve the original object and every resource', () => {
  for (const [gold, scrolls, level] of [[14, 1, 1], [15, 0, 1]]) {
    const state = progress({ gold, level }); state.gear.scrolls = scrolls;
    unchangedAfterFailure(state, 'sprout', 'enhance');
  }
  const state = progress(); state.gear.scrolls = 999;
  for (const [id, action] of [['thorn', 'equip'], ['thorn', 'enhance'], ['thorn', 'promote'], ['unknown', 'equip'], ['sprout', 'delete'], ['sprout', 'equip']]) {
    unchangedAfterFailure(state, id, action);
  }
  for (const raw of [null, undefined, [], 3]) assert.equal(applyEquipmentAction(raw, 'sprout', 'enhance'), false);
});

test('switching equipment restores the selected additive bonus without drift or spending', () => {
  const state = progress(); grantEquipment(state.gear, 'thorn'); grantEquipment(state.gear, 'moon');
  for (const [id, bonus] of [['thorn', { damage: 2, health: 0 }], ['moon', { damage: 1, health: 20 }], ['sprout', { damage: 0, health: 0 }]]) {
    assert.equal(applyEquipmentAction(state, id, 'equip'), true);
    assert.deepEqual(gearBonuses(state.gear), bonus);
    assert.equal(state.gold, 1000); assert.equal(state.gear.scrolls, 0);
  }
});

test('promotion consumes two duplicate copies, preserves the owned item and retains enhancement', () => {
  const state = progress({ gold: 30, level: 3 });
  state.gear.items.sprout = { copies: 3, level: 4, tier: 0 }; state.gear.scrolls = 3;
  assert.equal(applyEquipmentAction(state, 'sprout', 'promote'), true);
  assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 0); assert.equal(state.gear.equipped, 'sprout');
  assert.deepEqual(state.gear.items.sprout, { copies: 1, level: 4, tier: 1 });
  assert.deepEqual(gearBonuses(state.gear), { damage: 11, health: 22 });
});

test('promotion independently requires duplicate copies, gold and scrolls even at character level one', () => {
  for (const [copies, gold, scrolls, level] of [[2, 30, 3, 1], [3, 29, 3, 1], [3, 30, 2, 1]]) {
    const state = progress({ gold, level }); state.gear.scrolls = scrolls; state.gear.items.sprout.copies = copies;
    unchangedAfterFailure(state, 'sprout', 'promote');
  }
});

test('the first three promotion names and costs remain compatible and progression continues beyond epic', () => {
  const state = progress({ gold: 180, level: 1 }); state.gear.scrolls = 18; state.gear.items.sprout.copies = 7;
  for (let tier = 1; tier <= 3; tier++) {
    assert.equal(applyEquipmentAction(state, 'sprout', 'promote'), true);
    assert.equal(state.gear.items.sprout.tier, tier);
  }
  const offer = getEquipmentOffer(state, 'sprout');
  assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 0); assert.equal(offer.copies, 1);
  assert.equal(offer.tierName, '영웅'); assert.equal(offer.promotionMaxed, false); assert.equal(offer.canPromote, false);
  unchangedAfterFailure(state, 'sprout', 'promote');
  state.gold = 120; grantEquipment(state.gear, 'sprout', 2, 12);
  assert.equal(applyEquipmentAction(state, 'sprout', 'promote'), true);
  assert.equal(getEquipmentOffer(state, 'sprout').tierName, '영웅 2단계');
  assert.deepEqual(state.gear.items.sprout, { copies: 1, level: 0, tier: 4 });
  assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 0);
});

test('enhancement one hundred is the hard cap and previews no nonexistent next level', () => {
  const state = progress({ gold: 2005, level: 1 }); state.gear.scrolls = 20; state.gear.items.sprout = { copies: 1, level: 99, tier: 100 };
  assert.equal(applyEquipmentAction(state, 'sprout', 'enhance'), true);
  const offer = getEquipmentOffer(state, 'sprout');
  assert.equal(state.gold, 0); assert.equal(state.gear.scrolls, 0);
  assert.equal(offer.level, 100); assert.equal(offer.maxed, true); assert.equal(offer.canEnhance, false);
  assert.equal(offer.nextDamage, null); assert.equal(offer.nextHealth, null);
  assert.deepEqual(gearBonuses(state.gear), { damage: 500, health: 1300 });
  unchangedAfterFailure(state, 'sprout', 'enhance');
});

test('all four staffs complete one hundred enhancements and promotions at level one with finite exact costs', () => {
  for (const { id } of EQUIPMENT) {
    const state = progress({ gold: 1000000000, level: 1 });
    state.gear = normalizeGear({ equipped: id, scrolls: 99999, items: { [id]: { copies: 201, level: 0, tier: 0 } } });
    for (let level = 1; level <= EQUIPMENT_MAX_LEVEL; level++) {
      const offer = getEquipmentOffer(state, id);
      assert.equal(offer.requiredLevel, 1); assert.equal(offer.canEnhance, true);
      assert.equal(applyEquipmentAction(state, id, 'enhance'), true);
      assert.equal(state.gear.items[id].level, level);
    }
    for (let tier = 1; tier <= EQUIPMENT_MAX_TIER; tier++) {
      const offer = getEquipmentOffer(state, id);
      assert.equal(offer.promoteRequiredLevel, 1); assert.equal(offer.canPromote, true);
      assert.equal(applyEquipmentAction(state, id, 'promote'), true);
      assert.equal(state.gear.items[id].tier, tier);
      assert.equal(getEquipmentOffer(state, id).tierName, getTierName(tier));
    }
    const offer = getEquipmentOffer(state, id), bonuses = gearBonuses(state.gear);
    assert.equal(state.gold, 999797500); assert.equal(state.gear.scrolls, 83799);
    assert.deepEqual(state.gear.items[id], { copies: 1, level: 100, tier: 100 });
    assert.ok(offer.maxed && offer.promotionMaxed); assert.equal(offer.nextDamage, null); assert.equal(offer.nextHealth, null);
    assert.ok(Object.values(bonuses).every(Number.isFinite));
    assert.ok(Number.isFinite(offer.enhanceCost) && Number.isFinite(offer.promoteCost));
    state.gold = 1000000000; state.gear.scrolls = 99999; state.gear.items[id].copies = 999;
    unchangedAfterFailure(state, id, 'enhance'); unchangedAfterFailure(state, id, 'promote');
  }
});

test('old version seven gear retains earned growth and extended gear round trips without exceeding one hundred', () => {
  const saved = { version: 7, gold: 81, level: 1, gear: { equipped: 'moon', scrolls: 17, items: {
    sprout: { copies: 3, level: 20, tier: 3 }, moon: { copies: 5, level: 12, tier: 2 },
    thorn: { copies: 1, level: 99, tier: 99 }, ember: { copies: 1, level: 100, tier: 100 },
  } } }, before = snapshot(saved);
  const restored = normalizeGear(JSON.parse(JSON.stringify(saved)).gear);
  assert.deepEqual(restored, saved.gear); assert.deepEqual(saved, before);
  assert.equal(getEquipmentOffer({ ...saved, gear: restored }, 'moon').maxed, false);
  assert.deepEqual(normalizeGear(JSON.parse(JSON.stringify(restored))), restored);
  for (const value of [100.9, 101, Number.MAX_VALUE]) {
    const capped = normalizeGear({ items: { sprout: { copies: 1, level: value, tier: value } } });
    assert.deepEqual(capped.items.sprout, { copies: 1, level: 100, tier: 100 });
  }
});

test('grants report accepted copies and scrolls rather than quantities lost to storage caps', () => {
  const gear = normalizeGear(); gear.items.sprout.copies = 998; gear.scrolls = 99997;
  assert.deepEqual(grantEquipment(gear, 'sprout', 4, 5), { copies: 1, scrolls: 2 });
  assert.equal(gear.items.sprout.copies, 999); assert.equal(gear.scrolls, 99999);
  const before = snapshot(gear);
  assert.deepEqual(grantEquipment(gear, 'sprout', 5, 5), { copies: 0, scrolls: 0 });
  assert.deepEqual(gear, before);
});

test('scroll-only drops grant no phantom equipment and saved gear round-trips independently', () => {
  const gear = normalizeGear();
  assert.deepEqual(grantEquipment(gear, null, 0, 5), { copies: 0, scrolls: 5 });
  assert.deepEqual(grantEquipment(gear, 'moon', 0, 2), { copies: 0, scrolls: 2 });
  assert.equal(gear.items.moon.copies, 0);
  grantEquipment(gear, 'thorn', 2);
  const restored = normalizeGear(JSON.parse(JSON.stringify(gear)));
  assert.deepEqual(restored, gear); assert.notEqual(restored.items.thorn, gear.items.thorn);
});

test('invalid grant ids or amounts do not add resources or mutate gear', () => {
  const gear = normalizeGear(), before = snapshot(gear);
  for (const [id, copies, scrolls] of [['unknown', 3, 4], ['__proto__', 1, 1], ['sprout', -2, -3], ['sprout', NaN, Infinity], ['sprout', '2', '3']]) {
    assert.deepEqual(grantEquipment(gear, id, copies, scrolls), { copies: 0, scrolls: 0 });
    assert.deepEqual(gear, before);
  }
  assert.deepEqual(grantEquipment(null, 'sprout'), { copies: 0, scrolls: 0 });
});
