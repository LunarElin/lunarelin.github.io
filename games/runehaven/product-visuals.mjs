import { THREE } from './asset-loader.mjs';

const CAPACITY = 60;

export function createProductVisuals(material) {
  const products = {
    gear: {
      base: new THREE.BoxGeometry(.58, .145, .38),
      detail: new THREE.BoxGeometry(.43, .035, .065),
      baseMaterial: material('#9b6d43'),
      detailMaterial: material('#d9e8ed'),
    },
    potion: {
      base: new THREE.IcosahedronGeometry(.16, 1),
      detail: new THREE.CylinderGeometry(.06, .065, .11, 6),
      baseMaterial: material('#76dfc2'),
      detailMaterial: material('#d4b478'),
    },
  };
  const matrix = new THREE.Matrix4();
  let disposed = false;

  function configure(stack, product, columns, spacing) {
    const geometry = products[product];
    stack.base.geometry = geometry.base;
    stack.base.material = geometry.baseMaterial;
    stack.detail.geometry = geometry.detail;
    stack.detail.material = geometry.detailMaterial;
    stack.base.count = stack.detail.count = CAPACITY;
    for (let i = 0; i < CAPACITY; i++) {
      const x = ((i % columns) - (columns - 1) / 2) * .61;
      const y = Math.floor(i / columns) * spacing;
      matrix.makeTranslation(x, y + .09, 0);
      stack.base.setMatrixAt(i, matrix);
      matrix.makeTranslation(x, y + (product === 'potion' ? .28 : .18), product === 'potion' ? 0 : .08);
      stack.detail.setMatrixAt(i, matrix);
    }
    for (const mesh of [stack.base, stack.detail]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    stack.product = product;
    stack.columns = columns;
    stack.spacing = spacing;
  }

  function set(parent, count, product, columns = 1, spacing = .17) {
    if (disposed) throw new Error('Product visuals have been disposed');
    product = product === 'potion' ? 'potion' : 'gear';
    columns = Math.min(CAPACITY, Math.max(1, Math.floor(Number(columns) || 1)));
    spacing = Number.isFinite(Number(spacing)) && Number(spacing) >= 0 ? Number(spacing) : .17;
    count = Math.min(CAPACITY, Math.max(0, Math.floor(Number(count) || 0)));
    let stack = parent.userData.productStack;
    if (!stack || stack.base.parent !== parent || stack.detail.parent !== parent) {
      const geometry = products[product];
      const base = new THREE.InstancedMesh(geometry.base, geometry.baseMaterial, CAPACITY);
      const detail = new THREE.InstancedMesh(geometry.detail, geometry.detailMaterial, CAPACITY);
      base.castShadow = true;
      detail.castShadow = false;
      stack = { base, detail };
      parent.userData.productStack = stack;
      parent.add(base, detail);
    }
    if (stack.product !== product || stack.columns !== columns || stack.spacing !== spacing) {
      configure(stack, product, columns, spacing);
    }
    stack.base.count = stack.detail.count = count;
    stack.base.visible = stack.detail.visible = count > 0;
    return stack;
  }

  function dispose(alreadyDisposed = new Set()) {
    if (disposed) return;
    disposed = true;
    for (const product of Object.values(products)) {
      for (const geometry of [product.base, product.detail]) if (!alreadyDisposed.has(geometry)) {
        geometry.dispose(); alreadyDisposed.add(geometry);
      }
    }
  }

  return { set, dispose };
}
