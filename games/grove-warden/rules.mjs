export const WORLD = Object.freeze({ minX: -15, maxX: 15, minZ: -42, maxZ: 23, camp: Object.freeze({ x: 0, z: 16, radius: 4.6 }), gateZ: -14 });
export const RULES = Object.freeze({
  arena: WORLD, huntEnterPadding: 2, huntLeavePadding: 3.25, maxEnemies: 36, maxProjectiles: 70, maxEffects: 80, maxStep: 0.05,
  playerSpeed: 4.4, attackRange: 4.4, skillCooldown: 6, skillRadius: 2.7,
  skillAimRange: 4.8,
});
export const UPGRADES = Object.freeze([
  Object.freeze({ id: 'attack', name: '지팡이 강화', description: '공격 피해 +18%', baseCost: 30, maxLevel: 8, icon: '✦' }),
  Object.freeze({ id: 'health', name: '생명 강화', description: '최대 생명 +20', baseCost: 35, maxLevel: 6, icon: '♥' }),
  Object.freeze({ id: 'bag', name: '가방 확장', description: '운반 한도 +16', baseCost: 25, maxLevel: 6, icon: '▣' }),
]);
export const SKILLS = Object.freeze([
  Object.freeze({ id: 'owl', name: '숲의 부엉이', description: '곁에서 자동으로 유도탄 발사', baseCost: 20, firstLevel: 2, maxLevel: 3 }),
  Object.freeze({ id: 'roots', name: '휘감는 덩굴', description: '전투 중 주기적으로 자동 범위 공격', baseCost: 35, firstLevel: 3, maxLevel: 3 }),
]);
// 웹 전투용 수치. 시전 시간과 피해 판정은 전투 규칙에서 별도로 처리한다.
export const MONSTER_STATS = Object.freeze({
  mushroom: Object.freeze({ level: 1, hp: 48, speed: 0.88, radius: 0.46, damage: 2, xp: 2, loot: 2 }),
  boar: Object.freeze({ level: 5, hp: 228, speed: 1.76, radius: 0.62, damage: 8, xp: 8, loot: 22 }),
  caster: Object.freeze({ level: 4, hp: 68, speed: 1.76, radius: 0.46, damage: 4, xp: 6, loot: 18 }),
  boss: Object.freeze({ level: 3, hp: 252, speed: 2.64, radius: 1.05, damage: 12, xp: 20, loot: 42 }),
  deepBoss: Object.freeze({ level: 8, hp: 1024, speed: 2.64, radius: 1.05, damage: 36, xp: 200, loot: 188 }),
});
export const HUNT_ZONES = Object.freeze([
  { id: 'meadow-mushrooms', name: '버섯 군락', x: -6, z: 4, radius: 5.5, type: 'mushroom', count: 9, respawnSeconds: 15 },
  { id: 'meadow-boars', name: '멧돼지 숲', x: 6, z: -3, radius: 5, type: 'boar', count: 6, respawnSeconds: 8 },
  { id: 'meadow-boss', name: '초원 수문장', x: -6, z: -8, radius: 3.8, type: 'boss', count: 1, bossId: 'meadow-guardian', hp: MONSTER_STATS.boss.hp, damage: MONSTER_STATS.boss.damage, xp: MONSTER_STATS.boss.xp, loot: MONSTER_STATS.boss.loot, speed: MONSTER_STATS.boss.speed, respawnSeconds: 0 },
  { id: 'deep-boars', name: '깊은 멧돼지 숲', x: -7, z: -24, radius: 5, type: 'boar', count: 6, respawnSeconds: 8, deep: true },
  { id: 'deep-casters', name: '석상 터', x: 6, z: -27, radius: 5, type: 'caster', count: 6, respawnSeconds: 8, deep: true },
  { id: 'deep-boss', name: '깊은 수문장', x: 0, z: -37, radius: 3.8, type: 'boss', count: 1, bossId: 'deep-guardian', hp: MONSTER_STATS.deepBoss.hp, damage: MONSTER_STATS.deepBoss.damage, xp: MONSTER_STATS.deepBoss.xp, loot: MONSTER_STATS.deepBoss.loot, speed: MONSTER_STATS.deepBoss.speed, respawnSeconds: 0, deep: true },
].map(zone => Object.freeze({ ...zone, level: MONSTER_STATS[zone.id === 'deep-boss' ? 'deepBoss' : zone.type].level, title: zone.name, enemyType: zone.type })));
const BOSS_IDS = ['meadow-guardian', 'deep-guardian'];
const SPAWNS = HUNT_ZONES.flatMap(zone => Array.from({ length: zone.count }, (_, index) => {
  const angle = index / zone.count * Math.PI * 2;
  const spread = zone.count === 1 ? 0 : zone.radius * 0.43;
  return { id: `${zone.id}-${index}`, zoneId: zone.id, type: zone.type, bossId: zone.bossId, hp: zone.hp, damage: zone.damage, xp: zone.xp, loot: zone.loot, speed: zone.speed, respawnSeconds: zone.respawnSeconds,
    deep: !!zone.deep, x: zone.x + Math.cos(angle) * spread, z: zone.z + Math.sin(angle) * spread };
}));
const QUESTS = [
  { id: 'mushrooms', title: '버섯 5마리 사냥', target: 5, rewardGold: 20 },
  { id: 'bank', title: '야영지에 금화 20 운반', target: 20, rewardGold: 20 },
  { id: 'attack', title: '지팡이 1회 강화', target: 1, rewardGold: 25 },
  { id: 'meadow-boss', title: '초원 수문장 처치', target: 1, rewardGold: 65 },
  { id: 'deep', title: '깊은 숲 적 6마리 사냥', target: 6, rewardGold: 70 },
  { id: 'deep-boss', title: '깊은 숲 수문장 처치', target: 1, rewardGold: 120 },
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = value => Number.isFinite(value) ? value : 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function direction(x, z, fallbackX = 0, fallbackZ = -1) {
  const length = Math.hypot(number(x), number(z));
  return length > 0.00001 ? { x: x / length, z: z / length } : { x: fallbackX, z: fallbackZ };
}

function random(state) {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}

function insideArena(entity, margin = entity.radius || 0) {
  entity.x = clamp(entity.x, RULES.arena.minX + margin, RULES.arena.maxX - margin);
  entity.z = clamp(entity.z, RULES.arena.minZ + margin, RULES.arena.maxZ - margin);
}

function effect(state, type, x, z, life, radius = 1, extra = {}) {
  if (state.effects.length >= RULES.maxEffects) state.effects.shift();
  state.effects.push({ id: state.nextId++, type, x, z, life, maxLife: life, radius, ...extra });
}

function event(state, type, x, z, extra = {}) {
  state.events.push({ type, x, z, ...extra });
}

const integer = (value, max = 1000000000) => Number.isFinite(value) ? clamp(Math.floor(value), 0, max) : 0;
const skillInterval = (id, rank) => id === 'roots' ? (80 - (Math.max(1, rank) - 1) * 8) / 10 : (16 - (Math.max(1, rank) - 1) * 2) / 10;
const owlDamage = (state, rank) => (10 + state.player.level - 1 + 4 * (Math.max(1, rank) - 1)) * state.player.damageMult;
const xpThreshold = level => 10 * (level - 1) * level;
function levelFromXp(xp) { return Math.min(50, Math.floor((1 + Math.sqrt(1 + xp * 0.4)) / 2)); }

export function normalizeProgress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const upgrades = {};
  for (const definition of UPGRADES) upgrades[definition.id] = integer(source.upgrades?.[definition.id], definition.maxLevel);
  const skills = {};
  for (const definition of SKILLS) {
    const value = definition.id === 'owl' && !Object.prototype.hasOwnProperty.call(source.skills || {}, 'owl') ? source.skills?.dodge : source.skills?.[definition.id];
    skills[definition.id] = integer(value, definition.maxLevel);
  }
  const xp = integer(source.xp, 10000000);
  const totals = {};
  for (const key of ['kills', 'mushrooms', 'deepKills', 'banked']) totals[key] = integer(source.totals?.[key]);
  const questIndex = integer(source.questIndex, QUESTS.length);
  return {
    version: 4, gold: integer(source.gold), cargo: integer(source.cargo, 24 + upgrades.bag * 16),
    xp, level: levelFromXp(xp), upgrades, skills, questIndex, totals,
    bosses: BOSS_IDS.filter(id => Array.isArray(source.bosses) && source.bosses.includes(id)),
    unlockedDeep: questIndex >= 4,
  };
}

export function exportProgress(state) { return normalizeProgress({ ...state.progress, cargo: state.cargo }); }

function syncStats(state, healIncrease = false) {
  const p = state.progress, player = state.player, previousMax = player.maxHp;
  p.level = levelFromXp(p.xp);
  player.maxHp = 100 + (p.level - 1) * 10 + p.upgrades.health * 20;
  player.level = p.level;
  player.xp = Math.max(0, p.xp - xpThreshold(p.level));
  player.xpToNext = 20 * p.level;
  player.capacity = 24 + p.upgrades.bag * 16;
  player.attackDamage = 16 + (p.level - 1) * 2;
  player.skillDamage = 46 + (p.level - 1) * 3;
  player.damageMult = 1 + p.upgrades.attack * 0.18;
  player.skillCooldown = skillInterval('roots', p.skills.roots);
  player.hp = Math.min(player.maxHp, player.hp + (healIncrease ? Math.max(0, player.maxHp - previousMax) : 0));
  if (state.owl) syncOwlStats(state);
}

export function createGame(seed = 73491, savedProgress) {
  const progress = normalizeProgress(savedProgress);
  const state = {
    rng: (Number(seed) >>> 0) || 73491, nextId: 1, phase: 'ready', resumePhase: null,
    time: 0, elapsed: 0, revision: 0, progress, inCamp: true, cargo: progress.cargo,
    autoHunt: false, huntZoneId: null, fightTargetId: null, kills: progress.totals.kills,
    owl: { active: false, rank: 0, x: WORLD.camp.x - 1.25, z: WORLD.camp.z + 0.3, fireCd: 0, fireCooldown: 1.6, damage: 0, range: 5.5, targetId: null },
    pendingSkills: [], events: [], queuedEvents: [], enemies: [], projectiles: [], effects: [], loot: [],
    spawners: SPAWNS.map(spawn => ({ ...spawn, remaining: 0 })),
    player: {
      id: 0, x: WORLD.camp.x, z: WORLD.camp.z, radius: 0.4,
      hp: 100, maxHp: 100, facingX: 0, facingZ: -1,
      attackCd: 0, skillCd: 0, invuln: 0,
      attackDamage: 16, skillDamage: 46, skillRadius: RULES.skillRadius,
      skillCooldown: RULES.skillCooldown, damageMult: 1,
      movingX: 0, movingZ: 0, castId: 0,
    },
  };
  syncStats(state);
  state.player.hp = state.player.maxHp;
  state.player.skillCd = state.player.skillCooldown;
  updateSpawns(state, 0);
  updateOwl(state, 0, false, true);
  state.events = [];
  return state;
}

export function setPaused(state, paused) {
  if (paused && state.phase === 'playing') { state.resumePhase = 'playing'; state.phase = 'paused'; return true; }
  if (!paused && state.phase === 'paused') { state.phase = 'playing'; state.resumePhase = null; return true; }
  return false;
}

export function getUpgradeOffer(state, id) {
  const definition = UPGRADES.find(item => item.id === id);
  if (!definition) return null;
  const level = state.progress.upgrades[id];
  const requiredLevel = 1 + level * 2;
  const maxed = level >= definition.maxLevel;
  const currentValue = id === 'attack' ? Math.round(state.player.attackDamage * state.player.damageMult)
    : id === 'health' ? state.player.maxHp : state.player.capacity;
  const nextValue = maxed ? null : id === 'attack' ? Math.round(state.player.attackDamage * (1 + (level + 1) * 0.18))
    : currentValue + (id === 'health' ? 20 : 16);
  const unit = id === 'attack' ? '피해' : id === 'health' ? '생명' : '칸';
  return { ...definition, level, requiredLevel, locked: state.progress.level < requiredLevel,
    cost: Math.round(definition.baseCost * (1 + level * 0.8)), maxed, currentValue, nextValue, unit };
}

export function buyUpgrade(state, id) {
  const offer = getUpgradeOffer(state, id);
  if (!offer || offer.maxed || offer.locked || !state.inCamp || !['playing', 'paused'].includes(state.phase) || state.progress.gold < offer.cost) return false;
  state.progress.gold -= offer.cost;
  state.progress.upgrades[id]++;
  syncStats(state, true);
  state.revision++;
  state.queuedEvents.push({ type: 'upgrade', x: state.player.x, z: state.player.z, id });
  return true;
}

export function getSkillOffer(state, id) {
  const definition = SKILLS.find(item => item.id === id);
  if (!definition) return null;
  const level = state.progress.skills[id], requiredLevel = definition.firstLevel + level * 3;
  return { ...definition, level, requiredLevel, locked: state.progress.level < requiredLevel,
    cost: Math.round(definition.baseCost * (1 + level * 0.85)), maxed: level >= definition.maxLevel,
    currentInterval: level > 0 ? skillInterval(id, level) : null,
    nextInterval: level < definition.maxLevel ? skillInterval(id, level + 1) : null,
    currentDamage: level > 0 ? Math.round(id === 'owl' ? owlDamage(state, level) : state.player.skillDamage * state.player.damageMult) : null,
    nextDamage: level < definition.maxLevel ? Math.round(id === 'owl' ? owlDamage(state, level + 1) : state.player.skillDamage * state.player.damageMult) : null };
}

export function learnSkill(state, id) {
  const offer = getSkillOffer(state, id);
  if (!offer || offer.maxed || offer.locked || !state.inCamp || !['playing', 'paused'].includes(state.phase) || state.progress.gold < offer.cost) return false;
  state.progress.gold -= offer.cost;
  state.progress.skills[id]++;
  syncStats(state);
  if (id === 'roots') state.player.skillCd = state.player.skillCooldown;
  else updateOwl(state, 0, false, true);
  state.revision++;
  state.queuedEvents.push({ type: 'upgrade', x: state.player.x, z: state.player.z, id });
  return true;
}

export function getQuest(state) {
  const q = QUESTS[state.progress.questIndex];
  if (!q) return { id: 'done', title: '숲을 자유롭게 탐험하세요', current: 1, target: 1, complete: true, rewardGold: 0, done: true };
  const p = state.progress;
  const values = [p.totals.mushrooms, p.totals.banked, p.upgrades.attack, Number(p.bosses.includes(BOSS_IDS[0])), p.totals.deepKills, Number(p.bosses.includes(BOSS_IDS[1]))];
  const current = Math.min(q.target, values[p.questIndex]);
  return { ...q, current, complete: current >= q.target, done: false };
}

export function claimQuest(state) {
  const q = getQuest(state);
  if (!['playing', 'paused'].includes(state.phase) || !q.complete || q.done) return false;
  state.progress.gold += q.rewardGold;
  state.progress.questIndex++;
  if (state.progress.questIndex >= 4) state.progress.unlockedDeep = true;
  state.revision++;
  state.queuedEvents.push({ type: 'quest', x: state.player.x, z: state.player.z, reward: q.rewardGold });
  return true;
}

function clearCombatSession(state) {
  state.player.castId++;
  state.queuedEvents = state.queuedEvents.filter(item => !['skill', 'zone-enter', 'zone-leave'].includes(item.type));
  state.fightTargetId = null;
  state.owl.active = false; state.owl.targetId = null; state.owl.fireCd = 0;
  state.pendingSkills = [];
  state.projectiles = [];
  state.effects = [];
}

export function respawnAtCamp(state) {
  if (state.phase !== 'down') return false;
  clearCombatSession(state);
  const player = state.player;
  player.x = WORLD.camp.x; player.z = WORLD.camp.z; player.hp = player.maxHp;
  player.attackCd = player.skillCd = 0; player.invuln = 0.5;
  player.movingX = player.movingZ = 0;
  state.phase = 'playing'; state.autoHunt = false; state.inCamp = true; state.huntZoneId = null;
  for (const enemy of state.enemies) {
    enemy.x = enemy.homeX; enemy.z = enemy.homeZ; enemy.hp = enemy.maxHp;
    enemy.phase = 'idle'; enemy.phaseTime = 0; enemy.attackCd = 1; enemy.restoreOnReturn = false;
  }
  updateOwl(state, 0, false, true);
  return true;
}

export function useSkill(state, aim) {
  const player = state.player;
  if (state.phase !== 'playing' || player.hp <= 0 || state.inCamp || state.progress.skills.roots < 1 || player.skillCd > 0) return false;
  let x = player.x;
  let z = player.z;
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
    const dx = aim.x - player.x;
    const dz = aim.z - player.z;
    const scale = Math.min(1, RULES.skillAimRange / Math.max(0.0001, Math.hypot(dx, dz)));
    x += dx * scale;
    z += dz * scale;
  }
  const point = { x, z, radius: 0 };
  insideArena(point);
  const castId = ++player.castId;
  player.skillCd = player.skillCooldown;
  state.pendingSkills.push({ castId, x: point.x, z: point.z, time: 0.38, radius: player.skillRadius, damage: player.skillDamage * player.damageMult });
  effect(state, 'root-warning', point.x, point.z, 0.38, player.skillRadius, { castId, ownerId: player.id });
  state.queuedEvents.push({ type: 'skill', x: point.x, z: point.z });
  return true;
}

function hurtPlayer(state, damage, x, z) {
  const player = state.player;
  if (state.phase !== 'playing' || player.hp <= 0 || player.invuln > 0 || state.inCamp) return false;
  player.hp = Math.max(0, player.hp - damage);
  player.invuln = 0.6;
  effect(state, 'hit', player.x, player.z, 0.3, 0.8, { team: 'enemy' });
  event(state, 'player-hit', player.x, player.z, { damage, sourceX: x, sourceZ: z });
  if (player.hp === 0) { state.phase = 'down'; clearCombatSession(state); state.autoHunt = false; event(state, 'down', player.x, player.z); }
  return true;
}

function hurtEnemy(state, enemy, damage, rooted = 0) {
  if (enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  if (damage > 0 && enemy.phase === 'return' && !state.inCamp && distance(enemy, state.player) <= 9) {
    enemy.restoreOnReturn = false;
    enemy.phase = 'chase';
  }
  effect(state, 'hit', enemy.x, enemy.z, 0.22, enemy.radius, { team: 'player' });
  event(state, 'hit', enemy.x, enemy.z, { damage, targetId: enemy.id });
  if (enemy.hp === 0) {
    enemy.phase = 'dead';
    const p = state.progress, data = MONSTER_STATS[enemy.type];
    p.totals.kills++; state.kills = p.totals.kills;
    if (enemy.type === 'mushroom') p.totals.mushrooms++;
    if (enemy.homeZ < WORLD.gateZ && enemy.type !== 'boss') p.totals.deepKills++;
    const oldLevel = p.level;
    p.xp += enemy.xp ?? data.xp;
    syncStats(state, true);
    if (p.level > oldLevel) event(state, 'level-up', state.player.x, state.player.z, { level: p.level });
    if (enemy.bossId && !p.bosses.includes(enemy.bossId)) p.bosses.push(enemy.bossId);
    const spawner = state.spawners.find(item => item.id === enemy.spawnId);
    if (spawner) spawner.remaining = spawner.respawnSeconds;
    const value = enemy.loot ?? data.loot;
    if (state.loot.length >= 100) state.loot.shift();
    state.loot.push({ id: state.nextId++, zoneId: enemy.zoneId, enemyType: enemy.type, x: enemy.x, z: enemy.z, value, life: enemy.type === 'boss' ? 600 : 180 });
    state.revision++;
    effect(state, 'death', enemy.x, enemy.z, 0.55, enemy.radius * 1.6);
    event(state, 'kill', enemy.x, enemy.z, { targetId: enemy.id, enemyType: enemy.type, bossId: enemy.bossId });
  } else if (rooted > 0) {
    enemy.phase = 'stunned';
    enemy.phaseTime = rooted * (enemy.type === 'boss' ? 0.4 : 1);
  }
}

function updateSpawns(state, dt) {
  for (const spawn of state.spawners) {
    if ((spawn.deep && !state.progress.unlockedDeep) || (spawn.bossId && state.progress.bosses.includes(spawn.bossId))) continue;
    if (state.enemies.some(enemy => enemy.hp > 0 && enemy.spawnId === spawn.id)) continue;
    spawn.remaining = Math.max(0, spawn.remaining - dt);
    if (spawn.remaining > 0 || state.enemies.length >= RULES.maxEnemies) continue;
    const data = MONSTER_STATS[spawn.type], hp = spawn.hp ?? data.hp;
    state.enemies.push({
      id: state.nextId++, spawnId: spawn.id, zoneId: spawn.zoneId, bossId: spawn.bossId, type: spawn.type,
      x: spawn.x, z: spawn.z, homeX: spawn.x, homeZ: spawn.z,
      hp, maxHp: hp, radius: data.radius, speed: spawn.speed ?? data.speed, damage: spawn.damage ?? data.damage,
      xp: spawn.xp ?? data.xp, loot: spawn.loot ?? data.loot,
      phase: 'idle', phaseTime: 0, attackCd: 0.3 + random(state), restoreOnReturn: false,
      aimX: 0, aimZ: 1, angle: 0, warnX: spawn.x, warnZ: spawn.z,
      attackRadius: 1.35, length: 5.5, width: 1.6, attackNumber: 0,
    });
  }
}

function beginAttack(state, enemy) {
  const player = state.player;
  const aim = direction(player.x - enemy.x, player.z - enemy.z);
  enemy.aimX = aim.x;
  enemy.aimZ = aim.z;
  enemy.angle = Math.atan2(aim.x, aim.z);
  enemy.warnX = enemy.x;
  enemy.warnZ = enemy.z;
  enemy.phase = 'windup';
  enemy.attackNumber++;
  if (enemy.type === 'mushroom') {
    enemy.phaseTime = 0.7;
    enemy.shape = 'circle';
    enemy.attackRadius = 1.4;
  } else if (enemy.type === 'boar') {
    enemy.phaseTime = 0.95;
    enemy.shape = 'line';
    enemy.length = 5.4;
    enemy.width = 1.65;
  } else if (enemy.type === 'caster') {
    enemy.phaseTime = 0.85;
    enemy.shape = 'line';
    enemy.length = 9;
    enemy.width = 0.65;
  } else {
    enemy.phaseTime = 1.1;
    enemy.shape = 'circle';
    enemy.warnX = player.x;
    enemy.warnZ = player.z;
    enemy.attackRadius = 2.7;
  }
  enemy.windupDuration = enemy.phaseTime;
}

function inLine(point, attack) {
  const dx = point.x - attack.warnX;
  const dz = point.z - attack.warnZ;
  const along = dx * attack.aimX + dz * attack.aimZ;
  const across = Math.abs(dx * attack.aimZ - dz * attack.aimX);
  return along >= 0 && along <= attack.length && across <= attack.width / 2;
}

function projectile(state, x, z, aimX, aimZ, team, damage, speed, extra = {}) {
  if (state.projectiles.length >= RULES.maxProjectiles) return null;
  const bolt = {
    id: state.nextId++, x, z, dx: aimX * speed, dz: aimZ * speed,
    team, damage, life: team === 'player' ? 1.5 : 3,
    radius: team === 'player' ? 0.17 : 0.26, hitIds: [], pierce: 0,
    ...(team === 'player' ? { source: 'staff' } : {}), ...extra,
  };
  state.projectiles.push(bolt);
  return bolt;
}

function resolveAttack(state, enemy) {
  if (enemy.type === 'caster') {
    projectile(state, enemy.x, enemy.z, enemy.aimX, enemy.aimZ, 'enemy', enemy.damage, 5.2);
    enemy.phase = 'recovery';
    enemy.phaseTime = 0.9;
  } else if (enemy.type === 'boar') {
    if (inLine(state.player, enemy)) hurtPlayer(state, enemy.damage, enemy.x, enemy.z);
    enemy.phase = 'charge';
    enemy.phaseTime = 0.34;
    enemy.chargeTime = 0.34;
    effect(state, 'charge', enemy.warnX, enemy.warnZ, 0.3, 1, { angle: enemy.angle, length: enemy.length });
  } else {
    if (Math.hypot(state.player.x - enemy.warnX, state.player.z - enemy.warnZ) <= enemy.attackRadius) {
      hurtPlayer(state, enemy.damage, enemy.x, enemy.z);
    }
    effect(state, 'slam', enemy.warnX, enemy.warnZ, 0.38, enemy.attackRadius, { team: 'enemy' });
    enemy.phase = 'recovery';
    enemy.phaseTime = enemy.type === 'boss' ? 1.15 : 0.7;
  }
}

function separateEnemies(state, dt) {
  const bodies = state.enemies.filter(enemy => enemy.hp > 0).sort((a, b) => a.id - b.id);
  const offsets = bodies.map(() => ({ x: 0, z: 0 }));
  const response = Math.min(1, dt * 12);
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    const moveA = a.phase === 'chase';
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const moveB = b.phase === 'chase';
      if (!moveA && !moveB) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const overlap = a.radius + b.radius + 0.08 - length;
      if (overlap <= 0) continue;
      if (length > 0.00001) { dx /= length; dz /= length; }
      else {
        // Stable per-pair direction also separates coincident spawn positions.
        const angle = (((a.id * 73856093) ^ (b.id * 19349663)) >>> 0) / 4294967296 * Math.PI * 2;
        dx = Math.cos(angle);
        dz = Math.sin(angle);
      }
      const push = overlap * response / (moveA && moveB ? 2 : 1);
      if (moveA) { offsets[i].x -= dx * push; offsets[i].z -= dz * push; }
      if (moveB) { offsets[j].x += dx * push; offsets[j].z += dz * push; }
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    if (bodies[i].phase !== 'chase') continue;
    const offset = offsets[i];
    const length = Math.hypot(offset.x, offset.z);
    const scale = Math.min(1, 2.4 * dt / Math.max(length, 0.00001));
    bodies[i].x += offset.x * scale;
    bodies[i].z += offset.z * scale;
    insideArena(bodies[i]);
  }
}

function updateEnemies(state, dt) {
  separateEnemies(state, dt);
  for (const enemy of state.enemies) {
    if (state.phase !== 'playing') break;
    if (enemy.hp <= 0) continue;
    enemy.homeX ??= enemy.x; enemy.homeZ ??= enemy.z;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    const homeDistance = Math.hypot(enemy.x - enemy.homeX, enemy.z - enemy.homeZ);
    const dist = distance(enemy, state.player);
    const locked = ['windup', 'charge', 'stunned'].includes(enemy.phase);
    const playerHomeDistance = Math.hypot(state.player.x - enemy.homeX, state.player.z - enemy.homeZ);
    const playerDisengaged = state.inCamp || (!locked && (dist > 9 || playerHomeDistance > 11));
    if (playerDisengaged || (!locked && homeDistance > 7)) {
      if (enemy.phase !== 'idle') {
        if (enemy.phase !== 'return') enemy.restoreOnReturn = playerDisengaged;
        else if (playerDisengaged) enemy.restoreOnReturn = true;
        enemy.phase = 'return';
      }
    }
    if (enemy.phase === 'return') {
      const home = direction(enemy.homeX - enemy.x, enemy.homeZ - enemy.z, 0, 0);
      const step = Math.min(enemy.speed * dt * 1.4, homeDistance);
      enemy.x += home.x * step; enemy.z += home.z * step;
      if (homeDistance < 0.12) {
        enemy.phase = 'idle';
        if (enemy.restoreOnReturn) enemy.hp = enemy.maxHp;
        enemy.restoreOnReturn = false;
      }
      continue;
    }
    if (enemy.phase === 'idle') {
      if (!state.inCamp && (dist < (enemy.type === 'boss' ? 6 : 5.7) || (enemy.hp < enemy.maxHp && dist <= 9))) enemy.phase = 'chase';
      else continue;
    }
    if (enemy.phase === 'charge') {
      const portion = Math.min(dt, enemy.phaseTime) / enemy.chargeTime;
      enemy.x += enemy.aimX * enemy.length * portion;
      enemy.z += enemy.aimZ * enemy.length * portion;
      insideArena(enemy);
    }
    if (enemy.phase !== 'chase') {
      enemy.phaseTime -= dt;
      if (enemy.phaseTime <= 0) {
        if (enemy.phase === 'windup') resolveAttack(state, enemy);
        else if (enemy.phase === 'charge') { enemy.phase = 'recovery'; enemy.phaseTime = 0.7; }
        else { enemy.phase = 'chase'; enemy.attackCd = 0.35; }
      }
      continue;
    }
    const reach = enemy.type === 'caster' ? 4.8 : enemy.type === 'boar' ? 4.2 : enemy.type === 'boss' ? 4.3 : 1.15;
    if (dist <= reach && enemy.attackCd <= 0) beginAttack(state, enemy);
    else {
      const aim = direction(state.player.x - enemy.x, state.player.z - enemy.z);
      const retreat = enemy.type === 'caster' && dist < 2.5 ? -1 : dist > reach * 0.8 ? 1 : 0;
      enemy.x += aim.x * enemy.speed * dt * retreat;
      enemy.z += aim.z * enemy.speed * dt * retreat;
      enemy.angle = Math.atan2(aim.x, aim.z);
      insideArena(enemy);
    }
  }
}

// Earliest segment-circle contact prevents fast bolts tunnelling past a target.
function segmentHit(x, z, endX, endZ, target, radius) {
  const dx = endX - x;
  const dz = endZ - z;
  const px = x - target.x;
  const pz = z - target.z;
  const c = px * px + pz * pz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (px * dx + pz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function updateProjectiles(state, dt) {
  const active = [];
  for (const bolt of state.projectiles) {
    if (state.phase !== 'playing') break;
    const travelTime = Math.min(dt, bolt.life);
    bolt.life -= dt;
    if (travelTime <= 0) continue;
    if (bolt.source === 'owl') {
      const target = state.enemies.find(enemy => enemy.id === bolt.targetId && enemy.hp > 0);
      if (target) {
        const heading = Math.atan2(bolt.dx, bolt.dz);
        const wanted = Math.atan2(target.x - bolt.x, target.z - bolt.z);
        const difference = Math.atan2(Math.sin(wanted - heading), Math.cos(wanted - heading));
        const angle = heading + clamp(difference, -(bolt.turnRate || 6) * travelTime, (bolt.turnRate || 6) * travelTime);
        const speed = Math.hypot(bolt.dx, bolt.dz);
        bolt.dx = Math.sin(angle) * speed; bolt.dz = Math.cos(angle) * speed;
      }
    }
    const endX = bolt.x + bolt.dx * travelTime;
    const endZ = bolt.z + bolt.dz * travelTime;
    const targets = bolt.team === 'player' ? state.enemies : [state.player];
    const hits = [];
    for (const target of targets) {
      if (target.hp <= 0 || bolt.hitIds.includes(target.id)) continue;
      const t = segmentHit(bolt.x, bolt.z, endX, endZ, target, target.radius + bolt.radius);
      if (t !== null) hits.push({ target, t });
    }
    hits.sort((a, b) => a.t - b.t || a.target.id - b.target.id);
    let consumed = false;
    for (const { target } of hits) {
      bolt.hitIds.push(target.id);
      if (bolt.team === 'player') hurtEnemy(state, target, bolt.damage);
      else hurtPlayer(state, bolt.damage, bolt.x, bolt.z);
      if (bolt.pierce <= 0) { consumed = true; break; }
      bolt.pierce--;
    }
    bolt.x = endX;
    bolt.z = endZ;
    if (!consumed && bolt.life > 0 && endX > WORLD.minX - 2 && endX < WORLD.maxX + 2 && endZ > WORLD.minZ - 2 && endZ < WORLD.maxZ + 2) active.push(bolt);
  }
  state.projectiles = state.phase === 'playing' ? active : [];
}

function updateSkills(state, dt) {
  const pending = [];
  for (const cast of state.pendingSkills) {
    if (cast.castId !== state.player.castId || state.player.hp <= 0) continue;
    cast.time -= dt;
    if (cast.time > 0) { pending.push(cast); continue; }
    effect(state, 'root-burst', cast.x, cast.z, 0.65, cast.radius);
    event(state, 'burst', cast.x, cast.z);
    for (const enemy of state.enemies) {
      if (enemy.hp > 0 && Math.hypot(enemy.x - cast.x, enemy.z - cast.z) <= cast.radius + enemy.radius) {
        hurtEnemy(state, enemy, cast.damage, 1.35);
      }
    }
  }
  state.pendingSkills = state.phase === 'playing' ? pending : [];
}

function updateLootAndCamp(state, dt) {
  const player = state.player;
  state.inCamp = Math.hypot(player.x - WORLD.camp.x, player.z - WORLD.camp.z) <= WORLD.camp.radius;
  for (const coin of state.loot) {
    coin.life -= dt;
    if (distance(coin, player) <= 1.5 && state.cargo < player.capacity) {
      const amount = Math.min(coin.value, player.capacity - state.cargo);
      state.cargo += amount; state.progress.cargo = state.cargo; coin.value -= amount; state.revision++;
      event(state, 'pickup', coin.x, coin.z, { amount });
    }
  }
  state.loot = state.loot.filter(coin => coin.value > 0 && coin.life > 0);
  if (!state.inCamp) return;
  if (state.cargo > 0) {
    const amount = state.cargo;
    state.progress.gold += amount; state.progress.totals.banked += amount;
    state.cargo = state.progress.cargo = 0; state.revision++;
    event(state, 'deposit', player.x, player.z, { amount });
  }
  player.hp = Math.min(player.maxHp, player.hp + dt * 25);
}

function leaveHuntZone(state) {
  if (state.huntZoneId) {
    state.queuedEvents.push({ type: 'zone-leave', zoneId: state.huntZoneId, x: state.player.x, z: state.player.z });
  }
  state.huntZoneId = null;
  state.autoHunt = false;
}

function refreshHuntZone(state) {
  if (state.inCamp) { leaveHuntZone(state); return; }
  const current = HUNT_ZONES.find(zone => zone.id === state.huntZoneId);
  if (current && (!current.deep || state.progress.unlockedDeep) && distance(current, state.player) <= current.radius + RULES.huntLeavePadding) return;
  if (state.huntZoneId) leaveHuntZone(state);
  let next = null, nearestEdge = Infinity;
  for (const zone of HUNT_ZONES) {
    if (zone.deep && !state.progress.unlockedDeep) continue;
    const edge = distance(zone, state.player) - zone.radius;
    if (edge <= RULES.huntEnterPadding && (edge < nearestEdge - 1e-9 || (Math.abs(edge - nearestEdge) <= 1e-9 && (!next || zone.id < next.id)))) {
      next = zone; nearestEdge = edge;
    }
  }
  if (next) {
    state.huntZoneId = next.id; state.autoHunt = true;
    state.queuedEvents.push({ type: 'zone-enter', zoneId: next.id, name: next.name, x: state.player.x, z: state.player.z });
  }
}

function autoMovement(state) {
  const player = state.player;
  if (!state.autoHunt || !state.huntZoneId) return { x: 0, z: 0 };
  if (nearestCombatTarget(state)) return { x: 0, z: 0 };
  const zone = HUNT_ZONES.find(item => item.id === state.huntZoneId);
  if (!zone) return { x: 0, z: 0 };
  const steerLocally = target => {
    const dx = target.x - zone.x, dz = target.z - zone.z;
    const scale = Math.min(1, (zone.radius - 0.2) / Math.max(0.00001, Math.hypot(dx, dz)));
    return { x: zone.x + dx * scale - player.x, z: zone.z + dz * scale - player.z };
  };
  let target, nearest = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.zoneId !== state.huntZoneId || enemy.type !== zone.type || distance(enemy, zone) > zone.radius + 0.2) continue;
    const dist = distance(enemy, player);
    if (dist < nearest) { target = enemy; nearest = dist; }
  }
  if (target) return nearest > RULES.attackRange ? steerLocally(target) : { x: 0, z: 0 };
  // Only an out-of-range local enemy can choose an automatic movement goal.
  return { x: 0, z: 0 };
}

function automaticSkills(state) {
  if (state.inCamp) return;
  const player = state.player;
  let target, nearest = RULES.attackRange + 0.5;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distance(enemy, player);
    if (dist < nearest) { target = enemy; nearest = dist; }
  }
  if (target && state.progress.skills.roots > 0 && player.skillCd <= 0) useSkill(state, target);
}

function syncOwlStats(state) {
  const owl = state.owl, rank = state.progress.skills.owl;
  owl.rank = rank;
  owl.active = rank > 0 && state.phase !== 'down' && state.player.hp > 0;
  owl.fireCooldown = skillInterval('owl', rank);
  owl.damage = rank > 0 ? owlDamage(state, rank) : 0;
  owl.range = 5.5;
  if (!owl.active) owl.targetId = null;
}

function updateOwl(state, dt, canFire = true, snap = false) {
  const owl = state.owl;
  syncOwlStats(state);
  const side = state.player.x - 1.25 < WORLD.minX + 0.25 ? 1 : -1;
  const goal = { x: state.player.x + side * 1.25, z: state.player.z + 0.3, radius: 0.25 };
  insideArena(goal);
  const follow = snap ? 1 : Math.min(1, dt * 10);
  owl.x += (goal.x - owl.x) * follow; owl.z += (goal.z - owl.z) * follow;
  if (!owl.active || state.phase !== 'playing') return;
  owl.fireCd = Math.max(0, owl.fireCd - dt);
  if (state.inCamp) { owl.targetId = null; return; }
  let target = null, nearest = owl.range;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distance(enemy, owl);
    if (dist < nearest || (dist === nearest && (!target || enemy.id < target.id))) { target = enemy; nearest = dist; }
  }
  owl.targetId = target?.id ?? null;
  if (!canFire || !target || owl.fireCd > 0) return;
  const aim = direction(target.x - owl.x, target.z - owl.z);
  const bolt = projectile(state, owl.x, owl.z, aim.x, aim.z, 'player', owl.damage, 8,
    { source: 'owl', targetId: target.id, turnRate: 6, life: 2 });
  if (bolt) {
    owl.fireCd = owl.fireCooldown;
    event(state, 'owl-shoot', owl.x, owl.z, { aimX: aim.x, aimZ: aim.z, targetId: target.id });
  }
}

function nearestCombatTarget(state) {
  if (state.inCamp || state.phase !== 'playing' || state.player.hp <= 0) return null;
  let target = null, nearest = RULES.attackRange;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distance(enemy, state.player);
    if (dist < nearest || (dist === nearest && (!target || enemy.id < target.id))) { target = enemy; nearest = dist; }
  }
  return target;
}

export function stepGame(state, input = {}, dt = 1 / 60) {
  state.events = state.queuedEvents.splice(0);
  if (state.phase !== 'playing') { state.fightTargetId = null; return state; }
  if (!Number.isFinite(dt) || dt <= 0) return state;
  dt = Math.min(dt, RULES.maxStep);
  const player = state.player;
  if (player.hp <= 0) { state.phase = 'down'; clearCombatSession(state); return state; }
  state.time += dt; state.elapsed = state.time;
  for (const item of state.effects) item.life -= dt;
  state.effects = state.effects.filter(item => item.life > 0);
  for (const key of ['attackCd', 'skillCd', 'invuln']) player[key] = Math.max(0, player[key] - dt);
  state.inCamp = Math.hypot(player.x - WORLD.camp.x, player.z - WORLD.camp.z) <= WORLD.camp.radius;
  let mx = number(input.moveX), mz = number(input.moveZ);
  const manual = input.manual || Math.hypot(mx, mz) > 0.05;
  refreshHuntZone(state);
  if (!manual) {
    const automatic = autoMovement(state); mx = automatic.x; mz = automatic.z;
  }
  const magnitude = Math.min(1, Math.hypot(mx, mz));
  const move = direction(mx, mz, 0, 0);
  player.movingX = move.x * magnitude; player.movingZ = move.z * magnitude;
  player.x += player.movingX * RULES.playerSpeed * dt; player.z += player.movingZ * RULES.playerSpeed * dt;
  if (magnitude > 0) { player.facingX = move.x; player.facingZ = move.z; }
  insideArena(player);
  if (!state.progress.unlockedDeep) player.z = Math.max(WORLD.gateZ + player.radius, player.z);
  state.inCamp = Math.hypot(player.x - WORLD.camp.x, player.z - WORLD.camp.z) <= WORLD.camp.radius;
  refreshHuntZone(state);
  updateLootAndCamp(state, dt);
  automaticSkills(state);
  updateSkills(state, dt);
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  updateSpawns(state, dt);
  updateEnemies(state, dt);
  if (state.phase !== 'playing') return state;
  updateOwl(state, dt);
  const target = nearestCombatTarget(state);
  if (player.attackCd <= 0 && target) {
      const aim = direction(target.x - player.x, target.z - player.z);
      projectile(state, player.x, player.z, aim.x, aim.z, 'player', player.attackDamage * player.damageMult, 13);
      player.attackCd = 0.58;
      if (magnitude === 0) { player.facingX = aim.x; player.facingZ = aim.z; }
      event(state, 'shoot', player.x, player.z, { aimX: aim.x, aimZ: aim.z, targetId: target.id });
  }
  updateProjectiles(state, dt);
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.owl.targetId !== null && !state.enemies.some(enemy => enemy.id === state.owl.targetId)) state.owl.targetId = null;
  state.fightTargetId = nearestCombatTarget(state)?.id ?? null;
  return state;
}
