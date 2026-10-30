export const FORMS = Object.freeze([
  Object.freeze({ id: 'wolf', name: '늑대', firstLevel: 4, maxLevel: 100, baseCost: 45,
    description: '고속 적에게 빠른 근접 공격', counterLabel: '고속 적 대응',
    damageScale: 1.05, range: 2.2, interval: 0.32, attackKind: 'melee', groundOnly: false, airborneBonus: 1, homing: false }),
  Object.freeze({ id: 'bear', name: '곰', firstLevel: 8, maxLevel: 100, baseCost: 70,
    description: '모여 있는 지면의 적에게 넓은 강타', counterLabel: '군체 대응',
    damageScale: 1.9, range: 3.3, interval: 1.15, attackKind: 'slam', groundOnly: true, airborneBonus: 1, homing: false }),
  Object.freeze({ id: 'dragon', name: '용', firstLevel: 12, maxLevel: 100, baseCost: 100,
    description: '유도 화염으로 공중의 적에게 추가 피해', counterLabel: '공중 적 대응',
    damageScale: 1.2, range: 6.2, interval: 0.72, attackKind: 'projectile', groundOnly: false, airborneBonus: 1.6, homing: true }),
]);

const own = (source, key) => source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
const integer = (value, max) => Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
const levelOf = progress => Math.max(1, integer(progress?.level, 50));
const definitionFor = id => FORMS.find(form => form.id === id);
const finite = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;

export function normalizeForms(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(FORMS.map(form => [form.id, integer(own(source, form.id), form.maxLevel - 1)]));
}

export function formRank(progress, id) {
  const definition = definitionFor(id);
  if (!definition || levelOf(progress) < definition.firstLevel) return 0;
  return 1 + integer(own(progress?.forms, id), definition.maxLevel - 1);
}

export function getFormDefinition(id, rank, player = {}) {
  const definition = definitionFor(id);
  const effectiveRank = integer(rank, definition?.maxLevel ?? 0);
  if (!definition || effectiveRank < 1) return null;
  const damage = finite(player?.attackDamage, 16) * finite(player?.damageMult, 1) * definition.damageScale * (1 + (effectiveRank - 1) * 0.22);
  return { ...definition, rank: effectiveRank, damage,
    ...(id === 'dragon' ? { missileSpeed: 9, turnRate: 5.5, life: 2.2 } : {}) };
}

function offerFor(progress, player, id) {
  const definition = definitionFor(id);
  if (!definition) return null;
  const level = integer(own(progress?.forms, id), definition.maxLevel - 1);
  const rank = formRank(progress, id), unlocked = rank > 0, maxed = rank === definition.maxLevel;
  const requiredLevel = definition.firstLevel;
  const cost = !unlocked || maxed ? 0 : Math.round(definition.baseCost * (1 + level * 0.8));
  const current = getFormDefinition(id, rank, player), next = maxed ? null : getFormDefinition(id, Math.max(1, rank + 1), player);
  const locked = levelOf(progress) < requiredLevel;
  return { ...definition, level, purchases: level, rank, unlocked, requiredLevel, cost, locked, maxed,
    currentDamage: current ? Math.round(current.damage) : null, currentRange: current?.range ?? null, currentInterval: current?.interval ?? null,
    nextDamage: next ? Math.round(next.damage) : null, nextRange: next?.range ?? null, nextInterval: next?.interval ?? null,
    damage: current ? Math.round(current.damage) : null, range: current?.range ?? null, interval: current?.interval ?? null };
}

export function getFormOffer(state, id) {
  const offer = offerFor(state?.progress, state?.player, id);
  if (!offer) return null;
  return { ...offer, canBuy: offer.unlocked && !offer.locked && !offer.maxed &&
    state.inCamp === true && ['playing', 'paused'].includes(state.phase) && finite(state.progress?.gold, 0) >= offer.cost };
}

export function applyFormUpgrade(progress, id) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return false;
  const offer = offerFor(progress, undefined, id);
  if (!offer || !offer.unlocked || offer.locked || offer.maxed || finite(progress.gold, 0) < offer.cost) return false;
  progress.forms = { ...normalizeForms(progress.forms), [id]: offer.level + 1 };
  progress.gold -= offer.cost;
  return true;
}

export function chooseForm(state) {
  if (state?.player?.hp <= 0 || state?.phase === 'down') return { form: 'druid', reason: 'down', targetId: null };
  if (state?.inCamp) return { form: 'druid', reason: 'camp', targetId: null };
  if (!state?.player || state.phase !== 'playing') return { form: 'druid', reason: 'none', targetId: null };
  const progress = Number.isFinite(state.progress?.level) ? state.progress : { ...state.progress, level: state.player.level };
  let airborne = null, fast = null, swarm = null, swarmCount = 0;
  let airDistance = 6.2, fastDistance = 6.2, swarmDistance = 5.5;
  for (const enemy of state.enemies || []) {
    if (enemy.hp <= 0 || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.z)) continue;
    const distance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
    if (enemy.trait === 'airborne' && (distance < airDistance || distance === airDistance && (!airborne || enemy.id < airborne.id))) {
      airborne = enemy; airDistance = distance;
    } else if (enemy.trait === 'fast' && (distance < fastDistance || distance === fastDistance && (!fast || enemy.id < fast.id))) {
      fast = enemy; fastDistance = distance;
    } else if (enemy.trait === 'swarm' && distance <= 5.5) {
      swarmCount++;
      if (distance < swarmDistance || distance === swarmDistance && (!swarm || enemy.id < swarm.id)) { swarm = enemy; swarmDistance = distance; }
    }
  }
  if (airborne && formRank(progress, 'dragon')) return { form: 'dragon', reason: 'airborne', targetId: airborne.id };
  if (fast && formRank(progress, 'wolf')) return { form: 'wolf', reason: 'fast', targetId: fast.id };
  if (swarmCount >= 3 && formRank(progress, 'bear')) return { form: 'bear', reason: 'swarm', targetId: swarm.id };
  return { form: 'druid', reason: 'none', targetId: null };
}
