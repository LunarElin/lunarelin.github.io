import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFloatingStick } from '../floating-stick.mjs';

// EventTarget harness verifies event ownership and callback ordering. It is not
// a browser or physical-device touch test.
function fixture(options = {}) {
  const surface = new EventTarget(), windowTarget = new EventTarget(), captures = new Set();
  const changes = [], stops = [], taps = [];
  let clock = 0, allowed = true;
  surface.setPointerCapture = id => captures.add(id);
  surface.hasPointerCapture = id => captures.has(id);
  surface.releasePointerCapture = id => { captures.delete(id); fire(surface, 'lostpointercapture', { pointerId: id }); };
  const stick = bindFloatingStick(surface, {
    windowTarget, now: () => clock, canStart: () => allowed,
    isShortcut: event => event.shortcut,
    onChange: value => changes.push(value), onStop: value => stops.push(value), onTap: value => taps.push(value),
    ...options,
  });
  return { surface, windowTarget, stick, captures, changes, stops, taps,
    tick: value => { clock += value; }, allow: value => { allowed = value; } };
}
function fire(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 150, detail: 1, ...values })) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
}
const zero = state => { assert.equal(state.x, 0); assert.equal(state.y, 0); assert.equal(state.active, false); assert.equal(state.pointerId, null); };

test('presses place the stick at that exact screen location and a circular drag ramps after the deadzone', () => {
  const f = fixture();
  fire(f.surface, 'pointerdown', { clientX: 27, clientY: 431 });
  assert.deepEqual(f.stick.state, { active: true, pointerId: 1, originX: 27, originY: 431, knobX: 0, knobY: 0, x: 0, y: 0, dragging: false });
  assert.equal(f.captures.size, 0);
  fire(f.windowTarget, 'pointermove', { clientX: 31, clientY: 434 });
  assert.equal(f.stick.state.x, 0); assert.equal(f.stick.state.y, 0);
  fire(f.windowTarget, 'pointermove', { clientX: 53, clientY: 431 });
  assert.equal(f.stick.state.x, .5); assert.equal(f.stick.state.y, 0); assert.equal(f.captures.has(1), true);
  fire(f.windowTarget, 'pointermove', { clientX: 227, clientY: 631 });
  assert.ok(Math.abs(Math.hypot(f.stick.state.x, f.stick.state.y) - 1) < 1e-10);
  assert.ok(Math.abs(Math.hypot(f.stick.state.knobX, f.stick.state.knobY) - 44) < 1e-10);
  assert.equal(f.stick.state.originX, 27); assert.equal(f.stick.state.originY, 431);
  f.stick.destroy();
});

test('edge presses never move the movement origin or reverse the intended direction', () => {
  const f = fixture();
  for (const [x, y, dx, dy] of [[1, 1, 12, 0], [319, 567, -12, -12], [389, 843, 0, -12]]) {
    fire(f.surface, 'pointerdown', { clientX: x, clientY: y });
    fire(f.windowTarget, 'pointermove', { clientX: x + dx, clientY: y + dy });
    assert.equal(f.stick.state.originX, x); assert.equal(f.stick.state.originY, y);
    if (dx) assert.equal(Math.sign(f.stick.state.x), Math.sign(dx));
    if (dy) assert.equal(Math.sign(f.stick.state.y), Math.sign(dy));
    fire(f.windowTarget, 'pointerup', { clientX: x + dx, clientY: y + dy }); zero(f.stick.state);
  }
  f.stick.destroy();
});

test('the first pointer owns movement and other fingers cannot replace it or release it', () => {
  const f = fixture();
  fire(f.surface, 'pointerdown', { pointerId: 0 });
  fire(f.surface, 'pointerdown', { pointerId: 9, clientX: 200, isPrimary: false });
  fire(f.windowTarget, 'pointermove', { pointerId: 9, clientX: 250 });
  fire(f.windowTarget, 'pointerup', { pointerId: 9 });
  assert.equal(f.stick.state.pointerId, 0); assert.equal(f.stick.state.x, 0);
  fire(f.windowTarget, 'pointermove', { pointerId: 0, clientX: 144 });
  assert.equal(f.stick.state.x, 1);
  fire(f.windowTarget, 'pointerup', { pointerId: 0, clientX: 144 });
  zero(f.stick.state); assert.equal(f.stops.length, 1); assert.equal(f.captures.size, 0);
  f.stick.destroy();
});

test('implicit child capture transferring to the world keeps the drag, while loss on the world stops it', () => {
  const f = fixture(), child = new EventTarget();
  f.surface.setPointerCapture = id => {
    f.captures.add(id);
    // Simulate a canvas/button's lostpointercapture bubbling into its world.
    fire(f.surface, 'lostpointercapture', { pointerId: id, target: child });
  };
  fire(f.surface, 'pointerdown');
  fire(f.windowTarget, 'pointermove', { clientX: 144 });
  assert.equal(f.stick.state.active, true); assert.equal(f.stick.state.x, 1);
  assert.equal(f.captures.has(1), true); assert.equal(f.stops.length, 0);
  fire(f.surface, 'lostpointercapture');
  zero(f.stick.state); assert.equal(f.stops.length, 1); assert.equal(f.captures.size, 0);
  f.stick.destroy();
});

test('release, cancellation, capture loss, window blur and explicit menu reset all stop movement', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'menu']) {
    const f = fixture(); fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointermove', { clientX: 144 });
    if (ending === 'menu') f.stick.reset('menu');
    else fire(ending === 'lostpointercapture' ? f.surface : f.windowTarget, ending, { clientX: 144 });
    zero(f.stick.state); assert.equal(f.captures.size, 0); assert.equal(f.stops.length, 1, ending);
    fire(f.windowTarget, 'pointermove', { clientX: 220 }); zero(f.stick.state);
    f.stick.destroy();
  }
});

test('shortcut taps retain normal click activation while shortcut drags suppress the resulting click once', () => {
  const f = fixture();
  fire(f.surface, 'pointerdown', { shortcut: true });
  fire(f.windowTarget, 'pointerup');
  const tapClick = fire(f.surface, 'click');
  assert.equal(tapClick.defaultPrevented, false); assert.equal(f.taps.length, 0);
  fire(f.surface, 'pointerdown', { shortcut: true });
  fire(f.windowTarget, 'pointermove', { clientX: 150 });
  fire(f.windowTarget, 'pointerup', { clientX: 150 });
  const dragClick = fire(f.surface, 'click', { clientX: 150 });
  assert.equal(dragClick.defaultPrevented, true);
  assert.equal(fire(f.surface, 'click', { clientX: 150 }).defaultPrevented, false, 'one drag cannot suppress a later activation');
  assert.equal(f.taps.length, 0); f.stick.destroy();
});

test('returning a dragged finger to its origin does not turn the gesture into a shortcut tap', () => {
  const f = fixture(); fire(f.surface, 'pointerdown', { shortcut: true });
  fire(f.windowTarget, 'pointermove', { clientX: 144 });
  fire(f.windowTarget, 'pointermove'); fire(f.windowTarget, 'pointerup');
  assert.equal(fire(f.surface, 'click').defaultPrevented, true); assert.equal(f.taps.length, 0);
  f.stick.destroy();
});

test('a short ordinary tap is reported after stopping but never generates movement itself', () => {
  const sequence = [], f = fixture({ onStop: () => sequence.push('stop'), onTap: () => sequence.push('tap') });
  fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointerup');
  assert.deepEqual(sequence, ['stop', 'tap']); zero(f.stick.state);
  assert.ok(f.changes.every(state => state.x === 0 && state.y === 0));
  f.stick.destroy();
});

test('coalesced final movement cannot leak a button click, compatibility mouse clicks expire and keyboard clicks stay usable', () => {
  const f = fixture(); fire(f.surface, 'pointerdown', { shortcut: true });
  fire(f.windowTarget, 'pointerup', { clientX: 150 });
  assert.equal(f.stops[0].dragging, true);
  assert.equal(fire(f.surface, 'click', { detail: 0 }).defaultPrevented, false);
  assert.equal(fire(f.surface, 'click', { pointerId: undefined, clientX: 150 }).defaultPrevented, true);
  fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointermove', { clientX: 144 }); fire(f.windowTarget, 'pointerup', { clientX: 144 });
  f.tick(700);
  assert.equal(fire(f.surface, 'click', { clientX: 144 }).defaultPrevented, false);
  f.stick.destroy();
});

test('blocked input and aborted listeners stop an active pointer without reviving on later events', () => {
  const controller = new AbortController(), f = fixture({ signal: controller.signal });
  f.allow(false); fire(f.surface, 'pointerdown'); zero(f.stick.state);
  f.allow(true); fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointermove', { clientX: 144 });
  f.allow(false); fire(f.windowTarget, 'pointermove', { clientX: 160 }); zero(f.stick.state);
  f.allow(true); fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointermove', { clientX: 144 });
  controller.abort(); zero(f.stick.state); assert.equal(f.captures.size, 0);
  const count = f.changes.length; fire(f.surface, 'pointerdown'); fire(f.windowTarget, 'pointermove', { clientX: 200 });
  assert.equal(f.changes.length, count);
});
