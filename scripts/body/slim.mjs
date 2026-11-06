// Makes the female body a slim young woman. The NIH Visible Human Female, whose skin and organs the body is built on,
// was a heavier woman in her late fifties, scanned lying on her back with her arms at her sides. Her arms are turned out
// at the shoulder and her trunk brought to a standing posture; the MakeHuman base mesh (CC0), with its young-female and
// low-weight morph targets, is posed and sized to her skeleton (makehuman.mjs); then one smooth deformation (a
// thin-plate spline) takes her old outline onto the new skin, and everything inside her, bones included, follows it.
// One smooth map cannot tear or fold anything, and what was inside the old skin stays inside the new one; the cost is
// that her bones slim a little with the rest. The skin then rises a little wherever something still shows through.
import { readMakeHuman, poseMakeHuman, landmarksOf } from './makehuman.mjs';
import { pushOutOver, InsideTest, vertexNormals } from './clearance.mjs';
import { PointGrid, spread, thinPlateSpline } from './fit.mjs';

/* the same shape as the Vagina Anatomy body: an even mix of MakeHuman's three young-female targets, plus half its
   lowest-weight one */
export const FEMALE_TARGETS = {
  'caucasian-female-young': 1 / 3, 'african-female-young': 1 / 3, 'asian-female-young': 1 / 3,
  'universal-female-young-averagemuscle-minweight': 0.5,
};

/**
 * structures: [{ name, layer, positions, indices }] in the model frame; positions are changed in place, and the skin
 *   structure (layer 'skin', name 'Skin') gets MakeHuman's positions and indices
 * folder: the MakeHuman files (makehuman.mjs)
 */
export function slimFemale(structures, folder, log = console.log) {
  const named = (layer, name, { optional = false } = {}) => {
    const found = structures.find(structure => structure.layer === layer && structure.name === name);
    if (!found && optional) return null;
    if (!found) throw new Error(`no ${name} in her ${layer}`);
    return found.positions;
  };
  const target = landmarks(named);
  const body = readMakeHuman(folder, FEMALE_TARGETS);
  const skin = structures.find(structure => structure.layer === 'skin' && structure.name === 'Skin');
  /* she was scanned with her arms pressed to her sides; MakeHuman stands with them a little out from the body. Her arms
     are turned out at the shoulder to MakeHuman's, so arm and chest each get their own skin. */
  const { trunkMap, back } = poseMakeHuman(body, target, () => {});
  abductArms(structures, skin, target, trunkMap, landmarksOf(body), log);
  /* and she was scanned lying on her back, which pressed her upper spine back: her trunk is brought forward, height by
     height, so her spine follows a standing woman's back (MakeHuman's), not the table's */
  straighten(structures, skin, target, back, log);
  Object.assign(target, landmarks(named));
  log('reshaping the female body: MakeHuman posed to her skeleton');
  const { positions: posed, segment, place } = poseMakeHuman(body, target, line => log(line));

  /* ---------- the pairs the deformation passes through ---------- */
  const from = [], to = [];
  const pair = (a, b) => { from.push(...a); to.push(...b); };
  /* her old skin, each point to the nearest point of the new skin, arm to arm and trunk to trunk (where the arm hangs
     close, the nearest point alone could pair the side of the chest with the inside of the arm); not on the hands and
     feet, whose joints are paired instead */
  const inHandOrFoot = (x, y, z) => ['L', 'R'].some(side => distance([x, y, z], target['wrist' + side]) < distance(target['wrist' + side], target['fingertip' + side]) + 1 && distance([x, y, z], target['fingertip' + side]) < distance(target['wrist' + side], target['fingertip' + side]) + 1.5)
    || y < Math.max(target.ankleL[1], target.ankleR[1]) + 3;
  const newArm = [], newTrunk = [];
  for (let v = 0; v < segment.length; v++) (ARM.test(segment[v]) ? newArm : newTrunk).push(v);
  const gridOf = list => new PointGrid(Float32Array.from(list.flatMap(v => [posed[3 * v], posed[3 * v + 1], posed[3 * v + 2]])), 1.5);
  const armGrid = gridOf(newArm), trunkGrid = gridOf(newTrunk);
  const armLine = side => [target['shoulder' + side], target['elbow' + side], target['wrist' + side]];
  const toArm = p => Math.min(...['L', 'R'].map(side => Math.min(segmentDistance(p, armLine(side)[0], armLine(side)[1]), segmentDistance(p, armLine(side)[1], armLine(side)[2]))));
  const toSpine = p => Math.min(...target.back.map(point => Math.hypot(p[0] - point[0], p[2] - point[2]) + Math.max(0, Math.abs(p[1] - point[1]) - 3)));
  const onArm = p => p[1] > target.pelvis[1] && toArm(p) < 0.8 * toSpine(p);
  /* between the arm and the side of the chest, below the shoulder, her old skin is where her arm lay pressed to her
     side: whether a point there is arm or chest is unclear, and pairing it either way draws the chest out toward the
     arm (the ends of her ribs with it), so it is left out */
  const shoulderHeight = (target.shoulderL[1] + target.shoulderR[1]) / 2;
  const betweenArmAndSide = p => p[1] < shoulderHeight && p[1] > shoulderHeight - 25 && toArm(p) / toSpine(p) > 0.55 && toArm(p) / toSpine(p) < 1.1;
  const samples = spread(skin.positions, 3.2);
  let skinPairs = 0, totalMove = 0, unclear = 0;
  for (let k = 0; k < samples.length; k += 3) {
    const point = [samples[k], samples[k + 1], samples[k + 2]];
    if (inHandOrFoot(...point)) continue;
    if (betweenArmAndSide(point)) { unclear++; continue; }
    const grid = onArm(point) ? armGrid : trunkGrid;
    const [index, gap] = grid.nearest(...point, 12);
    if (index < 0) continue;
    pair(point, [grid.points[3 * index], grid.points[3 * index + 1], grid.points[3 * index + 2]]);
    skinPairs++; totalMove += gap;
  }
  /* her nipples onto the new body's, so her breast tissue lands inside its breasts; her eyes onto its eyes */
  for (const [side, word, sign] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
    const tip = breastTip(posed, sign, target);
    pair(centre(named('organs', `${word} nipple`)), [tip[0], tip[1], tip[2] - 0.4]);
    pair(target['eye' + side], place(`eye.${side}`, body.bones[`eye.${side}`].head));
  }
  /* the sides of her ribcage, which her old skin did not cover (her arms lay against them), two centimetres inside the
     new body's sides */
  {
    const ribs = Float32Array.from(structures.filter(structure => structure.layer === 'skeleton' && /\brib$/.test(structure.name)).flatMap(structure => [...structure.positions]));
    let lowestRib = Infinity;
    for (let k = 1; k < ribs.length; k += 3) lowestRib = Math.min(lowestRib, ribs[k]);
    let sides = 0;
    for (const sign of [1, -1]) {
      const shoulder = target[sign > 0 ? 'shoulderL' : 'shoulderR'];
      for (let y = shoulder[1] - 8; y > lowestRib + 2; y -= 2.5) {
        let rib = null, side = null;
        for (let k = 0; k < ribs.length; k += 3) if (Math.abs(ribs[k + 1] - y) < 0.8 && (!rib || ribs[k] * sign > rib[0] * sign)) rib = [ribs[k], ribs[k + 1], ribs[k + 2]];
        for (let v = 0; v < segment.length; v++) if (!ARM.test(segment[v]) && Math.abs(posed[3 * v + 1] - y) < 1 && Math.abs(posed[3 * v + 2] - (rib?.[2] ?? 0)) < 5 && (!side || posed[3 * v] * sign > side[0] * sign)) side = [posed[3 * v], posed[3 * v + 1], posed[3 * v + 2]];
        if (!rib || !side) continue;
        /* only ever inward: near the armpit the new body's outermost trunk point is the fold of the armpit, not the side
           of the chest, and would draw the ends of the ribs out toward the arm */
        pair(rib, [sign * Math.min(side[0] * sign - 2, rib[0] * sign), rib[1], rib[2]]); sides++;
      }
    }
    log(`  ${sides} points on the sides of her ribcage go at least two centimetres inside the new body's sides`);
  }
  /* her hands and feet, joint by joint, onto MakeHuman's */
  const joints = handAndFootPairs(named, target, body.bones, landmarksOf(body), place);
  for (const [a, b] of joints) pair(a, b);
  log(`  ${unclear} skin points between arm and chest left out`);
  log(`  ${skinPairs} skin points move by ${(totalMove / skinPairs).toFixed(1)} cm on average; ${joints.length} hand and foot joints, ${(joints.reduce((sum, [a, b]) => sum + distance(a, b), 0) / joints.length).toFixed(1)} cm on average`);

  /* ---------- the deformation, applied to everything she has ---------- */
  const spline = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 1);
  let most = 0;
  for (const structure of structures) {
    if (structure === skin) continue;
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) {
      const q = spline(p[k], p[k + 1], p[k + 2]);
      most = Math.max(most, Math.hypot(q[0] - p[k], q[1] - p[k + 1], q[2] - p[k + 2]));
      p[k] = q[0]; p[k + 1] = q[1]; p[k + 2] = q[2];
    }
  }
  log(`  everything inside her moved by up to ${most.toFixed(1)} cm`);
  skin.positions = posed; skin.indices = body.indices;
  /* the spline is too smooth to put each small bone of a hand or foot on MakeHuman's joints: each hand and foot gets
     its own exact fit, every bone end onto its joint, fading out above the wrist and ankle */
  Object.assign(target, landmarks(named));
  log(`  hands and feet fitted joint by joint: ${fitHandsAndFeet(structures.filter(structure => structure !== skin), named, target, body.bones, landmarksOf(body), place)}`);

  /* her muscles are the male set: after the reshaping, some still reach past MakeHuman's slender arms and thighs. A
     second smooth deformation draws the outer layer in where it does, by at most 2 cm, holding everything deeper than
     3 cm still; it too is one smooth map, so nothing tears. Twice, as each pass changes what the next one sees. */
  const insideStructures = structures.filter(structure => structure !== skin && !EYE.test(structure.name));
  for (let pass = 0; pass < 2; pass++) log(`  outer layer drawn in: ${drawIn(skin, insideStructures, segment, onArm)}`);

  /* the spline passes near its pairs rather than exactly through them, so here and there something lies just under or
     through the new skin: the skin rises over it, smoothly, except in the middle of the face (which keeps MakeHuman's
     shape), on the feet, and (but for a little) on the hands */
  const inner = Float32Array.from(structures.filter(structure => structure !== skin && !EYE.test(structure.name)).flatMap(structure => [...spread(structure.positions, 0.5)]));
  const eyes = (target.eyeL[1] + target.eyeR[1]) / 2, eyeDepth = (target.eyeL[2] + target.eyeR[2]) / 2;
  const isFace = v => segment[v] === 'head' && Math.abs(skin.positions[3 * v]) < 5 && skin.positions[3 * v + 2] > eyeDepth - 2 && skin.positions[3 * v + 1] < eyes + 1.5 && skin.positions[3 * v + 1] > target.chin[1] + 1;
  const fixed = segment.map((name, v) => /^(hand|foot)/.test(name) || isFace(v));
  log(`  skin raised over what showed through by up to ${pushOutOver(skin, inner, { fixed, rounds: 3 }).toFixed(1)} cm`);
  /* the fingers are slender: there the skin only just clears what lies under it, over a short reach, so the hands keep
     their shape rather than swelling around their tendons */
  const notHand = segment.map(name => !/^hand/.test(name));
  log(`  hand skin raised by up to ${pushOutOver(skin, inner, { fixed: notHand, rounds: 2, gap: 0.05, spread: 1, smoothing: 1 }).toFixed(1)} cm`);
  /* what still lies far outside the body (a stray branch of a nerve, misplaced in the source fit) is a placement error,
     not anatomy: its triangles that reach more than 4 cm out are dropped, and named */
  const stray = dropFarOutside(skin, structures.filter(structure => structure !== skin), 4);
  log(`  far outside the body, dropped: ${stray.length ? stray.join('; ') : 'nothing'}`);
}

function dropFarOutside(skin, structures, reach) {
  const test = new InsideTest(skin), surface = new PointGrid(skin.positions, 2), out = [];
  for (const structure of structures) {
    const p = structure.positions;
    const far = v => test.inside(p[3 * v], p[3 * v + 1], p[3 * v + 2]) === false && surface.nearest(p[3 * v], p[3 * v + 1], p[3 * v + 2], reach)[0] < 0;
    const kept = [];
    for (let t = 0; t < structure.indices.length; t += 3) {
      const corner = [structure.indices[t], structure.indices[t + 1], structure.indices[t + 2]];
      if (!corner.some(far)) kept.push(...corner);
    }
    if (kept.length === structure.indices.length) continue;
    if (!kept.length) throw new Error(`${structure.name} lies wholly far outside the body`);
    out.push(`${structure.name} (${(structure.indices.length - kept.length) / 3} triangles)`);
    structure.indices = Uint32Array.from(kept);
  }
  return out;
}

/* One smooth correction (a thin-plate spline) that draws in whatever lies outside the skin or within gap under it, by at
   most cap cm, and holds still what lies deeper than hold cm. Not on the hands or in the head, whose structures lie
   close under thin skin. Returns a summary. */
function drawIn(skin, structures, segment, onArm, { gap = 0.6, cap = 2, hold = 3 } = {}) {
  /* each point against its own part of the skin, the arm's or the trunk's: near the armpit the nearest skin can be the
     inside of the arm, which faces the chest, and pulling a rib "in" from there would draw it toward the arm */
  const normal = vertexNormals(skin), p0 = skin.positions;
  const surfaceOf = arm => {
    const list = []; for (let v = 0; v < segment.length; v++) if (ARM.test(segment[v]) === arm) list.push(v);
    const grid = new PointGrid(Float32Array.from(list.flatMap(v => [p0[3 * v], p0[3 * v + 1], p0[3 * v + 2]])), 1.5);
    return { nearest: (x, y, z, reach) => { const [index, distance] = grid.nearest(x, y, z, reach); return [index < 0 ? -1 : list[index], distance]; } };
  };
  const armSurface = surfaceOf(true), trunkSurface = surfaceOf(false);
  const points = Float32Array.from(structures.flatMap(structure => [...spread(structure.positions, 1)]));
  const from = [], to = [];
  let pulled = 0, held = 0, deepest = 0;
  const heldGrid = new Set();
  for (let k = 0; k < points.length; k += 3) {
    const p = [points[k], points[k + 1], points[k + 2]];
    const [v, distance] = (onArm(p) ? armSurface : trunkSurface).nearest(p[0], p[1], p[2], 20);
    if (v < 0) continue;
    if (/^head/.test(segment[v])) continue;   // the head is not drawn in (it moves with the neck)
    /* the hands, fitted joint by joint, are held where they are: the correction is one smooth field, and unheld it
       would drift them with the forearm */
    if (/^hand/.test(segment[v])) {
      const key = `still ${Math.floor(p[0] / 1.5)},${Math.floor(p[1] / 1.5)},${Math.floor(p[2] / 1.5)}`;
      if (!heldGrid.has(key)) { heldGrid.add(key); from.push(...p); to.push(...p); held++; }
      continue;
    }
    /* inside when the point lies behind the skin's outward normal there */
    const outward = (p[0] - p0[3 * v]) * normal[3 * v] + (p[1] - p0[3 * v + 1]) * normal[3 * v + 1] + (p[2] - p0[3 * v + 2]) * normal[3 * v + 2];
    const depth = outward < 0 ? distance : -distance;
    if (depth < gap) {
      const move = Math.min(cap, gap - depth);
      from.push(...p); to.push(p[0] - normal[3 * v] * move, p[1] - normal[3 * v + 1] * move, p[2] - normal[3 * v + 2] * move);
      pulled++; deepest = Math.max(deepest, gap - depth);
    } else if (depth > hold) {
      const key = `${Math.floor(p[0] / 4)},${Math.floor(p[1] / 4)},${Math.floor(p[2] / 4)}`;   // one held point per 4 cm cell
      if (heldGrid.has(key)) continue;
      heldGrid.add(key); from.push(...p); to.push(...p); held++;
    }
  }
  if (!pulled) return 'nothing outside';
  /* the pulled points, thinned to one per 2 cm cell, so the spline stays a manageable size */
  const thinned = { from: [], to: [] }, seen = new Set();
  for (let k = 0; k < from.length; k += 3) {
    const key = `${Math.floor(from[k] / 2)},${Math.floor(from[k + 1] / 2)},${Math.floor(from[k + 2] / 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (let c = 0; c < 3; c++) { thinned.from.push(from[k + c]); thinned.to.push(to[k + c]); }
  }
  const spline = thinPlateSpline(Float64Array.from(thinned.from), Float64Array.from(thinned.to), 0.5);
  for (const structure of structures) {
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) { const q = spline(p[k], p[k + 1], p[k + 2]); p[k] = q[0]; p[k + 1] = q[1]; p[k + 2] = q[2]; }
  }
  return `${pulled} points needed it (up to ${deepest.toFixed(1)} cm, at most ${cap} cm taken), ${held} held still, spline of ${thinned.from.length / 3}`;
}

/* Her hands' and feet's joints paired with the posed MakeHuman ones: the wrist, each knuckle and fingertip; the ankle,
   heel, each toe joint and toe tip. Returns [her point, MakeHuman's point] pairs. */
function handAndFootPairs(named, target, bones, marks, place) {
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
    for (let n = 2; n <= 5; n++) {
      const chain = ['Proximal', 'Middle', 'Distal'].map(level => `${level} phalanx of ${lower} ${TOE[n - 1]}`);
      chain.forEach((name, k) => pairs.push([ends(name, ankle)[0], mh(`toe${n}-${k + 1}`)]));
      pairs.push([ends(chain[2], ankle)[1], mh(`toe${n}-3`, 'tail')]);
    }
    for (let k = footStart; k < pairs.length; k++) pairs[k].push('foot' + side);
  }
  return pairs;
}
/* Each hand and foot: an exact thin-plate spline from its bones' ends (as they lie now) to MakeHuman's joints, held
   still by points on the forearm or shin bones a few centimetres back; applied in full from the wrist (ankle) out and
   faded to nothing over the 4 cm before it. */
function fitHandsAndFeet(structures, named, target, bones, marks, place) {
  const groups = new Map();
  for (const [a, b, limb] of handAndFootPairs(named, target, bones, marks, place)) (groups.get(limb) || groups.set(limb, []).get(limb)).push([a, b]);
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
function segmentDistance(p, a, b) {
  const ab = sub3(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return distance(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit3 = a => { const length = Math.hypot(...a); return a.map(value => value / length); };

const ARM = /^(upperArm|foreArm|lowerForeArm|hand)/;

/* Moves her trunk forward or back, height by height, so the tips of her vertebrae lie 1.5 cm in front of a standing
   back (MakeHuman's back midline, placed on her trunk): z moves by s(y). The move fades out below the lowest lumbar
   vertebra (the hips and legs stay) and above the seventh cervical (the head stays). Each arm moves as a whole with its
   shoulder, so it is not sheared; the old skin moves with what it covers. */
function straighten(structures, skin, target, back, log) {
  const tips = target.back;   // sorted by height
  const zAt = (points, y) => {
    if (y <= points[0][1]) return points[0][2];
    if (y >= points.at(-1)[1]) return points.at(-1)[2];
    const k = points.findIndex(point => point[1] >= y), t = (y - points[k - 1][1]) / (points[k][1] - points[k - 1][1]);
    return points[k - 1][2] + (points[k][2] - points[k - 1][2]) * t;
  };
  const bottom = tips[0][1], top = tips.at(-1)[1], hips = target.pelvis[1];
  const raw = y => (zAt(back, y) + 1.5) - zAt(tips, y);
  /* in 1 cm rows, faded at both ends and smoothed over 7 cm */
  const rows = [];
  for (let y = Math.floor(hips); y <= Math.ceil(top) + 10; y++) {
    const fade = Math.min(1, Math.max(0, (y - hips) / (bottom - hips))) * Math.min(1, Math.max(0, (top + 8 - y) / 8));
    rows.push(raw(Math.min(top, Math.max(bottom, y))) * fade);
  }
  const smoothed = rows.map((_, k) => { let sum = 0, n = 0; for (let j = Math.max(0, k - 3); j <= Math.min(rows.length - 1, k + 3); j++) { sum += rows[j]; n++; } return sum / n; });
  const shiftAt = y => { const k = Math.round(y - Math.floor(hips)); return k < 0 || k >= smoothed.length ? 0 : smoothed[k]; };
  const armLine = side => ['shoulder', 'elbow', 'wrist', 'fingertip'].map(mark => target[mark + side]);
  const toArm = (p, side) => { const line = armLine(side); return Math.min(segmentDistance(p, line[0], line[1]), segmentDistance(p, line[1], line[2]), segmentDistance(p, line[2], line[3])); };
  const armShift = { L: shiftAt(target.shoulderL[1]), R: shiftAt(target.shoulderR[1]) };
  /* which arm a structure (or an old-skin point) belongs to, if any: near that arm's bones and below its shoulder */
  const armOf = p => { for (const side of ['L', 'R']) if (p[0] * (side === 'L' ? 1 : -1) > 0 && p[1] < target['shoulder' + side][1] + 2 && toArm(p, side) < 0.45 * Math.abs(p[0])) return side; return null; };
  let most = 0;
  for (const structure of structures) {
    const p = structure.positions, whole = structure === skin ? null : armOf(centre(p));
    for (let k = 0; k < p.length; k += 3) {
      const side = structure === skin ? armOf([p[k], p[k + 1], p[k + 2]]) : whole;
      const shift = side ? armShift[side] : shiftAt(p[k + 1]);
      p[k + 2] += shift; most = Math.max(most, Math.abs(shift));
    }
  }
  log(`  her trunk brought to a standing posture: up to ${most.toFixed(1)} cm (${[0.2, 0.5, 0.8].map(t => shiftAt(bottom + t * (top - bottom)).toFixed(1)).join(', ')} cm, low to high)`);
}

/* Turns each of her arms out at the shoulder, onto the direction of MakeHuman's upper arm. What belongs to the arm
   (its bones, muscles, vessels and nerves, by region) turns with it; what spans the shoulder from the trunk (the chest and
   back muscles that reach the upper arm, the old skin) turns where it lies out beyond the side of her ribcage; nothing
   turns above the shoulder joint, and the turn fades in over a few centimetres below it. Her arm landmarks turn too. */
function abductArms(structures, skin, target, trunkMap, marks, log) {
  const ribs = structures.filter(structure => structure.layer === 'skeleton' && /\brib$/.test(structure.name));
  const ribSide = new Map();   // per side and 1 cm height band: how far out her ribcage reaches
  for (const structure of ribs) for (let k = 0; k < structure.positions.length; k += 3) {
    const x = structure.positions[k], key = `${Math.sign(x)},${Math.round(structure.positions[k + 1])}`;
    ribSide.set(key, Math.max(ribSide.get(key) ?? 0, Math.abs(x)));
  }
  const ribAt = (sign, y) => { let best = 0; for (let d = -3; d <= 3; d++) best = Math.max(best, ribSide.get(`${sign},${Math.round(y) + d}`) ?? 0); return best; };
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const S = target['shoulder' + side], a = unit3(sub3(target['elbow' + side], S));
    const m = unit3(sub3(trunkMap(marks['elbow' + side]), trunkMap(marks['shoulder' + side])));
    const R = rotationOnto(a, m), degrees = Math.acos(Math.min(1, a[0] * m[0] + a[1] * m[1] + a[2] * m[2])) * 180 / Math.PI;
    const turn = p => { const d = sub3(p, S); return [0, 1, 2].map(r => S[r] + R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2]); };
    const below = p => { const t = (p[0] - S[0]) * a[0] + (p[1] - S[1]) * a[1] + (p[2] - S[2]) * a[2]; return smoothstep(-3, 2, t); };
    /* trunk structures turn only where they lie out beyond the ribcage, at the ribcage's height */
    const beyondRibs = p => {
      const rib = ribAt(sign, p[1]);
      if (!rib) return 0;
      const outside = p[0] * sign - rib - 0.5;
      return outside > 0 ? smoothstep(0, 1, outside / (outside + toArm(p))) : 0;   // 0 on the ribcage, rising to 1 at the arm's bones
    };
    /* the old skin: a point belongs to the arm when it is much nearer the arm's bones than the middle of the trunk */
    const line = ['shoulder', 'elbow', 'wrist', 'fingertip'].map(mark => target[mark + side]);
    const toArm = p => Math.min(segmentDistance(p, line[0], line[1]), segmentDistance(p, line[1], line[2]), segmentDistance(p, line[2], line[3]));
    const onArm = p => smoothstep(0.55, 0.35, toArm(p) / (Math.abs(p[0]) + 1e-6));
    /* a structure belongs to the arm when most of it lies along the arm (by its points, not its middle: a nerve's
       branches can spread around the elbow with their middle off the arm) */
    const ownArm = structure => {
      if (structure.layer === 'skin') return false;
      const p = structure.positions;
      let near = 0, total = 0;
      for (let k = 0; k < p.length; k += 9) { total++; const q = [p[k], p[k + 1], p[k + 2]]; if (q[0] * sign > 0 && q[1] < S[1] + 2 && toArm(q) < 7) near++; }
      return near > total / 2;
    };
    let moved = 0;
    for (const structure of [...structures.filter(item => item !== skin), skin]) {
      const whole = ownArm(structure), p = structure.positions;
      for (let k = 0; k < p.length; k += 3) {
        const point = [p[k], p[k + 1], p[k + 2]];
        if (point[0] * sign <= 0) continue;
        const w = below(point) * (whole ? 1 : structure === skin ? onArm(point) : beyondRibs(point));
        if (!w) continue;
        const q = turn(point);
        for (let c = 0; c < 3; c++) p[k + c] += w * (q[c] - point[c]);
        moved++;
      }
    }
    for (const mark of ['elbow', 'wrist', 'fingertip', 'thumb', 'indexTip', 'littleTip']) target[mark + side] = turn(target[mark + side]);
    log(`  ${side === 'L' ? 'left' : 'right'} arm turned out ${degrees.toFixed(0)}° at the shoulder (${moved} points)`);
  }
}
function rotationOnto(a, b) {
  const axis = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], sine = Math.hypot(...axis), cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (sine < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = axis.map(value => value / sine), angle = Math.atan2(sine, cosine), s = Math.sin(angle), c = 1 - Math.cos(angle);
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + s * K[i][j] + c * [0, 1, 2].reduce((sum, n) => sum + K[i][n] * K[n][j], 0)));
}
const smoothstep = (edge0, edge1, x) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

const EYE = /sclera|cornea|lens|iris|retina|vitreous|choroid|conjunctiva|eyelid|tarsal plate|ciliary|pupil/i;


/* the most forward point of one breast of the posed MakeHuman body: side 1 is her left */
function breastTip(positions, side, target) {
  const chest = target.shoulderL[1] - 0.3 * (target.shoulderL[1] - target.hipL[1]);
  let best = null;
  for (let k = 0; k < positions.length; k += 3) {
    const x = positions[k] * side, y = positions[k + 1], z = positions[k + 2];
    if (x < 4 || x > 18 || Math.abs(y - chest) > 9) continue;
    if (!best || z > best[2]) best = [positions[k], y, z];
  }
  return best;
}

/* ---------- Her landmarks, from her bones (the names are the built body's part names) ---------- */
function landmarks(named) {
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

