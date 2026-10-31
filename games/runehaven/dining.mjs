import { BOUNDS, getRegion, getStations } from './maps.mjs';

// New web-game dining timings; the existing inn ability still sets eating time
// and meal income. These are not extracted original-game constants.
export const DINING_RULES = Object.freeze({ tables: 4, seatsPerTable: 2, queueCapacity: 4, foodCapacity: 8, cookSeconds: 3, cleanSeconds: 1.2, cleanRadius: 1.1, guestChance: .6 });

export function createDiningTable(unlocked = true) {
  const status = unlocked ? 'clean' : 'locked';
  return { status, cash: 0, customerId: null, cleanProgress: 0, cleanerId: null,
    seats: Array.from({ length: DINING_RULES.seatsPerTable }, () => ({ status, customerId: null, cleanProgress: 0, cleanerId: null })) };
}

// Keep the old table-level fields as a display summary; seat state is canonical.
export function updateDiningTable(table) {
  const seats = table.seats;
  table.status = ['dirty', 'eating', 'reserved', 'clean', 'locked'].find(status => seats.some(seat => seat.status === status));
  table.customerId = seats.find(seat => seat.customerId)?.customerId ?? null;
  table.cleanProgress = Math.max(...seats.map(seat => seat.cleanProgress ?? 0));
  table.cleanerId = seats.find(seat => seat.cleanerId)?.cleanerId ?? null;
  return table;
}

export function createDiningState() {
  return { kitchen: 4, food: 0, cookClock: 0, cleaned: 0, tableCount: 1,
    tables: Array.from({ length: DINING_RULES.tables }, (_, id) => createDiningTable(id === 0)) };
}

const layouts = new Map();

export function getDiningLayout(state) {
  const key = getRegion(state).id;
  if (layouts.has(key)) return layouts.get(key);
  const inn = getStations(state).inn;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const kitchen = { x: inn.x - 2.6, z: inn.z + 2.2 };
  const counter = { x: inn.x + 2.6, z: inn.z + 2.2 };
  const kitchenPoint = { x: kitchen.x, z: kitchen.z + 1.25 };
  const counterPoint = { x: counter.x, z: counter.z - 1.25 };
  const tables = Array.from({ length: DINING_RULES.tables }, (_, id) => {
    const x = clamp(inn.x + (id % 2 ? 2.6 : -2.6), BOUNDS.minX + .9, BOUNDS.maxX - .9);
    const z = clamp(inn.z + (id < 2 ? 5.8 : 10.1), BOUNDS.minZ + .9, BOUNDS.maxZ - 1.1);
    const seats = [
      { id: 0, tableId: id, seatPoint: { x, z: z + .65 }, dishPoint: { x, y: .66, z: z + .26 }, cleanPoint: { x: x - 1.45, z: z + .65 }, yaw: Math.PI },
      { id: 1, tableId: id, seatPoint: { x, z: z - .58 }, dishPoint: { x, y: .66, z: z - .26 }, cleanPoint: { x: x - 1.45, z: z - .65 }, yaw: 0 },
    ];
    return { id, x, z, seats, seat: seats[0].seatPoint, cleanPoint: seats[0].cleanPoint };
  });
  // The food line runs across the service area, leaving the first table row
  // clear instead of extending straight into the right-hand dining table.
  const queue = Array.from({ length: DINING_RULES.queueCapacity }, (_, index) => ({ x: counter.x - index * .65, z: counter.z + 1 }));
  const layout = Object.freeze({ kitchen: Object.freeze(kitchen), kitchenPoint: Object.freeze(kitchenPoint), counter: Object.freeze(counter), counterPoint: Object.freeze(counterPoint), tables: Object.freeze(tables.map((table) => Object.freeze({ ...table,
    seats: Object.freeze(table.seats.map(seat => Object.freeze({ ...seat, seatPoint: Object.freeze(seat.seatPoint), dishPoint: Object.freeze(seat.dishPoint), cleanPoint: Object.freeze(seat.cleanPoint) }))),
    seat: Object.freeze(table.seat), cleanPoint: Object.freeze(table.cleanPoint) }))), queue: Object.freeze(queue.map(Object.freeze)) });
  layouts.set(key, layout);
  return layout;
}
