// What the motions share: the shapes of movements in time, and the joint.
export const clamp = x => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/* 0 at the ends of the cycle, 1 in the middle */
export const swell = phase => 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
/* 1 between two moments, easing in and out over `edge` */
export const during = (phase, from, to, edge = 0.04) => smooth(from, from + edge, phase) * (1 - smooth(to - edge, to, phase));
/* points in the order of a walk from a start, each time to the nearest not yet visited */
export function chain(points, from) {
  const left = [...points], path = [];
  let at = from;
  while (left.length) { const next = left.reduce((best, point) => (point.distanceTo(at) < best.distanceTo(at) ? point : best)); path.push(next); left.splice(left.indexOf(next), 1); at = next; }
  return path;
}
export const SPENT = '#2f6fe0', FRESH = '#e23a2e', AIR = '#9fd8ff', FOOD = '#f0b35a', URINE = '#f2d24b', BILE = '#9ccc3c', LYMPH = '#c9f0a0', SIGNAL = '#ffc94a', SEED = '#f4f0dc';

/* lit while something happens: a share of full glow for each of some parts */
export const light = (act, parts, amount) => { if (amount > 0.01) for (const part of parts) act.glow(part, amount); };
