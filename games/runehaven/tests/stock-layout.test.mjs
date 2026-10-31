import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createGame } from '../rules.mjs';
import { getStations } from '../maps.mjs';
import { createShopFixtures } from '../shop-visuals.mjs';
import { createSourceGeometry } from '../source-meshes.mjs';
import { STOCK_LAYOUT, getStockItemPoint } from '../stock-layout.mjs';
import { CARRY_SPACING } from '../cargo-layout.mjs';

test('every first-layer stock slot rests on a real source-mesh surface instead of inside its POS or grill lid', () => {
  const group = new THREE.Group(), fixtures = createShopFixtures(group), state = createGame(42);
  group.updateMatrixWorld(true);
  const stations = getStations(state);
  try {
    for (const [key, layout] of Object.entries(STOCK_LAYOUT)) {
      const geometry = createSourceGeometry(layout.product === 'gear' ? 'burger' : 'cup', { size: layout.product === 'gear' ? [.52, .16, .52] : [.28, .30, .28] });
      const bounds = geometry.boundingBox;
      for (let index = 0; index < layout.columns * layout.depth; index++) {
        const point = getStockItemPoint(state, key, index), local = { x: point.x - stations[key].x, z: point.z - stations[key].z };
        let support = -Infinity;
        // Check the center and the four support corners, not only a bounding box.
        for (const dx of [bounds.min.x * layout.scale * .85, 0, bounds.max.x * layout.scale * .85]) for (const dz of [bounds.min.z * layout.scale * .85, 0, bounds.max.z * layout.scale * .85]) {
          const hits = new THREE.Raycaster(new THREE.Vector3(local.x + dx, 3, local.z + dz), new THREE.Vector3(0, -1, 0)).intersectObject(fixtures[key], true);
          assert.ok(hits.length, `${key}:${index} has no supporting surface`);
          support = Math.max(support, hits[0].point.y);
          assert.ok(point.y >= hits[0].point.y && point.y - hits[0].point.y < .03, `${key}:${index} stock must clear the shallow table rim (${point.y}/${hits[0].point.y})`);
        }
        assert.ok(point.y - support < .004, `${key}:${index} must rest within 4mm of its supporting surface`);
      }
      geometry.dispose();
    }
  } finally {
    const geometry = new Set(), material = new Set(); group.traverse(node => { if (node.geometry) geometry.add(node.geometry); if (node.material) material.add(node.material); });
    for (const g of geometry) g.dispose(); for (const m of material) m.dispose();
  }
});

test('stock layer indexing is deterministic and preserves nonintersecting pitches in every region', () => {
  const state = createGame(42);
  for (let stage = 1; stage <= 10; stage++) {
    state.stage = stage;
    for (const [key, layout] of Object.entries(STOCK_LAYOUT)) {
      const first = getStockItemPoint(state, key, 0), next = getStockItemPoint(state, key, layout.columns * layout.depth);
      assert.ok(Math.abs(next.x - first.x) < 1e-8 && Math.abs(next.z - first.z) < 1e-8);
      assert.ok(Math.abs(next.y - first.y - CARRY_SPACING[layout.product] * layout.scale) < 1e-8);
    }
  }
});
