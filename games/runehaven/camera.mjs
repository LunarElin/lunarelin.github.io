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

export function cameraFocus(player, framing, width, height, bag) {
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
  const pan = Math.max(0, 7 - width / (2 * pixels));
  const focusU = clamp(clamp(u, -pan, pan), u - horizontal, u + horizontal);
  const focusV = clamp(clamp(v, 1.6, 4.7), v - down, v + up);
  return { x: focusU * CAMERA_RIGHT.x + focusV * CAMERA_DOWN.x, z: focusU * CAMERA_RIGHT.z + focusV * CAMERA_DOWN.z };
}

export function battleCamera(width, height, player, units, gate) {
  const groundY = CAMERA_OFFSET.y / Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  const points = [player, ...units.filter((unit) => unit.hp > 0), { x: gate.x - 2.5, z: 6.8 }, { x: gate.x + 2.5, z: 6.8 }];
  let minU = Infinity, maxU = -Infinity, minS = Infinity, maxS = -Infinity;
  for (const point of points) {
    const u = point.x * CAMERA_RIGHT.x + point.z * CAMERA_RIGHT.z;
    const v = point.x * CAMERA_DOWN.x + point.z * CAMERA_DOWN.z;
    const top = point === player ? carryHeight(player.bag) : 2.1;
    minU = Math.min(minU, u - .5); maxU = Math.max(maxU, u + .5);
    minS = Math.min(minS, -v * groundY); maxS = Math.max(maxS, top * CAMERA_Y - v * groundY);
  }
  const pixels = Math.min(52, width / 7.8, (width - 60) / (maxU - minU), (height - 178) / (maxS - minS));
  const span = height / Math.max(8, pixels);
  const u = (minU + maxU) / 2;
  const v = -((minS + maxS) / 2 - 51 / pixels) / groundY;
  return { framing: { span, focusY: 0 }, focus: { x: u * CAMERA_RIGHT.x + v * CAMERA_DOWN.x, z: u * CAMERA_RIGHT.z + v * CAMERA_DOWN.z } };
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
