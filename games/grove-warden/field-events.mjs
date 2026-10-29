import { EQUIPMENT } from './equipment.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeCamps = (state, context) => context.camps?.(state) ?? [context.world.camp];
const accessibleMinZ = (state, context) => context.unlockedMinZ?.(state) ?? (state.progress.unlockedDeep ? context.world.minZ : context.world.gateZ + .5);
export function createFieldState() {
  return { items: [], hazards: [], boon: null, nextDiscovery: 9, nextHazard: 11, discoveries: 0, nextId: 1 };
}
export function clearFieldCombat(state) {
  if (!state.fieldEvents) return;
  state.fieldEvents.hazards = []; state.fieldEvents.boon = null;
}
function nearbyZone(state, context) {
  let nearest = null, nearestEdge = Infinity;
  for (const zone of context.zones) {
    if (context.zoneUnlocked ? !context.zoneUnlocked(state, zone) : zone.deep && !state.progress.unlockedDeep) continue;
    const edge = distance(state.player, zone) - zone.radius;
    if (edge <= 2 && edge < nearestEdge) { nearest = zone; nearestEdge = edge; }
  }
  return nearest;
}
function discoveryPoint(state, context, zone) {
  for (let i = 0; i < 8; i++) {
    const angle = context.random(state) * Math.PI * 2, radius = (.3 + context.random(state) * .45) * zone.radius;
    const point = { x: zone.x + Math.cos(angle) * radius, z: zone.z + Math.sin(angle) * radius };
    if (point.x < context.world.minX + .8 || point.x > context.world.maxX - .8 || point.z < accessibleMinZ(state, context) + .8 || point.z > context.world.maxZ - .8) continue;
    if (distance(point, state.player) < 2.6 || safeCamps(state, context).some(camp => distance(point, camp) < camp.radius + 1.5)) continue;
    return point;
  }
  return null;
}
function spawnDiscovery(state, context, zone) {
  const field = state.fieldEvents, point = discoveryPoint(state, context, zone);
  if (!point) { field.nextDiscovery = 2; return; }
  const kind = field.discoveries === 0 || context.random(state) < .55 ? 'chest' : 'blessing';
  const item = { id: field.nextId++, ...point, kind, zoneId: zone.id, enemyType: zone.type, life: 45 };
  if (kind === 'chest') {
    item.equipmentId = EQUIPMENT[Math.min(EQUIPMENT.length - 1, Math.floor(context.random(state) * EQUIPMENT.length))].id;
    item.scrolls = 2; item.gold = 6 + Math.min(24, state.player.level * 2);
  }
  field.items.push(item); field.discoveries++;
  field.nextDiscovery = 18 + context.random(state) * 8;
  state.events.push({ type: 'field-discovery', ...point, kind });
}
function spawnHazard(state, context) {
  const field = state.fieldEvents, pattern = context.random(state) < .5 ? 'spores' : 'thorn-line';
  const angle = context.random(state) * Math.PI * 2, centers = [];
  const offsets = pattern === 'spores' ? [0] : [-1.6, 0, 1.6];
  const radius = pattern === 'spores' ? 1.45 : .9;
  const minZ = accessibleMinZ(state, context);
  for (const offset of offsets) {
    const point = {
      x: clamp(state.player.x + Math.cos(angle) * offset, context.world.minX + radius, context.world.maxX - radius),
      z: clamp(state.player.z + Math.sin(angle) * offset, minZ + radius, context.world.maxZ - radius), radius,
    };
    if (safeCamps(state, context).every(camp => distance(point, camp) > camp.radius + radius)) centers.push(point);
  }
  if (!centers.length) { field.nextHazard = 3; return; }
  field.hazards.push({ id: field.nextId++, pattern, centers, x: state.player.x, z: state.player.z,
    phase: 'warning', time: 1.15, warnTime: 1.15, blastTime: .35, resolved: false,
    damage: Math.min(12, 4 + Math.floor(state.player.level * .6)) });
  field.nextHazard = 10 + context.random(state) * 5;
}
export function advanceFieldEvents(state, dt, context) {
  if (state.phase !== 'playing' || state.player.hp <= 0 || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(.05, dt);
  const field = state.fieldEvents ??= createFieldState(), player = state.player;
  if (field.boon) {
    const activeTime = Math.min(dt, field.boon.remaining);
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .01 * activeTime);
    field.boon.remaining -= dt;
    if (field.boon.remaining <= 0) field.boon = null;
  }
  for (const item of field.items) {
    item.life -= dt;
    if (item.life <= 0 || distance(item, player) > 1.35) continue;
    item.life = 0;
    if (item.kind === 'chest') {
      const rewards = context.openTreasure(state, item);
      state.events.push({ type: 'field-chest', x: item.x, z: item.z, ...rewards });
    } else {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .15);
      field.boon = { remaining: 15 };
      state.events.push({ type: 'field-boon', x: item.x, z: item.z, duration: 15 });
    }
  }
  field.items = field.items.filter(item => item.life > 0);
  for (const hazard of field.hazards) {
    hazard.time -= dt;
    if (hazard.phase !== 'warning' || hazard.time > 1e-9 || hazard.resolved) continue;
    hazard.resolved = true; hazard.phase = 'blast'; hazard.time += hazard.blastTime;
    const center = hazard.centers.find(point => distance(point, player) <= point.radius + player.radius * .3);
    if (center) context.hurtPlayer(state, hazard.damage, center.x, center.z);
    state.events.push({ type: 'field-hazard', x: hazard.x, z: hazard.z, pattern: hazard.pattern });
  }
  field.hazards = field.hazards.filter(hazard => hazard.time > 0);
  if (state.phase !== 'playing' || state.inCamp) return;
  const zone = nearbyZone(state, context);
  if (!zone) return;
  field.nextDiscovery = Math.max(0, field.nextDiscovery - dt);
  if (field.nextDiscovery <= 0 && field.items.length < 2) spawnDiscovery(state, context, zone);
  const fighting = state.enemies.some(enemy => enemy.hp > 0 && distance(enemy, player) <= 6.5);
  if (!fighting) return;
  field.nextHazard = Math.max(0, field.nextHazard - dt);
  if (field.nextHazard <= 0 && field.hazards.length < 2) spawnHazard(state, context);
}
