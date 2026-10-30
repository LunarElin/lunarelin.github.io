// Original, native-resolution pixel drawings. No image/model sampling or runtime assets.
export function buildPixelArt() {
  const palette = [
    null, '#292537', '#393b50', '#50576b', '#73818a', '#a3afa8', '#f2e7c5', '#cdbd99',
    '#e2b78d', '#ba8663', '#573f3f', '#7a5543', '#a5764a', '#72513e', '#946841', '#b58b56',
    '#2e5142', '#426647', '#638b4c', '#91ad5b', '#bdd078', '#315c60', '#4f8b85', '#83b5a3',
    '#3b4c74', '#6481a1', '#9cb8d1', '#7e668f', '#b09ba9', '#bc6262', '#e79a4e', '#f6d57b',
  ];
  const C = { ink: 1, shade: 2, slate: 3, stone: 4, stoneLight: 5, cream: 6, linen: 7, skin: 8, skinShade: 9, woodDark: 10, wood: 11, woodLight: 12, dirtDark: 13, dirt: 14, dirtLight: 15, forest: 16, green: 17, leaf: 18, leafLight: 19, sunLeaf: 20, deepTeal: 21, teal: 22, mint: 23, navy: 24, blue: 25, sky: 26, violet: 27, lilac: 28, red: 29, orange: 30, gold: 31 };
  const sprites = {};
  function grid(width, height) {
    const pixels = new Uint8Array(width * height);
    const p = (x, y, color) => { if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = color; };
    const r = (x, y, w, h, color) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p(xx, yy, color); };
    const line = (x0, y0, x1, y1, color) => {
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
    const oval = (x, y, w, h, color) => {
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if ((2 * xx + 1 - w) ** 2 * h * h + (2 * yy + 1 - h) ** 2 * w * w <= w * w * h * h) p(x + xx, y + yy, color);
    };
    const edge = () => {
      const original = pixels.slice();
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!original[y * width + x] && ((x && original[y * width + x - 1]) || (x + 1 < width && original[y * width + x + 1]) || (y && original[(y - 1) * width + x]) || (y + 1 < height && original[(y + 1) * width + x]))) p(x, y, C.ink);
      return pixels;
    };
    return { width, height, pixels, p, r, line, poly, oval, edge };
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
  function druid(g, direction, step, villager = false) {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = direction === 'right', back = direction === 'up';
    r(10, 26 + a, 5, 4, C.woodDark); r(17, 26 + b, 5, 4, C.woodDark); r(10, 28 + a, 4, 1, C.woodLight); r(17, 28 + b, 4, 1, C.wood);
    poly([[10, 17], [21, 17], [23, 26], [19, 28], [15, 27], [8, 28]], villager ? C.wood : C.green);
    poly([[10, 18], [14, 18], [13, 26], [9, 26]], villager ? C.woodLight : C.leaf);
    poly([[18, 19], [22, 21], [23, 26], [18, 27]], villager ? C.woodDark : C.forest);
    r(11, 23, 10, 2, C.woodDark); r(15, 23, 2, 2, C.gold);
    poly([[12, 5], [19, 4], [23, 10], [23, 18], [18, 21], [9, 18], [8, 11]], villager ? C.wood : C.forest);
    poly([[12, 6], [18, 5], [21, 10], [18, 15], [10, 15], [10, 10]], villager ? C.woodLight : C.green);
    line(12, 7, 16, 6, villager ? C.linen : C.leafLight); r(10, 10, 2, 3, villager ? C.woodLight : C.leaf);
    if (back) { poly([[10, 12], [20, 12], [21, 17], [17, 20], [11, 17]], villager ? C.wood : C.green); r(14, 14, 2, 5, villager ? C.woodLight : C.leaf); r(11, 19, 9, 2, C.linen); }
    else if (side) { r(17, 11, 5, 7, C.skin); r(18, 10, 3, 3, C.cream); r(16, 12, 2, 5, C.linen); r(21, 14, 2, 3, C.skinShade); p(21, 13, C.ink); p(22, 17, C.woodDark); }
    else { r(11, 11, 9, 7, C.skin); r(10, 10, 11, 3, C.cream); r(10, 12, 2, 5, C.linen); r(19, 12, 2, 5, C.linen); r(12, 12, 2, 2, C.cream); p(13, 14, C.ink); p(18, 14, C.ink); r(14, 17, 3, 1, C.skinShade); }
    r(side ? 21 : 22, 19, 3, 5, C.skinShade); r(side ? 21 : 22, 19, 2, 3, C.skin);
    line(25, 9, 25, 29, C.woodDark); line(26, 10, 26, 28, C.woodLight); poly([[23, 8], [25, 5], [28, 8], [26, 12]], villager ? C.gold : C.mint); p(25, 7, C.cream); p(25, 11, C.deepTeal); r(24, 13, 4, 1, C.linen);
    if (villager) { r(8, 10, 15, 2, C.woodDark); r(10, 7, 10, 3, C.woodLight); r(17, 21, 4, 5, C.linen); p(19, 22, C.wood); }
  }
  actor('druid', 32, 32, 30, druid);
  sprites.druid.wandTips = { down: [25, 8], up: [25, 8], right: [25, 8], left: [6, 8] };
  actor('npc', 32, 32, 30, (g, d, s) => druid(g, d, s, true));
  actor('wolf', 32, 32, 29, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up';
    if (side) {
      poly([[3, 16], [7, 18], [10, 21], [8, 23], [4, 20]], C.sky); poly([[9, 16], [21, 15], [25, 21], [22, 25], [9, 25]], C.blue); r(10, 17, 9, 3, C.sky); r(10, 24 + a, 4, 5, C.navy); r(20, 24 + b, 4, 5, C.navy);
      poly([[19, 9], [22, 5], [24, 12], [27, 13], [29, 18], [25, 22], [19, 20]], C.blue); r(21, 12, 4, 4, C.sky); r(25, 17, 4, 3, C.cream); p(26, 14, C.ink); r(28, 17, 2, 2, C.navy); p(21, 9, C.lilac);
    } else {
      poly([[8, 17], [23, 17], [25, 24], [21, 27], [10, 27], [6, 23]], C.blue); r(10, 23 + a, 4, 6, C.navy); r(18, 23 + b, 4, 6, C.navy); r(10, 27 + a, 4, 1, C.sky); r(18, 27 + b, 4, 1, C.sky);
      poly([[8, 12], [8, 5], [13, 9], [18, 9], [23, 5], [24, 15], [21, 22], [10, 22], [7, 17]], C.blue); poly([[10, 10], [14, 11], [17, 11], [21, 10], [22, 15], [18, 20], [12, 20], [9, 15]], C.sky);
      r(9, 8, 2, 4, C.navy); r(21, 8, 2, 4, C.navy);
      if (back) { poly([[11, 13], [19, 13], [21, 20], [17, 24], [12, 20]], C.blue); line(14, 15, 15, 20, C.sky); poly([[14, 23], [17, 23], [21, 27], [19, 29], [15, 27]], C.sky); }
      else { r(11, 15, 2, 2, C.ink); r(19, 15, 2, 2, C.ink); poly([[11, 18], [20, 18], [18, 22], [14, 23]], C.cream); r(14, 18, 4, 2, C.navy); p(15, 21, C.woodDark); }
    }
    line(12, 22, 19, 23, C.deepTeal);
  });
  actor('bear', 48, 48, 44, (g, d, step) => {
    const { r, p, poly, oval, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up';
    oval(10, 17, 28, 25, C.wood); poly([[12, 18], [22, 18], [20, 36], [12, 37]], C.woodLight); r(12, 36 + a, 9, 8, C.woodDark); r(27, 36 + b, 9, 8, C.woodDark); r(12, 42 + a, 7, 1, C.woodLight); r(27, 42 + b, 7, 1, C.woodLight);
    oval(6, 21, 9, 16, C.woodDark); oval(33, 21, 9, 16, C.wood); r(7, 25, 3, 6, C.woodLight);
    oval(12, 6, 10, 10, C.woodDark); oval(28, 6, 10, 10, C.woodDark); r(15, 9, 4, 4, C.skinShade); r(31, 9, 4, 4, C.skinShade);
    oval(12, 10, 25, 20, C.wood); poly([[15, 12], [25, 11], [24, 17], [15, 20]], C.woodLight);
    if (back) { r(18, 20, 13, 4, C.woodDark); line(20, 14, 19, 18, C.woodLight); }
    else if (side) { oval(28, 18, 12, 10, C.linen); r(36, 19, 4, 3, C.woodDark); r(30, 16, 2, 3, C.ink); p(32, 25, C.woodDark); }
    else { oval(18, 20, 14, 9, C.linen); r(21, 20, 7, 3, C.woodDark); r(17, 17, 2, 3, C.ink); r(30, 17, 2, 3, C.ink); line(24, 23, 24, 26, C.woodDark); }
    if (!back) { r(19, 31, 11, 6, C.linen); r(22, 36, 5, 2, C.skinShade); }
    for (const [x, y] of [[12, 20], [11, 23], [34, 30], [32, 33]]) r(x, y, 2, 1, C.woodDark);
  });
  actor('dragon', 48, 48, 44, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step), side = d === 'right', back = d === 'up', flap = step === 1 ? -2 : step === 2 ? 2 : 0;
    poly([[16, 20], [9, 11 + flap], [4, 22], [7, 29], [13, 26], [16, 31]], C.deepTeal); poly([[15, 21], [9, 16 + flap], [7, 23], [11, 25]], C.orange);
    poly([[30, 20], [38, 11 + flap], [44, 22], [41, 29], [35, 26], [30, 31]], C.deepTeal); poly([[32, 21], [38, 16 + flap], [41, 23], [36, 25]], C.orange);
    poly([[19, 22], [29, 22], [34, 34], [31, 40], [19, 41], [15, 34]], C.teal); r(18, 37 + a, 6, 7, C.deepTeal); r(27, 37 + b, 6, 7, C.deepTeal); r(18, 42 + a, 5, 1, C.linen); r(27, 42 + b, 5, 1, C.linen);
    poly([[18, 34], [12, 35], [8, 39], [5, 37], [8, 42], [14, 42], [21, 38]], C.deepTeal); r(10, 39, 5, 2, C.teal);
    poly(side ? [[23, 12], [34, 10], [39, 16], [40, 25], [34, 29], [23, 24]] : [[17, 12], [29, 11], [34, 17], [33, 25], [25, 29], [16, 25], [14, 18]], C.teal);
    poly([[18, 13], [23, 11], [28, 13], [26, 18], [17, 18]], C.mint); poly([[17, 13], [17, 6], [21, 12]], C.linen); poly([[28, 12], [32, 7], [31, 16]], C.linen);
    if (back) { r(20, 24, 8, 15, C.deepTeal); for (let y = 25; y < 39; y += 4) poly([[23, y], [26, y + 2], [23, y + 3]], C.orange); }
    else if (side) { r(31, 21, 9, 5, C.linen); p(34, 17, C.ink); r(37, 23, 3, 1, C.woodDark); if (step === 1) { poly([[40, 22], [44, 20], [43, 24], [46, 25], [40, 26]], C.orange); p(43, 23, C.gold); } }
    else { r(18, 20, 3, 2, C.ink); r(28, 20, 3, 2, C.ink); poly([[20, 23], [29, 23], [28, 28], [22, 28]], C.linen); r(23, 25, 4, 1, C.deepTeal); r(21, 30, 8, 9, C.linen); line(22, 33, 28, 33, C.skinShade); line(22, 36, 28, 36, C.skinShade); }
  });
  actor('owl', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, oval } = g, back = d === 'up', side = d === 'right', flap = step === 1 ? -3 : step === 2 ? 2 : 0;
    poly([[7, 12], [3, 11 + flap], [2, 17 + flap], [7, 19]], C.wood); poly([[16, 12], [21, 11 + flap], [22, 17 + flap], [16, 19]], C.woodDark);
    oval(6, 7, 12, 14, C.wood); r(7, 18, 3, 3, C.woodLight); r(14, 18, 3, 3, C.woodLight); poly([[6, 10], [6, 3], [10, 6], [14, 6], [18, 3], [18, 12]], C.woodLight);
    if (back) { r(9, 9, 6, 8, C.wood); r(10, 11, 2, 4, C.woodLight); }
    else { oval(side ? 12 : 7, 8, side ? 6 : 10, 9, C.cream); if (!side) { r(8, 10, 3, 4, C.gold); p(9, 11, C.ink); } r(side ? 15 : 13, 10, 3, 4, C.gold); p(side ? 16 : 14, 11, C.ink); p(side ? 18 : 12, 15, C.orange); r(10, 17, 4, 2, C.linen); }
    p(8, 21, C.orange); p(15, 21, C.orange);
  });
  actor('mushroom', 24, 24, 22, (g, d, step) => {
    const { r, p, poly } = g, [a, b] = gait(step);
    r(7, 19 + a, 4, 3, C.woodDark); r(14, 19 + b, 4, 3, C.woodDark); poly([[8, 11], [16, 11], [18, 20], [14, 22], [8, 20]], C.linen); r(9, 13, 4, 7, C.cream); r(15, 15, 2, 5, C.skinShade);
    poly([[3, 9], [5, 5], [10, 3], [16, 4], [20, 8], [21, 13], [17, 15], [5, 14], [2, 12]], C.red); poly([[5, 7], [10, 4], [15, 5], [18, 8], [6, 10]], C.orange); r(5, 10, 15, 3, C.woodDark); r(7, 6, 3, 2, C.cream); r(15, 7, 3, 2, C.linen);
    if (d === 'down') { p(10, 16, C.ink); p(15, 16, C.ink); r(12, 19, 2, 1, C.woodDark); } else if (d === 'right') { p(16, 16, C.ink); p(17, 18, C.woodDark); } else r(10, 15, 2, 4, C.skinShade);
  });
  actor('boar', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, oval } = g, [a, b] = gait(step), side = d === 'right';
    oval(3, 9, 18, 11, C.wood); r(5, 17 + a, 4, 5, C.woodDark); r(15, 17 + b, 4, 5, C.woodDark); poly([[5, 10], [8, 7], [16, 8], [19, 12], [6, 13]], C.woodLight);
    poly([[side ? 13 : 6, 13], [side ? 14 : 6, 5], [side ? 18 : 10, 8], [side ? 21 : 18, 6], [21, 17], [16, 21], [7, 18]], C.wood);
    if (d !== 'up') { r(side ? 17 : 8, 15, side ? 5 : 9, 4, C.skinShade); p(side ? 19 : 10, 16, C.woodDark); p(side ? 20 : 14, 16, C.woodDark); p(side ? 18 : 8, 12, C.ink); if (!side) p(17, 12, C.ink); p(side ? 21 : 7, 17, C.cream); p(side ? 20 : 18, 17, C.cream); } else r(9, 10, 8, 5, C.woodDark);
    r(7, 8, 2, 2, C.skinShade); r(17, 9, 2, 2, C.skinShade);
  });
  actor('caster', 24, 24, 22, (g, d, step) => {
    const { r, p, poly, line } = g, [a, b] = gait(step);
    r(6, 19 + a, 4, 3, C.navy); r(13, 19 + b, 4, 3, C.navy); poly([[8, 11], [15, 11], [19, 21], [5, 21]], C.deepTeal); poly([[8, 13], [11, 13], [10, 20], [6, 20]], C.teal); r(8, 9, 8, 6, C.linen);
    poly([[4, 10], [9, 5], [10, 2], [15, 4], [17, 10], [20, 12], [4, 12]], C.navy); poly([[8, 8], [11, 4], [13, 5], [15, 9]], C.blue); r(5, 10, 14, 2, C.violet);
    if (d === 'down') { p(9, 13, C.ink); p(14, 13, C.ink); } else if (d === 'right') p(15, 13, C.ink); else r(8, 12, 8, 3, C.navy);
    line(20, 8, 20, 22, C.wood); poly([[18, 6], [20, 3], [22, 6], [20, 9]], C.mint); p(20, 5, C.cream);
  });
  actor('runner', 24, 24, 22, (g, d, step) => {
    const { r, p, poly } = g, [a, b] = gait(step), side = d === 'right';
    poly([[5, 11], [13, 10], [19, 13], [18, 17], [7, 17]], C.blue); r(6, 15 + a, 3, 7, C.navy); r(15, 15 + b, 3, 7, C.navy); r(5, 20 + a, 4, 2, C.sky); r(15, 20 + b, 4, 2, C.sky);
    poly([[4, 13], [2, 10], [3, 7], [5, 11], [8, 13]], C.sky);
    poly(side ? [[13, 6], [14, 2], [17, 6], [20, 6], [22, 10], [21, 14], [14, 14]] : [[7, 7], [7, 2], [11, 6], [15, 6], [18, 2], [19, 11], [16, 15], [9, 14]], C.blue);
    r(side ? 15 : 9, 7, 5, 4, C.sky);
    if (d !== 'up') { r(side ? 18 : 10, 11, 4, 3, C.linen); p(side ? 19 : 9, 9, C.ink); if (!side) p(16, 9, C.ink); p(side ? 21 : 12, 11, C.navy); } else r(10, 8, 5, 5, C.navy);
  });
  actor('swarm', 16, 16, 15, (g, d, step) => {
    const { r, p, poly, line } = g;
    for (const y of [7, 10, 12]) { line(3, y, 1, y + (step === 1 ? -1 : 1), C.woodDark); line(12, y, 14, y + (step === 2 ? -1 : 1), C.woodDark); }
    poly([[5, 4], [10, 4], [12, 7], [12, 11], [9, 14], [5, 13], [3, 9]], C.orange); r(5, 5, 3, 7, C.gold); r(8, 6, 2, 7, C.woodLight); r(5, 3, 6, 4, C.wood); p(4, 1, C.woodDark); p(11, 1, C.woodDark); p(5, 2, C.woodDark); p(10, 2, C.woodDark);
    if (d !== 'up') { p(d === 'right' ? 10 : 6, 4, C.cream); p(9, 4, C.cream); } else r(6, 4, 3, 2, C.woodDark);
  });
  actor('flyer', 24, 24, 22, (g, d, step) => {
    const { r, p, poly } = g, flap = step === 1 ? -3 : step === 2 ? 2 : 0;
    poly([[8, 11], [3, 6 + flap], [1, 12 + flap], [4, 15 + flap], [8, 17]], C.violet); poly([[16, 11], [21, 6 + flap], [23, 12 + flap], [20, 15 + flap], [16, 17]], C.violet);
    poly([[7, 12], [4, 10 + flap], [3, 12 + flap], [7, 15]], C.lilac); poly([[17, 12], [20, 10 + flap], [21, 12 + flap], [17, 15]], C.lilac);
    poly([[9, 7], [8, 3], [12, 6], [16, 3], [16, 15], [13, 20], [9, 18], [7, 13]], C.navy); r(9, 8, 6, 8, C.violet); r(10, 9, 2, 5, C.lilac);
    if (d !== 'up') { p(d === 'right' ? 15 : 9, 11, C.gold); p(14, 11, C.gold); p(d === 'right' ? 16 : 12, 15, C.cream); } else r(11, 10, 2, 7, C.navy);
  });
  function guardian(g, d, step, variant) {
    const { r, p, poly, line } = g, [a, b] = gait(step), ancient = variant === 'ancient', sky = variant === 'sky', body = sky ? C.blue : ancient ? C.stone : C.wood, light = sky ? C.sky : ancient ? C.stoneLight : C.woodLight, shade = sky ? C.navy : ancient ? C.slate : C.woodDark;
    if (sky) { poly([[14, 24], [6, 13], [2, 20], [6, 28], [13, 32]], C.navy); poly([[34, 24], [41, 13], [46, 21], [41, 29], [34, 32]], C.navy); line(5, 21, 12, 27, C.sky); line(37, 24, 42, 20, C.sky); }
    r(11, 35 + a, 10, 9, shade); r(28, 35 + b, 10, 9, shade); r(11, 41 + a, 8, 2, light); r(28, 41 + b, 8, 2, body);
    poly([[13, 18], [34, 18], [39, 31], [34, 39], [14, 39], [9, 31]], body); poly([[13, 21], [20, 20], [19, 35], [12, 33]], light); r(30, 24, 6, 11, shade);
    poly([[7, 22], [13, 21], [12, 33], [6, 36], [3, 31]], body); poly([[35, 22], [41, 22], [45, 32], [40, 37], [35, 32]], shade); r(5, 25, 4, 6, light);
    poly([[13, 10], [18, 7], [31, 8], [36, 13], [35, 23], [29, 28], [16, 26], [11, 20]], body); poly([[15, 11], [23, 9], [30, 11], [27, 15], [14, 17]], light);
    poly([[12, 12], [9, 8], [10, 3], [13, 7], [17, 8]], shade); poly([[31, 10], [35, 4], [38, 3], [37, 9], [35, 14]], shade);
    if (d === 'up') { r(17, 17, 14, 5, shade); line(22, 11, 21, 15, light); }
    else if (d === 'right') { r(30, 16, 4, 2, C.gold); r(29, 20, 7, 4, shade); p(35, 20, C.cream); }
    else { r(16, 17, 5, 2, shade); r(28, 17, 5, 2, shade); r(17, 17, 3, 1, C.gold); r(29, 17, 3, 1, C.gold); r(21, 22, 7, 2, shade); }
    for (const [x, y] of [[14, 29], [28, 29], [23, 35]]) { line(x, y, x + 3, y + 1, shade); p(x + 1, y + 2, light); }
    if (ancient) { for (const x of [8, 34]) { poly([[x, 19], [x + 3, 13], [x + 6, 20], [x + 3, 24]], C.violet); p(x + 3, 17, C.lilac); } }
    else if (!sky) { poly([[9, 11], [7, 7], [13, 5], [18, 7], [18, 11]], C.green); poly([[29, 8], [33, 5], [39, 7], [38, 12], [32, 13]], C.leaf); r(11, 7, 4, 2, C.leafLight); r(33, 7, 3, 2, C.sunLeaf); }
    if (d !== 'up') { poly([[21, 29], [25, 27], [28, 31], [25, 35], [21, 33]], sky ? C.lilac : C.mint); p(24, 29, C.cream); }
  }
  actor('boss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'forest'));
  actor('ancientBoss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'ancient'));
  actor('skyBoss', 48, 48, 45, (g, d, s) => guardian(g, d, s, 'sky'));
  prop('tree', 64, 80, 32, 77, g => {
    const { r, p, poly, line } = g;
    poly([[26, 40], [39, 41], [37, 66], [45, 74], [43, 77], [32, 73], [21, 77], [19, 73], [26, 65]], C.woodDark);
    poly([[28, 43], [33, 44], [31, 68], [26, 73], [24, 73], [29, 63]], C.woodLight); r(34, 49, 3, 17, C.wood); line(31, 58, 34, 54, C.woodDark); line(29, 67, 24, 72, C.wood);
    poly([[7, 24], [8, 17], [16, 11], [24, 10], [30, 4], [42, 6], [47, 12], [54, 14], [59, 23], [57, 31], [61, 36], [57, 45], [49, 49], [44, 55], [34, 55], [28, 59], [17, 55], [13, 48], [5, 44], [2, 35]], C.forest);
    poly([[8, 24], [13, 16], [25, 14], [31, 8], [40, 9], [47, 16], [53, 18], [55, 29], [52, 35], [56, 39], [49, 45], [39, 49], [29, 53], [18, 50], [14, 43], [7, 40], [5, 32]], C.green);
    poly([[12, 22], [19, 17], [28, 18], [33, 12], [41, 14], [44, 20], [51, 23], [47, 30], [38, 32], [33, 38], [23, 36], [17, 40], [9, 34]], C.leaf);
    poly([[16, 21], [21, 18], [29, 20], [30, 25], [25, 29], [16, 27]], C.leafLight); poly([[33, 16], [39, 17], [42, 22], [38, 26], [32, 24]], C.leafLight); r(17, 21, 7, 2, C.sunLeaf); r(33, 18, 5, 2, C.sunLeaf);
    for (const [x, y] of [[9, 30], [13, 40], [19, 43], [28, 39], [38, 36], [46, 31], [43, 43], [31, 48], [21, 32]]) { r(x, y, 4, 2, C.leaf); r(x + 2, y - 2, 3, 2, C.leafLight); p(x - 1, y + 2, C.forest); }
  });
  prop('pine', 48, 80, 24, 77, g => {
    const { r, p, poly, line } = g;
    poly([[20, 55], [29, 55], [28, 72], [33, 76], [27, 78], [21, 75], [16, 77], [20, 69]], C.woodDark); r(21, 58, 3, 14, C.woodLight);
    poly([[24, 3], [34, 21], [31, 21], [40, 35], [35, 35], [44, 51], [39, 51], [46, 63], [34, 66], [26, 64], [17, 68], [3, 63], [11, 50], [6, 50], [15, 35], [10, 36], [19, 21], [15, 22]], C.forest);
    poly([[23, 6], [29, 20], [26, 21], [33, 32], [28, 33], [36, 47], [31, 48], [40, 60], [28, 61], [19, 63], [9, 61], [17, 48], [13, 48], [22, 33], [17, 33], [24, 20], [20, 21]], C.green);
    for (const [x, y, w] of [[21, 15, 5], [19, 25, 8], [17, 39, 11], [14, 54, 15]]) { poly([[x + 4, y - 4], [x + w, y + 3], [x + 1, y + 6], [x - 3, y + 4]], C.leaf); line(x, y + 1, x + 5, y, C.leafLight); }
    line(27, 39, 31, 44, C.forest); line(30, 53, 35, 58, C.forest); p(23, 9, C.leafLight);
  });
  prop('rock', 24, 24, 12, 22, g => {
    g.poly([[3, 12], [8, 6], [15, 5], [20, 10], [22, 19], [17, 22], [5, 21], [2, 18]], C.slate); g.poly([[4, 12], [8, 7], [14, 6], [18, 10], [13, 15], [5, 15]], C.stone); g.poly([[7, 10], [10, 8], [14, 8], [12, 11]], C.stoneLight); g.line(14, 13, 16, 19, C.shade); g.line(6, 17, 11, 17, C.stone); g.p(18, 18, C.stone);
  });
  prop('flower', 16, 16, 8, 15, g => {
    g.line(7, 7, 7, 14, C.forest); g.line(8, 12, 12, 9, C.green); g.r(10, 10, 3, 2, C.leaf); g.r(3, 11, 4, 2, C.green); g.r(5, 4, 5, 5, C.linen); g.r(6, 3, 3, 7, C.cream); g.r(4, 5, 7, 3, C.cream); g.r(6, 5, 3, 3, C.gold);
  });
  prop('campfire', 32, 32, 16, 29, (g, frame) => {
    const { r, p, poly, oval } = g;
    oval(3, 20, 26, 9, C.slate); oval(7, 21, 18, 5, C.woodDark); for (const [x, y] of [[4, 23], [8, 26], [17, 27], [24, 24], [23, 20], [8, 20]]) { r(x, y, 4, 2, C.stone); p(x, y, C.stoneLight); }
    poly([[7, 25], [22, 19], [25, 22], [9, 28]], C.wood); poly([[7, 21], [10, 19], [25, 26], [22, 29]], C.woodDark); g.line(10, 21, 23, 26, C.woodLight);
    const top = [6, 3, 7][frame]; poly([[10, 23], [8, 17], [11, 11], [14, 14], [17, top], [20, 12], [23, 9 + frame], [22, 19], [19, 24]], C.red); poly([[12, 22], [11, 17], [15, 12], [17, 8 + frame], [18, 16], [21, 14], [20, 22]], C.orange); poly([[14, 22], [14, 18], [17, 14], [19, 21], [17, 24]], C.gold); r(16, 19, 2, 3, C.cream); p(10 + frame * 3, 7, C.gold);
  }, 3);
  prop('chest', 32, 32, 16, 29, g => {
    const { r, p, poly, line } = g;
    poly([[5, 12], [8, 8], [23, 8], [27, 12], [27, 26], [24, 29], [5, 28]], C.woodDark); r(6, 16, 20, 11, C.wood); poly([[7, 12], [10, 9], [22, 9], [25, 12], [25, 17], [7, 17]], C.woodLight); line(8, 12, 24, 12, C.dirtLight); r(6, 17, 20, 2, C.woodDark); line(8, 23, 24, 23, C.woodDark); r(9, 10, 3, 17, C.orange); r(21, 10, 3, 17, C.orange); r(10, 10, 1, 16, C.gold); r(22, 10, 1, 16, C.gold); r(14, 17, 5, 6, C.gold); r(15, 19, 3, 3, C.woodDark); p(16, 19, C.cream);
  });
  prop('forge', 48, 64, 24, 62, g => {
    const { r, p, poly, line } = g;
    r(5, 26, 37, 33, C.woodDark); r(8, 29, 31, 28, C.wood); r(11, 28, 3, 29, C.woodLight); r(34, 28, 3, 29, C.woodLight); r(4, 57, 40, 5, C.slate); r(6, 57, 34, 2, C.stone);
    poly([[3, 25], [8, 15], [24, 8], [40, 15], [45, 25], [43, 29], [5, 29]], C.navy); poly([[7, 23], [11, 16], [24, 11], [37, 17], [40, 24]], C.blue); line(12, 17, 35, 17, C.sky); line(8, 23, 40, 23, C.navy); r(31, 4, 7, 12, C.slate); r(30, 3, 9, 3, C.stone); r(32, 7, 2, 7, C.stone);
    r(15, 33, 18, 24, C.slate); for (let y = 34; y < 56; y += 5) { line(16, y, 31, y, C.stone); r(y % 2 ? 23 : 19, y + 1, 1, 4, C.shade); }
    poly([[19, 43], [21, 39], [27, 39], [29, 43], [29, 55], [19, 55]], C.woodDark); r(21, 44, 6, 11, C.red); poly([[21, 53], [23, 45], [25, 49], [27, 45], [27, 54]], C.orange); r(23, 50, 2, 4, C.gold);
    poly([[29, 50], [43, 50], [40, 54], [36, 55], [37, 59], [30, 59], [32, 55], [29, 54]], C.shade); r(29, 49, 14, 2, C.stoneLight); line(31, 51, 40, 51, C.stone); p(8, 32, C.linen);
  });
  prop('gate', 64, 64, 32, 62, g => {
    const { r, p, poly, line } = g;
    for (const x of [7, 48]) { r(x, 11, 10, 48, C.slate); r(x + 1, 12, 3, 45, C.stone); r(x - 2, 9, 14, 5, C.stone); r(x - 2, 57, 14, 5, C.shade); for (let y = 19; y < 56; y += 9) { line(x, y, x + 9, y, C.shade); r(x + 5, y - 4, 1, 4, C.stoneLight); } }
    poly([[15, 21], [31, 16], [49, 21], [49, 28], [16, 28]], C.woodDark); line(18, 22, 31, 19, C.woodLight); line(32, 19, 46, 22, C.wood); r(18, 28, 28, 4, C.wood);
    for (const x of [20, 27, 34, 41]) { r(x, 30, 3, 28, C.woodDark); r(x, 32, 1, 24, C.woodLight); }
    r(18, 43, 28, 4, C.wood); line(20, 44, 44, 44, C.woodLight); r(28, 35, 8, 4, C.orange); r(29, 32, 2, 5, C.gold); r(34, 32, 2, 5, C.gold); r(30, 31, 5, 2, C.gold); r(28, 38, 9, 8, C.gold); r(30, 40, 5, 4, C.orange); p(32, 41, C.woodDark); p(32, 42, C.woodDark);
  });
  function terrain(id, color, shade, light) {
    prop(id, 16, 16, 0, 0, g => {
      g.r(0, 0, 16, 16, color);
      if (id === 'groundSky') {
        g.line(0, 10, 2, 10, shade); g.r(2, 11, 2, 1, shade);
        g.r(10, 4, 2, 1, light);
      } else if (id === 'groundDirt') {
        g.r(4, 8, 2, 1, light); g.p(5, 9, shade);
        g.p(12, 3, light); g.p(12, 4, shade);
      } else if (id === 'groundStone') {
        g.r(3, 4, 2, 1, light); g.r(11, 12, 3, 1, shade);
      } else {
        g.r(3, 5, 2, 1, light); g.p(4, 4, light);
        g.r(11, 12, 2, 1, shade); g.p(11, 11, shade);
      }
    }, 1, false);
  }
  terrain('groundGrass', C.green, C.forest, C.leaf);
  terrain('groundDirt', C.dirt, C.dirtDark, C.dirtLight);
  terrain('groundStone', C.slate, C.shade, C.stone);
  terrain('groundSky', C.slate, C.navy, C.stone);
  prop('coin', 8, 8, 4, 7, g => { g.oval(1, 1, 6, 6, C.orange); g.r(2, 2, 3, 4, C.gold); g.r(3, 2, 1, 3, C.cream); g.p(5, 5, C.woodLight); });
  prop('scroll', 16, 16, 8, 14, g => { g.r(4, 3, 8, 10, C.linen); g.r(5, 3, 5, 9, C.cream); g.r(3, 2, 10, 3, C.woodLight); g.r(3, 12, 10, 2, C.wood); g.line(6, 6, 10, 6, C.woodLight); g.line(6, 8, 9, 8, C.skinShade); g.r(8, 10, 2, 2, C.red); });
  prop('staff', 16, 24, 8, 23, g => { g.line(7, 6, 7, 22, C.woodDark); g.line(8, 7, 8, 22, C.woodLight); g.poly([[5, 5], [7, 2], [10, 4], [10, 7], [7, 10]], C.teal); g.r(7, 4, 2, 3, C.mint); g.p(7, 4, C.cream); g.r(6, 10, 4, 2, C.orange); g.p(7, 10, C.gold); });
  prop('blessing', 24, 24, 12, 22, g => { g.poly([[4, 18], [8, 14], [17, 14], [21, 18], [20, 22], [4, 22]], C.slate); g.line(6, 18, 18, 18, C.stoneLight); g.r(7, 19, 12, 2, C.stone); g.line(12, 8, 12, 17, C.forest); g.poly([[11, 11], [5, 8], [5, 4], [10, 5], [13, 10]], C.leaf); g.line(6, 5, 11, 10, C.leafLight); g.poly([[12, 12], [13, 6], [19, 3], [19, 8], [15, 12]], C.green); g.line(14, 10, 17, 6, C.mint); g.p(8, 3, C.gold); g.p(20, 12, C.gold); });
  return { palette, sprites };
}
