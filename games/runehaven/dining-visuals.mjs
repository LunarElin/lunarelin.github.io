import { THREE } from './asset-loader.mjs';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DINING_RULES, getDiningLayout } from './dining.mjs';
import { CARRY_SPACING, animateCarryStack, setCarryStackCount } from './product-visuals.mjs';

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
  const chairParts = [];
  for (const [geometry, color, x, y, z, sx, sy, sz] of [
    [boxGeometry, '#99c4d4', 0, .31, 0, .5, .12, .5],
    [boxGeometry, '#99c4d4', 0, .49, -.2, .5, .32, .1],
    [cylinderGeometry, '#a9c5d0', 0, .14, 0, .12, .28, .12],
  ]) {
    const part = geometry.clone(); part.scale(sx, sy, sz); part.translate(x, y, z);
    const rgb = new THREE.Color(color), colors = new Float32Array(part.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3)); chairParts.push(part);
  }
  const chairGeometry = mergeGeometries(chairParts);
  for (const part of chairParts) part.dispose();
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
    const result = new THREE.Mesh(chairGeometry, foodMaterial); result.name = name;
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
    const furniture = table(`dining-table-${id}`, .65);
    const seats = Array.from({ length: DINING_RULES.seatsPerTable }, (_, seatId) => {
      const seat = chair(`dining-chair-${id}${seatId ? `-${seatId}` : ''}`);
      const dish = new THREE.Mesh(mealGeometry, foodMaterial); dish.name = `dining-table-dish${seatId ? `-${seatId}` : ''}`; dish.visible = false;
      furniture.object.add(dish); group.add(seat); return { chair: seat, dish };
    });
    group.add(furniture.object);
    return { table: furniture.object, top: furniture.top, seats };
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
        const { table, seats } = tables[position.id]; table.position.set(position.x, 0, position.z);
        for (const seat of position.seats) {
          const visual = seats[seat.id];
          visual.chair.position.set(seat.seatPoint.x, 0, seat.seatPoint.z); visual.chair.rotation.y = seat.yaw;
          visual.dish.position.set(seat.dishPoint.x - position.x, seat.dishPoint.y, seat.dishPoint.z - position.z);
        }
      }
    }
    prepared.count = Math.max(0, Math.min(DINING_RULES.foodCapacity, Math.floor(state.dining?.food || 0)));
    prepared.visible = prepared.count > 0;
    cooked.count = Math.max(0, Math.min(DINING_RULES.foodCapacity, Math.floor(state.dining?.kitchen || 0)));
    cooked.visible = cooked.count > 0;
    for (let i = 0; i < tables.length; i++) {
      const data = state.dining?.tables[i], { table, seats, top } = tables[i];
      table.visible = Boolean(data && data.status !== 'locked');
      const active = (data?.seats || []).filter(seat => seat.status !== 'locked');
      top.material = active.length && active.every(seat => seat.status === 'dirty') ? dirtyTable : cleanTable;
      for (let seatId = 0; seatId < seats.length; seatId++) {
        const seat = data?.seats?.[seatId], { chair, dish } = seats[seatId];
        chair.visible = table.visible && seat?.status !== 'locked';
        dish.visible = seat?.status === 'eating' || seat?.status === 'dirty';
        dish.geometry = seat?.status === 'dirty' ? dirtyGeometry : mealGeometry;
        const progress = seat?.status === 'dirty' ? Math.max(0, Math.min(1, (seat.cleanProgress || 0) / DINING_RULES.cleanSeconds)) : 0;
        dish.scale.setScalar(1 - progress * .55);
      }
    }
  }

  function setGuestMeal(actor, count, motion) {
    if (disposed || !actor.root) return;
    count = Math.max(0, Math.min(STACK_CAPACITY, Math.floor(Number(count) || 0)));
    if (!count && !actor.root.userData.diningFoodStack) return;
    const meal = setFoodStack(actor.root, count); meal.name = 'dining-carried-meal';
    meal.position.set(0, .65, .35);
    if (motion) animateFoodStack(actor.root, motion);
    return meal;
  }

  function setFoodStack(parent, count, columns = 1, spacing = CARRY_SPACING.food) {
    if (disposed) return;
    count = Math.max(0, Math.min(STACK_CAPACITY, Math.floor(Number(count) || 0)));
    columns = Math.max(1, Math.min(STACK_CAPACITY, Math.floor(Number(columns) || 1)));
    spacing = Number.isFinite(Number(spacing)) && Number(spacing) >= 0 ? Number(spacing) : CARRY_SPACING.food;
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
      stack.boundingBox.expandByScalar(.04); stack.boundingBox.getBoundingSphere(stack.boundingSphere);
      stack.userData.carryStack = { parts: [{ mesh: stack, y: 0, z: 0 }], columns, spacing, columnWidth: .5 };
    }
    stack.count = count; stack.visible = count > 0;
    setCarryStackCount(stack.userData.carryStack, count);
    return stack;
  }

  function animateFoodStack(parent, motion) {
    return animateCarryStack(parent.userData.diningFoodStack?.userData.carryStack, motion);
  }

  function dispose(disposedGeometries = new Set(), disposedMaterials = new Set()) {
    if (disposed) return;
    disposed = true; group.removeFromParent();
    for (const mesh of [...instances]) mesh.dispose();
    for (const geometry of [mealGeometry, dirtyGeometry, boxGeometry, cylinderGeometry, chairGeometry]) if (!disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry); geometry.dispose();
    }
    for (const material of [foodMaterial, ...furnitureMaterials.values()]) if (!disposedMaterials.has(material)) {
      disposedMaterials.add(material); material.dispose();
    }
  }

  return { update, setGuestMeal, setFoodStack, animateFoodStack, dispose };
}
