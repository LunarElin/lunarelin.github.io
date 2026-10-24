// Camera framing is expressed in CSS pixels, independent of render resolution.
export const CAMERA_OFFSET = Object.freeze({ x: 4, y: 18.5, z: 20 });
const groundLength = Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.z);
export const CAMERA_Y = groundLength / Math.hypot(groundLength, CAMERA_OFFSET.y);
export const CAMERA_RIGHT = Object.freeze({ x: CAMERA_OFFSET.z / groundLength, z: -CAMERA_OFFSET.x / groundLength });
export const CAMERA_DOWN = Object.freeze({ x: CAMERA_OFFSET.x / groundLength, z: CAMERA_OFFSET.z / groundLength });

export function carryHeight(bag = {}) {
  return 2.1 + (bag.gear || 0) * .17 + (bag.potion || 0) * .31 + (bag.food || 0) * .22;
}

export function cameraFraming(width, height, bag) {
  const feet = Math.min(height * .64, height - 140);
  const pixelsPerUnit = Math.min(46, width / 9.4, (feet - 38) / (carryHeight(bag) * CAMERA_Y));
  const span = height / Math.max(12, pixelsPerUnit);
  return { span, feet, focusY: (feet - height / 2) * span / height / CAMERA_Y };
}

export function cameraFocus(player, framing, width, height, bag, bounds = { minX: -6, maxX: 6, minZ: -4.7, maxZ: 6 }) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const u = player.x * CAMERA_RIGHT.x + player.z * CAMERA_RIGHT.z;
  const v = player.x * CAMERA_DOWN.x + player.z * CAMERA_DOWN.z;
  const pixels = height / framing.span;
  const groundY = CAMERA_OFFSET.y / Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  // Ease against the shop edges instead of showing a large empty area behind
  // the back wall. Cargo and control margins take priority over the edge stop.
  const horizontal = (width / 2 - 38) / pixels;
  const up = Math.max(0, (framing.feet - 38 - carryHeight(bag) * CAMERA_Y * pixels) / (pixels * groundY));
  const down = Math.max(0, (height - 140 - framing.feet) / (pixels * groundY));
  const pan = Math.max(0, (bounds.maxX - bounds.minX) / 2 + 1 - width / (2 * pixels));
  const focusU = clamp(clamp(u, -pan, pan), u - horizontal, u + horizontal);
  const focusV = clamp(clamp(v, 1.6 + bounds.minZ + 4.7, bounds.maxZ - 1.3), v - down, v + up);
  return { x: focusU * CAMERA_RIGHT.x + focusV * CAMERA_DOWN.x, z: focusU * CAMERA_RIGHT.z + focusV * CAMERA_DOWN.z };
}

export function battleCamera(width, height, defenders, enemies, time = 0, previousView) {
  // Keep the same readable scale as the front moves. A distant reinforcement,
  // shop facade or idle shopkeeper must never make every fighter smaller.
  const pixels = Math.min(60, width / 6.4, height / 6.5);
  const framing = { span: height / Math.max(12, pixels), focusY: .85 };
  const alive = (units) => units.filter((unit) => unit.hp > 0 && Number.isFinite(unit.x) && Number.isFinite(unit.z));
  const allies = alive(defenders), foes = alive(enemies);
  const previous = previousView && Number.isFinite(previousView.x) && Number.isFinite(previousView.z) ? { x: previousView.x, z: previousView.z } : null;
  // Hold the last clash for the result instead of panning to distant survivors.
  if (!allies.length || !foes.length) {
    if (previousView?.subjectId) framing.subject = { subjectId: previousView.subjectId, subjectTeam: previousView.subjectTeam,
      subjectSource: previousView.subjectSource, subjectTarget: previousView.subjectTarget, shotUntil: previousView.shotUntil };
    return { framing, focus: previous || { x: 0, z: 2.5 } };
  }
  const contacts = [];
  const recent = (unit) => Number.isFinite(unit.attackAt) && time >= unit.attackAt && time - unit.attackAt < .85;
  function nearestContacts(team, opponents, teamName) {
    for (const [index, unit] of team.entries()) {
      let opponent, distance = Infinity;
      for (const other of opponents) {
        const gap = Math.hypot(other.x - unit.x, other.z - unit.z);
        if (gap < distance) { distance = gap; opponent = other; }
      }
      const actualTarget = recent(unit) && Number.isFinite(unit.targetX) && Number.isFinite(unit.targetZ);
      const target = actualTarget ? { x: unit.targetX, z: unit.targetZ } : opponent;
      if (actualTarget) distance = Math.hypot(target.x - unit.x, target.z - unit.z);
      contacts.push({ x: (unit.x + target.x) / 2, z: (unit.z + target.z) / 2, distance,
        source: unit, target, id: unit.id || `${teamName}-${index}`, team: teamName, actualTarget,
        striking: (recent(unit) || !actualTarget && recent(opponent)) && distance <= Math.max(unit.range || 1.1, opponent.range || 1.1) + .8 });
    }
  }
  nearestContacts(allies, foes, 'defender'); nearestContacts(foes, allies, 'enemy');
  const nearest = Math.min(...contacts.map((contact) => contact.distance));
  const front = contacts.filter((contact) => contact.striking || contact.distance <= nearest + 1);
  // Select the densest nearby clash. The small continuity bonus settles ties
  // between equally busy flanks without locking onto a lone departing enemy.
  let seed = front[0], best = -Infinity;
  for (const candidate of front) {
    let score = previous ? .3 / (1 + Math.hypot(candidate.x - previous.x, candidate.z - previous.z)) : 0;
    for (const contact of front) {
      const distance = Math.hypot(candidate.x - contact.x, candidate.z - contact.z);
      score += Math.max(0, 1 - distance / 3) * (contact.striking ? 1.5 : 1);
    }
    if (score > best) { seed = candidate; best = score; }
  }
  let x = 0, z = 0, total = 0;
  for (const contact of front) {
    const distance = Math.hypot(seed.x - contact.x, seed.z - contact.z);
    if (distance > 2.8) continue;
    const weight = (1 - distance / 4) * (contact.striking ? 1.5 : 1);
    x += contact.x * weight; z += contact.z * weight; total += weight;
  }
  const focus = { x: x / total, z: z / total };
  // A dense melee group must not push its firing archer or mage offscreen.
  // Keep one related real attack, rather than widening to every distant flank.
  const ranged = front.filter((contact) => contact.actualTarget && contact.striking && contact.source.range > 1.5
    && Math.hypot(contact.x - seed.x, contact.z - seed.z) <= 2.8);
  let subject = ranged.find((contact) => contact.id === previousView?.subjectId && time < previousView.shotUntil);
  if (!subject && ranged.length) subject = ranged.reduce((best, contact) => {
    const score = (item) => Math.hypot(item.x - seed.x, item.z - seed.z) - (item.id === previousView?.subjectId ? .4 : 0);
    return score(contact) < score(best) ? contact : best;
  });
  subject ||= front.filter((contact) => contact.actualTarget && contact.striking
    && Math.hypot(contact.x - seed.x, contact.z - seed.z) <= 2.8)
    .sort((a, b) => Math.hypot(a.x - seed.x, a.z - seed.z) - Math.hypot(b.x - seed.x, b.z - seed.z))[0] || seed;
  const anchors = subject.distance <= 4.6 ? [subject.source, subject.target] : [subject.target];
  const groundY = CAMERA_OFFSET.y / Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  const halfWidth = (width / 2 - 32) / pixels;
  const up = (height / 2 - 44 + (framing.focusY - 2.6) * CAMERA_Y * pixels) / (groundY * pixels);
  const down = (height / 2 - 48 - framing.focusY * CAMERA_Y * pixels) / (groundY * pixels);
  let minU = -Infinity, maxU = Infinity, minV = -Infinity, maxV = Infinity;
  for (const point of anchors) {
    const u = point.x * CAMERA_RIGHT.x + point.z * CAMERA_RIGHT.z;
    const v = point.x * CAMERA_DOWN.x + point.z * CAMERA_DOWN.z;
    minU = Math.max(minU, u + .6 - halfWidth); maxU = Math.min(maxU, u - .6 + halfWidth);
    minV = Math.max(minV, v - down); maxV = Math.min(maxV, v + up);
  }
  const clamp = (value, min, max) => min <= max ? Math.max(min, Math.min(max, value)) : (min + max) / 2;
  const u = clamp(focus.x * CAMERA_RIGHT.x + focus.z * CAMERA_RIGHT.z, minU, maxU);
  const v = clamp(focus.x * CAMERA_DOWN.x + focus.z * CAMERA_DOWN.z, minV, maxV);
  framing.guard = { minU, maxU, minV, maxV };
  framing.subject = { subjectId: subject.id, subjectTeam: subject.team,
    subjectSource: { x: subject.source.x, z: subject.source.z }, subjectTarget: { x: subject.target.x, z: subject.target.z },
    shotUntil: subject.actualTarget ? subject.source.attackAt + .45 : 0 };
  return { framing, focus: { x: u * CAMERA_RIGHT.x + v * CAMERA_DOWN.x, z: u * CAMERA_RIGHT.z + v * CAMERA_DOWN.z } };
}

export function followBattleCamera(current, focus, framing, dt, snap = false) {
  if (!current || snap) return { ...focus, span: framing.span, focusY: framing.focusY, playerX: focus.x, playerZ: focus.z, ...framing.subject };
  const dx = focus.x - current.x, dz = focus.z - current.z;
  const distance = Math.hypot(dx, dz);
  // Ignore tiny target changes, then ease and cap travel. Unlike player blink
  // following, a changed combat target never snaps the camera across the yard.
  const guard = framing.guard;
  const u = current.x * CAMERA_RIGHT.x + current.z * CAMERA_RIGHT.z;
  const v = current.x * CAMERA_DOWN.x + current.z * CAMERA_DOWN.z;
  const outside = guard ? Math.hypot(Math.max(guard.minU - u, 0, u - guard.maxU), Math.max(guard.minV - v, 0, v - guard.maxV)) : 0;
  // Catch a new offscreen clash promptly; once visible, keep the gentle pan.
  const critical = outside > .6;
  const response = critical ? 24 : outside > .1 ? 12 : 5;
  const speed = critical ? 36 : Math.min(18, 5 + outside * 10);
  const travel = Math.min(Math.max(0, distance - .12) * (1 - Math.exp(-response * dt)), speed * dt);
  const scale = distance ? travel / distance : 0;
  const zoom = 1 - Math.exp(-3 * dt);
  return { x: current.x + dx * scale, z: current.z + dz * scale,
    span: current.span + (framing.span - current.span) * zoom,
    focusY: current.focusY + (framing.focusY - current.focusY) * zoom,
    playerX: focus.x, playerZ: focus.z, ...framing.subject };
}

export function followCamera(current, player, framing, dt, snap = false) {
  const jumped = !current || Math.hypot(player.x - current.playerX, player.z - current.playerZ) > 1.8;
  if (snap || jumped) return { x: player.x, z: player.z, span: framing.span, focusY: framing.focusY, playerX: player.x, playerZ: player.z };
  const follow = 1 - Math.exp(-12 * dt);
  // Zoom out immediately to protect new cargo; return gently after unloading.
  const zoom = framing.span > current.span ? 1 : 1 - Math.exp(-2.2 * dt);
  const span = current.span + (framing.span - current.span) * zoom;
  return {
    x: current.x + (player.x - current.x) * follow,
    z: current.z + (player.z - current.z) * follow,
    span,
    focusY: framing.focusY * span / framing.span,
    playerX: player.x, playerZ: player.z,
  };
}
