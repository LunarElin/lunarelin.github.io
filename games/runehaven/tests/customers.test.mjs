import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, createGame, getCoinMultiplier, getCustomerQueueSlots, getFacilityStats, getSalePrice, getStationApproach, getStations, step } from '../rules.mjs';

function run(state, seconds, inspect = () => {}) {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) {
    step(state, .05);
    inspect(state);
  }
}

function grownShop(seed = 42, stage = 1) {
  const state = createGame(seed);
  state.stage = stage;
  state.raid.wins = stage - 1;
  state.sales = 20;
  state.unlocks.alchemy = true;
  state.unlocks.inn = true;
  state.dining.food = 8; // Explicit finite meal stock for the commerce fixture.
  // Isolate commerce from raid scheduling; prices and facility clocks stay real.
  state.raid.timer = state.raid.triggerSales = 1e6;
  return state;
}

function inBounds(customer) {
  return Number.isFinite(customer.x) && Number.isFinite(customer.z)
    && customer.x >= BOUNDS.minX && customer.x <= BOUNDS.maxX
    && customer.z >= BOUNDS.minZ && customer.z <= BOUNDS.maxZ;
}

function queues(state, product) {
  return state.customers.filter((customer) => customer.product === product
    && ['entering', 'queue'].includes(customer.phase));
}

test('a new shop gains a visible real queue quickly without free purchases or revenue', () => {
  const state = createGame(42);
  run(state, 8);
  assert.ok(state.customers.length >= 8 && state.customers.length <= 12);
  assert.ok(state.customers.every((customer) => !customer.purchased && customer.product === 'gear'));
  run(state, 12);
  assert.equal(state.customers.length, 12);
  assert.equal(state.sales, 0);
  assert.equal(state.patrons.length, 0);
  assert.equal(state.economy.earned, 0);
  assert.equal(state.gold, BALANCE.web.startingCoins);
});

test('all ten regions provide long single-file queues beside a clear central aisle', () => {
  for (let stage = 1; stage <= 10; stage++) {
    for (const product of ['gear', 'potion']) {
      const slots = getCustomerQueueSlots({ stage }, product);
      assert.equal(slots.length, 16);
      assert.equal(new Set(slots.map(({ x, z }) => `${x}:${z}`)).size, 16);
      assert.ok(slots.every(inBounds), `${stage}/${product}: reachable slots`);
      for (let left = 0; left < slots.length; left++) for (let right = left + 1; right < slots.length; right++) {
        assert.ok(Math.hypot(slots[left].x - slots[right].x, slots[left].z - slots[right].z) >= .7 - .00001,
          `${stage}/${product}: slots ${left}/${right}`);
      }
      for (let index = 1; index < slots.length; index++) {
        assert.ok(Math.hypot(slots[index].x - slots[index - 1].x, slots[index].z - slots[index - 1].z) <= 1.4,
          `${stage}/${product}: contiguous queue path`);
      }
      assert.ok(slots.every((slot) => Math.abs(slot.x) >= 2.9), 'queues stay outside the working lanes');
      const approach = getStationApproach({ stage }, product === 'potion' ? 'potionCounter' : 'counter');
      assert.ok(inBounds(approach));
      assert.ok(slots.every((slot) => Math.hypot(slot.x - approach.x, slot.z - approach.z) >= .75),
        'player delivery stops behind the counter, away from waiting shoppers');
      const directions = slots.slice(1).map((slot, i) => Math.sign(slot.x - slots[i].x) || 2 * Math.sign(slot.z - slots[i].z));
      const turns = directions.filter((direction, i) => i > 0 && direction !== directions[i - 1]).length;
      assert.equal(turns, 2, 'one long U-shaped line, rather than a compact grid');
    }
  }
});

test('expanded shops keep twenty to twenty-four real customers without overriding full-line class choices', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = grownShop(stage, stage);
    run(state, 60, () => {
      assert.ok(state.customers.length <= 30);
      assert.ok(queues(state, 'gear').length <= 16);
      assert.ok(queues(state, 'potion').length <= 16);
      assert.ok(state.customers.every(inBounds));
    });
    assert.ok(state.customers.length >= 20 && state.customers.length <= 24, `region ${stage}`);
    assert.equal(state.sales, 20);
    assert.equal(state.economy.earned, 0);
  }
});

test('a full gear line keeps the drawn warrior waiting instead of replacing it with a mage', () => {
  const state = grownShop(2);
  run(state, 60);
  assert.equal(queues(state, 'gear').length, 16);
  assert.equal(state.pendingCustomerKind, 'warrior');
  const randomState = state.rng, customers = state.customers.length;
  const previousIds = new Set(state.customers.map((customer) => customer.id));
  run(state, 10);
  assert.equal(state.customers.length, customers, 'a blocked class is not rerolled into free potion capacity');
  assert.equal(state.rng, randomState, 'waiting does not consume additional class draws');
  state.stocks.gear = 1;
  run(state, 10);
  assert.equal(state.sales, 21, 'a real purchase opens the gear line');
  const admitted = state.customers.find((customer) => !previousIds.has(customer.id));
  assert.ok(admitted);
  assert.equal(admitted.kind, 'warrior');
  assert.equal(admitted.product, 'gear');
});

test('a stocked queue buys in arrival order and preserves the original counter time and exact price', () => {
  const state = createGame(17);
  state.raid.timer = state.raid.triggerSales = 1e6;
  run(state, 20);
  const arrivalOrder = queues(state, 'gear').map((customer) => customer.id);
  const quantity = arrivalOrder.length;
  const price = getSalePrice(state, 'gear');
  const seconds = getFacilityStats(state, 'counter').seconds;
  state.stocks.gear = quantity;
  run(state, seconds - .1);
  assert.equal(state.sales, 0, 'crowd size must not bypass payment duration');
  run(state, quantity * (seconds + 1));
  assert.equal(state.sales, quantity);
  assert.deepEqual(state.patrons.map((patron) => patron.id), arrivalOrder);
  assert.equal(new Set(state.patrons.map((patron) => patron.id)).size, quantity);
  assert.equal(state.stocks.gear, 0);
  assert.equal(state.economy.earned, quantity * price);
  assert.equal(state.moneyPiles.gear, quantity * price);
  run(state, 10);
  assert.equal(state.sales, quantity);
  assert.equal(state.economy.earned, quantity * price);
});

test('stocked commerce caps total visitors and dining guests without multiplying product or meal revenue', () => {
  const state = grownShop();
  const startingSales = state.sales;
  const initialStock = 60;
  state.stocks.gear = state.stocks.potion = initialStock;
  let peak = 0, innPeak = 0;
  run(state, 120, () => {
    peak = Math.max(peak, state.customers.length);
    const guests = state.customers.filter((customer) => ['food-queue', 'to-table', 'eating'].includes(customer.phase));
    innPeak = Math.max(innPeak, guests.length);
    assert.ok(state.customers.length <= 30);
    assert.ok(guests.length <= 4);
    assert.ok(state.customers.every(inBounds));
  });
  assert.ok(peak >= 24);
  assert.equal(innPeak, 4);
  const gearSales = initialStock - state.stocks.gear;
  const potionSales = initialStock - state.stocks.potion;
  assert.equal(state.sales - startingSales, gearSales + potionSales);
  assert.ok(gearSales <= Math.floor(120 / getFacilityStats(state, 'counter').seconds));
  assert.ok(potionSales <= Math.floor(120 / getFacilityStats(state, 'counter').seconds));
  const lodgingPrice = Math.round(BALANCE.facilities.inn.salePrice * 10);
  const expected = gearSales * getSalePrice(state, 'gear') + potionSales * getSalePrice(state, 'potion') + state.lodgings * lodgingPrice;
  assert.equal(state.economy.earned, expected);
  assert.equal(state.gold + Object.values(state.moneyPiles).reduce((sum, amount) => sum + amount, 0),
    BALANCE.web.startingCoins + expected);
  assert.ok(state.lodgings > 0);
});

test('level-three dual counters sustain real queues and repeat sales for a stocked minute', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = grownShop(42, stage);
    state.facilityLevels = { forge: 3, counter: 3, alchemy: 3, inn: 3 };
    state.stocks.gear = state.stocks.potion = 60;
    const startingSales = state.sales;
    let frame = 0, previousSales = startingSales;
    run(state, 60, () => {
      frame++;
      const gear = queues(state, 'gear').length, potion = queues(state, 'potion').length;
      assert.ok(gear <= 16 && potion <= 16 && gear + potion <= 24);
      assert.ok(state.customers.length <= 30);
      assert.ok(state.customers.every(inBounds));
      // Allow the actual visitors to walk in, then keep a visible waiting crowd
      // while the unchanged counter clock consumes the fixture's finite stock.
      if (frame >= 20 * 20) assert.ok(gear + potion >= 12, `region ${stage}: upgraded shop stays busy`);
      if (frame % (10 * 20) === 0) {
        // Allow the direct entrance walk before measuring steady throughput.
        if (frame > 10 * 20) {
          assert.ok(state.sales - previousSales >= 6, `region ${stage}: steady ten-second sales window`);
        }
        previousSales = state.sales;
      }
    });
    const gearSales = 60 - state.stocks.gear, potionSales = 60 - state.stocks.potion;
    assert.ok(state.stocks.gear > 0 && state.stocks.potion > 0, 'stock lasts through the measurement');
    assert.equal(state.sales - startingSales, gearSales + potionSales);
    const salesLimit = Math.floor(60 / getFacilityStats(state, 'counter').seconds);
    assert.ok(gearSales <= salesLimit && potionSales <= salesLimit, 'arrivals do not accelerate payment');
    const inn = getFacilityStats(state, 'inn');
    const lodgingPrice = Math.round(BALANCE.facilities.inn.salePrice * getCoinMultiplier(state) * (1 + inn.bonusPercent / 100));
    assert.equal(state.economy.earned, gearSales * getSalePrice(state, 'gear')
      + potionSales * getSalePrice(state, 'potion') + state.lodgings * lodgingPrice);
  }
});

test('full shops keep buying without routing or collision deadlocks across all regions', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = grownShop(42, stage);
    state.facilityLevels = { forge: 3, counter: 3, alchemy: 3, inn: 3 };
    state.stocks.gear = state.stocks.potion = 60;
    let frame = 0, previousSales = state.sales, peak = 0;
    run(state, 120, () => {
      frame++;
      peak = Math.max(peak, state.customers.length);
      for (const customer of state.customers) {
        assert.ok(inBounds(customer));
      }
      // Controlled restocking keeps traffic running well beyond the old jam.
      if (frame % (10 * 20) === 0) {
        if (frame >= 30 * 20) assert.ok(state.sales - previousSales >= 6, `${stage}: traffic must not deadlock`);
        previousSales = state.sales;
        state.stocks.gear = state.stocks.potion = 60;
      }
    });
    assert.ok(peak >= 24 && peak <= 30);
    assert.ok(state.lodgings > 0);
  }
});

test('stationary shoppers settle in their own FIFO positions without forming a crowd at the counter', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = grownShop(42, stage);
    run(state, 45);
    for (const product of ['gear', 'potion']) {
      const line = queues(state, product), slots = getCustomerQueueSlots(state, product);
      assert.ok(line.length > 0);
      line.forEach((customer, index) => {
        assert.equal(customer.phase, 'queue');
        assert.ok(Math.hypot(customer.x - slots[index].x, customer.z - slots[index].z) < .04);
      });
    }
  }
});

test('departing customers leave through the regional gate without walking out of the playable bounds', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = createGame(stage);
    state.stage = stage;
    state.raid.wins = stage - 1;
    state.timers.customer = 100;
    const station = getStations(state).counter;
    state.customers.push({ id: 'departing', ...station, kind: 'warrior', product: 'gear', phase: 'leaving', hp: 90, purchased: true, timer: 0, patience: 0 });
    run(state, 10, () => assert.ok(state.customers.every(inBounds)));
    assert.ok(!state.customers.some((customer) => customer.id === 'departing'), `region ${stage}: exit completes`);
    assert.equal(state.economy.earned, 0);
  }
});

test('bounded arrivals and customer movement remain deterministic for the same seed and input', () => {
  const left = grownShop(123, 10), right = grownShop(123, 10);
  left.stocks.gear = right.stocks.gear = 30;
  left.stocks.potion = right.stocks.potion = 30;
  run(left, 45);
  run(right, 45);
  assert.deepEqual(left.customers, right.customers);
  assert.deepEqual(left.patrons, right.patrons);
  assert.deepEqual(left.economy, right.economy);
});
