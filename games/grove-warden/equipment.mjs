// Weapons choose a combat pattern. There are no item ranks, copies or materials.
export const WEAPONS = Object.freeze([
  { id: 'sprout', name: '새싹 지팡이', color: 0x8fea6b, attackStyle: 'single', attackLabel: '단발', targetLabel: '보스 · 긴 사거리', tradeoff: '한 번에 한 마리' },
  { id: 'thorn', name: '가시 지팡이', color: 0xef987b, attackStyle: 'burst', attackLabel: '연발', targetLabel: '보스 · 집중 화력', tradeoff: '세 발을 이어 쏘는 동안 접근을 허용해요' },
  { id: 'moon', name: '달빛 지팡이', color: 0xaaa4ff, attackStyle: 'spread', attackLabel: '방사', targetLabel: '가까운 밀집 무리', tradeoff: '짧은 사거리 · 대상마다 한 발만' },
  { id: 'ember', name: '불씨 지팡이', color: 0xff934f, attackStyle: 'explosive', attackLabel: '폭발', targetLabel: '뭉친 무리', tradeoff: '한 마리 상대 화력은 낮아요' },
  { id: 'sword', name: '숲의 검', color: 0xcbd5df, attackStyle: 'slash', attackLabel: '연속 베기', targetLabel: '근접 · 빠른 한 마리 사냥', tradeoff: '짧은 사거리 · 좁은 부채꼴' },
  { id: 'axe', name: '숲의 도끼', color: 0xe79a4e, attackStyle: 'cleave', attackLabel: '크게 베기', targetLabel: '근접 · 넓은 무리', tradeoff: '공격 뒤 긴 대기 · 근접 위험' },
  { id: 'spear', name: '숲의 창', color: 0x83b5a3, attackStyle: 'thrust', attackLabel: '관통 찌르기', targetLabel: '중거리 · 일렬로 선 적', tradeoff: '좁은 직선 · 옆으로 퍼진 적에 약해요' },
].map(Object.freeze));

const ATTACKS = Object.freeze({
  single: Object.freeze({ range: 5.4, interval: .62, damageScale: 1, projectileSpeed: 13, projectileLife: .55, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([0]), blastRadius: 0 }),
  burst: Object.freeze({ range: 3.8, interval: 1, damageScale: .68, projectileSpeed: 13, projectileLife: .45, burstCount: 3, burstSpacing: .12, spreadAngles: Object.freeze([0]), blastRadius: 0 }),
  spread: Object.freeze({ range: 3.2, interval: 1.05, damageScale: 1.2, projectileSpeed: 11, projectileLife: .36, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([-.6, -.3, 0, .3, .6]), blastRadius: 0, volleyHitLimit: 1, pierce: 1 }),
  explosive: Object.freeze({ range: 4.2, interval: 1.12, damageScale: .8, projectileSpeed: 11, projectileLife: .65, burstCount: 1, burstSpacing: 0, spreadAngles: Object.freeze([0]), blastRadius: 2 }),
  slash: Object.freeze({ range: 1.65, interval: .48, damageScale: 1.5, melee: true, arc: 1.6, width: 0 }),
  cleave: Object.freeze({ range: 1.9, interval: 1.08, damageScale: 2.4, melee: true, arc: 2.7, width: 0 }),
  thrust: Object.freeze({ range: 2.8, interval: .78, damageScale: 1.65, melee: true, arc: 0, width: .65 }),
});

const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const integer = (value, max) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;

export function normalizeWeapon(id, legacyGear) {
  if (WEAPONS.some(item => item.id === id)) return id;
  const old = record(legacyGear), selected = old.equipped;
  return WEAPONS.slice(0, 4).some(item => item.id === selected) && integer(record(record(old.items)[selected]).copies, 999) > 0 ? selected : 'sprout';
}

export function activeWeapon(progress) {
  return WEAPONS.find(item => item.id === normalizeWeapon(progress?.weapon)) ?? WEAPONS[0];
}

export function getWeaponAttack(id, player = {}) {
  const definition = WEAPONS.find(item => item.id === id) ?? WEAPONS[0], profile = ATTACKS[definition.attackStyle];
  const base = Number.isFinite(player.attackDamage) && player.attackDamage >= 0 ? player.attackDamage : 16;
  const multiplier = Number.isFinite(player.damageMult) && player.damageMult >= 0 ? player.damageMult : 1;
  return { ...profile, id: 'druid', weaponId: definition.id, weaponStyle: definition.attackStyle,
    attackType: profile.melee ? definition.attackStyle : 'projectile', groundOnly: !!profile.melee, damage: base * multiplier * profile.damageScale };
}

// v8 keeps its original record. v9 converts the removed inventory to gold once.
// Enhancement is refunded at the final promotion rate, covering any purchase order.
export function legacyEquipmentRefund(raw) {
  const gear = record(raw), items = record(gear.items);
  let gold = integer(gear.scrolls, 99999) * 5;
  for (const { id } of WEAPONS.slice(0, 4)) {
    const item = record(items[id]), copies = integer(item.copies, 999);
    if (!copies) continue;
    const level = integer(item.level, 100), tier = integer(item.tier, 100);
    gold += level * (15 + tier * 10) + 5 * level * (level - 1) + 15 * tier * (tier + 1);
    gold += Math.max(0, copies - 1) * 10;
  }
  return gold;
}
