import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DINING_RULES, getDiningLayout } from './dining.mjs';

const STACK_CAPACITY = 60;

// Food and used dishes are each one merged mesh; all guests share these buffers.
function dishGeometry(dirty) {
  const parts = [];
  function part(geometry, color, x, y, z) {
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(x, y, z); parts.push(geometry);
  }
  part(new THREE.CylinderGeometry(.23, .16, .13, 8), dirty ? '#bca991' : '#ead8b6', 0, .065, 0);
  part(new THREE.CylinderGeometry(.187, .187, .012, 8), dirty ? '#8d7358' : '#ae572f', 0, .137, 0);
  if (dirty) {
    for (const [x, z] of [[.27, .06], [-.21, .18], [.05, -.27]]) part(new THREE.BoxGeometry(.045, .025, .04), '#a57643', x, .014, z);
  } else {
    part(new THREE.BoxGeometry(.14, .075, .12), '#edb863', .075, .176, .04);
    part(new THREE.BoxGeometry(.055, .035, .05), '#86a864', -.075, .157, -.045);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

export async function createDiningVisuals(scene, library) {
  const models = await Promise.all([
    library.load('table', { height: .7, shadows: false }),
    library.load('table', { height: .7, shadows: false }),
    ...Array.from({ length: DINING_RULES.tables }, () => library.load('table', { height: .65, shadows: false })),
    ...Array.from({ length: DINING_RULES.tables }, () => library.load('chair', { height: .65, shadows: false })),
    library.load('cauldron', { height: .4, shadows: false }),
  ]);
  const group = new THREE.Group(); group.name = 'inn-dining'; group.visible = false; scene.add(group);
  const mealGeometry = dishGeometry(false), dirtyGeometry = dishGeometry(true);
  const foodMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
  foodMaterial.userData.diningShared = true;
  const clonedMaterials = new Set();
  for (const { object } of models) object.traverse((node) => {
    for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) clonedMaterials.add(material);
  });
  const instances = new Set();
  function foodInstances(capacity, name) {
    const mesh = new THREE.InstancedMesh(mealGeometry, foodMaterial, capacity);
    mesh.name = name; instances.add(mesh);
    mesh.addEventListener('dispose', () => { instances.delete(mesh); });
    return mesh;
  }
  const counter = models[0].object, kitchen = models[1].object;
  counter.name = 'dining-counter'; kitchen.name = 'dining-kitchen'; group.add(counter, kitchen);
  const cauldron = models.at(-1).object; cauldron.position.set(-.65, .71, -.22); kitchen.add(cauldron);
  const prepared = foodInstances(DINING_RULES.foodCapacity, 'dining-prepared-food'); counter.add(prepared);
  const cooked = foodInstances(DINING_RULES.foodCapacity, 'dining-kitchen-food'); kitchen.add(cooked);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < DINING_RULES.foodCapacity; i++) {
    matrix.makeTranslation(((i % 4) - 1.5) * .45, .71, (Math.floor(i / 4) - .5) * .47);
    prepared.setMatrixAt(i, matrix);
    matrix.makeTranslation(.08 + (i % 2) * .48, .71 + Math.floor(i / 4) * .22, (Math.floor(i / 2) % 2 - .5) * .48);
    cooked.setMatrixAt(i, matrix);
  }
  for (const mesh of [prepared, cooked]) {
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  }
  const tables = Array.from({ length: DINING_RULES.tables }, (_, id) => {
    const table = models[id + 2].object, chair = models[id + DINING_RULES.tables + 2].object;
    table.name = `dining-table-${id}`; chair.name = `dining-chair-${id}`;
    const dish = new THREE.Mesh(mealGeometry, foodMaterial); dish.name = 'dining-table-dish'; dish.position.y = .66; dish.visible = false;
    table.add(dish); group.add(table, chair);
    // The native back is -Z; after turning it, the guest faces -Z toward the table.
    chair.rotation.y = Math.PI;
    return { table, chair, dish };
  });
  let disposed = false, layoutStage;

  function update(state) {
    if (disposed) return;
    group.visible = Boolean(state.unlocks?.inn);
    if (!group.visible) return;
    if (state.stage !== layoutStage) {
      layoutStage = state.stage;
      const layout = getDiningLayout(state);
      counter.position.set(layout.counter.x, 0, layout.counter.z);
      kitchen.position.set(layout.kitchen.x, 0, layout.kitchen.z);
      for (const position of layout.tables) {
        const { table, chair } = tables[position.id];
        table.position.set(position.x, 0, position.z); chair.position.set(position.seat.x, 0, position.seat.z);
      }
    }
    prepared.count = Math.max(0, Math.min(DINING_RULES.foodCapacity, Math.floor(state.dining?.food || 0)));
    prepared.visible = prepared.count > 0;
    cooked.count = Math.max(0, Math.min(DINING_RULES.foodCapacity, Math.floor(state.dining?.kitchen || 0)));
    cooked.visible = cooked.count > 0;
    for (let i = 0; i < tables.length; i++) {
      const data = state.dining?.tables[i], dish = tables[i].dish;
      dish.visible = data?.status === 'eating' || data?.status === 'dirty';
      dish.geometry = data?.status === 'dirty' ? dirtyGeometry : mealGeometry;
      const progress = data?.status === 'dirty' ? Math.max(0, Math.min(1, (data.cleanProgress || 0) / DINING_RULES.cleanSeconds)) : 0;
      dish.scale.setScalar(1 - progress * .55);
    }
  }

  function setGuestMeal(actor, show) {
    if (disposed || !actor.carry) return;
    let meal = actor.carry.userData.diningMeal;
    if (!meal || meal.parent !== actor.carry) {
      if (!show) return;
      meal = new THREE.Mesh(mealGeometry, foodMaterial); meal.name = 'dining-carried-meal';
      actor.carry.userData.diningMeal = meal; actor.carry.add(meal);
    }
    meal.visible = Boolean(show);
  }

  function setFoodStack(parent, count, columns = 1, spacing = .22) {
    if (disposed) return;
    count = Math.max(0, Math.min(STACK_CAPACITY, Math.floor(Number(count) || 0)));
    columns = Math.max(1, Math.min(STACK_CAPACITY, Math.floor(Number(columns) || 1)));
    spacing = Number.isFinite(Number(spacing)) && Number(spacing) >= 0 ? Number(spacing) : .22;
    let stack = parent.userData.diningFoodStack;
    if (!stack || stack.parent !== parent) {
      stack = foodInstances(STACK_CAPACITY, 'dining-food-stack');
      parent.userData.diningFoodStack = stack; parent.add(stack);
    }
    if (stack.userData.foodColumns !== columns || stack.userData.foodSpacing !== spacing) {
      for (let i = 0; i < STACK_CAPACITY; i++) {
        matrix.makeTranslation(((i % columns) - (columns - 1) / 2) * .5, Math.floor(i / columns) * spacing, 0);
        stack.setMatrixAt(i, matrix);
      }
      stack.userData.foodColumns = columns; stack.userData.foodSpacing = spacing;
      stack.instanceMatrix.needsUpdate = true; stack.computeBoundingBox(); stack.computeBoundingSphere();
    }
    stack.count = count; stack.visible = count > 0;
    return stack;
  }

  function dispose(disposedGeometries = new Set(), disposedMaterials = new Set()) {
    if (disposed) return;
    disposed = true; group.removeFromParent();
    for (const mesh of [...instances]) mesh.dispose();
    for (const geometry of [mealGeometry, dirtyGeometry]) if (!disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry); geometry.dispose();
    }
    for (const material of [foodMaterial, ...clonedMaterials]) if (!disposedMaterials.has(material)) {
      disposedMaterials.add(material); material.dispose();
    }
    // GLB geometry and textures belong to the asset library and remain shared.
  }

  return { update, setGuestMeal, setFoodStack, dispose };
}
