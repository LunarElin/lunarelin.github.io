import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { getBattleLayout } from './battlefield.mjs';

// Static courtyard pieces merge by color and zone; no textures or extra lights.
export function createBattlefieldVisuals(scene) {
  const group = new THREE.Group(); group.name = 'outdoor-battlefield'; group.visible = false; scene.add(group);
  const geometries = new Set(), materials = new Map(), parts = new Map();
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cone = new THREE.ConeGeometry(1, 1, 7), rock = new THREE.DodecahedronGeometry(1, 0);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Euler(), quaternion = new THREE.Quaternion();
  const vector = new THREE.Vector3(), scale = new THREE.Vector3();
  let disposed = false, currentLayout;

  function zone(name) {
    const result = new THREE.Group(); result.name = name; group.add(result); return result;
  }
  function add(parent, geometry, role, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    rotation.set(rx, ry, rz); quaternion.setFromEuler(rotation);
    matrix.compose(vector.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    const transformed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    transformed.deleteAttribute('uv'); transformed.applyMatrix4(matrix);
    if (!parts.has(parent)) parts.set(parent, new Map());
    const colors = parts.get(parent);
    if (!colors.has(role)) colors.set(role, []);
    colors.get(role).push(transformed);
  }
  const plank = (parent, role, x, y, z, w, h, d, rz = 0) => add(parent, box, role, x, y, z, w, h, d, 0, 0, rz);

  const ground = zone('battlefield-ground');
  plank(ground, 'stoneDark', 0, -.39, .35, 14.7, .18, 14.7);
  plank(ground, 'grass', 0, -.19, .35, 14.5, .38, 14.5);
  plank(ground, 'dirt', 0, -.012, .8, 8.4, .03, 11.8);
  for (let row = 0; row < 12; row++) for (const side of [-1, 1]) {
    add(ground, box, row % 3 ? 'stone' : 'stoneDark', side * .64 + (row % 2 ? .13 : 0), .005, -4.2 + row * .88,
      .95, .035, .67, 0, (row % 3 - 1) * .08, 0);
  }

  const shop = zone('battlefield-shop-exterior');
  plank(shop, 'stoneDark', 0, .12, -5.7, 7.9, .24, 1.85);
  plank(shop, 'plaster', 0, 1.18, -5.7, 7.6, 2.12, 1.7);
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([
    -3.8, 0, .85, 3.8, 0, .85, 0, 1.05, .85,
    -3.8, 0, -.85, 3.8, 0, -.85, 0, 1.05, -.85,
  ], 3));
  gable.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2]);
  gable.computeVertexNormals();
  add(shop, gable, 'plaster', 0, 2.24, -5.7, 1, 1, 1);
  gable.dispose();
  for (const side of [-1, 1]) {
    plank(shop, 'roof', side * 2.07, 2.79, -5.7, 4.3, .18, 2.2, -side * .25);
    for (const x of [side * .95, side * 3.62]) plank(shop, 'timber', x, 1.22, -4.79, .17, 2.25, .18);
    plank(shop, 'timberDark', side * 2.32, 1.22, -4.79, 1.35, 1.16, .14);
    plank(shop, 'window', side * 2.32, 1.22, -4.7, 1.1, .92, .08);
    plank(shop, 'timber', side * 2.32, 1.22, -4.64, .08, .98, .06);
    plank(shop, 'timber', side * 2.32, 1.22, -4.64, 1.16, .08, .06);
    plank(shop, 'timberDark', side * 1.22, 1.52, -4.63, .22, .4, .2);
    plank(shop, 'window', side * 1.22, 1.53, -4.5, .15, .24, .1);
  }
  for (const y of [.3, 2.16]) plank(shop, 'timber', 0, y, -4.76, 7.95, .16, .22);
  plank(shop, 'timberDark', 0, .98, -4.79, 1.62, 1.8, .16);
  for (const side of [-1, 1]) plank(shop, 'timber', side * .87, 1.02, -4.65, .16, 1.96, .22);
  plank(shop, 'timber', 0, 1.95, -4.65, 1.9, .18, .22);
  plank(shop, 'stone', 0, .035, -4.34, 2.15, .07, .7);
  plank(shop, 'timberDark', 0, 2.44, -4.5, 2.7, .57, .15);
  plank(shop, 'sign', 0, 2.44, -4.39, 2.48, .43, .08);
  // A raised hammer and rune mark the sign without a new image or tiny text.
  plank(shop, 'gold', -.48, 2.4, -4.31, .08, .32, .05, -.45);
  plank(shop, 'gold', -.42, 2.57, -4.3, .34, .11, .06, -.45);
  plank(shop, 'gold', .48, 2.45, -4.3, .22, .22, .06, Math.PI / 4);
  plank(shop, 'gold', .84, 2.45, -4.3, .08, .25, .06);

  for (const side of [-1, 1]) {
    const border = zone(side < 0 ? 'battlefield-west-border' : 'battlefield-east-border');
    plank(border, 'stoneDark', side * 6.9, .26, .65, .35, .52, 11.8);
    plank(border, 'stone', side * 6.9, .56, .65, .48, .14, 11.9);
    for (const z of [-4.8, -.9, 3, 6.3]) {
      plank(border, 'stone', side * 6.9, .55, z, .65, 1.1, .65);
      plank(border, 'stoneDark', side * 6.9, 1.13, z, .78, .12, .78);
    }
    for (const [z, size] of [[-3.4, 1], [2.6, .88]]) {
      add(border, cylinder, 'timber', side * 7.85, .5, z, .14, 1, .14);
      add(border, cone, 'leavesDark', side * 7.85, 1.25, z, .82 * size, 1.5 * size, .82 * size);
      add(border, cone, 'leaves', side * 7.85, 1.91, z, .6 * size, 1.35 * size, .6 * size);
    }
    for (let index = 0; index < 5; index++) {
      add(border, rock, index % 2 ? 'stone' : 'stoneDark', side * (6.48 + index % 2 * .15), .15, -3 + index * 1.75,
        .25 + index % 2 * .09, .18, .26, 0, index * .7, 0);
    }
  }

  const entrance = zone('battlefield-road-entrance');
  for (const side of [-1, 1]) {
    plank(entrance, 'stone', side * 4.8, .33, 6.85, 3.2, .66, .45);
    plank(entrance, 'stoneDark', side * 2.95, .67, 6.85, .55, 1.34, .6);
    plank(entrance, 'gold', side * 2.95, 1.39, 6.85, .68, .12, .74);
    plank(entrance, 'timber', side * 3.44, 1.13, 6.78, .065, 2.2, .065);
    plank(entrance, 'roof', side * 3.72, 1.57, 6.78, .55, .82, .04);
  }

  for (const [parent, colors] of parts) for (const [role, fragments] of colors) {
    const geometry = mergeGeometries(fragments); geometries.add(geometry);
    for (const fragment of fragments) fragment.dispose();
    if (!materials.has(role)) {
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95 });
      material.userData.battlefieldRole = role;
      if (role === 'window') { material.emissive.set('#e4bc75'); material.emissiveIntensity = .28; }
      materials.set(role, material);
    }
    const mesh = new THREE.Mesh(geometry, materials.get(role)); mesh.name = `${parent.name}-${role}`;
    mesh.receiveShadow = true; mesh.castShadow = parent !== ground && role !== 'window'; parent.add(mesh);
  }
  for (const geometry of [box, cylinder, cone, rock]) geometry.dispose();
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
