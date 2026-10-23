import { THREE } from './asset-loader.mjs';

const CAPACITY = 80;

export function createActorMarkers(material) {
  const group = new THREE.Group();
  group.name = 'actor-markers';
  // Instance colors multiply the white material; no vertex color attribute is
  // needed on either shared geometry.
  const batchMaterial = material('#fff', { vertexColors: false });
  const health = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, .06, .07), batchMaterial, CAPACITY);
  const ringGeometry = new THREE.TorusGeometry(1, .11, 4, 24);
  ringGeometry.rotateX(Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeometry, batchMaterial, CAPACITY);
  health.name = 'actor-health-bars';
  rings.name = 'actor-floor-rings';
  for (const mesh of [health, rings]) {
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  }
  const matrix = new THREE.Matrix4();
  const ringColor = new THREE.Color();
  const normalColor = new THREE.Color('#8bd1a0');
  const dangerColor = new THREE.Color('#e8877a');

  function update(entries) {
    let healthCount = 0, ringCount = 0;
    for (const entry of entries) {
      if (!entry.visible) continue;
      if (healthCount === CAPACITY && ringCount === CAPACITY) break;
      const scale = Number.isFinite(entry.scale) ? Math.max(0, entry.scale) : 1;
      const x = Number.isFinite(entry.x) ? entry.x : 0;
      const z = Number.isFinite(entry.z) ? entry.z : 0;
      if (entry.healthVisible && healthCount < CAPACITY) {
        const ratio = Math.min(1, Math.max(0, Number(entry.healthRatio) || 0));
        matrix.makeScale(ratio * scale, scale, scale);
        matrix.setPosition(x, 1.85 * scale, z);
        health.setMatrixAt(healthCount, matrix);
        health.setColorAt(healthCount, entry.enemy || ratio < .35 ? dangerColor : normalColor);
        healthCount++;
      }
      if (entry.ringVisible && ringCount < CAPACITY) {
        const radius = Number.isFinite(entry.ringRadius) ? Math.max(0, entry.ringRadius) : 1;
        matrix.makeScale(radius * scale, radius * scale, radius * scale);
        matrix.setPosition(x, .035, z);
        rings.setMatrixAt(ringCount, matrix);
        ringColor.set(entry.ringColor ?? '#fff');
        rings.setColorAt(ringCount, ringColor);
        ringCount++;
      }
    }
    health.count = healthCount;
    rings.count = ringCount;
    health.visible = healthCount > 0;
    rings.visible = ringCount > 0;
    if (healthCount > 0) {
      health.instanceMatrix.needsUpdate = true;
      health.instanceColor.needsUpdate = true;
    }
    if (ringCount > 0) {
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor.needsUpdate = true;
    }
  }

  return { group, update };
}
