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
/* The line down the middle of a long thin tube that runs back beside itself (a deferent duct), from the end nearest a
   point: each of its points is given its distance from that end along the tube, going only from a point to others within
   `link` cm, and the middle is taken of each `stride` cm of that distance. Where the tube is drawn with a break in it,
   the way goes on across the break at its narrowest. */
export function thread(points, from, link = 0.5, stride = 0.8) {
  const far = points.map(() => Infinity), done = points.map(() => false);
  far[points.reduce((best, point, k) => (point.distanceTo(from) < points[best].distanceTo(from) ? k : best), 0)] = 0;
  for (;;) {
    let at = -1;
    for (let k = 0; k < points.length; k++) if (!done[k] && far[k] < Infinity && (at < 0 || far[k] < far[at])) at = k;
    if (at < 0) {
      let least = Infinity, across = null;
      for (let k = 0; k < points.length; k++) if (!done[k]) for (let j = 0; j < points.length; j++) if (done[j]) { const gap = points[k].distanceTo(points[j]); if (gap < least) { least = gap; across = [k, j]; } }
      if (!across) break;
      far[across[0]] = far[across[1]] + least; at = across[0];
    }
    done[at] = true;
    for (let k = 0; k < points.length; k++) { if (done[k]) continue; const gap = points[at].distanceTo(points[k]); if (gap < link && far[at] + gap < far[k]) far[k] = far[at] + gap; }
  }
  const stretches = [];
  points.forEach((point, k) => (stretches[Math.floor(far[k] / stride)] ||= []).push(point));
  return stretches.filter(Boolean).map(stretch => stretch.reduce((sum, point) => sum.add(point), stretch[0].clone().setScalar(0)).divideScalar(stretch.length));
}
export const SPENT = '#2f6fe0', FRESH = '#e23a2e', AIR = '#9fd8ff', FOOD = '#f0b35a', URINE = '#f2d24b', BILE = '#9ccc3c', LYMPH = '#c9f0a0', SIGNAL = '#ffc94a', SEED = '#f4f0dc', JUICE = '#e9d9a6';

/* lit while something happens: a share of full glow for each of some parts */
export const light = (act, parts, amount) => { if (amount > 0.01) for (const part of parts) act.glow(part, amount); };
