import { getStations } from './maps.mjs';
import { CARRY_SPACING } from './cargo-layout.mjs';

// Source counter's storage surface is left of its register, not at the model
// center. These slots are shared by static stock and both flight endpoints.
export const STOCK_LAYOUT = Object.freeze({
  forge: Object.freeze({ product: 'gear', x: .72, y: .802, z: .12, scale: .85, columns: 2, depth: 1, pitchX: .6, pitchZ: .6 }),
  counter: Object.freeze({ product: 'gear', x: -.78, y: .568, z: 0, scale: .72, columns: 2, depth: 2, pitchX: .6, pitchZ: .6 }),
  alchemy: Object.freeze({ product: 'potion', x: .515, y: .779, z: 0, scale: .85, columns: 2, depth: 2, pitchX: .31, pitchZ: .31 }),
  potionCounter: Object.freeze({ product: 'potion', x: -.68, y: .568, z: 0, scale: .85, columns: 2, depth: 2, pitchX: .31, pitchZ: .31 }),
});

export function getStockItemPoint(state, key, index = 0) {
  const layout = STOCK_LAYOUT[key], station = getStations(state)[key];
  index = Math.max(0, Math.trunc(index));
  return {
    x: station.x + layout.x + (index % layout.columns - (layout.columns - 1) / 2) * layout.pitchX * layout.scale,
    y: layout.y + Math.floor(index / (layout.columns * layout.depth)) * CARRY_SPACING[layout.product] * layout.scale,
    z: station.z + layout.z + (Math.floor(index / layout.columns) % layout.depth - (layout.depth - 1) / 2) * layout.pitchZ * layout.scale,
  };
}
