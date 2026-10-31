import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixelArt } from '../pixel-art.mjs';
import { PALETTE, PIXEL_INDEX } from '../theme.mjs';

const ACTORS = { druid: 32, druidSword: 32, druidAxe: 32, druidSpear: 32, druidSwordAttack: 48, druidAxeAttack: 48, druidSpearAttack: 48, npc: 32, wolf: 32, bear: 48, dragon: 48, owl: 24,
  mushroom: 24, boar: 24, caster: 24, runner: 24, flyer: 24, swarm: 16, boss: 48, ancientBoss: 48, skyBoss: 48 };
const PROPS = { tree: [64, 80], treeBlossom: [64, 80], pine: [48, 80], rock: [24, 24], flower: [16, 16], campfire: [32, 32],
  chest: [32, 32], forge: [48, 64], gate: [64, 64], groundGrass: [16, 16], groundDirt: [16, 16],
  groundStone: [16, 16], groundSky: [16, 16], coin: [8, 8], scroll: [16, 16], staff: [16, 24], blessing: [24, 24] };
const DIRECTIONS = ['down', 'up', 'right', 'left'];
const ART = buildPixelArt();

test('the native sprite inventory contains every actor and field prop at its intended resolution', () => {
  const expected = [...Object.keys(ACTORS), ...Object.keys(PROPS)].sort();
  assert.deepEqual(Object.keys(ART.sprites).sort(), expected);
  assert.equal(Object.keys(ART.sprites).length, 38);
  for (const [id, size] of Object.entries(ACTORS)) assert.deepEqual([ART.sprites[id].width, ART.sprites[id].height], [size, size]);
  for (const [id, size] of Object.entries(PROPS)) assert.deepEqual([ART.sprites[id].width, ART.sprites[id].height], size);
});

test('all source pixels use the bounded opaque palette or its one transparent index without empty or monochrome frames', () => {
  assert.deepEqual(ART.palette, PALETTE); assert.equal(ART.palette[0], null); assert.equal(ART.palette.length, 32);
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

test('terrain variants stay opaque and quiet with a broad shared base instead of repeated dense marks', () => {
  const bases = { groundGrass: PIXEL_INDEX.green, groundDirt: PIXEL_INDEX.dirt, groundStone: PIXEL_INDEX.slate, groundSky: PIXEL_INDEX.slate };
  for (const [id, base] of Object.entries(bases)) {
    const variants = ART.sprites[id].frames.down;
    assert.equal(variants.length, 3);
    for (const pixels of variants) {
      assert.ok(pixels.every(index => index !== 0), `${id} must tile without transparent seams`);
      const accents = pixels.filter(index => index !== base).length;
      assert.ok(accents >= 3 && accents <= 8, `${id} must keep at least 248 of its 256 texels as the quiet base`);
    }
    for (let i = 0; i < variants.length; i++) for (let j = i + 1; j < variants.length; j++) assert.notDeepEqual(variants[i], variants[j]);
  }
});

test('the small hero keeps light hair and cape distinct from the jade hood in every direction and weapon pose', () => {
  const bright = new Set([PIXEL_INDEX.cream, PIXEL_INDEX.linen, PIXEL_INDEX.stoneLight, PIXEL_INDEX.skin]);
  const jade = new Set([PIXEL_INDEX.deepTeal, PIXEL_INDEX.teal, PIXEL_INDEX.mint]);
  for (const id of ['druid', 'druidSword', 'druidAxe', 'druidSpear']) for (const frames of Object.values(ART.sprites[id].frames)) for (const pixels of frames) {
    const opaque = pixels.filter(index => index !== 0).length;
    assert.ok(pixels.filter(index => bright.has(index)).length >= opaque * .15, `${id} must retain a readable light face/cape mass`);
    assert.ok(pixels.filter(index => jade.has(index)).length >= opaque * .15, `${id} must retain its dark jade identity`);
  }
});

test('actors have distinct native animation frames in all four directions and exact left-right mirroring', () => {
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

test('melee attack poses extend toward the target through windup strike and recovery while keeping planted feet', () => {
  const bounds = frame => {
    const xs = [], ys = [];
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (frame[y * 48 + x]) { xs.push(x); ys.push(y); }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  for (const id of ['druidSwordAttack', 'druidAxeAttack', 'druidSpearAttack']) {
    const sprite = ART.sprites[id]; assert.deepEqual([sprite.anchorX, sprite.anchorY], [24, 38]);
    for (const [direction, frames] of Object.entries(sprite.frames)) {
      for (let i = 0; i < frames.length; i++) {
        for (let j = i + 1; j < frames.length; j++) assert.notDeepEqual(frames[i], frames[j], `${id}/${direction} must have three actual attack poses`);
        const b = bounds(frames[i]); assert.ok(b.minX > 0 && b.minY > 0 && b.maxX < 47 && b.maxY < 47, `${id}/${direction} must keep a transparent edge around the padded weapon`);
        // The standing boot is copied at the same foot coordinate, not bobbed like a walk frame.
        assert.equal(frames[i][36 * 48 + 19], ART.sprites.druid.frames[direction][0][28 * 32 + 11]);
      }
    }
    const right = sprite.frames.right.map(bounds), down = sprite.frames.down.map(bounds), up = sprite.frames.up.map(bounds);
    assert.ok(right[1].maxX > right[0].maxX + 3, `${id} must reach forward on the strike`);
    assert.ok(down[1].maxY > down[0].maxY + 3, `${id} must strike down in front of the feet`);
    assert.ok(up[1].minY < up[0].minY - 3, `${id} must strike up above the hood`);
  }
});

test('the blossom variant preserves the tree silhouette trunk and anchors within the shared palette', () => {
  const tree = ART.sprites.tree, blossom = ART.sprites.treeBlossom;
  assert.deepEqual([blossom.width, blossom.height, blossom.anchorX, blossom.anchorY], [64, 80, 32, 77]);
  const base = tree.frames.down[0], frame = blossom.frames.down[0];
  assert.notDeepEqual(frame, base);
  for (let i = 0; i < base.length; i++) {
    assert.equal(frame[i] === 0, base[i] === 0, 'recoloring must not change the native canopy outline');
    if ([PIXEL_INDEX.woodDark, PIXEL_INDEX.wood, PIXEL_INDEX.woodLight].includes(base[i])) assert.equal(frame[i], base[i]);
  }
  assert.ok(frame.includes(PIXEL_INDEX.red) && frame.includes(PIXEL_INDEX.skin) && frame.includes(PIXEL_INDEX.cream));
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

test('melee variants preserve the druid body and baseline while giving each weapon a distinct native silhouette', () => {
  const ids = ['druidSword', 'druidAxe', 'druidSpear'];
  for (const direction of DIRECTIONS) for (let frame = 0; frame < 3; frame++) {
    const base = ART.sprites.druid.frames[direction][frame];
    for (const id of ids) {
      const variant = ART.sprites[id], pixels = variant.frames[direction][frame];
      assert.deepEqual([variant.anchorX, variant.anchorY], [16, 30]);
      assert.notDeepEqual(pixels, base);
      const bodyMin = direction === 'left' ? 11 : 7, bodyMax = direction === 'left' ? 24 : 20;
      for (let y = 0; y < 32; y++) for (let x = bodyMin; x <= bodyMax; x++) assert.equal(pixels[y * 32 + x], base[y * 32 + x]);
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) assert.notDeepEqual(ART.sprites[ids[i]].frames[direction][frame], ART.sprites[ids[j]].frames[direction][frame]);
  }
});
