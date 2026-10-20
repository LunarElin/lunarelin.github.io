import { COLORS } from './rules.mjs';

// Local Kenney CC0 sprites; source paths, size optimizations and licenses are in assets/kenney/CREDITS.md.
export const FLEETS = [
  { name: 'cyan', hull: 'assets/kenney/ship-cyan.png', engine: 'assets/kenney/engine-blue.png', width: 112 },
  { name: 'pink', hull: 'assets/kenney/ship-pink.png', engine: 'assets/kenney/engine-blue.png', width: 99 },
  { name: 'lime', hull: 'assets/kenney/ship-lime.png', engine: 'assets/kenney/engine-blue.png', width: 98 },
  { name: 'orange', hull: 'assets/kenney/ship-orange.png', engine: 'assets/kenney/engine-gold.png', width: 112 },
];
export const SCENE_ART = { planetCyan: 'assets/kenney/planet-cyan.png', planetPurple: 'assets/kenney/planet-purple.png' };
export const UPGRADE_ART = { dock: 'assets/kenney/upgrade-dock.png', scan: 'assets/kenney/upgrade-pierce.png', recall: 'assets/kenney/upgrade-coil.png', armor: 'assets/kenney/upgrade-armor.png' };
export function fleetFor(color) { return FLEETS[Math.max(0, COLORS.findIndex(c => c.hex === color))]; }
export function shipArt(color) {
  const fleet = fleetFor(color);
  return `<span class="ship-art fleet-${fleet.name}" aria-hidden="true"><span class="engine-aura"></span><img class="engine-flame" src="${fleet.engine}" width="14" height="31" alt="" draggable="false" decoding="async"><img class="ship-sprite" src="${fleet.hull}" width="${fleet.width}" height="75" alt="" draggable="false" decoding="async"></span>`;
}
export function upgradeArt(key) { return `<img class="upgrade-icon" src="${UPGRADE_ART[key]}" width="32" height="32" alt="" draggable="false" decoding="async">`; }
