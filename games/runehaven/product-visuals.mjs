import { THREE } from './asset-loader.mjs';
import { CARRY_SPACING } from './cargo-layout.mjs';
import { createSourceGeometry } from './source-meshes.mjs';
export { CARRY_SPACING } from './cargo-layout.mjs';

const CAPACITY = 60;
const POP_SECONDS = .34;
const poseMatrix = new THREE.Matrix4(), posePosition = new THREE.Vector3(), poseScale = new THREE.Vector3();
const poseRotation = new THREE.Quaternion();

// Carried stacks opt in; stationary shelf stacks never upload moving matrices.
// Shared instance buffers flex by layer. Every added top item launches a short
// damped landing bounce through the upper layers, then returns to the same rest
// pose. These spring timings are web feedback choices, not extracted constants.
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
    const x = Math.sin(time * 7 - row * .23) * .032 * stack.strength * weight;
    const z = Math.cos(time * 6 - row * .23) * .016 * stack.strength * weight;
    const age = POP_SECONDS - stack.popRemaining;
    const bounce = stack.popRemaining > 0 ? Math.sin(age / POP_SECONDS * Math.PI * 2) * Math.exp(-age * 9) : 0;
    const topWeight = Math.max(0, 1 - (stack.count - 1 - i) / 4);
    const lift = Math.max(0, bounce) * .1 * topWeight;
    const squash = bounce * .12 * topWeight;
    const size = 1 + squash * .45;
    poseScale.set(size, 1 - squash, size);
    for (const part of stack.parts) {
      posePosition.set(((i % stack.columns) - (stack.columns - 1) / 2) * stack.columnWidth + x,
        row * stack.spacing + part.y * (1 - squash) + lift, part.z * size + z);
      poseMatrix.compose(posePosition, poseRotation, poseScale); part.mesh.setMatrixAt(i, poseMatrix);
    }
  }
  for (const part of stack.parts) part.mesh.instanceMatrix.needsUpdate = true;
  stack.animated = animated;
  return stack;
}

export function setCarryStackCount(stack, count) {
  if (stack.count !== undefined && stack.count !== count) {
    stack.popRemaining = count > stack.count ? POP_SECONDS : 0; stack.popIndex = count - 1;
  }
  stack.count = count;
  if (!count) { stack.strength = 0; stack.animated = false; }
  return stack;
}

export function createProductVisuals(material) {
  const products = {
    gear: {
      base: createSourceGeometry('burger', { size: [.52, .16, .52], vertexColor: point => point.y > .105 ? '#bd35db' : point.y > .06 ? '#35204f' : '#a021b4' }),
      detail: new THREE.BufferGeometry(),
      baseMaterial: new THREE.MeshLambertMaterial({ vertexColors: true }),
      detailMaterial: material('#d9e8ed'),
    },
    potion: {
      base: createSourceGeometry('cup', { size: [.28, .30, .28], vertexColor: point => point.y > .24 ? '#fff0a6' : '#008d52' }),
      detail: new THREE.BufferGeometry(),
      baseMaterial: new THREE.MeshLambertMaterial({ vertexColors: true }),
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
    stack.parts = [{ mesh: stack.base, y: 0, z: 0 }, { mesh: stack.detail, y: 0, z: 0 }];
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
      mesh.boundingBox.expandByScalar(.12); mesh.boundingBox.getBoundingSphere(mesh.boundingSphere);
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
      if (product.baseMaterial.vertexColors) product.baseMaterial.dispose();
    }
  }

  return { set, animate: (parent, motion) => animateCarryStack(parent.userData.productStack, motion), dispose };
}
