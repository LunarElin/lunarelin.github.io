import * as THREE from './vendor/three.module.js';

export const CAMERA_TRANSITION_DURATION = .26;
export const CAMERA_TRANSITION_JUMP_PIXELS = 24;

export function shouldStartCameraTransition({ enabled, snap, hasSnapshot, jumpPixels }) {
  return !!enabled && !snap && !!hasSnapshot && Number.isFinite(jumpPixels) && jumpPixels > CAMERA_TRANSITION_JUMP_PIXELS;
}

// Opacity of the previous safe view, with zero velocity at both endpoints.
export function cameraTransitionOpacity(elapsed) {
  const t = Math.max(0, Math.min(1, elapsed / CAMERA_TRANSITION_DURATION));
  return 1 - t * t * (3 - 2 * t);
}

// Call render() immediately after the ordinary scene render. The two GPU-only
// snapshots store the final composite, so another handoff can reuse exactly
// the last displayed image, including an unfinished dissolve.
export function createBattleCameraTransition(renderer) {
  const size = new THREE.Vector2();
  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2);
  overlayCamera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  overlayScene.add(quad);
  const stats = {
    transitions: 0, fadeFrames: 0, lastJump: 0, maxJump: 0,
    opacity: 0, elapsed: 0, duration: CAMERA_TRANSITION_DURATION,
    snapshotWidth: 0, snapshotHeight: 0, snapshotBytes: 0,
    active: false, hasSnapshot: false, started: false, captured: false,
    calls: 0, triangles: 0,
  };
  const policy = { enabled: false, snap: false, hasSnapshot: false, jumpPixels: 0 };
  let first = null, second = null, latest = null, previous = null, disposed = false;

  function reset() {
    previous = null;
    stats.active = false;
    stats.hasSnapshot = false;
    stats.opacity = 0;
    stats.elapsed = 0;
    stats.started = false;
    stats.captured = false;
    stats.calls = 0;
    stats.triangles = 0;
  }

  function releaseSnapshots() {
    first?.dispose();
    second?.dispose();
    first = second = latest = previous = null;
    material.map = null;
    stats.snapshotWidth = stats.snapshotHeight = stats.snapshotBytes = 0;
  }

  function ensureSnapshots() {
    renderer.getDrawingBufferSize(size);
    if (size.x < 1 || size.y < 1) { reset(); return false; }
    if (first && size.x === stats.snapshotWidth && size.y === stats.snapshotHeight) return true;
    reset();
    releaseSnapshots();
    first = new THREE.FramebufferTexture(size.x, size.y);
    second = new THREE.FramebufferTexture(size.x, size.y);
    // The default framebuffer already contains ACES-tonemapped sRGB. Decode
    // this texture on sampling and encode once on output, without tonemapping.
    first.colorSpace = second.colorSpace = THREE.SRGBColorSpace;
    latest = first;
    material.map = first;
    material.needsUpdate = true;
    stats.snapshotWidth = size.x;
    stats.snapshotHeight = size.y;
    stats.snapshotBytes = size.x * size.y * 4 * 2;
    return true;
  }

  function render({ enabled = false, jumpPixels = 0, dt = 0, snap = false } = {}) {
    stats.started = stats.captured = false;
    stats.calls = stats.triangles = 0;
    if (disposed || !enabled) {
      reset();
      if (first) releaseSnapshots();
      return stats;
    }
    if (!ensureSnapshots()) return stats;
    if (snap) reset();
    policy.enabled = enabled;
    policy.snap = snap;
    policy.hasSnapshot = stats.hasSnapshot;
    policy.jumpPixels = jumpPixels;
    if (shouldStartCameraTransition(policy)) {
      previous = latest;
      latest = latest === first ? second : first;
      stats.elapsed = 0;
      stats.active = stats.started = true;
      stats.transitions++;
      stats.lastJump = jumpPixels;
      stats.maxJump = Math.max(stats.maxJump, jumpPixels);
    } else if (stats.active) {
      stats.elapsed = Math.min(CAMERA_TRANSITION_DURATION, stats.elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
    }
    stats.opacity = stats.active ? cameraTransitionOpacity(stats.elapsed) : 0;
    if (stats.opacity > 0) {
      material.map = previous;
      material.opacity = stats.opacity;
      const autoClear = renderer.autoClear;
      const callsBefore = renderer.info.render.calls;
      const trianglesBefore = renderer.info.render.triangles;
      try {
        renderer.autoClear = false;
        renderer.render(overlayScene, overlayCamera);
        stats.calls = renderer.info.render.calls - (renderer.info.autoReset ? 0 : callsBefore);
        stats.triangles = renderer.info.render.triangles - (renderer.info.autoReset ? 0 : trianglesBefore);
      } finally {
        renderer.autoClear = autoClear;
      }
      stats.fadeFrames++;
    } else {
      previous = null;
      stats.active = false;
    }
    // Capture after the overlay, and never read and write the same texture.
    renderer.copyFramebufferToTexture(latest);
    stats.hasSnapshot = stats.captured = true;
    return stats;
  }

  function dispose() {
    if (disposed) return;
    reset();
    releaseSnapshots();
    geometry.dispose();
    material.dispose();
    disposed = true;
  }

  return { render, reset, dispose, stats };
}
