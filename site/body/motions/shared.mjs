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

const SOFT = /ligament|capsule|membrane|bursa|tendon|retinaculum|aponeurosis|dura|disk|disc|cartilage/i;
export const isBone = part => part.layer === 'skeleton' && !SOFT.test(part.name);
/* A joint. Everything beyond it turns about a pivot: a bone whole (by `bones`, the share of the turn a bone takes: all
   of it beyond the joint and none before it, unless told otherwise), and what crosses the joint (muscle, tendon, nerve,
   vessel) bent across a band `width` cm either side of the pivot along `along`, the direction of the limb. What moves is
   the close-up's own parts and, of its faint context, the bones of the same limb (`limb`) and whatever soft lies
   along the limb past the joint (the long tendons that cross an ankle), so that nothing is left behind as a ghost:
   never the trunk beside it. */
const BESIDE = 8;   // cm from the line of the limb: nearer than this, a soft part of the context belongs to the limb
export const ARM = /humerus|radius$|ulna$|scaphoid|lunate|triquetr|pisiform|trapezi|trapezoid|capitate|hamate|metacarpal|phalanx of .*(finger|thumb)|sesamoid/i;
export const LEG = /femur|patella|tibia$|fibula$|talus|calcaneus|navicular|cuboid|cuneiform|metatarsal|phalanx of .*toe|sesamoid/i;
export function joint(kit, { pivot, along, width = 4, bones, limb }) {
  const reach = part => [0, 1, 2, 3, 4, 5, 6, 7].map(corner => kit.V(part[corner & 1 ? 'max' : 'min'][0], part[corner & 2 ? 'max' : 'min'][1], part[corner & 4 ? 'max' : 'min'][2]).sub(pivot).dot(along));
  const movers = [];
  const side = Math.sign(pivot.x);
  const aside = part => { const from = kit.V(...part.centre).sub(pivot); return from.addScaledVector(along, -from.dot(along)).length(); };
  const ofLimb = other => Math.sign(other.centre[0]) === side && (isBone(other) ? limb.test(other.name) : aside(other) < BESIDE && Math.max(...reach(other)) > 0);
  for (const part of [...kit.own, ...kit.context.filter(ofLimb)]) {
    if (Math.max(...reach(part)) < -width) continue;   // wholly before the joint
    if (isBone(part)) { const share = bones ? bones(part) : kit.V(...part.centre).sub(pivot).dot(along) > 0 ? 1 : 0; if (share) movers.push({ part, share }); }
    else movers.push({ part });
  }
  /* the bones and ligaments of the other kind of limb that the close-up happens to catch a piece of (a hand beside the hip, the hip joint beside an elbow) are not shown: cut off as they are, they read as stray fragments */
  const other = limb === ARM ? /femur|patella|tibia$|fibula$|hip|sacr|coccyx|pub(o|ic)|triradiate|frenula|obturator/i : new RegExp(`${ARM.source}|elbow|shoulder`, 'i');
  return { turn: kit.turn, pivot, along, width, movers, apart: kit.context.filter(part => part.layer === 'skeleton' && other.test(part.name)) };
}
export function flex(act, { turn: turnBy, pivot, along, width, movers, apart }, axis, degrees) {
  const turn = turnBy(axis, degrees);
  for (const part of apart) act.fade(part, 0);
  for (const { part, share } of movers) {
    if (share === undefined) act.bend(part, { pivot, turn, along, from: -width, to: width });
    else act.rigid(part, { pivot, turn: share === 1 ? turn : turnBy(axis, degrees * share) });
  }
}
/* lit while something happens: a share of full glow for each of some parts */
export const light = (act, parts, amount) => { if (amount > 0.01) for (const part of parts) act.glow(part, amount); };
