import { buildPixelArt } from './pixel-art.mjs';
import { WORLD, HUNT_ZONES, STAGES, isStageUnlocked } from './rules.mjs';
import { PIXEL_COLORS as C } from './theme.mjs';

// One authored texel equals one buffer pixel and exactly two CSS pixels.
export const PIXEL_GRID = Object.freeze({ scale: 2, worldPixels: 12 });
export function computePixelViewport(width, height) {
  const w = Math.max(1, Math.floor(width / 2)), h = Math.max(1, Math.floor(height / 2));
  return { width: w, height: h, scale: 2, offsetX: Math.floor((width - w * 2) / 2), offsetY: Math.floor((height - h * 2) / 2) };
}
export function projectPixel(worldX, worldZ, cameraX, cameraZ, viewport) {
  return { x: Math.round(worldX * 12 - cameraX + Math.floor(viewport.width / 2)), y: Math.round(worldZ * 12 - cameraZ + Math.floor(viewport.height * .54)) };
}
const STAFF = { sprout: C.leaf, thorn: C.red, moon: C.blue, ember: C.orange };
const STYLE = { single: C.leaf, burst: C.red, spread: C.blue, explosive: C.orange };
const MELEE_SPRITES = { sword: 'druidSword', axe: 'druidAxe', spear: 'druidSpear' };
const DIGITS = ['11111100011000110001100011000111111', '00100011000010000100001000010001110', '11111000010000111111100001000011111', '11111000010000101111000010000111111', '10001100011000111111000010000100001', '11111100001000011111000010000111111', '11111100001000011111100011000111111', '11111000010001000100010000100001000', '11111100011000111111100011000111111', '11111100011000111111000010000111111'];
const ROAD = [[0, 23], [0, 16], [0, 9], [-1, 3], [1, -5], [0, -14], [0, -17], [-1, -28], [0, -42], [0, -44], [-1, -56], [0, -70], [0, -72], [1, -84], [0, -98]];
function roadX(z) {
  for (let i = 1; i < ROAD.length; i++) if (z >= ROAD[i][1]) { const a = ROAD[i - 1], b = ROAD[i], t = (z - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; }
  return 0;
}
const direction = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? dx < 0 ? 'left' : 'right' : dz < 0 ? 'up' : 'down';
const spriteId = e => e.type === 'boss' ? e.variant === 'sky' ? 'skyBoss' : e.variant === 'ancient' ? 'ancientBoss' : 'boss' : e.type;

export async function createRenderer(container) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  canvas.className = 'pixel-world'; canvas.setAttribute('aria-label', '도트 숲 전투 화면');
  Object.assign(canvas.style, { position: 'absolute', imageRendering: 'pixelated', touchAction: 'none' });
  container.appendChild(canvas);
  const art = buildPixelArt(), cached = new Map();
  const rgba = art.palette.map(c => c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255] : [0, 0, 0, 0]);
  let sourceFrames = 0;
  for (const [id, asset] of Object.entries(art.sprites)) {
    const frames = {}, flashes = {};
    for (const [dir, arrays] of Object.entries(asset.frames)) {
      frames[dir] = []; flashes[dir] = [];
      for (const pixels of arrays) {
        const image = document.createElement('canvas'); image.width = asset.width; image.height = asset.height;
        const source = image.getContext('2d'), data = source.createImageData(asset.width, asset.height);
        for (let i = 0; i < pixels.length; i++) data.data.set(rgba[pixels[i]], i * 4);
        source.putImageData(data, 0, 0); source.imageSmoothingEnabled = false; frames[dir].push(image); sourceFrames++;
        if (asset.frames.up) {
          const flash = document.createElement('canvas'); flash.width = asset.width; flash.height = asset.height;
          const fc = flash.getContext('2d');
          for (let i = 0; i < pixels.length; i++) if (pixels[i]) data.data.set(rgba[6], i * 4);
          fc.putImageData(data, 0, 0); fc.imageSmoothingEnabled = false; flashes[dir].push(flash);
        }
      }
    }
    cached.set(id, { ...asset, frames, flashes });
  }
  let viewport, disposed = false, cameraX = 0, cameraZ = 0, clock = 0, frameCount = 0, calls = 0, entities = 0;
  const particles = [], impacts = [], pulses = [], labels = [], attacks = [], hitTimes = new Map(), positions = new Map(), seenEvents = new WeakSet();
  function resize() {
    if (disposed) return;
    const r = container.getBoundingClientRect(); viewport = computePixelViewport(r.width || container.clientWidth || 390, r.height || container.clientHeight || 844);
    if (canvas.width !== viewport.width) canvas.width = viewport.width;
    if (canvas.height !== viewport.height) canvas.height = viewport.height;
    Object.assign(canvas.style, { width: `${viewport.width * 2}px`, height: `${viewport.height * 2}px`, left: `${viewport.offsetX}px`, top: `${viewport.offsetY}px` }); ctx.imageSmoothingEnabled = false;
  }
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(container); resize();
  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); calls++; }
  function line(x0, y0, x1, y1, color, size = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { rect(x0, y0, size, size, color); if (x0 === x1 && y0 === y1) break; const e = 2 * err; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } }
  }
  function polygon(points, color) {
    const vertices = points.map(([x, y]) => [Math.round(x), Math.round(y)]), min = Math.max(0, Math.min(...vertices.map(p => p[1]))), max = Math.min(viewport.height - 1, Math.max(...vertices.map(p => p[1])));
    for (let y = min; y <= max; y++) {
      const crossings = [];
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [ax, ay] = vertices[j], [bx, by] = vertices[i];
        if ((ay <= y && by > y) || (by <= y && ay > y)) crossings.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) { const left = Math.max(0, Math.ceil(crossings[i])), right = Math.min(viewport.width - 1, Math.floor(crossings[i + 1])); if (right >= left) rect(left, y, right - left + 1, 1, color); }
    }
  }
  function ring(x, y, radius, color, dashed = false) {
    let a = Math.max(1, Math.round(radius)), b = 0, err = 1 - a;
    while (a >= b) {
      if (!dashed || b % 5 < 2) for (const [u, v] of [[a, b], [b, a], [-b, a], [-a, b], [-a, -b], [-b, -a], [b, -a], [a, -b]]) rect(x + u, y + v, 1, 1, color);
      b++; if (err < 0) err += 2 * b + 1; else { a--; err += 2 * (b - a) + 1; }
    }
  }
  const point = (x, z) => projectPixel(x, z, cameraX, cameraZ, viewport);
  const visible = (p, margin = 85) => p.x > -margin && p.x < viewport.width + margin && p.y > -margin && p.y < viewport.height + margin;
  function stamp(id, x, y, dir = 'down', frame = 0, flash = false, alpha = 1) {
    const s = cached.get(id); if (!s) return;
    const list = (flash ? s.flashes[dir] : null)?.length ? s.flashes[dir] : s.frames[dir] || s.frames.down;
    ctx.globalAlpha = alpha; ctx.drawImage(list[frame % list.length], Math.round(x) - s.anchorX, Math.round(y) - s.anchorY); ctx.globalAlpha = 1; calls++;
  }
  const props = [];
  for (let i = 0; i < 42; i++) {
    const z = 21 - i * 2.9;
    for (const side of [-1, 1]) props.push({ id: i % 8 === 3 && side === 1 && cached.has('treeBlossom') ? 'treeBlossom' : i % 3 ? 'tree' : 'pine', x: side * (9.4 + (i * 7 % 5) * .7), z: z + (side < 0 ? .8 : -.7), tree: true });
    if (i % 2 === 0) props.push({ id: i % 4 ? 'rock' : 'flower', x: (i % 3 ? 1 : -1) * (4.2 + i % 4), z: z - 1.4 });
  }
  for (const stage of STAGES) { const c = stage.camp; props.push({ id: 'campfire', x: c.x - 1.7, z: c.z + .7 }, { id: 'chest', x: c.x + 1.6, z: c.z + 1.6 }, { id: 'forge', x: c.x + 2.4, z: c.z - 1.5 }, { id: 'npc', x: c.x - 2.1, z: c.z - .9 }); }
  // Bake the quiet terrain once. Boundaries use two-pixel steps rather than
  // exposing sixteen-pixel tile rectangles; camera movement only copies a crop.
  const terrain = document.createElement('canvas'), terrainX = WORLD.minX * 12 - 32, terrainZ = WORLD.minZ * 12 - 32;
  terrain.width = (WORLD.maxX - WORLD.minX) * 12 + 64; terrain.height = (WORLD.maxZ - WORLD.minZ) * 12 + 64;
  const tc = terrain.getContext('2d'); tc.imageSmoothingEnabled = false;
  const hash = (x, z) => ((Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0);
  const surface = tc.createImageData(terrain.width, terrain.height), edgeBottom = [], colors = Object.fromEntries(Object.entries(C).map(([key, value]) => [key, rgba[art.palette.indexOf(value)]]));
  for (let x = 0; x < terrain.width; x++) { const wx = (terrainX + x) / 12; edgeBottom.push((WORLD.maxZ + .15 + Math.sin(wx * .8) * .1 + Math.sin(wx * 2.3) * .08) * 12); }
  for (let y = 0; y < terrain.height; y++) {
    const wy = terrainZ + y, wz = wy / 12, stage = STAGES.find(s => wz >= s.minZ) || STAGES[3], tiles = art.sprites[stage.id === 'sky' ? 'groundSky' : stage.id === 'ancient' ? 'groundStone' : 'groundGrass'].frames.down;
    const edgeLeft = (WORLD.minX - .15 + Math.sin(wz * 1.1) * .1) * 12, edgeRight = (WORLD.maxX + .15 + Math.sin(wz * .9) * .1) * 12;
    for (let x = 0; x < terrain.width; x++) {
      const wx = terrainX + x, offset = (y * terrain.width + x) * 4, bottom = edgeBottom[x];
      if (wy < WORLD.minZ * 12 || wx < edgeLeft || wx > edgeRight || wy > bottom) {
        if (wy > bottom && wy < bottom + 7 + hash(x >> 3, 3) % 3 && wx >= edgeLeft && wx <= edgeRight) surface.data.set(hash(x >> 2, y >> 2) % 3 ? colors.slate : colors.stone, offset);
        continue;
      }
      const tileHash = hash(Math.floor(wx / 16), Math.floor(wy / 16)), tile = tiles[tileHash % tiles.length], index = ((wy % 16 + 16) % 16) * 16 + ((wx % 16 + 16) % 16);
      const stone = stage.id === 'ancient' || stage.id === 'sky', textured = tileHash % (stone ? 3 : 4) === 0;
      surface.data.set(wy > bottom - 2 ? colors.forest : textured ? rgba[tile[index]] : stone ? colors.slate : colors.green, offset);
    }
  }
  tc.putImageData(surface, 0, 0);
  for (let y = 0; y < terrain.height; y += 2) {
    const wz = (terrainZ + y) / 12; if (wz < WORLD.minZ || wz > WORLD.maxZ) continue;
    const wobble = Math.sin(wz * 2.1) * .08 + Math.sin(wz * .71) * .11, spans = [[roadX(wz) - 1.55 - wobble, roadX(wz) + 1.55 + wobble]];
    for (const { camp } of STAGES) {
      const dz = (wz - camp.z) / (camp.radius * .83);
      if (Math.abs(dz) < 1) { const r = camp.radius * Math.sqrt(1 - dz * dz) + wobble; spans.push([camp.x - r, camp.x + r]); }
    }
    for (const zone of HUNT_ZONES) {
      const dz = (wz - zone.z) / (zone.radius * .57);
      if (Math.abs(dz) < 1) { const r = zone.radius * .52 * Math.sqrt(1 - dz * dz) + wobble; spans.push([zone.x - r, zone.x + r]); }
    }
    spans.sort((a, b) => a[0] - b[0]); const merged = [];
    for (const span of spans) { const last = merged.at(-1); if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]); }
    for (const [start, end] of merged) {
      const l = Math.round((Math.max(WORLD.minX, start) * 12 - terrainX) / 2) * 2, r = Math.round((Math.min(WORLD.maxX, end) * 12 - terrainX) / 2) * 2;
      tc.fillStyle = C.dirt; tc.fillRect(l, y, Math.max(1, r - l), 2);
      tc.fillStyle = C.dirtDark; tc.fillRect(l, y, 1, 2); tc.fillRect(r, y, 1, 2);
      if (hash(l, y) % 9 === 0) { tc.fillStyle = C.green; tc.fillRect(l - 1, y, 3, 1); tc.fillRect(r - 2, y + 1, 3, 1); }
      if (hash(r, y) % 17 === 0 && r - l > 12) { tc.fillStyle = C.dirtLight; tc.fillRect(l + 5 + hash(y, l) % (r - l - 10), y, 2, 1); }
    }
  }
  function ground() {
    const left = cameraX - Math.floor(viewport.width / 2), top = cameraZ - Math.floor(viewport.height * .54);
    const sx = Math.max(0, left - terrainX), sy = Math.max(0, top - terrainZ), dx = Math.max(0, terrainX - left), dy = Math.max(0, terrainZ - top);
    const w = Math.min(viewport.width - dx, terrain.width - sx), h = Math.min(viewport.height - dy, terrain.height - sy);
    if (w > 0 && h > 0) { ctx.drawImage(terrain, sx, sy, w, h, dx, dy, w, h); calls++; }
  }
  function valley() {
    rect(0, 0, viewport.width, viewport.height, C.sky);
    const base = point(0, WORLD.maxZ + 3).y, offset = ((cameraX % 64) + 64) % 64, first = Math.floor(cameraX / 64);
    for (const [layer, color, depth] of [[0, C.blue, 8], [1, C.navy, 38]]) {
      const ridge = [];
      for (let i = -1; i <= Math.ceil(viewport.width / 64) + 1; i++) ridge.push([i * 64 - offset, base + depth + hash(first + i, layer + 9) % 22]);
      polygon([...ridge, [viewport.width + 64, viewport.height + 64], [-64, viewport.height + 64]], color);
    }
    if (base > -25 && base < viewport.height + 25) {
      ctx.globalAlpha = .3;
      for (let i = -1; i <= Math.ceil(viewport.width / 128); i++) { const x = i * 128 - ((cameraX % 128 + 128) % 128), y = base - 13 + hash(first + i, 5) % 9; rect(x, y, 30, 3, C.cream); rect(x + 7, y - 2, 15, 2, C.cream); }
      ctx.globalAlpha = 1;
    }
  }
  function warning(x, z, radius, progress = 0) {
    const p = point(x, z); if (!visible(p)) return; const r = Math.round(radius * 12); ctx.globalAlpha = .14;
    for (let y = -r; y <= r; y += 6) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y))); rect(p.x - w, p.y + y, w * 2 + 1, 1, C.red); }
    ctx.globalAlpha = 1; ring(p.x, p.y, r, progress > .75 ? C.orange : C.red);
  }
  function lineWarning(enemy) {
    const p = point(enemy.warnX, enemy.warnZ); if (!visible(p, 130)) return;
    const dx = enemy.aimX * enemy.length * 12, dy = enemy.aimZ * enemy.length * 12, half = (enemy.width || .65) * 6;
    const nx = -enemy.aimZ * half, ny = enemy.aimX * half;
    const corners = [[p.x + nx, p.y + ny], [p.x + dx + nx, p.y + dy + ny], [p.x + dx - nx, p.y + dy - ny], [p.x - nx, p.y - ny]];
    ctx.globalAlpha = .12; polygon(corners, C.red); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) line(...corners[i], ...corners[(i + 1) % 4], C.red);
  }
  function emit(event) {
    const x = event.x ?? 0, z = event.z ?? 0, color = event.type === 'player-hit' ? C.red : STYLE[event.weaponStyle] || (event.source === 'roots' ? C.leaf : event.source === 'dragon' ? C.orange : event.source === 'owl' ? C.blue : C.gold);
    if (event.type === 'hit' || event.type === 'player-hit') {
      if (event.targetId !== undefined) hitTimes.set(event.targetId, .08);
      if (impacts.length >= 20) impacts.shift(); impacts.push({ x, z, age: 0, life: .18, color, angle: ((event.targetId || 0) % 5) * .61 });
      const value = Number.isFinite(event.damage) ? Math.round(event.damage) : 0;
      // Incoming damage has priority over decorative outgoing numbers nearby.
      if (value > 0 && event.type === 'player-hit') {
        for (let i = labels.length - 1; i >= 0; i--) if (labels[i].scale === 1 && Math.hypot(labels[i].x - x, labels[i].z - z) <= 2.2) labels.splice(i, 1);
        if (labels.length >= 8) { const ordinary = labels.findIndex(label => label.scale === 1); if (ordinary >= 0) labels.splice(ordinary, 1); }
      }
      if (value > 0 && labels.length < 8 && !labels.some(label => Math.hypot(label.x - x, label.z - z) <= 2.2))
        labels.push({ x, z, age: 0, life: .48, value, targetId: event.targetId, scale: event.type === 'player-hit' ? 2 : 1, color: event.type === 'player-hit' ? C.red : C.cream });
    }
    if (['hit', 'kill', 'level-up', 'deposit', 'pickup', 'field-chest', 'field-boon'].includes(event.type)) for (let i = 0, n = event.type === 'hit' || event.type === 'pickup' ? 3 : 4; i < n; i++) {
      if (particles.length >= 96) particles.shift(); const a = i * 2.39996; particles.push({ x, z, vx: Math.cos(a) * (.7 + i % 2), vz: Math.sin(a) * (.7 + i % 2), age: 0, life: .24 + i % 3 * .06, color, leaf: event.source === 'roots' || event.type === 'field-boon' });
    }
    if (['transform', 'level-up', 'deposit', 'field-boon'].includes(event.type)) { if (pulses.length >= 4) pulses.shift(); pulses.push({ x, z, age: 0, life: .46, kind: event.type, form: event.form, color: event.type === 'transform' ? C.leafLight : C.gold }); }
    if (['form-attack', 'staff-explosion', 'melee-attack', 'shoot', 'owl-shoot'].includes(event.type)) {
      if (attacks.length >= 8) attacks.shift();
      const atSource = event.type !== 'form-attack' || event.form === 'bear';
      attacks.push({ ...event, x: atSource ? x : event.targetX ?? x, z: atSource ? z : event.targetZ ?? z, age: 0,
        life: ['shoot', 'owl-shoot'].includes(event.type) ? .12 : event.type === 'melee-attack' ? event.attackType === 'cleave' ? .3 : .24 : .36,
        color: event.type === 'staff-explosion' || event.weaponId === 'axe' ? C.orange : event.weaponId === 'spear' ? C.blue : C.gold });
    }
  }
  function advance(dt) {
    for (const list of [particles, impacts, pulses, labels, attacks]) for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= list[i].life) list.splice(i, 1); }
    for (const [id, time] of hitTimes) if (time <= dt) hitTimes.delete(id); else hitTimes.set(id, time - dt);
  }
  function number(value, x, y, color, scale = 1) {
    const text = String(Math.max(0, Math.min(999999, value))), advance = 6 * scale, start = Math.round(x - (text.length * advance - scale) / 2);
    for (const [outline, dx, dy] of [[true, -1, 0], [true, 1, 0], [true, 0, -1], [true, 0, 1], [false, 0, 0]]) for (let c = 0; c < text.length; c++) for (let bit = 0; bit < 35; bit++) if (DIGITS[Number(text[c])][bit] === '1') rect(start + c * advance + bit % 5 * scale + dx, y + Math.floor(bit / 5) * scale + dy, scale, scale, outline ? C.ink : color);
  }
  function meleeAttack(a, p, t) {
    const angle = Number.isFinite(a.aimX) && Number.isFinite(a.aimZ) ? Math.atan2(a.aimZ, a.aimX) : a.angle || 0;
    const reach = Math.max(1, Math.min(6, a.range || 2)) * 12;
    const at = (radius, offset = 0) => ({ x: p.x + Math.cos(angle + offset) * radius, y: p.y - 9 + Math.sin(angle + offset) * radius });
    if (a.attackType === 'thrust') {
      const tip = at(reach * (.55 + Math.sin(t * Math.PI) * .45)), start = at(4), back = at(Math.max(5, reach * .5)), nx = -Math.sin(angle), ny = Math.cos(angle);
      polygon([[start.x, start.y], [back.x + nx * 3, back.y + ny * 3], [tip.x, tip.y], [back.x - nx * 3, back.y - ny * 3]], a.color);
      line(start.x, start.y, tip.x, tip.y, C.cream);
    } else {
      const arc = Math.max(.25, Math.min(Math.PI * 1.8, a.arc || (a.attackType === 'cleave' ? 2.5 : 1.7))), head = -arc / 2 + arc * (.45 + .55 * Math.min(1, t * 1.4)), tail = Math.max(-arc / 2, head - arc * .45);
      const strong = a.age < .09, core = strong ? a.attackType === 'cleave' ? 4 : 3 : 1, radius = reach * (strong ? 1.15 : 1);
      crescent(p.x, p.y - 9, angle, radius, tail, head, core + 2, a.color, core);
      if (strong) for (const r of [radius * .6, radius * .83]) {
        const start = at(r, tail - .12), tip = at(r, tail + .3), inner = at(r - 2, tail - .12);
        polygon([[start.x, start.y], [tip.x, tip.y], [inner.x, inner.y]], a.color);
      }
    }
  }
  function crescent(x, y, angle, radius, tail, head, width, color, coreWidth = 1) {
    const arc = r => Array.from({ length: 11 }, (_, i) => { const a = angle + tail + (head - tail) * i / 10; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
    polygon([...arc(radius), ...arc(radius - width).reverse()], color);
    polygon([...arc(radius - 1), ...arc(radius - 1 - coreWidth).reverse()], C.cream);
  }
  function leaf(x, y, color, tilt = 1) {
    polygon([[x - 3, y + tilt], [x, y - 2], [x + 3, y - tilt], [x, y + 2]], color);
    rect(x, y - 1, 1, 2, C.cream);
  }
  function flame(x, y, size, color, dx = 0, dy = -1) {
    const nx = -dy, ny = dx, vertex = (along, across) => [x + dx * along + nx * across, y + dy * along + ny * across];
    polygon([vertex(size, 0), vertex(size * .2, size * .52), vertex(-size * .5, size * .35), vertex(-size * .8, 0), vertex(-size * .45, -size * .4), vertex(size * .12, -size * .55)], C.red);
    polygon([vertex(size * .8, 0), vertex(0, size * .34), vertex(-size * .6, 0), vertex(-size * .2, -size * .3)], color);
    polygon([vertex(size * .48, 0), vertex(-size * .1, size * .18), vertex(-size * .42, 0), vertex(-size * .15, -size * .15)], C.gold);
    rect(x, y, 1, 2, C.cream);
  }
  function bearGround(a, p, t) {
    const radius = (a.radius || 3.3) * 12 * (.3 + .5 * Math.min(1, t * 4));
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.2566 + .3, mx = p.x + Math.cos(angle + .15) * radius * .5, my = p.y + Math.sin(angle + .15) * radius * .5;
      line(p.x + Math.cos(angle) * 4, p.y + Math.sin(angle) * 4, mx, my, C.dirtDark);
      line(mx, my, p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, C.forest);
      line(mx, my, mx + Math.cos(angle - .7) * 5, my + Math.sin(angle - .7) * 5, C.dirtDark);
    }
  }
  function attackVisual(a, p, t) {
    if (a.type === 'melee-attack') { meleeAttack(a, p, t); return; }
    if (a.type === 'shoot' || a.type === 'owl-shoot') {
      const x = p.x + (a.aimX || 0) * 9, y = p.y - 13 + (a.aimZ || 0) * 9;
      polygon([[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], STYLE[a.weaponStyle] || C.blue); rect(x, y, 1, 1, C.cream); return;
    }
    if (a.form === 'wolf') {
      const angle = Math.atan2(a.aimZ || 0, a.aimX || 1);
      for (let i = -1; i <= 1; i++) crescent(p.x + i * 3, p.y - 12 + i * 2, angle, 8 + t * 7, -.55 + t * .3, .35 + t * .3, 2, C.sky);
    } else if (a.form === 'bear') {
      for (let i = 0; i < 4; i++) {
        const angle = i * 1.8, r = 6 + t * 16, x = p.x + Math.cos(angle) * r, y = p.y + Math.sin(angle) * r * .6 - Math.sin(t * Math.PI) * 11;
        polygon([[x - 3, y], [x - 1, y - 4], [x + 3, y - 3], [x + 4, y + 1], [x, y + 3]], C.stone); line(x - 1, y - 2, x + 2, y - 2, C.stoneLight);
      }
    } else {
      const large = a.type === 'staff-explosion', spread = large ? (a.radius || 2) * 9 : 9;
      for (let i = 0; i < 3; i++) {
        const angle = i * 2.4, x = p.x + Math.cos(angle) * spread * t, y = p.y - 10 + Math.sin(angle) * spread * t * .6;
        flame(x, y, (large ? 10 : 7) * (1 - t * .55), C.orange);
      }
    }
  }
  function rootBurst(e, p) {
    const age = 1 - e.life / e.maxLife, growth = Math.min(1, age * 4), radius = e.radius * 12;
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4, x = Math.round(p.x + Math.cos(angle) * radius * .65), y = Math.round(p.y + Math.sin(angle) * radius * .58), height = Math.round((12 + i % 3 * 3) * growth);
      const a = { x: x - 2, y: y - height * .35 }, b = { x: x + 2, y: y - height * .7 }, top = { x, y: y - height };
      ctx.globalAlpha = .25; rect(x - 4, y, 8, 2, C.ink); ctx.globalAlpha = 1;
      line(x, y, a.x, a.y, C.forest, 3); line(a.x, a.y, b.x, b.y, C.forest, 3); line(b.x, b.y, top.x, top.y, C.forest, 2);
      line(x, y, a.x, a.y, C.leaf); line(a.x, a.y, b.x, b.y, C.leafLight); line(b.x, b.y, top.x, top.y, C.leafLight);
      if (growth > .4) { leaf(a.x - 2, a.y, C.leaf, -1); polygon([[b.x, b.y + 1], [b.x + 4, b.y - 2], [b.x + 1, b.y - 2]], C.leafLight); }
    }
  }
  function draw(state, dt = 0) {
    if (disposed || !state?.player) return;
    const running = state.phase === 'playing' && !document.hidden, step = running ? Math.min(.05, Math.max(0, Number.isFinite(dt) ? dt : 0)) : 0;
    clock += step; advance(step); if (running) for (const event of state.events || []) if (event && typeof event === 'object' && !seenEvents.has(event)) { emit(event); seenEvents.add(event); }
    const player = state.player; cameraX = Math.round(player.x * 12); cameraZ = Math.round(player.z * 12); calls = 0; entities = 0; frameCount++;
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false; valley(); ground();
    for (const enemy of state.enemies || []) if (enemy.hp > 0 && enemy.phase === 'windup') {
      if (enemy.shape === 'line') lineWarning(enemy);
      else warning(enemy.warnX, enemy.warnZ, enemy.attackRadius || 1.2, 1 - enemy.phaseTime / (enemy.windupDuration || 1));
    }
    for (const hazard of state.fieldEvents?.hazards || []) for (const c of hazard.centers || []) warning(c.x, c.z, c.radius, hazard.phase === 'warning' ? 1 - hazard.time / hazard.warnTime : 1);
    for (const e of state.effects || []) if (e.type === 'root-warning') {
      const p = point(e.x, e.z);
      for (let i = 0; i < 4; i++) { const angle = i * Math.PI / 2 + .3; leaf(p.x + Math.cos(angle) * e.radius * 9, p.y + Math.sin(angle) * e.radius * 8, C.leaf); }
    }
    for (const a of attacks) if (a.form === 'bear') bearGround(a, point(a.x, a.z), a.age / a.life);
    for (const coin of state.loot || []) { const p = point(coin.x, coin.z); if (visible(p)) stamp('coin', p.x, p.y); }
    const sorted = [];
    for (const prop of props) {
      const p = point(prop.x, prop.z); if (!visible(p)) continue;
      if (prop.tree) {
        ctx.globalAlpha = .3;
        for (const [w, h, x, y] of [[22, 2, -17, -2], [31, 3, -21, 0], [25, 2, -17, 3], [14, 1, -10, 5]]) rect(p.x + x, p.y + y, w, h, C.forest);
        ctx.globalAlpha = .2; rect(p.x - 7, p.y - 1, 14, 3, C.ink); ctx.globalAlpha = 1;
      }
      sorted.push({ ...prop, p });
    }
    for (const stage of STAGES.slice(1)) if (!isStageUnlocked(state.progress, stage.id)) { const p = point(0, stage.maxZ); if (visible(p)) { sorted.push({ id: 'gate', x: 0, z: stage.maxZ, p }); line(0, p.y, viewport.width, p.y, C.shade, 3); } }
    for (const item of state.fieldEvents?.items || []) { const p = point(item.x, item.z); if (visible(p)) sorted.push({ id: item.kind === 'chest' ? 'chest' : 'blessing', x: item.x, z: item.z, p }); }
    const liveIds = new Set([player.id]);
    for (const e of state.enemies || []) {
      if (e.hp <= 0) continue; liveIds.add(e.id); const p = point(e.x, e.z), prev = positions.get(e.id), dx = prev ? e.x - prev.x : 0, dz = prev ? e.z - prev.z : 0;
      const moved = Math.abs(dx) + Math.abs(dz) > .00001, lastMoved = moved ? clock : prev?.lastMoved ?? -1;
      // Rendering can run faster than the fixed simulation. Hold the walk pose
      // across repeated simulation frames instead of flashing back to idle.
      const moving = moved || clock - lastMoved < .12, dir = moved ? direction(dx, dz) : prev?.dir || 'down';
      if (running || !prev) positions.set(e.id, { x: e.x, z: e.z, dir, moving, lastMoved });
      if (visible(p)) sorted.push({ id: spriteId(e), x: e.x, z: e.z, p, actor: e, dir, moving: running ? moving : prev?.moving, key: e.id });
    }
    for (const id of positions.keys()) if (!liveIds.has(id)) positions.delete(id);
    const pp = point(player.x, player.z), pdir = direction(player.facingX || 0, player.facingZ ?? 1);
    const form = player.form || 'druid'; let swing, formAttack;
    for (let i = attacks.length - 1; i >= 0; i--) { const attack = attacks[i]; if (!swing && attack.type === 'melee-attack' && attack.weaponId === state.progress.weapon) swing = attack; if (!formAttack && attack.form === form) formAttack = attack; }
    const baseSprite = form === 'druid' ? MELEE_SPRITES[state.progress.weapon] || 'druid' : form, attackSprite = `${baseSprite}Attack`, attackPose = form === 'druid' && swing && cached.has(attackSprite);
    const playerSprite = attackPose ? attackSprite : baseSprite, poseFrame = attackPose ? swing.age < .04 ? 0 : swing.age < .12 ? 1 : 2 : undefined;
    sorted.push({ id: playerSprite, x: player.x, z: player.z, p: pp, actor: player, dir: attackPose ? direction(swing.aimX, swing.aimZ) : pdir,
      attackFrame: poseFrame, lunge: formAttack && ['wolf', 'bear'].includes(form) ? formAttack : null,
      moving: Math.abs(player.movingX || 0) + Math.abs(player.movingZ || 0) > .001, key: player.id, player: true });
    if (state.owl?.active && (!player.form || player.form === 'druid')) { const p = point(state.owl.x, state.owl.z); sorted.push({ id: 'owl', x: state.owl.x, z: state.owl.z, p, dir: pdir, moving: true }); }
    sorted.sort((a, b) => a.z - b.z || (a.player ? 1 : -1));
    for (const entry of sorted) {
      const { p } = entry, s = cached.get(entry.id); if (!s) continue;
      const frame = entry.attackFrame ?? (entry.moving ? [0, 1, 0, 2][Math.floor(clock * 8) % 4] : entry.id === 'campfire' ? Math.floor(clock * 6) % 3 : 0);
      if (entry.actor || entry.id === 'owl') { const w = Math.floor((entry.player && form === 'druid' ? 32 : s.width) * .46); ctx.globalAlpha = .3; rect(p.x - Math.floor(w / 2), p.y - 1, w, 3, C.forest); rect(p.x - Math.floor(w / 2) + 2, p.y + 2, w - 4, 1, C.forest); ctx.globalAlpha = 1; entities++; }
      const overlaps = entry.tree && p.y > pp.y && Math.abs(p.x - pp.x) < s.width / 2 + 8 && p.y - s.height < pp.y - 12;
      const flash = entry.player ? player.invuln > .5 : hitTimes.has(entry.key);
      const lunge = entry.lunge ? Math.sin(Math.min(1, entry.lunge.age / .16) * Math.PI) * 2 : 0;
      stamp(entry.id, p.x + Math.round((entry.lunge?.aimX || 0) * lunge), p.y + Math.round((entry.lunge?.aimZ || 0) * lunge), entry.dir || 'down', frame, flash, overlaps ? .22 : 1);
      if (entry.player && entry.id === 'druid' && s.wandTips) { const tip = s.wandTips[pdir], color = STAFF[state.progress.weapon] || C.leaf; if (tip) { rect(p.x - s.anchorX + tip[0] - 2, p.y - s.anchorY + tip[1] - 2, 5, 5, C.ink); rect(p.x - s.anchorX + tip[0] - 1, p.y - s.anchorY + tip[1] - 1, 3, 3, color); rect(p.x - s.anchorX + tip[0] - 1, p.y - s.anchorY + tip[1] - 1, 1, 1, C.cream); } }
    }
    for (const e of state.effects || []) {
      const p = point(e.x, e.z); if (!visible(p)) continue;
      if (e.type === 'root-burst') rootBurst(e, p);
      else if (e.type === 'death') { const t = 1 - e.life / e.maxLife; ctx.globalAlpha = Math.max(0, 1 - t); for (let i = 0; i < 3; i++) leaf(p.x + (i - 1) * t * 12, p.y - 5 - Math.sin(t * Math.PI) * (i % 2 ? 8 : 5), C.linen); ctx.globalAlpha = 1; }
    }
    for (const b of state.projectiles || []) {
      const p = point(b.x, b.z); if (!visible(p)) continue; const len = Math.hypot(b.dx || 0, b.dz || 0) || 1, dx = (b.dx || 0) / len, dy = (b.dz || 0) / len;
      const color = b.team === 'enemy' ? C.red : b.source === 'owl' ? C.sky : b.source === 'dragon' ? C.orange : STYLE[b.weaponStyle] || C.leaf;
      if (b.source === 'dragon' || b.weaponStyle === 'explosive') flame(p.x, p.y - 9, b.source === 'dragon' ? 7 : 5, color, dx, dy);
      else {
        const x = p.x, y = p.y - 9, radius = b.source === 'owl' ? 3 : 2;
        line(x - dx * 6, y - dy * 6, x - dx * 2, y - dy * 2, color);
        polygon([[x, y - radius - 1], [x + radius + 1, y], [x, y + radius + 1], [x - radius - 1, y]], C.ink);
        polygon([[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], color);
        rect(x, y - 1, 1, 2, C.cream);
      }
    }
    for (const a of attacks) attackVisual(a, point(a.x, a.z), a.age / a.life);
    for (const impact of impacts) {
      const p = point(impact.x, impact.z), t = impact.age / impact.life, scale = 1 - t * .5, shape = [[-7, -3], [-2, -1], [1, -6], [2, -1], [7, 2], [2, 2], [0, 6], [-1, 2], [-6, 4], [-2, 1]];
      const points = shape.map(([x, y]) => [p.x + (x * Math.cos(impact.angle) - y * Math.sin(impact.angle)) * scale, p.y - 12 + (x * Math.sin(impact.angle) + y * Math.cos(impact.angle)) * scale]);
      polygon(points, impact.color); if (t < .5) { polygon([[p.x, p.y - 15], [p.x + 3, p.y - 12], [p.x, p.y - 9], [p.x - 3, p.y - 12]], C.cream); }
    }
    for (const pulse of pulses) {
      const p = point(pulse.x, pulse.z), t = pulse.age / pulse.life;
      if (pulse.kind === 'transform') stamp(pulse.form || 'druid', p.x, p.y - Math.round(t * 2), 'down', 0, true, (1 - t) * .22);
      for (let i = 0; i < 4; i++) { const angle = i * Math.PI / 2 + t * 2.2, radius = 9 + t * 8; leaf(p.x + Math.cos(angle) * radius, p.y - 15 + Math.sin(angle) * radius * .55, pulse.color, i % 2 ? -1 : 1); }
    }
    for (const p of particles) { const q = point(p.x + p.vx * p.age, p.z + p.vz * p.age), y = q.y - 6 - Math.sin(p.age / p.life * Math.PI) * 7;
      if (p.leaf) leaf(q.x, y, p.color); else { polygon([[q.x - 2, y], [q.x, y - 2], [q.x + 2, y - 1], [q.x + 1, y + 2]], p.color); rect(q.x, y - 1, 1, 1, C.cream); }
    }
    // Bars and damage stay readable above foreground foliage.
    for (const e of state.enemies || []) if (e.hp > 0 && e.hp < e.maxHp) {
      const p = point(e.x, e.z), s = cached.get(spriteId(e)); if (!visible(p)) continue;
      const primary = e.type === 'boss' || e.id === state.fightTargetId, w = e.type === 'boss' ? 30 : primary ? 18 : 14, h = primary ? 3 : 2, y = p.y - (s?.height || 24) - 2;
      ctx.globalAlpha = primary ? 1 : .8;
      if (primary) rect(p.x - w / 2 - 1, y - 1, w + 2, h + 2, C.shade);
      rect(p.x - w / 2, y, w, h, C.forest); rect(p.x - w / 2, y, Math.ceil(w * e.hp / e.maxHp), h, C.red); ctx.globalAlpha = 1;
    }
    for (const label of labels) {
      const p = point(label.x, label.z), target = (state.enemies || []).find(e => e.id === label.targetId), height = target ? cached.get(spriteId(target))?.height || 24 : label.scale === 2 ? cached.get(baseSprite)?.height || 32 : 24;
      number(label.value, p.x, Math.round(p.y - Math.max(label.scale === 2 ? 45 : 37, height + 10) - label.age * 14), label.color, label.scale);
    }
  }
  return {
    canvas, setAim() {}, draw,
    screenToWorld(clientX, clientY) { const b = canvas.getBoundingClientRect(); return { x: ((clientX - b.left) / 2 - Math.floor(viewport.width / 2) + cameraX) / 12, z: ((clientY - b.top) / 2 - Math.floor(viewport.height * .54) + cameraZ) / 12 }; },
    stats() { return { width: viewport.width, height: viewport.height, scale: 2, sprites: cached.size, sourceFrames, terrainPixels: terrain.width * terrain.height, frames: frameCount, drawCalls: calls, entities, effects: particles.length + impacts.length + pulses.length + attacks.length + labels.length, clock }; },
    dispose() { if (disposed) return; disposed = true; observer?.disconnect(); canvas.remove(); terrain.width = terrain.height = 1; cached.clear(); positions.clear(); hitTimes.clear(); for (const list of [particles, impacts, pulses, labels, attacks]) list.length = 0; },
  };
}
