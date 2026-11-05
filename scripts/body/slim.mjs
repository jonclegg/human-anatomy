// Makes the female body a slim young woman. The NIH Visible Human Female, whose skin and organs the body is built on,
// was a heavier woman in her late fifties. Her skin is replaced by the MakeHuman base mesh (CC0) with its young-female
// and low-weight morph targets, posed and sized to her skeleton (makehuman.mjs). Everything between her bones and the
// new skin moves in with it: a thin-plate spline takes each point of the old skin to the nearest point of the new one
// while her bones stay where they are, and her muscles, organs, vessels and nerves follow that spline. What still
// shows through the new skin afterwards (mostly bone that lies just under it) gets the skin raised over it.
import { readMakeHuman, poseMakeHuman, landmarksOf } from './makehuman.mjs';
import { pushOutOver, easeUnder, easeTriangles, trimOutside, wholly, clear, obstacleOf, towardCentre, centreOf, InsideTest } from './clearance.mjs';
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
  log('slimming the female body: MakeHuman posed to her skeleton');
  const { positions: posed, segment, place } = poseMakeHuman(body, target, line => log(line));

  /* the old skin's points, each to the nearest point of the new skin; not the hands and feet, whose fingers and toes
     would find the wrong neighbour (their bones pin them instead) */
  const inHandOrFoot = (x, y, z) => ['L', 'R'].some(side => distance([x, y, z], target['wrist' + side]) < distance(target['wrist' + side], target['fingertip' + side]) + 1 && distance([x, y, z], target['fingertip' + side]) < distance(target['wrist' + side], target['fingertip' + side]) + 1.5)
    || y < Math.max(target.ankleL[1], target.ankleR[1]) + 3;
  /* an arm point of the old skin goes to the new skin's arm, and a trunk point to its trunk: where the arm hangs close,
     the nearest point alone could pair the side of the chest with the inside of the arm */
  const newArm = [], newTrunk = [];
  for (let v = 0; v < segment.length; v++) (ARM.test(segment[v]) ? newArm : newTrunk).push(v);
  const gridOf = list => { const grid = new PointGrid(Float32Array.from(list.flatMap(v => [posed[3 * v], posed[3 * v + 1], posed[3 * v + 2]])), 1.5); return grid; };
  const armGrid = gridOf(newArm), trunkGrid = gridOf(newTrunk);
  const armLine = side => [target['shoulder' + side], target['elbow' + side], target['wrist' + side]];
  const toArm = p => Math.min(...['L', 'R'].map(side => Math.min(segmentDistance(p, armLine(side)[0], armLine(side)[1]), segmentDistance(p, armLine(side)[1], armLine(side)[2]))));
  const toSpine = p => Math.min(...target.back.map(point => Math.hypot(p[0] - point[0], p[2] - point[2]) + Math.max(0, Math.abs(p[1] - point[1]) - 3)));
  const from = [], to = [];
  const samples = spread(skin.positions, 3.2);
  let skinPairs = 0, totalMove = 0;
  for (let k = 0; k < samples.length; k += 3) {
    const point = [samples[k], samples[k + 1], samples[k + 2]];
    if (inHandOrFoot(...point)) continue;
    const onArm = point[1] > target.pelvis[1] && toArm(point) < 0.8 * toSpine(point);
    const grid = onArm ? armGrid : trunkGrid;
    const [index, gap] = grid.nearest(...point, 12);
    if (index < 0) continue;
    from.push(...point); to.push(grid.points[3 * index], grid.points[3 * index + 1], grid.points[3 * index + 2]);
    skinPairs++; totalMove += gap;
  }
  /* her nipples onto the new body's, so the breast tissue lands inside its breasts */
  for (const side of ['left', 'right']) {
    const nipple = centre(named('organs', `${side === 'left' ? 'Left' : 'Right'} nipple`));
    const tip = breastTip(posed, side === 'left' ? 1 : -1, target);
    from.push(...nipple); to.push(tip[0], tip[1], tip[2] - 0.4);
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
        from.push(...rib); to.push(side[0] - sign * 2, rib[1], rib[2]); sides++;
      }
    }
    log(`  ${sides} points on the sides of her ribcage go two centimetres inside the new body's sides`);
  }
  /* her bones stay where they are, except the ribcage: her ribs are fitted from the male and sized to the NIH woman,
     too wide for a slim one, so they move in with the rest */
  const held = structure => structure.layer === 'skeleton' && !RIBCAGE.test(structure.name);
  const bones = spread(Float32Array.from(structures.filter(held).flatMap(structure => [...spread(structure.positions, 1.5)])), 4.5);
  for (let k = 0; k < bones.length; k += 3) { from.push(bones[k], bones[k + 1], bones[k + 2]); to.push(bones[k], bones[k + 1], bones[k + 2]); }
  log(`  ${skinPairs} skin points move in by ${(totalMove / skinPairs).toFixed(1)} cm on average; ${bones.length / 3} bone points hold still`);
  const spline = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 1);
  /* the kidneys move as wholes, each with the spline's move of its middle, so they keep their scanned size; everything
     else follows the spline point by point */
  const KIDNEY = /kidney|renal (pyramid|papilla|column|cortex|medulla|pelvis|sinus|capsule)|(minor|major) calyx/i;
  for (const sign of [1, -1]) {
    const pieces = structures.filter(structure => KIDNEY.test(structure.name) && Math.sign(centre(structure.positions)[0]) === sign && !held(structure));
    if (!pieces.length) continue;
    const middle = centre(pieces.flatMap(structure => [...structure.positions])), moved = spline(...middle), d = [0, 1, 2].map(c => moved[c] - middle[c]);
    for (const structure of pieces) { for (let k = 0; k < structure.positions.length; k++) structure.positions[k] += d[k % 3]; structure.whole = true; }
  }
  for (const structure of structures) {
    if (structure.layer === 'skin' || held(structure) || structure.whole) continue;
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) { const q = spline(p[k], p[k + 1], p[k + 2]); p[k] = q[0]; p[k + 1] = q[1]; p[k + 2] = q[2]; }
  }
  /* drawn in, an organ can be pressed into a bone that held still (the bladder into the pubis): it gives way toward its
     own middle, as organs carry the impressions of the bones around them */
  {
    const bones = obstacleOf(structures.filter(structure => structure.layer === 'skeleton' && !/cartilage|dis[ck]|ligament|membrane|capsule|meniscus|symphysis/i.test(structure.name)));
    let moved = 0;
    /* three passes; in the pelvis, where the bladder meets the pubis, a deeper give */
    for (let pass = 0; pass < 3; pass++) for (const structure of structures) {
      if (structure.layer !== 'organs') continue;
      const inPelvis = centreOf([structure])[1] < target.pelvis[1] + 12;
      moved += clear(structure, bones, towardCentre(centreOf([structure])), inPelvis ? { reach: 2, depth: 2.5 } : { reach: 1.2, depth: 1.2 });
    }
    log(`  organs kept clear of her bones: ${moved} points moved`);
  }
  /* the bladder sits right behind the pubic bones; drawn in, it can still overlap them. It moves as a whole, away from
     them, a few millimetres at a time, until almost none of it lies inside them */
  {
    const pubis = structures.filter(structure => structure.layer === 'skeleton' && /pubis|^(left|right) hip bone$/i.test(structure.name));
    const bladder = structures.filter(structure => /bladder/i.test(structure.name) && structure.layer === 'organs');
    if (pubis.length && bladder.length) {
      const tests = pubis.map(structure => new InsideTest(structure, 0.25));
      const inBone = () => { let n = 0, total = 0; for (const structure of bladder) for (let k = 0; k < structure.positions.length; k += 6) { total++; if (tests.some(test => test.inside(structure.positions[k], structure.positions[k + 1], structure.positions[k + 2]) === true)) n++; } return n / total; };
      const from = centre(pubis.flatMap(structure => [...structure.positions])), to = centre(bladder.flatMap(structure => [...structure.positions]));
      const away = unit3(sub3(to, from));
      let step = 0, share = inBone();
      const before = share;
      while (share > 0.005 && step < 15) {
        for (const structure of bladder) for (let k = 0; k < structure.positions.length; k++) structure.positions[k] += away[k % 3] * 0.3;
        step++; share = inBone();
      }
      log(`  bladder moved ${(step * 0.3).toFixed(1)} cm clear of the pubic bones (${(before * 100).toFixed(1)}% -> ${(share * 100).toFixed(1)}% inside)`);
    }
  }
  skin.positions = posed; skin.indices = body.indices;
  /* her hands and feet (fitted from the male, like the rest of her skeleton) are moved into MakeHuman's, joint by joint */
  fitHandsAndFeet(structures, named, target, body.bones, landmarksOf(body), place, log);

  /* what still lies outside the new skin, or just under it, is eased in under it: muscle, organ, vessel and nerve */
  const soft = structures.filter(structure => ['muscles', 'organs', 'vessels', 'nerves'].includes(structure.layer) && !EYE.test(structure.name));
  log(`  soft tissue eased under the skin: ${easeUnder(skin, soft, { gap: 0.8 }).toFixed(1)} cm at most`);
  log(`  large triangles still crossing it pushed deeper: ${easeTriangles(skin, soft, { gap: 0.8 })} triangles`);
  /* her scanned breast tissue was shaped for her old, larger breasts: it is set a full 1.2 cm under the new skin */
  const breast = soft.filter(structure => structure.group === 'breast');
  log(`  breast tissue drawn into the new breasts: ${fitBreasts(skin, breast)}`);
  log(`  breast tissue set under the skin: ${easeUnder(skin, breast, { gap: 1.2 }).toFixed(1)} cm at most, ${easeTriangles(skin, breast, { gap: 1.2 })} triangles deeper`);
  log(`  soft-tissue triangles still outside it dropped: ${trimOutside(skin, soft)}${wholly.length ? `; wholly outside: ${wholly.join(', ')}` : ''}`);
  /* in the hands and feet, bone too: MakeHuman's fingers and toes are slimmer than the male bones fitted into them */
  const ends = structures.filter(structure => structure.layer === 'skeleton' && inHandOrFoot(...centre(structure.positions)));
  log(`  hand and foot bones eased under the skin: ${easeUnder(skin, ends, { gap: 0.25, maxMove: 5 }).toFixed(1)} cm at most, ${easeTriangles(skin, ends, { gap: 0.25 })} triangles deeper`);
  /* and the skin rises over bone that lies just under it or through it (the top of the skull, a shoulder blade), but
     not on the hands and feet (their bones were moved into them instead) or the face (which keeps MakeHuman's shape) */
  const bonePoints = Float32Array.from(structures.filter(structure => structure.layer === 'skeleton').flatMap(structure => [...spread(structure.positions, 0.5)]));
  const eyes = (target.eyeL[1] + target.eyeR[1]) / 2, eyeDepth = (target.eyeL[2] + target.eyeR[2]) / 2;
  const isFace = v => segment[v] === 'head' && skin.positions[3 * v + 2] > eyeDepth - 3 && skin.positions[3 * v + 1] < eyes + 2.5 && skin.positions[3 * v + 1] > target.chin[1] - 0.5;
  const fixed = segment.map((name, v) => /^(hand|foot)/.test(name) || isFace(v));
  const largest = Math.max(pushOutOver(skin, bonePoints, { fixed, rounds: 4 }), pushOutOver(skin, bonePoints, { fixed, rounds: 2, spread: 1.2, smoothing: 0 }));   // then small pokes, closely
  log(`  skin raised over her bones by up to ${largest.toFixed(1)} cm`);
}


/* Her scanned breast tissue, shaped for larger breasts, is drawn toward its own middle, a little at a time, until almost
   none of it lies outside the new skin. Each side on its own. Returns a summary. */
function fitBreasts(skin, breast) {
  const test = new InsideTest(skin), out = [];
  for (const sign of [1, -1]) {
    const pieces = breast.filter(structure => Math.sign(centre(structure.positions)[0]) === sign);
    if (!pieces.length) continue;
    const middle = centre(pieces.flatMap(structure => [...structure.positions]));
    const outside = () => { let n = 0, total = 0; for (const structure of pieces) for (let k = 0; k < structure.positions.length; k += 9) { total++; if (test.inside(structure.positions[k], structure.positions[k + 1], structure.positions[k + 2]) === false) n++; } return n / total; };
    let factor = 1, share = outside();
    while (share > 0.001 && factor > 0.5) {
      for (const structure of pieces) for (let k = 0; k < structure.positions.length; k++) structure.positions[k] = middle[k % 3] + (structure.positions[k] - middle[k % 3]) * 0.96;
      factor *= 0.96; share = outside();
    }
    out.push(`${sign > 0 ? 'left' : 'right'} to ${(factor * 100).toFixed(0)}% (${(share * 100).toFixed(1)}% outside)`);
  }
  return out.join(', ');
}

/* Moves her hand and foot structures (all layers but the skin) so their joints land on MakeHuman's: a thin-plate spline
   from her wrist, knuckles and fingertips (or ankle, heel and toe joints) to the posed MakeHuman ones, held still on her
   forearm or shin, and faded in across the wrist or ankle. */
function fitHandsAndFeet(structures, named, target, bones, marks, place, log) {
  const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'], FINGER = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
  const TOE = ['big toe', 'second toe', 'third toe', 'fourth toe', 'little toe'];
  for (const [side, word] of [['L', 'Left'], ['R', 'Right']]) {
    const lower = word.toLowerCase();
    const bone = name => named('skeleton', name);
    const ends = (name, toward) => [endAwayFrom(bone(name), toward, 0.6, true), endAwayFrom(bone(name), toward, 0.6)];   // [near end, far end]
    const mh = (name, end = 'head') => place(`${name}.${side}`, bones[`${name}.${side}`][end]);
    for (const part of ['hand', 'foot']) {
      const pairs = [];
      const root = part === 'hand' ? target['wrist' + side] : target['ankle' + side];
      if (part === 'hand') {
        pairs.push([root, mh('wrist')]);
        const thumb = [`${word} first metacarpal bone`, `Proximal phalanx of ${lower} thumb`, `Distal phalanx of ${lower} thumb`];
        thumb.forEach((name, k) => pairs.push([ends(name, root)[0], mh(`finger1-${k + 1}`)]));
        pairs.push([ends(thumb[2], root)[1], mh('finger1-3', 'tail')]);
        for (let n = 2; n <= 5; n++) {
          pairs.push([ends(`${word} ${ORDINAL[n - 1]} metacarpal bone`, root)[0], mh(`metacarpal${n - 1}`)]);
          const chain = ['Proximal', 'Middle', 'Distal'].map(level => `${level} phalanx of ${lower} ${FINGER[n - 1]}`);
          chain.forEach((name, k) => pairs.push([ends(name, root)[0], mh(`finger${n}-${k + 1}`)]));
          pairs.push([ends(chain[2], root)[1], mh(`finger${n}-3`, 'tail')]);
        }
      } else {
        pairs.push([root, mh('foot')], [target['heel' + side], place(`foot.${side}`, marks['heel' + side])]);
        const big = [`Proximal phalanx of ${lower} big toe`, `Distal phalanx of ${lower} big toe`];
        big.forEach((name, k) => pairs.push([ends(name, root)[0], mh(`toe1-${k + 1}`)]));
        pairs.push([ends(big[1], root)[1], mh('toe1-2', 'tail')]);
        for (let n = 2; n <= 5; n++) {
          const chain = ['Proximal', 'Middle', 'Distal'].map(level => `${level} phalanx of ${lower} ${TOE[n - 1]}`);
          chain.forEach((name, k) => pairs.push([ends(name, root)[0], mh(`toe${n}-${k + 1}`)]));
          pairs.push([ends(chain[2], root)[1], mh(`toe${n}-3`, 'tail')]);
        }
      }
      /* held still up the forearm or shin */
      const above = part === 'hand' ? [...bone(`${word} radius`), ...bone(`${word} ulna`)] : [...bone(`${word} tibia`), ...bone(`${word} fibula`)];
      const anchors = spread(Float32Array.from(above), 2.5);
      const from = [], to = [];
      for (const [a, b] of pairs) { from.push(...a); to.push(...b); }
      let held = 0;
      for (let k = 0; k < anchors.length; k += 3) if (distance([anchors[k], anchors[k + 1], anchors[k + 2]], root) > 6) { from.push(anchors[k], anchors[k + 1], anchors[k + 2]); to.push(anchors[k], anchors[k + 1], anchors[k + 2]); held++; }
      const spline = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 0.1);
      /* how far past the wrist or ankle a point lies: 1 beyond it, fading to 0 four centimetres back up the limb */
      const axis = part === 'hand' ? unit3(sub3(target['fingertip' + side], root)) : [0, -1, 0];
      const reach = part === 'hand' ? 25 : 30;
      const weight = (x, y, z) => {
        if (Math.sign(x) !== (side === 'L' ? 1 : -1) || distance([x, y, z], root) > reach) return 0;
        const along = (x - root[0]) * axis[0] + (y - root[1]) * axis[1] + (z - root[2]) * axis[2];
        const t = Math.min(1, Math.max(0, (along + 4) / 4));
        return t * t * (3 - 2 * t);
      };
      let moved = 0, most = 0;
      for (const structure of structures) {
        if (structure.layer === 'skin') continue;
        const p = structure.positions;
        for (let k = 0; k < p.length; k += 3) {
          const w = weight(p[k], p[k + 1], p[k + 2]);
          if (!w) continue;
          const q = spline(p[k], p[k + 1], p[k + 2]);
          const d = [0, 1, 2].map(c => w * (q[c] - p[k + c]));
          for (let c = 0; c < 3; c++) p[k + c] += d[c];
          moved++; most = Math.max(most, Math.hypot(...d));
        }
      }
      const miss = pairs.reduce((sum, [a, b]) => sum + distance(a, b), 0) / pairs.length;
      log(`  ${lower} ${part}: ${pairs.length} joints, ${miss.toFixed(1)} cm apart on average, moved onto MakeHuman's (${moved} points, up to ${most.toFixed(1)} cm), ${held} points held above`);
    }
  }
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
  const ribAt = (sign, y) => { let best = 0; for (let d = -1; d <= 1; d++) best = Math.max(best, ribSide.get(`${sign},${Math.round(y) + d}`) ?? 0); return best; };
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const S = target['shoulder' + side], a = unit3(sub3(target['elbow' + side], S));
    const m = unit3(sub3(trunkMap(marks['elbow' + side]), trunkMap(marks['shoulder' + side])));
    const R = rotationOnto(a, m), degrees = Math.acos(Math.min(1, a[0] * m[0] + a[1] * m[1] + a[2] * m[2])) * 180 / Math.PI;
    const turn = p => { const d = sub3(p, S); return [0, 1, 2].map(r => S[r] + R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2]); };
    const below = p => { const t = (p[0] - S[0]) * a[0] + (p[1] - S[1]) * a[1] + (p[2] - S[2]) * a[2]; return smoothstep(-3, 2, t); };
    /* trunk structures turn only where they lie out beyond the ribcage, at the ribcage's height */
    const beyondRibs = p => { const rib = ribAt(sign, p[1]); return rib ? smoothstep(1.5, 4.5, p[0] * sign - rib) : 0; };
    /* the old skin: a point belongs to the arm when it is much nearer the arm's bones than the middle of the trunk */
    const line = ['shoulder', 'elbow', 'wrist', 'fingertip'].map(mark => target[mark + side]);
    const toArm = p => Math.min(segmentDistance(p, line[0], line[1]), segmentDistance(p, line[1], line[2]), segmentDistance(p, line[2], line[3]));
    const onArm = p => smoothstep(0.55, 0.35, toArm(p) / (Math.abs(p[0]) + 1e-6));
    const ownArm = structure => { const c = centre(structure.positions); return structure.layer !== 'skin' && c[0] * sign > 0 && c[1] < S[1] + 2 && toArm(c) < 7; };
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

const RIBCAGE = /\brib\b|costal|intercostal|costotransverse|costovertebral|radiate ligament|xiphoid/i;
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

