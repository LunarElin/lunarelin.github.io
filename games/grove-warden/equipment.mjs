export const EQUIPMENT = Object.freeze([
  Object.freeze({ id: 'sprout', name: '새싹 지팡이', color: 0x8fea6b, description: '공격과 생명이 고르게 자라는 지팡이' }),
  Object.freeze({ id: 'thorn', name: '가시 지팡이', color: 0xef987b, description: '공격 성장에 집중하는 지팡이' }),
  Object.freeze({ id: 'moon', name: '달빛 지팡이', color: 0xaaa4ff, description: '생명을 높이는 든든한 지팡이' }),
]);
export const TIERS = Object.freeze(['일반', '고급', '희귀', '영웅']);

const empty = Object.freeze({});
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : empty;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const integer = (value, max) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
const definitionFor = id => EQUIPMENT.find(item => item.id === id);

export function normalizeGear(raw) {
  const source = record(raw), rawItems = record(own(source, 'items')), items = {};
  for (const { id } of EQUIPMENT) {
    const item = record(own(rawItems, id));
    const copies = Math.max(id === 'sprout' ? 1 : 0, integer(own(item, 'copies'), 999));
    items[id] = {
      copies,
      level: copies ? integer(own(item, 'level'), 20) : 0,
      tier: copies ? integer(own(item, 'tier'), 3) : 0,
    };
  }
  const selected = own(source, 'equipped');
  return {
    equipped: definitionFor(selected) && items[selected].copies > 0 ? selected : 'sprout',
    scrolls: integer(own(source, 'scrolls'), 99999),
    items,
  };
}

function itemBonuses(id, { level, tier }) {
  const damage = id === 'thorn' ? 2 + level * 3 : id === 'moon' ? 1 + level : level * 2;
  const health = id === 'moon' ? 20 + level * 8 : id === 'sprout' ? level * 3 : 0;
  return { damage: damage + tier * 3, health: health + tier * 10 };
}

export function gearBonuses(raw) {
  const gear = normalizeGear(raw);
  return itemBonuses(gear.equipped, gear.items[gear.equipped]);
}

export function getEquipmentOffer(progress, id) {
  const definition = definitionFor(id);
  if (!definition) return null;
  const source = record(progress), gear = normalizeGear(own(source, 'gear')), item = gear.items[id];
  const gold = integer(own(source, 'gold'), 1000000000), playerLevel = Math.max(1, integer(own(source, 'level'), 50));
  const owned = item.copies > 0, maxed = item.level >= 20, promotionMaxed = item.tier >= 3;
  const enhanceCost = 15 + item.level * 10 + item.tier * 10, scrollCost = 1 + Math.floor(item.level / 5);
  const requiredLevel = 1 + Math.floor(item.level / 2);
  const promoteCost = 30 * (item.tier + 1), promoteScrollCost = 3 * (item.tier + 1), promoteRequiredLevel = 3 + item.tier * 3;
  const current = itemBonuses(id, item), next = maxed ? null : itemBonuses(id, { ...item, level: item.level + 1 });
  return {
    id, name: definition.name, owned, equipped: owned && gear.equipped === id,
    copies: item.copies, level: item.level, tier: item.tier, tierName: TIERS[item.tier],
    ...current, nextDamage: next?.damage ?? null, nextHealth: next?.health ?? null,
    enhanceCost, scrollCost, requiredLevel,
    canEnhance: owned && !maxed && playerLevel >= requiredLevel && gold >= enhanceCost && gear.scrolls >= scrollCost,
    promoteCost, promoteScrollCost, promoteCopies: 2, promoteRequiredLevel,
    canPromote: owned && !promotionMaxed && item.copies >= 3 && playerLevel >= promoteRequiredLevel && gold >= promoteCost && gear.scrolls >= promoteScrollCost,
    maxed, promotionMaxed,
  };
}

export function applyEquipmentAction(progress, id, action) {
  if (record(progress) === empty) return false;
  const offer = getEquipmentOffer(progress, id);
  if (!offer) return false;
  const gear = normalizeGear(progress.gear);
  let goldCost = 0;
  if (action === 'equip') {
    if (!offer.owned || offer.equipped) return false;
    gear.equipped = id;
  } else if (action === 'enhance') {
    if (!offer.canEnhance) return false;
    gear.items[id].level++;
    gear.scrolls -= offer.scrollCost;
    goldCost = offer.enhanceCost;
  } else if (action === 'promote') {
    if (!offer.canPromote) return false;
    gear.items[id].copies -= offer.promoteCopies;
    gear.items[id].tier++;
    gear.scrolls -= offer.promoteScrollCost;
    goldCost = offer.promoteCost;
  } else return false;
  progress.gear = gear;
  if (goldCost) progress.gold = integer(progress.gold, 1000000000) - goldCost;
  return true;
}

// A null id grants scrolls only. Report the accepted amount when storage is full.
export function grantEquipment(gear, id, copies = 1, scrolls = 0) {
  if (record(gear) === empty || id != null && !definitionFor(id)) return { copies: 0, scrolls: 0 };
  const next = normalizeGear(gear);
  const gainedCopies = id == null ? 0 : Math.min(999 - next.items[id].copies, integer(copies, 999));
  const gainedScrolls = Math.min(99999 - next.scrolls, integer(scrolls, 99999));
  if (!gainedCopies && !gainedScrolls) return { copies: 0, scrolls: 0 };
  if (id != null) next.items[id].copies += gainedCopies;
  next.scrolls += gainedScrolls;
  Object.assign(gear, next);
  return { copies: gainedCopies, scrolls: gainedScrolls };
}
