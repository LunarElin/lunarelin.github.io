import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../asset-loader.mjs';
import { createDiningState, getDiningLayout } from '../dining.mjs';
import { createDiningVisuals } from '../dining-visuals.mjs';
import { createShopFixtures } from '../shop-visuals.mjs';
import { BALANCE } from '../balance.mjs';
import { BOUNDS, REGIONS, STATIONS, getRegion, getStations, legacySTATIONS } from '../maps.mjs';
import { getActionZones } from '../action-zones.mjs';
import { projectShopTarget } from '../shop-navigation.mjs';

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
  assert.deepEqual(BOUNDS, { minX: -11, maxX: 11, minZ: -10.8, maxZ: 11 });
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
    assert.deepEqual(region.dimensions, { width: 24, depth: 24 });
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

function footprint(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  assert.equal(bounds.isEmpty(), false, `${object.name}: has actual geometry`);
  return { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z };
}
async function visualFixtures(t) {
  const scene = new THREE.Scene(), fixtures = createShopFixtures(scene);
  const dining = await createDiningVisuals(scene), diningGroup = scene.getObjectByName('inn-dining');
  const state = { stage: 1, unlocks: { inn: true }, dining: createDiningState() };
  t.after(() => {
    dining.dispose();
    const geometries = new Set(), materials = new Set();
    for (const group of Object.values(fixtures)) group.traverse((node) => {
      if (!node.isMesh) return;
      geometries.add(node.geometry); materials.add(node.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  });
  function place(stage) {
    state.stage = stage;
    const stations = getStations(state);
    for (const [kind, group] of Object.entries(fixtures)) group.position.set(stations[kind].x, 0, stations[kind].z);
    dining.update(state); scene.updateMatrixWorld(true);
    return getDiningLayout(state);
  }
  return { fixtures, diningGroup, place };
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

test('the expanded room leaves at least 1.3 units between every facility and dining-table footprint', async (t) => {
  const { fixtures, diningGroup, place } = await visualFixtures(t);
  for (const region of REGIONS) {
    const dining = place(region.index + 1);
    const pieces = [
      ...Object.entries(fixtures).map(([kind, group]) => [kind, footprint(group)]),
      ['kitchen', footprint(diningGroup.getObjectByName('dining-kitchen'))],
      ['food-counter', footprint(diningGroup.getObjectByName('dining-counter'))],
      ...dining.tables.map((table) => [`table-${table.id}`, envelope([
        footprint(diningGroup.getObjectByName(`dining-table-${table.id}`)),
        footprint(diningGroup.getObjectByName(`dining-chair-${table.id}`)),
        footprint(diningGroup.getObjectByName(`dining-chair-${table.id}-1`)),
      ])]),
    ];
    for (let left = 0; left < pieces.length; left++) for (let right = left + 1; right < pieces.length; right++) {
      const clearance = gap(pieces[left][1], pieces[right][1]);
      assert.ok(clearance >= 1.3, `${region.name}: ${pieces[left][0]}/${pieces[right][0]} gap ${clearance}`);
    }
    for (const [name, box] of pieces) {
      assert.ok(box.minX > -region.dimensions.width / 2 && box.maxX < region.dimensions.width / 2, `${name}: within shop walls`);
      assert.ok(box.minZ > -region.dimensions.depth / 2 && box.maxZ < region.dimensions.depth / 2, `${name}: within shop walls`);
    }
  }
});

test('the food waiting line crosses the service area without entering any actual dining table geometry', async (t) => {
  const { diningGroup, place } = await visualFixtures(t);
  for (let stage = 1; stage <= 10; stage++) {
    const dining = place(stage);
    for (const point of dining.queue) for (const table of dining.tables) {
      const tableBox = envelope([
        footprint(diningGroup.getObjectByName(`dining-table-${table.id}`)),
        footprint(diningGroup.getObjectByName(`dining-chair-${table.id}`)),
        footprint(diningGroup.getObjectByName(`dining-chair-${table.id}-1`)),
      ]);
      assert.ok(gap(rectangle(point.x, point.z, -.25, .25, -.25, .25), tableBox) >= .6);
    }
  }
});

test('every visible action circle lies outside actual furniture and its center remains directly reachable', async (t) => {
  const { fixtures, diningGroup, place } = await visualFixtures(t);
  for (const region of REGIONS) {
    const layout = place(region.index + 1), dining = createDiningState();
    dining.tableCount = 4;
    for (const table of dining.tables) for (const seat of table.seats) seat.status = 'dirty';
    const state = { stage: region.index + 1, unlocks: { inn: true, alchemy: true }, dining, moneyPiles: { gear: 0, potion: 0, inn: 0 } };
    const pieces = [
      ...Object.entries(fixtures).map(([kind, group]) => [kind, footprint(group)]),
      ['kitchen', footprint(diningGroup.getObjectByName('dining-kitchen'))],
      ['meal', footprint(diningGroup.getObjectByName('dining-counter'))],
      ...layout.tables.flatMap(table => [
        [`table-${table.id}`, footprint(diningGroup.getObjectByName(`dining-table-${table.id}`))],
        [`chair-${table.id}-0`, footprint(diningGroup.getObjectByName(`dining-chair-${table.id}`))],
        [`chair-${table.id}-1`, footprint(diningGroup.getObjectByName(`dining-chair-${table.id}-1`))],
      ]),
    ];
    for (const zone of getActionZones(state).filter(zone => zone.enabled)) {
      const target = projectShopTarget(state, zone);
      assert.ok(distance(target, zone) < 1e-6, `${region.name}: ${zone.id} is not displaced by a body`);
      for (const [kind, box] of pieces) {
        const clearance = gap(rectangle(zone.x, zone.z, 0, 0, 0, 0), box);
        assert.ok(clearance + 1e-6 >= zone.radius, `${region.name}: ${zone.id} overlaps ${kind} by ${zone.radius - clearance}`);
      }
    }
  }
});

test('work, cash, cleaning and upgrade circles remain separate throughout all ten regional layouts', () => {
  for (const region of REGIONS) {
    const dining = createDiningState(); dining.tableCount = 4;
    for (const table of dining.tables) for (const seat of table.seats) seat.status = 'dirty';
    const state = { stage: region.index + 1, unlocks: { inn: true, alchemy: true }, dining, moneyPiles: { gear: 0, potion: 0, inn: 0 } };
    const zones = getActionZones(state).filter(zone => zone.enabled);
    for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
      assert.ok(distance(zones[i], zones[j]) + 1e-6 >= zones[i].radius + zones[j].radius,
        `${region.name}: ${zones[i].id}/${zones[j].id} overlap`);
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
