import { BALANCE } from './balance.mjs';

export const BOUNDS = Object.freeze({ minX: -11, maxX: 11, minZ: -10.8, maxZ: 11 });

// A 24 x 24 room keeps the original furniture/body sizes while opening wider
// aisles. Static furniture blocks movement; customers do not block one another.
const layouts = [
  {
    theme: 'market', floorPattern: 'planks',
    floorColor: '#c7a77c', tileColor: '#dbc094', wallColor: '#c7ad7b', groundColor: '#bdcfb2', accentColor: '#d5aa59',
    stations: {
      forge: { x: -5.95, z: -3.7 }, counter: { x: -6.05, z: 2.1 },
      alchemy: { x: 6.15, z: -3.35 }, potionCounter: { x: 6.2, z: 2.4 },
      inn: { x: 0, z: -6.1 }, gate: { x: 0, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: 0, z: 3.92, width: 1.95, depth: 8.68, color: '#e8d8b9' },
      { type: 'circle', x: 0, z: -0.7, radius: 1.43, color: '#c9af7f' },
    ],
    decorations: [
      { type: 'tree', x: -9.75, z: -4.9, scale: 1 }, { type: 'tree', x: 9.75, z: -4.9, scale: .85 },
      { type: 'tree', x: -9.75, z: 3.92, scale: .8 }, { type: 'tree', x: 9.75, z: 4.48, scale: 1.1 },
      { type: 'banner', x: -7.54, z: -7.7, scale: .8, color: '#b8705b' },
      { type: 'banner', x: 7.54, z: -7.7, scale: .8, color: '#7d65a7' },
      { type: 'rock', x: -8.58, z: 7.42, scale: .55 }, { type: 'well', x: 8.32, z: 6.72, scale: .7 },
    ],
  },
  {
    theme: 'autumn', floorPattern: 'crossroads',
    floorColor: '#875e43', tileColor: '#bd9463', wallColor: '#b57a54', groundColor: '#cead79', accentColor: '#f0a85b',
    stations: {
      forge: { x: 6.1, z: -3.4 }, counter: { x: 6.2, z: 2.4 },
      alchemy: { x: -6.3, z: -3.1 }, potionCounter: { x: -5.9, z: 2.7 },
      inn: { x: -0.2, z: -6 }, gate: { x: -1.4, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: -1.82, z: 3.08, width: 1.95, depth: 10.22, color: '#e1b979' },
      { type: 'path', x: 0, z: -0.14, width: 15.34, depth: 1.26, color: '#e1b979', rotation: -.08 },
      { type: 'circle', x: -1.82, z: -0.14, radius: 1.17, color: '#af7850' },
    ],
    decorations: [
      { type: 'tree', x: -9.49, z: -4.48, scale: 1.2, color: '#c87443' },
      { type: 'tree', x: 9.49, z: -5.88, scale: 1, color: '#d79b47' },
      { type: 'tree', x: -9.36, z: 4.62, scale: .85, color: '#a95d47' },
      { type: 'tree', x: 9.62, z: 3.78, scale: 1.2, color: '#c18a3d' },
      { type: 'mushroom', x: -8.45, z: 7.56, scale: .8, color: '#b85e49' },
      { type: 'mushroom', x: 8.45, z: 6.72, scale: 1, color: '#e6af57' },
      { type: 'banner', x: -7.41, z: -7.56, scale: .9, color: '#a95b3c' },
      { type: 'well', x: 8.19, z: -0.84, scale: .7 },
    ],
  },
  {
    theme: 'harbor', floorPattern: 'dock',
    floorColor: '#796756', tileColor: '#b89974', wallColor: '#8dada9', groundColor: '#79aeb8', accentColor: '#a0d5d1',
    stations: {
      forge: { x: -6.25, z: -3.1 }, counter: { x: -5.9, z: 2.7 },
      alchemy: { x: 6, z: -3.6 }, potionCounter: { x: 6.05, z: 2.1 },
      inn: { x: 0, z: -5.9 }, gate: { x: 1.6, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: 2.08, z: 2.94, width: 1.82, depth: 10.64, color: '#d6b58b' },
      { type: 'path', x: 0, z: -0.84, width: 16.38, depth: 0.98, color: '#90765c' },
      { type: 'water', x: -9.1, z: 0.84, width: 1.625, depth: 17.78, color: '#6ba8b5' },
      { type: 'water', x: 9.1, z: 0.84, width: 1.625, depth: 17.78, color: '#6ba8b5' },
    ],
    decorations: [
      { type: 'pillar', x: -8.58, z: -6.72, scale: .7 }, { type: 'pillar', x: 8.58, z: -6.72, scale: .7 },
      { type: 'pillar', x: -8.58, z: 6.58, scale: .7 }, { type: 'pillar', x: 8.58, z: 6.58, scale: .7 },
      { type: 'banner', x: -7.67, z: -7.56, scale: .95, color: '#507f99' },
      { type: 'banner', x: 7.67, z: -7.56, scale: .95, color: '#507f99' },
      { type: 'rock', x: -9.75, z: 2.8, scale: .7 }, { type: 'rock', x: 9.75, z: -1.12, scale: .9 },
    ],
  },
  {
    theme: 'mountain', floorPattern: 'cobbles',
    floorColor: '#6f7177', tileColor: '#aeb1b6', wallColor: '#949399', groundColor: '#a4b4be', accentColor: '#d6dcec',
    stations: {
      forge: { x: -5.95, z: -3.7 }, counter: { x: -6.05, z: 2.1 },
      alchemy: { x: 6.15, z: -3.35 }, potionCounter: { x: 6.2, z: 2.4 },
      inn: { x: 0.2, z: -6.1 }, gate: { x: -2, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: -2.21, z: 2.8, width: 1.95, depth: 10.22, rotation: -.15, color: '#c9c8bd' },
      { type: 'path', x: 1.82, z: -0.84, width: 8.58, depth: 1.26, rotation: .35, color: '#c9c8bd' },
      { type: 'circle', x: -1.56, z: -1.12, radius: 1.625, color: '#8f939e' },
    ],
    decorations: [
      { type: 'rock', x: -9.62, z: -4.9, scale: 1.6 }, { type: 'rock', x: 9.62, z: -4.9, scale: 1.8 },
      { type: 'rock', x: -9.36, z: 3.22, scale: 1.15 }, { type: 'rock', x: 9.49, z: 4.48, scale: 1.3 },
      { type: 'ruin', x: -7.54, z: -7.56, scale: 1.05, rotation: .2 },
      { type: 'ruin', x: 7.67, z: -7.56, scale: .85, rotation: -.2 },
      { type: 'crystal', x: 8.45, z: 0.28, scale: .7, color: '#c5d5e9' },
      { type: 'crystal', x: -8.45, z: 6.86, scale: .6, color: '#aebedc' },
    ],
  },
  {
    theme: 'meadow', floorPattern: 'garden',
    floorColor: '#799675', tileColor: '#b5c69b', wallColor: '#c3c99b', groundColor: '#b2d1a5', accentColor: '#e3d58a',
    stations: {
      forge: { x: 6.1, z: -3.4 }, counter: { x: 6.2, z: 2.4 },
      alchemy: { x: -6.3, z: -3.1 }, potionCounter: { x: -5.9, z: 2.7 },
      inn: { x: 0, z: -6 }, gate: { x: 0.4, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: 0.52, z: 2.94, width: 2.08, depth: 10.5, color: '#e3d9ae' },
      { type: 'circle', x: 0.39, z: -0.14, radius: 2.145, color: '#7fa57b' },
      { type: 'circle', x: 0.39, z: -0.14, radius: 1.17, color: '#cdd69d' },
    ],
    decorations: [
      { type: 'tree', x: -9.62, z: -5.04, scale: 1.1, color: '#82ac72' },
      { type: 'tree', x: 9.75, z: -4.76, scale: 1.25, color: '#a2bc78' },
      { type: 'tree', x: -9.49, z: 3.5, scale: .9, color: '#94b97d' },
      { type: 'well', x: 8.32, z: 6.58, scale: .85 },
      { type: 'mushroom', x: -8.45, z: 7.14, scale: .75, color: '#f1cf87' },
      { type: 'mushroom', x: 8.58, z: 3.5, scale: .65, color: '#dfb0b3' },
      { type: 'banner', x: -7.28, z: -7.56, scale: .85, color: '#a8ba7b' },
      { type: 'banner', x: 7.28, z: -7.56, scale: .85, color: '#e2ce82' },
    ],
  },
  {
    theme: 'frost', floorPattern: 'frost-runes',
    floorColor: '#778e9c', tileColor: '#d2e2e3', wallColor: '#a8c2cc', groundColor: '#c5dde5', accentColor: '#b3eeef',
    stations: {
      forge: { x: -6.25, z: -3.1 }, counter: { x: -5.9, z: 2.7 },
      alchemy: { x: 6, z: -3.6 }, potionCounter: { x: 6.05, z: 2.1 },
      inn: { x: -0.4, z: -5.9 }, gate: { x: -2.3, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: -1.95, z: 2.8, width: 1.82, depth: 10.5, rotation: -.2, color: '#e7eeeb' },
      { type: 'path', x: 0, z: -0.28, width: 13.91, depth: 0.63, color: '#98c7d1' },
      { type: 'circle', x: 0, z: -0.28, radius: 1.69, color: '#b3d5df' },
    ],
    decorations: [
      { type: 'pillar', x: -8.45, z: -7.14, scale: 1.1, color: '#c2d9e0' },
      { type: 'pillar', x: 8.45, z: -7.14, scale: 1.1, color: '#c2d9e0' },
      { type: 'crystal', x: -9.23, z: -2.8, scale: 1.15, color: '#a4e3e8' },
      { type: 'crystal', x: 9.23, z: -3.5, scale: 1.35, color: '#bce7ed' },
      { type: 'crystal', x: -8.45, z: 6.72, scale: .8, color: '#a4d4e8' },
      { type: 'crystal', x: 8.45, z: 6.72, scale: .9, color: '#d1f4ed' },
      { type: 'rock', x: -9.49, z: 1.82, scale: 1, color: '#d9e5e7' },
      { type: 'banner', x: 7.02, z: -7.7, scale: .9, color: '#81a9c2' },
    ],
  },
  {
    theme: 'moonforest', floorPattern: 'moon-circle',
    floorColor: '#595874', tileColor: '#9c9bb4', wallColor: '#82728f', groundColor: '#929fba', accentColor: '#d1c0f4',
    stations: {
      forge: { x: 5.95, z: -3.7 }, counter: { x: 6.05, z: 2.1 },
      alchemy: { x: -6.15, z: -3.35 }, potionCounter: { x: -6.2, z: 2.4 },
      inn: { x: 0, z: -6.1 }, gate: { x: 2.2, z: 8 },
    },
    floorFeatures: [
      { type: 'circle', x: 0, z: 0.14, radius: 2.795, color: '#6d6c8c' },
      { type: 'circle', x: 0, z: 0.14, radius: 2.08, color: '#b3abc6' },
      { type: 'circle', x: 0, z: 0.14, radius: 1.69, color: '#777596' },
      { type: 'path', x: 1.82, z: 5.04, width: 1.56, depth: 6.02, rotation: .22, color: '#b1a6bb' },
    ],
    decorations: [
      { type: 'tree', x: -9.62, z: -4.9, scale: 1.25, color: '#65628a' },
      { type: 'tree', x: 9.49, z: -5.32, scale: 1.05, color: '#77749c' },
      { type: 'tree', x: -9.49, z: 4.06, scale: .95, color: '#4f7182' },
      { type: 'mushroom', x: -8.45, z: 7.14, scale: 1.05, color: '#b7a3df' },
      { type: 'mushroom', x: 8.45, z: 6.44, scale: 1.2, color: '#8bc6cb' },
      { type: 'mushroom', x: 8.45, z: -0.56, scale: .8, color: '#d5b3e1' },
      { type: 'crystal', x: -7.28, z: -7.7, scale: .7, color: '#d3c7ee' },
      { type: 'ruin', x: 7.41, z: -7.56, scale: .8, rotation: -.25 },
    ],
  },
  {
    theme: 'desert', floorPattern: 'sandstone',
    floorColor: '#a76f4d', tileColor: '#dbb884', wallColor: '#c58e66', groundColor: '#dcb77f', accentColor: '#f5d493',
    stations: {
      forge: { x: -6.1, z: -3.4 }, counter: { x: -6.2, z: 2.4 },
      alchemy: { x: 6.3, z: -3.1 }, potionCounter: { x: 5.9, z: 2.7 },
      inn: { x: -0.8, z: -6 }, gate: { x: -1.5, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: -1.95, z: 2.8, width: 2.08, depth: 10.5, color: '#edd3a3' },
      { type: 'path', x: 1.95, z: -1.4, width: 6.76, depth: 0.91, rotation: .55, color: '#c68f64' },
      { type: 'circle', x: -1.69, z: -1.12, radius: 1.56, color: '#c58c5f' },
    ],
    decorations: [
      { type: 'ruin', x: -8.32, z: -7.28, scale: 1.1, rotation: .2, color: '#d4aa73' },
      { type: 'ruin', x: 8.32, z: -7.28, scale: 1.3, rotation: -.1, color: '#c29564' },
      { type: 'pillar', x: -8.45, z: 5.18, scale: .75, color: '#dcb782' },
      { type: 'pillar', x: 8.45, z: 5.32, scale: .85, color: '#dcb782' },
      { type: 'rock', x: -9.62, z: -1.26, scale: 1.2, color: '#b77c58' },
      { type: 'rock', x: 9.49, z: 0.28, scale: .95, color: '#c18c60' },
      { type: 'well', x: 8.19, z: -1.4, scale: .8, color: '#c49b6d' },
      { type: 'banner', x: -7.54, z: 7.14, scale: .9, color: '#b75f4c' },
    ],
  },
  {
    theme: 'crystal', floorPattern: 'crystal-veins',
    floorColor: '#667a8c', tileColor: '#adc9cd', wallColor: '#86a4b4', groundColor: '#9bc1cd', accentColor: '#b1f0e7',
    stations: {
      forge: { x: -6.25, z: -3.1 }, counter: { x: -5.9, z: 2.7 },
      alchemy: { x: 6, z: -3.6 }, potionCounter: { x: 6.05, z: 2.1 },
      inn: { x: 0.2, z: -5.9 }, gate: { x: 1.7, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: 1.04, z: 2.8, width: 1.755, depth: 10.64, rotation: .18, color: '#d0e8e3' },
      { type: 'path', x: -0.91, z: -1.12, width: 12.74, depth: 0.35, rotation: -.25, color: '#8de1dc' },
      { type: 'path', x: -0.65, z: -0.56, width: 9.36, depth: 0.308, rotation: .3, color: '#b2c7ee' },
    ],
    decorations: [
      { type: 'crystal', x: -9.49, z: -5.46, scale: 1.45, color: '#84cbd8' },
      { type: 'crystal', x: 9.49, z: -5.18, scale: 1.65, color: '#b5b9e7' },
      { type: 'crystal', x: -8.45, z: 5.32, scale: 1.1, color: '#9ce6db' },
      { type: 'crystal', x: 8.45, z: 5.74, scale: 1.15, color: '#b5d8f0' },
      { type: 'crystal', x: -8.45, z: -0.98, scale: .7, color: '#d0bcf0' },
      { type: 'rock', x: 9.62, z: 1.96, scale: 1.2, color: '#6a849b' },
      { type: 'ruin', x: -7.15, z: -7.56, scale: .85, color: '#9fb8c8' },
      { type: 'ruin', x: 7.28, z: -7.56, scale: 1, color: '#9fb8c8' },
    ],
  },
  {
    theme: 'capital', floorPattern: 'royal-grid',
    floorColor: '#8b7892', tileColor: '#ece3cc', wallColor: '#d0bcc6', groundColor: '#bdc1d0', accentColor: '#e6bf6b',
    stations: {
      forge: { x: -6.15, z: -3.7 }, counter: { x: -6.05, z: 2.1 },
      alchemy: { x: 6.3, z: -3.35 }, potionCounter: { x: 6.2, z: 2.4 },
      inn: { x: 0, z: -6.1 }, gate: { x: 0, z: 8 },
    },
    floorFeatures: [
      { type: 'path', x: 0, z: 2.38, width: 2.6, depth: 11.48, color: '#bc8ca8' },
      { type: 'path', x: 0, z: -0.56, width: 15.21, depth: 1.68, color: '#d7c3a3' },
      { type: 'circle', x: 0, z: -0.56, radius: 1.69, color: '#e5c783' },
      { type: 'circle', x: 0, z: -0.56, radius: 1.235, color: '#af91b5' },
    ],
    decorations: [
      { type: 'pillar', x: -8.45, z: -7.28, scale: 1.2, color: '#dfd0bf' },
      { type: 'pillar', x: 8.45, z: -7.28, scale: 1.2, color: '#dfd0bf' },
      { type: 'pillar', x: -8.45, z: 6.58, scale: 1, color: '#dfd0bf' },
      { type: 'pillar', x: 8.45, z: 6.58, scale: 1, color: '#dfd0bf' },
      { type: 'banner', x: -7.28, z: -7.56, scale: 1.2, color: '#8c538c' },
      { type: 'banner', x: 7.28, z: -7.56, scale: 1.2, color: '#8c538c' },
      { type: 'well', x: -8.45, z: -0.28, scale: .9, color: '#d7c4a4' },
      { type: 'crystal', x: 8.45, z: -0.28, scale: .8, color: '#e8d6a2' },
    ],
  },
];

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

const stages = BALANCE.stages.filter((stage) => !stage.event).slice(0, 10);

// Expand the authored regional arrangements, not the characters or furniture.
// Work points and obstacles both derive from these same station coordinates.
function expandLayout(layout) {
  const stations = Object.fromEntries(Object.entries(layout.stations).map(([kind, point]) => [kind, {
    x: Number((point.x * 1.4).toFixed(3)),
    z: kind === 'gate' ? BOUNDS.maxZ : Number((point.z * 1.45).toFixed(3)),
  }]));
  const floorFeatures = layout.floorFeatures.map(feature => ({ ...feature,
    x: feature.x * 1.4, z: feature.z * 1.45,
    ...(feature.width ? { width: feature.width * 1.35 } : {}),
    ...(feature.depth ? { depth: feature.depth * 1.35 } : {}),
    ...(feature.radius ? { radius: feature.radius * 1.2 } : {}),
  }));
  return { ...layout, stations, floorFeatures };
}

export const REGIONS = freeze(layouts.map((authored, index) => {
  const layout = expandLayout(authored);
  return {
    id: stages[index].id,
    index,
    name: stages[index].name,
    sourceStageId: stages[index].stageId,
    bounds: BOUNDS,
    dimensions: { width: 24, depth: 24 },
    spawn: { x: layout.stations.gate.x, z: layout.stations.gate.z - 1.3 },
    ...layout,
  };
}));

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
