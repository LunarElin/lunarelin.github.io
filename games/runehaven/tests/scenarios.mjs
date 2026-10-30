// Browser QA fixtures only. No browser APIs, storage, wall clock, or random seeds.
// late/late-defense/defense/defeat earn progression through normal simulation.
// queues/dining deliberately assign supplies and unlocks for visual fixtures.
// Import this module only for an explicitly requested QA scenario.
import {
  act, createGame, getCapacity, getFacilityUpgradeInfo, getHireInfo, getMoneyPiles, getRegion, getStations, getUpgradeInfo, getWorkerUpgradeInfo,
  getStationApproach, restore, serialize, step,
} from '../rules.mjs';

export const SCENARIO_INFO = Object.freeze({
  late: Object.freeze({ label: '후반 영업 · 점멸', expected: '속도 21, 공방·여관, 세 직업 단골, 미회수 매출, 영업 상태', artificial: false }),
  'late-defense': Object.freeze({ label: '후반 습격 예고', expected: '6단계 이상, 최근 출전 명단에 검사·궁수·마법사, 정예·원거리 적, 경고 약 8초', artificial: false }),
  defense: Object.freeze({ label: '첫 습격 예고', expected: '유료 단골 8명 이상, 경고 약 8초', artificial: false }),
  defeat: Object.freeze({ label: '패배 저장 재접속', expected: '정상 구매 단골 3명, 준비 부족으로 자연스러운 패배, 복구 대기', artificial: false }),
  queues: Object.freeze({ label: '대기열 외형 검사', expected: '시설·지역을 지정한 24명 무재고 대기열, 실제 획득 진행 아님', artificial: true }),
  dining: Object.freeze({ label: '여관 식사·정리 검사', expected: '지정 재고로 식사·빈 그릇·음식 운반을 재현, 실제 획득 진행 아님', artificial: true }),
});

function mark(state, name) {
  state.qaScenario = { name, ...SCENARIO_INFO[name], seed: 42, simulationSeconds: state.time };
  return state;
}

function commerce(name) {
  const state = createGame(42);
  const advanced = name === 'late' || name === 'late-defense';
  act(state, 'hire');
  let carrying = false;
  let product = 'gear';
  let cashId = null;
  for (let index = 0; index < 12000; index++) {
    if (state.status !== 'playing') throw new Error(`QA ${name}: unexpected defeat`);
    if (state.unlocks.alchemyAvailable && !state.unlocks.alchemy && state.gold >= 230) act(state, 'unlock', { kind: 'alchemy' });
    if (state.unlocks.innAvailable && !state.unlocks.inn) act(state, 'unlock', { kind: 'inn' });
    if (state.staff.length < 3 && state.gold > 900 && getHireInfo(state).canBuy) act(state, 'hire');
    if (state.player.capacityLevel < 4 && getUpgradeInfo(state, 'capacity').canBuy) act(state, 'upgrade', { kind: 'capacity' });
    if (advanced) {
      for (const kind of ['forge', 'counter', 'alchemy', 'inn']) {
        const info = getFacilityUpgradeInfo(state, kind);
        if (info.currentLevel < Math.min(3, state.stage) && info.canBuy) act(state, 'upgrade-facility', { kind });
      }
      for (const kind of ['speed', 'capacity']) {
        const info = getWorkerUpgradeInfo(state, kind);
        if (info.currentLevel < Math.min(5, state.stage) && info.canBuy) act(state, 'upgrade-worker', { kind });
      }
      if (state.player.priceLevel < Math.min(21, 2 + state.stage * 3) && getUpgradeInfo(state, 'price').canBuy) act(state, 'upgrade', { kind: 'price' });
    }
    if (advanced && state.player.speedLevel < 21 && getUpgradeInfo(state, 'speed').canBuy) act(state, 'upgrade', { kind: 'speed' });
    if (state.raid.phase === 'victory') {
      act(state, 'continue');
      if (name === 'late' && state.player.speedLevel === 21 && state.unlocks.alchemy && state.unlocks.inn && ['warrior', 'archer', 'mage'].every((kind) => state.patrons.some((patron) => patron.kind === kind))) {
        // Let a helper's real next sale leave visible cash for the floor-pile QA.
        for (let wait = 0; wait < 500 && !getMoneyPiles(state).some((pile) => pile.amount > 0); wait++) step(state, 0.1, { target: getRegion(state).spawn });
        if (!Object.values(state.moneyPiles).some((amount) => amount > 0)) throw new Error('QA late: no earned cash pile');
        return mark(state, name);
      }
    }
    const bag = state.player.bag.gear + state.player.bag.potion;
    if (bag >= getCapacity(state)) carrying = true;
    if (bag === 0) { carrying = false; product = state.unlocks.mage && state.stocks.potion < 3 ? 'potion' : 'gear'; }
    const piles = getMoneyPiles(state);
    if (cashId && !piles.find((pile) => pile.id === cashId)?.amount) cashId = null;
    if (!bag && !cashId) cashId = piles.filter((pile) => pile.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.id ?? null;
    const target = cashId ? piles.find((pile) => pile.id === cashId)
      : getStationApproach(state, carrying ? (state.player.bag.gear > 0 ? 'counter' : 'potionCounter') : (product === 'gear' ? 'forge' : 'alchemy'));
    step(state, 0.1, { target });
    if (name === 'defense' && state.raid.phase === 'warning' && state.raid.timer <= 8 && state.patrons.length >= 8) return mark(state, name);
    if (name === 'late-defense' && state.stage >= 6 && state.raid.phase === 'warning' && state.raid.timer <= 8
      && ['warrior', 'archer', 'mage'].every((kind) => state.patrons.slice(-18).some((patron) => patron.kind === kind))) return mark(state, name);
  }
  throw new Error(`QA ${name}: bounded simulation did not reach its checkpoint`);
}

function defeat() {
  const state = createGame(42);
  function until(predicate, input = {}, maximum = 5000) {
    for (let index = 0; index < maximum && !predicate(); index++) step(state, 0.1, input);
    if (!predicate()) throw new Error('QA defeat: bounded route did not reach its checkpoint');
  }
  function reach(target) {
    until(() => Math.hypot(state.player.x - target.x, state.player.z - target.z) < 0.12, { target });
  }
  until(() => state.player.bag.gear >= 2, { target: getStationApproach(state, 'forge') });
  until(() => state.player.bag.gear === 0, { target: getStationApproach(state, 'counter') });
  until(() => state.sales >= 2);
  until(() => state.player.bag.gear >= 2, { target: getStationApproach(state, 'forge') });
  // Approach the far edge, deliver exactly one item, and walk away holding one.
  const counter = getStations(state).counter;
  reach({ x: counter.x + Math.sign(counter.x) * 1.5, z: counter.z });
  until(() => state.player.bag.gear < 2, { target: { x: counter.x + Math.sign(counter.x) * .95, z: counter.z } });
  for (let index = 0; index < 10; index++) step(state, 0.1, { z: 1 });
  until(() => state.sales >= 3);
  for (let index = 0; index < 10000; index++) {
    if (state.raid.phase === 'victory') act(state, 'continue');
    if (state.status === 'defeat') {
      // Exercise the actual save/reload contract used by the recovery UI.
      return mark(restore(serialize(state)), 'defeat');
    }
    step(state, 0.1);
  }
  throw new Error('QA defeat: natural combat did not reach defeat within the bound');
}

export function buildScenario(name, stage = 1) {
  if (!Object.hasOwn(SCENARIO_INFO, name)) throw new RangeError(`Unknown QA scenario: ${name}`);
  if (name === 'dining') {
    const state = buildScenario('queues', stage);
    // Explicitly supplied inventory keeps this a visual fixture, not earned play.
    state.stocks.gear = 12; state.stocks.potion = 8; state.dining.food = 4;
    const inn = getStations(state).inn;
    for (let frame = 0; frame < 1000; frame++) {
      step(state, .05, { target: { x: inn.x, z: inn.z + 3.5 } });
      if (state.dining.tables.some((table) => table.status === 'dirty')
        && state.dining.tables.some((table) => table.status === 'eating')) return mark(state, name);
    }
    throw new Error('QA dining: food service did not reach its checkpoint');
  }
  if (name === 'queues') {
    // Deliberate visual fixture: commerce movement is real, unlocks are assigned.
    const state = createGame(42);
    state.stage = stage; state.sales = 20;
    state.unlocks.alchemy = state.unlocks.inn = true;
  state.dining.tableCount = 4; state.dining.tables.forEach((table) => { table.status = 'clean'; }); // Explicit fully expanded fixture.

    state.facilityLevels = { forge: 3, counter: 3, alchemy: 3, inn: 3 };
    state.raid.timer = state.raid.triggerSales = 1e6;
    for (let frame = 0; frame < 900; frame++) step(state, .05, { target: { x: 0, z: 3.1 } });
    return mark(state, name);
  }
  return name === 'defeat' ? defeat() : commerce(name);
}
