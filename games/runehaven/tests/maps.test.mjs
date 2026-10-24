import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDiningLayout } from '../dining.mjs';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, REGIONS, STATIONS, getRegion, getStations, legacySTATIONS } from '../maps.mjs';

const stationKeys = ['forge', 'counter', 'alchemy', 'potionCounter', 'inn', 'gate'];
const workshopKeys = stationKeys.filter((key) => key !== 'gate');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inBounds = (point) => Number.isFinite(point.x) && Number.isFinite(point.z)
  && point.x >= BOUNDS.minX && point.x <= BOUNDS.maxX
  && point.z >= BOUNDS.minZ && point.z <= BOUNDS.maxZ;

test('ten regions retain the normal source-stage names and IDs without including the event map', () => {
  const stages = BALANCE.stages.filter((stage) => !stage.event);
  assert.equal(REGIONS.length, 10);
  assert.deepEqual(REGIONS.map(({ id, name, sourceStageId }) => ({ id, name, stageId: sourceStageId })),
    stages.map(({ id, name, stageId }) => ({ id, name, stageId })));
  assert.equal(new Set(REGIONS.map((region) => region.theme)).size, 10);
});

test('larger shop bounds include all historical save positions while separating rear and side work areas', () => {
  assert.deepEqual(BOUNDS, { minX: -8, maxX: 8, minZ: -7, maxZ: 8 });
  for (const point of [{ x: -6, z: -4.7 }, { x: 6, z: 6 }, { x: 0, z: 1 }]) assert.ok(inBounds(point));
  assert.equal(STATIONS, legacySTATIONS);
  assert.equal(STATIONS, getStations(1));
  for (const region of REGIONS) {
    assert.ok(region.stations.inn.z < -5.8);
    for (const key of ['forge', 'alchemy', 'counter', 'potionCounter']) assert.ok(Math.abs(region.stations[key].x) >= 5.9);
    for (const key of ['forge', 'alchemy']) assert.ok(region.stations[key].z < -3);
    for (const key of ['counter', 'potionCounter']) assert.ok(region.stations[key].z >= 2.1);
  }
});

test('each map changes actual station layout and floor geometry, not only its color', () => {
  const layouts = REGIONS.map((region) => JSON.stringify(region.stations));
  const floorShapes = REGIONS.map((region) => JSON.stringify(region.floorFeatures.map((feature) => {
    const { color, ...shape } = feature;
    return shape;
  })));
  assert.equal(new Set(layouts).size, 10);
  assert.equal(new Set(floorShapes).size, 10);
  assert.equal(new Set(REGIONS.map((region) => region.floorPattern)).size, 10);
  assert.ok(REGIONS.some((region) => region.stations.gate.x < -1));
  assert.ok(REGIONS.some((region) => region.stations.gate.x > 1));
});

test('workshops, their front interaction points and entrances remain reachable within bounds', () => {
  for (const region of REGIONS) {
    assert.equal(region.bounds, BOUNDS);
    assert.deepEqual(region.dimensions, { width: 18, depth: 18 });
    assert.deepEqual(Object.keys(region.stations).sort(), [...stationKeys].sort());
    assert.ok(inBounds(region.spawn), `${region.name}: entry spawn`);
    assert.equal(region.spawn.x, region.stations.gate.x);
    assert.equal(region.stations.gate.z, BOUNDS.maxZ);
    for (const [kind, point] of Object.entries(region.stations)) {
      assert.ok(inBounds(point), `${region.name}: ${kind}`);
      if (kind === 'gate') continue;
      assert.ok(inBounds({ x: point.x, z: point.z + .8 }), `${region.name}: ${kind} front interaction`);
      assert.ok(distance(point, { x: 0, z: 0 }) >= 2.5, `${region.name}: open central walking space`);
      assert.ok(distance(point, region.spawn) >= 2, `${region.name}: clear entry landing`);
    }
  }
});

test('workshop spacing leaves at least 4.5 world units between station centers', () => {
  for (const region of REGIONS) {
    const points = workshopKeys.map((kind) => [kind, region.stations[kind]]);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const [a, first] = points[i], [b, second] = points[j];
        assert.ok(distance(first, second) >= 4.5, `${region.name}: ${a}/${b}`);
      }
    }
  }
});

const nativeModels = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')).models;
function modelFootprint(key, height, x, z, rotation = 0) {
  const [w, h, d] = nativeModels[key].nativeBounds.size, scale = height / h;
  const width = scale * (Math.abs(Math.cos(rotation)) * w + Math.abs(Math.sin(rotation)) * d);
  const depth = scale * (Math.abs(Math.sin(rotation)) * w + Math.abs(Math.cos(rotation)) * d);
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}
function envelope(boxes) {
  return { minX: Math.min(...boxes.map((box) => box.minX)), maxX: Math.max(...boxes.map((box) => box.maxX)),
    minZ: Math.min(...boxes.map((box) => box.minZ)), maxZ: Math.max(...boxes.map((box) => box.maxZ)) };
}
function gap(a, b) {
  return Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));
}
function rectangle(x, z, left, right, back, front) {
  return { minX: x + left, maxX: x + right, minZ: z + back, maxZ: z + front };
}

test('actual model dimensions leave at least 0.6 units between every facility and dining-table footprint', () => {
  for (const region of REGIONS) {
    const stations = region.stations, dining = getDiningLayout({ stage: region.index + 1 });
    const pieces = [
      ['forge', rectangle(stations.forge.x, stations.forge.z, -1.24, 1.55, -.985, .77)],
      ['alchemy', envelope([modelFootprint('table', .73, stations.alchemy.x, stations.alchemy.z - .2),
        modelFootprint('cauldron', .85, stations.alchemy.x - .25, stations.alchemy.z + .1)])],
      ['counter', envelope([rectangle(stations.counter.x, stations.counter.z, -1.2, 1.2, -.5, .5),
        modelFootprint('marketStall', 1.4, stations.counter.x, stations.counter.z)])],
      ['potion-counter', rectangle(stations.potionCounter.x, stations.potionCounter.z, -1.05, 1.05, -.5, .5)],
      // The bed is laid across the rear room rather than pointing into the kitchen.
      ['inn', [modelFootprint('bed', .9, stations.inn.x, stations.inn.z - .65, Math.PI / 2),
        modelFootprint('chair', .75, stations.inn.x, stations.inn.z + .45)]],
      ['kitchen', modelFootprint('table', .7, dining.kitchen.x, dining.kitchen.z)],
      ['food-counter', modelFootprint('table', .7, dining.counter.x, dining.counter.z)],
      ...dining.tables.map((table) => [`table-${table.id}`, envelope([modelFootprint('table', .65, table.x, table.z),
        modelFootprint('chair', .65, table.seat.x, table.seat.z, Math.PI)])]),
    ];
    for (let left = 0; left < pieces.length; left++) for (let right = left + 1; right < pieces.length; right++) {
      const boxes = (piece) => Array.isArray(piece) ? piece : [piece];
      const clearance = Math.min(...boxes(pieces[left][1]).flatMap((a) => boxes(pieces[right][1]).map((b) => gap(a, b))));
      assert.ok(clearance >= .6, `${region.name}: ${pieces[left][0]}/${pieces[right][0]} gap ${clearance}`);
    }
    for (const [name, piece] of pieces) for (const box of (Array.isArray(piece) ? piece : [piece])) {
      assert.ok(box.minX > -region.dimensions.width / 2 && box.maxX < region.dimensions.width / 2, `${name}: within shop walls`);
      assert.ok(box.minZ > -region.dimensions.depth / 2 && box.maxZ < region.dimensions.depth / 2, `${name}: within shop walls`);
    }
  }
});

test('the food waiting line crosses the service area without entering any dining table footprint', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const dining = getDiningLayout({ stage });
    for (const point of dining.queue) for (const table of dining.tables) {
      const tableBox = modelFootprint('table', .65, table.x, table.z);
      assert.ok(gap(rectangle(point.x, point.z, -.25, .25, -.25, .25), tableBox) >= .6);
    }
  }
});

test('the agreed counter and inn collection offsets are safe in every regional layout', () => {
  const offsets = [
    ['counter', 1.25, -.4],
    ['potionCounter', -1.25, -.4],
    ['inn', 1.5, .45],
  ];
  for (const region of REGIONS) {
    for (const [kind, dx, dz] of offsets) {
      const station = region.stations[kind];
      assert.ok(inBounds({ x: station.x + dx, z: station.z + dz }), `${region.name}: ${kind} money collection`);
    }
  }
});

test('floor and scenery descriptors use supported geometry types and finite transforms', () => {
  const featureTypes = new Set(['path', 'circle', 'water']);
  const decorationTypes = new Set(['tree', 'crystal', 'mushroom', 'rock', 'pillar', 'ruin', 'well', 'banner']);
  for (const region of REGIONS) {
    assert.ok(region.floorFeatures.length >= 2);
    assert.ok(region.decorations.length >= 6);
    for (const feature of region.floorFeatures) {
      assert.ok(featureTypes.has(feature.type), `${region.name}: floor type`);
      assert.ok(Number.isFinite(feature.x) && Number.isFinite(feature.z));
      if (feature.type === 'circle') assert.ok(Number.isFinite(feature.radius) && feature.radius > 0);
      else assert.ok(feature.width > 0 && feature.depth > 0);
    }
    for (const decoration of region.decorations) {
      assert.ok(decorationTypes.has(decoration.type), `${region.name}: decoration type`);
      assert.ok(Number.isFinite(decoration.x) && Number.isFinite(decoration.z));
      assert.ok(Number.isFinite(decoration.scale) && decoration.scale > 0);
      assert.ok(decoration.rotation === undefined || Number.isFinite(decoration.rotation));
    }
  }
});

test('stage lookup is deterministic, accepts game state and cycles after the tenth region', () => {
  for (let stage = 1; stage <= 1000; stage++) {
    const expected = REGIONS[(stage - 1) % REGIONS.length];
    assert.equal(getRegion(stage), expected);
    assert.equal(getRegion({ stage }), expected);
    assert.equal(getStations({ stage }), expected.stations);
  }
  assert.equal(getRegion(10), REGIONS[9]);
  assert.equal(getRegion(11), REGIONS[0]);
  assert.equal(getRegion(20), REGIONS[9]);
  assert.equal(getRegion('12'), REGIONS[1]);
  assert.equal(getRegion(2.9), REGIONS[1]);
});

test('invalid stage inputs fall back safely and returned map data cannot be mutated', () => {
  for (const input of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '', 'missing', {}, { stage: NaN }, [], Symbol('invalid')]) {
    assert.equal(getRegion(input), REGIONS[0]);
    assert.equal(getStations(input), STATIONS);
  }
  assert.throws(() => { REGIONS[1].stations.counter.x = 0; }, TypeError);
  assert.throws(() => { REGIONS[1].floorFeatures.push({ type: 'path' }); }, TypeError);
  assert.throws(() => { REGIONS[1].decorations[0].scale = 100; }, TypeError);
  assert.equal(getRegion(2), REGIONS[1]);
  assert.notEqual(getStations(2).counter.x, 0);
});
