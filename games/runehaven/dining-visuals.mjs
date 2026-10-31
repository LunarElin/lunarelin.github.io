import { THREE } from './asset-loader.mjs';
import { createSourceGeometry } from './source-meshes.mjs';
import { DINING_RULES, getDiningLayout } from './dining.mjs';
import { CARRY_SPACING, animateCarryStack, setCarryStackCount } from './product-visuals.mjs';

const STACK_CAPACITY = 60;

// Source burger and empty wrapper keep the original food silhouette. Geometry
// is palette-colored once and shared by stock, cargo, guests and dining places.
function dishGeometry(dirty) {
  return createSourceGeometry(dirty ? 'emptyDish' : 'burger', {
    size: [.46, dirty ? .03 : .143, .46],
    vertexColor: point => dirty ? '#705344' : point.y > .1 ? '#e89b22' : point.y > .075 ? '#238b2e' : point.y > .045 ? '#5c281d' : '#e89b22',
  });
}

// Keep the async entry point compatible with the existing asset-library caller.
// Furniture is deliberately made from shared untextured blocks now.
export async function createDiningVisuals(scene) {
  const group = new THREE.Group(); group.name = 'inn-dining'; group.visible = false; scene.add(group);
  const mealGeometry = dishGeometry(false), dirtyGeometry = dishGeometry(true);
  const furnitureGeometries = new Set();
  function furnitureGeometry(key, size) {
    const geometry = createSourceGeometry(key, { size, vertexColor: point => key === 'table' && point.y < size[1] * .8 ? '#2b3f49' : '#ffffff' }); furnitureGeometries.add(geometry); return geometry;
  }
  const chairGeometry = furnitureGeometry('chair', [.5, .65, .5]);
  const furnitureMaterials = new Map();
  function material(color) {
    if (!furnitureMaterials.has(color)) {
      const result = new THREE.MeshLambertMaterial({ color, vertexColors: true }); result.userData.diningShared = true;
      furnitureMaterials.set(color, result);
    }
    return furnitureMaterials.get(color);
  }
  const cleanTable = material('#ead2a0'), dirtyTable = material('#82664e');
  const diningTableGeometry = furnitureGeometry('table', [1.6, .65, 1.1]);
  function table(name, height, width = 1.6, depth = 1.1) {
    const result = new THREE.Group(); result.name = name;
    const top = new THREE.Mesh(diningTableGeometry, cleanTable); top.name = 'dining-table-top';
    top.castShadow = top.receiveShadow = true; result.add(top);
    return { object: result, top };
  }
  function chair(name) {
    const result = new THREE.Mesh(chairGeometry, material('#254c72')); result.name = name;
    result.castShadow = true; return result;
  }
  const counter = new THREE.Group(), kitchen = new THREE.Group();
  counter.name = 'dining-counter'; kitchen.name = 'dining-kitchen'; group.add(counter, kitchen);
  const servingTable = new THREE.Mesh(furnitureGeometry('table', [1.9, .71, 1.3]), material('#e5d09b'));
  servingTable.castShadow = servingTable.receiveShadow = true; counter.add(servingTable);
  const stove = new THREE.Mesh(createSourceGeometry('grill', { bounds: { minX: -.95, maxX: -.1, minY: 0, maxY: 1.08, minZ: -.65, maxZ: .65 } }), material('#34495b'));
  const kitchenOutput = new THREE.Mesh(createSourceGeometry('table', { bounds: { minX: -.1, maxX: .95, minY: 0, maxY: .71, minZ: -.65, maxZ: .65 }, vertexColor: point => point.y > .56 ? '#ffffff' : '#2b3f49' }), material('#e5d09b'));
  for (const mesh of [stove, kitchenOutput]) { furnitureGeometries.add(mesh.geometry); mesh.castShadow = mesh.receiveShadow = true; kitchen.add(mesh); }
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
      stack.boundingBox.expandByScalar(.12); stack.boundingBox.getBoundingSphere(stack.boundingSphere);
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
    for (const geometry of [mealGeometry, dirtyGeometry, ...furnitureGeometries]) if (!disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry); geometry.dispose();
    }
    for (const material of [foodMaterial, ...furnitureMaterials.values()]) if (!disposedMaterials.has(material)) {
      disposedMaterials.add(material); material.dispose();
    }
  }

  return { update, setGuestMeal, setFoodStack, animateFoodStack, dispose };
}
