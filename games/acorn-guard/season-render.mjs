const INK = '#583f21';
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const smooth = value => value * value * (3 - 2 * value);
const seeded = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const lerp = (a, b, amount) => a + (b - a) * amount;

const PALETTES = [
  { ground: '#d6dfa5', plateau: '#9cb96f', cliffs: ['#8c6b4b', '#806047', '#74543e'], tuft: '#afc582', background: '#899764', leaf: '#f1d8cf' },
  { ground: '#c5d48d', plateau: '#81a855', cliffs: ['#816046', '#79593f', '#715138'], tuft: '#a2bb73', background: '#7d8956', leaf: '#9bbb68' },
  { ground: '#dfc78c', plateau: '#bb984f', cliffs: ['#896349', '#7c573e', '#6c4b36'], tuft: '#c6a56b', background: '#9b855b', leaf: '#c57c48' },
  { ground: '#e4e9df', plateau: '#d3dfd7', cliffs: ['#8e8881', '#7e7973', '#6d6964'], tuft: '#c1d0bf', background: '#a1b4b2', leaf: '#f4f6e9' },
];

function mixColor(a, b, amount) {
  const from = parseInt(a.slice(1), 16), to = parseInt(b.slice(1), 16);
  const channel = shift => Math.round(lerp(from >> shift & 255, to >> shift & 255, amount));
  return '#' + [16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('');
}

export function seasonPalette(position = 0) {
  const progress = clamp(position, 0, 3), index = Math.min(2, Math.floor(progress));
  const amount = smooth(progress - index), a = PALETTES[index], b = PALETTES[index + 1];
  const filters = [
    [-8, .82, 1.08, 0], [0, 1.05, 1, 0], [-48, .94, 1.08, 0], [-48, .42, 1.40, .65],
  ];
  const filter = filters[index].map((value, i) => lerp(value, filters[index + 1][i], amount));
  return {
    ground: mixColor(a.ground, b.ground, amount), plateau: mixColor(a.plateau, b.plateau, amount),
    cliffs: a.cliffs.map((color, i) => mixColor(color, b.cliffs[i], amount)),
    tuft: mixColor(a.tuft, b.tuft, amount), background: mixColor(a.background, b.background, amount),
    leaf: mixColor(a.leaf, b.leaf, amount), outline: INK,
    treeFilter: `hue-rotate(${filter[0].toFixed(2)}deg) saturate(${filter[1].toFixed(3)}) brightness(${filter[2].toFixed(3)}) grayscale(${filter[3].toFixed(3)})`,
    spring: clamp(1 - progress, 0, 1), summer: clamp(1 - Math.abs(progress - 1), 0, 1),
    autumn: clamp(1 - Math.abs(progress - 2), 0, 1), snow: smooth(clamp(progress - 2, 0, 1)),
  };
}

function oval(ctx, x, y, rx, ry, fill, stroke = '') {
  ctx.beginPath();ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke;ctx.stroke(); }
}

function rounded(ctx, x, y, w, h, radius, fill, stroke = '') {
  ctx.beginPath();ctx.roundRect(x, y, w, h, radius);ctx.fillStyle = fill;ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke;ctx.stroke(); }
}

function leaf(ctx, x, y, size, angle, fill) {
  ctx.save();ctx.translate(x, y);ctx.rotate(angle);
  ctx.beginPath();ctx.moveTo(-size, 0);ctx.quadraticCurveTo(0, -size, size, 0);
  ctx.quadraticCurveTo(0, size, -size, 0);ctx.fillStyle = fill;ctx.fill();
  ctx.restore();
}

function seasonScene(options) {
  const width = Math.max(1, options.width || 390), height = Math.max(1, options.height || 844);
  return { width, height, scale: clamp(typeof options.groundScale === 'function' ? options.groundScale() : options.groundScale || width / 690, .15, 3),
    time: options.reduceMotion ? 0 : (Number.isFinite(options.time) ? options.time : 0),
    palette: seasonPalette(options.position), worldWidth: Math.max(220, options.worldWidth || 900),
    first: Math.floor((options.camera?.y || 0) / 160) - 12 };
}

function flower(ctx, x, y, size, cream) {
  ctx.strokeStyle = '#809958';ctx.beginPath();ctx.moveTo(x, y + size);ctx.lineTo(x, y - size);ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    oval(ctx, x + Math.cos(angle) * size * .75, y + Math.sin(angle) * size * .55 - size, size * .62, size * .43, cream ? '#fff0c9' : '#edc6bb');
  }
  oval(ctx, x, y - size, size * .35, size * .27, '#b9994e');
}

export function drawSeasonDetails(ctx, options = {}) {
  const { project } = options;
  if (typeof project !== 'function') return;
  const { width, height, scale, palette, worldWidth, first } = seasonScene(options);
  ctx.save();ctx.beginPath();ctx.rect(0, 0, width, height);ctx.clip();
  ctx.lineCap = 'round';ctx.lineWidth = Math.max(1.1, scale * 2.2);
  for (let row = first; row < first + 25; row++) {
    for (let column = 0; column < 4; column++) {
      const key = row * 13 + column * 31;
      const x = 100 + seeded(key + 904) * (worldWidth - 200), y = row * 160 + seeded(key + 240) * 95;
      const point = project({ x, y });
      if (!point || !Number.isFinite(point.x + point.y) || point.x < -12 || point.x > width + 12 || point.y < -15 || point.y > height + 15) continue;
      const size = 5.5 * scale;
      ctx.globalAlpha = 1 - palette.snow * .64;
      ctx.strokeStyle = palette.tuft;ctx.beginPath();
      ctx.moveTo(point.x - size, point.y);ctx.lineTo(point.x - size * 1.2, point.y - size * .7);
      ctx.moveTo(point.x, point.y);ctx.lineTo(point.x, point.y - size);
      ctx.moveTo(point.x + size, point.y);ctx.lineTo(point.x + size * 1.3, point.y - size * .65);ctx.stroke();
      if (palette.spring > .02 && seeded(key + 91) > .3) {
        ctx.globalAlpha = palette.spring * .24;
        oval(ctx, point.x, point.y + size, size * 5, size * 1.4, '#b6cd83');
        ctx.globalAlpha = palette.spring * .95;
        for (let i = 0; i < 3; i++) flower(ctx, point.x + (i - 1) * size * 2.3, point.y + (i % 2) * size, size * (i === 1 ? 1 : .8), (key + i) % 2 === 0);
        leaf(ctx, point.x - size * 3.5, point.y, size * 1.2, -.7, '#90af60');
        leaf(ctx, point.x - size * 3.5, point.y, size, .8, '#a7bf73');
      }
      if (palette.summer > .02) {
        ctx.globalAlpha = palette.summer * .19;
        oval(ctx, point.x - size * 3, point.y - size, size * 9, size * 3, '#fff2b5');
        oval(ctx, point.x + size * 5, point.y + size * 2, size * 4, size * 1.6, '#fff7cf');
        ctx.globalAlpha = palette.summer * .64;
        for (let i = 0; i < 3; i++) leaf(ctx, point.x + (i - 1) * size * 2.4, point.y, size * 1.3, -.8 + i * .5, i % 2 ? '#9bb769' : '#8eaa5f');
      }
      if (palette.autumn > .02 && seeded(key + 48) > .18) {
        ctx.globalAlpha = palette.autumn * .16;
        oval(ctx, point.x, point.y + size, size * 6.5, size * 2, '#a5733f');
        ctx.globalAlpha = palette.autumn * .9;
        for (let i = 0; i < 5; i++) leaf(ctx, point.x + (seeded(key + i * 9) - .5) * size * 9, point.y + (seeded(key + i * 7) - .5) * size * 3, size * (1 + seeded(key + i) * .5), seeded(key + i + 90) * Math.PI, ['#b97b48', '#d7aa59', '#c59459'][i % 3]);
      }
      if (palette.snow > .02) {
        ctx.globalAlpha = palette.snow * .52;
        oval(ctx, point.x, point.y + size, size * 7, size * 2.2, '#b6c8c5');
        ctx.globalAlpha = palette.snow * .93;
        oval(ctx, point.x - size, point.y, size * 6, size * 1.8, '#f8faef');
        oval(ctx, point.x + size * 3, point.y - size * .7, size * 3.6, size, '#fffdf2');
        ctx.globalAlpha = palette.snow * .7;ctx.strokeStyle = '#f9fbf1';
        ctx.beginPath();ctx.moveTo(point.x - size * 7, point.y);ctx.lineTo(point.x - size * 8, point.y - size * 1.3);ctx.moveTo(point.x - size * 7, point.y);ctx.lineTo(point.x - size * 6.3, point.y - size * 1.6);ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Airborne details sit above sprites; their anchors remain in the scrolling world.
export function drawSeasonAtmosphere(ctx, options = {}) {
  const { project } = options;
  if (typeof project !== 'function') return;
  const { width, height, scale, time, palette, worldWidth, first } = seasonScene(options);
  const top = clamp(options.top ?? 0, 0, height), bottom = clamp(options.bottom ?? height, top, height);
  if (bottom <= top) return;
  ctx.save();ctx.beginPath();ctx.rect(0, top, width, bottom - top);ctx.clip();
  ctx.lineWidth = Math.max(1, scale * 1.8);ctx.lineCap = 'round';
  for (let row = first; row < first + 25; row++) {
    for (let column = 0; column < 2; column++) {
      const key = row * 37 + column * 103, phase = seeded(key + 777) * 160;
      const fall = ((phase + time * 18) % 160 + 160) % 160;
      // Hide the respawn at each world-row edge rather than teleporting a visible leaf.
      const streamAlpha = options.reduceMotion ? 1 : smooth(clamp(Math.min(fall / 20, (160 - fall) / 20), 0, 1));
      const x = 110 + seeded(key + 49) * (worldWidth - 220);
      const point = project({ x: x + Math.sin(time * .55 + key) * 15, y: row * 160 + fall });
      if (!point || !Number.isFinite(point.x + point.y) || point.x < -20 || point.x > width + 20 || point.y < top - 60 || point.y > bottom + 80) continue;
      const lift = (25 + seeded(key + 31) * 65) * scale, y = point.y - lift, size = Math.max(1.6, 5.4 * scale);
      if (palette.spring > .02) {
        ctx.globalAlpha = palette.spring * .72 * streamAlpha;
        leaf(ctx, point.x, y, size * .8, Math.sin(time * .7 + key) * .7 + .4, key % 2 ? '#edc6bb' : '#fff0d8');
      }
      if (palette.summer > .02) {
        if (seeded(key + 44) > .74) {
          const flutter = options.reduceMotion ? .8 : .45 + Math.abs(Math.sin(time * 5 + key)) * .5;
          const bob = Math.sin(time * 1.6 + key) * size * 1.5;
          ctx.globalAlpha = palette.summer * .82 * streamAlpha;
          oval(ctx, point.x - size * .7 * flutter, y + bob, size * .8 * flutter, size * 1.05, '#eacb7f', '#927344');
          oval(ctx, point.x + size * .7 * flutter, y + bob, size * .8 * flutter, size * 1.05, '#f5df9d', '#927344');
          ctx.strokeStyle = '#755734';ctx.beginPath();ctx.moveTo(point.x, y + bob - size);ctx.lineTo(point.x, y + bob + size);ctx.stroke();
        } else {
          ctx.globalAlpha = palette.summer * .48 * streamAlpha;
          oval(ctx, point.x, y, size * .36, size * .36, '#fff5c9');
        }
      }
      if (palette.autumn > .02) {
        ctx.globalAlpha = palette.autumn * .75 * streamAlpha;
        leaf(ctx, point.x, y, size, time * .65 + key, key % 2 ? '#b87a49' : '#d6a45b');
        if (column === 0 && seeded(key + 20) > .62) {
          ctx.globalAlpha = palette.autumn * .22 * streamAlpha;ctx.strokeStyle = '#f5e3b8';
          ctx.beginPath();ctx.moveTo(point.x - size * 7, y + size * 2);ctx.quadraticCurveTo(point.x - size * 3, y - size * 2, point.x + size * 2, y);ctx.stroke();
        }
      }
      if (palette.snow > .02) {
        ctx.globalAlpha = palette.snow * .86 * streamAlpha;
        oval(ctx, point.x, y, size * .48, size * .48, '#fffdf2');
        ctx.globalAlpha = palette.snow * .45 * streamAlpha;
        oval(ctx, point.x + size * 4, y - size * 5, size * .27, size * .27, '#f5faf4');
      }
    }
  }
  ctx.restore();
}

const FURNITURE = [
  { id: 'rug', x: .50, y: .76, size: .43, depth: .59 },
  { id: 'curtains', x: .50, y: .42, size: .59, depth: .20 },
  { id: 'lantern', x: .76, y: .32, size: .20, depth: .30 },
  { id: 'hearth', x: .19, y: .58, size: .29, depth: .48 },
  { id: 'pantry', x: .79, y: .57, size: .29, depth: .49 },
  { id: 'nest', x: .24, y: .83, size: .34, depth: .77 },
];

export function shelterLayout(width = 390, height = 844, top = 150, bottom = height - 190) {
  width = Math.max(1, Number.isFinite(width) ? width : 390);height = Math.max(1, Number.isFinite(height) ? height : 844);
  top = clamp(top, 0, height - 1);bottom = clamp(bottom, top + 1, height);
  const available = bottom - top, side = Math.max(1, Math.min(width * .98, available));
  const room = { x: (width - side) / 2, y: top + (available - side) * .38, w: side, h: side };
  const slots = FURNITURE.map(spec => {
    const x = room.x + room.w * spec.x, y = room.y + room.h * spec.y, size = room.w * spec.size;
    const anchorY = spec.center ? .5 : .9375;
    const visual = { x: x - size / 2, y: y - size * anchorY, w: size, h: size };
    const hitW = Math.min(width, Math.max(44, size * .85)), hitH = Math.min(available, Math.max(44, size * (spec.id === 'rug' ? .4 : .72)));
    const centerY = spec.center ? y : y - size * .4;
    const hit = { id: spec.id, x: clamp(x - hitW / 2, 0, width - hitW), y: clamp(centerY - hitH / 2, top, bottom - hitH), w: hitW, h: hitH };
    return { ...spec, x, y, size, visual, hit };
  });
  return { room, slots, window: { x: room.x + room.w * .274, y: room.y + room.h * .113, w: room.w * .453, h: room.h * .242 } };
}

const bitmapOf = asset => asset?.bitmap || asset;
const drawable = image => image && (image.width || image.naturalWidth) > 0 && (image.height || image.naturalHeight) > 0;

function fallbackRoom(ctx, room) {
  const { x, y, w, h } = room;
  rounded(ctx, x, y, w, h, w * .06, '#c49252', INK);
  ctx.fillStyle = '#dfac65';ctx.fillRect(x + w * .03, y + h * .03, w * .94, h * .47);
  ctx.strokeStyle = '#9c703f';ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) { ctx.beginPath();ctx.moveTo(x + w * i / 8, y + h * .02);ctx.lineTo(x + w * i / 8, y + h * .50);ctx.stroke(); }
  ctx.fillStyle = '#b67e47';ctx.fillRect(x + w * .03, y + h * .5, w * .94, h * .47);
  ctx.strokeStyle = '#8c633d';
  for (let i = 0; i < 6; i++) { ctx.beginPath();ctx.moveTo(x + w * .03, y + h * (.5 + i * .085));ctx.lineTo(x + w * .97, y + h * (.5 + i * .085));ctx.stroke(); }
  for (let i = 1; i < 5; i++) { ctx.beginPath();ctx.moveTo(x + w * .5, y + h * .5);ctx.lineTo(x + w * i / 5, y + h * .97);ctx.stroke(); }
  rounded(ctx, x + w * .24, y + h * .075, w * .52, h * .32, w * .07, '#91663b', INK);
  rounded(ctx, x + w * .274, y + h * .113, w * .453, h * .242, w * .05, '#b5d2da', INK);
  oval(ctx, x + w * .50, y + h * .33, w * .22, h * .035, '#eef0df');
}

function fallbackFurniture(ctx, slot, style) {
  const x = slot.x, y = slot.y, s = slot.size, colors = ['#d49d60', '#9eae73', '#c88f78'];
  ctx.lineWidth = Math.max(1.5, s * .026);
  if (slot.id === 'rug') {
    oval(ctx, x, y - s * .15, s * .46, s * .20, colors[style], INK);
    oval(ctx, x, y - s * .15, s * .35, s * .13, '#d9bc80', '#8f6c42');
  } else if (slot.id === 'nest') {
    oval(ctx, x, y - s * .2, s * .45, s * .22, '#b89052', INK);
    oval(ctx, x, y - s * .28, s * .37, s * .18, '#f1dab0', INK);
    oval(ctx, x, y - s * .29, s * .25, s * .1, colors[style]);
  } else if (slot.id === 'hearth') {
    rounded(ctx, x - s * .35, y - s * .6, s * .70, s * .56, s * .10, '#a5987e', INK);
    rounded(ctx, x - s * .2, y - s * .38, s * .4, s * .3, s * .07, '#76533a', INK);
    leaf(ctx, x, y - s * .2, s * .13, -Math.PI / 2, '#f0bc64');
  } else if (slot.id === 'pantry') {
    rounded(ctx, x - s * .42, y - s * .60, s * .84, s * .56, s * .04, '#b98a55', INK);
    ctx.strokeStyle = INK;ctx.beginPath();ctx.moveTo(x - s * .4, y - s * .27);ctx.lineTo(x + s * .4, y - s * .27);ctx.stroke();
    for (let i = 0; i < 3; i++) oval(ctx, x + (i - 1) * s * .22, y - s * .39, s * .075, s * .09, i % 2 ? '#c77d64' : '#dfb96d', INK);
  } else if (slot.id === 'lantern') {
    rounded(ctx, x - s * .22, y - s * .66, s * .44, s * .52, s * .12, '#efd18a', INK);
    ctx.strokeStyle = INK;ctx.beginPath();ctx.moveTo(x, y - s * .84);ctx.lineTo(x, y - s * .65);ctx.stroke();
  } else {
    rounded(ctx, x - s * .43, y - s * .26, s * .12, s * .56, s * .04, colors[style], INK);
    rounded(ctx, x + s * .31, y - s * .26, s * .12, s * .56, s * .04, colors[style], INK);
  }
}

function furniture(ctx, slot, decoration, assets, time, reduceMotion, selected) {
  const level = clamp(decoration?.level, 0, 3), style = Math.floor(clamp(decoration?.style, 0, 2));
  if (!level || decoration.placed === false) {
    if (selected) {
      ctx.save();ctx.strokeStyle = '#fff0bc';ctx.lineWidth = 3;ctx.setLineDash([5, 5]);
      ctx.beginPath();ctx.roundRect(slot.hit.x, slot.hit.y, slot.hit.w, slot.hit.h, 12);ctx.stroke();
      ctx.restore();
    }
    return;
  }
  ctx.save();ctx.lineWidth = Math.max(1.5, slot.size * .02);
  const floorPiece = !['curtains', 'lantern'].includes(slot.id);
  if (floorPiece && slot.id !== 'rug') oval(ctx, slot.x, slot.y - slot.size * .03, slot.size * .38, slot.size * .08, '#60412430');
  const image = bitmapOf(assets?.decor?.[slot.id]);
  if (drawable(image)) {
    ctx.filter = ['none', 'hue-rotate(24deg) saturate(.85)', 'hue-rotate(-18deg) saturate(.9)'][style];
    ctx.drawImage(image, slot.visual.x, slot.visual.y, slot.visual.w, slot.visual.h);
    ctx.filter = 'none';
  } else fallbackFurniture(ctx, slot, style);
  if (level > 1 && floorPiece) {
    const trim = ['#edd4a1', '#d2dda9', '#e5b5a0'][style];
    for (let i = 0; i < level; i++) leaf(ctx, slot.x + (i - (level - 1) / 2) * slot.size * .13, slot.y - slot.size * .10, slot.size * .055, -.25, trim);
  }
  if (level > 1 && slot.id === 'curtains') {
    for (const side of [-1, 1]) {
      oval(ctx, slot.x + side * slot.size * .35, slot.y - slot.size * .33, slot.size * .028, slot.size * .04, '#e1bd70', INK);
      if (level === 3) leaf(ctx, slot.x + side * slot.size * .34, slot.y - slot.size * .25, slot.size * .055, side * .7, '#a7b77c');
    }
  }
  if (level > 1 && slot.id === 'lantern') {
    for (let i = 0; i < level; i++) {
      const x = slot.x + (i - (level - 1) / 2) * slot.size * .13;
      ctx.strokeStyle = '#936e41';ctx.beginPath();ctx.moveTo(x, slot.y - slot.size * .05);ctx.lineTo(x, slot.y + slot.size * .07);ctx.stroke();
      oval(ctx, x, slot.y + slot.size * .08, slot.size * .025, slot.size * .035, '#d8b276', INK);
    }
  }
  if (slot.id === 'hearth' || slot.id === 'lantern') {
    const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 2.2 + slot.x) * .05;
    ctx.globalAlpha = .10 + level * .035;
    oval(ctx, slot.x, slot.y - slot.size * .34, slot.size * .58 * pulse, slot.size * .5 * pulse, '#ffe5a1');
    ctx.globalAlpha = 1;
  }
  if (selected) {
    ctx.strokeStyle = '#fff1bb';ctx.lineWidth = 2.5;ctx.beginPath();ctx.roundRect(slot.hit.x + 1, slot.hit.y + 1, slot.hit.w - 2, slot.hit.h - 2, 12);ctx.stroke();
  }
  ctx.restore();
}

export function drawShelter(ctx, options = {}) {
  const width = Math.max(1, options.width || 390), height = Math.max(1, options.height || 844);
  const layout = shelterLayout(width, height, options.top ?? 150, options.bottom ?? height - 190);
  const { room, slots, window } = layout, state = options.state || {}, shelter = options.assets?.shelter || options.assets || {};
  const time = Number.isFinite(options.time) ? options.time : 0, reduceMotion = options.reduceMotion === true;
  ctx.save();ctx.fillStyle = '#93633c';ctx.fillRect(0, 0, width, height);
  ctx.lineJoin = 'round';ctx.lineCap = 'round';ctx.lineWidth = 2.5;
  const roomImage = bitmapOf(shelter.room);
  if (drawable(roomImage)) ctx.drawImage(roomImage, room.x, room.y, room.w, room.h);
  else fallbackRoom(ctx, room);
  ctx.save();ctx.beginPath();ctx.roundRect(window.x + 2, window.y + 2, Math.max(1, window.w - 4), Math.max(1, window.h - 4), room.w * .045);ctx.clip();
  for (let i = 0; i < 12; i++) {
    const x = window.x + seeded(i + 729) * window.w;
    const fall = reduceMotion ? seeded(i + 22) : (seeded(i + 22) + time * .04) % 1;
    oval(ctx, x + (reduceMotion ? 0 : Math.sin(time + i) * 2), window.y + fall * window.h, Math.max(1, room.w * .004), Math.max(1, room.w * .004), '#fffdf2');
  }
  ctx.restore();
  const decorations = state.homestead?.decorations || {};
  const actors = slots.map(slot => ({ depth: slot.depth, draw: () => furniture(ctx, slot, decorations[slot.id], shelter, time, reduceMotion, options.selectedDecoration === slot.id) }));
  const animalPlaces = {
    squirrel: [.46, .85, 'front', 1], bear: [.18, .75, 'right', 1.15],
    fox: [.71, .82, 'left', 1], redpanda: [.79, .67, 'front', 1], sparrow: [.56, .62, 'front', .76],
  };
  const recruited = Array.isArray(state.recruited) ? state.recruited : ['squirrel'];
  if (typeof options.drawAnimal === 'function') for (const id of recruited.slice(0, 5)) {
    const place = animalPlaces[id];if (!place) continue;
    const [x, y, view, scale] = place, px = room.x + room.w * x, py = room.y + room.h * y;
    actors.push({ depth: y, draw: () => {
      oval(ctx, px, py + 2, room.w * .035 * scale, room.w * .011 * scale, '#6041242b');
      options.drawAnimal(id, px, py, Math.max(36, room.w * .155) * scale, 'idle', time + seeded(x * 70) * 3, view);
    } });
  }
  actors.sort((a, b) => a.depth - b.depth).forEach(actor => actor.draw());
  ctx.restore();
  return slots.map(slot => slot.hit);
}

export function drawTrailCabin(ctx, options = {}) {
  const x = Number.isFinite(options.x) ? options.x : 195, y = Number.isFinite(options.y) ? options.y : 400;
  const size = Math.max(1, options.size || 150), image = bitmapOf(options.image || options.assets?.shelter?.cabin);
  ctx.save();ctx.lineWidth = Math.max(2, size * .025);ctx.lineJoin = 'round';
  oval(ctx, x, y + size * .01, size * .36, size * .09, '#5a62452e');
  if (drawable(image)) ctx.drawImage(image, x - size / 2, y - size * .9375, size, size);
  else {
    rounded(ctx, x - size * .32, y - size * .5, size * .64, size * .5, size * .07, '#b78b55', INK);
    ctx.beginPath();ctx.moveTo(x - size * .4, y - size * .45);ctx.quadraticCurveTo(x, y - size * .97, x + size * .4, y - size * .45);ctx.closePath();ctx.fillStyle = '#eef0e4';ctx.fill();ctx.strokeStyle = INK;ctx.stroke();
    rounded(ctx, x - size * .105, y - size * .3, size * .21, size * .3, size * .07, '#f1c47a', INK);
  }
  ctx.restore();
}
