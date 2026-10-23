import { BOUNDS, getRegion, getStations } from './maps.mjs';

// New web-game dining timings; the existing inn ability still sets eating time
// and meal income. These are not extracted original-game constants.
export const DINING_RULES = Object.freeze({ tables: 4, foodCapacity: 8, cookSeconds: 3, cleanSeconds: 1.2, cleanRadius: 1.1, guestChance: .6 });

export function createDiningState() {
  return { kitchen: 4, food: 0, cookClock: 0, cleaned: 0, tables: Array.from({ length: DINING_RULES.tables }, () => ({ status: 'clean', customerId: null, cleanProgress: 0 })) };
}

const layouts = new Map();

export function getDiningLayout(state) {
  const key = getRegion(state).id;
  if (layouts.has(key)) return layouts.get(key);
  const inn = getStations(state).inn;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const kitchen = { x: inn.x - 1.35, z: inn.z + 1.15 };
  const counter = { x: inn.x + 1.35, z: inn.z + 1.15 };
  const kitchenPoint = { x: kitchen.x, z: kitchen.z + .65 };
  const counterPoint = { x: counter.x, z: counter.z - .75 };
  const tables = Array.from({ length: DINING_RULES.tables }, (_, id) => {
    const x = clamp(inn.x + (id % 2 ? 1.25 : -1.25), BOUNDS.minX + .9, BOUNDS.maxX - .9);
    const z = clamp(inn.z + (id < 2 ? 2.6 : 4.5), BOUNDS.minZ + .9, BOUNDS.maxZ - 1.1);
    return { id, x, z, seat: { x, z: z + .65 }, cleanPoint: { x, z: z + .9 } };
  });
  const queue = Array.from({ length: DINING_RULES.tables }, (_, index) => ({ x: counter.x, z: counter.z + .65 + index * .65 }));
  const layout = Object.freeze({ kitchen: Object.freeze(kitchen), kitchenPoint: Object.freeze(kitchenPoint), counter: Object.freeze(counter), counterPoint: Object.freeze(counterPoint), tables: Object.freeze(tables.map((table) => Object.freeze({ ...table, seat: Object.freeze(table.seat), cleanPoint: Object.freeze(table.cleanPoint) }))), queue: Object.freeze(queue.map(Object.freeze)) });
  layouts.set(key, layout);
  return layout;
}
