import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TRANSITION_DURATION, CAMERA_TRANSITION_JUMP_PIXELS, cameraTransitionOpacity, createBattleCameraTransition, shouldStartCameraTransition } from '../camera-transition.mjs';
import { SRGBColorSpace } from '../vendor/three.module.js';

class RendererProbe {
  constructor() {
    this.autoClear = true;
    this.info = { autoReset: true, render: { calls: 80, triangles: 1000 } };
    this.width = 400;
    this.height = 600;
    this.framebuffer = 'first world';
    this.copies = [];
    this.overlays = [];
    this.contents = new Map();
    this.throwOnOverlay = false;
  }
  getDrawingBufferSize(size) { return size.set(this.width, this.height); }
  copyFramebufferToTexture(texture) {
    this.contents.set(texture, this.framebuffer);
    this.copies.push(texture);
  }
  render(scene) {
    assert.equal(this.autoClear, false, 'overlay must preserve the world framebuffer');
    if (this.throwOnOverlay) throw new Error('lost context');
    const material = scene.children[0].material;
    assert.equal(material.toneMapped, false);
    assert.equal(material.depthTest, false);
    assert.equal(material.map.colorSpace, SRGBColorSpace);
    this.overlays.push({ texture: material.map, opacity: material.opacity, old: this.contents.get(material.map) });
    this.framebuffer = `mix(${this.contents.get(material.map)}, ${this.framebuffer}, ${material.opacity})`;
    this.info.render.calls = this.info.autoReset ? 1 : this.info.render.calls + 1;
    this.info.render.triangles = this.info.autoReset ? 2 : this.info.render.triangles + 2;
  }
}

test('dissolve starts only above the CSS-pixel threshold with a usable battle snapshot', () => {
  const eligible = { enabled: true, snap: false, hasSnapshot: true, jumpPixels: 25 };
  assert.equal(CAMERA_TRANSITION_JUMP_PIXELS, 24);
  assert.equal(shouldStartCameraTransition(eligible), true);
  for (const jumpPixels of [-1, 0, 12, 24, NaN, Infinity]) assert.equal(shouldStartCameraTransition({ ...eligible, jumpPixels }), false);
  for (const override of [{ enabled: false }, { snap: true }, { hasSnapshot: false }]) assert.equal(shouldStartCameraTransition({ ...eligible, ...override }), false);
});

test('previous-view opacity decreases smoothly over 260 ms and clamps at both endpoints', () => {
  assert.equal(CAMERA_TRANSITION_DURATION, .26);
  assert.equal(cameraTransitionOpacity(-1), 1);
  assert.equal(cameraTransitionOpacity(0), 1);
  assert.equal(cameraTransitionOpacity(.13), .5);
  assert.equal(cameraTransitionOpacity(.26), 0);
  assert.equal(cameraTransitionOpacity(1), 0);
  let previous = 1;
  for (let frame = 0; frame <= 60; frame++) {
    const opacity = cameraTransitionOpacity(frame / 60 * .26);
    assert.ok(opacity <= previous && opacity >= 0);
    previous = opacity;
  }
  assert.ok(1 - cameraTransitionOpacity(.001) < .00005, 'fade begins with near-zero velocity');
  assert.ok(cameraTransitionOpacity(.259) < .00005, 'fade ends with near-zero velocity');
});

test('first battle frame captures without showing an uninitialized texture and ordinary frames reuse it', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  const stats = transition.render({ enabled: true, jumpPixels: 500, dt: 1 / 60 });
  assert.equal(stats, transition.stats);
  assert.equal(stats.transitions, 0);
  assert.equal(stats.hasSnapshot, true);
  assert.equal(stats.captured, true);
  assert.equal(stats.calls, 0);
  assert.equal(renderer.overlays.length, 0);
  const texture = renderer.copies[0];
  for (let i = 0; i < 10; i++) transition.render({ enabled: true, jumpPixels: 24, dt: 1 / 60 });
  assert.ok(renderer.copies.every(copy => copy === texture), 'no per-frame texture allocation');
  assert.equal(stats.snapshotWidth, 400);
  assert.equal(stats.snapshotHeight, 600);
  assert.equal(stats.snapshotBytes, 400 * 600 * 4 * 2);
  transition.dispose();
});

test('far handoff begins at the previous complete view, blends, and finishes without camera-scale changes', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: true });
  renderer.framebuffer = 'distant world';
  const stats = transition.render({ enabled: true, jumpPixels: 180, dt: .02 });
  assert.equal(stats.started, true);
  assert.equal(stats.transitions, 1);
  assert.equal(stats.opacity, 1);
  assert.equal(stats.calls, 1);
  assert.equal(stats.triangles, 2);
  assert.equal(renderer.overlays[0].old, 'first world');
  assert.notEqual(renderer.overlays[0].texture, renderer.copies.at(-1), 'snapshot read/write feedback is forbidden');
  transition.render({ enabled: true, dt: .13 });
  assert.equal(stats.opacity, .5);
  assert.equal(stats.fadeFrames, 2);
  transition.render({ enabled: true, dt: .13 });
  assert.equal(stats.opacity, 0);
  assert.equal(stats.active, false);
  assert.equal(stats.calls, 0);
  assert.equal(stats.elapsed, .26);
  assert.equal(stats.lastJump, 180);
  assert.equal(stats.maxJump, 180);
  transition.dispose();
});

test('handoff during a dissolve starts from the last displayed composite rather than an older unblended world', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: true });
  renderer.framebuffer = 'second world';
  transition.render({ enabled: true, jumpPixels: 120 });
  renderer.framebuffer = 'second moving world';
  transition.render({ enabled: true, dt: .13 });
  const lastDisplayed = renderer.framebuffer;
  renderer.framebuffer = 'third world';
  const stats = transition.render({ enabled: true, jumpPixels: 250 });
  assert.equal(renderer.overlays.at(-1).old, lastDisplayed);
  assert.equal(stats.opacity, 1);
  assert.equal(stats.transitions, 2);
  assert.equal(stats.maxJump, 250);
  assert.equal(new Set(renderer.copies).size, 2, 'all handoffs share two textures');
  transition.dispose();
});

test('pause freezes the dissolve and snap cancels it while preparing a fresh snapshot', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: true });
  transition.render({ enabled: true, jumpPixels: 100 });
  transition.render({ enabled: true, dt: .1 });
  const opacity = transition.stats.opacity;
  for (const dt of [0, -1, NaN]) transition.render({ enabled: true, dt });
  assert.equal(transition.stats.opacity, opacity);
  const stats = transition.render({ enabled: true, snap: true, jumpPixels: 200 });
  assert.equal(stats.active, false);
  assert.equal(stats.captured, true);
  assert.equal(stats.transitions, 1);
  assert.equal(stats.calls, 0);
  transition.dispose();
});

test('nonbattle frames and explicit reset invalidate snapshots while preserving cumulative QA counters', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: false });
  assert.equal(renderer.copies.length, 0);
  assert.equal(transition.stats.snapshotBytes, 0);
  transition.render({ enabled: true });
  transition.render({ enabled: true, jumpPixels: 90 });
  const copies = renderer.copies.length, fadeFrames = transition.stats.fadeFrames;
  let disposed = 0;
  for (const texture of new Set(renderer.copies)) texture.addEventListener('dispose', () => disposed++);
  transition.render({ enabled: false, jumpPixels: 300 });
  assert.equal(renderer.copies.length, copies);
  assert.equal(transition.stats.hasSnapshot, false);
  assert.equal(transition.stats.transitions, 1);
  assert.equal(transition.stats.fadeFrames, fadeFrames);
  assert.equal(transition.stats.lastJump, 90);
  assert.equal(disposed, 2);
  assert.equal(transition.stats.snapshotBytes, 0, 'indoor frames return snapshot GPU memory');
  transition.render({ enabled: false });
  assert.equal(disposed, 2, 'repeated nonbattle frames do not dispose again');
  transition.render({ enabled: true, jumpPixels: 200 });
  assert.equal(transition.stats.started, false, 'old battle image must never appear in a new battle');
  transition.reset();
  assert.equal(transition.stats.hasSnapshot, false);
  assert.equal(transition.stats.transitions, 1);
  transition.dispose();
});

test('drawing-buffer resize disposes the old pair and starts with a clean capture', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: true });
  transition.render({ enabled: true, jumpPixels: 100 });
  const oldTextures = new Set(renderer.copies), disposed = new Set();
  for (const texture of oldTextures) texture.addEventListener('dispose', () => disposed.add(texture));
  renderer.width = 320;
  renderer.height = 338;
  const overlays = renderer.overlays.length;
  transition.render({ enabled: true, jumpPixels: 500 });
  assert.equal(disposed.size, 2);
  assert.equal(renderer.overlays.length, overlays);
  assert.equal(transition.stats.active, false);
  assert.equal(transition.stats.transitions, 1);
  assert.equal(transition.stats.snapshotBytes, 320 * 338 * 8);
  assert.ok(!oldTextures.has(renderer.copies.at(-1)));
  transition.dispose();
});

test('overlay restores autoClear in normal and exceptional paths and reports only its additional draws', () => {
  for (const autoReset of [true, false]) for (const autoClear of [true, false]) {
    const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
    renderer.info.autoReset = autoReset;
    renderer.autoClear = autoClear;
    transition.render({ enabled: true });
    const stats = transition.render({ enabled: true, jumpPixels: 100 });
    assert.equal(renderer.autoClear, autoClear);
    assert.equal(stats.calls, 1);
    assert.equal(stats.triangles, 2);
    renderer.throwOnOverlay = true;
    assert.throws(() => transition.render({ enabled: true, dt: .01 }), /lost context/);
    assert.equal(renderer.autoClear, autoClear);
    transition.dispose();
  }
});

test('dispose releases GPU snapshots once and prevents later copies', () => {
  const renderer = new RendererProbe(), transition = createBattleCameraTransition(renderer);
  transition.render({ enabled: true });
  transition.render({ enabled: true, jumpPixels: 100 });
  let disposed = 0;
  for (const texture of new Set(renderer.copies)) texture.addEventListener('dispose', () => disposed++);
  const copies = renderer.copies.length;
  transition.dispose();
  transition.dispose();
  transition.render({ enabled: true, jumpPixels: 100 });
  assert.equal(disposed, 2);
  assert.equal(renderer.copies.length, copies);
  assert.equal(transition.stats.snapshotBytes, 0);
  assert.equal(transition.stats.transitions, 1);
});
