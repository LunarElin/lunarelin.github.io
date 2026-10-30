import { getRegion } from './maps.mjs';

// Battles use their own courtyard coordinates, independent of shop expansion.
export const BATTLE_BOUNDS = Object.freeze({ minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 });
const layouts = new Map();
function pastel(source, target, amount = .75) {
  return `#${[1, 3, 5].map(start => Math.round(parseInt(source.slice(start, start + 2), 16) * (1 - amount)
    + parseInt(target.slice(start, start + 2), 16) * amount).toString(16).padStart(2, '0')).join('')}`;
}

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
    background: pastel(region.groundColor, '#e3f0e7', .8),
    palette: Object.freeze({
      grass: pastel(region.groundColor, '#d4e9dc'), dirt: '#f5d8df', stone: '#d4c6df', stoneDark: '#a69bb5',
      plaster: pastel(region.wallColor, '#fff0e8', .8), timber: '#b68bb4', timberDark: '#846188', roof: pastel(region.accentColor, '#dba9d0'),
      leaves: '#acd7be', leavesDark: '#83b99b', sign: '#a17cad', gold: '#f3dba1', window: '#b3dfe4',
    }),
  });
  layouts.set(region.id, layout);
  return layout;
}
