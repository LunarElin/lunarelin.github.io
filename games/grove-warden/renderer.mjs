import { buildPixelArt } from './pixel-art.mjs';
import { WORLD, HUNT_ZONES, STAGES, isStageUnlocked, isZoneUnlocked } from './rules.mjs';

// One authored texel equals one buffer pixel and exactly two CSS pixels.
export const PIXEL_GRID = Object.freeze({ scale: 2, worldPixels: 12 });
export function computePixelViewport(width, height) {
  const w = Math.max(1, Math.floor(width / 2)), h = Math.max(1, Math.floor(height / 2));
  return { width: w, height: h, scale: 2, offsetX: Math.floor((width - w * 2) / 2), offsetY: Math.floor((height - h * 2) / 2) };
}
export function projectPixel(worldX, worldZ, cameraX, cameraZ, viewport) {
  return { x: Math.round(worldX * 12 - cameraX + Math.floor(viewport.width / 2)), y: Math.round(worldZ * 12 - cameraZ + Math.floor(viewport.height * .54)) };
}
const C = { ink: '#292537', shade: '#393b50', forest: '#2e5142', green: '#638b4c', leaf: '#91ad5b', cream: '#f2e7c5', gold: '#f6d57b', red: '#bc6262', orange: '#e79a4e', blue: '#9cb8d1', teal: '#4f8b85', dirt: '#946841' };
const STAFF = { sprout: C.leaf, thorn: C.red, moon: C.blue, ember: C.orange };
const STYLE = { single: C.leaf, burst: C.red, spread: C.blue, explosive: C.orange };
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
  const particles = [], impacts = [], pulses = [], labels = [], attacks = [], hitTimes = new Map(), positions = new Map();
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
    for (const side of [-1, 1]) props.push({ id: i % 3 ? 'tree' : 'pine', x: side * (9.4 + (i * 7 % 5) * .7), z: z + (side < 0 ? .8 : -.7), tree: true });
    if (i % 2 === 0) props.push({ id: i % 4 ? 'rock' : 'flower', x: (i % 3 ? 1 : -1) * (4.2 + i % 4), z: z - 1.4 });
  }
  for (const stage of STAGES) { const c = stage.camp; props.push({ id: 'campfire', x: c.x - 1.7, z: c.z + .7 }, { id: 'chest', x: c.x + 1.6, z: c.z + 1.6 }, { id: 'forge', x: c.x + 2.4, z: c.z - 1.5 }, { id: 'npc', x: c.x - 2.1, z: c.z - .9 }); }
  function ground(state) {
    const left = cameraX - Math.floor(viewport.width / 2), top = cameraZ - Math.floor(viewport.height * .54);
    for (let y = Math.floor(top / 16) * 16; y < top + viewport.height; y += 16) for (let x = Math.floor(left / 16) * 16; x < left + viewport.width; x += 16) {
      const wx = (x + 8) / 12, wz = (y + 8) / 12, stage = STAGES.find(s => wz >= s.minZ) || STAGES[3];
      const outside = wx < WORLD.minX || wx > WORLD.maxX || wz < WORLD.minZ || wz > WORLD.maxZ, camp = STAGES.some(s => Math.hypot(wx - s.camp.x, wz - s.camp.z) < s.camp.radius), path = Math.abs(wx - roadX(wz)) < 1.65;
      stamp(outside ? 'groundSky' : path || camp ? 'groundDirt' : stage.id === 'ancient' ? 'groundStone' : stage.id === 'sky' ? 'groundSky' : 'groundGrass', x - left, y - top);
      if (!outside && !path && !camp && stage.id === 'deep' && ((x + y) / 16 & 1)) { ctx.globalAlpha = .12; rect(x - left, y - top, 16, 16, C.forest); ctx.globalAlpha = 1; }
    }
    for (const zone of HUNT_ZONES) {
      const p = point(zone.x, zone.z); if (!visible(p) || !isZoneUnlocked(state.progress, zone)) continue;
      const active = state.huntZoneId === zone.id; ctx.globalAlpha = active ? .65 : .2; ring(p.x, p.y, zone.radius * 12, active ? C.gold : C.cream, true); ctx.globalAlpha = 1;
      rect(p.x - 2, p.y - 2, 5, 5, C.ink); rect(p.x - 1, p.y - 1, 3, 3, active ? C.gold : C.dirt);
    }
  }
  function warning(x, z, radius, progress = 0) {
    const p = point(x, z); if (!visible(p)) return; const r = Math.round(radius * 12); ctx.globalAlpha = .22;
    for (let y = -r; y <= r; y += 3) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y))); rect(p.x - w, p.y + y, w * 2 + 1, 1, C.red); }
    ctx.globalAlpha = 1; ring(p.x, p.y, r, C.red); ring(p.x, p.y, Math.max(2, r * progress), C.orange);
  }
  function emit(event) {
    const x = event.x ?? 0, z = event.z ?? 0, color = STYLE[event.weaponStyle] || (event.source === 'roots' ? C.leaf : event.source === 'dragon' ? C.orange : event.source === 'owl' ? C.blue : C.gold);
    if (event.type === 'hit' || event.type === 'player-hit') {
      if (event.targetId !== undefined) hitTimes.set(event.targetId, .12);
      if (impacts.length >= 20) impacts.shift(); impacts.push({ x, z, age: 0, life: .25, color });
      const nearby = labels.filter(label => label.age < .28 && Math.hypot(label.x - x, label.z - z) < 2.2).length;
      if (nearby < 2) {
        if (labels.length >= 24) labels.shift();
        labels.push({ x, z, lift: nearby * 16, age: 0, life: .6, value: Math.round(event.damage || 0), color: event.type === 'player-hit' ? C.red : C.cream });
      }
    }
    if (['hit', 'kill', 'transform', 'level-up', 'deposit', 'pickup', 'field-chest', 'field-boon'].includes(event.type)) for (let i = 0, n = event.type === 'hit' ? 4 : 12; i < n; i++) {
      if (particles.length >= 96) particles.shift(); const a = i * 2.39996; particles.push({ x, z, vx: Math.cos(a) * (1 + i % 3), vz: Math.sin(a) * (1 + i % 3), age: 0, life: .3 + i % 3 * .1, color });
    }
    if (['transform', 'level-up', 'deposit', 'field-boon'].includes(event.type)) { if (pulses.length >= 4) pulses.shift(); pulses.push({ x, z, age: 0, life: .65, color: event.type === 'transform' ? C.blue : C.gold }); }
    if (event.type === 'form-attack' || event.type === 'staff-explosion') { if (attacks.length >= 8) attacks.shift(); attacks.push({ ...event, x: event.targetX ?? x, z: event.targetZ ?? z, age: 0, life: .4, color: event.type === 'staff-explosion' ? C.orange : C.gold }); }
  }
  function advance(dt) {
    for (const list of [particles, impacts, pulses, labels, attacks]) for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= list[i].life) list.splice(i, 1); }
    for (const [id, time] of hitTimes) if (time <= dt) hitTimes.delete(id); else hitTimes.set(id, time - dt);
  }
  function number(value, x, y, color) {
    const text = String(Math.max(0, Math.min(999999, value))), start = Math.round(x - (text.length * 12 - 2) / 2);
    for (const [outline, dx, dy] of [[true, -1, 0], [true, 1, 0], [true, 0, -1], [true, 0, 1], [false, 0, 0]]) for (let c = 0; c < text.length; c++) for (let bit = 0; bit < 35; bit++) if (DIGITS[Number(text[c])][bit] === '1') rect(start + c * 12 + bit % 5 * 2 + dx, y + Math.floor(bit / 5) * 2 + dy, 2, 2, outline ? C.ink : color);
  }
  function draw(state, dt = 0) {
    if (disposed || !state?.player) return;
    const running = state.phase === 'playing' && !document.hidden, step = running ? Math.min(.05, Math.max(0, Number.isFinite(dt) ? dt : 0)) : 0;
    clock += step; advance(step); if (running) for (const event of state.events || []) emit(event);
    const player = state.player; cameraX = Math.round(player.x * 12); cameraZ = Math.round(player.z * 12); calls = 0; entities = 0; frameCount++;
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false; rect(0, 0, viewport.width, viewport.height, C.ink); ground(state);
    for (const enemy of state.enemies || []) if (enemy.hp > 0 && enemy.phase === 'windup') {
      if (enemy.shape === 'line') { const p = point(enemy.warnX, enemy.warnZ); line(p.x, p.y, p.x + enemy.aimX * enemy.length * 12, p.y + enemy.aimZ * enemy.length * 12, C.red, 3); }
      else warning(enemy.warnX, enemy.warnZ, enemy.attackRadius || 1.2, 1 - enemy.phaseTime / (enemy.windupDuration || 1));
    }
    for (const hazard of state.fieldEvents?.hazards || []) for (const c of hazard.centers || []) warning(c.x, c.z, c.radius, hazard.phase === 'warning' ? 1 - hazard.time / hazard.warnTime : 1);
    for (const e of state.effects || []) if (e.type === 'root-warning') { const p = point(e.x, e.z); ring(p.x, p.y, e.radius * 12, C.leaf, true); }
    for (const coin of state.loot || []) { const p = point(coin.x, coin.z); if (visible(p)) stamp('coin', p.x, p.y); }
    for (const drop of state.fieldLoot || []) { const p = point(drop.x, drop.z); if (visible(p)) stamp(drop.kind === 'scroll' ? 'scroll' : 'staff', p.x, p.y); }
    const sorted = [];
    for (const prop of props) { const p = point(prop.x, prop.z); if (visible(p)) sorted.push({ ...prop, p }); }
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
    sorted.push({ id: player.form || 'druid', x: player.x, z: player.z, p: pp, actor: player, dir: pdir, moving: Math.abs(player.movingX || 0) + Math.abs(player.movingZ || 0) > .001, key: player.id, player: true });
    if (state.owl?.active && (!player.form || player.form === 'druid')) { const p = point(state.owl.x, state.owl.z); sorted.push({ id: 'owl', x: state.owl.x, z: state.owl.z, p, dir: pdir, moving: true }); }
    sorted.sort((a, b) => a.z - b.z || (a.player ? 1 : -1));
    for (const entry of sorted) {
      const { p } = entry, s = cached.get(entry.id); if (!s) continue;
      const frame = entry.moving ? [0, 1, 0, 2][Math.floor(clock * 8) % 4] : entry.id === 'campfire' ? Math.floor(clock * 6) % 3 : 0;
      if (entry.actor || entry.id === 'owl') { ctx.globalAlpha = .38; rect(p.x - Math.floor(s.width * .24), p.y - 1, Math.floor(s.width * .48), 3, C.ink); ctx.globalAlpha = 1; entities++; }
      const overlaps = entry.tree && p.y > pp.y && Math.abs(p.x - pp.x) < s.width / 2 + 8 && p.y - s.height < pp.y - 12;
      const flash = entry.player ? player.invuln > 0 && Math.floor(clock * 16) % 2 === 0 : hitTimes.has(entry.key);
      stamp(entry.id, p.x, p.y, entry.dir || 'down', frame, flash, overlaps ? .22 : 1);
      if (entry.player && entry.id === 'druid' && s.wandTips) { const tip = s.wandTips[pdir], color = STAFF[state.progress.gear?.equipped] || C.leaf; if (tip) { rect(p.x - s.anchorX + tip[0] - 2, p.y - s.anchorY + tip[1] - 2, 5, 5, C.ink); rect(p.x - s.anchorX + tip[0] - 1, p.y - s.anchorY + tip[1] - 1, 3, 3, color); rect(p.x - s.anchorX + tip[0] - 1, p.y - s.anchorY + tip[1] - 1, 1, 1, C.cream); } }
    }
    for (const e of state.effects || []) {
      const p = point(e.x, e.z); if (!visible(p)) continue;
      if (e.type === 'root-burst') { const growth = Math.min(1, (1 - e.life / e.maxLife) * 4), r = e.radius * 12; for (let i = 0; i < 9; i++) { const a = i * 2.4, x = Math.round(p.x + Math.cos(a) * r * .7), y = Math.round(p.y + Math.sin(a) * r * .6), h = Math.round(12 * growth); line(x, y, x - 3, y - h, C.forest, 3); line(x, y, x - 3, y - h, C.leaf); rect(x - 6, y - h + 2, 4, 2, C.green); } }
      else if (e.type === 'death') { ctx.globalAlpha = Math.max(0, e.life / e.maxLife * .6); ring(p.x, p.y, (1 - e.life / e.maxLife) * 12 + 3, C.cream); ctx.globalAlpha = 1; }
    }
    for (const b of state.projectiles || []) {
      const p = point(b.x, b.z); if (!visible(p)) continue; const len = Math.hypot(b.dx || 0, b.dz || 0) || 1, dx = (b.dx || 0) / len, dy = (b.dz || 0) / len;
      const color = b.team === 'enemy' ? C.red : b.source === 'owl' ? C.blue : b.source === 'dragon' ? C.orange : STYLE[b.weaponStyle] || C.leaf, size = b.weaponStyle === 'explosive' || b.source === 'dragon' ? 3 : 2;
      line(p.x - dx * 8, p.y - dy * 8 - 9, p.x, p.y - 9, C.ink, size + 2); line(p.x - dx * 6, p.y - dy * 6 - 9, p.x, p.y - 9, color, size); rect(p.x, p.y - 9, size, size, C.cream);
    }
    for (const a of attacks) { const p = point(a.x, a.z), t = a.age / a.life; if (a.form === 'wolf') for (let i = -1; i <= 1; i++) line(p.x - 10 + i * 4, p.y - 24, p.x + 5 + i * 4, p.y - 9, C.cream, 2); else { ring(p.x, p.y, (a.radius || 2) * 12 * t, a.color); ring(p.x, p.y, (a.radius || 2) * 12 * t - 2, C.cream); } }
    for (const impact of impacts) { const p = point(impact.x, impact.z), r = Math.round(4 + impact.age * 25), y = p.y - 12; line(p.x - r, y, p.x + r, y, C.ink, 3); line(p.x, y - r, p.x, y + r, C.ink, 3); line(p.x - r, y, p.x + r, y, impact.color); line(p.x, y - r, p.x, y + r, impact.color); rect(p.x - 2, y - 2, 5, 5, C.cream); }
    for (const pulse of pulses) { const p = point(pulse.x, pulse.z); ring(p.x, p.y, 6 + pulse.age * 38, pulse.color); }
    for (const p of particles) { const q = point(p.x + p.vx * p.age, p.z + p.vz * p.age); rect(q.x, q.y - 6 - Math.sin(p.age / p.life * Math.PI) * 9, 2, 2, p.color); }
    // Bars and damage stay readable above foreground foliage.
    for (const e of state.enemies || []) if (e.hp > 0 && e.hp < e.maxHp) { const p = point(e.x, e.z), s = cached.get(spriteId(e)); if (!visible(p)) continue; const w = e.type === 'boss' ? 30 : 18, y = p.y - (s?.height || 24) - 3; rect(p.x - w / 2 - 1, y - 1, w + 2, 5, C.ink); rect(p.x - w / 2, y, w, 3, C.shade); rect(p.x - w / 2, y, Math.ceil(w * e.hp / e.maxHp), 3, C.red); }
    for (const label of labels) { const p = point(label.x, label.z); number(label.value, p.x, Math.round(p.y - 37 - label.lift - label.age * 14), label.color); }
  }
  return {
    canvas, setAim() {}, draw,
    screenToWorld(clientX, clientY) { const b = canvas.getBoundingClientRect(); return { x: ((clientX - b.left) / 2 - Math.floor(viewport.width / 2) + cameraX) / 12, z: ((clientY - b.top) / 2 - Math.floor(viewport.height * .54) + cameraZ) / 12 }; },
    stats() { return { width: viewport.width, height: viewport.height, scale: 2, sprites: cached.size, sourceFrames, frames: frameCount, drawCalls: calls, entities, effects: particles.length + impacts.length + pulses.length + attacks.length + labels.length, clock }; },
    dispose() { if (disposed) return; disposed = true; observer?.disconnect(); canvas.remove(); cached.clear(); positions.clear(); hitTimes.clear(); for (const list of [particles, impacts, pulses, labels, attacks]) list.length = 0; },
  };
}
