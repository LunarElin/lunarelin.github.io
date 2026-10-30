import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DINING_RULES, getDiningLayout } from './dining.mjs';

const STACK_CAPACITY = 60;

// A bowl and its fill read clearly even in a small overhead stack.
function dishGeometry(dirty) {
  const parts = [];
  function part(geometry, color, y) {
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(0, y, 0); parts.push(geometry);
  }
  part(new THREE.CylinderGeometry(.23, .16, .13, 8), dirty ? '#b8b6af' : '#fff1cd', .065);
  part(new THREE.CylinderGeometry(.187, .187, .012, 8), dirty ? '#8f938d' : '#e98042', .137);
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

// Keep the async entry point compatible with the existing asset-library caller.
// Furniture is deliberately made from shared untextured blocks now.
export async function createDiningVisuals(scene) {
  const group = new THREE.Group(); group.name = 'inn-dining'; group.visible = false; scene.add(group);
  const mealGeometry = dishGeometry(false), dirtyGeometry = dishGeometry(true);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const furnitureMaterials = new Map();
  function material(color) {
    if (!furnitureMaterials.has(color)) {
      const result = new THREE.MeshLambertMaterial({ color }); result.userData.diningShared = true;
      furnitureMaterials.set(color, result);
    }
    return furnitureMaterials.get(color);
  }
  function piece(parent, geometry, color, x, y, z, sx, sy, sz) {
    const result = new THREE.Mesh(geometry, material(color));
    result.position.set(x, y, z); result.scale.set(sx, sy, sz); parent.add(result); return result;
  }
  const cleanTable = material('#fff0cf'), dirtyTable = material('#b9a4b8');
  function table(name, height, width = 1.6, depth = 1.1, support = '#a9c5d0') {
    const result = new THREE.Group(); result.name = name;
    const top = piece(result, boxGeometry, '#fff0cf', 0, height - .07, 0, width, .14, depth); top.name = 'dining-table-top';
    piece(result, cylinderGeometry, support, 0, (height - .14) / 2, 0, .19, height - .14, .19);
    return { object: result, top };
  }
  function chair(name) {
    const result = new THREE.Group(); result.name = name;
    piece(result, boxGeometry, '#99c4d4', 0, .31, 0, .5, .12, .5);
    piece(result, boxGeometry, '#99c4d4', 0, .49, -.2, .5, .32, .1);
    piece(result, cylinderGeometry, '#a9c5d0', 0, .14, 0, .12, .28, .12);
    return result;
  }
  const counter = table('dining-counter', .7, 1.9, 1.3, '#90cfc8').object;
  const kitchen = table('dining-kitchen', .7, 1.9, 1.3, '#dfae86').object;
  group.add(counter, kitchen);
  piece(kitchen, cylinderGeometry, '#687b86', -.55, .83, -.1, .3, .26, .3);
  piece(kitchen, cylinderGeometry, '#e98042', -.55, .965, -.1, .25, .012, .25);
  const foodMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  foodMaterial.userData.diningShared = true;
  const instances = new Set();
  function foodInstances(capacity, name) {
    const result = new THREE.InstancedMesh(mealGeometry, foodMaterial, capacity);
    result.name = name; instances.add(result);
    result.addEventListener('dispose', () => { instances.delete(result); }); return result;
  }
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
    const furniture = table(`dining-table-${id}`, .65), seat = chair(`dining-chair-${id}`);
    const dish = new THREE.Mesh(mealGeometry, foodMaterial); dish.name = 'dining-table-dish'; dish.position.y = .66; dish.visible = false;
    furniture.object.add(dish); group.add(furniture.object, seat);
    // After turning it, the back stays behind the guest facing the table.
    seat.rotation.y = Math.PI;
    return { table: furniture.object, top: furniture.top, chair: seat, dish };
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
      const data = state.dining?.tables[i], { table, chair, dish, top } = tables[i];
      table.visible = chair.visible = data?.status !== 'locked';
      dish.visible = data?.status === 'eating' || data?.status === 'dirty';
      dish.geometry = data?.status === 'dirty' ? dirtyGeometry : mealGeometry;
      top.material = data?.status === 'dirty' ? dirtyTable : cleanTable;
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
    for (const geometry of [mealGeometry, dirtyGeometry, boxGeometry, cylinderGeometry]) if (!disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry); geometry.dispose();
    }
    for (const material of [foodMaterial, ...furnitureMaterials.values()]) if (!disposedMaterials.has(material)) {
      disposedMaterials.add(material); material.dispose();
    }
  }

  return { update, setGuestMeal, setFoodStack, dispose };
}
