import * as THREE from './vendor/three.module.js';
import { getActionZones, isStandingInActionZone } from './action-zones.mjs';

// The ring radius is the gameplay radius, with no screen-space repositioning.
// Four shared batches cover every shop, including dirty seats and money piles.
export function createActionZoneVisuals(parent) {
  const group = new THREE.Group(); group.name = 'shop-action-circles'; parent.add(group);
  const geometries = [], materials = [], batches = {};
  const ring = new THREE.RingGeometry(.91, 1, 40); ring.rotateX(-Math.PI / 2); geometries.push(ring);
  function glyph(kind) {
    const shape = new THREE.Shape();
    const points = kind === 'work' ? [[-.09,.26],[.09,.26],[.09,-.02],[.26,-.02],[0,-.29],[-.26,-.02],[-.09,-.02]]
      : kind === 'upgrade' ? [[-.075,.28],[.075,.28],[.075,.075],[.28,.075],[.28,-.075],[.075,-.075],[.075,-.28],[-.075,-.28],[-.075,-.075],[-.28,-.075],[-.28,.075],[-.075,.075]]
        : [[-.24,-.22],[-.11,-.29],[.24,.21],[.11,.29]];
    shape.moveTo(...points[0]); for (const point of points.slice(1)) shape.lineTo(...point); shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2); geometries.push(geometry); return geometry;
  }
  function batch(name, geometry) {
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .95, depthWrite: false }); materials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, 64); mesh.name = `action-circle-${name}`;
    mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0; group.add(mesh); batches[name] = mesh; return mesh;
  }
  batch('rings', ring); for (const kind of ['work', 'upgrade', 'clean']) batch(kind, glyph(kind));
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  const colors = { work: '#fff3bb', cash: '#6bdc8b', upgrade: '#77cbff', clean: '#e7bdff' };
  let zones = [];
  function update(state) {
    group.visible = state.raid.location !== 'outside' && state.raid.phase !== 'departure';
    for (const mesh of Object.values(batches)) mesh.count = 0;
    zones = getActionZones(state).filter(zone => zone.enabled);
    for (const zone of zones) {
      const active = isStandingInActionZone(state, zone);
      color.set(active ? '#ffffff' : colors[zone.kind]);
      // The shop rug tops end at y=.0525. All circles sit above that surface.
      matrix.makeScale(zone.radius, 1, zone.radius); matrix.setPosition(zone.x, .072, zone.z);
      const index = batches.rings.count++; batches.rings.setMatrixAt(index, matrix); batches.rings.setColorAt(index, color);
      const mesh = batches[zone.kind];
      if (mesh) { matrix.makeScale(1, 1, 1); matrix.setPosition(zone.x, .073, zone.z); const i = mesh.count++; mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color); }
    }
    for (const mesh of Object.values(batches)) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  function dispose() { group.removeFromParent(); for (const mesh of Object.values(batches)) mesh.dispose(); for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); }
  return { group, update, dispose, get zones() { return zones; } };
}
