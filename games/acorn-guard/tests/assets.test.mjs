import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HEROES } from '../rules.mjs';
import { ACTION_TIMING, VIEWS, frameAt } from '../motion.mjs';
import { createHash } from 'node:crypto';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = path.join(gameRoot, 'assets');
const manifest = JSON.parse(await readFile(path.join(assetRoot, 'runtime-assets.json'), 'utf8'));

function localAsset(reference) {
  assert.equal(typeof reference, 'string');
  const resolved = path.resolve(assetRoot, reference);
  assert.ok(resolved.startsWith(assetRoot + path.sep), `Asset must stay inside its game: ${reference}`);
  return resolved;
}

function webpInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP container must be complete');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= bytes.length, 'WebP chunk cannot exceed its file');
    if (kind === 'VP8X') return {
      width: bytes.readUIntLE(start + 4, 3) + 1,
      height: bytes.readUIntLE(start + 7, 3) + 1,
      alpha: Boolean(bytes[start] & 0x10),
    };
    if (kind === 'VP8L') {
      assert.equal(bytes[start], 0x2f);
      const bits = bytes.readUInt32LE(start + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean(bits & 0x10000000) };
    }
    if (kind === 'VP8 ') return {
      width: bytes.readUInt16LE(start + 6) & 0x3fff,
      height: bytes.readUInt16LE(start + 8) & 0x3fff,
      alpha: false,
    };
    offset = start + length + length % 2;
  }
  assert.fail('WebP has no recognized image chunk');
}

test('every animal has four independently drawn views with native movement and complete harvesting', async () => {
  assert.equal(manifest.version,2);
  assert.deepEqual(Object.keys(manifest.heroes).sort(),HEROES.map(hero=>hero.id).sort());
  for(const [id,hero] of Object.entries(manifest.heroes)){
    assert.deepEqual(Object.keys(hero.views).sort(),[...VIEWS].sort(),id);
    const images=new Set(),digests=new Set(),action=id==='squirrel'?'attack':'harvest';
    for(const [view,data] of Object.entries(hero.views)){
      assert.equal(data.generated,true,`${id}/${view} authored view`);assert.equal(data.mirrored,false,`${id}/${view} is not a runtime flip`);
      assert.ok(Number.isFinite(data.renderScale)&&data.renderScale>=.5&&data.renderScale<=1.8,`${id}/${view} fixed body scale`);
      images.add(data.image);digests.add(createHash('sha256').update(await readFile(localAsset(data.image))).digest('hex'));
      assert.deepEqual(Object.keys(data.animations).sort(),['idle','run',action].sort());
      assert.ok(data.anchor.x>=0&&data.anchor.x<=1&&data.anchor.y>=.5&&data.anchor.y<=1);
      const rectangles=new Set();
      for(const [state,animation] of Object.entries(data.animations)){
        assert.ok(Number.isFinite(animation.fps)&&animation.fps>0,`${id}/${view}/${state} rate`);
        assert.ok(Number.isFinite(animation.renderScale)&&animation.renderScale>=.5&&animation.renderScale<=1.8,`${id}/${view}/${state} fixed pose scale`);
        assert.equal(animation.loop,state==='idle'||state==='run');
        assert.ok(state==='idle'?[2,4].includes(animation.frames.length):animation.frames.length===6,`${id}/${view}/${state} frame count`);
        for(const f of animation.frames){
          assert.ok(Number.isFinite(f.duration_ms)&&f.duration_ms>0);
          assert.ok(Math.abs(f.duration_ms-1000/animation.fps)<1);
          const key=`${animation.image||data.image}:${f.x},${f.y},${f.w},${f.h}`;
          assert.ok(!rectangles.has(key),`${id}/${view}/${state} distinct source rectangle`);rectangles.add(key);
        }
      }
      const work=data.animations[action],duration=work.frames.reduce((sum,f)=>sum+f.duration_ms,0);
      assert.equal(duration,ACTION_TIMING.duration*1000,`${id}/${view} native cycle contract`);
      assert.equal(work.impactFrame,3);assert.equal(work.contactMs,330);
      assert.equal(frameAt(work,ACTION_TIMING.duration*ACTION_TIMING.contactRatio),work.frames[work.impactFrame]);
    }
    assert.equal(images.size,4,`${id} separate atlases`);assert.equal(digests.size,4,`${id} no duplicated view art`);
  }
});

test('all directional rectangles fit their transparent atlases and scrolling terrain stays local', async () => {
  for(const [id,hero] of Object.entries(manifest.heroes)){
    for(const [view,data] of Object.entries(hero.views)){
      for(const [action,animation] of Object.entries(data.animations)){
        const image=webpInfo(await readFile(localAsset(animation.image||data.image)));
        assert.ok(image.alpha,`${id}/${view}/${action} alpha`);
        for(const f of animation.frames){
          assert.ok([f.x,f.y,f.w,f.h].every(Number.isInteger));
          assert.ok(f.x>=0&&f.y>=0&&f.w>0&&f.h>0);
          assert.ok(f.x+f.w<=image.width&&f.y+f.h<=image.height,`${id}/${view}/${action} fits actual image`);
        }
      }
    }
  }
  const background=webpInfo(await readFile(localAsset(manifest.background)));
  assert.ok(background.width>=256&&background.height>=256);assert.equal(manifest.groundRepeat,'xy');
});

test('harvest tree idle, hit and stump frames fit a transparent atlas at native timing', async () => {
  const tree = manifest.tree;
  assert.ok(tree, 'The harvest target must have its own tree asset');
  const image = webpInfo(await readFile(localAsset(tree.image)));
  assert.ok(image.alpha, 'Tree canopy and stump need real transparency');
  assert.ok(tree.anchor.x >= 0 && tree.anchor.x <= 1 && tree.anchor.y >= 0 && tree.anchor.y <= 1);
  for (const [state, count] of Object.entries({ idle: 2, hit: 2, stump: 1 })) {
    const animation = tree.animations[state];
    assert.equal(animation.frames.length, count, state);
    assert.equal(animation.loop, state === 'idle', state);
    for (const frame of animation.frames) {
      assert.ok([frame.x, frame.y, frame.w, frame.h].every(Number.isInteger));
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0);
      assert.ok(frame.x + frame.w <= image.width && frame.y + frame.h <= image.height, state);
      assert.ok(Number.isFinite(frame.duration_ms) && frame.duration_ms > 0);
      assert.ok(Math.abs(frame.duration_ms - 1000 / animation.fps) < 1);
    }
  }
});

test('berry, bamboo and grain have transparent local props with usable ground anchors', async () => {
  assert.deepEqual(Object.keys(manifest.resources).sort(), ['bamboo', 'berry', 'grain']);
  for (const [type, resource] of Object.entries(manifest.resources)) {
    const image = webpInfo(await readFile(localAsset(resource.image)));
    assert.ok(image.alpha, `${type} prop must retain transparency`);
    assert.ok(image.width >= 64 && image.height >= 64, `${type} prop resolution`);
    assert.equal(resource.width, image.width, `${type} declared width`);
    assert.equal(resource.height, image.height, `${type} declared height`);
    assert.ok(Number.isFinite(resource.size) && resource.size >= 44 && resource.size <= 160, `${type} readable display size`);
    assert.ok(Number.isFinite(resource.anchor.x) && resource.anchor.x >= 0 && resource.anchor.x <= 1, `${type} horizontal anchor`);
    assert.ok(Number.isFinite(resource.anchor.y) && resource.anchor.y >= 0.5 && resource.anchor.y <= 1, `${type} root anchor`);
  }
});

test('HTML, module, stylesheet and manifest references resolve locally', async () => {
  const references = [];
  const html = await readFile(path.join(gameRoot, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('#')) references.push(match[1]);
  }
  const css = await readFile(path.join(gameRoot, 'styles.css'), 'utf8');
  for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) references.push(match[1]);
  const module = await readFile(path.join(gameRoot, 'game.mjs'), 'utf8');
  for (const match of module.matchAll(/from\s+['"]([^'"]+)['"]/g)) references.push(match[1]);
  for (const match of module.matchAll(/new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)/g)) references.push(match[1]);
  for (const reference of references) {
    assert.ok(!/^(?:https?:|data:|\/\/)/i.test(reference), `Runtime should not depend on a remote resource: ${reference}`);
    const target = new URL(reference, new URL('../', import.meta.url));
    const info = await stat(fileURLToPath(target));
    if (info.isDirectory()) assert.ok((await stat(path.join(fileURLToPath(target), 'index.html'))).isFile());
    else assert.ok(info.isFile());
  }
  const images = [manifest.background, manifest.ground, manifest.spark, manifest.tree?.image,
    ...Object.values(manifest.heroes).flatMap(hero=>Object.values(hero.views).flatMap(view=>[view.image,...Object.values(view.animations).map(animation=>animation.image)])),
    ...Object.values(manifest.resources).map(resource => resource.image)].filter(Boolean);
  for (const image of images) assert.ok((await stat(localAsset(image))).isFile(), image);
});

test('the four-view animal library and local scene assets stay below 6 MB', async () => {
  async function sizeOf(directory) {
    let bytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      bytes += entry.isDirectory() ? await sizeOf(target) : (await stat(target)).size;
    }
    return bytes;
  }
  const bytes = await sizeOf(assetRoot);
  assert.ok(bytes < 6_000_000, `Asset payload is ${(bytes / 1e6).toFixed(2)} MB`);
});
