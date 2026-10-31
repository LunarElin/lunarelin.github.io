import { getStations } from './maps.mjs';
import { getDiningLayout } from './dining.mjs';

// Gameplay and rendering share these exact floor circles. Furniture centers are
// never interaction targets: each circle lies on the accessible side of a body.
export const ACTION_RADIUS = Object.freeze({ work: .48, cash: .5, upgrade: .55, clean: .48 });
const circle = (id, kind, label, point, extra = {}) => ({ id, kind, label, ...point, radius: ACTION_RADIUS[kind] ?? ACTION_RADIUS.upgrade, enabled: true, ...extra });
const side = (point) => Math.sign(point.x) || 1;

export function getWorkZone(state, key) {
  const stations = getStations(state), dining = getDiningLayout(state);
  const point = key === 'kitchen' ? dining.kitchenPoint : key === 'meal' ? dining.counterPoint
    : { x: stations[key].x, z: stations[key].z + ({ forge: .95, alchemy: 1.1, counter: -1.15, potionCounter: -1.15 }[key] ?? .95) };
  return circle(`work:${key}`, 'work', ['counter', 'potionCounter', 'meal'].includes(key) ? '내려놓기' : '쌓기', point, {
    stationKey: key, enabled: !['alchemy', 'potionCounter', 'kitchen', 'meal'].includes(key) || Boolean(['alchemy', 'potionCounter'].includes(key) ? state.unlocks?.alchemy : state.unlocks?.inn),
  });
}

export function getUpgradeZone(state, kind) {
  const stations = getStations(state), station = stations[kind];
  const point = kind === 'player' || kind === 'worker'
    ? { x: stations.gate.x + (kind === 'player' ? -2.6 : 2.6), z: stations.gate.z - 2.1 }
    : kind === 'inn' ? { x: station.x + 1.9, z: station.z - .7 }
      : { x: station.x - side(station) * 2.1, z: station.z + (['counter', 'potionCounter'].includes(kind) ? -1.5 : 0) };
  return circle(`upgrade:${kind}`, 'upgrade', kind === 'player' ? '강화' : kind === 'worker' ? '고용·훈련' : '시설 강화', point,
    { stationKey: kind, action: kind === 'player' ? 'upgrade' : kind === 'worker' ? 'upgrade-worker' : 'upgrade-facility', payload: { kind: kind === 'potionCounter' ? 'counter' : kind }, enabled: kind === 'potionCounter' ? state.unlocks.alchemy : !['alchemy', 'inn'].includes(kind) || state.unlocks[kind] });
}

export function getUnlockZone(state, kind) {
  const zone = getUpgradeZone(state, kind);
  return { ...zone, id: `unlock:${kind}`, label: '건설', action: 'unlock', payload: { kind }, enabled: !state.unlocks[kind] };
}

export function getTableUnlockZone(state, tableId = state.dining.tableCount) {
  const table = getDiningLayout(state).tables[tableId];
  return table ? circle(`unlock:table-${tableId}`, 'upgrade', '식탁 개방', { x: table.x - 1.45, z: table.z }, { tableId, action: 'unlock-table', payload: { tableId }, enabled: state.unlocks.inn && tableId === state.dining.tableCount }) : null;
}

export function getCashZones(state) {
  const stations = getStations(state);
  return [
    ...[['gear', 'counter'], ['potion', 'potionCounter']].map(([id, key]) => circle(`cash:${id}`, 'cash', '수금', { x: stations[key].x - side(stations[key]) * 1.95, z: stations[key].z + .2 },
      { pileId: id, pileKind: id, stationKey: key, amount: state.moneyPiles[id], enabled: id === 'gear' || state.unlocks.alchemy || state.moneyPiles[id] > 0 })),
    circle('cash:inn', 'cash', '수금', { x: stations.inn.x - 1.9, z: stations.inn.z + .8 }, { pileId: 'inn', pileKind: 'inn', stationKey: 'inn', amount: state.moneyPiles.inn, enabled: state.unlocks.inn || state.moneyPiles.inn > 0 }),
    ...getDiningLayout(state).tables.slice(0, state.unlocks.inn ? state.dining.tableCount : 0).map(table => circle(`cash:table-${table.id}`, 'cash', '수금', { x: table.x + 1.45, z: table.z - .15 },
      { pileId: `table-${table.id}`, pileKind: 'inn', tableId: table.id, amount: state.dining.tables[table.id].cash ?? 0 })),
  ];
}

export function isInsideActionZone(actor, zone) {
  return Boolean(zone?.enabled && Math.hypot(actor.x - zone.x, actor.z - zone.z) <= zone.radius + 1e-7);
}

export function isStandingInActionZone(state, zone) {
  return state.raid.location !== 'outside' && state.raid.phase !== 'departure' && !state.player.moving && isInsideActionZone(state.player, zone);
}

export function getActionZone(state, action, payload = {}) {
  if (action === 'upgrade-facility' && payload.kind === 'counter') {
    return ['counter', 'potionCounter'].map(kind => getUpgradeZone(state, kind)).filter(zone => zone.enabled)
      .sort((a, b) => Math.hypot(state.player.x - a.x, state.player.z - a.z) - Math.hypot(state.player.x - b.x, state.player.z - b.z))[0];
  }
  if (action === 'upgrade-facility') return ['forge', 'counter', 'alchemy', 'inn'].includes(payload.kind) ? getUpgradeZone(state, payload.kind) : null;
  if (action === 'upgrade') return getUpgradeZone(state, 'player');
  if (action === 'upgrade-worker' || action === 'hire') return getUpgradeZone(state, 'worker');
  if (action === 'unlock') return ['alchemy', 'inn'].includes(payload.kind) ? getUnlockZone(state, payload.kind) : null;
  if (action === 'unlock-table') return getTableUnlockZone(state);
  return null;
}

export function getActionZones(state) {
  const zones = ['forge', 'counter', 'alchemy', 'potionCounter', 'kitchen', 'meal'].map(key => getWorkZone(state, key));
  zones.push(...getCashZones(state), ...['forge', 'counter', 'potionCounter', 'alchemy', 'inn', 'player', 'worker'].map(kind => getUpgradeZone(state, kind)));
  zones.push(...['alchemy', 'inn'].map(kind => getUnlockZone(state, kind)));
  const table = getTableUnlockZone(state); if (table) zones.push(table);
  if (state.unlocks.inn) for (const table of getDiningLayout(state).tables.slice(0, state.dining.tableCount)) for (const seat of table.seats) {
    zones.push(circle(`clean:table-${table.id}-seat-${seat.id}`, 'clean', '정리', seat.cleanPoint, { tableId: table.id, seatId: seat.id, enabled: state.dining.tables[table.id].seats[seat.id].status === 'dirty' }));
  }
  return zones;
}
