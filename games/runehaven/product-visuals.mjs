import { THREE } from './asset-loader.mjs';
import { CARRY_SPACING } from './cargo-layout.mjs';
export { CARRY_SPACING } from './cargo-layout.mjs';

const CAPACITY = 60;
const POP_SECONDS = .18;
const poseMatrix = new THREE.Matrix4(), posePosition = new THREE.Vector3(), poseScale = new THREE.Vector3();
const poseRotation = new THREE.Quaternion();

// Carried stacks opt in; stationary shelf stacks never upload moving matrices.
// Parts keep their shared meshes and local offsets while each layer flexes a
// little. The combined sway and 3.5% top-item pop stay below .04 world units.
// These feedback values are web presentation choices, not original-game timings.
export function animateCarryStack(stack, { time = 0, moving = false, dt = 0 } = {}) {
  if (!stack || !stack.count) return stack;
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(.05, dt)) : 0;
  time = Number.isFinite(time) ? time : 0;
  stack.strength = (stack.strength || 0) + ((moving ? 1 : 0) - (stack.strength || 0)) * (1 - Math.exp(-dt * 16));
  if (!moving && stack.strength < .001) stack.strength = 0;
  stack.popRemaining = Math.max(0, (stack.popRemaining || 0) - dt);
  const animated = stack.strength > 0 || stack.popRemaining > 0;
  if (!animated && !stack.animated) return stack;
  const rows = Math.ceil(stack.count / stack.columns);
  for (let i = 0; i < stack.count; i++) {
    const row = Math.floor(i / stack.columns), weight = rows === 1 ? 1 : row / (rows - 1);
    const x = Math.sin(time * 7 - row * .23) * .021 * stack.strength * weight;
    const z = Math.cos(time * 6 - row * .23) * .011 * stack.strength * weight;
    const pop = i === stack.popIndex && stack.popRemaining > 0 ? Math.sin((1 - stack.popRemaining / POP_SECONDS) * Math.PI) * .035 : 0;
    const size = 1 + pop;
    poseScale.setScalar(size);
    for (const part of stack.parts) {
      posePosition.set(((i % stack.columns) - (stack.columns - 1) / 2) * stack.columnWidth + x,
        row * stack.spacing + part.y * size, part.z * size + z);
      poseMatrix.compose(posePosition, poseRotation, poseScale); part.mesh.setMatrixAt(i, poseMatrix);
    }
  }
  for (const part of stack.parts) part.mesh.instanceMatrix.needsUpdate = true;
  stack.animated = animated;
  return stack;
}

export function setCarryStackCount(stack, count) {
  if (stack.count !== undefined && stack.count !== count) {
    stack.popRemaining = count ? POP_SECONDS : 0; stack.popIndex = count - 1;
  }
  stack.count = count;
  if (!count) { stack.strength = 0; stack.animated = false; }
  return stack;
}

export function createProductVisuals(material) {
  const products = {
    gear: {
      base: new THREE.BoxGeometry(.58, .145, .38),
      detail: new THREE.BoxGeometry(.43, .035, .065),
      baseMaterial: material('#9b6d43'),
      detailMaterial: material('#d9e8ed'),
    },
    potion: {
      base: new THREE.IcosahedronGeometry(.125, 1),
      detail: new THREE.CylinderGeometry(.055, .06, .065, 6),
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
    stack.parts = [{ mesh: stack.base, y: product === 'potion' ? .125 : .09, z: 0 },
      { mesh: stack.detail, y: product === 'potion' ? .2675 : .18, z: product === 'potion' ? 0 : .08 }];
    for (let i = 0; i < CAPACITY; i++) {
      const x = ((i % columns) - (columns - 1) / 2) * .61;
      const y = Math.floor(i / columns) * spacing;
      matrix.makeTranslation(x, y + stack.parts[0].y, 0);
      stack.base.setMatrixAt(i, matrix);
      matrix.makeTranslation(x, y + stack.parts[1].y, stack.parts[1].z);
      stack.detail.setMatrixAt(i, matrix);
    }
    for (const mesh of [stack.base, stack.detail]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.boundingBox.expandByScalar(.04); mesh.boundingBox.getBoundingSphere(mesh.boundingSphere);
    }
    stack.product = product;
    stack.columns = columns;
    stack.spacing = spacing;
    stack.columnWidth = .61;
    stack.animated = false; stack.strength = 0;
  }

  function set(parent, count, product, columns = 1, spacing) {
    if (disposed) throw new Error('Product visuals have been disposed');
    product = product === 'potion' ? 'potion' : 'gear';
    columns = Math.min(CAPACITY, Math.max(1, Math.floor(Number(columns) || 1)));
    spacing = Number.isFinite(Number(spacing)) && Number(spacing) >= 0 ? Number(spacing) : CARRY_SPACING[product];
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
    return setCarryStackCount(stack, count);
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

  return { set, animate: (parent, motion) => animateCarryStack(parent.userData.productStack, motion), dispose };
}
