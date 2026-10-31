// Screen-space movement from the first pressed pointer. The origin stays at
// the actual press even beside an edge; presentation never changes direction.
export function bindFloatingStick(surface, {
  signal,
  windowTarget = surface.ownerDocument?.defaultView || surface,
  canStart = () => true,
  isShortcut = () => false,
  onChange = () => {},
  onTap = () => {},
  onStop = () => {},
  radius = 44,
  deadzone = 8,
  dragThreshold = 8,
  now = () => globalThis.performance?.now() ?? Date.now(),
} = {}) {
  const listeners = new AbortController();
  let gesture = null, suppressedClick = null, destroyed = false;
  let state = { active: false, pointerId: null, originX: 0, originY: 0, knobX: 0, knobY: 0, x: 0, y: 0, dragging: false };
  radius = Math.max(1, Number(radius) || 44);
  deadzone = Math.max(0, Math.min(radius - .001, Number(deadzone) || 0));
  dragThreshold = Math.max(0, Number(dragThreshold) || 0);

  function emit(next) { state = next; onChange({ ...state }); }
  function suppress(ended) {
    suppressedClick = { pointerId: ended.id, x: ended.lastX, y: ended.lastY, until: now() + 650 };
  }
  function finish(reason, event) {
    if (!gesture) return;
    const ended = gesture; gesture = null;
    if (ended.dragging || reason !== 'up') suppress(ended);
    // Clear ownership before release: lostpointercapture can fire immediately.
    try { if (surface.hasPointerCapture?.(ended.id)) surface.releasePointerCapture(ended.id); } catch { /* A browser may already have released it. */ }
    emit({ ...state, active: false, pointerId: null, knobX: 0, knobY: 0, x: 0, y: 0, dragging: false });
    onStop({ reason, pointerId: ended.id, dragging: ended.dragging });
    if (reason === 'up' && !ended.dragging && !ended.shortcut) onTap(event);
  }
  function reset(reason = 'reset') { finish(reason); }
  function down(event) {
    if (destroyed || gesture || event.isPrimary === false || event.button !== 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !canStart(event)) return;
    suppressedClick = null;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, dragging: false, shortcut: Boolean(isShortcut(event)) };
    if (!gesture.shortcut) event.preventDefault();
    emit({ active: true, pointerId: gesture.id, originX: gesture.x, originY: gesture.y, knobX: 0, knobY: 0, x: 0, y: 0, dragging: false });
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!canStart(event)) { reset('blocked'); return; }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    gesture.lastX = event.clientX; gesture.lastY = event.clientY;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y, length = Math.hypot(dx, dy);
    if (!gesture.dragging && length >= dragThreshold) {
      gesture.dragging = true;
      // Capture only a real drag. Capturing a button's short press to its parent
      // would retarget the eventual click and break work/cash/upgrade shortcuts.
      try { surface.setPointerCapture?.(gesture.id); } catch { /* Window listeners still receive the release. */ }
    }
    if (gesture.dragging) event.preventDefault();
    const magnitude = gesture.dragging && length > deadzone ? Math.min(1, (length - deadzone) / (radius - deadzone)) : 0;
    const unitX = length ? dx / length : 0, unitY = length ? dy / length : 0;
    emit({ active: true, pointerId: gesture.id, originX: gesture.x, originY: gesture.y,
      knobX: unitX * Math.min(radius, length), knobY: unitY * Math.min(radius, length),
      x: unitX * magnitude, y: unitY * magnitude, dragging: gesture.dragging });
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    // Include a final position even when a browser coalesces the last move.
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) move(event);
    if (!gesture) return;
    if (gesture.dragging) event.preventDefault();
    finish('up', event);
  }
  function cancel(event) { if (gesture && event.pointerId === gesture.id) finish('cancel', event); }
  function lost(event) {
    // Touch/pen implicitly capture to the pressed canvas or button. Moving that
    // capture to the world emits a bubbling loss on the old child, which must
    // not cancel the gesture that just acquired capture on this surface.
    if (event.target === surface && gesture && event.pointerId === gesture.id) finish('capture-lost', event);
  }
  function click(event) {
    if (!suppressedClick) return;
    if (now() > suppressedClick.until) { suppressedClick = null; return; }
    // Keyboard activation and .click() stay usable. Modern PointerEvent clicks
    // retain the pointer ID; older compatibility MouseEvents use coordinates.
    if (event.detail === 0) return;
    const samePointer = Number.isFinite(event.pointerId) && event.pointerId === suppressedClick.pointerId;
    const compatibilityClick = !Number.isFinite(event.pointerId)
      && Math.hypot(event.clientX - suppressedClick.x, event.clientY - suppressedClick.y) <= 28;
    if (!samePointer && !compatibilityClick) return;
    suppressedClick = null;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function listen(target, type, handler) { target.addEventListener(type, handler, { capture: true, passive: false, signal: listeners.signal }); }
  function destroy() {
    if (destroyed) return;
    reset('destroy'); destroyed = true; listeners.abort();
    signal?.removeEventListener('abort', destroy);
  }
  listen(surface, 'pointerdown', down);
  listen(windowTarget, 'pointermove', move); listen(windowTarget, 'pointerup', up); listen(windowTarget, 'pointercancel', cancel);
  listen(surface, 'lostpointercapture', lost); listen(surface, 'click', click);
  listen(windowTarget, 'blur', () => reset('blur'));
  if (signal?.aborted) destroy(); else signal?.addEventListener('abort', destroy, { once: true });
  return { reset, destroy, get state() { return { ...state }; } };
}
