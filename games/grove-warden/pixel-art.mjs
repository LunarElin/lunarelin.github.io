import { PALETTE, PIXEL_INDEX } from './theme.mjs';

// Original native pixel clusters, lit from the upper left. No sampled images.
export function buildPixelArt() {
  const palette = [...PALETTE], C = PIXEL_INDEX;
  const sprites = {};
  function grid(width, height) {
    const pixels = new Uint8Array(width * height);
    const p = (x, y, color) => { if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = color; };
    const r = (x, y, w, h, color) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p(xx, yy, color); };
    const line = (x0, y0, x1, y1, color) => {
      if (![x0, y0, x1, y1, color].every(Number.isInteger)) throw new TypeError('Native pixel lines require finite integer coordinates and palette indices');
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      for (;;) { p(x0, y0, color); if (x0 === x1 && y0 === y1) break; const twice = error * 2; if (twice >= dy) { error += dy; x0 += sx; } if (twice <= dx) { error += dx; y0 += sy; } }
    };
    const poly = (points, color) => {
      const minX = Math.min(...points.map(v => v[0])), maxX = Math.max(...points.map(v => v[0]));
      const minY = Math.min(...points.map(v => v[1])), maxY = Math.max(...points.map(v => v[1]));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i], [bx, by] = points[j];
          if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        }
        if (inside) p(x, y, color);
      }
    };
    const edge = () => {
      const original = pixels.slice();
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (original[y * width + x]) continue;
        const left = x ? original[y * width + x - 1] : 0, right = x + 1 < width ? original[y * width + x + 1] : 0;
        const above = y ? original[(y - 1) * width + x] : 0, below = y + 1 < height ? original[(y + 1) * width + x] : 0;
        if (left || right || above || below) {
          const lit = !left && !above && (right || below), neighbor = below || right;
          p(x, y, lit ? neighbor >= C.forest && neighbor <= C.sunLeaf ? C.forest : C.shade : C.ink);
        }
      }
      return pixels;
    };
    return { width, height, pixels, p, r, line, poly, edge };
  }
  function mirror(frame, width, height) {
    const copy = new Uint8Array(frame.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) copy[y * width + x] = frame[y * width + width - 1 - x];
    return copy;
  }
  function actor(id, width, height, anchorY, paint) {
    const frames = {};
    for (const direction of ['down', 'up', 'right']) frames[direction] = [0, 1, 2].map(step => { const g = grid(width, height); paint(g, direction, step); return g.edge(); });
    frames.left = frames.right.map(frame => mirror(frame, width, height));
    sprites[id] = { width, height, anchorX: width >> 1, anchorY, frames };
  }
  function prop(id, width, height, anchorX, anchorY, paint, count = 1, outline = true) {
    const frames = { down: Array.from({ length: count }, (_, frame) => { const g = grid(width, height); paint(g, frame); return outline ? g.edge() : g.pixels; }) };
    sprites[id] = { width, height, anchorX, anchorY, frames };
  }
  const gait = step => step === 1 ? [-1, 1] : step === 2 ? [1, -1] : [0, 0];
  function druid(g, direction, step, villager = false, weapon = 'staff') {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = direction === 'right', back = direction === 'up';
    const cloth = villager ? C.wood : C.deepTeal, fold = villager ? C.woodDark : C.shade;
    // Boots and split robe remain at the same native baseline in every weapon variant.
    r(10, 26 + a, 5, 4, C.woodDark); r(17, 26 + b, 5, 4, C.woodDark);
    r(10, 27 + a, 3, 2, C.woodLight); r(17, 27 + b, 3, 2, C.wood); p(14, 29 + a, C.ink); p(21, 29 + b, C.ink);
    poly([[10, 18], [20, 18], [23, 25], [21, 28], [16, 27], [9, 28], [8, 24]], cloth);
    poly([[12, 20], [15, 20], [14, 26], [11, 27]], villager ? C.woodLight : C.teal);
    poly([[19, 20], [22, 23], [22, 27], [18, 27]], fold); line(15, 24, 15, 26, fold);
    // Light cape, dark jade collar and ochre clasp separate the small hero from grass.
    poly([[10, 18], [15, 19], [13, 22], [10, 25], [7, 24], [8, 21]], C.linen);
    poly([[10, 18], [14, 19], [12, 22], [8, 23], [8, 21]], C.cream);
    poly([[17, 19], [20, 18], [23, 21], [23, 25], [20, 24]], C.linen);
    line(20, 20, 22, 22, C.cream); r(11, 24, 10, 2, C.woodDark); r(15, 24, 2, 2, C.gold);
    r(11, 25, 2, 1, C.woodLight); r(18, 25, 2, 1, C.wood);
    // An angled hood opening and separate fringe replace the old flat face block.
    poly([[10, 9], [12, 6], [17, 4], [20, 6], [22, 10], [23, 15], [20, 19], [11, 19], [8, 15], [8, 11]], cloth);
    poly([[10, 9], [14, 6], [18, 5], [20, 8], [18, 10], [12, 11], [10, 14]], villager ? C.woodLight : C.teal);
    line(12, 8, 16, 6, villager ? C.linen : C.mint); r(9, 11, 2, 4, villager ? C.wood : C.teal);
    if (back) {
      poly([[11, 11], [18, 9], [21, 12], [21, 17], [17, 20], [11, 18]], cloth);
      poly([[11, 12], [14, 10], [16, 10], [15, 15], [12, 17]], villager ? C.woodLight : C.teal);
      line(17, 12, 19, 15, fold); r(12, 18, 7, 2, C.stoneLight); r(13, 18, 4, 1, C.cream);
      poly([[9, 20], [15, 22], [21, 20], [21, 24], [17, 26], [12, 26], [9, 24]], C.linen);
      poly([[10, 20], [15, 22], [14, 25], [11, 24]], C.cream); line(17, 23, 18, 25, C.stoneLight);
    } else if (side) {
      poly([[16, 10], [20, 9], [22, 12], [22, 17], [19, 19], [16, 17]], C.skinShade);
      r(18, 12, 4, 5, C.skin); r(21, 14, 2, 2, C.skin); p(21, 13, C.ink); p(22, 17, C.woodDark);
      poly([[15, 10], [18, 9], [21, 10], [21, 12], [19, 12], [18, 14], [17, 17], [15, 16]], C.stoneLight);
      line(16, 10, 19, 10, C.cream); r(16, 11, 2, 3, C.cream); p(17, 16, C.linen);
    } else {
      poly([[11, 11], [19, 11], [21, 13], [20, 17], [17, 19], [13, 18], [11, 16]], C.skinShade);
      r(12, 12, 8, 4, C.skin); r(13, 16, 5, 2, C.skin); p(13, 14, C.ink); p(18, 14, C.ink); r(15, 17, 2, 1, C.skinShade);
      poly([[10, 11], [12, 9], [18, 9], [21, 11], [20, 14], [18, 12], [16, 12], [15, 14], [13, 12], [11, 16], [10, 15]], C.stoneLight);
      r(12, 10, 6, 2, C.cream); r(11, 12, 2, 3, C.cream); p(19, 11, C.cream); r(19, 14, 2, 3, C.linen);
    }
    if (weapon !== 'bare') { r(22, 20, 3, 4, C.skinShade); r(22, 20, 2, 3, C.skin); p(23, 23, C.woodDark); }
    if (weapon === 'sword') {
      poly([[25, 5], [27, 8], [27, 19], [24, 19], [24, 8]], C.stone);
      r(25, 8, 1, 11, C.cream); r(26, 9, 1, 10, C.stoneLight); p(25, 6, C.cream);
      r(23, 20, 6, 2, C.woodLight); r(24, 20, 4, 1, C.gold); r(25, 22, 2, 5, C.woodDark); p(25, 24, C.woodLight); r(24, 28, 4, 1, C.gold);
    } else if (weapon === 'axe') {
      line(26, 8, 26, 29, C.woodDark); line(27, 10, 27, 28, C.woodLight);
      poly([[22, 8], [26, 6], [29, 7], [30, 10], [29, 14], [25, 16], [22, 13]], C.slate);
      poly([[22, 8], [26, 7], [28, 8], [27, 11], [23, 12]], C.stoneLight); line(23, 8, 25, 8, C.cream);
      line(24, 14, 28, 12, C.stone); r(26, 9, 3, 2, C.gold);
    } else if (weapon === 'spear') {
      line(25, 8, 25, 29, C.woodDark); line(26, 10, 26, 28, C.woodLight);
      poly([[25, 2], [28, 7], [26, 10], [23, 7]], C.stone); line(25, 4, 25, 8, C.cream); r(26, 6, 1, 2, C.stoneLight);
      r(24, 11, 4, 2, C.linen); r(24, 28, 4, 2, C.gold);
    } else if (weapon === 'staff') {
      line(25, 9, 25, 29, C.woodDark); line(26, 10, 26, 28, C.woodLight);
      poly([[23, 8], [25, 5], [28, 8], [26, 12]], villager ? C.gold : C.teal);
      r(25, 7, 1, 3, villager ? C.cream : C.mint); p(25, 7, C.cream); p(25, 11, C.deepTeal); r(24, 13, 4, 1, C.linen);
    }
    if (villager) {
      poly([[8, 9], [11, 6], [18, 6], [22, 10], [23, 12], [8, 12]], C.woodLight);
      r(9, 10, 13, 2, C.woodDark); r(11, 7, 7, 2, C.linen); r(18, 21, 3, 5, C.linen); p(19, 22, C.wood);
    }
  }
  actor('druid', 32, 32, 30, druid);
  sprites.druid.wandTips = { down: [25, 8], up: [25, 8], right: [25, 8], left: [6, 8] };
  for (const [id, weapon] of [['druidSword', 'sword'], ['druidAxe', 'axe'], ['druidSpear', 'spear']]) actor(id, 32, 32, 30, (g, d, s) => druid(g, d, s, false, weapon));
  actor('npc', 32, 32, 30, (g, d, s) => druid(g, d, s, true));
  const attackPoses = {
    sword: {
      right: [[[29, 24], [25, 7]], [[35, 30], [44, 39]], [[33, 30], [41, 21]]],
      down: [[[32, 27], [38, 12]], [[29, 33], [24, 45]], [[32, 31], [39, 39]]],
      up: [[[33, 27], [42, 17]], [[29, 23], [25, 3]], [[31, 25], [35, 10]]],
    },
    axe: {
      right: [[[30, 24], [31, 8]], [[34, 30], [40, 37]], [[33, 31], [39, 21]]],
      down: [[[31, 27], [34, 12]], [[29, 33], [27, 40]], [[32, 32], [38, 37]]],
      up: [[[33, 27], [39, 17]], [[29, 23], [26, 8]], [[31, 25], [35, 12]]],
    },
    spear: {
      right: [[[29, 30], [39, 29]], [[35, 30], [45, 30]], [[32, 31], [42, 30]]],
      down: [[[31, 29], [32, 39]], [[29, 34], [27, 45]], [[31, 31], [30, 41]]],
      up: [[[33, 28], [37, 13]], [[29, 23], [27, 2]], [[31, 26], [34, 10]]],
    },
  };
  function attackWeapon(g, kind, grip, tip) {
    const [gx, gy] = grip, [tx, ty] = tip, ax = Math.abs(tx - gx), ay = Math.abs(ty - gy);
    const dx = ax * 2 >= ay ? Math.sign(tx - gx) : 0, dy = ay * 2 >= ax ? Math.sign(ty - gy) : 0, px = -dy, py = dx;
    const point = (x, y, along, across) => [x + dx * along + px * across, y + dy * along + py * across];
    if (kind === 'spear') {
      const butt = point(gx, gy, -13, 0), neck = point(tx, ty, -5, 0);
      g.line(...butt, ...neck, C.woodDark); g.line(butt[0] + px, butt[1] + py, neck[0] + px, neck[1] + py, C.woodLight);
      g.poly([tip, point(tx, ty, -4, 2), point(tx, ty, -6, 0), point(tx, ty, -4, -2)], C.stoneLight);
      g.line(...point(tx, ty, -4, 0), ...tip, C.cream); g.p(...point(tx, ty, -4, -1), C.stone);
    } else if (kind === 'axe') {
      g.line(...point(gx, gy, -4, 0), tx, ty, C.woodDark);
      g.line(gx + px, gy + py, tx + px, ty + py, C.woodLight);
      g.poly([point(tx, ty, -2, -3), point(tx, ty, 2, -3), point(tx, ty, 3, -1), point(tx, ty, 2, 3), point(tx, ty, -2, 3), point(tx, ty, -3, 1)], C.slate);
      g.poly([point(tx, ty, -2, -3), point(tx, ty, 2, -3), point(tx, ty, 2, 0), point(tx, ty, -2, 1)], C.stoneLight);
      g.line(tx - 1, ty - 2, tx + 1, ty - 2, C.cream); g.p(tx, ty, C.woodLight);
    } else {
      const neck = point(gx, gy, 3, 0);
      g.line(...point(gx, gy, -3, 0), ...neck, C.woodDark);
      g.poly([tip, point(tx, ty, -3, 1), [neck[0] + px, neck[1] + py], [neck[0] - px, neck[1] - py], point(tx, ty, -3, -1)], C.stone);
      g.line(neck[0] - px, neck[1] - py, tx, ty, C.cream);
      g.line(...point(gx, gy, 2, -3), ...point(gx, gy, 2, 3), C.woodLight);
      g.p(...point(gx, gy, 2, -2), C.gold);
    }
  }
  function attackPose(g, direction, phase, kind) {
    const body = grid(32, 32); druid(body, direction, 0, false, 'bare');
    const [grip, tip] = attackPoses[kind][direction][phase], side = direction === 'right', back = direction === 'up';
    const shoulder = side ? [28, 28] : back ? [29, 28] : [28, 29];
    const elbow = side ? phase === 0 ? [29, 25] : phase === 1 ? [32, 30] : [31, 30]
      : back ? [33, 27] : phase === 1 ? [31, 31] : [32, 29];
    const arm = () => {
      g.line(shoulder[0], shoulder[1] + 1, elbow[0], elbow[1] + 1, C.deepTeal);
      g.line(...shoulder, ...elbow, C.linen); g.line(...elbow, ...grip, C.linen);
      g.line(elbow[0], elbow[1] - 1, grip[0], grip[1] - 1, C.cream);
      g.r(grip[0] - 1, grip[1] - 1, 3, 3, C.skinShade); g.r(grip[0] - 1, grip[1] - 1, 2, 2, C.skin);
      if (kind === 'spear') { const bx = grip[0] - (side ? 6 : -2), by = grip[1] + (side ? 0 : -5); g.line(25, 29, bx, by, C.linen); g.r(bx - 1, by - 1, 2, 2, C.skin); }
    };
    const behind = back || phase === 0 && kind !== 'spear';
    if (behind) { attackWeapon(g, kind, grip, tip); arm(); }
    // A one/two-texel upper-body lean is authored into the pose, never resampled.
    // Feet stay at the original (8,8)-padded baseline throughout the attack.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const color = body.pixels[y * 32 + x]; if (!color) continue;
      const upper = y < 24, lean = side && upper ? phase === 1 ? kind === 'spear' ? 2 : 1 : phase === 0 ? -1 : 0 : 0;
      const dip = upper && phase === 1 ? back ? -1 : 1 : 0;
      g.p(x + 8 + lean, y + 8 + dip, color);
    }
    if (!behind) { attackWeapon(g, kind, grip, tip); arm(); }
  }
  for (const [id, kind] of [['druidSwordAttack', 'sword'], ['druidAxeAttack', 'axe'], ['druidSpearAttack', 'spear']])
    actor(id, 48, 48, 38, (g, d, phase) => attackPose(g, d, phase, kind));
  actor('wolf', 32, 32, 29, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up';
    if (side) {
      poly([[3, 14], [5, 15], [7, 19], [10, 20], [8, 23], [5, 21], [2, 17]], C.navy);
      poly([[3, 14], [5, 17], [7, 19], [5, 19]], C.sky);
      poly([[9, 15], [19, 14], [24, 18], [25, 23], [20, 26], [10, 25], [7, 21]], C.blue);
      poly([[10, 15], [18, 15], [21, 18], [16, 19], [9, 18]], C.sky); r(12, 20, 8, 4, C.navy);
      r(10, 24 + a, 4, 5, C.navy); r(20, 23 + b, 4, 6, C.navy); r(10, 27 + a, 3, 1, C.stoneLight); r(20, 27 + b, 3, 1, C.sky);
      poly([[18, 10], [20, 5], [23, 9], [25, 10], [28, 14], [29, 18], [25, 21], [20, 21], [17, 16]], C.blue);
      poly([[19, 10], [21, 8], [23, 12], [26, 13], [25, 16], [20, 15]], C.sky);
      poly([[23, 16], [28, 16], [29, 19], [25, 21], [21, 19]], C.cream); r(27, 16, 3, 2, C.navy);
      p(25, 13, C.ink); p(20, 8, C.lilac); line(21, 20, 24, 21, C.linen);
    } else {
      poly([[9, 17], [20, 17], [24, 21], [23, 26], [18, 28], [10, 27], [6, 22]], C.blue);
      r(10, 24 + a, 4, 5, C.navy); r(18, 24 + b, 4, 5, C.navy); r(10, 27 + a, 3, 1, C.sky); r(18, 27 + b, 3, 1, C.sky);
      poly([[7, 14], [8, 5], [13, 9], [18, 9], [23, 5], [24, 14], [22, 19], [18, 22], [11, 21]], C.blue);
      poly([[9, 11], [12, 10], [15, 12], [19, 10], [22, 12], [20, 16], [12, 17], [9, 15]], C.sky);
      r(9, 8, 2, 4, C.navy); r(21, 8, 2, 4, C.navy); p(10, 9, C.lilac); p(21, 9, C.lilac);
      if (back) { poly([[11, 14], [16, 15], [20, 13], [22, 18], [17, 24], [12, 22]], C.navy); line(12, 14, 15, 18, C.blue); poly([[14, 23], [17, 23], [21, 27], [18, 29], [15, 27]], C.sky); }
      else { p(11, 15, C.ink); p(20, 15, C.ink); poly([[11, 17], [15, 19], [20, 17], [19, 21], [16, 23], [12, 21]], C.cream); r(14, 18, 4, 2, C.navy); p(15, 21, C.woodDark); poly([[11, 22], [16, 24], [20, 22], [18, 26], [14, 27]], C.stoneLight); }
    }
  });
  actor('bear', 48, 48, 44, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up';
    poly([[13, 19], [29, 17], [36, 22], [39, 33], [34, 40], [13, 41], [8, 34], [9, 26]], C.wood);
    poly([[12, 23], [18, 20], [22, 24], [19, 34], [13, 36]], C.woodLight);
    poly([[29, 22], [36, 25], [37, 35], [31, 39], [25, 38]], C.woodDark);
    poly([[8, 23], [13, 22], [15, 28], [13, 35], [9, 38], [5, 35], [5, 28]], C.wood);
    poly([[34, 23], [39, 23], [43, 29], [42, 36], [38, 38], [34, 34]], C.woodDark); r(7, 27, 3, 7, C.woodLight);
    r(12, 36 + a, 9, 8, C.woodDark); r(28, 36 + b, 9, 8, C.woodDark);
    for (const [x, y] of [[13, 42 + a], [17, 42 + a], [29, 42 + b], [33, 42 + b]]) r(x, y, 2, 1, C.linen);
    poly([[12, 12], [12, 7], [16, 5], [20, 8], [29, 8], [33, 5], [37, 8], [36, 13], [38, 18], [34, 26], [26, 30], [16, 27], [11, 21]], C.wood);
    poly([[14, 10], [17, 7], [20, 10], [28, 10], [31, 14], [25, 16], [16, 17], [13, 14]], C.woodLight);
    r(15, 8, 3, 3, C.skinShade); r(32, 8, 3, 3, C.skinShade); r(34, 14, 3, 8, C.woodDark);
    if (back) { poly([[16, 18], [24, 20], [33, 17], [34, 24], [26, 28], [17, 25]], C.woodDark); line(16, 14, 19, 16, C.skinShade); }
    else if (side) { poly([[29, 19], [36, 18], [41, 22], [39, 26], [33, 28], [29, 25]], C.linen); r(37, 20, 4, 3, C.woodDark); r(30, 16, 2, 2, C.ink); p(36, 25, C.woodDark); }
    else { r(17, 17, 2, 2, C.ink); r(30, 17, 2, 2, C.ink); poly([[19, 21], [24, 19], [30, 21], [31, 25], [26, 28], [20, 26]], C.linen); r(22, 21, 6, 3, C.woodDark); line(25, 24, 25, 26, C.woodDark); poly([[16, 29], [24, 32], [32, 28], [29, 34], [24, 36], [19, 33]], C.skinShade); }
    for (const [x, y] of [[12, 30], [15, 35], [31, 33]]) { r(x, y, 3, 1, C.woodDark); p(x + 1, y - 1, C.woodLight); }
  });
  actor('dragon', 48, 48, 44, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up', flap = step === 1 ? -2 : step === 2 ? 2 : 0;
    poly([[17, 22], [11, 12 + flap], [8, 10 + flap], [3, 23], [7, 28], [11, 25], [16, 32]], C.deepTeal);
    poly([[14, 21], [10, 16 + flap], [6, 23], [10, 23], [14, 27]], C.skinShade); line(10, 16 + flap, 11, 23, C.orange);
    poly([[31, 22], [36, 13 + flap], [40, 11 + flap], [45, 24], [41, 29], [37, 26], [32, 32]], C.deepTeal);
    poly([[34, 21], [39, 17 + flap], [42, 24], [38, 24], [34, 28]], C.woodLight); line(39, 17 + flap, 37, 23, C.orange);
    poly([[18, 24], [27, 23], [33, 29], [33, 36], [29, 41], [19, 41], [15, 36]], C.teal);
    poly([[18, 25], [22, 25], [20, 35], [17, 36]], C.mint); r(29, 30, 4, 8, C.deepTeal);
    poly([[18, 35], [12, 36], [7, 40], [4, 38], [7, 43], [14, 42], [22, 38]], C.deepTeal); line(8, 40, 14, 38, C.teal);
    r(18, 37 + a, 6, 7, C.deepTeal); r(27, 37 + b, 6, 7, C.deepTeal); r(18, 42 + a, 2, 1, C.linen); r(22, 42 + a, 2, 1, C.linen); r(27, 42 + b, 2, 1, C.linen); r(31, 42 + b, 2, 1, C.linen);
    poly(side ? [[24, 12], [33, 10], [37, 14], [38, 18], [42, 20], [41, 25], [34, 28], [26, 26], [22, 20]] : [[18, 12], [25, 10], [30, 13], [34, 19], [33, 25], [27, 29], [18, 26], [14, 20]], C.teal);
    poly([[17, 13], [17, 7], [21, 12]], C.linen); poly([[28, 12], [32, 7], [31, 16]], C.linen);
    poly([[18, 13], [23, 11], [28, 13], [27, 16], [23, 17], [17, 17]], C.mint);
    if (back) { poly([[21, 22], [27, 23], [29, 37], [25, 41], [22, 38]], C.deepTeal); for (let y = 24; y < 39; y += 4) poly([[23, y], [26, y + 2], [23, y + 3]], C.orange); }
    else if (side) { p(34, 16, C.ink); poly([[32, 21], [41, 21], [40, 25], [34, 27], [30, 24]], C.linen); r(39, 20, 2, 1, C.deepTeal); line(35, 24, 39, 24, C.woodDark); }
    else { r(18, 19, 3, 2, C.ink); r(28, 19, 3, 2, C.ink); poly([[20, 23], [29, 23], [30, 26], [27, 28], [22, 27]], C.linen); p(22, 23, C.deepTeal); p(27, 23, C.deepTeal); line(23, 26, 27, 26, C.woodDark); poly([[21, 30], [28, 29], [29, 38], [25, 40], [21, 37]], C.linen); line(22, 33, 28, 33, C.skinShade); line(22, 36, 28, 36, C.skinShade); }
  });
  actor('owl', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, back = d === 'up', side = d === 'right', flap = step === 1 ? -3 : step === 2 ? 2 : 0;
    poly([[7, 12], [3, 10 + flap], [2, 15 + flap], [4, 18 + flap], [8, 19]], C.woodDark); poly([[16, 12], [20, 10 + flap], [22, 15 + flap], [19, 18 + flap], [16, 19]], C.woodDark);
    line(3, 12 + flap, 5, 16 + flap, C.woodLight); line(20, 12 + flap, 19, 16 + flap, C.wood);
    poly([[7, 8], [7, 3], [11, 6], [15, 6], [18, 3], [18, 15], [16, 20], [12, 22], [7, 19], [5, 13]], C.wood);
    poly([[8, 7], [11, 8], [14, 8], [17, 6], [17, 11], [8, 12]], C.woodLight);
    if (back) { poly([[8, 11], [14, 10], [17, 13], [15, 19], [10, 20], [7, 16]], C.woodDark); line(9, 12, 12, 14, C.woodLight); line(10, 16, 13, 18, C.wood); }
    else { poly(side ? [[13, 9], [17, 8], [19, 11], [17, 16], [13, 15]] : [[7, 10], [10, 8], [12, 10], [15, 8], [18, 10], [17, 15], [12, 18], [7, 15]], C.cream); if (!side) { r(8, 10, 3, 3, C.gold); p(9, 11, C.ink); } r(side ? 15 : 14, 10, 3, 3, C.gold); p(side ? 16 : 15, 11, C.ink); p(side ? 18 : 12, 14, C.orange); line(9, 18, 11, 19, C.linen); line(14, 18, 15, 17, C.linen); }
    p(8, 21, C.orange); p(15, 21, C.orange);
  });
  actor('mushroom', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step);
    r(7, 19 + a, 4, 3, C.woodDark); r(14, 19 + b, 4, 3, C.woodDark);
    poly([[8, 12], [15, 12], [17, 17], [17, 20], [13, 22], [8, 20]], C.linen); r(9, 14, 4, 6, C.cream); line(15, 16, 16, 19, C.skinShade);
    poly([[3, 9], [6, 5], [11, 3], [16, 4], [20, 8], [21, 12], [18, 15], [6, 15], [2, 12]], C.red);
    poly([[4, 9], [7, 6], [12, 4], [16, 5], [18, 8], [13, 10], [5, 11]], C.orange);
    r(4, 12, 16, 2, C.woodDark); r(6, 11, 11, 1, C.skinShade); r(7, 6, 3, 2, C.cream); r(14, 7, 3, 2, C.linen); p(6, 7, C.linen);
    if (d === 'down') { p(10, 16, C.ink); p(15, 16, C.ink); r(12, 19, 2, 1, C.skinShade); } else if (d === 'right') { p(16, 16, C.ink); p(17, 18, C.woodDark); } else line(11, 15, 11, 19, C.skinShade);
  });
  actor('boar', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right';
    poly([[4, 11], [8, 8], [16, 8], [20, 11], [22, 17], [18, 21], [7, 21], [2, 17]], C.wood);
    poly([[5, 11], [9, 9], [15, 10], [16, 12], [8, 14], [4, 14]], C.woodLight); r(5, 18 + a, 4, 4, C.woodDark); r(15, 18 + b, 4, 4, C.woodDark);
    poly(side ? [[13, 8], [15, 5], [18, 9], [21, 8], [22, 14], [23, 17], [20, 20], [14, 18], [12, 13]] : [[6, 8], [6, 5], [10, 8], [16, 8], [20, 5], [21, 13], [19, 19], [12, 21], [6, 17]], C.wood);
    line(8, 10, 12, 9, C.woodLight); r(7, 7, 2, 2, C.skinShade); r(18, 8, 2, 2, C.woodDark);
    if (d !== 'up') { poly(side ? [[18, 14], [22, 14], [23, 18], [19, 19], [17, 17]] : [[9, 15], [16, 15], [18, 18], [15, 20], [9, 19], [7, 17]], C.skinShade); p(side ? 20 : 10, 16, C.woodDark); p(side ? 21 : 14, 16, C.woodDark); p(side ? 19 : 8, 12, C.ink); if (!side) p(17, 12, C.ink); r(side ? 21 : 7, 17, 1, 2, C.cream); r(side ? 22 : 18, 17, 1, 2, C.linen); }
    else { poly([[8, 11], [13, 10], [18, 13], [17, 17], [11, 18]], C.woodDark); line(8, 11, 12, 12, C.woodLight); }
  });
  actor('caster', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step);
    r(6, 19 + a, 4, 3, C.shade); r(13, 19 + b, 4, 3, C.shade);
    poly([[8, 12], [15, 12], [19, 21], [5, 21]], C.deepTeal); poly([[8, 13], [11, 14], [10, 20], [6, 20]], C.teal); r(14, 15, 2, 5, C.shade); line(6, 20, 15, 20, C.woodLight);
    r(8, 9, 8, 6, C.stoneLight); r(9, 10, 5, 4, C.cream);
    poly([[4, 10], [8, 7], [10, 3], [15, 2], [14, 5], [17, 10], [20, 12], [4, 12]], C.navy);
    poly([[8, 8], [11, 4], [14, 3], [12, 6], [14, 9]], C.blue); r(5, 10, 14, 2, C.violet); line(6, 10, 12, 10, C.lilac);
    if (d === 'down') { p(9, 13, C.ink); p(14, 13, C.ink); } else if (d === 'right') p(15, 13, C.ink); else r(8, 12, 8, 3, C.navy);
    line(20, 8, 20, 22, C.woodDark); p(20, 18, C.woodLight); poly([[18, 6], [20, 3], [22, 6], [20, 9]], C.teal); r(20, 5, 1, 2, C.mint); p(20, 5, C.cream);
  });
  actor('runner', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right';
    poly([[5, 11], [12, 10], [18, 12], [19, 16], [15, 18], [7, 17]], C.blue); line(6, 11, 13, 11, C.sky); r(7, 15 + a, 2, 7, C.navy); r(15, 15 + b, 2, 7, C.navy); r(5, 20 + a, 4, 2, C.stoneLight); r(15, 20 + b, 4, 2, C.sky);
    poly([[7, 14], [4, 12], [2, 8], [3, 6], [5, 11], [9, 13]], C.navy); line(3, 7, 5, 11, C.sky);
    poly(side ? [[13, 6], [14, 2], [17, 6], [20, 7], [22, 10], [21, 14], [16, 15], [12, 11]] : [[7, 7], [7, 2], [11, 6], [15, 6], [18, 2], [19, 10], [17, 14], [10, 15], [6, 11]], C.blue);
    poly(side ? [[15, 7], [18, 7], [20, 9], [17, 10], [14, 9]] : [[9, 7], [12, 8], [16, 7], [17, 10], [13, 11], [9, 10]], C.sky);
    if (d !== 'up') { poly(side ? [[18, 11], [22, 11], [21, 14], [18, 15], [16, 13]] : [[10, 11], [16, 11], [16, 14], [12, 15], [10, 13]], C.cream); p(side ? 19 : 9, 9, C.ink); if (!side) p(16, 9, C.ink); p(side ? 21 : 12, 11, C.navy); } else poly([[10, 10], [15, 9], [17, 12], [13, 14], [10, 13]], C.navy);
  });
  actor('swarm', 16, 16, 15, (g, d, step) => {
    const { r, p, poly, line } = g;
    for (const y of [7, 10, 12]) { line(3, y, 1, y + (step === 1 ? -1 : 1), C.woodDark); line(12, y, 14, y + (step === 2 ? -1 : 1), C.woodDark); }
    poly([[5, 4], [10, 4], [12, 7], [12, 11], [9, 14], [5, 13], [3, 9]], C.woodLight);
    poly([[5, 5], [8, 4], [10, 6], [10, 10], [8, 13], [5, 11]], C.orange); r(5, 6, 2, 4, C.gold); line(8, 6, 8, 12, C.wood); r(4, 9, 3, 1, C.woodLight); r(9, 10, 3, 1, C.woodDark);
    r(5, 3, 6, 3, C.woodDark); p(4, 1, C.woodDark); p(11, 1, C.woodDark); p(5, 2, C.woodLight); p(10, 2, C.wood);
    if (d !== 'up') { p(d === 'right' ? 10 : 6, 4, C.cream); p(9, 4, C.cream); } else r(6, 4, 3, 1, C.wood);
  });
  actor('flyer', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, flap = step === 1 ? -3 : step === 2 ? 2 : 0;
    poly([[8, 11], [3, 6 + flap], [1, 11 + flap], [3, 14 + flap], [6, 14 + flap], [8, 18]], C.navy);
    poly([[16, 11], [21, 6 + flap], [23, 11 + flap], [21, 14 + flap], [18, 14 + flap], [16, 18]], C.navy);
    poly([[7, 12], [4, 9 + flap], [3, 11 + flap], [7, 15]], C.violet); poly([[17, 12], [20, 9 + flap], [21, 11 + flap], [17, 15]], C.violet);
    line(4, 9 + flap, 6, 12 + flap, C.lilac); line(20, 9 + flap, 18, 12 + flap, C.lilac);
    poly([[9, 7], [8, 3], [12, 6], [16, 3], [17, 12], [15, 18], [12, 21], [8, 17], [7, 11]], C.navy);
    poly([[9, 8], [12, 9], [15, 8], [15, 14], [12, 18], [9, 15]], C.violet); line(9, 9, 10, 13, C.lilac);
    if (d !== 'up') { p(d === 'right' ? 15 : 9, 11, C.gold); p(14, 11, C.gold); p(d === 'right' ? 16 : 12, 15, C.cream); } else line(12, 10, 12, 17, C.navy);
  });
  function guardian(g, d, step, variant) {
    const { r, p, poly, line } = g, [a, b] = gait(step), ancient = variant === 'ancient', sky = variant === 'sky';
    const body = sky ? C.blue : ancient ? C.stone : C.wood, light = sky ? C.sky : ancient ? C.stoneLight : C.woodLight, shade = sky ? C.navy : ancient ? C.slate : C.woodDark;
    if (sky) {
      poly([[14, 23], [7, 12], [3, 16], [2, 22], [6, 28], [12, 29], [15, 34]], C.navy);
      poly([[34, 23], [41, 12], [45, 16], [46, 22], [42, 28], [36, 29], [33, 34]], C.navy);
      poly([[7, 16], [11, 22], [12, 26], [6, 24], [4, 20]], C.blue); poly([[41, 16], [37, 22], [36, 26], [42, 24], [44, 20]], C.violet); line(7, 16, 10, 21, C.sky);
    }
    poly([[12, 35 + a], [20, 35 + a], [21, 42 + a], [18, 45 + a], [10, 44 + a], [10, 39 + a]], shade);
    poly([[28, 35 + b], [36, 35 + b], [39, 41 + b], [37, 45 + b], [28, 44 + b]], shade);
    r(11, 40 + a, 8, 2, body); r(29, 40 + b, 7, 2, body); line(12, 40 + a, 16, 40 + a, light);
    poly([[14, 18], [31, 17], [38, 24], [37, 34], [32, 40], [16, 40], [10, 33], [10, 24]], body);
    poly([[12, 23], [19, 20], [23, 24], [20, 34], [14, 36], [11, 31]], light);
    poly([[28, 23], [35, 25], [36, 33], [30, 38], [25, 37]], shade); line(21, 26, 22, 34, shade); line(14, 34, 19, 33, body);
    poly([[6, 23], [13, 21], [15, 27], [12, 35], [8, 38], [3, 33], [3, 27]], body);
    poly([[35, 22], [41, 23], [45, 29], [44, 35], [40, 38], [35, 33]], shade);
    poly([[5, 25], [10, 23], [12, 25], [10, 30], [5, 31]], light); line(5, 33, 10, 34, shade); line(38, 28, 42, 29, body);
    poly([[13, 11], [18, 7], [29, 7], [35, 11], [37, 18], [34, 24], [29, 28], [17, 26], [11, 21], [10, 16]], body);
    poly([[13, 12], [19, 9], [28, 9], [32, 12], [28, 15], [19, 14], [12, 17]], light);
    poly([[33, 14], [36, 17], [33, 23], [29, 25], [26, 22]], shade);
    poly([[12, 12], [9, 8], [10, 3], [13, 7], [17, 8]], shade); poly([[31, 10], [35, 4], [38, 3], [37, 9], [35, 14]], shade);
    line(11, 5, 12, 8, light);
    if (d === 'up') { poly([[15, 17], [22, 18], [31, 15], [33, 21], [28, 25], [17, 23]], shade); line(17, 12, 21, 12, body); }
    else if (d === 'right') { r(30, 16, 5, 3, C.ink); r(31, 16, 3, 1, C.gold); poly([[29, 21], [35, 20], [37, 23], [34, 25], [29, 24]], shade); p(35, 21, C.linen); }
    else { r(15, 16, 7, 3, shade); r(27, 16, 7, 3, shade); r(17, 17, 3, 1, C.gold); r(29, 17, 3, 1, C.gold); line(21, 22, 28, 22, shade); p(23, 23, C.ink); p(27, 23, C.ink); }
    if (ancient) {
      for (const x of [7, 34]) { poly([[x, 20], [x + 3, 13], [x + 6, 19], [x + 5, 23], [x + 2, 25]], C.violet); line(x + 3, 15, x + 2, 20, C.lilac); }
      line(19, 11, 17, 14, C.slate); line(16, 27, 19, 30, C.slate); r(30, 34, 3, 2, C.forest); r(31, 33, 2, 1, C.leaf);
    } else if (!sky) {
      poly([[8, 10], [8, 7], [12, 5], [17, 6], [19, 10], [16, 12]], C.green);
      poly([[28, 9], [31, 5], [37, 6], [39, 9], [37, 13], [31, 12]], C.leaf);
      line(10, 7, 14, 7, C.leafLight); r(32, 7, 4, 2, C.sunLeaf);
      line(15, 26, 15, 30, shade); line(29, 29, 30, 34, light); p(30, 31, shade); line(7, 27, 8, 30, body);
    }
    if (d !== 'up') { poly([[22, 29], [26, 27], [29, 31], [27, 35], [22, 34], [20, 31]], sky ? C.lilac : C.teal); line(24, 29, 22, 31, sky ? C.sky : C.mint); p(24, 29, C.cream); }
  }
  actor('boss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'forest'));
  actor('ancientBoss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'ancient'));
  actor('skyBoss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'sky'));
  prop('tree', 64, 80, 32, 77, g => {
    const { r, p, poly, line } = g;
    poly([[26, 42], [37, 42], [37, 64], [41, 70], [45, 75], [41, 77], [33, 73], [28, 74], [21, 77], [19, 74], [26, 65]], C.woodDark);
    poly([[27, 45], [33, 45], [32, 61], [30, 69], [25, 73], [23, 73], [28, 63]], C.wood);
    line(28, 48, 28, 61, C.woodLight); line(29, 64, 26, 70, C.woodLight); line(34, 56, 36, 52, C.ink); line(34, 65, 38, 71, C.wood);
    // Broad overlapping leaf masses, not scattered single-pixel noise.
    poly([[7, 23], [10, 16], [17, 11], [25, 10], [30, 5], [40, 5], [47, 11], [53, 13], [58, 21], [57, 29], [61, 35], [58, 43], [52, 48], [45, 49], [42, 55], [33, 55], [27, 58], [18, 54], [14, 49], [7, 47], [3, 41], [3, 32]], C.forest);
    poly([[7, 23], [12, 16], [20, 12], [26, 13], [31, 8], [40, 8], [47, 14], [53, 17], [55, 24], [52, 30], [57, 35], [53, 43], [44, 45], [39, 50], [31, 50], [25, 53], [18, 49], [17, 44], [8, 42], [6, 36], [8, 30]], C.leaf);
    poly([[12, 21], [17, 16], [23, 15], [28, 18], [33, 12], [40, 11], [45, 17], [46, 22], [51, 25], [47, 31], [39, 30], [34, 35], [27, 33], [22, 38], [14, 37], [10, 32]], C.leafLight);
    poly([[16, 21], [21, 18], [27, 19], [28, 23], [24, 28], [18, 28], [14, 25]], C.sunLeaf);
    poly([[33, 16], [38, 14], [43, 17], [42, 22], [38, 25], [32, 23]], C.sunLeaf);
    // Shingle-like lower leaf lobes show the rounded canopy's shadow side.
    poly([[8, 35], [14, 39], [19, 38], [22, 43], [29, 41], [32, 45], [41, 41], [47, 43], [53, 38], [53, 44], [45, 47], [40, 53], [32, 52], [26, 55], [19, 51], [16, 46], [9, 44]], C.green);
    poly([[17, 37], [20, 35], [24, 36], [26, 40], [22, 42], [18, 40]], C.leaf);
    poly([[36, 35], [41, 33], [46, 35], [46, 39], [41, 41], [36, 39]], C.leaf);
    r(13, 29, 4, 2, C.sunLeaf); r(31, 28, 4, 2, C.leaf); line(22, 48, 26, 49, C.leaf); p(46, 27, C.sunLeaf);
  });
  const blossomColors = new Map([[C.green, C.violet], [C.leaf, C.red], [C.leafLight, C.skin], [C.sunLeaf, C.cream]]);
  sprites.treeBlossom = { ...sprites.tree, frames: { down: sprites.tree.frames.down.map(frame => frame.map(color => blossomColors.get(color) ?? color)) } };
  prop('pine', 48, 80, 24, 77, g => {
    const { r, p, poly, line } = g;
    poly([[21, 55], [28, 55], [28, 70], [33, 76], [28, 78], [23, 75], [17, 77], [20, 71]], C.woodDark); r(21, 59, 3, 12, C.wood); line(21, 60, 21, 69, C.woodLight);
    poly([[23, 3], [29, 14], [34, 21], [30, 22], [39, 34], [34, 35], [43, 49], [38, 50], [45, 61], [39, 65], [31, 64], [25, 67], [16, 66], [4, 62], [11, 50], [7, 50], [15, 36], [11, 36], [19, 22], [16, 22]], C.forest);
    poly([[23, 6], [27, 17], [30, 21], [25, 21], [33, 33], [27, 34], [35, 47], [29, 48], [38, 59], [31, 62], [25, 61], [19, 64], [9, 61], [17, 48], [13, 48], [21, 34], [17, 34], [24, 21], [20, 21]], C.green);
    poly([[23, 8], [25, 16], [22, 19], [20, 20]], C.leafLight);
    poly([[23, 23], [28, 31], [25, 33], [20, 31], [18, 33]], C.leaf); line(22, 26, 25, 30, C.leafLight);
    poly([[22, 36], [28, 43], [31, 46], [25, 46], [20, 44], [16, 47]], C.leaf); line(21, 39, 24, 42, C.leafLight);
    poly([[21, 50], [28, 55], [32, 59], [25, 59], [20, 57], [14, 60]], C.leaf); line(20, 53, 24, 55, C.leafLight);
    line(30, 38, 34, 45, C.forest); line(33, 52, 38, 59, C.forest); p(23, 10, C.sunLeaf);
  });
  prop('rock', 24, 24, 12, 22, g => {
    const { poly, line, r } = g;
    poly([[3, 11], [8, 6], [16, 5], [21, 10], [22, 18], [17, 22], [6, 21], [2, 17]], C.slate);
    poly([[3, 11], [9, 7], [15, 6], [19, 10], [14, 14], [6, 14]], C.stoneLight);
    poly([[5, 14], [14, 15], [18, 12], [18, 19], [13, 21], [6, 19]], C.stone);
    poly([[18, 11], [21, 11], [22, 17], [18, 20], [16, 19]], C.slate);
    line(9, 8, 14, 8, C.cream); line(13, 15, 14, 18, C.slate); r(6, 17, 3, 1, C.stoneLight);
  });
  prop('flower', 16, 16, 8, 15, g => {
    const { p, r, poly, line } = g;
    line(7, 7, 7, 14, C.forest); poly([[7, 12], [11, 9], [13, 9], [11, 12]], C.green); poly([[7, 13], [3, 11], [2, 12], [5, 14]], C.green); p(10, 10, C.leaf);
    r(5, 4, 4, 5, C.linen); r(5, 3, 3, 2, C.cream); r(3, 5, 3, 2, C.cream); r(8, 5, 3, 2, C.cream); r(6, 7, 2, 3, C.cream); r(6, 5, 2, 2, C.gold);
  });
  prop('campfire', 32, 32, 16, 29, (g, frame) => {
    const { r, p, poly, line } = g;
    poly([[4, 22], [9, 19], [23, 19], [28, 23], [27, 27], [20, 30], [9, 29], [3, 26]], C.slate);
    poly([[8, 23], [13, 21], [22, 22], [24, 26], [18, 28], [9, 27]], C.woodDark);
    for (const [x, y] of [[4, 23], [9, 27], [18, 28], [25, 24], [22, 20], [9, 20]]) { r(x, y, 3, 2, C.stone); p(x, y, C.stoneLight); }
    poly([[7, 25], [22, 20], [25, 22], [9, 28]], C.wood); line(9, 25, 21, 21, C.woodLight);
    poly([[8, 21], [11, 20], [25, 26], [22, 29]], C.woodDark); line(11, 21, 22, 26, C.woodLight);
    const top = [5, 3, 7][frame];
    poly([[10, 23], [8, 17], [11, 11], [14, 14], [17, top], [20, 12], [23, 9 + frame], [22, 19], [19, 24]], C.red);
    poly([[12, 22], [11, 17], [15, 12], [17, 8 + frame], [18, 16], [21, 14], [20, 22]], C.orange);
    poly([[14, 22], [14, 18], [17, 14], [19, 21], [17, 24]], C.gold); r(16, 19, 2, 3, C.cream); p(11 + frame * 3, 7, C.orange);
  }, 3);
  prop('chest', 32, 32, 16, 29, g => {
    const { r, p, poly, line } = g;
    poly([[5, 13], [9, 8], [23, 8], [28, 12], [28, 26], [24, 29], [5, 28]], C.woodDark);
    poly([[7, 12], [10, 9], [22, 9], [25, 12], [24, 17], [6, 17]], C.woodLight);
    r(6, 18, 18, 9, C.wood); poly([[24, 17], [27, 14], [27, 25], [24, 28]], C.woodDark);
    line(9, 11, 22, 11, C.dirtLight); line(6, 17, 24, 17, C.ink); line(8, 23, 22, 23, C.woodDark); line(9, 25, 13, 25, C.woodLight);
    r(9, 10, 3, 17, C.orange); r(20, 10, 3, 17, C.orange); r(9, 10, 2, 7, C.gold); r(20, 10, 2, 7, C.gold); r(10, 19, 1, 7, C.gold); r(21, 19, 1, 7, C.gold);
    r(14, 17, 5, 6, C.orange); r(14, 17, 4, 2, C.gold); r(15, 20, 2, 2, C.woodDark); p(15, 17, C.cream);
  });
  prop('forge', 48, 64, 24, 62, g => {
    const { r, p, poly, line } = g;
    r(6, 27, 35, 31, C.woodDark); r(9, 31, 29, 25, C.wood); r(9, 30, 4, 26, C.woodLight); r(34, 30, 3, 26, C.woodDark);
    for (const y of [35, 40, 45, 50]) { line(13, y, 34, y, C.woodDark); line(13, y + 1, 20, y + 1, C.woodLight); }
    r(4, 57, 40, 5, C.slate); r(5, 57, 36, 2, C.stone); line(7, 57, 19, 57, C.stoneLight);
    // Roof pitch, tile lips and a thick eave are separate planes.
    poly([[3, 24], [9, 15], [24, 8], [39, 15], [45, 24], [43, 29], [5, 29]], C.navy);
    poly([[6, 23], [11, 16], [24, 11], [37, 17], [41, 24]], C.blue);
    line(13, 16, 23, 12, C.sky); line(25, 12, 35, 16, C.stoneLight); line(10, 19, 38, 19, C.navy); line(11, 20, 27, 20, C.sky); line(7, 24, 41, 24, C.navy); line(8, 25, 28, 25, C.blue); r(5, 27, 38, 2, C.woodDark); r(7, 27, 33, 1, C.woodLight);
    r(31, 4, 7, 12, C.slate); r(30, 3, 9, 3, C.stone); r(31, 4, 5, 1, C.stoneLight); r(32, 7, 2, 7, C.stone); line(35, 9, 37, 9, C.shade);
    r(16, 33, 17, 23, C.slate); r(17, 34, 4, 21, C.stone); line(17, 34, 30, 34, C.stoneLight);
    for (const y of [39, 44, 49, 54]) { line(17, y, 31, y, C.shade); r(y % 2 ? 25 : 21, y - 4, 1, 4, C.slate); }
    poly([[21, 43], [23, 39], [27, 39], [30, 43], [30, 55], [20, 55]], C.ink); r(22, 43, 6, 12, C.red);
    poly([[22, 53], [24, 45], [26, 49], [28, 45], [28, 54]], C.orange); r(24, 50, 2, 4, C.gold); p(24, 51, C.cream);
    poly([[29, 50], [43, 50], [40, 54], [36, 55], [37, 59], [30, 59], [32, 55], [29, 54]], C.shade); r(29, 49, 14, 2, C.stoneLight); line(31, 51, 40, 51, C.stone); r(32, 57, 3, 1, C.slate);
    r(7, 34, 3, 5, C.ink); r(8, 35, 1, 3, C.gold);
  });
  prop('gate', 64, 64, 32, 62, g => {
    const { r, p, poly, line } = g;
    for (const x of [7, 48]) {
      r(x, 12, 10, 46, C.slate); r(x + 1, 12, 4, 44, C.stone); line(x + 1, 14, x + 1, 55, C.stoneLight);
      r(x - 2, 9, 14, 5, C.slate); r(x - 2, 9, 12, 2, C.stoneLight); r(x - 2, 57, 14, 5, C.shade); r(x - 1, 57, 11, 2, C.stone);
      for (const y of [23, 34, 45, 56]) { line(x, y, x + 9, y, C.shade); r(x + 5, y - 7, 1, 7, C.slate); line(x + 2, y + 1, x + 6, y + 1, C.stoneLight); }
    }
    poly([[16, 22], [23, 18], [31, 16], [40, 19], [49, 22], [49, 29], [16, 29]], C.woodDark);
    line(18, 23, 31, 19, C.woodLight); line(32, 19, 46, 23, C.wood); r(18, 27, 28, 3, C.wood); line(19, 27, 43, 27, C.woodLight);
    for (const x of [20, 27, 34, 41]) { r(x, 31, 3, 27, C.woodDark); r(x, 32, 1, 24, C.woodLight); p(x + 1, 51, C.wood); }
    r(18, 43, 28, 4, C.wood); line(20, 44, 44, 44, C.woodLight); r(30, 30, 3, 27, C.woodDark);
    r(29, 33, 2, 5, C.orange); r(34, 33, 2, 5, C.woodLight); r(30, 31, 5, 2, C.gold); r(28, 38, 9, 8, C.orange); r(28, 38, 8, 2, C.gold); line(28, 40, 28, 44, C.gold); r(31, 40, 3, 4, C.woodDark); p(31, 40, C.ink);
  });
  function terrain(id, color, shade, light) {
    prop(id, 16, 16, 0, 0, (g, variant) => {
      g.r(0, 0, 16, 16, color);
      if (id === 'groundSky') {
        const cracks = [[[0, 10], [2, 10], [2, 11]], [[12, 0], [12, 2], [11, 2]], [[14, 15], [13, 14], [11, 14]]][variant];
        g.line(...cracks[0], ...cracks[1], shade); g.p(...cracks[2], shade);
        g.r([10, 4, 3][variant], [4, 11, 3][variant], 2, 1, light);
      } else if (id === 'groundDirt') {
        const [x, y] = [[4, 8], [10, 3], [6, 12]][variant];
        g.r(x, y, 2, 1, light); g.p(x + 1, y + 1, shade);
        g.p([12, 3, 12][variant], [3, 12, 6][variant], light); g.p([12, 4, 11][variant], [4, 12, 6][variant], shade);
      } else if (id === 'groundStone') {
        const [x, y] = [[3, 4], [10, 11], [2, 12]][variant];
        g.r(x, y, 2, 1, light); g.r([11, 2, 10][variant], [12, 4, 3][variant], 3, 1, shade);
      } else {
        const [x, y] = [[3, 5], [10, 3], [7, 12]][variant];
        g.r(x, y, 2, 1, light); g.p([11, 3, 12][variant], [12, 11, 4][variant], shade);
        g.p([12, 3, 12][variant], [12, 12, 5][variant], shade);
      }
    }, 3, false);
  }
  terrain('groundGrass', C.green, C.forest, C.leaf);
  terrain('groundDirt', C.dirt, C.dirtDark, C.dirtLight);
  terrain('groundStone', C.slate, C.shade, C.stone);
  terrain('groundSky', C.slate, C.navy, C.stone);
  prop('coin', 8, 8, 4, 7, g => {
    g.poly([[2, 1], [5, 1], [7, 3], [6, 6], [3, 7], [1, 5], [1, 3]], C.woodLight);
    g.r(2, 2, 4, 4, C.orange); g.r(2, 2, 3, 3, C.gold); g.r(3, 2, 1, 3, C.cream); g.p(5, 5, C.woodLight);
  });
  prop('scroll', 16, 16, 8, 14, g => {
    g.r(4, 3, 8, 10, C.linen); g.r(5, 4, 5, 8, C.cream); g.r(3, 2, 10, 3, C.woodLight); g.r(4, 2, 7, 2, C.linen); g.line(4, 2, 9, 2, C.cream);
    g.r(3, 12, 10, 2, C.wood); g.r(4, 12, 7, 1, C.linen); g.line(6, 6, 10, 6, C.skinShade); g.line(6, 8, 9, 8, C.skinShade); g.r(8, 10, 2, 2, C.red);
  });
  prop('staff', 16, 24, 8, 23, g => {
    g.line(7, 7, 7, 22, C.woodDark); g.line(8, 8, 8, 22, C.woodLight); g.line(6, 7, 4, 5, C.woodLight); g.line(10, 7, 11, 4, C.wood);
    g.poly([[5, 5], [7, 2], [10, 4], [10, 7], [7, 10]], C.deepTeal); g.poly([[6, 5], [7, 3], [9, 4], [8, 7], [6, 7]], C.teal); g.r(7, 4, 1, 3, C.mint); g.p(7, 4, C.cream); g.r(6, 10, 4, 2, C.woodLight); g.p(7, 10, C.gold);
  });
  prop('blessing', 24, 24, 12, 22, g => {
    g.poly([[4, 18], [8, 14], [17, 14], [21, 18], [20, 22], [4, 22]], C.slate);
    g.poly([[5, 18], [9, 15], [16, 15], [19, 18], [15, 19], [7, 19]], C.stoneLight); g.r(7, 19, 12, 2, C.stone); g.line(18, 19, 18, 21, C.slate);
    g.line(12, 8, 12, 17, C.forest); g.poly([[11, 11], [6, 9], [5, 5], [9, 5], [13, 9]], C.leaf); g.line(6, 5, 11, 10, C.leafLight);
    g.poly([[12, 12], [13, 7], [17, 4], [19, 4], [18, 9], [15, 12]], C.green); g.line(14, 10, 17, 6, C.leaf); g.p(8, 3, C.gold);
  });
  return { palette, sprites };
}
