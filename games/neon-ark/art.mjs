import { COLORS } from './rules.mjs';

// Project-authored shuttle SVG with local Kenney CC0 engines; asset sources are in assets/kenney/CREDITS.md.
export const FLEETS = [
  { name: 'cyan', engine: 'assets/kenney/engine-blue.png' },
  { name: 'pink', engine: 'assets/kenney/engine-blue.png' },
  { name: 'lime', engine: 'assets/kenney/engine-blue.png' },
  { name: 'orange', engine: 'assets/kenney/engine-gold.png' },
];
export const SCENE_ART = { planetCyan: 'assets/kenney/planet-cyan.png', planetPurple: 'assets/kenney/planet-purple.png' };
export const UPGRADE_ART = { dock: 'assets/kenney/upgrade-dock.png', scan: 'assets/kenney/upgrade-pierce.png', recall: 'assets/kenney/upgrade-coil.png', armor: 'assets/kenney/upgrade-armor.png' };
export function fleetFor(color) { return FLEETS[Math.max(0, COLORS.findIndex(c => c.hex === color))]; }
export function shipArt(color, loaded = 0) {
  const fleet = fleetFor(color);
  const paint = COLORS[FLEETS.indexOf(fleet)].hex;
  const occupied = Math.max(0, Math.min(3, Number.isFinite(loaded) ? Math.trunc(loaded) : 0));
  const seats = [0, 1, 2].map(index => {
    const y = 28 + index * 18, filled = index < occupied;
    return `<g class="shuttle-seat${filled ? ' filled' : ''}" data-seat="${index}"><rect x="25" y="${y}" width="30" height="14" rx="5" fill="${filled ? '#ddfaff' : '#0a2339'}" stroke="#061626" stroke-width="2"/>${filled ? `<path d="M31 ${y + 13}v-3a9 9 0 0 1 18 0v3" fill="${paint}" stroke="#133a50" stroke-width="1.5"/><circle cx="40" cy="${y + 5}" r="5" fill="#f0ffff" stroke="#244356" stroke-width="1.2"/><path d="M36.5 ${y + 5}h7" stroke="#123047" stroke-width="3" stroke-linecap="round"/>` : `<path d="M31 ${y + 9}h18" stroke="#496b80" stroke-width="3" stroke-linecap="round"/>`}</g>`;
  }).join('');
  return `<span class="ship-art shuttle-art fleet-${fleet.name}" data-loaded="${occupied}" aria-hidden="true"><span class="engine-aura"></span><img class="engine-flame" src="${fleet.engine}" width="14" height="31" alt="" draggable="false" decoding="async"><svg class="shuttle-body" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" width="80" height="100" focusable="false"><path d="M18 43 7 52v25l14 8h38l14-8V52L62 43Z" fill="${paint}" stroke="#061626" stroke-width="3" stroke-linejoin="round"/><path d="M8 60h10v17L8 73Zm54 0h10v13l-10 4Z" fill="#102d43"/><path d="M30 78h20v16H30Z" fill="#102b3e" stroke="#061626" stroke-width="3"/><path d="M40 5C25 5 17 17 17 31v45c0 10 9 16 23 16s23-6 23-16V31C63 17 55 5 40 5Z" fill="#061626"/><path d="M40 3C26 3 19 15 19 29v44c0 10 8 15 21 15s21-5 21-15V29C61 15 54 3 40 3Z" fill="${paint}" stroke="#061626" stroke-width="2"/><path d="M40 6C29 6 22 17 22 29v43c0 6 3 9 8 11V28c0-11 4-18 10-22Z" fill="#ffffff" opacity=".42"/><path d="M56 22v50c0 7-5 11-15 12v4c13 0 20-5 20-15V29c0-7-2-13-5-18Z" fill="#071d32" opacity=".3"/><path d="m40 10-8 12h16Z" fill="#f3ffff" stroke="#19445c" stroke-width="1.5" stroke-linejoin="round"/>${seats}<path d="M25 81h30" stroke="#061626" stroke-width="3" stroke-linecap="round"/><path d="M29 85h22" stroke="#ecffff" stroke-width="2" stroke-linecap="round" opacity=".7"/></svg></span>`;
}
export function directionArt() {
  return '<svg class="direction-glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><path d="M16 3 29 16h-8v13H11V16H3Z" fill="#ffffff" stroke="#062039" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"/></svg>';
}
export function upgradeArt(key) { return `<img class="upgrade-icon" src="${UPGRADE_ART[key]}" width="32" height="32" alt="" draggable="false" decoding="async">`; }
