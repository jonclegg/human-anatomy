// The MakeHuman base mesh (CC0) as a body outline: a slim young adult, shaped by MakeHuman's own morph targets, posed and
// sized to a skeleton in the model frame, then pushed out wherever a bone, muscle or organ would show through it.
// The files come from https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data:
// 3dobjs/base.obj, targets/macrodetails/*.target, rigs/default.mhskel and rigs/default_weights.mhw.
import { readFileSync } from 'node:fs';
import { PointGrid, fitSimilarity, fitAffine, applyAffine } from './fit.mjs';

/* ---------- Reading ---------- */

/**
 * folder: the MakeHuman files; targets: { name: weight } morph targets added to the base shape
 * Returns { positions (cm, +y up from the floor, +z front, +x the body's left), indices (the skin only),
 *   joints: { name: [x, y, z] }, bones: { name: { head, tail, parent } }, weights: { bone: [[vertex, weight]] } }
 */
export function readMakeHuman(folder, targets) {
  const vertices = [], triangles = [];
  let group = '';
  for (const line of readFileSync(`${folder}/base.obj`, 'utf8').split('\n')) {
    if (line.startsWith('v ')) vertices.push(line.split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith('g ')) group = line.slice(2).trim();
    else if (line.startsWith('f ') && group === 'body') {   // the skin, not the helper and joint geometry
      const corners = line.trim().split(/\s+/).slice(1).map(corner => parseInt(corner) - 1);
      for (let k = 1; k + 1 < corners.length; k++) triangles.push(corners[0], corners[k], corners[k + 1]);
    }
  }
  for (const [name, weight] of Object.entries(targets)) {
    for (const line of readFileSync(`${folder}/${name}.target`, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [index, x, y, z] = line.trim().split(/\s+/).map(Number);
      vertices[index][0] += weight * x; vertices[index][1] += weight * y; vertices[index][2] += weight * z;
    }
  }
  const skeleton = JSON.parse(readFileSync(`${folder}/default.mhskel`, 'utf8'));
  const weights = JSON.parse(readFileSync(`${folder}/default_weights.mhw`, 'utf8')).weights;
  /* decimetres to cm, standing on the floor */
  const floor = Math.min(...triangles.map(index => vertices[index][1]));
  const toModel = ([x, y, z]) => [x * 10, (y - floor) * 10, z * 10];
  const joints = {};
  for (const [name, members] of Object.entries(skeleton.joints)) {
    const sum = [0, 0, 0];
    for (const index of members) for (let c = 0; c < 3; c++) sum[c] += vertices[index][c];
    joints[name] = toModel(sum.map(value => value / members.length));
  }
  const bones = {};
  for (const [name, bone] of Object.entries(skeleton.bones)) bones[name] = { head: joints[bone.head], tail: joints[bone.tail], parent: bone.parent };
  /* only the skin's own vertices: the file also holds helper meshes (tights, a skirt, hair guides) around the body */
  const kept = new Int32Array(vertices.length).fill(-1);
  let count = 0;
  for (const index of triangles) if (kept[index] < 0) kept[index] = count++;
  const positions = new Float32Array(count * 3);
  vertices.forEach((vertex, k) => { if (kept[k] >= 0) positions.set(toModel(vertex), kept[k] * 3); });
  const skinWeights = {};
  for (const [bone, list] of Object.entries(weights)) {
    const mine = list.filter(([vertex]) => kept[vertex] >= 0).map(([vertex, weight]) => [kept[vertex], weight]);
    if (mine.length) skinWeights[bone] = mine;
  }
  return { positions, indices: Uint32Array.from(triangles, index => kept[index]), bones, weights: skinWeights, count };
}

/* ---------- Small vector helpers ---------- */
const sub = (a, b) => a.map((value, c) => value - b[c]);
const add = (a, b) => a.map((value, c) => value + b[c]);
const scale = (a, s) => a.map(value => value * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / (norm(a) || 1));
const apply = (M, p) => [0, 1, 2].map(r => M[r][0] * p[0] + M[r][1] * p[1] + M[r][2] * p[2]);
const multiply = (A, B) => [0, 1, 2].map(r => [0, 1, 2].map(c => A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c]));
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/* the smallest rotation taking direction a onto direction b (Rodrigues) */
function rotationBetween(a, b) {
  a = unit(a); b = unit(b);
  const axis = cross(a, b), sine = norm(axis), cosine = dot(a, b);
  if (sine < 1e-9) return IDENTITY;
  return rotationAbout(scale(axis, 1 / sine), Math.atan2(sine, cosine));
}
function rotationAbout(k, angle) {
  const s = Math.sin(angle), c = 1 - Math.cos(angle), K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const K2 = multiply(K, K);
  return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + s * K[i][j] + c * K2[i][j]));
}
/* stretch by factor along a unit direction, leaving the cross-section alone */
const stretchAlong = (direction, factor) => [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + (factor - 1) * direction[i] * direction[j]));

/* ---------- Posing ---------- */

/* The bones that start a segment posed as a whole; every other bone moves with the segment of its nearest such
   ancestor (the fingers with the hand, the jaw and eyes with the head), and the spine and pelvis with the trunk. */
const SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03'];
const SEGMENT_BONES = side => ({
  [`clavicle.${side}`]: `clavicle${side}`, [`shoulder01.${side}`]: `clavicle${side}`,
  [`upperarm01.${side}`]: `upperArm${side}`, [`upperarm02.${side}`]: `upperArm${side}`,
  [`lowerarm01.${side}`]: `foreArm${side}`, [`lowerarm02.${side}`]: `lowerForeArm${side}`, [`wrist.${side}`]: `hand${side}`,
  [`upperleg01.${side}`]: `thigh${side}`, [`upperleg02.${side}`]: `thigh${side}`,
  [`lowerleg01.${side}`]: `shin${side}`, [`lowerleg02.${side}`]: `lowerShin${side}`, [`foot.${side}`]: `foot${side}`,
});

/**
 * Poses a MakeHuman body onto a skeleton.
 * body: from readMakeHuman
 * target: landmarks in the model frame, each side L (the body's left) and R:
 *   shoulderL, elbowL, wristL, fingertipL, thumbL, hipL, kneeL, ankleL, toeL, collarL (where the collarbone meets the
 *   breastbone), and pelvis, neck, crown, chin, eyeL, eyeR, back: the tip of each vertebra's spinous process (the
 *   back-most point), from the lowest lumbar vertebra up to the seventh cervical, and front: the front of the breastbone
 *   along its length
 * Returns { positions, segment: each vertex's main segment name, place(bone, point): where a point moving with a bone goes,
 *   poseOther(body): the same pose given to another shape of the mesh,
 *   trunkMap, back: MakeHuman's back midline as placed on the trunk, before it is fitted to the skeleton's }.
 */
export function poseMakeHuman(body, target, log = console.log) {
  const { bones, weights, positions, count } = body;
  const source = landmarksOf(body);
  /* the trunk: turned, scaled and moved onto the shoulders, hips and neck, then widened or narrowed to the skeleton's
     shoulder and hip width and stretched to its torso length. Its depth keeps MakeHuman's proportions: the skeleton
     says little about how deep a slim body is. */
  const TRUNK = ['shoulderL', 'shoulderR', 'hipL', 'hipR', 'neck'];
  const turn = fitSimilarity(TRUNK.flatMap(name => source[name]), TRUNK.flatMap(name => target[name]));
  const turned = name => applyAffine(turn, ...source[name]);
  const width = (norm(sub(target.shoulderL, target.shoulderR)) / norm(sub(turned('shoulderL'), turned('shoulderR'))) + norm(sub(target.hipL, target.hipR)) / norm(sub(turned('hipL'), turned('hipR')))) / 2;
  const length = (target.neck[1] - target.pelvis[1]) / (turned('neck')[1] - turned('pelvis')[1]);
  const middle = target.pelvis;
  const trunkMap = p => { const q = applyAffine(turn, ...p); return [middle[0] + (q[0] - middle[0]) * width, middle[1] + (q[1] - middle[1]) * length, q[2]]; };
  log(`  trunk: ${(width * 100).toFixed(0)}% as wide, ${(length * 100).toFixed(0)}% as long`);
  /* the head: fitted as a whole to the eyes, crown, chin, back and sides of the skull, so it covers the skull */
  const HEAD = ['eyeL', 'eyeR', 'crown', 'chin', 'headBack', 'headL', 'headR'];
  const head = fitAffine(HEAD.flatMap(name => source[name]), HEAD.flatMap(name => target[name]));
  const headMap = p => applyAffine(head, ...p);
  log(`  head: ${HEAD.map(name => `${name} ${norm(sub(headMap(source[name]), target[name])).toFixed(1)}`).join(', ')} cm off`);
  /* The trunk's depth and curve, height by height. MakeHuman's back midline goes a set distance behind the tips of the
     skeleton's vertebrae, and, where there is a breastbone, its front midline goes a set distance in front of it: each
     height of the trunk is moved and stretched front to back (z' = a z + b) to fit. Below the breastbone only the back is
     fitted (a = 1). The skeleton may stand straighter or more curved than MakeHuman, and its chest may be deeper. The
     change fades out below the lowest lumbar vertebra, so the hips stay on the hip joints. */
  const BEHIND_TIPS = 1.5, BEFORE_STERNUM = 1.2;   // cm of skin and muscle over the spinous processes and the breastbone
  const spineZ = y => { const joints = [...SPINE.map(name => trunkMap(bones[name].head)), trunkMap(bones.head.head)].sort((a, b) => a[1] - b[1]);
    const k = joints.findIndex(joint => joint[1] >= y); return k <= 0 ? joints[Math.max(0, k)][2] : joints[k - 1][2] + (joints[k][2] - joints[k - 1][2]) * (y - joints[k - 1][1]) / (joints[k][1] - joints[k - 1][1]); };
  /* MakeHuman's midline, front and back, in 2 cm bands of height: its skin within 3 cm of the midline, in front of or
     behind its spine (so a sparse band of the coarse mesh cannot pick a point on the wrong side) */
  const front = new Map(), back = new Map();
  for (let v = 0; v < count; v++) {
    if (Math.abs(positions[3 * v]) > 3) continue;
    const q = trunkMap([positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]]), key = Math.round(q[1] / 2), middle = spineZ(q[1]);
    if (q[2] < middle - 1 && (!back.has(key) || q[2] < back.get(key)[2])) back.set(key, q);
    if (q[2] > middle + 1 && (!front.has(key) || q[2] > front.get(key)[2])) front.set(key, q);
  }
  const zAt = (points, y) => {
    if (y <= points[0][1]) return points[0][2];
    if (y >= points.at(-1)[1]) return points.at(-1)[2];
    const k = points.findIndex(point => point[1] >= y), t = (y - points[k - 1][1]) / (points[k][1] - points[k - 1][1]);
    return points[k - 1][2] + (points[k][2] - points[k - 1][2]) * t;
  };
  /* a running average over five neighbours, twice */
  const smoothOnce = points => points.map((point, k) => { let sum = 0, n = 0; for (let j = Math.max(0, k - 2); j <= Math.min(points.length - 1, k + 2); j++) { sum += points[j][2]; n++; } return [point[0], point[1], sum / n]; });
  const smooth = points => smoothOnce(smoothOnce([...points].sort((a, b) => a[1] - b[1])));
  const myBack = smooth(back.values()), myFront = smooth(front.values());
  const theirBack = smooth(target.back.map(([x, y, z]) => [x, y, z - BEHIND_TIPS]));
  const theirFront = smooth(target.front.map(([x, y, z]) => [x, y, z + BEFORE_STERNUM]));
  const bottom = theirBack[0][1], top = theirBack.at(-1)[1], fadeFrom = target.pelvis[1];
  const sternumLow = theirFront[0][1], sternumHigh = theirFront.at(-1)[1];
  /* a and b at each height, in 1 cm steps between the hips and the neck, smoothed */
  const rows = [];
  for (let y = Math.floor(fadeFrom); y <= Math.ceil(top) + 1; y++) {
    const fade = Math.min(1, Math.max(0, (y - fadeFrom) / (bottom - fadeFrom)));
    const B = zAt(theirBack, y), b0 = zAt(myBack, y);
    /* how much the breastbone decides the depth here: fully along it, fading over 4 cm beyond its ends */
    const onSternum = Math.min(1, Math.max(0, Math.min(y - (sternumLow - 4), (sternumHigh + 4) - y) / 4));
    const F = zAt(theirFront, y), f0 = zAt(myFront, y);
    const stretch = 1 + onSternum * ((F - B) / (f0 - b0) - 1);
    const a = 1 + fade * (stretch - 1), b = fade * (B - stretch * b0);
    rows.push([y, a, b]);
  }
  const smoothRows = rows.map((row, k) => { let a = 0, b = 0, n = 0; for (let j = Math.max(0, k - 3); j <= Math.min(rows.length - 1, k + 3); j++) { a += rows[j][1]; b += rows[j][2]; n++; } return [row[0], a / n, b / n]; });
  const rowAt = y => { const k = Math.min(smoothRows.length - 1, Math.max(0, Math.round(y - smoothRows[0][0]))); return smoothRows[k]; };
  const bent = p => { const q = trunkMap(p), [, a, b] = rowAt(q[1]); return [q[0], q[1], a * q[2] + b]; };
  log(`  trunk depth: ${[0.1, 0.3, 0.5, 0.7, 0.9].map(t => { const [, a, b] = rowAt(bottom + t * (top - bottom)); return `×${a.toFixed(2)} ${b >= 0 ? '+' : ''}${b.toFixed(1)}`; }).join(', ')} (z' = a z + b, low to high)`);
  const maps = { trunk: bent, head: headMap };
  /* a segment: from its trunk-placed start to the skeleton's, turned onto the skeleton's direction and stretched to its
     length, and turned about its own length by twist (radians) */
  const segment = (name, from, to, A, B, twist = 0) => {
    const a = trunkMap(from), b = trunkMap(to), along = unit(sub(b, a));
    const R = multiply(rotationAbout(unit(sub(B, A)), twist), rotationBetween(along, sub(B, A)));
    const M = multiply(R, stretchAlong(along, norm(sub(B, A)) / norm(sub(b, a))));
    maps[name] = p => add(A, apply(M, sub(trunkMap(p), a)));
    return { R, degrees: Math.acos(Math.min(1, dot(along, unit(sub(B, A))))) * 180 / Math.PI, from: norm(sub(b, a)), to: norm(sub(B, A)) };
  };
  for (const side of ['L', 'R']) {
    segment('clavicle' + side, bones[`clavicle.${side}`].head, source['shoulder' + side], target['collar' + side], target['shoulder' + side]);
    for (const [name, from, to] of [['upperArm', 'shoulder', 'elbow'], ['thigh', 'hip', 'knee']]) {
      const result = segment(name + side, source[from + side], source[to + side], target[from + side], target[to + side]);
      log(`  ${name} ${side}: turned ${result.degrees.toFixed(0)}°, length ${result.from.toFixed(1)} -> ${result.to.toFixed(1)} cm`);
    }
    /* the hand and foot keep their shape: turned, scaled evenly and moved onto the wrist and fingertips, or the ankle,
       heel, ball and toe tips. The forearm and shin share the hand's and foot's turn about their length, half of it near
       the elbow or knee and all of it near the wrist or ankle, so the skin does not pinch at the wrist or ankle. */
    for (const [name, marks, limb, from, to, pointer] of [
      ['hand', ['wrist', 'thumb', 'indexTip', 'fingertip', 'littleTip'], 'ForeArm', 'elbow', 'wrist', 'thumb'],
      ['foot', ['ankle', 'heel', 'toe', 'bigToeTip', 'littleToeTip'], 'Shin', 'knee', 'ankle', 'toe']]) {
      const fit = fitSimilarity(marks.flatMap(mark => trunkMap(source[mark + side])), marks.flatMap(mark => target[mark + side]));
      maps[name + side] = p => applyAffine(fit, ...trunkMap(p));
      log(`  ${name} ${side}: ${marks.map(mark => norm(sub(maps[name + side](source[mark + side]), target[mark + side])).toFixed(1)).join(', ')} cm off`);
      const plain = segment('probe', source[from + side], source[to + side], target[from + side], target[to + side]);
      const axis = unit(sub(target[to + side], target[from + side]));
      const flat = v => unit(sub(v, scale(axis, dot(v, axis))));
      const have = flat(apply(plain.R, sub(trunkMap(source[pointer + side]), trunkMap(source[to + side]))));
      const want = flat(sub(maps[name + side](source[pointer + side]), maps[name + side](source[to + side])));
      const twist = Math.atan2(dot(cross(have, want), axis), dot(have, want));
      const upper = name === 'hand' ? 'foreArm' : 'shin', lower = name === 'hand' ? 'lowerForeArm' : 'lowerShin';
      const result = segment(upper + side, source[from + side], source[to + side], target[from + side], target[to + side], twist / 2);
      segment(lower + side, source[from + side], source[to + side], target[from + side], target[to + side], twist);
      log(`  ${upper} ${side}: turned ${result.degrees.toFixed(0)}°, twisted ${(twist * 180 / Math.PI).toFixed(0)}° toward the ${name}, length ${result.from.toFixed(1)} -> ${result.to.toFixed(1)} cm`);
    }
    delete maps.probe;
  }
  /* each vertex: its bones' segment maps, blended by MakeHuman's skin weights */
  const own = { head: 'head', ...SEGMENT_BONES('L'), ...SEGMENT_BONES('R') };
  const segmentOf = name => own[name] || (bones[name].parent ? segmentOf(bones[name].parent) : 'trunk');
  const share = Array.from({ length: count }, () => ({}));
  for (const [bone, list] of Object.entries(weights)) {
    const name = segmentOf(bone);
    for (const [vertex, weight] of list) share[vertex][name] = (share[vertex][name] || 0) + weight;
  }
  const main = share.map(entry => Object.entries(entry).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'trunk');
  const blended = (rest, maps, trunk) => {
    const out = new Float32Array(rest.length);
    for (let v = 0; v < count; v++) {
      const p = [rest[3 * v], rest[3 * v + 1], rest[3 * v + 2]];
      const entries = Object.entries(share[v]);
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let q = [0, 0, 0];
      if (!total) q = trunk(p);
      else for (const [name, weight] of entries) q = add(q, scale(maps[name](p), weight / total));
      out.set(q, 3 * v);
    }
    return out;
  };
  const out = blended(positions, maps, bent);
  /* The same pose for another shape of the mesh (other morph targets): each segment turns and stretches as it does
     here, but about the other shape's own joint, which sits where that shape's parent segment puts it (plus whatever
     gap this fit left at that joint). So a shorter body with narrower shoulders comes out in this pose with its own
     proportions, its arms hinged at its own shoulders. Returns { positions, place(bone, point) }. */
  const JOINT = { head: ['trunk', 'head'] };
  for (const side of ['L', 'R']) Object.assign(JOINT, {
    ['clavicle' + side]: ['trunk', `clavicle.${side}`], ['upperArm' + side]: ['clavicle' + side, `upperarm01.${side}`],
    ['foreArm' + side]: ['upperArm' + side, `lowerarm01.${side}`], ['lowerForeArm' + side]: ['upperArm' + side, `lowerarm01.${side}`],
    ['hand' + side]: ['lowerForeArm' + side, `wrist.${side}`], ['thigh' + side]: ['trunk', `upperleg01.${side}`],
    ['shin' + side]: ['thigh' + side, `lowerleg01.${side}`], ['lowerShin' + side]: ['thigh' + side, `lowerleg01.${side}`],
    ['foot' + side]: ['lowerShin' + side, `foot.${side}`],
  });
  const poseOther = other => {
    /* the trunk's depth and curve are given height by height: the other shape's trunk is read at the matching height */
    const span = body => [trunkMap(scale(add(body.bones['upperleg01.L'].head, body.bones['upperleg01.R'].head), 0.5))[1], trunkMap(body.bones.neck01.head)[1]];
    const [myHips, myNeck] = span({ bones }), [theirHips, theirNeck] = span(other);
    const theirs = { trunk: p => { const q = trunkMap(p), [, a, b] = rowAt(myHips + (q[1] - theirHips) * (myNeck - myHips) / (theirNeck - theirHips)); return [q[0], q[1], a * q[2] + b]; } };
    for (const [name, [parent, bone]] of Object.entries(JOINT)) {
      const mine = bones[bone].head, joint = other.bones[bone].head, map = maps[name], parentMap = parent === 'trunk' ? bent : maps[parent];
      const origin = map([0, 0, 0]), columns = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(axis => sub(map(axis), origin));
      const base = add(theirs[parent](joint), sub(map(mine), parentMap(mine)));
      theirs[name] = p => { const d = sub(p, joint); return [0, 1, 2].map(c => base[c] + columns[0][c] * d[0] + columns[1][c] * d[1] + columns[2][c] * d[2]); };
    }
    return { positions: blended(other.positions, theirs, theirs.trunk), place: (bone, point) => theirs[segmentOf(bone)](point) };
  };
  /* where a MakeHuman point that moves with a given bone ends up */
  const place = (bone, point) => maps[segmentOf(bone)](point);
  return { positions: out, segment: main, place, poseOther, trunkMap, back: myBack };
}

/* MakeHuman's own landmarks, from its skeleton */
export function landmarksOf({ bones, positions }) {
  const out = {};
  for (const side of ['L', 'R']) {
    out['shoulder' + side] = bones[`upperarm01.${side}`].head;
    out['elbow' + side] = bones[`lowerarm01.${side}`].head;
    out['wrist' + side] = bones[`wrist.${side}`].head;
    out['fingertip' + side] = bones[`finger3-3.${side}`].tail;
    out['thumb' + side] = bones[`finger1-3.${side}`].tail;
    out['hip' + side] = bones[`upperleg01.${side}`].head;
    out['knee' + side] = bones[`lowerleg01.${side}`].head;
    out['ankle' + side] = bones[`foot.${side}`].head;
    /* the balls of the toes: where the toe bones start, as for her metatarsal heads */
    const toes = [1, 2, 3, 4, 5].map(n => bones[`toe${n}-1.${side}`].head);
    out['toe' + side] = [0, 1, 2].map(c => toes.reduce((sum, toe) => sum + toe[c], 0) / toes.length);
    out['eye' + side] = bones[`eye.${side}`].head;
    out['indexTip' + side] = bones[`finger2-3.${side}`].tail;
    out['littleTip' + side] = bones[`finger5-3.${side}`].tail;
    out['bigToeTip' + side] = bones[`toe1-2.${side}`].tail;
    out['littleToeTip' + side] = bones[`toe5-3.${side}`].tail;
    /* the heel: the back of the skin below the ankle, a centimetre in (where the heel bone ends) */
    const ankle = out['ankle' + side];
    let heel = null;
    for (let k = 0; k < positions.length; k += 3) {
      if (positions[k + 1] > ankle[1] || Math.hypot(positions[k] - ankle[0], positions[k + 2] - ankle[2]) > 9) continue;
      if (!heel || positions[k + 2] < heel[2]) heel = [positions[k], positions[k + 1], positions[k + 2]];
    }
    out['heel' + side] = [heel[0], heel[1], heel[2] + 1];
  }
  /* the back and sides of the head, half a centimetre in from the skin (the scalp), a little above the eyes */
  const level = (out.eyeL[1] + out.eyeR[1]) / 2 + 3;
  let back = null, left = null, right = null;
  for (let k = 0; k < positions.length; k += 3) {
    const x = positions[k], y = positions[k + 1], z = positions[k + 2];
    if (Math.abs(y - level) > 1) continue;
    if (Math.abs(x) < 2 && (!back || z < back[2])) back = [x, y, z];
    if (!left || x > left[0]) left = [x, y, z];
    if (!right || x < right[0]) right = [x, y, z];
  }
  out.headBack = [back[0], back[1], back[2] + 0.5]; out.headL = [left[0] - 0.5, left[1], left[2]]; out.headR = [right[0] + 0.5, right[1], right[2]];
  out.pelvis = scale(add(out.hipL, out.hipR), 0.5);
  out.neck = bones.neck01.head;
  /* the crown and chin from the skin, set in by the soft tissue over the bone there: about 0.6 cm on the top of the
     head, 1 cm under and in front of the chin (so they compare with a skeleton's skull top and chin point) */
  const eyes = scale(add(out.eyeL, out.eyeR), 0.5);
  let crown = null, chin = null;
  for (let k = 0; k < positions.length; k += 3) {
    const x = positions[k], y = positions[k + 1], z = positions[k + 2];
    if (Math.abs(x) > 3) continue;
    if (!crown || y > crown[1]) crown = [x, y, z];
    if (y < eyes[1] - 6 && y > eyes[1] - 14 && z > eyes[2] - 4 && (!chin || z - 0.6 * y > chin[2] - 0.6 * chin[1])) chin = [x, y, z];
  }
  out.crown = [crown[0], crown[1] - 0.6, crown[2]];
  out.chin = [chin[0], chin[1] + 0.7, chin[2] - 0.7];
  return out;
}
