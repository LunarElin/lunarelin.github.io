import test from 'node:test';
import assert from 'node:assert/strict';
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

test('the first map preserves existing save-position and first-shop interaction anchors', () => {
  assert.deepEqual(STATIONS, {
    forge: { x: -4, z: -2 }, counter: { x: -3, z: 2 },
    alchemy: { x: 3, z: -2 }, potionCounter: { x: 3, z: 2 },
    inn: { x: 0, z: -4 }, gate: { x: 0, z: 6 },
  });
  assert.equal(STATIONS, legacySTATIONS);
  assert.equal(STATIONS, getStations(1));
  assert.deepEqual(BOUNDS, { minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 });
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
    assert.deepEqual(region.dimensions, { width: 14, depth: 13 });
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

test('workshop spacing leaves at least 2.5 world units between station centers', () => {
  for (const region of REGIONS) {
    const points = workshopKeys.map((kind) => [kind, region.stations[kind]]);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const [a, first] = points[i], [b, second] = points[j];
        assert.ok(distance(first, second) >= 2.5, `${region.name}: ${a}/${b}`);
      }
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
