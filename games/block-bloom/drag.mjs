import { SIZE, GATES, move, hasGimmick } from './rules.mjs?v=4';

const EPS = 1e-8;
export function createDrag(state, id) {
  const block = state.blocks.find(b => b.id === id);
  return { id, origin: { ...block }, x: block.x, y: block.y, state, events: [], blocked: false, terminal: false, pressure: null };
}
function accept(drag, result) {
  drag.state = result.state; drag.events.push(...result.events);
  drag.terminal = !drag.state.blocks.some(b => b.id === drag.id);
  if (drag.terminal) drag.pressure = null;
}
function projectPath(drag, x, y) {
  const startX = drag.x, startY = drag.y, dx = x - startX, dy = y - startY, cuts = [1];
  // Only visit grid crossings. Collision and rendering always use the continuous position.
  for (const [start, delta] of [[startX, dx], [startY, dy]]) if (Math.abs(delta) > EPS) {
    for (let cell = -1; cell <= SIZE; cell++) {
      const t = (cell + .5 - start) / delta;
      if (t > EPS && t < 1 - EPS) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const axes = Math.abs(dx) >= Math.abs(dy) ? ['x', 'y'] : ['y', 'x'];
  for (const t of cuts) {
    drag.x = startX + dx * t; drag.y = startY + dy * t;
    for (let pass = 0; pass < 2; pass++) for (const axis of axes) {
      const block = drag.state.blocks.find(b => b.id === drag.id);
      const delta = axis === 'x' ? dx : dy;
      if (Math.abs(delta) < EPS) continue;
      const step = Math.round(drag[axis] + Math.sign(delta) * EPS) - block[axis];
      if (!step) continue;
      const result = move(drag.state, drag.id, axis === 'x' ? step : 0, axis === 'y' ? step : 0);
      if (result.ok) { accept(drag, result); if (drag.terminal) return; }
    }
  }
}
function colliders(drag) {
  const b = drag.origin, s = drag.state;
  const canExit = !b.ice && (!hasGimmick(s,'key') || b.key || s.unlocked.includes(b.color)) && (!hasGimmick(s,'merge') || b.rank >= 2);
  const gate = canExit ? GATES.find(g => g.color === b.color) : null;
  const walls = [];
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const vertical = side === 'left' || side === 'right';
    const near = side === 'left' || side === 'top';
    const intervals = gate?.side === side ? [[-Infinity, gate.start], [gate.start + gate.span, Infinity]] : [[-Infinity, Infinity]];
    for (const [lo, hi] of intervals) walls.push(vertical
      ? { left: near ? -Infinity : SIZE, right: near ? 0 : Infinity, top: lo, bottom: hi }
      : { left: lo, right: hi, top: near ? -Infinity : SIZE, bottom: near ? 0 : Infinity });
  }
  return [...s.blocks.filter(b => b.id !== drag.id).map(b => ({ left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h, block: b })), ...walls];
}
function interval(min, max, near, far, delta) {
  if (Math.abs(delta) < EPS) return max <= near + EPS || min >= far - EPS ? null : [-Infinity, Infinity];
  return delta > 0 ? [(near - max) / delta, (far - min) / delta] : [(far - min) / delta, (near - max) / delta];
}
function firstHit(drag, dx, dy, obstacles) {
  let hit = null;
  for (const rect of obstacles) {
    const tx = interval(drag.x, drag.x + drag.origin.w, rect.left, rect.right, dx);
    const ty = interval(drag.y, drag.y + drag.origin.h, rect.top, rect.bottom, dy);
    if (!tx || !ty) continue;
    const enter = Math.max(tx[0], ty[0]), leave = Math.min(tx[1], ty[1]);
    if (enter < -EPS || enter > 1 + EPS || enter > leave + EPS || leave <= EPS) continue;
    let nx = tx[0] > ty[0] + EPS, ny = ty[0] > tx[0] + EPS;
    // At a single corner, slide along the stronger pointer direction instead of sticking.
    if (!nx && !ny) { nx = Math.abs(dy) > Math.abs(dx); ny = !nx; }
    const t = Math.max(0, Math.min(1, enter));
    const face = { nx, ny, rect };
    if (!hit || t < hit.t - EPS) hit = { t, nx, ny, faces: [face] };
    else if (Math.abs(t - hit.t) <= EPS) { hit.nx ||= nx; hit.ny ||= ny; hit.faces.push(face); }
  }
  return hit;
}
function resetPressure(drag) {
  const p = drag.pressure; if (!p) return;
  const target = drag.state.blocks.find(b => b.id === p.id), other = p.axis === 'x' ? 'y' : 'x';
  const size = p.axis === 'x' ? 'w' : 'h';
  const face = target && (p.sign > 0 ? target[p.axis] - drag.origin[size] : target[p.axis] + target[size]);
  if (!target || Math.abs(drag[p.axis] - face) > EPS || Math.abs(drag[other] - target[other]) > .2 + EPS) drag.pressure = null;
}
function pushMerge(drag, face, dx, dy, slideX, slideY) {
  const target = face.rect.block, b = drag.origin;
  if (!target || !hasGimmick(drag.state,'merge') || b.color !== target.color || b.rank !== target.rank || b.w !== target.w || b.h !== target.h) return false;
  const axis = face.nx ? 'x' : 'y', other = face.nx ? 'y' : 'x', delta = face.nx ? dx : dy, sign = Math.sign(delta), slide = face.nx ? slideY : slideX;
  if (!sign) return false;
  let enter = 0, leave = 1;
  if (Math.abs(slide) < EPS) { if (Math.abs(drag[other] - target[other]) > .2 + EPS) return false; }
  else {
    const t1 = (target[other] - .2 - drag[other]) / slide, t2 = (target[other] + .2 - drag[other]) / slide;
    enter = Math.max(0, Math.min(t1, t2)); leave = Math.min(1, Math.max(t1, t2));
    if (leave < enter + EPS) return false;
  }
  const old = drag.pressure;
  const previous = enter < EPS && old?.id === target.id && old.axis === axis && old.sign === sign ? old.amount : 0;
  const amount = previous + Math.abs(delta) * (leave - enter);
  if (amount >= .5 - EPS) return { t: Math.min(leave, enter + (.5 - previous) / Math.abs(delta)), axis, sign, id: target.id };
  drag.pressure = leave >= 1 - EPS ? { id: target.id, axis, sign, amount } : null;
  return { t: null };
}
function advanceSegment(drag, x, y, pushX, pushY, faces) {
  const slideX = x - drag.x, slideY = y - drag.y;
  faces.sort((a, b) => Math.abs(b.nx ? pushX : pushY) - Math.abs(a.nx ? pushX : pushY));
  for (const face of faces) {
    const intent = pushMerge(drag, face, pushX, pushY, slideX, slideY);
    if (!intent) continue;
    if (intent.t !== null) {
      projectPath(drag, drag.x + slideX * intent.t, drag.y + slideY * intent.t);
      const result = move(drag.state, drag.id, intent.axis === 'x' ? intent.sign : 0, intent.axis === 'y' ? intent.sign : 0);
      if (result.events.some(e => e.type === 'merge' && e.block.id === intent.id)) { accept(drag, result); return; }
      drag.pressure = null;
    }
    break;
  }
  projectPath(drag, x, y);
  resetPressure(drag);
}
function contactMasks(drag, faces, inputX, inputY) {
  let blockedX = faces.some(f => f.nx), blockedY = faces.some(f => f.ny);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = faces.length - 1; i >= 0; i--) {
      const f = faces[i], horizontal = f.nx, rect = f.rect;
      const pos = horizontal ? drag.x : drag.y, size = horizontal ? drag.origin.w : drag.origin.h, speed = horizontal ? inputX : inputY;
      const plane = speed > 0 ? (horizontal ? rect.left : rect.top) - size : horizontal ? rect.right : rect.bottom;
      const across = horizontal ? drag.y : drag.x, span = horizontal ? drag.origin.h : drag.origin.w;
      const near = horizontal ? rect.top : rect.left, far = horizontal ? rect.bottom : rect.right;
      const tangent = horizontal ? (blockedY ? 0 : inputY) : blockedX ? 0 : inputX;
      const separated = across + span < near - EPS || across > far + EPS;
      const leaving = (across + span <= near + EPS && tangent <= 0) || (across >= far - EPS && tangent >= 0);
      if (Math.abs(pos - plane) > EPS || separated || leaving) faces.splice(i, 1);
    }
    blockedX = faces.some(f => f.nx); blockedY = faces.some(f => f.ny);
  }
  return { blockedX, blockedY };
}
function releaseTime(drag, faces, dx, dy) {
  let time = 1;
  for (const f of faces) {
    const across = f.nx ? drag.y : drag.x, span = f.nx ? drag.origin.h : drag.origin.w, delta = f.nx ? dy : dx;
    if (Math.abs(delta) < EPS) continue;
    const edge = delta > 0 ? (f.nx ? f.rect.bottom : f.rect.right) : (f.nx ? f.rect.top : f.rect.left) - span;
    const t = (edge - across) / delta;
    if (t > EPS) time = Math.min(time, t);
  }
  return time;
}
export function dragBy(drag, dx, dy) {
  if (drag.terminal || !Number.isFinite(dx) || !Number.isFinite(dy)) return drag;
  const obstacles = colliders(drag), inputX = dx, inputY = dy, faces = [];
  let time = 1;
  if (drag.pressure && (drag.pressure.axis === 'x' ? dx : dy) * drag.pressure.sign < -EPS) drag.pressure = null;
  resetPressure(drag);
  // Visit contact and release times, restoring pointer motion as soon as a corner clears.
  for (let events = 0; events < obstacles.length * 4 + 8 && time > EPS; events++) {
    const { blockedX, blockedY } = contactMasks(drag, faces, inputX, inputY);
    dx = blockedX ? 0 : inputX * time; dy = blockedY ? 0 : inputY * time;
    const hit = firstHit(drag, dx, dy, obstacles), release = releaseTime(drag, faces, dx, dy), t = Math.min(hit?.t ?? 1, release);
    advanceSegment(drag, drag.x + dx * t, drag.y + dy * t, blockedX ? inputX * time * t : 0, blockedY ? inputY * time * t : 0, faces);
    if (drag.terminal) break;
    time *= 1 - t;
    if (hit && Math.abs(hit.t - t) < EPS) {
      if (time > EPS) drag.blocked = true;
      for (const face of hit.faces) if (!faces.some(f => f.rect === face.rect && f.nx === face.nx)) faces.push(face);
    }
  }
  return drag;
}
