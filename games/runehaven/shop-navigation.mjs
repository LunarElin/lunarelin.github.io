import { BOUNDS, getStations, getRegion } from './maps.mjs';
import { getDiningLayout } from './dining.mjs';

// The source separates broad work triggers from carved furniture bodies. NPCs
// are not obstacles. A small static visibility graph is built only for blocked
// destinations; open shop-floor movement keeps its original straight line.
export const SHOP_RADIUS = .25;
const EDGE = .015;
const obstacles = new Map(), paddedObstacles = new Map(), paths = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (p, r) => p.x > r.minX + 1e-7 && p.x < r.maxX - 1e-7 && p.z > r.minZ + 1e-7 && p.z < r.maxZ - 1e-7;
const clamp = (p) => ({ x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x)), z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z)) });
function layoutKey(state) { return `${getRegion(state).id}:${Boolean(state.unlocks.alchemy)}:${Boolean(state.unlocks.inn)}:${state.dining?.tableCount || 1}`; }

export function getShopObstacles(state) {
  const key = layoutKey(state);
  if (obstacles.has(key)) return obstacles.get(key);
  const s = getStations(state), result = [];
  const add = (id, p, left, right, back, front) => result.push(Object.freeze({ id, minX: p.x + left, maxX: p.x + right, minZ: p.z + back, maxZ: p.z + front }));
  add('forge', s.forge, -1.105, 1.23, -.725, .43);
  add('counter', s.counter, -1.2, 1.2, -.5, .5);
  if (state.unlocks.alchemy) {
    add('alchemy', s.alchemy, -1.025, 1.025, -.6, .6);
    add('potionCounter', s.potionCounter, -1.05, 1.05, -.5, .5);
  }
  if (state.unlocks.inn) {
    const d = getDiningLayout(state);
    add('inn', s.inn, -1.1, 1.1, -1.075, .075);
    // The complete service fixture body blocks movement. Dining tables keep
    // their narrow source-style pedestal so seated guests can approach chairs.
    add('kitchen', d.kitchen, -.95, .95, -.65, .65);
    add('meal', d.counter, -.95, .95, -.65, .65);
    for (const table of d.tables.slice(0, state.dining.tableCount)) add(`table-${table.id}`, table, -.3, .3, -.3, .3);
  }
  const value = Object.freeze(result);
  obstacles.set(key, value); return value;
}

function expanded(state, padding = SHOP_RADIUS) {
  const key = `${layoutKey(state)}:${padding}`;
  if (!paddedObstacles.has(key)) paddedObstacles.set(key, getShopObstacles(state).map(r => ({ ...r, minX: r.minX - padding, maxX: r.maxX + padding, minZ: r.minZ - padding, maxZ: r.maxZ + padding })));
  return paddedObstacles.get(key);
}

export function projectShopTarget(state, target) {
  let point = clamp(target);
  const solids = expanded(state);
  for (let pass = 0; pass < solids.length; pass++) {
    const solid = solids.find(r => inside(point, r));
    if (!solid) break;
    const candidates = [
      { x: solid.minX - EDGE, z: point.z }, { x: solid.maxX + EDGE, z: point.z },
      { x: point.x, z: solid.minZ - EDGE }, { x: point.x, z: solid.maxZ + EDGE },
    ].map(clamp).filter(p => !solids.some(r => inside(p, r)));
    candidates.sort((a, b) => distance(a, point) - distance(b, point));
    if (!candidates.length) break;
    point = candidates[0];
  }
  return point;
}

function crosses(a, b, r) {
  let enter = 0, leave = 1;
  for (const [axis, min, max] of [['x', r.minX + 1e-6, r.maxX - 1e-6], ['z', r.minZ + 1e-6, r.maxZ - 1e-6]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) { if (a[axis] <= min || a[axis] >= max) return false; continue; }
    const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
    enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
    if (enter >= leave) return false;
  }
  return enter < 1 && leave > 0;
}
export function shopLineClear(state, from, to) { return !expanded(state).some(r => crosses(from, to, r)); }

export function planShopPath(state, start, destination) {
  const goal = projectShopTarget(state, destination), from = projectShopTarget(state, start), solids = expanded(state);
  const clear = (a, b) => !solids.some(r => crosses(a, b, r));
  if (clear(from, goal)) return [goal];
  const nodes = [from, goal];
  for (const r of solids) for (const x of [r.minX - EDGE, r.maxX + EDGE]) for (const z of [r.minZ - EDGE, r.maxZ + EDGE]) {
    const point = { x, z };
    if (x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ && !solids.some(s => inside(point, s))) nodes.push(point);
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set(); costs[0] = 0;
  for (let visit = 0; visit < nodes.length; visit++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || !clear(nodes[current], nodes[next])) continue;
      const cost = costs[current] + distance(nodes[current], nodes[next]);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; }
    }
  }
  if (previous[1] < 0) return [from];
  const route = [];
  for (let index = 1; index > 0; index = previous[index]) route.push(nodes[index]);
  return route.reverse();
}

export function getShopWaypoint(state, actor, destination) {
  const goal = projectShopTarget(state, destination);
  if (shopLineClear(state, actor, goal)) { paths.delete(actor); return goal; }
  const key = layoutKey(state);
  let route = paths.get(actor);
  if (!route || route.key !== key || distance(route.goal, goal) > .01 || !shopLineClear(state, actor, route.points[0])) {
    route = { key, goal, points: planShopPath(state, actor, goal) }; paths.set(actor, route);
  }
  while (route.points.length > 1 && distance(actor, route.points[0]) < .06 && shopLineClear(state, actor, route.points[1])) route.points.shift();
  return route.points[0];
}

export function moveShopPoint(state, from, desired) {
  const position = projectShopTarget(state, from), goal = clamp(desired), solids = expanded(state);
  for (const [axis, other] of [['x', 'z'], ['z', 'x']]) {
    let value = goal[axis];
    for (const r of solids) {
      const min = axis === 'x' ? r.minX : r.minZ, max = axis === 'x' ? r.maxX : r.maxZ;
      const sideMin = other === 'x' ? r.minX : r.minZ, sideMax = other === 'x' ? r.maxX : r.maxZ;
      if (position[other] <= sideMin || position[other] >= sideMax) continue;
      if (value > position[axis] && position[axis] <= min && value > min) value = Math.min(value, min);
      if (value < position[axis] && position[axis] >= max && value < max) value = Math.max(value, max);
    }
    position[axis] = value;
  }
  return position;
}
