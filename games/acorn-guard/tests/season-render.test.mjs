import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonPalette, winterTreeBlend, drawWinterTreeBlend, shelterLayout, drawSeasonDetails, drawSeasonAtmosphere, drawShelter, drawTrailCabin } from '../season-render.mjs';

function canvasRecorder() {
  const calls = [], stack = [];
  const context = { globalAlpha: 1, filter: 'none', lineWidth: 1, fillStyle: '#000', strokeStyle: '#000',
    save() { stack.push({ globalAlpha: this.globalAlpha, filter: this.filter, lineWidth: this.lineWidth, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle }); },
    restore() { assert.ok(stack.length, 'unbalanced restore');Object.assign(this, stack.pop()); },
  };
  for (const name of ['beginPath', 'closePath', 'fill', 'stroke', 'clip', 'setLineDash', 'rect', 'roundRect', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fillRect', 'translate', 'rotate', 'drawImage']) {
    context[name] = (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} finite coordinate`);calls.push({ name, args, alpha: context.globalAlpha, fill: context.fillStyle }); };
  }
  return { context, calls, stack };
}

const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));

test('season colors remain continuous across summer and autumn boundaries and end in snow', () => {
  for (const boundary of [1, 2]) {
    const before = rgb(seasonPalette(boundary - .0001).ground), after = rgb(seasonPalette(boundary + .0001).ground);
    assert.ok(before.every((channel, index) => Math.abs(channel - after[index]) <= 1));
  }
  assert.equal(seasonPalette(0).snow, 0);assert.equal(seasonPalette(2).snow, 0);assert.equal(seasonPalette(3).snow, 1);
  assert.deepEqual(seasonPalette(-100), seasonPalette(0));assert.deepEqual(seasonPalette(100), seasonPalette(3));
  assert.deepEqual(seasonPalette(Number.NaN), seasonPalette(0));
  assert.notEqual(seasonPalette(0).ground, seasonPalette(1).ground);assert.notEqual(seasonPalette(1).ground, seasonPalette(2).ground);
});

test('late autumn loses its canopy before snow starts and keeps warm ground through harvest90', () => {
  const autumn = seasonPalette(2);
  for (const harvests of [72, 84, 89, 90]) {
    const palette = seasonPalette(harvests / 36);
    for (const key of ['ground', 'plateau', 'cliffs', 'tuft', 'background', 'leaf']) assert.deepEqual(palette[key], autumn[key]);
    assert.equal(palette.autumn, 1);assert.equal(palette.snow, 0);
    assert.equal(winterTreeBlend(harvests / 36), 0);
  }
  assert.ok(Math.abs(winterTreeBlend(93 / 36) - .5) < .000001);
  assert.equal(winterTreeBlend(96 / 36), 1);assert.equal(winterTreeBlend(3), 1);
  assert.equal(seasonPalette(96 / 36).snow, 0);
  assert.ok(seasonPalette(97 / 36).snow > 0);assert.equal(seasonPalette(3).snow, 1);
  assert.notEqual(seasonPalette(93 / 36).ground, autumn.ground);
  for (const boundary of [2.5, 8 / 3]) {
    const before = seasonPalette(boundary - .00001), after = seasonPalette(boundary + .00001);
    assert.ok(rgb(before.ground).every((channel, index) => Math.abs(channel - rgb(after.ground)[index]) <= 1));
    assert.ok(Math.abs(before.autumn - after.autumn) < .001 && Math.abs(before.snow - after.snow) < .001);
  }
});

test('winter atlas composition keeps the shared trunk opaque and fully removes the old canopy', () => {
  const autumn = { pixels: [[.4, .2, .1, 1], [.7, .5, .2, 1]] };
  const winter = { pixels: [[.4, .2, .1, 1], [0, 0, 0, 0]] };
  const pixels = [[1, 0, 0, 1], [1, 0, 0, 1]], stack = [];
  const ctx = {
    canvas: { width: 2, height: 1 }, globalAlpha: .58, globalCompositeOperation: 'multiply', filter: 'sepia(1)',
    save() { stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, filter: this.filter }); },
    restore() { Object.assign(this, stack.pop()); },
    setTransform(...values) { assert.deepEqual(values, [1, 0, 0, 1, 0, 0]); },
    clearRect(...values) { assert.deepEqual(values, [0, 0, 2, 1]);pixels.forEach(pixel => pixel.fill(0)); },
    drawImage(image, ...rectangle) {
      assert.deepEqual(rectangle, [0, 0, 2, 1]);assert.equal(this.filter, 'none');
      assert.ok(['source-over', 'lighter'].includes(this.globalCompositeOperation));
      image.pixels.forEach((source, index) => {
        const alpha = source[3] * this.globalAlpha;
        const premultiplied = [...source.slice(0, 3).map(channel => channel * alpha), alpha];
        for (let channel = 0; channel < 4; channel++) pixels[index][channel] = this.globalCompositeOperation === 'lighter'
          ? Math.min(1, premultiplied[channel] + pixels[index][channel])
          : premultiplied[channel] + pixels[index][channel] * (1 - alpha);
      });
    },
  };
  for (const amount of [0, .25, .5, .75, 1]) {
    drawWinterTreeBlend(ctx, autumn, winter, amount);
    assert.deepEqual(pixels[0], [.4, .2, .1, 1], 'same trunk stays opaque throughout the transition');
    assert.ok(Math.abs(pixels[1][3] - (1 - amount)) < .000001, 'old canopy alpha follows its outgoing weight');
    assert.equal(ctx.globalAlpha, .58);assert.equal(ctx.globalCompositeOperation, 'multiply');assert.equal(ctx.filter, 'sepia(1)');assert.equal(stack.length, 0);
  }
  assert.deepEqual(pixels[1], [0, 0, 0, 0], 'winter canopy holes expose the background, never the autumn canopy');
});

test('winter room and all six furnishing touch targets fit narrow, tall and short play areas', () => {
  for (const [width, height, top, bottom] of [[320, 740, 150, 520], [390, 844, 155, 620], [510, 720, 150, 510], [800, 420, 80, 320]]) {
    const { room, slots, window } = shelterLayout(width, height, top, bottom);
    assert.ok(room.x >= 0 && room.y >= top && room.x + room.w <= width && room.y + room.h <= bottom);
    assert.equal(slots.length, 6);assert.equal(new Set(slots.map(slot => slot.id)).size, 6);
    for (const { hit } of slots) {
      assert.ok(hit.w >= 44 && hit.h >= 44, hit.id);
      assert.ok(hit.x >= 0 && hit.y >= top && hit.x + hit.w <= width && hit.y + hit.h <= bottom, hit.id);
    }
    assert.ok(window.x >= room.x && window.x + window.w <= room.x + room.w);
    assert.ok(window.y >= room.y && window.y + window.h < room.y + room.h * .5);
  }
});

test('season details keep the same world patches when scrolling crosses a generation row', () => {
  function worldPoints(cameraY) {
    const { context } = canvasRecorder(), points = [];
    drawSeasonDetails(context, { width: 390, height: 844, position: 2.8, time: 14, camera: { y: cameraY }, project(point) { points.push(point);return { x: point.x / 3, y: 400 + (point.y - cameraY) / 4 }; } });
    return points;
  }
  const before = worldPoints(159), after = worldPoints(161), key = point => `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
  const previous = new Set(before.map(key));
  const shared = after.filter(point => previous.has(key(point)));
  assert.ok(shared.length > after.length * .85, 'moving camera must retain world-anchored grass and snow positions');
  assert.ok(after.every(point => point.x >= 80 && point.x <= 820));
});

test('grounded seasonal patches never drift with animation time and preserve Canvas state', () => {
  const signature = (position, time) => {
    const { context, calls, stack } = canvasRecorder();
    drawSeasonDetails(context, { position, time, width: 390, height: 844, camera: { y: 159 }, project: point => ({ x: point.x / 3, y: 400 + (point.y - 159) / 4 }) });
    assert.equal(stack.length, 0);assert.equal(context.globalAlpha, 1);
    return calls;
  };
  for (const position of [0, 1, 2, 2.8, 3]) assert.deepEqual(signature(position, 0), signature(position, 19));
  assert.ok(signature(0, 0).some(call => call.name === 'fill' && call.fill === '#edc6bb'), 'spring flowers');
  assert.ok(signature(1, 0).some(call => call.name === 'fill' && call.fill === '#fff2b5'), 'summer sun pools');
  assert.ok(signature(2, 0).some(call => call.name === 'fill' && call.fill === '#b97b48'), 'autumn leaf beds');
  assert.ok(signature(3, 0).some(call => call.name === 'fill' && call.fill === '#f8faef'), 'winter snowbanks');
});

test('airborne seasons clip to the play area, animate without accumulation and freeze for reduced motion', () => {
  function render(position, time, reduceMotion = false) {
    const { context, calls, stack } = canvasRecorder();
    drawSeasonAtmosphere(context, { width: 320, height: 740, top: 160, bottom: 520, position, time, reduceMotion, camera: { y: 159 }, project: point => ({ x: point.x / 3, y: 350 + (point.y - 159) / 4 }) });
    assert.equal(stack.length, 0);assert.equal(context.globalAlpha, 1);
    assert.deepEqual(calls.find(call => call.name === 'rect').args, [0, 160, 320, 360]);
    assert.ok(calls.length < 1800, 'air layer has a fixed 50-anchor budget');
    assert.ok(calls.every(call => call.alpha >= 0 && call.alpha <= 1));
    return calls;
  }
  for (const position of [0, 1, 2, 2.5, 3]) {
    assert.deepEqual(render(position, 0, true), render(position, 10000, true));
    assert.notDeepEqual(render(position, 0), render(position, 1));
    assert.ok(render(position, 10000).length < 1800);
  }
});

test('airborne anchors remain world based when the camera crosses a generation row', () => {
  function anchors(cameraY) {
    const points = [], { context } = canvasRecorder();
    drawSeasonAtmosphere(context, { position: 2.6, time: 30, camera: { y: cameraY }, project(point) { points.push(point);return { x: point.x / 3, y: 400 + (point.y - cameraY) / 4 }; } });
    return points.map(point => `${point.x.toFixed(6)},${point.y.toFixed(6)}`);
  }
  const previous = new Set(anchors(159)), next = anchors(161);
  assert.ok(next.filter(point => previous.has(point)).length / next.length >= .95);
});

test('airborne loops fade out before respawning and reduced motion keeps full static opacity', () => {
  function render(time, reduceMotion = false) {
    const points = [], { context, calls } = canvasRecorder();
    drawSeasonAtmosphere(context, { position: 0, time, reduceMotion, project(point) { points.push(point);return { x: 160, y: 350 }; } });
    return { firstWorldY: points[0].y, firstAlpha: calls.find(call => call.name === 'translate').alpha };
  }
  const first = render(0), phase = ((first.firstWorldY % 160) + 160) % 160;
  const wrapTime = (160 - phase) / 18;
  const before = render(wrapTime - .0001), after = render(wrapTime + .0001);
  assert.ok(before.firstWorldY - after.firstWorldY > 159, 'exercise an actual row respawn');
  assert.ok(before.firstAlpha < .000001 && after.firstAlpha < .000001, 'both sides of the position reset must be invisible');
  assert.ok(render(wrapTime + 80 / 18).firstAlpha > .7, 'particles regain their normal opacity between row edges');
  assert.equal(render(wrapTime, true).firstAlpha, .72, 'reduced motion keeps a visible static petal');
});

test('shelter draws every recruited friend once, keeps hit zones for hidden pieces and restores Canvas state', () => {
  const { context, calls, stack } = canvasRecorder(), seen = [];
  const ids = ['squirrel', 'bear', 'fox', 'redpanda', 'sparrow'];
  const decor = Object.fromEntries(['nest', 'pantry', 'rug', 'hearth', 'lantern', 'curtains'].map((id, index) => [id, { level: index % 3 + 1, style: index % 3, placed: id !== 'rug' }]));
  const image = { width: 256, height: 256 };
  const hits = drawShelter(context, { width: 320, height: 740, top: 150, bottom: 520, state: { recruited: ids, homestead: { decorations: decor } }, assets: { shelter: { room: image, decor: Object.fromEntries(Object.keys(decor).map(id => [id, image])) } }, time: 123, selectedDecoration: 'rug', drawAnimal(...args) { seen.push(args); } });
  assert.equal(hits.length, 6);assert.deepEqual(seen.map(args => args[0]).sort(), [...ids].sort());
  assert.ok(seen.every(args => args[4] === 'idle' && args[3] >= 36));
  assert.equal(calls.filter(call => call.name === 'drawImage').length, 6, 'room and five placed furniture sprites');
  assert.equal(stack.length, 0);assert.equal(context.globalAlpha, 1);assert.equal(context.filter, 'none');
});

test('missing room art and reduced motion remain drawable without losing friend rendering', () => {
  const { context, stack } = canvasRecorder(), seen = [];
  drawShelter(context, { width: 390, height: 844, state: { recruited: ['squirrel'], homestead: { decorations: { nest: { level: 1, style: 0, placed: true } } } }, time: Number.NaN, reduceMotion: true, drawAnimal(id) { seen.push(id); } });
  drawTrailCabin(context, { x: 100, y: 400, size: 150 });
  assert.deepEqual(seen, ['squirrel']);assert.equal(stack.length, 0);
});
