import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonPalette, shelterLayout, drawSeasonDetails, drawShelter, drawTrailCabin } from '../season-render.mjs';

function canvasRecorder() {
  const calls = [], stack = [];
  const context = { globalAlpha: 1, filter: 'none', lineWidth: 1, fillStyle: '#000', strokeStyle: '#000',
    save() { stack.push({ globalAlpha: this.globalAlpha, filter: this.filter, lineWidth: this.lineWidth, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle }); },
    restore() { assert.ok(stack.length, 'unbalanced restore');Object.assign(this, stack.pop()); },
  };
  for (const name of ['beginPath', 'closePath', 'fill', 'stroke', 'clip', 'setLineDash', 'rect', 'roundRect', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fillRect', 'translate', 'rotate', 'drawImage']) {
    context[name] = (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} finite coordinate`);calls.push({ name, args, alpha: context.globalAlpha }); };
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
