import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createGame } from '../rules.mjs';
import { getActionZones } from '../action-zones.mjs';
import { createActionZoneVisuals } from '../action-zone-visuals.mjs';
import { expandDining, setSeatState } from './dining-fixtures.mjs';

test('rendered floor circles use the exact gameplay center and radius above the floor pads in every region', () => {
  const scene = new THREE.Group(), visuals = createActionZoneVisuals(scene), matrix = new THREE.Matrix4();
  try {
    for (let stage = 1; stage <= 10; stage++) {
      const state = createGame(42); state.stage = stage; state.unlocks.alchemy = state.unlocks.inn = true; expandDining(state);
      setSeatState(state, 0, 0, 'dirty');
      visuals.update(state);
      const zones = getActionZones(state).filter(zone => zone.enabled), rings = visuals.group.getObjectByName('action-circle-rings');
      assert.equal(rings.count, zones.length);
      for (const [i, zone] of zones.entries()) {
        rings.getMatrixAt(i, matrix); const e = matrix.elements;
        assert.ok(Math.abs(e[12] - zone.x) < 1e-6, `${stage}:${zone.id} x`);
        assert.ok(Math.abs(e[14] - zone.z) < 1e-6, `${stage}:${zone.id} z`);
        assert.ok(Math.abs(e[0] - zone.radius) < 1e-6, `${stage}:${zone.id} radius`);
        assert.ok(e[13] > .0525, 'the floor mark must not be buried under a fixture rug');
      }
      assert.equal(visuals.group.children.length, 4, 'all circles share four batches instead of one object per mark');
    }
  } finally { visuals.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('locked facilities have no work circle and combat hides every indoor circle', () => {
  const state = createGame(42), visuals = createActionZoneVisuals(new THREE.Group());
  try {
    visuals.update(state); assert.equal(visuals.zones.some(zone => zone.id === 'work:alchemy'), false);
    state.raid.location = 'outside'; visuals.update(state); assert.equal(visuals.group.visible, false);
    state.raid.location = 'shop'; state.raid.phase = 'departure'; visuals.update(state); assert.equal(visuals.group.visible, false);
  } finally { visuals.dispose(); }
});
