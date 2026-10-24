import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, createGame, getCoinMultiplier, getCustomerQueueSlots, getCustomerEntrySlots, getCustomerBranchPoint, getFacilityStats, getSalePrice, getStationApproach, getStations, step } from '../rules.mjs';

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
    && customer.z >= BOUNDS.minZ && customer.z <= (customer.phase ? 26 : BOUNDS.maxZ);
}

function queues(state, product) {
  return state.customers.filter((customer) => customer.product === product
    && ['entrance', 'branch', 'queue'].includes(customer.phase));
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

test('all regions have one outside entrance line and two short straight counter queues', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = { stage }, stations = getStations(state), entrance = getCustomerEntrySlots(state), branch = getCustomerBranchPoint(state);
    assert.equal(entrance.length, 24);
    assert.equal(getCustomerEntrySlots(state), entrance, 'static queue positions are cached');
    entrance.forEach((slot, index) => {
      assert.equal(slot.x, stations.gate.x);
      assert.ok(slot.z > stations.gate.z, 'common waiting line starts outside the doorway');
      if (index) assert.ok(Math.abs(slot.z - entrance[index - 1].z - .7) < .00001);
    });
    assert.equal(branch.x, stations.gate.x);
    assert.ok(branch.z < stations.gate.z);
    for (const product of ['gear', 'potion']) {
      const slots = getCustomerQueueSlots(state, product), counter = stations[product === 'gear' ? 'counter' : 'potionCounter'];
      assert.equal(slots.length, 6);
      assert.ok(slots.every(inBounds));
      slots.forEach((slot, index) => {
        assert.equal(slot.x, counter.x);
        assert.ok(Math.abs(slot.z - (counter.z + .95 + index * .68)) < .00001);
      });
      const approach = getStationApproach(state, product === 'potion' ? 'potionCounter' : 'counter');
      assert.ok(inBounds(approach));
      assert.ok(slots.every((slot) => Math.hypot(slot.x - approach.x, slot.z - approach.z) >= .75));
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

test('unserved crowds settle into one entrance line and six places per counter', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const state = grownShop(42, stage);
    run(state, 60);
    const entrance = state.customers.filter((customer) => customer.phase === 'entrance');
    assert.ok(entrance.length > 0, 'the remainder waits outside instead of appearing at a counter');
    entrance.forEach((customer, index) => assert.ok(Math.hypot(customer.x - getCustomerEntrySlots(state)[index].x,
      customer.z - getCustomerEntrySlots(state)[index].z) < .04));
    for (const product of ['gear', 'potion']) {
      const line = state.customers.filter((customer) => customer.product === product && ['branch', 'queue'].includes(customer.phase));
      assert.ok(line.length <= 6);
      line.forEach((customer, index) => {
        const slot = getCustomerQueueSlots(state, product)[index];
        assert.equal(customer.phase, 'queue');
        assert.ok(Math.hypot(customer.x - slot.x, customer.z - slot.z) < .04);
      });
    }
  }
});

test('entrance admission is global FIFO with a visible interval before the doorway branch', () => {
  const state = grownShop(42);
  const spawned = [], admitted = [], known = new Set(), entered = new Set();
  run(state, 30, () => {
    for (const customer of state.customers) {
      if (!known.has(customer.id)) {
        known.add(customer.id); spawned.push(customer.id);
        assert.equal(customer.phase, 'entrance');
        assert.ok(customer.z > getStations(state).gate.z);
      }
      if (['branch', 'queue'].includes(customer.phase) && !entered.has(customer.id)) {
        entered.add(customer.id); admitted.push({ id: customer.id, time: state.time });
      }
    }
  });
  assert.ok(admitted.length >= 6);
  assert.deepEqual(admitted.map(({ id }) => id), spawned.slice(0, admitted.length));
  for (let index = 1; index < admitted.length; index++) assert.ok(admitted[index].time - admitted[index - 1].time >= .55 - .00001);
  assert.ok(state.customers.some((customer) => customer.phase === 'entrance'));
});

test('an admitted shopper crosses the doorway branch before walking straight toward its chosen counter', () => {
  const state = createGame(42);
  state.timers.customer = 1000;
  const entry = getCustomerEntrySlots(state)[0], branch = getCustomerBranchPoint(state);
  const shopper = { id: 'at-entrance', ...entry, kind: 'warrior', product: 'gear', phase: 'entrance', hp: 90, purchased: false, timer: 0, patience: 0 };
  state.customers.push(shopper);
  for (let frame = 0; frame < 100 && !shopper.branchPassed; frame++) {
    step(state, .05);
    assert.equal(shopper.x, entry.x, 'the doorway must be visited before the left/right split');
  }
  assert.equal(shopper.branchPassed, true);
  assert.ok(Math.hypot(shopper.x - branch.x, shopper.z - branch.z) <= .026);
  const before = { x: shopper.x, z: shopper.z }, target = getCustomerQueueSlots(state, shopper.product)[0];
  step(state, .05);
  const cross = (shopper.x - before.x) * (target.z - before.z) - (shopper.z - before.z) * (target.x - before.x);
  assert.ok(Math.abs(cross) < .000001, 'after the intentional branch, movement is one direct segment');
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
