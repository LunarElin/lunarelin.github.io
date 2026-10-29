export const VIEWS = Object.freeze(['front', 'back', 'right', 'left']);
export const ACTION_TIMING = Object.freeze({ duration: .6, contactRatio: .55 });
const AXIS = { right: 0, front: Math.PI / 2, left: Math.PI, back: -Math.PI / 2 };
const HYSTERESIS = 10 * Math.PI / 180;

// These are the same 35-degree orthographic axes used to place the ground.
export function projectWorldVector(x, y) {
  return { x: (x - y) * Math.SQRT1_2, y: (x + y) * .40558 };
}

export function screenInputToWorld(x, y) {
  const wx = x / (2 * Math.SQRT1_2) + y / (2 * .40558);
  const wy = -x / (2 * Math.SQRT1_2) + y / (2 * .40558);
  const magnitude = Math.max(1, Math.hypot(wx, wy));
  return { x: wx / magnitude, y: wy / magnitude };
}

export function viewForScreenVector(x, y, previous = 'front') {
  if (!VIEWS.includes(previous)) previous = 'front';
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < .001) return previous;
  const angle = Math.atan2(y, x);
  const difference = Math.abs(Math.atan2(Math.sin(angle - AXIS[previous]), Math.cos(angle - AXIS[previous])));
  if (difference <= Math.PI / 4 + HYSTERESIS) return previous;
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
  return y >= 0 ? 'front' : 'back';
}

export function viewForWorldVector(x, y, previous = 'front') {
  const screen = projectWorldVector(x, y);
  return viewForScreenVector(screen.x, screen.y, previous);
}

export function actionWindow(rate, duration = ACTION_TIMING.duration) {
  return Math.min(duration, 1 / Math.max(.1, Number.isFinite(rate) ? rate : 1));
}

export function actionClock(elapsed, started, rate, duration = ACTION_TIMING.duration) {
  const window = actionWindow(rate, duration), age = Math.max(0, elapsed - started);
  return { active: age < window, phase: Math.min(1, age / window), seconds: Math.min(duration, age * duration / window), window };
}

export function createPoseMemory(view = 'front') {
  return { view, actionView: view, actionCount: 0 };
}

export function actorPose(worker, memory, elapsed, duration = ACTION_TIMING.duration) {
  const action = worker.id === 'squirrel' ? 'attack' : 'harvest';
  if (worker.actionCount > memory.actionCount) {
    memory.actionCount = worker.actionCount;
    memory.actionView = viewForWorldVector(worker.actionDX || 0, worker.actionDY || 0, memory.view);
  }
  const clock = actionClock(elapsed, worker.actionStartedAt || 0, worker.actionRate || worker.rate, duration);
  // Walking owns body facing. A stationary action keeps its original target facing through recovery.
  if (worker.moving) {
    memory.view = viewForWorldVector(worker.moveDX || 0, worker.moveDY || 0, memory.view);
    return { view: memory.view, action: 'run', clock };
  }
  if (worker.actionCount > 0 && !worker.actionCancelled && clock.active) {
    memory.view = memory.actionView;
    return { view: memory.actionView, action, clock };
  }
  return { view: memory.view, action: 'idle', clock };
}

export function frameAt(animation, seconds) {
  if (!animation?.frames?.length) return null;
  const frames = animation.frames, fallback = 1000 / (animation.fps || 10);
  const total = frames.reduce((sum, frame) => sum + (frame.duration_ms || fallback), 0);
  const time = Math.max(0, seconds * 1000);
  let remaining = animation.loop ? time % total : Math.min(total - .001, time);
  for (const frame of frames) {
    const duration = frame.duration_ms || fallback;
    if (remaining < duration) return frame;
    remaining -= duration;
  }
  return frames.at(-1);
}
