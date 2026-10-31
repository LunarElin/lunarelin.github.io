import { act as gameAct, getActionZone, isStandingInActionZone } from '../rules.mjs';

// Unit-test setup only. Browser QA and earned progression walk to the circles.
// Existing economic/worker tests use a valid standing location before purchases.
export function act(state, action, payload = {}) {
  const zone = getActionZone(state, action, payload);
  if (zone) Object.assign(state.player, { x: zone.x, z: zone.z, moving: false, target: null });
  return gameAct(state, action, payload);
}

const trips = new WeakMap();
// Earned progression uses real pathing/time rather than fixture placement.
export function actWhileTraveling(state, action, payload = {}) {
  const zone = getActionZone(state, action, payload);
  if (!zone) return gameAct(state, action, payload);
  const key = `${action}:${payload.kind ?? payload.tableId ?? ''}`;
  const trip = trips.get(state);
  if (trip && trip.key !== key) return { ok: false, traveling: true };
  if (!isStandingInActionZone(state, zone)) {
    trips.set(state, { key, action, payload });
    return { ok: false, traveling: true, requiresZone: zone };
  }
  trips.delete(state);
  return gameAct(state, action, payload);
}

export function getPendingActionTarget(state) {
  const trip = trips.get(state);
  if (!trip || state.raid.location === 'outside' || state.raid.phase === 'departure') return null;
  const zone = getActionZone(state, trip.action, trip.payload);
  if (isStandingInActionZone(state, zone)) {
    trips.delete(state); gameAct(state, trip.action, trip.payload); return null;
  }
  return zone;
}
