import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_DOWN, CAMERA_OFFSET, CAMERA_RIGHT, CAMERA_Y, battleCamera, cameraFocus, cameraFraming, carryHeight, followCamera, followBattleCamera } from '../camera.mjs';
import { BOUNDS } from '../maps.mjs';

// Independent orthographic projection: camera basis comes from cross products,
// rather than reproducing cameraFraming/followCamera's scalar calculations.
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function normalized(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}
const forward = normalized(CAMERA_OFFSET);
const right = normalized(cross({ x: 0, y: 1, z: 0 }, forward));
const up = cross(forward, right);

function project(point, view, width, height) {
  const relative = { x: point.x - view.x, y: point.y - view.focusY, z: point.z - view.z };
  return { x: width / 2 + dot(relative, right) * height / view.span, y: height / 2 - dot(relative, up) * height / view.span };
}

function footAndTop(player, bag, view, width, height) {
  return {
    foot: project({ ...player, y: 0 }, view, width, height),
    top: project({ ...player, y: carryHeight(bag) }, view, width, height),
  };
}

const screens = [{ width: 320, height: 356 }, { width: 390, height: 604 }, { width: 900, height: 560 }];

test('expanded shop corners preserve carried food and feet inside mobile safe areas', () => {
  for (const { width, height } of screens) for (const x of [BOUNDS.minX, 0, BOUNDS.maxX]) for (const z of [BOUNDS.minZ, BOUNDS.maxZ]) {
    const player = { x, z }, bag = { gear: 0, potion: 0, food: 22 };
    const framing = cameraFraming(width, height, bag);
    const focus = cameraFocus(player, framing, width, height, bag, BOUNDS);
    const view = followCamera(null, focus, framing, 0);
    const { foot, top } = footAndTop(player, bag, view, width, height);
    assert.ok(top.y >= 38 - 1e-8 && foot.y <= height - 140 + 1e-8);
    assert.ok(foot.x >= 38 - 1e-8 && foot.x <= width - 38 + 1e-8);
  }
});

test('close combat framing keeps phone fighters readable with room for heads and weapon swings', () => {
  const allies = [{ x: -.5, z: 2, hp: 90, range: 1.1 }];
  const enemies = [{ x: .5, z: 2.5, hp: 60, range: 1.1 }];
  for (const { width, height } of [{ width: 320, height: 338 }, { width: 390, height: 585 }]) {
    const target = battleCamera(width, height, allies, enemies);
    const view = followBattleCamera(null, target.focus, target.framing, 0);
    const body = project({ ...allies[0], y: 1.3 * .9 }, view, width, height);
    const foot = project({ ...allies[0], y: 0 }, view, width, height);
    assert.ok(foot.y - body.y >= 40 && foot.y - body.y <= 56, `${width}: fighter body is not readable`);
    for (const unit of [...allies, ...enemies]) for (const side of [-.6, .6]) for (const y of [0, 2.1]) {
      const actual = project({ x: unit.x + right.x * side, y, z: unit.z + right.z * side }, view, width, height);
      assert.ok(actual.x >= 30 && actual.x <= width - 30);
      assert.ok(actual.y >= 38 && actual.y <= height - 42);
    }
  }
});

test('food and mixed cargo remain inside the phone camera safe margins up to full capacity', () => {
  const player = { x: -1.35, z: -2.2 };
  for (const { width, height } of screens) for (let food = 1; food <= 22; food++) {
    for (const potion of [0, Math.floor((22 - food) / 2), 22 - food]) {
      const bag = { gear: 22 - food - potion, potion, food };
      const view = followCamera(null, player, cameraFraming(width, height, bag), 0);
      const { foot, top } = footAndTop(player, bag, view, width, height);
      assert.ok(top.y >= 38 - 1e-8, `${width}: food stack clips top`);
      assert.ok(foot.y <= height - 140 + 1e-8, `${width}: feet enter controls`);
      assert.ok(top.y < foot.y && Number.isFinite(view.span));
    }
  }
});

test('camera-relative input axes are orthonormal and agree with the actual view orientation', () => {
  assert.ok(Math.abs(Math.hypot(CAMERA_RIGHT.x, CAMERA_RIGHT.z) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(CAMERA_DOWN.x, CAMERA_DOWN.z) - 1) < 1e-12);
  assert.ok(Math.abs(CAMERA_RIGHT.x * CAMERA_DOWN.x + CAMERA_RIGHT.z * CAMERA_DOWN.z) < 1e-12);
  assert.ok(Math.abs(CAMERA_RIGHT.x - right.x) < 1e-12);
  assert.ok(Math.abs(CAMERA_RIGHT.z - right.z) < 1e-12);
  assert.ok(Math.abs(CAMERA_Y - up.y) < 1e-12);
  const framing = cameraFraming(390, 604, {});
  const view = followCamera(null, { x: 0, z: 0 }, framing, 0);
  const origin = project({ x: 0, y: 0, z: 0 }, view, 390, 604);
  const horizontal = project({ ...CAMERA_RIGHT, y: 0 }, view, 390, 604);
  const downward = project({ ...CAMERA_DOWN, y: 0 }, view, 390, 604);
  assert.ok(horizontal.x > origin.x);
  assert.ok(Math.abs(horizontal.y - origin.y) < 1e-10);
  assert.ok(downward.y > origin.y);
  assert.ok(Math.abs(downward.x - origin.x) < 1e-10);
});

test('all legal one-to-twenty-two mixed cargo stacks fit above the feet with phone and desktop safe margins', () => {
  const player = { x: 2.3, z: -1.7 };
  for (const { width, height } of screens) for (let count = 1; count <= 22; count++) {
    let previousHeight = 0;
    for (let potion = 0; potion <= count; potion++) {
      const bag = { gear: count - potion, potion };
      const stack = carryHeight(bag);
      assert.ok(stack > previousHeight, `taller potion stack: ${count}/${potion}`);
      previousHeight = stack;
      const framing = cameraFraming(width, height, bag);
      const view = followCamera(null, player, framing, 0);
      const { foot, top } = footAndTop(player, bag, view, width, height);
      assert.ok(Number.isFinite(view.span) && view.span > 0);
      assert.ok(top.y >= 38 - 1e-8, `${width}x${height}, ${count}/${potion}: cargo clips top`);
      assert.ok(foot.y <= height - 140 + 1e-8, `${width}x${height}: feet enter controls`);
      assert.ok(foot.y > height / 2 && top.y < foot.y);
      assert.ok(Math.abs(foot.x - width / 2) < 1e-8);
      assert.ok(Math.abs(foot.y - framing.feet) < 1e-8);
    }
  }
});

test('empty and fully loaded framing keep the character readable in CSS pixels instead of scaling to desktop width', () => {
  assert.ok(carryHeight() > 2);
  assert.equal(carryHeight(), carryHeight({ gear: 0, potion: 0 }));
  const player = { x: 0, z: 0 };
  for (const { width, height } of screens) {
    const empty = followCamera(null, player, cameraFraming(width, height, {}), 0);
    const loaded = followCamera(null, player, cameraFraming(width, height, { potion: 22 }), 0);
    const foot = project({ ...player, y: 0 }, empty, width, height);
    const bodyTop = project({ ...player, y: 1.75 }, empty, width, height);
    const loadedFoot = project({ ...player, y: 0 }, loaded, width, height);
    const loadedBodyTop = project({ ...player, y: 1.3 }, loaded, width, height);
    const oneUnit = project({ ...CAMERA_RIGHT, y: 0 }, empty, width, height);
    assert.ok(oneUnit.x - foot.x >= 34 && oneUnit.x - foot.x <= 46.000001);
    assert.ok(foot.y - bodyTop.y >= 42, `${width}: shopkeeper silhouette is too small`);
    assert.ok(loadedFoot.y - loadedBodyTop.y >= 25, `${width}: fully loaded body is too small`);
    assert.ok(loaded.span >= empty.span);
  }
});

test('ordinary movement follows smoothly without overshooting or excessive tracking delay', () => {
  const framing = cameraFraming(390, 604, {});
  let view = followCamera(null, { x: 0, z: 0 }, framing, 0);
  view = followCamera(view, { x: 1, z: -0.5 }, framing, 1 / 60);
  assert.ok(view.x > 0 && view.x < 1);
  assert.ok(view.z < 0 && view.z > -0.5);
  for (let frame = 1; frame < 15; frame++) view = followCamera(view, { x: 1, z: -0.5 }, framing, 1 / 60);
  assert.ok(Math.hypot(view.x - 1, view.z + 0.5) < 0.06, 'quarter-second response is too slow');
  for (let frame = 0; frame < 15; frame++) view = followCamera(view, { x: 1, z: -0.5 }, framing, 1 / 60);
  assert.ok(Math.hypot(view.x - 1, view.z + 0.5) < 0.003);
});

test('thirty and sixty hertz movement have visually equivalent tracking and loaded cargo remains on screen', () => {
  function trace(hz, width, height, bag) {
    const framing = cameraFraming(width, height, bag);
    let view = followCamera(null, { x: 0, z: 0 }, framing, 0);
    for (let frame = 1; frame <= hz; frame++) {
      const time = frame / hz;
      const player = { x: time * 3, z: time * 1.5 };
      view = followCamera(view, player, framing, 1 / hz);
      const { foot, top } = footAndTop(player, bag, view, width, height);
      assert.ok(top.y >= 16, `${hz}Hz: cargo clips while following`);
      assert.ok(foot.y <= height - 112, `${hz}Hz: feet enter controls while following`);
      assert.ok(foot.x >= 24 && foot.x <= width - 24);
    }
    return view;
  }
  for (const { width, height } of screens) {
    const slow = trace(30, width, height, { gear: 11, potion: 11 });
    const fast = trace(60, width, height, { gear: 11, potion: 11 });
    assert.ok(Math.hypot(slow.x - fast.x, slow.z - fast.z) < 0.06);
    assert.ok(Math.hypot(fast.x - 3, fast.z - 1.5) < 0.35);
    const slowFoot = footAndTop({ x: 3, z: 1.5 }, {}, slow, width, height).foot;
    const fastFoot = footAndTop({ x: 3, z: 1.5 }, {}, fast, width, height).foot;
    assert.ok(Math.hypot(slowFoot.x - fastFoot.x, slowFoot.y - fastFoot.y) < 3);
  }
});

test('a teleport or explicit snap immediately reframes the destination without a long camera chase', () => {
  const framing = cameraFraming(320, 356, { potion: 22 });
  const current = followCamera(null, { x: 0, z: 0 }, framing, 0);
  for (const [player, snap] of [[{ x: 3.5, z: 0 }, false], [{ x: 0.2, z: 0.3 }, true]]) {
    const view = followCamera(current, player, framing, 1 / 60, snap);
    assert.equal(view.x, player.x); assert.equal(view.z, player.z);
    assert.equal(view.span, framing.span);
    const { foot, top } = footAndTop(player, { potion: 22 }, view, 320, 356);
    assert.ok(Math.abs(foot.x - 160) < 1e-8);
    assert.ok(Math.abs(foot.y - framing.feet) < 1e-8);
    assert.ok(top.y >= 38 - 1e-8);
  }
});

test('adding cargo zooms out on the first frame; unloading zooms in smoothly and settles promptly', () => {
  const player = { x: 0, z: 0 };
  const emptyFrame = cameraFraming(320, 356, {});
  const loadedFrame = cameraFraming(320, 356, { potion: 22 });
  const initial = followCamera(null, player, emptyFrame, 0);
  let view = followCamera(initial, player, loadedFrame, 1 / 60);
  assert.equal(view.span, loadedFrame.span);
  assert.ok(footAndTop(player, { potion: 22 }, view, 320, 356).top.y >= 38 - 1e-8);
  const fullDifference = view.span - emptyFrame.span;
  assert.ok(fullDifference > 0);
  view = followCamera(view, player, emptyFrame, 1 / 60);
  assert.ok(view.span < loadedFrame.span && view.span > emptyFrame.span);
  for (let frame = 1; frame < 120; frame++) {
    const previous = view.span;
    view = followCamera(view, player, emptyFrame, 1 / 60);
    assert.ok(view.span <= previous && view.span >= emptyFrame.span);
    const foot = footAndTop(player, {}, view, 320, 356).foot;
    assert.ok(Math.abs(foot.y - emptyFrame.feet) < 1e-8, 'zooming shifts the feet into the controls');
    if (frame === 29) assert.ok(view.span - emptyFrame.span < fullDifference * 0.4);
  }
  assert.ok(view.span - emptyFrame.span < fullDifference * 0.02, 'zoom-in takes too long to settle');
});

test('edge focus keeps feet, cargo top and side margins safe at every shop corner and center', () => {
  const positions = [
    { x: -6, z: -4.7 }, { x: 6, z: -4.7 }, { x: -6, z: 6 }, { x: 6, z: 6 },
    { x: 0, z: 0 }, { x: 0, z: -4.7 }, { x: 0, z: 6 }, { x: -6, z: 0 }, { x: 6, z: 0 },
  ];
  const bags = [{ gear: 0, potion: 0 }, ...Array.from({ length: 23 }, (_, potion) => ({ gear: 22 - potion, potion }))];
  for (const { width, height } of screens) for (const player of positions) for (const bag of bags) {
    const framing = cameraFraming(width, height, bag);
    const focus = cameraFocus(player, framing, width, height, bag);
    assert.ok(Number.isFinite(focus.x) && Number.isFinite(focus.z));
    const view = followCamera(null, focus, framing, 0, true);
    const { foot, top } = footAndTop(player, bag, view, width, height);
    const label = `${width}x${height}, (${player.x},${player.z}), gear ${bag.gear}/potion ${bag.potion}`;
    assert.ok(top.y >= 38 - 1e-8, `${label}: cargo top`);
    assert.ok(foot.y <= height - 140 + 1e-8, `${label}: control margin`);
    assert.ok(foot.x >= 38 - 1e-8 && foot.x <= width - 38 + 1e-8, `${label}: side margin`);
    assert.ok(Math.abs(top.x - foot.x) < 1e-8);
  }
});

test('back-wall focus moves inward for an empty bag but yields that edge stop to a full tall stack', () => {
  const player = Object.freeze({ x: 0, z: -4.7 });
  for (const { width, height } of screens) {
    const emptyBag = Object.freeze({ gear: 0, potion: 0 });
    const fullBag = Object.freeze({ gear: 0, potion: 22 });
    const emptyFraming = cameraFraming(width, height, emptyBag);
    const fullFraming = cameraFraming(width, height, fullBag);
    const emptyFocus = cameraFocus(player, emptyFraming, width, height, emptyBag);
    const fullFocus = cameraFocus(player, fullFraming, width, height, fullBag);
    const inward = (focus) => (focus.x - player.x) * CAMERA_DOWN.x + (focus.z - player.z) * CAMERA_DOWN.z;
    assert.ok(inward(emptyFocus) > 0.5, `${width}: back-wall empty space was not reduced`);
    assert.ok(inward(fullFocus) >= -1e-8);
    assert.ok(inward(fullFocus) < inward(emptyFocus) - 0.5, `${width}: edge stop takes priority over cargo`);
    const safeView = followCamera(null, fullFocus, fullFraming, 0, true);
    const unsafeView = followCamera(null, emptyFocus, fullFraming, 0, true);
    const safeTop = footAndTop(player, fullBag, safeView, width, height).top;
    const unsafeTop = footAndTop(player, fullBag, unsafeView, width, height).top;
    assert.ok(safeTop.y >= 38 - 1e-8);
    assert.ok(unsafeTop.y < 38, 'this regression case must actually require releasing the edge stop');
  }
});

test('ranged exchanges keep both firing and impact positions visible at the same close scale', () => {
  const allies = [{ x: -2, z: 1, hp: 60, range: 4.2, attackAt: 9.9 }];
  const enemies = [{ x: 2, z: 1, hp: 60, range: 3.75 }];
  for (const { width, height } of [{ width: 320, height: 338 }, { width: 390, height: 585 }, { width: 900, height: 560 }]) {
    const target = battleCamera(width, height, allies, enemies, 10);
    const view = followBattleCamera(null, target.focus, target.framing, 0);
    for (const unit of [...allies, ...enemies]) for (const side of [-.5, .5]) for (const y of [0, 2.1]) {
      const actual = project({ x: unit.x + right.x * side, y, z: unit.z + right.z * side }, view, width, height);
      assert.ok(actual.x >= 24 && actual.x <= width - 24);
      assert.ok(actual.y >= 38 && actual.y <= height - 42);
    }
  }
});

test('distant reinforcements and dead units cannot pull the camera off the current clash or shrink fighters', () => {
  const allies = [{ x: -.4, z: 2, hp: 90 }, { x: .4, z: 2, hp: 90 }];
  const enemies = [{ x: 0, z: 2.9, hp: 60 }];
  const dead = [{ x: -1000000, z: 1000000, hp: 0 }, { x: 1000000, z: -1000000, hp: -5 }];
  const arriving = [{ x: -6, z: 6, hp: 60 }, { x: 6, z: 6, hp: 60 }, { x: 0, z: 40, hp: 60 }];
  for (const { width, height } of screens) {
    const baseline = battleCamera(width, height, allies, enemies);
    assert.deepEqual(battleCamera(width, height, [...dead, ...allies], [...dead, ...enemies]), baseline);
    assert.deepEqual(battleCamera(width, height, allies, [...enemies, ...arriving]), baseline);
    assert.deepEqual(battleCamera(width, height, [...allies, { x: NaN, z: 0, hp: 1 }], enemies), baseline);
  }
});

test('combat focus follows a moving front and the busiest clash instead of idle back lines', () => {
  const allies = [{ x: -1, z: 0, hp: 90 }, { x: 0, z: 0, hp: 90 }, { x: 1, z: 0, hp: 90 }];
  const enemies = allies.map((unit) => ({ ...unit, z: 1, hp: 60 }));
  const first = battleCamera(320, 338, allies, enemies);
  const moved = battleCamera(320, 338, allies.map((unit) => ({ ...unit, x: unit.x + 3, z: unit.z - 2 })), enemies.map((unit) => ({ ...unit, x: unit.x + 3, z: unit.z - 2 })));
  assert.ok(Math.abs(moved.focus.x - first.focus.x - 3) < 1e-10);
  assert.ok(Math.abs(moved.focus.z - first.focus.z + 2) < 1e-10);
  assert.deepEqual(moved.framing, first.framing);
  const busy = battleCamera(320, 338, [...allies, { x: 6, z: 0, hp: 90 }], [...enemies, { x: 6, z: 1, hp: 60 }]);
  assert.ok(Math.hypot(busy.focus.x, busy.focus.z - .5) < .3);
});

test('recent ranged strikes can shift focus to a real exchange before two front lines touch', () => {
  const allies = [{ x: -3, z: 0, hp: 60, range: 4.2, attackAt: 10 }, { x: 3, z: 0, hp: 90 }];
  const enemies = [{ x: -3, z: 4, hp: 60 }, { x: 3, z: 2.7, hp: 60 }];
  const approaching = battleCamera(390, 585, allies, enemies, 12);
  const firing = battleCamera(390, 585, allies, enemies, 10.1);
  assert.ok(firing.focus.x < approaching.focus.x - 1);
  assert.ok(firing.focus.x < -2.5 && firing.focus.z > 1.5);
  assert.deepEqual(firing.framing, approaching.framing);
});

test('a defeated side and empty result preserve the last combat view and return finite framing', () => {
  const previous = { x: 3, z: -1, span: 10, focusY: .85 };
  for (const [allies, enemies] of [[[], []], [[{ x: -6, z: -4, hp: 1 }], []], [[], [{ x: 6, z: 6, hp: 1 }]]]) {
    const target = battleCamera(320, 338, allies, enemies, 0, previous);
    assert.deepEqual(target.focus, { x: previous.x, z: previous.z });
    assert.ok(Number.isFinite(target.framing.span) && target.framing.span > 0);
    assert.deepEqual(battleCamera(320, 338, allies, enemies).focus, { x: 0, z: 2.5 });
  }
});

test('viewport and result HUD resizing preserve the last battlefield position even when projection snaps', () => {
  const target = battleCamera(320, 338, [{ x: 3, z: 4, hp: 90 }], [{ x: 3.5, z: 5, hp: 60 }]);
  const previous = followBattleCamera(null, target.focus, target.framing, 0);
  for (const { width, height } of [{ width: 320, height: 359 }, { width: 390, height: 585 }, { width: 900, height: 560 }]) {
    const result = battleCamera(width, height, [{ x: -5, z: -4, hp: 90 }], [], 30, previous);
    const resized = followBattleCamera(previous, result.focus, result.framing, 0, true);
    assert.equal(resized.x, previous.x);
    assert.equal(resized.z, previous.z);
    assert.equal(resized.span, result.framing.span);
  }
});

test('combat target changes ease without blink snapping and camera zoom never pumps with casualty count', () => {
  const allies = [{ x: 0, z: 0, hp: 90 }], enemies = [{ x: 0, z: 1, hp: 60 }];
  const target = battleCamera(320, 338, allies, enemies);
  let view = followBattleCamera(null, target.focus, target.framing, 0);
  const shifted = { x: 5, z: -3 };
  const next = followBattleCamera(view, shifted, target.framing, 1 / 60);
  assert.ok(Math.hypot(next.x - view.x, next.z - view.z) <= 5 / 60 + 1e-10);
  assert.notEqual(next.x, shifted.x);
  for (let frame = 0; frame < 120; frame++) view = followBattleCamera(view, shifted, target.framing, 1 / 60);
  assert.ok(Math.hypot(view.x - shifted.x, view.z - shifted.z) < .16);
  assert.equal(view.span, target.framing.span);
  const explicit = followBattleCamera(view, shifted, target.framing, 0, true);
  assert.deepEqual({ x: explicit.x, z: explicit.z }, shifted);
});

test('thirty and sixty hertz combat tracking keep a moving front visible with equivalent response', () => {
  function trace(hz) {
    const target = battleCamera(320, 338, [{ x: 0, z: 0, hp: 90 }], [{ x: 0, z: 1, hp: 60 }]);
    let view = followBattleCamera(null, target.focus, target.framing, 0);
    for (let frame = 1; frame <= hz * 3; frame++) {
      const time = frame / hz, focus = { x: time * 1.2, z: .5 - time * 1.5 };
      view = followBattleCamera(view, focus, target.framing, 1 / hz);
      const center = project({ ...focus, y: .85 }, view, 320, 338);
      assert.ok(center.x >= 80 && center.x <= 240 && center.y >= 80 && center.y <= 258);
    }
    return view;
  }
  const slow = trace(30), fast = trace(60);
  assert.ok(Math.hypot(slow.x - fast.x, slow.z - fast.z) < .04);
  assert.ok(Math.hypot(fast.x - 3.6, fast.z + 4) < .55);
});
