import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { getBattleLayout } from './battlefield.mjs';

// Large untextured shapes leave the actual combat as the visual focus.
export function createBattlefieldVisuals(scene) {
  const group = new THREE.Group(); group.name = 'outdoor-battlefield'; group.visible = false; scene.add(group);
  const geometries = new Set(), materials = new Map(), parts = new Map();
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const cone = new THREE.ConeGeometry(1, 1, 6);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Euler(), quaternion = new THREE.Quaternion();
  const vector = new THREE.Vector3(), scale = new THREE.Vector3();
  let disposed = false, currentLayout;

  function zone(name) {
    const result = new THREE.Group(); result.name = name; group.add(result); return result;
  }
  function add(parent, geometry, role, x, y, z, sx, sy, sz, rz = 0) {
    rotation.set(0, 0, rz); quaternion.setFromEuler(rotation);
    matrix.compose(vector.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    const transformed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    transformed.deleteAttribute('uv'); transformed.applyMatrix4(matrix);
    if (!parts.has(parent)) parts.set(parent, new Map());
    const colors = parts.get(parent);
    if (!colors.has(role)) colors.set(role, []);
    colors.get(role).push(transformed);
  }
  const block = (parent, role, x, y, z, w, h, d, rz = 0) => add(parent, box, role, x, y, z, w, h, d, rz);

  const ground = zone('battlefield-ground');
  block(ground, 'grass', 0, -.19, .35, 14.5, .38, 14.5);
  block(ground, 'dirt', 0, -.012, .8, 8.4, .03, 11.8);

  const shop = zone('battlefield-shop-exterior');
  block(shop, 'plaster', 0, 1.15, -5.7, 7.6, 2.3, 1.7);
  for (const side of [-1, 1]) {
    block(shop, 'roof', side * 2.07, 2.65, -5.7, 4.3, .2, 2.2, -side * .18);
    block(shop, 'window', side * 2.3, 1.25, -4.8, 1.1, .9, .12);
  }
  block(shop, 'timberDark', 0, .95, -4.79, 1.6, 1.9, .16);
  block(shop, 'stone', 0, .035, -4.34, 2.15, .07, .7);

  for (const side of [-1, 1]) {
    const border = zone(side < 0 ? 'battlefield-west-border' : 'battlefield-east-border');
    block(border, 'stone', side * 6.9, .26, .65, .35, .52, 11.8);
    add(border, cylinder, 'timber', side * 7.85, .4, -.9, .14, .8, .14);
    add(border, cone, 'leaves', side * 7.85, 1.4, -.9, .85, 1.7, .85);
  }
  const entrance = zone('battlefield-road-entrance');
  for (const side of [-1, 1]) {
    block(entrance, 'stone', side * 4.8, .26, 6.85, 3.2, .52, .4);
    block(entrance, 'roof', side * 2.95, .58, 6.85, .55, 1.16, .55);
  }

  for (const [parent, colors] of parts) for (const [role, fragments] of colors) {
    const geometry = mergeGeometries(fragments); geometries.add(geometry);
    for (const fragment of fragments) fragment.dispose();
    if (!materials.has(role)) {
      const material = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      material.userData.battlefieldRole = role; materials.set(role, material);
    }
    const mesh = new THREE.Mesh(geometry, materials.get(role)); mesh.name = `${parent.name}-${role}`;
    mesh.receiveShadow = true; mesh.castShadow = parent !== ground; parent.add(mesh);
  }
  for (const geometry of [box, cylinder, cone]) geometry.dispose();
  parts.clear();

  function update(state, visible) {
    if (disposed) return;
    group.visible = Boolean(visible);
    if (!group.visible) return;
    const layout = getBattleLayout(state);
    if (layout === currentLayout) return;
    currentLayout = layout; group.userData.layoutId = layout.id;
    for (const [role, material] of materials) material.color.set(layout.palette[role]);
  }
  function dispose(disposedGeometries = new Set(), disposedMaterials = new Set()) {
    if (disposed) return;
    disposed = true; group.visible = false; group.removeFromParent();
    for (const geometry of geometries) if (!disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry); geometry.dispose();
    }
    for (const material of materials.values()) if (!disposedMaterials.has(material)) {
      disposedMaterials.add(material); material.dispose();
    }
  }
  return { group, update, dispose };
}
