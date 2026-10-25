// Shared continuous terrain: s is game metres; height is world Y and slope is dY/dZ.
export const COURSE_WORLD_PER_METER = Math.PI * 2 * 23 / 360;

export function courseSample(s = 0) {
  const d = (Number.isFinite(s) ? s : 0) * COURSE_WORLD_PER_METER;
  return {
    height: -.06 * d - 4.5 * Math.sin(d / 30) + 1.4 * Math.sin(d / 67),
    slope: -.06 - .15 * Math.cos(d / 30) + 1.4 / 67 * Math.cos(d / 67),
  };
}
