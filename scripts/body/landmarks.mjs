// A body's landmarks, read from its bones (the names are the built body's part names), and the fit of its hands and
// feet, joint by joint, onto MakeHuman's.
import { thinPlateSpline, fitSimilarity, applyAffine } from './fit.mjs';

/* named(layer, name, { optional }): the positions of a structure of the body */
export function landmarks(named) {
  const out = {};
  for (const [side, word] of [['L', 'Left'], ['R', 'Right']]) {
    const lower = word.toLowerCase();
    const humerus = named('skeleton', `${word} humerus`), femur = named('skeleton', `${word} femur`), tibia = named('skeleton', `${word} tibia`);
    const top = highest(humerus);
    out['shoulder' + side] = [top[0], top[1] - 2.5, top[2]];
    out['elbow' + side] = endAwayFrom(humerus, top, 2.5);
    const forearm = [...named('skeleton', `${word} radius`), ...named('skeleton', `${word} ulna`)];
    out['wrist' + side] = endAwayFrom(forearm, out['elbow' + side], 2);
    out['fingertip' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} middle finger`), out['wrist' + side]);
    out['thumb' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} thumb`), out['wrist' + side]);
    const head = highest(femur);
    out['hip' + side] = [head[0], head[1] - 2.3, head[2]];
    const kneeTop = endAwayFrom(femur, head, 2), kneeBottom = endAwayFrom(tibia, kneeTop, 2, true);
    out['knee' + side] = kneeTop.map((value, c) => (value + kneeBottom[c]) / 2);
    out['ankle' + side] = centre(named('skeleton', `${word} talus`));
    const heads = ['first', 'second', 'third', 'fourth', 'fifth'].map(n => endAwayFrom(named('skeleton', `${word} ${n} metatarsal bone`), out['ankle' + side], 1));
    out['toe' + side] = centre(heads.flat());
    out['eye' + side] = centre(named('organs', `${word} sclera`));
    out['indexTip' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} index finger`), out['wrist' + side]);
    out['littleTip' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} little finger`), out['wrist' + side]);
    out['bigToeTip' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} big toe`), out['ankle' + side]);
    out['littleToeTip' + side] = farthest(named('skeleton', `Distal phalanx of ${lower} little toe`), out['ankle' + side]);
    /* the back of the heel bone */
    const calcaneus = named('skeleton', `${word} calcaneus`);
    let heel = null;
    for (let k = 0; k < calcaneus.length; k += 3) if (!heel || calcaneus[k + 2] < heel[2]) heel = [calcaneus[k], calcaneus[k + 1], calcaneus[k + 2]];
    out['heel' + side] = heel;
  }
  /* the back and sides of the skull, a little above the eyes */
  {
    const skull = ['Occipital bone', 'Left parietal bone', 'Right parietal bone', 'Left temporal bone', 'Right temporal bone', 'Frontal bone'].flatMap(name => [...named('skeleton', name)]);
    const level = (out.eyeL[1] + out.eyeR[1]) / 2 + 3;
    let back = null, left = null, right = null;
    for (let k = 0; k < skull.length; k += 3) {
      const x = skull[k], y = skull[k + 1], z = skull[k + 2];
      if (Math.abs(y - level) > 1) continue;
      if (Math.abs(x) < 2 && (!back || z < back[2])) back = [x, y, z];
      if (!left || x > left[0]) left = [x, y, z];
      if (!right || x < right[0]) right = [x, y, z];
    }
    out.headBack = back; out.headL = left; out.headR = right;
  }
  for (const [side, word] of [['L', 'Left'], ['R', 'Right']]) {
    /* where the collarbone meets the breastbone: its end nearest the manubrium */
    const manubrium = centre(named('skeleton', 'Manubrium'));
    out['collar' + side] = endAwayFrom(named('skeleton', `${word} clavicle`), manubrium, 1.5, true);
  }
  /* the back: the tip of each vertebra's spinous process, from the lowest lumbar vertebra up to the seventh cervical */
  const VERTEBRAE = [...['Sixth', 'Fifth', 'Fourth', 'Third', 'Second', 'First'].map(n => `${n} lumbar vertebra`),
    ...['Twelfth', 'Eleventh', 'Tenth', 'Ninth', 'Eighth', 'Seventh', 'Sixth', 'Fifth', 'Fourth', 'Third', 'Second', 'First'].map(n => `${n} thoracic vertebra`),
    'Seventh cervical vertebra'];
  out.back = [];
  for (const name of VERTEBRAE) {
    const points = named('skeleton', name, { optional: true });
    if (!points) continue;   // she may have five lumbar vertebrae or six
    let tip = null;
    for (let k = 0; k < points.length; k += 3) if (!tip || points[k + 2] < tip[2]) tip = [0, points[k + 1], points[k + 2]];
    out.back.push(tip);
  }
  out.back.sort((a, b) => a[1] - b[1]);
  /* the front of the breastbone, in 1 cm bands of height */
  {
    const sternum = ['Manubrium', 'Body of sternum', 'Xiphoid process', 'Sternum'].map(name => named('skeleton', name, { optional: true })).filter(Boolean);
    if (!sternum.length) throw new Error('no breastbone');
    const bands = new Map();
    for (const points of sternum) for (let k = 0; k < points.length; k += 3) {
      if (Math.abs(points[k]) > 2) continue;
      const key = Math.round(points[k + 1]);
      if (!bands.has(key) || points[k + 2] > bands.get(key)[2]) bands.set(key, [0, points[k + 1], points[k + 2]]);
    }
    out.front = [...bands.values()].sort((a, b) => a[1] - b[1]);
  }
  out.pelvis = out.hipL.map((value, c) => (value + out.hipR[c]) / 2);
  out.neck = centre(named('skeleton', 'Seventh cervical vertebra'));
  out.crown = highest([...named('skeleton', 'Left parietal bone'), ...named('skeleton', 'Right parietal bone')]);
  /* the chin: the point of the jawbone furthest forward and down, near the middle */
  const mandible = named('skeleton', 'Mandible');
  let chin = null;
  for (let k = 0; k < mandible.length; k += 3) if (Math.abs(mandible[k]) < 3 && (!chin || mandible[k + 2] - 0.6 * mandible[k + 1] > chin[2] - 0.6 * chin[1])) chin = [mandible[k], mandible[k + 1], mandible[k + 2]];
  out.chin = chin;
  return out;
}

/* the hands and feet, joint by joint: [the bone's end, MakeHuman's joint as placed, 'handL' | 'footR' ...] */
export function handAndFootPairs(named, target, bones, marks, place) {
  const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'], FINGER = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
  const TOE = ['big toe', 'second toe', 'third toe', 'fourth toe', 'little toe'];
  const pairs = [];
  for (const [side, word] of [['L', 'Left'], ['R', 'Right']]) {
    const lower = word.toLowerCase();
    const bone = name => named('skeleton', name);
    const ends = (name, toward) => [endAwayFrom(bone(name), toward, 0.6, true), endAwayFrom(bone(name), toward, 0.6)];   // [near end, far end]
    const mh = (name, end = 'head') => place(`${name}.${side}`, bones[`${name}.${side}`][end]);
    const wrist = target['wrist' + side], ankle = target['ankle' + side];
    const start = pairs.length;
    pairs.push([wrist, mh('wrist')]);
    const thumb = [`${word} first metacarpal bone`, `Proximal phalanx of ${lower} thumb`, `Distal phalanx of ${lower} thumb`];
    thumb.forEach((name, k) => pairs.push([ends(name, wrist)[0], mh(`finger1-${k + 1}`)]));
    pairs.push([ends(thumb[2], wrist)[1], mh('finger1-3', 'tail')]);
    for (let n = 2; n <= 5; n++) {
      pairs.push([ends(`${word} ${ORDINAL[n - 1]} metacarpal bone`, wrist)[0], mh(`metacarpal${n - 1}`)]);
      const chain = ['Proximal', 'Middle', 'Distal'].map(level => `${level} phalanx of ${lower} ${FINGER[n - 1]}`);
      chain.forEach((name, k) => pairs.push([ends(name, wrist)[0], mh(`finger${n}-${k + 1}`)]));
      pairs.push([ends(chain[2], wrist)[1], mh(`finger${n}-3`, 'tail')]);
    }
    for (let k = start; k < pairs.length; k++) pairs[k].push('hand' + side);
    const footStart = pairs.length;
    pairs.push([ankle, mh('foot')], [target['heel' + side], place(`foot.${side}`, marks['heel' + side])]);
    const big = [`Proximal phalanx of ${lower} big toe`, `Distal phalanx of ${lower} big toe`];
    big.forEach((name, k) => pairs.push([ends(name, ankle)[0], mh(`toe1-${k + 1}`)]));
    pairs.push([ends(big[1], ankle)[1], mh('toe1-2', 'tail')]);
    /* A lesser toe's base and tip go onto MakeHuman's; the two joints between fall along its toe as far along as they
       are along the bones'. MakeHuman's own joints there cut the toe in three near-equal lengths, which a toe is not
       (its first bone is over half of it): matched joint to joint, the first bone came out half its length and the
       last half as long again. */
    for (let n = 2; n <= 5; n++) {
      const chain = ['Proximal', 'Middle', 'Distal'].map(level => `${level} phalanx of ${lower} ${TOE[n - 1]}`);
      const joints = [...chain.map(name => ends(name, ankle)[0]), ends(chain[2], ankle)[1]];
      const toe = [1, 2, 3].map(k => mh(`toe${n}-${k}`)).concat([mh(`toe${n}-3`, 'tail')]);
      joints.forEach((joint, k) => pairs.push([joint, asFarAlong(joints, k, toe)]));
    }
    for (let k = footStart; k < pairs.length; k++) pairs[k].push('foot' + side);
  }
  return pairs;
}
/* The joints of a hand or a foot lie nearly in one plane, so pairs of joints alone say nothing about its thickness, and
   a deformation through them is free to flatten the bones. Each limb's pairs are given depth: the best turn, even
   scale and shift taking its joints onto MakeHuman's is found, and every joint is paired again a little above and
   below the plane of the joints, moved as that rigid fit moves it. Returns the pairs with those added. */
export function withDepth(pairs, reach = 1.5) {
  const limbs = Map.groupBy(pairs, pair => pair[2]), out = [...pairs];
  for (const [limb, list] of limbs) {
    const from = list.flatMap(pair => pair[0]), fit = fitSimilarity(from, list.flatMap(pair => pair[1]));
    const turned = d => { const a = applyAffine(fit, 0, 0, 0), b = applyAffine(fit, ...d); return b.map((value, c) => value - a[c]); };
    /* the plane's normal: the direction in which the joints are spread least (across the two in which they are spread most) */
    const mean = [0, 1, 2].map(c => list.reduce((sum, pair) => sum + pair[0][c], 0) / list.length);
    const C = [0, 1, 2].map(i => [0, 1, 2].map(j => list.reduce((sum, pair) => sum + (pair[0][i] - mean[i]) * (pair[0][j] - mean[j]), 0)));
    const main = M => { let v = [0.5, 0.3, 0.8]; for (let k = 0; k < 80; k++) v = unit3([0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2])); return v; };
    const first = main(C), weight = first.reduce((sum, value, i) => sum + value * [0, 1, 2].reduce((t, j) => t + C[i][j] * first[j], 0), 0);
    const second = main(C.map((row, i) => row.map((value, j) => value - weight * first[i] * first[j])));
    const normal = unit3([first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]]);
    for (const [a, b] of list) for (const sign of [1, -1]) {
      const step = normal.map(value => sign * reach * value), moved = turned(step);
      out.push([a.map((value, c) => value + step[c]), b.map((value, c) => value + moved[c]), limb]);
    }
  }
  return out;
}
/* Each hand and foot: an exact thin-plate spline from its bones' ends (as they lie now) to MakeHuman's joints, held
   still by points on the forearm or shin bones a few centimetres back; applied in full from the wrist (ankle) out and
   faded to nothing over the 4 cm before it. */
export function fitHandsAndFeet(structures, named, target, bones, marks, place) {
  const groups = new Map();
  for (const [a, b, limb] of withDepth(handAndFootPairs(named, target, bones, marks, place))) (groups.get(limb) || groups.set(limb, []).get(limb)).push([a, b]);
  const report = [];
  for (const [limb, pairs] of groups) {
    const side = limb.at(-1), word = side === 'L' ? 'Left' : 'Right', hand = limb.startsWith('hand');
    const joint = target[(hand ? 'wrist' : 'ankle') + side];
    /* which way is out: from the wrist to the fingertip, or down from the ankle */
    const out = hand ? unit3(sub3(target['fingertip' + side], joint)) : [0, -1, 0];
    const along = p => (p[0] - joint[0]) * out[0] + (p[1] - joint[1]) * out[1] + (p[2] - joint[2]) * out[2];
    const from = [], to = [];
    for (const [a, b] of pairs) { from.push(...a); to.push(...b); }
    for (const name of hand ? [`${word} radius`, `${word} ulna`] : [`${word} tibia`, `${word} fibula`]) {
      const p = named('skeleton', name);
      for (let k = 0; k < p.length; k += 3 * 7) { const point = [p[k], p[k + 1], p[k + 2]], t = along(point); if (t < -5 && t > -12) { from.push(...point); to.push(...point); } }
    }
    const spline = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 0.01);
    let most = 0;
    for (const structure of structures) {
      const p = structure.positions;
      for (let k = 0; k < p.length; k += 3) {
        const point = [p[k], p[k + 1], p[k + 2]], w = smoothstep(-4, 0, along(point));
        if (!w || distance(point, joint) > 30) continue;
        const q = spline(...point);
        for (let c = 0; c < 3; c++) p[k + c] += w * (q[c] - point[c]);
        most = Math.max(most, w * distance(q, point));
      }
    }
    report.push(`${limb} ${most.toFixed(1)} cm`);
  }
  return report.join(', ');
}
/* the point as far along one line of points, by its share of the line's length, as point k is along another */
function asFarAlong(line, k, other) {
  const lengths = points => points.slice(1).map((point, i) => distance(point, points[i])), total = list => list.reduce((sum, value) => sum + value, 0);
  const mine = lengths(line), theirs = lengths(other);
  let left = total(mine.slice(0, k)) / total(mine) * total(theirs);
  for (let i = 0; i < theirs.length; i++) {
    if (left <= theirs[i] || i === theirs.length - 1) return other[i].map((value, c) => value + (other[i + 1][c] - value) * left / theirs[i]);
    left -= theirs[i];
  }
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit3 = a => { const length = Math.hypot(...a); return a.map(value => value / length); };
const smoothstep = (edge0, edge1, x) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function centre(points) { const sum = [0, 0, 0]; for (let k = 0; k < points.length; k++) sum[k % 3] += points[k]; return sum.map(value => value / (points.length / 3)); }
function highest(points) { let best = null; for (let k = 0; k < points.length; k += 3) if (!best || points[k + 1] > best[1]) best = [points[k], points[k + 1], points[k + 2]]; return best; }
function farthest(points, from) { let best = null, most = -1; for (let k = 0; k < points.length; k += 3) { const d = distance([points[k], points[k + 1], points[k + 2]], from); if (d > most) { most = d; best = [points[k], points[k + 1], points[k + 2]]; } } return best; }
/* the middle of a bone's end away from a point (or nearest it): the points within reach of that extreme */
function endAwayFrom(points, from, reach, nearest = false) {
  const d = k => distance([points[k], points[k + 1], points[k + 2]], from);
  let extreme = nearest ? Infinity : -Infinity;
  for (let k = 0; k < points.length; k += 3) extreme = nearest ? Math.min(extreme, d(k)) : Math.max(extreme, d(k));
  const out = [];
  for (let k = 0; k < points.length; k += 3) if (Math.abs(d(k) - extreme) < reach) out.push(points[k], points[k + 1], points[k + 2]);
  return centre(out);
}

