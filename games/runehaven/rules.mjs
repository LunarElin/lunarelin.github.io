import { BALANCE } from './balance.mjs';
import { BOUNDS, getRegion, getStations, STATIONS } from './maps.mjs';
import { DINING_RULES, createDiningState, getDiningLayout } from './dining.mjs';
import { BATTLE_BOUNDS, getBattleLayout } from './battlefield.mjs';

export { DINING_RULES, getDiningLayout };

export { BOUNDS, getRegion, getStations, STATIONS };

export function getStationApproach(state, key) {
  const station = getStations(state)[key];
  return { x: station.x, z: station.z + (key === 'counter' || key === 'potionCounter' ? -.85 : .8) };
}

export const SAVE_VERSION = 1;
export const COMBAT_RADIUS = 0.46;

export const CLASS_STATS = Object.freeze({
  warrior: Object.freeze({ name: '전사', hp: 90, damage: 15, range: 1, speed: 1.65, interval: 1.05 }),
  archer: Object.freeze({ name: '궁수', hp: 60, damage: 12, range: 3.5, speed: 1.6, interval: 0.85 }),
  mage: Object.freeze({ name: '마법사', hp: 55, damage: 22, range: 3.1, speed: 1.4, interval: 1.65 }),
});

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const levelRow = (level) => BALANCE.playerLevels[level - 1];
const PRODUCTS = ['gear', 'potion', 'food'];
const WORKER_JOBS = [...PRODUCTS, 'clean'];
const bagCount = (bag) => PRODUCTS.reduce((sum, product) => sum + (bag[product] ?? 0), 0);
const nextId = (state, prefix) => `${prefix}-${state.nextId++}`;

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function seedNumber(seed) {
  if (Number.isFinite(seed)) return seed >>> 0;
  let value = 2166136261;
  for (const letter of String(seed)) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
  return value >>> 0;
}

function emit(state, type, text, position = state.player, amount = 0, details = {}) {
  const event = { id: nextId(state, 'event'), type, text, x: position.x, z: position.z, amount, ttl: 3, ...details };
  state.events.push(event);
  if (state.events.length > 24) state.events.shift();
  state.effects.push({ ...event, ttl: type === 'blink' ? 0.7 : 1 });
  if (state.effects.length > 48) state.effects.shift();
  if (text) {
    state.message = text;
    state.messageTimer = 3;
  }
}

function result(state, ok, reason = '', extra = {}) {
  state.lastAction = { ok, reason, ...extra };
  if (!ok && reason) emit(state, 'notice', reason);
  return state.lastAction;
}

export function createGame(seed = 1) {
  const spawn = getRegion(1).spawn;
  return {
    version: SAVE_VERSION,
    seed: seedNumber(seed), rng: seedNumber(seed), nextId: 1,
    time: 0, status: 'playing', stage: 1, gold: BALANCE.web.startingCoins ?? 80,
    sales: 0, lodgings: 0, milestone: false, saveReset: false,
    economy: { earned: 0, spent: 0 },
    dining: createDiningState(),
    moneyPiles: { gear: 0, potion: 0, inn: 0 },
    facilityLevels: { forge: 1, counter: 1, alchemy: 1, inn: 1 },
    workerLevels: { speed: 1, capacity: 1 },
    player: { x: spawn.x, z: spawn.z, bag: { gear: 0, potion: 0, food: 0 }, speedLevel: 1, capacityLevel: 1, priceLevel: 1, facingX: 0, facingZ: -1, blinkCooldown: 0, target: null, transferClock: 0, moving: false, dwell: 0, workKind: null },
    stocks: { forge: BALANCE.facilities.forge.capacity, gear: 0, alchemy: 0, potion: 0 },
    unlocks: { archer: false, mage: false, alchemy: false, inn: false, alchemyAvailable: false, innAvailable: false },
    customers: [], patrons: [], staff: [], effects: [], events: [],
    shopHp: 240, shopMaxHp: 240,
    raid: { phase: 'idle', location: 'shop', wave: 0, wins: 0, kind: 'monsters', timer: 90, enemies: [], defenders: [], spawnRemaining: 0, spawnClock: 0, triggerSales: 18, reward: 0 },
    timers: { forge: 0, alchemy: 0, customer: 1, innHeal: 0 },
    message: '대장간에서 장비를 챙겨 진열대에 놓으세요', messageTimer: 6,
    lastAction: null,
  };
}

export function getStageInfo(state) {
  const stages = BALANCE.stages.filter((stage) => !stage.event);
  return stages[(state.stage - 1) % stages.length];
}

export function getCapacity(state) {
  return levelRow(state.player.capacityLevel).capacity;
}

export function getSpeed(state) {
  return levelRow(state.player.speedLevel).speed;
}

export function getCoinMultiplier(state) {
  const multipliers = BALANCE.web.saleCoinMultipliers ?? [10, 25, 80, 240, 750, 1500];
  return Math.min(10000, multipliers[Math.min(state.stage - 1, multipliers.length - 1)] * 1.5 ** Math.max(0, state.stage - multipliers.length));
}

export function getSalePrice(state, product = 'gear') {
  const base = product === 'potion' ? BALANCE.facilities.alchemy.salePrice : BALANCE.facilities.counter.salePrice;
  return Math.round((base + levelRow(state.player.priceLevel).price) * getCoinMultiplier(state));
}

export function getUpgradeInfo(state, kind) {
  if (!['speed', 'capacity', 'price'].includes(kind)) return null;
  const currentLevel = state.player[`${kind}Level`];
  const maxLevel = BALANCE.playerLevels.length;
  const cost = currentLevel < maxLevel ? levelRow(currentLevel)[`${kind}Cost`] : 0;
  return { kind, currentLevel, maxLevel, cost, value: levelRow(currentLevel)[kind], nextValue: currentLevel < maxLevel ? levelRow(currentLevel + 1)[kind] : null, canBuy: currentLevel < maxLevel && state.gold >= cost && state.status === 'playing' };
}

function facilityStats(kind, level) {
  const source = BALANCE.facilities[kind];
  const form = source.abilities[level - 1][0];
  const value = (type, fallback = 0) => {
    const index = form.types.indexOf(type);
    return index < 0 || !Number.isFinite(form.values[index]) ? fallback : form.values[index];
  };
  return { seconds: value(10, source.productionSeconds), capacity: value(30, source.capacity ?? null), bonusPercent: value(20) };
}

export function getFacilityStats(state, kind) {
  return ['forge', 'counter', 'alchemy', 'inn'].includes(kind) ? facilityStats(kind, state.facilityLevels[kind]) : null;
}

export function getFacilityUpgradeInfo(state, kind) {
  if (!['forge', 'counter', 'alchemy', 'inn'].includes(kind)) return null;
  const source = BALANCE.facilities[kind];
  const currentLevel = state.facilityLevels[kind], maxLevel = source.costs.length;
  const cost = currentLevel < maxLevel ? source.costs[currentLevel] : 0;
  const unlocked = kind === 'forge' || kind === 'counter' || state.unlocks[kind];
  return { kind, currentLevel, maxLevel, cost, costType: source.costTypes[currentLevel] ?? null, value: facilityStats(kind, currentLevel), nextValue: currentLevel < maxLevel ? facilityStats(kind, currentLevel + 1) : null, unlocked, canBuy: unlocked && currentLevel < maxLevel && state.gold >= cost && state.status === 'playing' };
}

export function getWorkerUpgradeInfo(state, kind) {
  if (!['speed', 'capacity'].includes(kind)) return null;
  const values = kind === 'speed' ? BALANCE.worker.speeds : BALANCE.worker.capacities;
  const currentLevel = state.workerLevels[kind], maxLevel = values.length;
  const cost = currentLevel < maxLevel ? BALANCE.worker[`${kind}Costs`][currentLevel - 1] : 0;
  return { kind, currentLevel, maxLevel, cost, costType: BALANCE.worker[`${kind}CostTypes`][currentLevel - 1] ?? null, value: values[currentLevel - 1], nextValue: currentLevel < maxLevel ? values[currentLevel] : null, canBuy: currentLevel < maxLevel && state.gold >= cost && state.status === 'playing' };
}

function applyWorkerStats(state, helper, source = BALANCE.staffs.find((row) => row.id === helper.sourceId)) {
  helper.speed = source.speed * BALANCE.worker.speeds[state.workerLevels.speed - 1] / BALANCE.worker.speeds[0];
  helper.capacity = source.capacity + BALANCE.worker.capacities[state.workerLevels.capacity - 1] - BALANCE.worker.capacities[0];
  return helper;
}

export function getMoneyPiles(state) {
  const stations = getStations(state);
  return [
    { id: 'gear', kind: 'gear', x: stations.counter.x - Math.sign(stations.counter.x) * 1.25, z: stations.counter.z - 0.4, amount: state.moneyPiles.gear },
    { id: 'potion', kind: 'potion', x: stations.potionCounter.x - Math.sign(stations.potionCounter.x) * 1.25, z: stations.potionCounter.z - 0.4, amount: state.moneyPiles.potion },
    { id: 'inn', kind: 'inn', x: stations.inn.x + 1.5, z: stations.inn.z + 0.45, amount: state.moneyPiles.inn },
  ];
}

export function getHireInfo(state) {
  const maxWorkers = Math.min(BALANCE.web.helperCap ?? 3, BALANCE.worker.maxEmploy);
  const cost = BALANCE.worker.employCosts[state.staff.length] ?? Infinity;
  return { cost, count: state.staff.length, maxWorkers, canBuy: state.staff.length < maxWorkers && state.gold >= cost && state.status === 'playing' };
}

export function getUnlockInfo(state, kind) {
  if (!['alchemy', 'inn'].includes(kind)) return null;
  const requiredSales = kind === 'alchemy' ? BALANCE.web.alchemyUnlockSales : BALANCE.web.innUnlockSales;
  const cost = BALANCE.facilities[kind].costs[0];
  return { kind, cost, requiredSales, unlocked: state.unlocks[kind], available: state.sales >= requiredSales, canBuy: !state.unlocks[kind] && state.sales >= requiredSales && state.gold >= cost && state.status === 'playing' };
}

export function getRepairInfo(state) {
  const cost = state.raid.phase === 'defeat' ? 0 : Math.ceil((state.shopMaxHp - state.shopHp) * 1.5);
  return { cost, canBuy: state.shopHp < state.shopMaxHp && state.gold >= cost, freeRecovery: state.raid.phase === 'defeat' };
}

function spend(state, cost) {
  if (state.gold < cost) return false;
  state.gold -= cost;
  state.economy.spent += cost;
  return true;
}

function earn(state, amount, pile = null) {
  if (pile) state.moneyPiles[pile] += amount;
  else state.gold += amount;
  state.economy.earned += amount;
}

function updateUnlocks(state) {
  const priorArcher = state.unlocks.archer;
  const priorMage = state.unlocks.mage;
  state.unlocks.archer = state.sales >= BALANCE.web.archerUnlockSales;
  state.unlocks.alchemyAvailable = state.sales >= BALANCE.web.alchemyUnlockSales;
  state.unlocks.innAvailable = state.sales >= BALANCE.web.innUnlockSales;
  state.unlocks.mage = state.sales >= BALANCE.web.mageUnlockSales && state.unlocks.alchemy;
  if (!priorArcher && state.unlocks.archer) emit(state, 'unlock', '궁수 손님 · 연금 공방 개방');
  if (!priorMage && state.unlocks.mage) emit(state, 'unlock', '마법사 손님이 찾아옵니다');
}

function drawHelper(state) {
  const packIndex = Math.min(BALANCE.drawRates.length - 1, Math.floor((state.stage - 1) / 3));
  const weights = BALANCE.drawRates[packIndex].weights;
  let draw = random(state) * weights.reduce((sum, weight) => sum + weight, 0);
  let grade = 1;
  for (let index = 0; index < weights.length; index++) {
    draw -= weights[index];
    if (draw <= 0) { grade = index + 1; break; }
  }
  const available = BALANCE.staffs.filter((staff) => staff.openStageId <= Math.min(state.stage - 1, 9));
  const pool = available.filter((staff) => staff.grade === grade);
  const choices = pool.length ? pool : available;
  return choices[Math.floor(random(state) * choices.length)];
}

export function act(state, action, payload = {}) {
  if (!payload || typeof payload !== 'object') payload = {};
  const stations = getStations(state);
  if (action === 'restart') {
    const next = createGame(state.seed);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, next);
    return result(state, true);
  }
  if (action === 'repair' || action === 'recover') {
    const info = getRepairInfo(state);
    if (!info.canBuy) return result(state, false, state.shopHp >= state.shopMaxHp ? '상회는 튼튼합니다' : '골드가 부족합니다');
    spend(state, info.cost);
    state.shopHp = state.shopMaxHp;
    if (state.raid.phase === 'defeat') {
      state.status = 'playing';
      state.raid.phase = 'recovery';
      state.raid.timer = 4;
      state.raid.enemies = [];
      state.raid.defenders = [];
      state.raid.spawnRemaining = 0;
      state.customers = [];
      for (const patron of state.patrons) patron.hp = patron.maxHp;
      returnToShop(state);
    }
    emit(state, 'repair', info.freeRecovery ? '무료 복구 · 단골과 다시 준비하세요' : '상회를 수리했습니다', stations.inn);
    return result(state, true, '', { cost: info.cost });
  }
  if (state.status !== 'playing') return result(state, false, '상회를 복구해 주세요');
  if (action === 'upgrade-facility' || action === 'upgrade-worker') {
    const facility = action === 'upgrade-facility';
    const info = facility ? getFacilityUpgradeInfo(state, payload.kind) : getWorkerUpgradeInfo(state, payload.kind);
    if (!info) return result(state, false, '강화 종류를 확인하세요');
    if (facility && !info.unlocked) return result(state, false, '시설을 먼저 개방하세요');
    if (info.currentLevel >= info.maxLevel) return result(state, false, '최고 단계입니다');
    if (!spend(state, info.cost)) return result(state, false, '골드가 부족합니다');
    (facility ? state.facilityLevels : state.workerLevels)[payload.kind]++;
    if (!facility) for (const helper of state.staff) applyWorkerStats(state, helper);
    emit(state, 'upgrade', facility ? '시설 강화 완료' : '모든 조수의 훈련 완료', facility ? stations[payload.kind] : state.player);
    return result(state, true, '', { cost: info.cost });
  }
  if (action === 'upgrade') {
    const info = getUpgradeInfo(state, payload.kind);
    if (!info) return result(state, false, '강화 종류를 확인하세요');
    if (info.currentLevel >= info.maxLevel) return result(state, false, '최고 단계입니다');
    if (!spend(state, info.cost)) return result(state, false, '골드가 부족합니다');
    state.player[`${payload.kind}Level`]++;
    emit(state, 'upgrade', payload.kind === 'speed' && state.player.speedLevel === 21 ? '속도 21 · 점멸을 배웠습니다' : '강화 완료');
    return result(state, true, '', { cost: info.cost });
  }
  if (action === 'hire') {
    const info = getHireInfo(state);
    if (info.count >= info.maxWorkers) return result(state, false, '조수는 세 명까지 함께합니다');
    if (!spend(state, info.cost)) return result(state, false, '골드가 부족합니다');
    const source = drawHelper(state);
    const product = state.unlocks.alchemy && state.staff.length % 2 === 1 ? 'potion' : 'gear';
    const supply = product === 'gear' ? stations.forge : stations.alchemy;
    const helper = applyWorkerStats(state, { id: nextId(state, 'helper'), sourceId: source.id, name: source.name, grade: source.grade, income: source.income, x: supply.x, z: supply.z + 0.5, product, job: product, jobAssigned: false, phase: 'collect', bag: { gear: 0, potion: 0, food: 0 }, timer: 0 }, source);
    state.staff.push(helper);
    Object.assign(helper, getStationApproach(state, product === 'gear' ? 'forge' : 'alchemy'));
    emit(state, 'hire', `${source.grade}등급 조수 합류`, supply);
    return result(state, true, '', { cost: info.cost, sourceId: source.id });
  }
  if (action === 'assign-worker') {
    const helper = state.staff.find((item) => item.id === payload.id);
    if (!helper || !WORKER_JOBS.includes(payload.job)) return result(state, false, '조수와 직무를 확인하세요');
    if (payload.job === 'potion' && !state.unlocks.alchemy) return result(state, false, '연금 공방을 먼저 개방하세요');
    if (['food', 'clean'].includes(payload.job) && !state.unlocks.inn) return result(state, false, '여관을 먼저 개방하세요');
    releaseCleaning(state, helper.id);
    helper.job = payload.job; helper.jobAssigned = true;
    if (payload.job !== 'clean') helper.product = payload.job;
    helper.phase = bagCount(helper.bag) > 0 ? 'haul' : 'collect'; helper.timer = 0; helper.workKind = null;
    emit(state, 'worker-job', '조수 직무 변경', helper, 0, { actorId: helper.id, job: payload.job });
    return result(state, true, '', { id: helper.id, job: payload.job, cost: 0 });
  }
  if (action === 'unlock') {
    const info = getUnlockInfo(state, payload.kind);
    if (!info) return result(state, false, '시설을 확인하세요');
    if (info.unlocked) return result(state, false, '이미 개방했습니다');
    if (!info.available) return result(state, false, `판매 ${info.requiredSales}회가 필요합니다`);
    if (!spend(state, info.cost)) return result(state, false, '골드가 부족합니다');
    state.unlocks[payload.kind] = true;
    if (payload.kind === 'alchemy') {
      state.stocks.alchemy = getFacilityStats(state, 'alchemy').capacity;
      // One physical helper changes route; no offscreen stock teleportation.
      if (state.staff.length > 1 && !state.staff[1].jobAssigned) {
        state.staff[1].product = state.staff[1].job = 'potion';
        state.staff[1].phase = bagCount(state.staff[1].bag) > 0 ? 'haul' : 'collect'; state.staff[1].timer = 0;
      }
    }
    updateUnlocks(state);
    emit(state, 'unlock', payload.kind === 'alchemy' ? '연금 공방 개방' : '여관 개방 · 음식을 나르세요', stations[payload.kind]);
    return result(state, true, '', { cost: info.cost });
  }
  if (action === 'blink' || action === 'teleport') {
    if (state.player.speedLevel < BALANCE.magic.teleportAtLevel) return result(state, false, '속도 21에서 점멸을 배웁니다');
    if (state.player.blinkCooldown > 0) return result(state, false, '점멸을 준비 중입니다');
    const target = payload.target ?? payload;
    let dx = Number.isFinite(target.x) ? target.x - state.player.x : state.player.facingX;
    let dz = Number.isFinite(target.z) ? target.z - state.player.z : state.player.facingZ;
    const length = Math.hypot(dx, dz);
    if (!length) return result(state, false, '점멸 방향을 골라 주세요');
    if (Number.isFinite(target.x) && Number.isFinite(target.z)) {
      const factor = Math.min(1, BALANCE.magic.range / length);
      dx *= factor; dz *= factor;
    } else { dx = dx / length * BALANCE.magic.range; dz = dz / length * BALANCE.magic.range; }
    emit(state, 'blink', '', state.player);
    state.player.x = clamp(state.player.x + dx, BOUNDS.minX, BOUNDS.maxX);
    state.player.z = clamp(state.player.z + dz, BOUNDS.minZ, BOUNDS.maxZ);
    state.player.target = null;
    state.player.dwell = 0; state.player.workKind = null;
    state.player.blinkCooldown = BALANCE.magic.cooldown;
    emit(state, 'blink', '점멸', state.player);
    return result(state, true);
  }
  if (action === 'continue' && state.raid.phase === 'victory') {
    finishRecovery(state);
    return result(state, true);
  }
  return result(state, false, '사용할 수 없는 행동입니다');
}

function moveToward(actor, target, speed, dt, stop = 0) {
  const dx = target.x - actor.x, dz = target.z - actor.z;
  const length = Math.hypot(dx, dz);
  if (length <= stop) return true;
  const travel = Math.min(length - stop, speed * dt);
  actor.x += dx / length * travel;
  actor.z += dz / length * travel;
  return length - travel <= stop + 0.001;
}

function updatePlayer(state, dt, input) {
  const player = state.player;
  const bounds = state.raid.location === 'outside' ? BATTLE_BOUNDS : BOUNDS;
  const stations = getStations(state);
  const previousX = player.x, previousZ = player.z;
  let dx = Number.isFinite(input.x) ? input.x : 0, dz = Number.isFinite(input.z) ? input.z : 0;
  let length = Math.hypot(dx, dz);
  if (length > 0.02) player.target = null;
  else {
    const target = input.target ?? player.target;
    if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
      dx = clamp(target.x, bounds.minX, bounds.maxX) - player.x;
      dz = clamp(target.z, bounds.minZ, bounds.maxZ) - player.z;
      length = Math.hypot(dx, dz);
      if (length < 0.08) { dx = 0; dz = 0; length = 0; player.target = null; }
    }
  }
  if (length > 0) {
    const scale = Math.min(1, length) / length;
    player.facingX = dx / length; player.facingZ = dz / length;
    player.x = clamp(player.x + dx * scale * getSpeed(state) * dt, bounds.minX, bounds.maxX);
    player.z = clamp(player.z + dz * scale * getSpeed(state) * dt, bounds.minZ, bounds.maxZ);
  }
  player.blinkCooldown = Math.max(0, player.blinkCooldown - dt);
  player.moving = Math.hypot(player.x - previousX, player.z - previousZ) > 0.00001;
  if (state.raid.location === 'outside') { player.dwell = 0; player.transferClock = 0; player.workKind = null; return; }
  for (const pile of getMoneyPiles(state)) {
    if (pile.amount > 0 && distance(player, pile) <= BALANCE.web.moneyPickupRadius) {
      state.gold += pile.amount;
      state.moneyPiles[pile.kind] = 0;
      emit(state, 'cash-collect', `회수 +${pile.amount}`, pile, pile.amount, { actorId: 'player', pileKind: pile.kind });
    }
  }
  if (player.moving || state.raid.phase === 'battle') {
    player.dwell = 0; player.transferClock = 0; player.workKind = null;
    releaseCleaning(state, 'player');
    return;
  }
  if (updateTableCleaning(state, dt)) return;
  const dining = getDiningLayout(state);
  const routes = [
    [state.stocks, 'forge', 'gear', stations.forge, true, 60], [state.stocks, 'gear', 'gear', stations.counter, false, 60],
    [state.stocks, 'alchemy', 'potion', stations.alchemy, true, 60], [state.stocks, 'potion', 'potion', stations.potionCounter, false, 60],
    [state.dining, 'kitchen', 'food', dining.kitchen, true, DINING_RULES.foodCapacity], [state.dining, 'food', 'food', dining.counter, false, DINING_RULES.foodCapacity],
  ];
  const eligible = routes.find(([pool, stock, product, position, collect, limit]) =>
    (product !== 'potion' || state.unlocks.alchemy) && (product !== 'food' || state.unlocks.inn) && distance(player, position) <= 1.12 &&
    (collect ? pool[stock] > 0 && bagCount(player.bag) < getCapacity(state) : (player.bag[product] ?? 0) > 0 && pool[stock] < limit));
  player.workKind = eligible ? (eligible[4] ? 'collect' : 'deposit') : null;
  player.dwell = eligible ? Math.min(BALANCE.web.stationDwell, player.dwell + dt) : 0;
  if (!eligible || player.dwell + .000001 < BALANCE.web.stationDwell) return;
  player.transferClock -= dt;
  if (player.transferClock > 0) return;
  const [pool, stock, product, position, collect] = eligible;
  if (collect) { pool[stock]--; player.bag[product] = (player.bag[product] ?? 0) + 1; }
  else { player.bag[product]--; pool[stock]++; }
  player.transferClock = BALANCE.web.transferInterval;
  emit(state, collect ? 'collect' : 'deposit', '', position, 1, { actorId: 'player', product, count: 1,
    from: collect ? { ...position } : { x: player.x, z: player.z }, to: collect ? { x: player.x, z: player.z } : { ...position } });
}

function releaseCleaning(state, actorId, except = null) {
  state.dining.tables.forEach((table, id) => {
    if (table.cleanerId === actorId && id !== except) {
      table.cleanerId = null; table.cleanProgress = 0;
    }
  });
  const helper = state.staff.find((item) => item.id === actorId);
  if (helper && helper.cleanTableId !== except) { helper.cleanTableId = null; helper.workKind = null; }
}

function cleanTable(state, actor, tableId, dt, actorId = actor.id) {
  const table = state.dining.tables[tableId];
  if (table.status !== 'dirty' || (table.cleanerId && table.cleanerId !== actorId)) return false;
  table.cleanerId = actorId; actor.workKind = 'clean';
  table.cleanProgress += dt;
  if (table.cleanProgress + .000001 >= DINING_RULES.cleanSeconds) {
    Object.assign(table, { status: 'clean', customerId: null, cleanProgress: 0, cleanerId: null });
    state.dining.cleaned++;
    emit(state, 'table-clean', '식탁 정리', getDiningLayout(state).tables[tableId], 0, { actorId, tableId });
    if (actorId !== 'player') actor.cleanTableId = null;
  }
  return true;
}

function updateTableCleaning(state, dt) {
  const player = state.player;
  if (!state.unlocks.inn || state.raid.phase === 'battle') { releaseCleaning(state, 'player'); return false; }
  const target = getDiningLayout(state).tables.filter(({ id, cleanPoint }) => state.dining.tables[id].status === 'dirty'
    && (!state.dining.tables[id].cleanerId || state.dining.tables[id].cleanerId === 'player')
    && distance(player, cleanPoint) <= DINING_RULES.cleanRadius)
    .sort((a, b) => distance(player, a.cleanPoint) - distance(player, b.cleanPoint))[0];
  releaseCleaning(state, 'player', target?.id);
  if (!target) return false;
  player.dwell = 0; player.transferClock = 0;
  return cleanTable(state, player, target.id, dt, 'player');
}

function updateKitchen(state, dt) {
  if (!state.unlocks.inn) return;
  const dining = state.dining;
  if (dining.kitchen >= DINING_RULES.foodCapacity) { dining.cookClock = 0; return; }
  dining.cookClock += dt;
  if (dining.cookClock + .000001 >= DINING_RULES.cookSeconds) {
    dining.cookClock = Math.max(0, dining.cookClock - DINING_RULES.cookSeconds);
    dining.kitchen++;
    emit(state, 'cook', '', getDiningLayout(state).kitchen);
  }
}

function cancelDining(state) {
  for (const table of state.dining.tables) {
    if (table.status === 'reserved') table.status = 'clean';
    else if (table.status === 'eating') table.status = 'dirty';
    table.customerId = null; table.cleanProgress = 0; table.cleanerId = null;
  }
  for (const helper of state.staff) { helper.cleanTableId = null; helper.workKind = null; }
  for (const customer of state.customers) {
    customer.meal = false; customer.tableId = null;
  }
}

function produce(state, dt) {
  const stations = getStations(state);
  for (const kind of ['forge', 'alchemy']) {
    if (kind === 'alchemy' && !state.unlocks.alchemy) continue;
    const facility = getFacilityStats(state, kind);
    state.timers[kind] += dt;
    if (state.timers[kind] >= facility.seconds) {
      state.timers[kind] %= facility.seconds;
      if (state.stocks[kind] < facility.capacity) {
        state.stocks[kind]++;
        emit(state, 'craft', '', stations[kind]);
      }
    }
  }
}

function getTransport(state, product) {
  if (product === 'food') {
    const dining = getDiningLayout(state);
    return { pool: state.dining, source: 'kitchen', stock: 'food', supply: dining.kitchen, counter: dining.counter,
      supplyPoint: dining.kitchenPoint, counterPoint: dining.counterPoint, limit: DINING_RULES.foodCapacity };
  }
  const stations = getStations(state), supply = product === 'gear' ? 'forge' : 'alchemy', counter = product === 'gear' ? 'counter' : 'potionCounter';
  return { pool: state.stocks, source: supply, stock: product, supply: stations[supply], counter: stations[counter],
    supplyPoint: getStationApproach(state, supply), counterPoint: getStationApproach(state, counter), limit: 60 };
}

function updateCleaningWorker(state, helper, dt) {
  const layout = getDiningLayout(state);
  let target = layout.tables[helper.cleanTableId];
  if (!target || state.dining.tables[target.id].status !== 'dirty' || state.dining.tables[target.id].cleanerId !== helper.id) {
    releaseCleaning(state, helper.id);
    target = layout.tables.filter(({ id }) => state.dining.tables[id].status === 'dirty' && !state.dining.tables[id].cleanerId)
      .sort((a, b) => distance(helper, a.cleanPoint) - distance(helper, b.cleanPoint))[0];
    if (!target) return;
    helper.cleanTableId = target.id; state.dining.tables[target.id].cleanerId = helper.id;
    state.dining.tables[target.id].cleanProgress = 0;
  }
  if (moveToward(helper, target.cleanPoint, helper.speed, dt)) cleanTable(state, helper, target.id, dt);
}

function updateStaff(state, dt) {
  for (const helper of state.staff) {
    const job = helper.job ?? helper.product;
    helper.workKind = null;
    // Changing a job never teleports or discards a previous load. Mixed loads
    // are delivered one product at a time before starting the selected task.
    const heldProduct = PRODUCTS.find((product) => (helper.bag[product] ?? 0) > 0 && product !== job)
      ?? PRODUCTS.find((product) => (helper.bag[product] ?? 0) > 0);
    if (heldProduct && (helper.phase === 'haul' || heldProduct !== job || bagCount(helper.bag) >= helper.capacity)) {
      helper.phase = 'haul';
      const route = getTransport(state, heldProduct);
      // A full serving counter plus dirty tables needs cleaning to unlock a
      // sale. Keep the old cargo while doing that work, then resume delivery.
      if (job === 'clean' && route.pool[route.stock] >= route.limit) {
        helper.timer = 0; updateCleaningWorker(state, helper, dt); continue;
      }
      releaseCleaning(state, helper.id);
      if (moveToward(helper, route.counterPoint, helper.speed, dt)) {
        helper.timer += dt;
        if (helper.timer + .000001 >= BALANCE.web.transferInterval && route.pool[route.stock] < route.limit) {
          route.pool[route.stock]++; helper.bag[heldProduct]--; helper.timer = 0; helper.workKind = 'deposit';
          emit(state, 'deposit', '', route.counter, 1, { actorId: helper.id, product: heldProduct, count: 1, from: { x: helper.x, z: helper.z }, to: { ...route.counter } });
          if (bagCount(helper.bag) === 0) helper.phase = 'collect';
        }
      } else helper.timer = 0;
      continue;
    }
    if (job === 'clean') { updateCleaningWorker(state, helper, dt); continue; }
    releaseCleaning(state, helper.id);
    const route = getTransport(state, job);
    if (moveToward(helper, route.supplyPoint, helper.speed, dt)) {
      helper.timer += dt;
      if (helper.timer + .000001 >= BALANCE.web.transferInterval) {
        if (bagCount(helper.bag) < helper.capacity && route.pool[route.source] > 0) {
          route.pool[route.source]--; helper.bag[job] = (helper.bag[job] ?? 0) + 1; helper.timer = 0; helper.workKind = 'collect';
          emit(state, 'collect', '', route.supply, 1, { actorId: helper.id, product: job, count: 1, from: { ...route.supply }, to: { x: helper.x, z: helper.z } });
        }
        if (bagCount(helper.bag) >= helper.capacity || (bagCount(helper.bag) > 0 && route.pool[route.source] === 0)) { helper.phase = 'haul'; helper.timer = 0; }
      }
    } else helper.timer = 0;
  }
}

const CUSTOMER_LIMIT = 30;
const CUSTOMER_QUEUE_LIMIT = 16;
const CUSTOMER_COUNTER_SLOTS = 6;
const customerLanes = new Map();
const customerEntries = new Map();

function customerLane(state, product) {
  const key = `${getRegion(state).id}:${product}`;
  if (customerLanes.has(key)) return customerLanes.get(key);
  const counter = getStations(state)[product === 'potion' ? 'potionCounter' : 'counter'];
  const slots = Array.from({ length: CUSTOMER_COUNTER_SLOTS }, (_, index) => Object.freeze({ x: counter.x, z: counter.z + .95 + index * .68 }));
  const lane = Object.freeze({ slots: Object.freeze(slots) });
  customerLanes.set(key, lane);
  return lane;
}

export function getCustomerQueueSlots(state, product = 'gear') {
  return customerLane(state, product).slots;
}

function customerEntry(state) {
  const key = getRegion(state).id;
  if (customerEntries.has(key)) return customerEntries.get(key);
  const gate = getStations(state).gate;
  const entry = Object.freeze({
    slots: Object.freeze(Array.from({ length: 24 }, (_, index) => Object.freeze({ x: gate.x, z: gate.z + .6 + index * .7 }))),
    branch: Object.freeze({ x: gate.x, z: gate.z - 1.25 }),
  });
  customerEntries.set(key, entry);
  return entry;
}

export function getCustomerEntrySlots(state) {
  return customerEntry(state).slots;
}

export function getCustomerBranchPoint(state) {
  return customerEntry(state).branch;
}

function spawnCustomer(state, productCounts, entrance) {
  // A full line waits for its next customer instead of turning every rejected
  // gear shopper into a mage. Retrying keeps the original class draw.
  state.pendingCustomerKind ??= (() => {
    const roll = random(state);
    if (state.unlocks.mage && roll < .28) return 'mage';
    if (state.unlocks.archer && roll < .64) return 'archer';
    return 'warrior';
  })();
  const kind = state.pendingCustomerKind;
  const product = kind === 'mage' ? 'potion' : 'gear';
  if ((product === 'potion' && !state.unlocks.mage) || productCounts[product] >= CUSTOMER_QUEUE_LIMIT) return false;
  const slots = getCustomerEntrySlots(state);
  const tailZ = Math.max(slots[Math.min(entrance.length, slots.length - 1)].z, ...entrance.map((customer) => customer.z));
  const entry = { x: slots[0].x, z: tailZ + .7 };
  state.customers.push({ id: nextId(state, 'customer'), ...entry, kind, product, phase: 'entrance', hp: CLASS_STATS[kind].hp, purchased: false, patronId: null, timer: 0, patience: 0 });
  state.pendingCustomerKind = null;
  return true;
}

function purchase(state, customer) {
  if (customer.purchased || state.stocks[customer.product] <= 0) return;
  const amount = getSalePrice(state, customer.product);
  state.stocks[customer.product]--;
  state.sales++;
  earn(state, amount, customer.product);
  const stats = CLASS_STATS[customer.kind];
  const patron = { id: customer.id, kind: customer.kind, purchases: 1, totalSpent: amount, loyalty: 1, hp: stats.hp, maxHp: stats.hp, equipmentLevel: state.player.priceLevel };
  state.patrons.push(patron);
  if (state.patrons.length > 200) state.patrons.shift();
  customer.purchased = true; customer.patronId = patron.id; customer.timer = 0;
  const guests = state.customers.filter((item) => ['food-queue', 'to-table', 'eating'].includes(item.phase)).length;
  customer.phase = state.unlocks.inn && guests < DINING_RULES.tables && random(state) < DINING_RULES.guestChance ? 'food-queue' : 'leaving';
  if (customer.phase === 'food-queue') customer.foodJoinedAt = state.time;
  emit(state, 'sale', `매출 ${amount}`, customer, amount, { pileKind: customer.product });
  updateUnlocks(state);
}

function updateCustomers(state, dt, allowPurchases = true) {
  const stations = getStations(state);
  if (state.raid.phase === 'battle') {
    cancelDining(state);
    for (const customer of state.customers) customer.phase = 'leaving';
  }
  const queues = { gear: [], potion: [] }, productCounts = { gear: 0, potion: 0 }, entrance = [];
  for (const customer of state.customers) {
    if (['entrance', 'branch', 'queue'].includes(customer.phase)) productCounts[customer.product]++;
    if (customer.phase === 'entrance') entrance.push(customer);
    else if (customer.phase === 'branch' || customer.phase === 'queue') queues[customer.product].push(customer);
  }
  if (allowPurchases) {
    state.timers.customer -= dt;
    state.timers.entry = Math.max(0, (state.timers.entry ?? 0) - dt);
    const waiting = productCounts.gear + productCounts.potion;
    const demand = Math.min(24, 12 + (state.sales >= 8 ? 2 : 0) + (state.unlocks.alchemy ? 4 : 0) + (state.unlocks.inn ? 6 : 0));
    if (state.timers.customer <= 0) {
      if (waiting < demand && state.customers.length < CUSTOMER_LIMIT && spawnCustomer(state, productCounts, entrance)) {
        const customer = state.customers.at(-1); entrance.push(customer);
        const arrivalSeconds = clamp(getFacilityStats(state, 'counter').seconds / (state.unlocks.alchemy ? 2 : 1) * .75, .3, 1);
        state.timers.customer = waiting < 6 ? Math.min(.65, arrivalSeconds) : arrivalSeconds;
      } else state.timers.customer = .15;
    }
  }
  const slots = { gear: getCustomerQueueSlots(state, 'gear'), potion: getCustomerQueueSlots(state, 'potion') };
  const entrySlots = getCustomerEntrySlots(state), branchPoint = getCustomerBranchPoint(state);
  const head = entrance[0];
  if (allowPurchases && head && distance(head, entrySlots[0]) <= .03 && state.timers.entry <= .000001
    && (head.abandoning || queues[head.product].length < CUSTOMER_COUNTER_SLOTS)) {
    head.phase = head.abandoning ? 'leaving' : 'branch'; head.branchPassed = false;
    if (!head.abandoning) queues[head.product].push(head);
    state.timers.entry = .55;
  }
  const layout = getDiningLayout(state);
  const foodQueue = state.customers.filter((customer) => customer.phase === 'food-queue')
    .sort((a, b) => (a.foodJoinedAt ?? 0) - (b.foodJoinedAt ?? 0));
  for (const customer of state.customers) {
    if (['entrance', 'branch', 'queue'].includes(customer.phase)) {
      customer.patience += dt;
      if (customer.patience > 90 && !customer.purchased) customer.abandoning = true;
    }
    if (customer.phase === 'leaving') {
      customer.exited = moveToward(customer, { x: stations.gate.x, z: stations.gate.z - .15 }, 1.8, dt, .04);
      continue;
    }
    if (customer.phase === 'entrance') {
      const index = entrance.indexOf(customer);
      if (index >= 0) moveToward(customer, entrySlots[Math.min(index, entrySlots.length - 1)], 1.8, dt, .025);
      continue;
    }
    if (customer.phase === 'food-queue') {
      const index = foodQueue.indexOf(customer);
      if (index < 0 || index >= DINING_RULES.tables) { customer.phase = 'leaving'; continue; }
      if (moveToward(customer, layout.queue[index], 1.8, dt, .025) && index === 0) {
        const tableId = state.dining.tables.findIndex((table) => table.status === 'clean');
        if (tableId >= 0 && state.dining.food > 0) {
          state.dining.food--;
          Object.assign(state.dining.tables[tableId], { status: 'reserved', customerId: customer.id, cleanProgress: 0 });
          customer.tableId = tableId; customer.meal = true; customer.phase = 'to-table'; customer.timer = 0;
          emit(state, 'meal-pickup', '', layout.counter, 1, { actorId: customer.id, tableId });
        }
      }
      continue;
    }
    if (customer.phase === 'to-table' || customer.phase === 'eating') {
      const table = state.dining.tables[customer.tableId], place = layout.tables[customer.tableId];
      if (!table || !place || table.customerId !== customer.id) { customer.meal = false; customer.phase = 'leaving'; continue; }
      if (customer.phase === 'to-table') {
        if (moveToward(customer, place.seat, 1.8, dt, .025)) {
          customer.phase = 'eating'; customer.meal = false; customer.timer = 0; table.status = 'eating';
        }
      } else {
        customer.timer += dt;
        const inn = getFacilityStats(state, 'inn');
        if (customer.timer + .000001 >= inn.seconds) {
          const amount = Math.round(BALANCE.facilities.inn.salePrice * getCoinMultiplier(state) * (1 + inn.bonusPercent / 100));
          const patron = state.patrons.find((item) => item.id === customer.patronId);
          if (patron) { patron.hp = patron.maxHp; patron.loyalty++; patron.totalSpent += amount; }
          earn(state, amount, 'inn'); state.lodgings++; customer.phase = 'leaving';
          Object.assign(table, { status: 'dirty', customerId: null, cleanProgress: 0 });
          emit(state, 'inn', `식사 매출 ${amount}`, place, amount, { pileKind: 'inn', tableId: customer.tableId });
          customer.tableId = null;
        }
      }
      continue;
    }
    const queue = queues[customer.product], index = queue.indexOf(customer);
    if (index < 0 || index >= CUSTOMER_COUNTER_SLOTS) { customer.phase = 'leaving'; continue; }
    if (customer.phase === 'branch' && !customer.branchPassed) {
      if (moveToward(customer, branchPoint, 1.8, dt, .025)) customer.branchPassed = true;
      continue;
    }
    // The shared entrance and its branch are intentional waypoints. Once
    // admitted, shoppers move straight to their short counter line.
    if (moveToward(customer, slots[customer.product][index], 1.8, dt, .025)) {
      customer.phase = 'queue';
      if (allowPurchases && index === 0 && customer.abandoning) customer.phase = 'leaving';
      else if (allowPurchases && index === 0 && state.stocks[customer.product] > 0) {
        customer.timer += dt;
        if (customer.timer >= getFacilityStats(state, 'counter').seconds) purchase(state, customer);
      }
    }
    if (index > 0) customer.timer = 0;
  }
  state.customers = state.customers.filter((customer) => !customer.exited);
}

function makeDefender(state, patron, index, count, rowOffset) {
  const stats = CLASS_STATS[patron.kind];
  const power = 1 + (patron.equipmentLevel - 1) * 0.1 + Math.min(9, patron.loyalty - 1) * 0.08;
  const maxHp = stats.hp * (1 + (patron.equipmentLevel - 1) * 0.03);
  const healthRatio = Math.max(0.65, patron.hp / patron.maxHp);
  const gate = getBattleLayout(state).gate;
  const row = Math.floor(index / 6);
  const columns = Math.min(6, count - row * 6);
  return { id: `defender-${patron.id}`, patronId: patron.id, kind: patron.kind, purchased: true, radius: COMBAT_RADIUS, x: clamp(gate.x + index % 6 - (columns - 1) / 2, BATTLE_BOUNDS.minX + COMBAT_RADIUS, BATTLE_BOUNDS.maxX - COMBAT_RADIUS), z: gate.z - 4 - (rowOffset + row) * 0.95, hp: maxHp * healthRatio, maxHp, damage: stats.damage * power, range: stats.range, speed: stats.speed, interval: stats.interval, attackClock: index / Math.max(count, 1), attackSerial: 0, phase: 'fighter' };
}

export function getRaidPlan(state, roster = state.patrons.filter((patron) => patron.purchases > 0).slice(-18)) {
  // Campaign pressure is fixed; muster adds a bounded reinforcement allowance.
  // Item quality never raises enemy stats, so investing in equipment stays useful.
  const stageBudget = 4 + Math.min(12, state.stage - 1) * 2;
  const musterBonus = Math.max(0, roster.length - 3);
  const total = Math.min(32, stageBudget + musterBonus);
  const roles = Array.from({ length: total }, (_, index) => {
    if (state.stage >= 2 && index % 7 === 0) return 'elite';
    if (state.stage >= 2 && index % 5 === 1) return 'ranged';
    return index % 4 === 3 ? 'raider' : 'grunt';
  });
  return { stageBudget, musterBonus, total, initialBatch: Math.min(14, Math.max(3, Math.ceil(total * 0.65))), reinforcementBatch: 3, reinforcementSeconds: 2.2, roles };
}

function setRaidThreat(raid, plan) {
  raid.totalEnemies = plan.total;
  raid.threatLabel = plan.roles.includes('elite') ? '정예·원거리 부대' : plan.roles.includes('ranged') ? '돌격·원거리 부대' : '보병·돌격 부대';
}

function beginDeparture(state) {
  state.raid.phase = 'departure'; state.raid.timer = 2.2;
  state.raid.returnPosition = { x: state.player.x, z: state.player.z };
  state.raid.prepared = false;
  state.player.target = null; state.player.moving = false;
  state.player.workKind = null; state.player.dwell = 0;
  cancelDining(state);
  emit(state, 'departure', '상점 밖으로 · 단골 수호대 출전');
}

function prepareRaid(state) {
  const raid = state.raid;
  raid.location = 'outside'; raid.prepared = true;
  raid.wave = state.stage; raid.kind = state.stage % 2 ? 'monsters' : 'army';
  Object.assign(state.player, getBattleLayout(state).player, { target: null, moving: false, workKind: null, dwell: 0, transferClock: 0 });
  const patrons = state.patrons.filter((patron) => patron.purchases > 0).slice(-18);
  const counts = Object.fromEntries(Object.keys(CLASS_STATS).map((kind) => [kind, patrons.filter((patron) => patron.kind === kind).length]));
  const rows = { warrior: 0, archer: Math.ceil(counts.warrior / 6), mage: Math.ceil(counts.warrior / 6) + Math.ceil(counts.archer / 6) };
  const indices = { warrior: 0, archer: 0, mage: 0 };
  raid.defenders = patrons.map((patron) => makeDefender(state, patron, indices[patron.kind]++, counts[patron.kind], rows[patron.kind]));
  separateCombatants(raid.defenders);
  raid.enemies = [];
  raid.plan = getRaidPlan(state, patrons);
  setRaidThreat(raid, raid.plan);
  raid.spawnRemaining = raid.plan.total; raid.spawned = 0; raid.damageToShop = 0;
  raid.spawnClock = raid.plan.reinforcementSeconds;
  for (let count = 0; count < raid.plan.initialBatch; count++) spawnEnemy(state);
  separateCombatants(raid.enemies);
  cancelDining(state);
  for (const customer of state.customers) customer.phase = 'leaving';
}

function spawnEnemy(state) {
  const raid = state.raid, wave = state.stage;
  const gate = getBattleLayout(state).gate;
  const index = raid.spawned ?? 0;
  const role = raid.plan?.roles[index] ?? 'grunt';
  const traits = {
    grunt: { hp: 1, damage: 1, speed: 1.05, range: 0.95, interval: 1.25, name: '보병' },
    raider: { hp: 0.8, damage: 1.15, speed: 1.95, range: 1.05, interval: 1.05, name: '돌격병' },
    ranged: { hp: 0.72, damage: 0.85, speed: 0.95, range: 3.75, interval: 1.65, name: '궁병' },
    elite: { hp: 2.3, damage: 1.65, speed: 0.9, range: 1.15, interval: 1.5, name: '정예병' },
  }[role];
  const hp = (108 + wave * 12) * traits.hp;
  const preferred = { x: gate.x + index % 6 - 2.5, z: gate.z - 0.55 - Math.floor(index / 6) % 3 };
  let spawn = null, bestScore = -Infinity;
  // Reinforcements enter a vacant lane instead of materializing inside a unit
  // that is already fighting in the entrance. The finite grid stays bounded.
  for (let row = 0; row < 3; row++) for (let column = 0; column < 11; column++) {
    const candidate = { x: column - 5, z: gate.z - 0.55 - row };
    const clearance = Math.min(2, ...raid.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => distance(candidate, enemy)));
    const score = (clearance >= 1.02 ? 100 : clearance * 10) - distance(candidate, preferred);
    if (score > bestScore) { spawn = candidate; bestScore = score; }
  }
  spawn.x += (random(state) - 0.5) * 0.04;
  raid.enemies.push({ id: nextId(state, 'enemy'), kind: raid.kind === 'monsters' ? 'slime' : 'soldier', faction: raid.kind, role, name: traits.name, radius: COMBAT_RADIUS, ...spawn, hp, maxHp: hp, damage: (9 + wave) * traits.damage, speed: traits.speed + Math.min(wave - 1, 8) * 0.03, range: traits.range, interval: traits.interval, attackClock: 0.65, attackSerial: 0, phase: 'attacking' });
  raid.spawnRemaining--;
  raid.spawned = index + 1;
}

function nearest(actor, actors) {
  let chosen = null, best = Infinity;
  for (const candidate of actors) {
    if (candidate.hp <= 0) continue;
    const length = distance(actor, candidate);
    if (length < best) { best = length; chosen = candidate; }
  }
  return chosen;
}

export function separateCombatants(actors) {
  const living = actors.filter((actor) => actor.hp > 0);
  for (let pass = 0; pass < 4; pass++) {
    for (let left = 0; left < living.length; left++) for (let right = left + 1; right < living.length; right++) {
      const a = living[left], b = living[right];
      const minimum = (a.radius ?? COMBAT_RADIUS) + (b.radius ?? COMBAT_RADIUS);
      let dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length >= minimum) continue;
      if (length < 0.00001) {
        const angle = seedNumber(`${a.id}:${b.id}`) / 4294967296 * Math.PI * 2;
        dx = Math.cos(angle); dz = Math.sin(angle); length = 1;
        const push = Math.min(0.18, minimum / 2);
        a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
      } else {
        const push = Math.min(0.18, (minimum - length) / 2);
        a.x -= dx / length * push; a.z -= dz / length * push;
        b.x += dx / length * push; b.z += dz / length * push;
      }
    }
    for (const actor of living) {
      const radius = actor.radius ?? COMBAT_RADIUS;
      actor.x = clamp(actor.x, BATTLE_BOUNDS.minX + radius, BATTLE_BOUNDS.maxX - radius);
      actor.z = clamp(actor.z, BATTLE_BOUNDS.minZ + radius, BATTLE_BOUNDS.maxZ - radius);
    }
  }
}

function relocateRegion(state, previousStations) {
  releaseCleaning(state, 'player');
  const stations = getStations(state);
  const spawn = getRegion(state).spawn ?? { x: stations.gate.x, z: stations.gate.z - 1.3 };
  Object.assign(state.player, { x: spawn.x, z: spawn.z, target: null, dwell: 0, transferClock: 0, moving: false, workKind: null });
  state.customers = [];
  for (const helper of state.staff) {
    helper.phase = bagCount(helper.bag) > 0 ? 'haul' : 'collect'; helper.timer = 0;
    releaseCleaning(state, helper.id);
    Object.assign(helper, getTransport(state, helper.product).supplyPoint);
  }
  for (const defender of state.raid.defenders) defender.x += stations.gate.x - previousStations.gate.x;
  separateCombatants(state.raid.defenders);
  emit(state, 'region', `${getRegion(state).name}에 도착했습니다`, spawn);
}

function completeRaid(state, win) {
  const raid = state.raid;
  const stations = getStations(state);
  for (const defender of raid.defenders) {
    const patron = state.patrons.find((item) => item.id === defender.patronId);
    if (patron) { patron.hp = clamp(defender.hp / defender.maxHp * patron.maxHp, 0, patron.maxHp); if (win) patron.loyalty++; }
  }
  raid.summary = { won: win, duration: raid.timer, defenders: raid.defenders.length, fallen: raid.defenders.filter((defender) => defender.hp <= 0).length, injured: raid.defenders.filter((defender) => defender.hp > 0 && defender.hp < defender.maxHp * 0.9).length, shopDamage: raid.damageToShop ?? 0, enemies: raid.plan?.total ?? raid.spawned ?? 0 };
  if (win) {
    const rewards = BALANCE.web.raidCoinRewards;
    raid.reward = Math.min(1000000, rewards[Math.min(state.stage - 1, rewards.length - 1)] * 2 ** Math.max(0, state.stage - rewards.length));
    earn(state, raid.reward); raid.wins++; state.stage++; state.milestone = true;
    state.shopHp = Math.min(state.shopMaxHp, state.shopHp + 40);
    raid.phase = 'victory'; raid.timer = 7;
    raid.pendingRegion = true;
    emit(state, 'victory', `방어 성공 · +${raid.reward} 골드`, getStations(state).gate, raid.reward);
  } else {
    state.shopHp = 0; state.status = 'defeat'; raid.phase = 'defeat'; raid.timer = 0;
    emit(state, 'defeat', '상회가 무너졌습니다 · 무료로 복구하세요', stations.gate);
  }
}

function finishRecovery(state) {
  if (state.raid.pendingRegion) { state.raid.returnPosition = null; relocateRegion(state, getStations(Math.max(1, state.stage - 1))); state.raid.pendingRegion = false; }
  returnToShop(state);
  state.raid.phase = 'idle'; state.raid.timer = 90; state.raid.triggerSales = state.sales + 18 + Math.min(state.stage * 2, 16);
  state.raid.enemies = []; state.raid.defenders = []; state.raid.spawnRemaining = 0;
  state.timers.customer = 1;
  emit(state, 'notice', `${getStageInfo(state).name} · 다시 영업합니다`);
}

function returnToShop(state) {
  if (state.raid.location === 'outside' && !state.raid.pendingRegion && state.raid.returnPosition) {
    Object.assign(state.player, state.raid.returnPosition, { target: null, moving: false, workKind: null, dwell: 0, transferClock: 0 });
  }
  state.raid.location = 'shop'; state.raid.returnPosition = null;
}

function updateRaid(state, dt) {
  const raid = state.raid;
  if (raid.phase === 'idle') {
    raid.timer = Math.max(0, raid.timer - dt);
    const paidPatrons = state.patrons.filter((patron) => patron.purchases > 0).length;
    if (paidPatrons >= 3 && (raid.timer <= 0 || state.sales >= raid.triggerSales)) {
      raid.phase = 'warning'; raid.timer = 10; raid.kind = state.stage % 2 ? 'monsters' : 'army';
      setRaidThreat(raid, getRaidPlan(state));
      emit(state, 'warning', '습격 10초 전 · 장비를 팔아 단골을 모으세요', getStations(state).gate);
    }
    return;
  }
  if (raid.phase === 'warning' || raid.phase === 'victory' || raid.phase === 'recovery') {
    raid.timer -= dt;
    if (raid.timer <= 0) {
      if (raid.phase === 'warning') beginDeparture(state);
      else finishRecovery(state);
    }
    return;
  }
  if (raid.phase === 'departure') {
    raid.timer -= dt;
    if (!raid.prepared && raid.timer <= 1.1) prepareRaid(state);
    if (raid.timer <= 0) {
      raid.phase = 'battle'; raid.timer = 0;
      emit(state, 'raid', '상점 밖 방어전 · 단골 수호대와 함께', getBattleLayout(state).gate);
    }
    return;
  }
  if (raid.phase !== 'battle') return;
  raid.timer += dt; raid.spawnClock -= dt;
  if (raid.spawnRemaining > 0 && raid.spawnClock <= 0 && raid.enemies.filter((enemy) => enemy.hp > 0).length < 18) {
    const count = Math.min(raid.spawnRemaining, raid.plan?.reinforcementBatch ?? 3);
    for (let index = 0; index < count; index++) spawnEnemy(state);
    raid.spawnClock = raid.plan?.reinforcementSeconds ?? 2.2;
  }
  for (const defender of raid.defenders) {
    if (defender.hp <= 0) continue;
    defender.attackClock -= dt;
    const enemy = nearest(defender, raid.enemies);
    if (!enemy) continue;
    defender.targetX = enemy.x; defender.targetZ = enemy.z;
    const range = distance(defender, enemy);
    const retreating = defender.kind !== 'warrior' && range < defender.range * 0.53;
    if (retreating) {
      const dx = defender.x - enemy.x, dz = defender.z - enemy.z;
      const length = Math.hypot(dx, dz) || 1;
      moveToward(defender, { x: defender.x + dx / length * 2, z: defender.z + dz / length * 2 }, defender.speed, dt);
    } else if (range > defender.range) moveToward(defender, enemy, defender.speed, dt, defender.range * 0.92);
    if (!retreating && distance(defender, enemy) <= defender.range && defender.attackClock <= 0) {
      defender.attackClock = defender.interval;
      defender.attackSerial = (defender.attackSerial || 0) + 1; defender.attackAt = state.time;
      const victims = defender.kind === 'mage' ? raid.enemies.filter((item) => item.hp > 0 && distance(item, enemy) < 1.4).slice(0, 3) : [enemy];
      for (const victim of victims) victim.hp -= defender.damage;
      emit(state, defender.kind === 'archer' ? 'arrow' : defender.kind === 'mage' ? 'magic' : 'hit', '', enemy, defender.damage, { actorId: defender.id, from: { x: defender.x, z: defender.z }, to: { x: enemy.x, z: enemy.z } });
    }
  }
  for (const enemy of raid.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.attackClock -= dt;
    const living = raid.defenders.filter((defender) => defender.hp > 0);
    const backline = living.filter((defender) => defender.kind !== 'warrior');
    let defender = nearest(enemy, enemy.role === 'raider' && backline.length ? backline : living);
    const shop = getBattleLayout(state).shop;
    if (enemy.role === 'raider' && raid.timer > 5 && distance(enemy, shop) < 1.25 && (!defender || distance(enemy, defender) > 1.4)) defender = null;
    const target = defender ?? shop;
    enemy.targetX = target.x; enemy.targetZ = target.z;
    if (enemy.role === 'ranged' && defender && distance(enemy, target) < 1.4) {
      const length = distance(enemy, target) || 1;
      moveToward(enemy, { x: enemy.x + (enemy.x - target.x) / length, z: enemy.z + (enemy.z - target.z) / length }, enemy.speed, dt);
    } else if (distance(enemy, target) > enemy.range) moveToward(enemy, target, enemy.speed, dt, enemy.range * 0.92);
    else if (enemy.attackClock <= 0) {
      enemy.attackClock = enemy.interval;
      enemy.attackSerial = (enemy.attackSerial || 0) + 1; enemy.attackAt = state.time;
      if (defender) {
        const victims = enemy.role === 'elite' ? [defender, ...living.filter((ally) => ally !== defender && distance(ally, defender) < 1.25)].slice(0, 2) : [defender];
        for (const victim of victims) victim.hp = Math.max(0, victim.hp - enemy.damage);
        emit(state, 'damage', '', defender, enemy.damage, { actorId: enemy.id, from: { x: enemy.x, z: enemy.z }, to: { x: defender.x, z: defender.z } });
        if (enemy.role === 'ranged') emit(state, raid.kind === 'army' ? 'arrow' : 'magic', '', defender, enemy.damage, { actorId: enemy.id, team: 'enemy', from: { x: enemy.x, z: enemy.z }, to: { x: defender.x, z: defender.z } });
      }
      else {
        const damage = Math.min(state.shopHp, enemy.damage * 1.5);
        state.shopHp -= damage; raid.damageToShop = (raid.damageToShop ?? 0) + damage;
        emit(state, 'damage', '', target, damage, { actorId: enemy.id, from: { x: enemy.x, z: enemy.z }, to: { ...target } });
      }
    }
  }
  separateCombatants(raid.defenders);
  separateCombatants(raid.enemies);
  raid.enemies = raid.enemies.filter((enemy) => enemy.hp > 0);
  if (state.shopHp <= 0) completeRaid(state, false);
  else if (raid.spawnRemaining === 0 && raid.enemies.length === 0) completeRaid(state, true);
}

function tick(state, dt, input) {
  state.time += dt;
  state.messageTimer = Math.max(0, state.messageTimer - dt);
  for (const key of ['effects', 'events']) state[key] = state[key].filter((item) => (item.ttl -= dt) > 0);
  if (state.raid.phase !== 'departure') updatePlayer(state, dt, input);
  if (state.raid.location !== 'outside' && ['idle', 'warning', 'victory', 'recovery'].includes(state.raid.phase)) {
    produce(state, dt);
    updateKitchen(state, dt);
    updateStaff(state, dt);
    updateCustomers(state, dt, ['idle', 'warning'].includes(state.raid.phase));
    if (state.unlocks.inn) {
      state.timers.innHeal += dt;
      if (state.timers.innHeal >= 5) {
        state.timers.innHeal = 0;
        for (const patron of state.patrons) patron.hp = Math.min(patron.maxHp, patron.hp + 8);
        state.shopHp = Math.min(state.shopMaxHp, state.shopHp + 2);
      }
    }
  } else if (state.raid.phase === 'battle') updateCustomers(state, dt, false);
  updateUnlocks(state);
  updateRaid(state, dt);
}

export function step(state, dt, input = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || state.status !== 'playing') return state;
  if (!input || typeof input !== 'object') input = {};
  // The UI pauses hidden tabs. This additional cap prevents an accidental huge catch-up.
  let remaining = Math.min(dt, 1);
  while (remaining > 0.000001 && state.status === 'playing') {
    const delta = Math.min(0.05, remaining);
    tick(state, delta, input);
    remaining -= delta;
  }
  return state;
}

export function serialize(state) {
  const shopPosition = state.raid.location === 'outside' && state.raid.returnPosition ? state.raid.returnPosition : state.player;
  return JSON.stringify({ version: SAVE_VERSION, seed: state.seed, rng: state.rng, nextId: state.nextId, time: state.time, stage: state.stage, gold: state.gold, sales: state.sales, lodgings: state.lodgings, milestone: state.milestone, economy: state.economy, dining: { kitchen: state.dining.kitchen, food: state.dining.food, cleaned: state.dining.cleaned, tables: state.dining.tables.map(({ status }) => ({ status })) }, moneyPiles: { ...state.moneyPiles }, facilityLevels: { ...state.facilityLevels }, workerLevels: { ...state.workerLevels }, player: { x: shopPosition.x, z: shopPosition.z, bag: { ...state.player.bag }, speedLevel: state.player.speedLevel, capacityLevel: state.player.capacityLevel, priceLevel: state.player.priceLevel, blinkCooldown: state.player.blinkCooldown }, stocks: { ...state.stocks }, unlocks: { alchemy: state.unlocks.alchemy, inn: state.unlocks.inn }, patrons: state.patrons, staff: state.staff.map(({ cleanTableId, workKind, ...helper }) => helper), shopHp: state.shopHp, raid: { wins: state.raid.wins, wave: state.raid.wave, phase: state.raid.phase, timer: state.raid.timer, triggerSales: state.raid.triggerSales } });
}

function badSave() {
  const state = createGame();
  state.saveReset = true; state.message = '저장 데이터가 손상되어 새 상회를 열었습니다';
  return state;
}

export function restore(value) {
  if (value === null || value === undefined || value === '') return createGame();
  if (typeof value === 'string' && value.length > 500000) return badSave();
  let saved;
  try { saved = typeof value === 'string' ? JSON.parse(value) : value; } catch { return badSave(); }
  try {
    if (!saved || saved.version !== SAVE_VERSION || !integer(saved.seed, 0, 4294967295) || !integer(saved.rng, 0, 4294967295) || !integer(saved.nextId, 1, 1000000000)) return badSave();
    if (!finite(saved.gold, 0, 1e12) || !integer(saved.sales, 0, 1e8) || !integer(saved.stage, 1, 1000) || !finite(saved.time, 0, 1e9) || !integer(saved.lodgings, 0, 1e8)) return badSave();
    const facilityLevels = saved.facilityLevels === undefined ? { forge: 1, counter: 1, alchemy: 1, inn: 1 } : saved.facilityLevels;
    const workerLevels = saved.workerLevels === undefined ? { speed: 1, capacity: 1 } : saved.workerLevels;
    const moneyPiles = saved.moneyPiles === undefined ? { gear: 0, potion: 0, inn: 0 } : saved.moneyPiles;
    if (!facilityLevels || !['forge', 'counter', 'alchemy', 'inn'].every((kind) => integer(facilityLevels[kind], 1, BALANCE.facilities[kind].costs.length))) return badSave();
    if (!workerLevels || !['speed', 'capacity'].every((kind) => integer(workerLevels[kind], 1, 11))) return badSave();
    if (!moneyPiles || !['gear', 'potion', 'inn'].every((kind) => finite(moneyPiles[kind], 0, 1e12))) return badSave();
    const dining = saved.dining === undefined ? createDiningState() : saved.dining;
    if (!dining || !integer(dining.kitchen === undefined ? 4 : dining.kitchen, 0, DINING_RULES.foodCapacity) || !integer(dining.food, 0, DINING_RULES.foodCapacity) || !integer(dining.cleaned, 0, 1e8)
      || !Array.isArray(dining.tables) || dining.tables.length !== DINING_RULES.tables
      || !dining.tables.every((table) => table && ['clean', 'reserved', 'eating', 'dirty'].includes(table.status))) return badSave();
    const player = saved.player;
    if (!player || !['speedLevel', 'capacityLevel', 'priceLevel'].every((kind) => integer(player[kind], 1, 21))) return badSave();
    if (!finite(player.x, BOUNDS.minX, BOUNDS.maxX) || !finite(player.z, BOUNDS.minZ, BOUNDS.maxZ) || !finite(player.blinkCooldown, 0, BALANCE.magic.cooldown)) return badSave();
    if (!player.bag || !integer(player.bag.gear, 0, 22) || !integer(player.bag.potion, 0, 22) || !integer(player.bag.food === undefined ? 0 : player.bag.food, 0, 22) || bagCount(player.bag) > levelRow(player.capacityLevel).capacity) return badSave();
    if (!saved.stocks || !['forge', 'gear', 'alchemy', 'potion'].every((kind) => integer(saved.stocks[kind], 0, kind === 'forge' || kind === 'alchemy' ? facilityStats(kind, facilityLevels[kind]).capacity : 60))) return badSave();
    if ((player.bag.food ?? 0) > 0 && !saved.unlocks?.inn) return badSave();
    if (!saved.unlocks || typeof saved.unlocks.alchemy !== 'boolean' || typeof saved.unlocks.inn !== 'boolean' || (saved.unlocks.alchemy && saved.sales < 8) || (saved.unlocks.inn && saved.sales < 16)) return badSave();
    if (!Array.isArray(saved.patrons) || saved.patrons.length > 200 || saved.patrons.length > saved.sales || !Array.isArray(saved.staff) || saved.staff.length > 3) return badSave();
    const patronIds = new Set();
    for (const patron of saved.patrons) {
      if (!patron || typeof patron.id !== 'string' || patron.id.length > 80 || patronIds.has(patron.id) || !CLASS_STATS[patron.kind] || !integer(patron.purchases, 1, 1000) || !finite(patron.totalSpent, 0, 1e12) || !integer(patron.loyalty, 1, 10000) || !integer(patron.equipmentLevel, 1, 21) || patron.maxHp !== CLASS_STATS[patron.kind].hp || !finite(patron.hp, 0, patron.maxHp)) return badSave();
      patronIds.add(patron.id);
    }
    const helperIds = new Set();
    const helpers = saved.staff.map((helper) => {
      const source = BALANCE.staffs.find((staff) => staff.id === helper.sourceId);
      const job = helper.job === undefined ? helper.product : helper.job;
      if (!source || typeof helper.id !== 'string' || helper.id.length > 80 || helper.id === 'player' || helperIds.has(helper.id) || !PRODUCTS.includes(helper.product) || !WORKER_JOBS.includes(job)
        || ((job === 'potion' || helper.product === 'potion') && !saved.unlocks.alchemy)
        || ((['food', 'clean'].includes(job) || helper.product === 'food') && !saved.unlocks.inn)
        || (helper.jobAssigned !== undefined && typeof helper.jobAssigned !== 'boolean')) throw new Error('Invalid helper');
      helperIds.add(helper.id);
      const capacity = source.capacity + BALANCE.worker.capacities[workerLevels.capacity - 1] - BALANCE.worker.capacities[0];
      if (!finite(helper.x, BOUNDS.minX, BOUNDS.maxX) || !finite(helper.z, BOUNDS.minZ, BOUNDS.maxZ) || !helper.bag
        || !PRODUCTS.every((product) => integer(helper.bag[product] === undefined && product === 'food' ? 0 : helper.bag[product], 0, capacity))
        || bagCount(helper.bag) > capacity || ((helper.bag.food ?? 0) > 0 && !saved.unlocks.inn)) throw new Error('Invalid helper load');
      return applyWorkerStats({ workerLevels }, { id: helper.id, sourceId: source.id, name: source.name, grade: source.grade, income: source.income, x: helper.x, z: helper.z,
        product: helper.product, job, jobAssigned: helper.jobAssigned === true, phase: bagCount(helper.bag) > 0 ? 'haul' : 'collect',
        bag: { gear: helper.bag.gear, potion: helper.bag.potion, food: helper.bag.food ?? 0 }, timer: 0, cleanTableId: null, workKind: null }, source);
    });
    if (!finite(saved.shopHp, 0, 240) || !saved.raid || !['idle', 'warning', 'departure', 'battle', 'victory', 'defeat', 'recovery'].includes(saved.raid.phase) || !integer(saved.raid.wins, 0, 999) || saved.stage !== saved.raid.wins + 1 || !integer(saved.raid.wave, 0, 1000) || !integer(saved.raid.triggerSales, 0, 1e9)) return badSave();
    if (!saved.economy || !finite(saved.economy.earned, 0, 1e13) || !finite(saved.economy.spent, 0, 1e13)) return badSave();
    const state = createGame(saved.seed);
    for (const key of ['rng', 'nextId', 'time', 'stage', 'gold', 'sales', 'lodgings']) state[key] = saved[key];
    state.milestone = saved.milestone === true;
    state.economy = { earned: saved.economy.earned, spent: saved.economy.spent };
    state.moneyPiles = { gear: moneyPiles.gear, potion: moneyPiles.potion, inn: moneyPiles.inn };
    state.dining = { kitchen: dining.kitchen ?? 4, food: dining.food, cookClock: 0, cleaned: dining.cleaned, tables: dining.tables.map(({ status }) => ({ status: status === 'clean' ? 'clean' : 'dirty', customerId: null, cleanProgress: 0 })) };
    state.facilityLevels = { forge: facilityLevels.forge, counter: facilityLevels.counter, alchemy: facilityLevels.alchemy, inn: facilityLevels.inn };
    state.workerLevels = { speed: workerLevels.speed, capacity: workerLevels.capacity };
    for (const key of ['x', 'z', 'speedLevel', 'capacityLevel', 'priceLevel', 'blinkCooldown']) state.player[key] = player[key];
    state.player.bag = { gear: player.bag.gear, potion: player.bag.potion, food: player.bag.food ?? 0 };
    state.stocks = { ...saved.stocks };
    Object.assign(state.unlocks, saved.unlocks);
    state.patrons = saved.patrons.map((patron) => ({ ...patron })); state.staff = helpers;
    state.shopHp = saved.shopHp;
    state.raid.wins = saved.raid.wins; state.raid.wave = saved.raid.wave; state.raid.triggerSales = saved.raid.triggerSales;
    state.raid.kind = state.stage % 2 ? 'monsters' : 'army';
    // A battle reload is a safe preparation checkpoint; no hidden elapsed-time loss.
    state.raid.timer = ['idle', 'warning'].includes(saved.raid.phase) && finite(saved.raid.timer, 0, 90) ? Math.max(10, saved.raid.timer) : 45;
    if (!['idle', 'warning'].includes(saved.raid.phase)) state.raid.triggerSales = state.sales + 18 + Math.min(state.stage * 2, 16);
    if (state.shopHp <= 0 || saved.raid.phase === 'defeat') { state.shopHp = 0; state.status = 'defeat'; state.raid.phase = 'defeat'; }
    updateUnlocks(state);
    state.message = state.status === 'defeat' ? '무료 복구로 상회를 다시 여세요' : '상회 기록을 불러왔습니다';
    state.effects = []; state.events = [];
    return state;
  } catch { return badSave(); }
}
