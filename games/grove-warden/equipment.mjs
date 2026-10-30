export const EQUIPMENT = Object.freeze([
  Object.freeze({ id: 'sprout', name: '새싹 지팡이', color: 0x8fea6b, description: '공격과 생명이 고르게 자라는 지팡이', attackStyle: 'single', attackLabel: '단발', attackDescription: '먼 거리에서 꾸준히 한 발', targetLabel: '보스 · 긴 사거리', tradeoff: '무리를 한 번에 때리기 어려워요' }),
  Object.freeze({ id: 'thorn', name: '가시 지팡이', color: 0xef987b, description: '공격 성장에 집중하는 지팡이', attackStyle: 'burst', attackLabel: '연발', attackDescription: '한 대상에게 3연발 집중', targetLabel: '보스 · 집중 화력', tradeoff: '가까이서 세 발을 이어 쏴야 해요' }),
  Object.freeze({ id: 'moon', name: '달빛 지팡이', color: 0xaaa4ff, description: '생명을 높이는 든든한 지팡이', attackStyle: 'spread', attackLabel: '방사', attackDescription: '5방향 · 1회 관통 · 대상마다 1타', targetLabel: '가까운 밀집 무리', tradeoff: '짧은 사거리 · 한 대상에는 1발만' }),
  Object.freeze({ id: 'ember', name: '불씨 지팡이', color: 0xff934f, description: '한곳에 모인 적을 터뜨리는 지팡이', attackStyle: 'explosive', attackLabel: '폭발', attackDescription: '맞은 곳의 2m 주변을 폭발', targetLabel: '뭉친 무리', tradeoff: '한 마리만 맞히면 화력이 낮아요' }),
]);
export const TIERS = Object.freeze(['일반', '고급', '희귀', '영웅']);
export const EQUIPMENT_MAX_LEVEL = 100;
export const EQUIPMENT_MAX_TIER = 100;
const STAFF_ATTACKS = Object.freeze({
  single: Object.freeze({ range: 5.4, interval: .62, damageScale: 1, projectileSpeed: 13, projectileLife: .55, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([0]), blastRadius: 0 }),
  burst: Object.freeze({ range: 3.8, interval: 1, damageScale: .68, projectileSpeed: 13, projectileLife: .45, burstCount: 3, burstSpacing: .12, spreadAngles: Object.freeze([0]), blastRadius: 0 }),
  spread: Object.freeze({ range: 3.2, interval: 1.05, damageScale: 1.2, projectileSpeed: 11, projectileLife: .36, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([-.6, -.3, 0, .3, .6]), blastRadius: 0, volleyHitLimit: 1, pierce: 1 }),
  explosive: Object.freeze({ range: 4.2, interval: 1.12, damageScale: .8, projectileSpeed: 11, projectileLife: .65, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([0]), blastRadius: 2 }),
});

const empty = Object.freeze({});
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : empty;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const integer = (value, max) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
const definitionFor = id => EQUIPMENT.find(item => item.id === id);

export function getTierName(tier) {
  const value = integer(tier, EQUIPMENT_MAX_TIER);
  return TIERS[value] ?? `영웅 ${value - 2}단계`;
}

export function getStaffAttack(id, player = {}) {
  const definition = definitionFor(id) ?? EQUIPMENT[0], profile = STAFF_ATTACKS[definition.attackStyle];
  const base = Number.isFinite(player.attackDamage) && player.attackDamage >= 0 ? player.attackDamage : 16;
  const multiplier = Number.isFinite(player.damageMult) && player.damageMult >= 0 ? player.damageMult : 1;
  return { ...profile, id: 'druid', weaponId: definition.id, weaponStyle: definition.attackStyle, groundOnly: false, damage: base * multiplier * profile.damageScale };
}

export function normalizeGear(raw) {
  const source = record(raw), rawItems = record(own(source, 'items')), items = {};
  for (const { id } of EQUIPMENT) {
    const item = record(own(rawItems, id));
    const copies = Math.max(id === 'sprout' ? 1 : 0, integer(own(item, 'copies'), 999));
    items[id] = {
      copies,
      level: copies ? integer(own(item, 'level'), EQUIPMENT_MAX_LEVEL) : 0,
      tier: copies ? integer(own(item, 'tier'), EQUIPMENT_MAX_TIER) : 0,
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
  const damage = id === 'thorn' ? 2 + level * 3 : id === 'moon' ? 1 + level : id === 'ember' ? 1 + level * 2 : level * 2;
  const health = id === 'moon' ? 20 + level * 8 : id === 'sprout' ? level * 3 : id === 'ember' ? 8 + level * 3 : 0;
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
  const gold = integer(own(source, 'gold'), 1000000000);
  const owned = item.copies > 0, maxed = item.level >= EQUIPMENT_MAX_LEVEL, promotionMaxed = item.tier >= EQUIPMENT_MAX_TIER;
  const enhanceCost = 15 + item.level * 10 + item.tier * 10, scrollCost = 1 + Math.floor(item.level / 5);
  const requiredLevel = 1;
  const promoteCost = 30 * (item.tier + 1), promoteScrollCost = 3 * (item.tier + 1), promoteRequiredLevel = 1;
  const current = itemBonuses(id, item), next = maxed ? null : itemBonuses(id, { ...item, level: item.level + 1 });
  return {
    id, name: definition.name, attackStyle: definition.attackStyle, attackLabel: definition.attackLabel, owned, equipped: owned && gear.equipped === id, canUnlock: !owned,
    copies: item.copies, level: item.level, tier: item.tier, tierName: getTierName(item.tier),
    ...current, nextDamage: next?.damage ?? null, nextHealth: next?.health ?? null,
    enhanceCost, scrollCost, requiredLevel,
    canEnhance: owned && !maxed && gold >= enhanceCost && gear.scrolls >= scrollCost,
    promoteCost, promoteScrollCost, promoteCopies: 2, promoteRequiredLevel,
    canPromote: owned && !promotionMaxed && item.copies >= 3 && gold >= promoteCost && gear.scrolls >= promoteScrollCost,
    maxed, promotionMaxed,
  };
}

export function applyEquipmentAction(progress, id, action) {
  if (record(progress) === empty) return false;
  const offer = getEquipmentOffer(progress, id);
  if (!offer) return false;
  const gear = normalizeGear(progress.gear);
  let goldCost = 0;
  if (action === 'unlock') {
    if (offer.owned) return false;
    gear.items[id] = { copies: 1, level: 0, tier: 0 }; gear.equipped = id;
  } else if (action === 'equip') {
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
