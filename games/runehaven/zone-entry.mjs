// Open once per floor-circle visit; closing a shop menu while standing still
// must not immediately open it again. Walking through does not open a menu.
export function createZoneEntryGate() {
  let opened = null, candidate = null, elapsed = 0;
  const key = zone => zone?.stationKey || zone?.id || null;
  return {
    mark(zone) { opened = key(zone); candidate = opened; elapsed = 0; },
    reset() { opened = candidate = null; elapsed = 0; },
    update(zone, standing, dt) {
      const id = key(zone);
      if (!id) { opened = candidate = null; elapsed = 0; return null; }
      if (!standing) { candidate = null; elapsed = 0; return null; }
      if (candidate !== id) { candidate = id; elapsed = 0; }
      elapsed += Math.max(0, Math.min(.1, Number(dt) || 0));
      if (opened === id || elapsed < .25) return null;
      opened = id; return zone;
    },
  };
}
