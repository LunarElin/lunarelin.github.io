import { BALANCE } from './balance.mjs';

export const BOUNDS = Object.freeze({ minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 });

// All furniture stays outside the central walking lane. Decorations are visual,
// not collision obstacles; their centers sit along the edge of the 14 x 13 shop.
const layouts = [
  {
    theme: 'market', floorPattern: 'planks',
    floorColor: '#c7a77c', tileColor: '#dbc094', wallColor: '#c7ad7b', groundColor: '#bdcfb2', accentColor: '#d5aa59',
    stations: {
      forge: { x: -4, z: -2 }, counter: { x: -3, z: 2 },
      alchemy: { x: 3, z: -2 }, potionCounter: { x: 3, z: 2 },
      inn: { x: 0, z: -4 }, gate: { x: 0, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: 0, z: 2.8, width: 1.5, depth: 6.2, color: '#e8d8b9' },
      { type: 'circle', x: 0, z: -.5, radius: 1.1, color: '#c9af7f' },
    ],
    decorations: [
      { type: 'tree', x: -7.5, z: -3.5, scale: 1 }, { type: 'tree', x: 7.5, z: -3.5, scale: .85 },
      { type: 'tree', x: -7.5, z: 2.8, scale: .8 }, { type: 'tree', x: 7.5, z: 3.2, scale: 1.1 },
      { type: 'banner', x: -5.8, z: -5.5, scale: .8, color: '#b8705b' },
      { type: 'banner', x: 5.8, z: -5.5, scale: .8, color: '#7d65a7' },
      { type: 'rock', x: -6.6, z: 5.3, scale: .55 }, { type: 'well', x: 6.4, z: 4.8, scale: .7 },
    ],
  },
  {
    theme: 'autumn', floorPattern: 'crossroads',
    floorColor: '#875e43', tileColor: '#bd9463', wallColor: '#b57a54', groundColor: '#cead79', accentColor: '#f0a85b',
    stations: {
      forge: { x: 4, z: -2.4 }, counter: { x: 3.5, z: 2 },
      alchemy: { x: -3.5, z: -1.8 }, potionCounter: { x: -3.8, z: 2.4 },
      inn: { x: -.2, z: -4.2 }, gate: { x: -1.4, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: -1.4, z: 2.2, width: 1.5, depth: 7.3, color: '#e1b979' },
      { type: 'path', x: 0, z: -.1, width: 11.8, depth: .9, color: '#e1b979', rotation: -.08 },
      { type: 'circle', x: -1.4, z: -.1, radius: .9, color: '#af7850' },
    ],
    decorations: [
      { type: 'tree', x: -7.3, z: -3.2, scale: 1.2, color: '#c87443' },
      { type: 'tree', x: 7.3, z: -4.2, scale: 1, color: '#d79b47' },
      { type: 'tree', x: -7.2, z: 3.3, scale: .85, color: '#a95d47' },
      { type: 'tree', x: 7.4, z: 2.7, scale: 1.2, color: '#c18a3d' },
      { type: 'mushroom', x: -6.5, z: 5.4, scale: .8, color: '#b85e49' },
      { type: 'mushroom', x: 6.5, z: 4.8, scale: 1, color: '#e6af57' },
      { type: 'banner', x: -5.7, z: -5.4, scale: .9, color: '#a95b3c' },
      { type: 'well', x: 6.3, z: -.6, scale: .7 },
    ],
  },
  {
    theme: 'harbor', floorPattern: 'dock',
    floorColor: '#796756', tileColor: '#b89974', wallColor: '#8dada9', groundColor: '#79aeb8', accentColor: '#a0d5d1',
    stations: {
      forge: { x: -4.3, z: 1.1 }, counter: { x: -3, z: -2.3 },
      alchemy: { x: 4, z: 1.1 }, potionCounter: { x: 3, z: -2.3 },
      inn: { x: 0, z: -4.2 }, gate: { x: 1.6, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: 1.6, z: 2.1, width: 1.4, depth: 7.6, color: '#d6b58b' },
      { type: 'path', x: 0, z: -.6, width: 12.6, depth: .7, color: '#90765c' },
      { type: 'water', x: -7, z: .6, width: 1.25, depth: 12.7, color: '#6ba8b5' },
      { type: 'water', x: 7, z: .6, width: 1.25, depth: 12.7, color: '#6ba8b5' },
    ],
    decorations: [
      { type: 'pillar', x: -6.6, z: -4.8, scale: .7 }, { type: 'pillar', x: 6.6, z: -4.8, scale: .7 },
      { type: 'pillar', x: -6.6, z: 4.7, scale: .7 }, { type: 'pillar', x: 6.6, z: 4.7, scale: .7 },
      { type: 'banner', x: -5.9, z: -5.4, scale: .95, color: '#507f99' },
      { type: 'banner', x: 5.9, z: -5.4, scale: .95, color: '#507f99' },
      { type: 'rock', x: -7.5, z: 2, scale: .7 }, { type: 'rock', x: 7.5, z: -.8, scale: .9 },
    ],
  },
  {
    theme: 'mountain', floorPattern: 'cobbles',
    floorColor: '#6f7177', tileColor: '#aeb1b6', wallColor: '#949399', groundColor: '#a4b4be', accentColor: '#d6dcec',
    stations: {
      forge: { x: -4.4, z: -3.1 }, counter: { x: -4, z: 1 },
      alchemy: { x: 3.7, z: -.8 }, potionCounter: { x: 3.6, z: 3.1 },
      inn: { x: .2, z: -4.2 }, gate: { x: -2, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: -1.7, z: 2, width: 1.5, depth: 7.3, rotation: -.15, color: '#c9c8bd' },
      { type: 'path', x: 1.4, z: -.6, width: 6.6, depth: .9, rotation: .35, color: '#c9c8bd' },
      { type: 'circle', x: -1.2, z: -.8, radius: 1.25, color: '#8f939e' },
    ],
    decorations: [
      { type: 'rock', x: -7.4, z: -3.5, scale: 1.6 }, { type: 'rock', x: 7.4, z: -3.5, scale: 1.8 },
      { type: 'rock', x: -7.2, z: 2.3, scale: 1.15 }, { type: 'rock', x: 7.3, z: 3.2, scale: 1.3 },
      { type: 'ruin', x: -5.8, z: -5.4, scale: 1.05, rotation: .2 },
      { type: 'ruin', x: 5.9, z: -5.4, scale: .85, rotation: -.2 },
      { type: 'crystal', x: 6.5, z: .2, scale: .7, color: '#c5d5e9' },
      { type: 'crystal', x: -6.5, z: 4.9, scale: .6, color: '#aebedc' },
    ],
  },
  {
    theme: 'meadow', floorPattern: 'garden',
    floorColor: '#799675', tileColor: '#b5c69b', wallColor: '#c3c99b', groundColor: '#b2d1a5', accentColor: '#e3d58a',
    stations: {
      forge: { x: 3.9, z: -3.2 }, counter: { x: 4.2, z: .9 },
      alchemy: { x: -4, z: -2 }, potionCounter: { x: -3.7, z: 2.6 },
      inn: { x: 0, z: -4 }, gate: { x: .4, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: .4, z: 2.1, width: 1.6, depth: 7.5, color: '#e3d9ae' },
      { type: 'circle', x: .3, z: -.1, radius: 1.65, color: '#7fa57b' },
      { type: 'circle', x: .3, z: -.1, radius: .9, color: '#cdd69d' },
    ],
    decorations: [
      { type: 'tree', x: -7.4, z: -3.6, scale: 1.1, color: '#82ac72' },
      { type: 'tree', x: 7.5, z: -3.4, scale: 1.25, color: '#a2bc78' },
      { type: 'tree', x: -7.3, z: 2.5, scale: .9, color: '#94b97d' },
      { type: 'well', x: 6.4, z: 4.7, scale: .85 },
      { type: 'mushroom', x: -6.5, z: 5.1, scale: .75, color: '#f1cf87' },
      { type: 'mushroom', x: 6.6, z: 2.5, scale: .65, color: '#dfb0b3' },
      { type: 'banner', x: -5.6, z: -5.4, scale: .85, color: '#a8ba7b' },
      { type: 'banner', x: 5.6, z: -5.4, scale: .85, color: '#e2ce82' },
    ],
  },
  {
    theme: 'frost', floorPattern: 'frost-runes',
    floorColor: '#778e9c', tileColor: '#d2e2e3', wallColor: '#a8c2cc', groundColor: '#c5dde5', accentColor: '#b3eeef',
    stations: {
      forge: { x: -3.8, z: -3.7 }, counter: { x: -3.8, z: 1.5 },
      alchemy: { x: 4.2, z: -1.2 }, potionCounter: { x: 3.5, z: 2.8 },
      inn: { x: -.4, z: -4.1 }, gate: { x: -2.3, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: -1.5, z: 2, width: 1.4, depth: 7.5, rotation: -.2, color: '#e7eeeb' },
      { type: 'path', x: 0, z: -.2, width: 10.7, depth: .45, color: '#98c7d1' },
      { type: 'circle', x: 0, z: -.2, radius: 1.3, color: '#b3d5df' },
    ],
    decorations: [
      { type: 'pillar', x: -6.5, z: -5.1, scale: 1.1, color: '#c2d9e0' },
      { type: 'pillar', x: 6.5, z: -5.1, scale: 1.1, color: '#c2d9e0' },
      { type: 'crystal', x: -7.1, z: -2, scale: 1.15, color: '#a4e3e8' },
      { type: 'crystal', x: 7.1, z: -2.5, scale: 1.35, color: '#bce7ed' },
      { type: 'crystal', x: -6.5, z: 4.8, scale: .8, color: '#a4d4e8' },
      { type: 'crystal', x: 6.5, z: 4.8, scale: .9, color: '#d1f4ed' },
      { type: 'rock', x: -7.3, z: 1.3, scale: 1, color: '#d9e5e7' },
      { type: 'banner', x: 5.4, z: -5.5, scale: .9, color: '#81a9c2' },
    ],
  },
  {
    theme: 'moonforest', floorPattern: 'moon-circle',
    floorColor: '#595874', tileColor: '#9c9bb4', wallColor: '#82728f', groundColor: '#929fba', accentColor: '#d1c0f4',
    stations: {
      forge: { x: 4.2, z: 1.1 }, counter: { x: 2.8, z: -2.3 },
      alchemy: { x: -4, z: 1.8 }, potionCounter: { x: -3.7, z: -1.8 },
      inn: { x: 0, z: -4.1 }, gate: { x: 2.2, z: 6 },
    },
    floorFeatures: [
      { type: 'circle', x: 0, z: .1, radius: 2.15, color: '#6d6c8c' },
      { type: 'circle', x: 0, z: .1, radius: 1.6, color: '#b3abc6' },
      { type: 'circle', x: 0, z: .1, radius: 1.3, color: '#777596' },
      { type: 'path', x: 1.4, z: 3.6, width: 1.2, depth: 4.3, rotation: .22, color: '#b1a6bb' },
    ],
    decorations: [
      { type: 'tree', x: -7.4, z: -3.5, scale: 1.25, color: '#65628a' },
      { type: 'tree', x: 7.3, z: -3.8, scale: 1.05, color: '#77749c' },
      { type: 'tree', x: -7.3, z: 2.9, scale: .95, color: '#4f7182' },
      { type: 'mushroom', x: -6.5, z: 5.1, scale: 1.05, color: '#b7a3df' },
      { type: 'mushroom', x: 6.5, z: 4.6, scale: 1.2, color: '#8bc6cb' },
      { type: 'mushroom', x: 6.5, z: -.4, scale: .8, color: '#d5b3e1' },
      { type: 'crystal', x: -5.6, z: -5.5, scale: .7, color: '#d3c7ee' },
      { type: 'ruin', x: 5.7, z: -5.4, scale: .8, rotation: -.25 },
    ],
  },
  {
    theme: 'desert', floorPattern: 'sandstone',
    floorColor: '#a76f4d', tileColor: '#dbb884', wallColor: '#c58e66', groundColor: '#dcb77f', accentColor: '#f5d493',
    stations: {
      forge: { x: -4.4, z: -1 }, counter: { x: -3.8, z: 3 },
      alchemy: { x: 4.1, z: -3 }, potionCounter: { x: 4.2, z: .9 },
      inn: { x: -.8, z: -4.2 }, gate: { x: -1.5, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: -1.5, z: 2, width: 1.6, depth: 7.5, color: '#edd3a3' },
      { type: 'path', x: 1.5, z: -1, width: 5.2, depth: .65, rotation: .55, color: '#c68f64' },
      { type: 'circle', x: -1.3, z: -.8, radius: 1.2, color: '#c58c5f' },
    ],
    decorations: [
      { type: 'ruin', x: -6.4, z: -5.2, scale: 1.1, rotation: .2, color: '#d4aa73' },
      { type: 'ruin', x: 6.4, z: -5.2, scale: 1.3, rotation: -.1, color: '#c29564' },
      { type: 'pillar', x: -6.5, z: 3.7, scale: .75, color: '#dcb782' },
      { type: 'pillar', x: 6.5, z: 3.8, scale: .85, color: '#dcb782' },
      { type: 'rock', x: -7.4, z: -.9, scale: 1.2, color: '#b77c58' },
      { type: 'rock', x: 7.3, z: .2, scale: .95, color: '#c18c60' },
      { type: 'well', x: 6.3, z: -1, scale: .8, color: '#c49b6d' },
      { type: 'banner', x: -5.8, z: 5.1, scale: .9, color: '#b75f4c' },
    ],
  },
  {
    theme: 'crystal', floorPattern: 'crystal-veins',
    floorColor: '#667a8c', tileColor: '#adc9cd', wallColor: '#86a4b4', groundColor: '#9bc1cd', accentColor: '#b1f0e7',
    stations: {
      forge: { x: -4.2, z: -3.3 }, counter: { x: -4.1, z: .9 },
      alchemy: { x: 4.2, z: -3.2 }, potionCounter: { x: 3.3, z: 2.4 },
      inn: { x: .2, z: -3.8 }, gate: { x: 1.7, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: .8, z: 2, width: 1.35, depth: 7.6, rotation: .18, color: '#d0e8e3' },
      { type: 'path', x: -.7, z: -.8, width: 9.8, depth: .25, rotation: -.25, color: '#8de1dc' },
      { type: 'path', x: -.5, z: -.4, width: 7.2, depth: .22, rotation: .3, color: '#b2c7ee' },
    ],
    decorations: [
      { type: 'crystal', x: -7.3, z: -3.9, scale: 1.45, color: '#84cbd8' },
      { type: 'crystal', x: 7.3, z: -3.7, scale: 1.65, color: '#b5b9e7' },
      { type: 'crystal', x: -6.5, z: 3.8, scale: 1.1, color: '#9ce6db' },
      { type: 'crystal', x: 6.5, z: 4.1, scale: 1.15, color: '#b5d8f0' },
      { type: 'crystal', x: -6.5, z: -.7, scale: .7, color: '#d0bcf0' },
      { type: 'rock', x: 7.4, z: 1.4, scale: 1.2, color: '#6a849b' },
      { type: 'ruin', x: -5.5, z: -5.4, scale: .85, color: '#9fb8c8' },
      { type: 'ruin', x: 5.6, z: -5.4, scale: 1, color: '#9fb8c8' },
    ],
  },
  {
    theme: 'capital', floorPattern: 'royal-grid',
    floorColor: '#8b7892', tileColor: '#ece3cc', wallColor: '#d0bcc6', groundColor: '#bdc1d0', accentColor: '#e6bf6b',
    stations: {
      forge: { x: -4.3, z: 1.5 }, counter: { x: -2.7, z: -2.2 },
      alchemy: { x: 4.3, z: 1.4 }, potionCounter: { x: 2.7, z: -2.2 },
      inn: { x: 0, z: -4.3 }, gate: { x: 0, z: 6 },
    },
    floorFeatures: [
      { type: 'path', x: 0, z: 1.7, width: 2, depth: 8.2, color: '#bc8ca8' },
      { type: 'path', x: 0, z: -.4, width: 11.7, depth: 1.2, color: '#d7c3a3' },
      { type: 'circle', x: 0, z: -.4, radius: 1.3, color: '#e5c783' },
      { type: 'circle', x: 0, z: -.4, radius: .95, color: '#af91b5' },
    ],
    decorations: [
      { type: 'pillar', x: -6.5, z: -5.2, scale: 1.2, color: '#dfd0bf' },
      { type: 'pillar', x: 6.5, z: -5.2, scale: 1.2, color: '#dfd0bf' },
      { type: 'pillar', x: -6.5, z: 4.7, scale: 1, color: '#dfd0bf' },
      { type: 'pillar', x: 6.5, z: 4.7, scale: 1, color: '#dfd0bf' },
      { type: 'banner', x: -5.6, z: -5.4, scale: 1.2, color: '#8c538c' },
      { type: 'banner', x: 5.6, z: -5.4, scale: 1.2, color: '#8c538c' },
      { type: 'well', x: -6.5, z: -.2, scale: .9, color: '#d7c4a4' },
      { type: 'crystal', x: 6.5, z: -.2, scale: .8, color: '#e8d6a2' },
    ],
  },
];

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

const stages = BALANCE.stages.filter((stage) => !stage.event).slice(0, 10);

export const REGIONS = freeze(layouts.map((layout, index) => ({
  id: stages[index].id,
  index,
  name: stages[index].name,
  sourceStageId: stages[index].stageId,
  bounds: BOUNDS,
  dimensions: { width: 14, depth: 13 },
  spawn: { x: layout.stations.gate.x, z: 4.7 },
  ...layout,
})));

/** Stage numbers are one based; the ten regions repeat after stage ten. */
export function getRegion(stageOrState = 1) {
  const raw = stageOrState && typeof stageOrState === 'object' ? stageOrState.stage : stageOrState;
  const parsed = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
  const stage = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
  return REGIONS[(stage - 1) % REGIONS.length];
}

export function getStations(stageOrState = 1) {
  return getRegion(stageOrState).stations;
}

export const STATIONS = REGIONS[0].stations;
export const legacySTATIONS = STATIONS;
