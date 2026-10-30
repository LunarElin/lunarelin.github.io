import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixelArt } from '../pixel-art.mjs';

const ACTORS = { druid: 32, npc: 32, wolf: 32, bear: 48, dragon: 48, owl: 24,
  mushroom: 24, boar: 24, caster: 24, runner: 24, flyer: 24, swarm: 16, boss: 48, ancientBoss: 48, skyBoss: 48 };
const PROPS = { tree: [64, 80], pine: [48, 80], rock: [24, 24], flower: [16, 16], campfire: [32, 32],
  chest: [32, 32], forge: [48, 64], gate: [64, 64], groundGrass: [16, 16], groundDirt: [16, 16],
  groundStone: [16, 16], groundSky: [16, 16], coin: [8, 8], scroll: [16, 16], staff: [16, 24], blessing: [24, 24] };
const DIRECTIONS = ['down', 'up', 'right', 'left'];
const ART = buildPixelArt();

test('the native sprite inventory contains every actor and field prop at its intended resolution', () => {
  const expected = [...Object.keys(ACTORS), ...Object.keys(PROPS)].sort();
  assert.deepEqual(Object.keys(ART.sprites).sort(), expected);
  assert.equal(Object.keys(ART.sprites).length, 31);
  for (const [id, size] of Object.entries(ACTORS)) assert.deepEqual([ART.sprites[id].width, ART.sprites[id].height], [size, size]);
  for (const [id, size] of Object.entries(PROPS)) assert.deepEqual([ART.sprites[id].width, ART.sprites[id].height], size);
});

test('all source pixels use the bounded opaque palette or its one transparent index without empty or monochrome frames', () => {
  assert.equal(ART.palette[0], null); assert.ok(ART.palette.length >= 4 && ART.palette.length <= 33);
  for (const color of ART.palette.slice(1)) assert.match(color, /^#[0-9a-f]{6}$/i);
  for (const [id, sprite] of Object.entries(ART.sprites)) {
    assert.ok(Number.isInteger(sprite.width) && sprite.width > 0 && Number.isInteger(sprite.height) && sprite.height > 0);
    for (const [direction, frames] of Object.entries(sprite.frames)) {
      assert.ok(Array.isArray(frames) && frames.length > 0);
      for (const pixels of frames) {
        assert.ok(pixels instanceof Uint8Array, `${id}/${direction} must be indexed native pixels`);
        assert.equal(pixels.length, sprite.width * sprite.height);
        const colors = new Set();
        for (const index of pixels) {
          assert.ok(Number.isFinite(index) && Number.isInteger(index) && index >= 0 && index < ART.palette.length);
          if (index) colors.add(index);
        }
        assert.ok(colors.size >= 3, `${id}/${direction} must contain at least three drawn colors`);
      }
    }
  }
});

test('actors have distinct native walk frames in all four directions and exact left-right mirroring', () => {
  for (const id of Object.keys(ACTORS)) {
    const sprite = ART.sprites[id]; assert.deepEqual(Object.keys(sprite.frames).sort(), [...DIRECTIONS].sort());
    for (const direction of DIRECTIONS) {
      const frames = sprite.frames[direction]; assert.equal(frames.length, 3);
      assert.ok(frames.slice(1).some(pixels => pixels.some((color, index) => color !== frames[0][index])), `${id}/${direction} must actually animate`);
    }
    for (let frame = 0; frame < 3; frame++) for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
      assert.equal(sprite.frames.left[frame][y * sprite.width + x], sprite.frames.right[frame][y * sprite.width + sprite.width - 1 - x]);
    }
  }
  assert.equal(ART.sprites.campfire.frames.down.length, 3);
});

test('integer foot anchors are shared by every frame and terrain anchors remain on the tile origin', () => {
  for (const [id, sprite] of Object.entries(ART.sprites)) {
    assert.ok(Number.isInteger(sprite.anchorX) && sprite.anchorX >= 0 && sprite.anchorX <= sprite.width);
    assert.ok(Number.isInteger(sprite.anchorY) && sprite.anchorY >= 0 && sprite.anchorY <= sprite.height);
    if (id.startsWith('ground')) assert.deepEqual([sprite.anchorX, sprite.anchorY], [0, 0]);
    else assert.equal(sprite.anchorX, sprite.width / 2);
    for (const frames of Object.values(sprite.frames)) for (const pixels of frames) assert.equal(pixels.length, sprite.width * sprite.height);
  }
  for (const [direction, point] of Object.entries(ART.sprites.druid.wandTips)) {
    assert.ok(DIRECTIONS.includes(direction)); assert.ok(point.every(Number.isInteger));
    assert.ok(point[0] >= 0 && point[0] < 32 && point[1] >= 0 && point[1] < 32);
  }
});

test('rebuilding original art produces the same palette and native animation data', () => {
  assert.deepEqual(buildPixelArt(), ART);
});
