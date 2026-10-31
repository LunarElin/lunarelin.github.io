import { ACTION_TIMING, actionWindow } from './motion.mjs';

export const STORAGE_KEY = 'acorn-guard:v3';
export const LEGACY_STORAGE_KEY = 'acorn-guard:v2';
export const WORLD = Object.freeze({ width: 900, height: 700, margin: 38 });
export const RECRUIT_THRESHOLDS = Object.freeze({ bear: 8, fox: 25, redpanda: 50, sparrow: 85 });
export const HEROES = Object.freeze([
  { id: 'squirrel', name: '다람쥐', resource: 'acorn', damage: 17, rate: 1.9, speed: 160, yield: 1.2, color: '#e2bc80', trait: '도토리를 발사해 나무를 수확' },
  { id: 'bear', name: '곰', resource: 'wood', damage: 36, rate: 1.05, speed: 172, yield: 1, color: '#c5a077', trait: '나무에 다가가 앞발로 내려쳐 목재 수확' },
  { id: 'fox', name: '여우', resource: 'berries', damage: 20, rate: 1.5, speed: 220, yield: 1, color: '#e4a373', trait: '열매를 찾아 달려가 직접 따기' },
  { id: 'redpanda', name: '래서판다', resource: 'bamboo', damage: 24, rate: 1.35, speed: 178, yield: 1, color: '#d39570', trait: '가까운 대나무를 넓게 베어 수확' },
  { id: 'sparrow', name: '참새', resource: 'grain', damage: 12, rate: 2.2, speed: 235, yield: 1, color: '#cfb68a', trait: '짧게 걸어가 곡식을 쪼아 수확' },
]);
const HERO_BY_ID = new Map(HEROES.map(hero => [hero.id, hero]));
const ORDER = HEROES.map(hero => hero.id), START_Y = WORLD.height * .65;
const MAX_COINS = 999999999, MAX_OFFLINE_MS = 8 * 60 * 60 * 1000, MAX_NODES = 36;
const TREE_KINDS = new Set(['oak', 'pine', 'golden']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value, min, max, fallback = min) => clamp(Math.floor(finite(value, fallback)), min, max);
const random = rng => clamp(finite(rng(), .5), 0, .999999);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const DEFINITIONS = {
  squirrel: [
    { key: 'power', name: '도토리 힘', icon: 'acorn', unit: '', description: '도토리 한 발의 나무 피해 증가' },
    { key: 'burst', name: '연속 발사', icon: 'rapid', unit: '/s', description: '초당 도토리 발사 횟수 증가' },
    { key: 'bounty', name: '도토리 주머니', icon: 'coin', unit: '%', description: '직접 수확한 나무의 동전 보상과 도토리 수량 증가' },
  ],
  bear: [
    { key: 'impact', name: '앞발 힘', icon: 'paw', unit: '', description: '가까운 나무를 내려치는 한 번의 피해 증가' },
    { key: 'combo', name: '연속 내려치기', icon: 'combo', unit: '×', description: '한 동작에서 나무를 내려치는 횟수 증가' },
    { key: 'shockradius', name: '울림 범위', icon: 'ring', unit: '%', description: '내려친 나무 주변의 다른 나무에도 전달되는 범위 증가, 기본 범위를 100%로 표시' },
  ],
  fox: [
    { key: 'forageSpeed', name: '열매 따기', icon: 'berries', unit: '/s', description: '초당 열매를 따는 동작 횟수 증가' },
    { key: 'rareChance', name: '희귀 열매', icon: 'rare', unit: '%', description: '추가 열매와 동전을 발견할 확률 증가' },
    { key: 'basket', name: '열매 바구니', icon: 'basket', unit: '×', description: '열매 덤불 한 곳에서 얻는 열매 수량 증가' },
  ],
  redpanda: [
    { key: 'cut', name: '대나무 베기', icon: 'bamboo', unit: '', description: '대나무 한 번 베기의 피해 증가' },
    { key: 'sweep', name: '넓게 베기', icon: 'sweep', unit: '%', description: '함께 벨 수 있는 주변 대나무 범위 증가, 기본 범위를 100%로 표시' },
    { key: 'regrowth', name: '새순', icon: 'leaf', unit: '%', description: '수확한 자리에서 대나무가 다시 자랄 확률 증가' },
  ],
  sparrow: [
    { key: 'peckSpeed', name: '빠른 쪼기', icon: 'beak', unit: '/s', description: '초당 곡식을 쪼는 동작 횟수 증가' },
    { key: 'multiPeck', name: '여러 번 쪼기', icon: 'double', unit: '×', description: '한 동작에서 곡식을 연속으로 쪼는 횟수 증가' },
    { key: 'seedFind', name: '숨은 씨앗', icon: 'grain', unit: '%', description: '곡식 수확 때 추가 씨앗을 발견할 확률 증가' },
  ],
};
const LIMITS = { combo: 4, basket: 10, multiPeck: 5 };
export function upgradeDefinitions(id) { return DEFINITIONS[id] || []; }
export function xpForLevel(level) { return 25 + (level - 1) * 15; }
function blankMember(id, source = {}) {
  if (!source || typeof source !== 'object') source = {};
  const upgrades = Object.fromEntries(upgradeDefinitions(id).map(({ key }) => [key, integer(source.upgrades?.[key], 0, LIMITS[key] || 30)]));
  let level = integer(source.level, 1, 100), xp = integer(source.xp, 0, MAX_COINS);
  while (level < 100 && xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++; }
  return { level, xp: Math.min(xp, xpForLevel(level) - 1), materials: integer(source.materials, 0, MAX_COINS), upgrades };
}
function normalizeProfile(source = {}) {
  if (!source || typeof source !== 'object' || ![undefined, 1, 2, 3].includes(source.version)) source = {};
  const old = source.version === 1 || source.version === 2;
  const harvested = integer(source.version === 1 ? source.kills : source.harvested, 0, MAX_COINS);
  const tier = integer(source.tier ?? source.wave ?? Math.floor(harvested / 30) + 1, 1, 999);
  const recruited = ['squirrel'];
  if (!old && Array.isArray(source.recruited)) {
    for (let index = 1; index < ORDER.length; index++) {
      const id = ORDER[index];
      if (source.recruited[index] !== id || harvested < RECRUIT_THRESHOLDS[id]) break;
      recruited.push(id);
    }
  }
  const members = Object.fromEntries(ORDER.map(id => [id, blankMember(id, recruited.includes(id) ? source.members?.[id] : {})]));
  if (old) members.squirrel = blankMember('squirrel', { level: source.level, xp: source.xp, upgrades: {
    power: source.upgrades?.damage, burst: source.upgrades?.rate, bounty: source.upgrades?.yield ?? source.upgrades?.health,
  } });
  const selectedHeroId = recruited.includes(source.selectedHeroId) ? source.selectedHeroId : 'squirrel';
  return {
    version: 3, recruited, selectedHeroId, members, coins: integer(source.coins, 0, MAX_COINS), harvested,
    treesHarvested: integer(source.treesHarvested ?? harvested, 0, MAX_COINS), tier,
    bestTier: Math.max(tier, integer(source.bestTier ?? source.bestWave, 1, 999, tier)),
    groveHarvested: integer(source.groveHarvested ?? (source.version === 1 ? 0 : harvested % 30), 0, 29),
    distance: Math.max(0, finite(source.distance)), autoMove: source.autoMove !== false,
    savedAt: Math.max(0, finite(source.savedAt)), offlineReward: integer(source.offlineReward, 0, MAX_COINS),
  };
}
function statsFor(state, id) {
  const member = state.members[id], upgrades = member.upgrades, base = HERO_BY_ID.get(id);
  const levelBonus = 1 + (member.level - 1) * .045;
  const common = { speed: base.speed, damage: base.damage * levelBonus, rate: base.rate, yield: base.yield, range: 65 };
  if (id === 'squirrel') return { ...common, damage: common.damage * (1 + upgrades.power * .24), rate: Math.min(6, base.rate * (1 + upgrades.burst * .095)), yield: base.yield * (1 + upgrades.bounty * .05), range: 335 };
  if (id === 'bear') return { ...common, damage: common.damage * (1 + upgrades.impact * .22), combo: 1 + upgrades.combo, shockRadius: 45 * (1 + upgrades.shockradius * .15), range: 67 };
  if (id === 'fox') return { ...common, rate: base.rate * (1 + (member.level - 1) * .015) * (1 + upgrades.forageSpeed * .12), rareChance: Math.min(.9, .04 + upgrades.rareChance * .025), basket: 2 + upgrades.basket, range: 48 };
  if (id === 'redpanda') return { ...common, damage: common.damage * (1 + upgrades.cut * .23), sweepRadius: 85 * (1 + upgrades.sweep * .15), regrowthChance: Math.min(.9, upgrades.regrowth * .03), range: 68 };
  return { ...common, rate: base.rate * (1 + upgrades.peckSpeed * .12), multiPeck: 1 + upgrades.multiPeck, seedChance: Math.min(.95, .05 + upgrades.seedFind * .03), range: 80 };
}
function syncState(state) {
  for (const worker of state.workers) {
    Object.assign(worker, statsFor(state, worker.id));
    worker.level = state.members[worker.id].level;
    worker.xp = state.members[worker.id].xp;
    worker.materials = state.members[worker.id].materials;
  }
  const leader = state.members.squirrel;
  state.level = leader.level; state.xp = leader.xp; state.xpToNext = xpForLevel(leader.level);
  state.heroId = state.selectedHeroId;
  state.upgrades = state.members[state.selectedHeroId].upgrades;
}
function makeWorker(state, id, index) {
  return { id, x: WORLD.width / 2 - index * 28, y: START_Y + index * 25, face: 1, moving: false,
    mode: 'follow', targetId: null, animTime: 0, actionTimer: 0, actionFlash: 0, actionStartedAt: 0,
    actionCount: 0, pendingAction: null, pendingThrow: null, actionDuration: 0, actionRate: 1,
    actionDX: 0, actionDY: 1, actionCancelled: false, moveDX: 0, moveDY: 0, travelled: 0,
    attackTimer: 0, attackFlash: 0, skillCooldown: 0, ...statsFor(state, id) };
}
function effect(state, type, x, y, amount = 0, color = '#fff4c6', life = .7, owner = 'squirrel', resource = '') {
  if (state.effects.length >= 120) state.effects.shift();
  state.effects.push({ id: state.nextId++, type, x, y, amount, text: amount ? String(Math.round(amount)) : '', color, life, maxLife: life, owner, resource });
}
export function createGame(profile = {}, rng = Math.random) {
  const clean = normalizeProfile(profile);
  const state = { ...clean, status: 'playing', wave: clean.tier, bestWave: clean.bestTier, workers: [],
    targets: [], targetId: null, projectiles: [], effects: [], regrowth: [], encounter: null,
    waveKills: clean.groveHarvested, waveTotal: 30, waveDelay: 0, elapsed: 0, nextId: 1,
    nextRowY: START_Y - 180, rowIndex: 0, baseDistance: clean.distance, runDistance: 0,
    shotCount: 0, hitCount: 0, lastReward: clean.offlineReward };
  state.workers = clean.recruited.map((id, index) => makeWorker(state, id, index));
  state.hero = state.workers[0];
  syncState(state); fillGrove(state, rng); updateEncounter(state);
  return state;
}
function spawnNode(state, kind, x, y, rng) {
  if (state.targets.length >= MAX_NODES) return;
  const baseHp = kind === 'golden' ? 58 : kind === 'pine' ? 40 : kind === 'berry' ? 18 : kind === 'bamboo' ? 42 : kind === 'grain' ? 11 : 30;
  const maxHp = Math.round(baseHp * (1 + (state.tier - 1) * .09));
  state.targets.push({ id: state.nextId++, kind, x: clamp(x, 60, WORLD.width - 60), y, hp: maxHp, maxHp,
    radius: TREE_KINDS.has(kind) ? 28 : 21, size: kind === 'pine' ? 1.12 : 1, hurtTimer: 0, animTime: random(rng) * 2, claimedBy: null });
}
function fillGrove(state, rng) {
  while (state.targets.length < MAX_NODES && state.nextRowY > state.hero.y - 930) {
    for (let index = 0; index < 3; index++) {
      const kind = (state.rowIndex + index) % 11 === 7 ? 'golden' : (state.rowIndex + index) % 3 === 1 ? 'pine' : 'oak';
      spawnNode(state, kind, 155 + index * 295 + (random(rng) - .5) * 65, state.nextRowY + (random(rng) - .5) * 45, rng);
    }
    if (state.rowIndex % 2 === 0) spawnNode(state, 'oak', 203, state.nextRowY + 8, rng);
    for (const [index, kind] of ['berry', 'bamboo', 'grain'].entries()) {
      const x = 210 + ((index + state.rowIndex) % 3) * 245;
      const y = state.nextRowY + 70 + index * 14;
      spawnNode(state, kind, x + (random(rng) - .5) * 60, y, rng);
      if (kind === 'bamboo') {
        spawnNode(state, kind, x + 38, y - 12, rng);
        spawnNode(state, kind, x + 91, y + 16, rng);
      }
      if (kind === 'grain') {
        spawnNode(state, kind, x + 18, y + 13, rng);
        spawnNode(state, kind, x - 20, y + 10, rng);
      }
    }
    state.rowIndex++; state.nextRowY -= 230;
  }
}
function eligible(id, node) {
  return (id === 'squirrel' || id === 'bear') ? TREE_KINDS.has(node.kind) : node.kind === (id === 'fox' ? 'berry' : id === 'redpanda' ? 'bamboo' : 'grain');
}
function nearest(state, worker, companion = false) {
  let target = null, nearestDistance = Infinity, bestScore = Infinity;
  for (const node of state.targets) {
    if (node.hp <= 0 || !eligible(worker.id, node) || (node.claimedBy && node.claimedBy !== worker.id)) continue;
    if (companion && distance(node, state.hero) > 325) continue;
    const gap = distance(worker, node), score = gap * (node.y > state.hero.y + 65 ? 1.5 : 1);
    if (score < bestScore) { target = node; nearestDistance = gap; bestScore = score; }
  }
  return { target, distance: nearestDistance };
}
function move(worker, x, y, speed, dt) {
  const oldX = worker.x, oldY = worker.y, length = Math.max(1, Math.hypot(x, y));
  worker.x = clamp(worker.x + x / length * speed * dt, WORLD.margin, WORLD.width - WORLD.margin);
  worker.y += y / length * speed * dt;
  worker.moveDX = worker.x - oldX; worker.moveDY = worker.y - oldY;
  const travelled = Math.hypot(worker.moveDX, worker.moveDY);
  worker.travelled += travelled;
  worker.moving = travelled > .05;
  if (Math.abs(x) > .04) worker.face = x >= 0 ? 1 : -1;
}
function moveTo(worker, target, speed, dt, stop = 0) {
  const gap = distance(worker, target);
  if (gap <= stop) { worker.moving = false; return; }
  const amount = Math.min(speed, (gap - stop) / dt);
  move(worker, (target.x - worker.x) / Math.max(1, gap), (target.y - worker.y) / Math.max(1, gap), amount, dt);
}
function updateEncounter(state) {
  if (!state.encounter && state.recruited.length < ORDER.length) {
    const id = ORDER[state.recruited.length];
    if (state.harvested >= RECRUIT_THRESHOLDS[id]) state.encounter = { id, x: clamp(state.hero.x + 95, 90, WORLD.width - 90), y: state.hero.y - 190, phase: 'waiting' };
  }
  if (state.encounter) state.encounter.phase = distance(state.hero, state.encounter) <= 85 ? 'ready' : 'waiting';
}
export function recruitFriend(state, id) {
  const encounter = state.encounter;
  if (!encounter || encounter.id !== id || encounter.phase !== 'ready' || ORDER[state.recruited.length] !== id || state.harvested < RECRUIT_THRESHOLDS[id] || distance(state.hero, encounter) > 85) return false;
  state.recruited.push(id);
  const worker = makeWorker(state, id, state.workers.length);
  worker.x = encounter.x; worker.y = encounter.y; state.workers.push(worker);
  state.encounter = null;
  // Every recruit has an immediately reachable first job and needs no recruitment materials.
  const kind = id === 'bear' ? 'oak' : id === 'fox' ? 'berry' : id === 'redpanda' ? 'bamboo' : 'grain';
  if (state.targets.length >= MAX_NODES) state.targets.pop();
  spawnNode(state, kind, worker.x + 55, worker.y - 30, () => .5);
  effect(state, 'recruit', worker.x, worker.y, 0, HERO_BY_ID.get(id).color, 1.5, id);
  syncState(state); return true;
}
function startAction(state, worker, type) {
  worker.actionTimer = 1 / worker.rate; worker.actionFlash = .4; worker.actionStartedAt = state.elapsed;
  worker.actionRate = worker.rate; worker.actionDuration = actionWindow(worker.rate); worker.actionCancelled = false;
  const target = state.targets.find(node => node.id === worker.targetId);
  if (target) { worker.actionDX = target.x - worker.x; worker.actionDY = target.y - worker.y; }
  worker.actionCount++; worker.mode = 'harvest'; worker.attackTimer = worker.actionTimer; worker.attackFlash = .2;
  if (type) effect(state, type, worker.x, worker.y, 0, HERO_BY_ID.get(worker.id).color, .45, worker.id);
}
function fire(state, angle, skill = false) {
  if (state.projectiles.length >= 90) return;
  const worker = state.hero, speed = skill ? 440 : 470;
  const x = worker.x + Math.cos(angle) * 22, y = worker.y + Math.sin(angle) * 22;
  state.projectiles.push({ id: state.nextId++, x, y, prevX: x, prevY: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    damage: worker.damage * (skill ? 2.1 : 1), radius: skill ? 9 : 6, life: 1.4, rotation: angle,
    color: skill ? '#ffe47c' : '#d99143', skill, owner: 'squirrel' });
  state.shotCount++;
}
function award(state, node, worker, rng) {
  const member = state.members[worker.id];
  let materials = worker.id === 'squirrel' ? 2 + Math.floor(member.upgrades.bounty / 3) : worker.id === 'bear' ? 3 : worker.id === 'fox' ? worker.basket : 2;
  let bonus = 0;
  if (worker.id === 'fox' && random(rng) < worker.rareChance) { materials += 3; bonus = 15; effect(state, 'rare', node.x, node.y, 3, '#e6b57a', .9, worker.id, 'berries'); }
  if (worker.id === 'sparrow' && random(rng) < worker.seedChance) { materials += 2; effect(state, 'rare', node.x, node.y, 2, '#f5e693', .9, worker.id, 'grain'); }
  member.materials = Math.min(MAX_COINS, member.materials + materials);
  const earned = Math.round((TREE_KINDS.has(node.kind) ? node.kind === 'golden' ? 45 : 20 + (state.tier - 1) * 2 : 12) * worker.yield) + bonus;
  state.coins = Math.min(MAX_COINS, state.coins + earned); state.harvested++;
  member.xp += 5;
  while (member.level < 100 && member.xp >= xpForLevel(member.level)) {
    member.xp -= xpForLevel(member.level); member.level++;
    effect(state, 'level', worker.x, worker.y, member.level, '#fff1a5', 1.5, worker.id);
  }
  if (member.level === 100) member.xp = Math.min(member.xp, xpForLevel(member.level) - 1);
  effect(state, 'coin', node.x, node.y - 12, earned, '#ffe18a', 1, worker.id);
  effect(state, 'material', node.x, node.y - 25, materials, HERO_BY_ID.get(worker.id).color, 1.2, worker.id, HERO_BY_ID.get(worker.id).resource);
  effect(state, TREE_KINDS.has(node.kind) ? 'chop' : 'gather', node.x, node.y, 0, '#afc777', .65, worker.id);
  if (worker.id === 'redpanda' && random(rng) < worker.regrowthChance && state.regrowth.length < 10) state.regrowth.push({ x: node.x, y: node.y, time: 2.5 });
  if (TREE_KINDS.has(node.kind)) {
    state.treesHarvested++; state.groveHarvested++;
    if (state.groveHarvested >= 30) {
      state.groveHarvested = 0; state.tier = Math.min(999, state.tier + 1); state.wave = state.tier;
      state.bestTier = state.bestWave = Math.max(state.bestTier, state.tier);
      const bonus = 25 + state.tier * 5; state.coins = Math.min(MAX_COINS, state.coins + bonus);
      effect(state, 'wave', state.hero.x, state.hero.y - 40, bonus, '#fff1a8', 1.5);
    }
    state.waveKills = state.groveHarvested;
  }
  syncState(state);
}
function damageNode(state, node, amount, worker, rng) {
  if (node.hp <= 0 || !eligible(worker.id, node) || (node.claimedBy && node.claimedBy !== worker.id)) return false;
  node.hp -= amount; node.hurtTimer = .25; state.hitCount++;
  effect(state, 'damage', node.x, node.y - 30, amount, '#fff9d4', .6, worker.id);
  if (node.hp <= 0) award(state, node, worker, rng);
  return true;
}
function nextWithinReach(state, worker) {
  let target = null, best = worker.range;
  for (const node of state.targets) {
    if (node.hp <= 0 || !eligible(worker.id, node) || (node.claimedBy && node.claimedBy !== worker.id)) continue;
    const gap = distance(node, worker);
    if (gap <= best) { target = node; best = gap; }
  }
  return target;
}
function workCompanion(state, worker, index, dt, rng) {
  const leaderGap = distance(worker, state.hero);
  if (leaderGap > 1100) { worker.x = state.hero.x - 25 * index; worker.y = state.hero.y + 30; worker.targetId = null; }
  if (leaderGap > 420) {
    worker.pendingAction = null; worker.actionCancelled = true; worker.targetId = null; worker.mode = 'follow'; moveTo(worker, state.hero, worker.speed * 1.5, dt, 80); return;
  }
  if (worker.pendingAction) {
    const pending = worker.pendingAction;
    const target = state.targets.find(node => node.id === pending.targetId && node.hp > 0 && eligible(worker.id, node));
    worker.moving = false; worker.mode = 'harvest';
    if (!target || distance(worker, target) > worker.range || distance(target, state.hero) > 345 || (target.claimedBy && target.claimedBy !== worker.id)) {
      worker.pendingAction = null; worker.actionCancelled = true; worker.targetId = null; worker.mode = 'follow'; return;
    }
    target.claimedBy = worker.id;
    pending.time -= dt;
    if (pending.time > 1e-9) return;
    worker.pendingAction = null;
    companionImpact(state, worker, target, rng);
    return;
  }
  if (!worker.actionCancelled && state.elapsed < worker.actionStartedAt + worker.actionDuration - 1e-9) {
    worker.moving = false; worker.mode = 'recover'; return;
  }
  let target = state.targets.find(node => node.id === worker.targetId && node.hp > 0 && eligible(worker.id, node) && distance(node, state.hero) <= 345);
  if (!target) target = nearest(state, worker, true).target;
  worker.targetId = target?.id ?? null;
  if (!target) {
    worker.mode = 'follow';
    const offset = { x: state.hero.x + (index % 2 ? -1 : 1) * (35 + index * 8), y: state.hero.y + 50 + index * 12 };
    moveTo(worker, offset, worker.speed, dt, 24); return;
  }
  target.claimedBy = worker.id;
  if (distance(worker, target) > worker.range) {
    worker.mode = 'seek'; moveTo(worker, target, worker.speed, dt, worker.range * .82); return;
  }
  worker.moving = false; worker.mode = 'harvest';
  if (worker.actionTimer > 0) return;
  worker.face = target.x >= worker.x ? 1 : -1;
  startAction(state, worker);
  worker.pendingAction = { targetId: target.id, time: worker.actionDuration * ACTION_TIMING.contactRatio };
}
function companionImpact(state, worker, target, rng) {
  effect(state, worker.id === 'bear' ? 'slam' : worker.id === 'fox' ? 'pick' : worker.id === 'redpanda' ? 'sweep' : 'peck',
    target.x, target.y, 0, HERO_BY_ID.get(worker.id).color, .45, worker.id);
  if (worker.id === 'bear') {
    let struck = target;
    for (let count = 0; count < worker.combo; count++) {
      if (struck.hp <= 0) struck = nextWithinReach(state, worker);
      if (!struck) break;
      struck.claimedBy = worker.id;
      damageNode(state, struck, worker.damage, worker, rng);
      for (const other of state.targets) if (other !== struck && TREE_KINDS.has(other.kind) && distance(other, struck) <= worker.shockRadius) damageNode(state, other, worker.damage * .4, worker, rng);
    }
  } else if (worker.id === 'redpanda') {
    damageNode(state, target, worker.damage, worker, rng);
    for (const other of state.targets) if (other !== target && other.kind === 'bamboo' && distance(other, target) <= worker.sweepRadius) damageNode(state, other, worker.damage * .75, worker, rng);
  } else if (worker.id === 'sparrow') {
    let pecked = target;
    for (let count = 0; count < worker.multiPeck; count++) {
      if (pecked.hp <= 0) pecked = nextWithinReach(state, worker);
      if (!pecked) break;
      pecked.claimedBy = worker.id;
      damageNode(state, pecked, worker.damage, worker, rng);
    }
  } else damageNode(state, target, target.maxHp, worker, rng);
}
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export function stepGame(state, delta, input = {}, rng = Math.random) {
  const dt = clamp(finite(delta), 0, .1); if (!dt) return state;
  state.elapsed += dt;
  for (const e of state.effects) e.life -= dt;
  state.effects = state.effects.filter(e => e.life > 0);
  for (const worker of state.workers) {
    worker.moveDX = 0; worker.moveDY = 0; worker.moving = false;
    worker.animTime += dt; worker.actionTimer = Math.max(0, worker.actionTimer - dt);
    worker.actionFlash = Math.max(0, worker.actionFlash - dt); worker.attackTimer = worker.actionTimer;
    worker.attackFlash = Math.max(0, worker.attackFlash - dt); worker.skillCooldown = Math.max(0, worker.skillCooldown - dt);
  }
  for (const node of state.targets) {
    node.hurtTimer = Math.max(0, node.hurtTimer - dt); node.animTime += dt;
    if (node.claimedBy && !state.workers.some(w => w.id === node.claimedBy && w.targetId === node.id && distance(w, state.hero) <= 420)) node.claimedBy = null;
  }
  state.targets = state.targets.filter(node => node.hp > 0 && node.y <= state.hero.y + 430 && node.y >= state.hero.y - 1500);
  if (state.nextRowY < state.hero.y - 1500 && state.targets.length < 3) state.nextRowY = state.hero.y - 200;
  fillGrove(state, rng); updateEncounter(state);
  let mx = clamp(finite(input.x), -1, 1), my = clamp(finite(input.y), -1, 1);
  if (Math.hypot(mx, my) <= .05 && state.autoMove) {
    const next = state.encounter || nearest(state, state.hero).target;
    const gap = next ? distance(state.hero, next) : 1, stop = state.encounter ? 70 : 125;
    mx = next && gap > stop ? (next.x - state.hero.x) / gap * .75 : 0;
    my = next ? gap > stop ? (next.y - state.hero.y) / gap * .75 : 0 : -.6;
  }
  move(state.hero, mx, my, state.hero.speed, dt);
  state.hero.mode = state.hero.moving ? 'seek' : 'harvest';
  state.runDistance = Math.max(state.runDistance, START_Y - state.hero.y); state.distance = state.baseDistance + state.runDistance;
  updateEncounter(state);
  for (let index = 1; index < state.workers.length; index++) workCompanion(state, state.workers[index], index, dt, rng);
  const closest = nearest(state, state.hero);
  state.targetId = closest.distance <= state.hero.range ? closest.target?.id ?? null : null;
  state.hero.targetId = state.targetId;
  if (state.hero.pendingThrow) {
    const pending = state.hero.pendingThrow;
    pending.time -= dt;
    if (pending.time <= 1e-9) {
      const target = state.targets.find(node => node.id === pending.targetId && node.hp > 0 && (!node.claimedBy || node.claimedBy === 'squirrel'));
      if (target && distance(target, state.hero) <= state.hero.range + 25) fire(state, Math.atan2(target.y - state.hero.y, target.x - state.hero.x));
      else state.hero.actionCancelled = true;
      state.hero.pendingThrow = null;
    }
  }
  if (state.targetId !== null && !state.hero.actionTimer && !state.hero.pendingThrow) {
    const angle = Math.atan2(closest.target.y - state.hero.y, closest.target.x - state.hero.x);
    state.hero.face = Math.cos(angle) >= 0 ? 1 : -1;
    startAction(state, state.hero);
    state.hero.pendingThrow = { targetId: closest.target.id, time: state.hero.actionDuration * ACTION_TIMING.contactRatio };
  }
  for (const projectile of state.projectiles) {
    projectile.prevX = projectile.x; projectile.prevY = projectile.y;
    projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.life -= dt;
    for (const node of state.targets) {
      if (node.hp <= 0 || !eligible('squirrel', node) || (node.claimedBy && node.claimedBy !== 'squirrel')) continue;
      if (segmentDistance(node.x, node.y, projectile.prevX, projectile.prevY, projectile.x, projectile.y) > node.radius + projectile.radius) continue;
      damageNode(state, node, projectile.damage, state.hero, rng); projectile.life = 0; break;
    }
  }
  state.targets = state.targets.filter(node => node.hp > 0);
  state.projectiles = state.projectiles.filter(p => p.life > 0 && p.x > -30 && p.x < WORLD.width + 30 && Math.abs(p.y - state.hero.y) < 1000);
  if (state.targetId !== null && !state.targets.some(node => node.id === state.targetId)) state.targetId = state.hero.targetId = null;
  for (const grow of state.regrowth) {
    grow.time -= dt;
    if (grow.time <= 0 && distance(grow, state.hero) < 400) spawnNode(state, 'bamboo', grow.x, grow.y, rng);
  }
  state.regrowth = state.regrowth.filter(grow => grow.time > 0);
  updateEncounter(state); return state;
}
export function upgradeValue(state, key, id = state.selectedHeroId) {
  if (!HERO_BY_ID.has(id)) return 0;
  const stats = statsFor(state, id);
  if (key === 'power' || key === 'impact' || key === 'cut') return Math.round(stats.damage);
  if (key === 'burst' || key === 'forageSpeed' || key === 'peckSpeed') return Number(stats.rate.toFixed(1));
  if (key === 'bounty') return Math.round(stats.yield * 100);
  if (key === 'combo') return stats.combo;
  if (key === 'shockradius') return Math.round(stats.shockRadius / 45 * 100);
  if (key === 'rareChance') return Math.round(stats.rareChance * 100);
  if (key === 'basket') return stats.basket;
  if (key === 'sweep') return Math.round(stats.sweepRadius / 85 * 100);
  if (key === 'regrowth') return Math.round(stats.regrowthChance * 100);
  if (key === 'multiPeck') return stats.multiPeck;
  if (key === 'seedFind') return Math.round(stats.seedChance * 100);
  return 0;
}
export function upgradeCost(state, key, id = state.selectedHeroId) {
  if (!state.recruited.includes(id) || !upgradeDefinitions(id).some(d => d.key === key)) return null;
  const level = state.members[id].upgrades[key];
  if (level >= (LIMITS[key] || 30)) return null;
  return { coins: Math.ceil(40 * Math.pow(1.45, level)), resource: HERO_BY_ID.get(id).resource, amount: 2 + level * 2 };
}
export function upgrade(state, key, id = state.selectedHeroId) {
  const cost = upgradeCost(state, key, id), member = state.members[id];
  if (!cost || state.coins < cost.coins || member.materials < cost.amount) return false;
  state.coins -= cost.coins; member.materials -= cost.amount; member.upgrades[key]++;
  syncState(state); const worker = state.workers.find(w => w.id === id);
  effect(state, 'upgrade', worker.x, worker.y, 0, '#fff2a0', .9, id); return true;
}
export function selectHero(state, id) {
  if (!state.recruited.includes(id) || state.selectedHeroId === id) return false;
  state.selectedHeroId = id; syncState(state); return true;
}
export function useSkill(state) {
  if (state.hero.skillCooldown > 0) return false;
  for (let index = 0; index < 16; index++) fire(state, index / 16 * Math.PI * 2, true);
  state.hero.skillCooldown = 12; state.hero.attackFlash = .3;
  effect(state, 'burst', state.hero.x, state.hero.y, 0, '#ffe698', .6); return true;
}
export function restartRun(state, rng = Math.random) { Object.assign(state, createGame(serializeProfile(state), rng)); return state; }
export function serializeProfile(state, now = Date.now()) {
  const p = normalizeProfile({ version: 3, recruited: state.recruited, selectedHeroId: state.selectedHeroId, members: state.members,
    coins: state.coins, harvested: state.harvested, treesHarvested: state.treesHarvested, tier: state.tier, bestTier: state.bestTier,
    groveHarvested: state.groveHarvested, distance: state.distance, autoMove: state.autoMove, savedAt: now });
  delete p.offlineReward; return p;
}
export function saveProfile(storage, state, now = Date.now()) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(serializeProfile(state, now))); return true; } catch { return false; }
}
export function loadProfile(storage, now = Date.now()) {
  let source;
  try {
    const current = storage.getItem(STORAGE_KEY), old = current === null ? storage.getItem(LEGACY_STORAGE_KEY) : null;
    source = JSON.parse(current ?? old ?? storage.getItem('acorn-guard:v1'));
  } catch { source = null; }
  const p = normalizeProfile(source), currentTime = Math.max(0, finite(now));
  const elapsed = p.savedAt > 0 ? clamp(currentTime - p.savedAt, 0, MAX_OFFLINE_MS) : 0;
  const rate = 4 + Math.min(20, p.bestTier) + (p.recruited.length - 1) * 2;
  p.offlineReward = Math.min(elapsed >= 60000 ? Math.floor(elapsed / 60000) * rate : 0, MAX_COINS - p.coins);
  p.coins += p.offlineReward; p.savedAt = currentTime;
  try { const saved = { ...p }; delete saved.offlineReward; storage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
  catch { /* Current-session gathering remains usable without persistent storage. */ }
  return p;
}
