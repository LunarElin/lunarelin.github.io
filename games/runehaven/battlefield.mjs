import { getRegion } from './maps.mjs';

// Battles use their own courtyard coordinates, independent of shop expansion.
export const BATTLE_BOUNDS = Object.freeze({ minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 });
const layouts = new Map();

export function getBattleLayout(state) {
  const region = getRegion(state);
  if (layouts.has(region.id)) return layouts.get(region.id);
  const layout = Object.freeze({
    id: `courtyard-${region.id}`,
    bounds: BATTLE_BOUNDS,
    gate: Object.freeze({ x: 0, z: 6 }),
    shop: Object.freeze({ x: 0, z: -3.8 }),
    player: Object.freeze({ x: 0, z: -3.4 }),
    doorway: Object.freeze({ x: 0, z: -4.6 }),
    backdrop: Object.freeze({ x: 0, z: -5.7, top: 3.5 }),
    dimensions: Object.freeze({ width: 14.5, depth: 14.5 }),
    background: region.groundColor,
    palette: Object.freeze({
      grass: region.groundColor, dirt: '#b5946c', stone: '#b3b6a4', stoneDark: '#747e77',
      plaster: region.wallColor, timber: '#785740', timberDark: '#49372e', roof: region.accentColor,
      leaves: '#6c9263', leavesDark: '#4f7654', sign: '#5e476e', gold: '#e7c071', window: '#e4bc75',
    }),
  });
  layouts.set(region.id, layout);
  return layout;
}
