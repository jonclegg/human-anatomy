// Carries one whole body onto another skin. The source body is a real one whose skin and insides belong together (the
// BodyParts3D man). The MakeHuman mesh is first laid onto his skin, vertex by vertex (posed to his skeleton, then
// drawn onto his skin surface), so every MakeHuman vertex marks a known spot on him: this nipple, that knuckle. The
// same mesh with other morph targets, put through the same pose, is the new body's skin. One smooth deformation (a
// thin-plate spline) then takes each marked spot on his skin to the same vertex of the new skin, and everything inside
// him follows. The pose does not change and the skin points correspond exactly, so nothing is torn or folded and what
// lay under his skin lies under the new one.
import { readMakeHuman, poseMakeHuman, landmarksOf } from './makehuman.mjs';
import { PointGrid, thinPlateSpline } from './fit.mjs';
import { vertexNormals, InsideTest, InsideAllWays } from './clearance.mjs';
import { landmarks, handAndFootPairs, fitHandsAndFeet } from './landmarks.mjs';

/* points spread over a mesh's surface no further apart than spacing (cm), each with its triangle's normal */
function surfaceSamples({ positions, indices }, spacing, skip = () => false) {
  const points = [], normals = [], corners = [], weights = [];
  for (let t = 0; t < indices.length; t += 3) {
    if (skip(indices[t], indices[t + 1], indices[t + 2])) continue;
    const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(axis => positions[3 * indices[t + k] + axis]));
    const u = [0, 1, 2].map(k => b[k] - a[k]), v = [0, 1, 2].map(k => c[k] - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], area = Math.hypot(...n);
    if (area < 1e-9) continue;
    const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(...u), Math.hypot(...v)) / spacing));
    for (let i = 0; i <= steps; i++) for (let j = 0; i + j <= steps; j++) {
      const s = i / steps, r = j / steps;
      points.push(a[0] + s * u[0] + r * v[0], a[1] + s * u[1] + r * v[1], a[2] + s * u[2] + r * v[2]);
      normals.push(n[0] / area, n[1] / area, n[2] / area);
      corners.push(indices[t], indices[t + 1], indices[t + 2]); weights.push(1 - s - r, s, r);
    }
  }
  return { points: Float32Array.from(points), normals: Float32Array.from(normals), corners: Uint32Array.from(corners), weights: Float32Array.from(weights) };
}

/**
 * Draws a posed MakeHuman mesh onto a skin surface. Each round, every vertex looks for the nearest skin point that
 * faces the same way; the mesh then moves toward those points as a sheet that resists stretching (each edge keeps its
 * vector as far as it can), stiff at first and looser each round, so a vertex slides little along the skin and the
 * mesh keeps its layout: a knee stays a knee. Vertices where free(v) is false take no target of their own and follow
 * their neighbours.
 * Returns { positions, matched: per vertex, whether it found the skin in the last round }.
 */
export function drawOnto(mesh, skin, { free = () => true, rounds = [[4, 8], [3, 4], [2.5, 2], [2, 1], [1.5, 0.5], [1.5, 0.3]], log = console.log } = {}) {
  const count = mesh.positions.length / 3, samples = surfaceSamples(skin, 0.4), grid = new PointGrid(samples.points, 1);
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < mesh.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[mesh.indices[t + a]].add(mesh.indices[t + b]); neighbours[mesh.indices[t + b]].add(mesh.indices[t + a]); }
  const list = neighbours.map(set => [...set]);
  let x = Float64Array.from(mesh.positions), matched = new Uint8Array(count);
  for (const [reach, stiffness] of rounds) {
    const normal = vertexNormals({ positions: x, indices: mesh.indices }), goal = new Float64Array(count * 3);
    matched = new Uint8Array(count);
    let total = 0, found = 0;
    for (let v = 0; v < count; v++) {
      if (!free(v)) continue;
      /* the nearest skin point facing the same way: the nearest of all may be the wrong side of a thin part, or the
         side of the chest where the arm hangs close */
      let best = -1, bestDistance = Infinity;
      for (const index of grid.within(x[3 * v], x[3 * v + 1], x[3 * v + 2], reach)) {
        if (samples.normals[3 * index] * normal[3 * v] + samples.normals[3 * index + 1] * normal[3 * v + 1] + samples.normals[3 * index + 2] * normal[3 * v + 2] < 0.35) continue;
        const d = Math.hypot(samples.points[3 * index] - x[3 * v], samples.points[3 * index + 1] - x[3 * v + 1], samples.points[3 * index + 2] - x[3 * v + 2]);
        if (d < bestDistance) { bestDistance = d; best = index; }
      }
      if (best < 0) continue;
      matched[v] = 1; goal.set(samples.points.subarray(3 * best, 3 * best + 3), 3 * v); total += bestDistance; found++;
    }
    const before = Float64Array.from(x);
    for (let sweep = 0; sweep < 60; sweep++) for (let v = 0; v < count; v++) {
      const around = list[v];
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const w of around) sum += x[3 * w + c] + before[3 * v + c] - before[3 * w + c];
        x[3 * v + c] = (matched[v] * goal[3 * v + c] + stiffness * sum) / (matched[v] + stiffness * around.length);
      }
    }
    log(`  within ${reach} cm, stiffness ${stiffness}: ${found} of ${count} vertices found the skin, ${(total / found).toFixed(2)} cm away on average`);
  }
  return { positions: Float32Array.from(x), matched };
}

/* the parts of the eyeball itself (organs): they show through the eyelids, so they are placed whole and never tucked under the skin */
const isGlobe = structure => structure.layer === 'organs' && /sclera|cornea|\blens\b|iris|retina|vitreous|choroid|corona ciliaris|anterior chamber|posterior chamber|pupil/i.test(structure.name);

/**
 * Brings under the skin whatever lies outside it or within gap (cm) beneath it. The source body has some of this of
 * its own (a vein, a band of fascia or a toe ligament that came from another model and runs just over his skin), and
 * a smooth deformation leaves a little more just at the surface.
 * First the layers under such a spot are pressed inward together: where something comes short of its place by N, all
 * that lies within reach of the skin there moves in, most at the surface and nothing at depth 0.8 + 2N, so a sheet of
 * muscle stays over its bone instead of being flattened into it; N is spread over the neighbouring skin, so the
 * pressing is a shallow dish, not a dent. Then anything still out goes straight to its place under the nearest point of
 * the skin: bone a little deeper than muscle, vessels and nerves a little shallower.
 * lining: per skin vertex, true where the skin faces into the body (the lining of the mouth): not a surface to bring
 * anything under. thin: per skin vertex, true on the hands and feet, where there is no depth to press into.
 */
export function keepUnder(skin, structures, { gap = 0.2, reach = 5, lining = null, thin = null } = {}) {
  const count = skin.positions.length / 3;
  const test = new InsideAllWays(skin, 0.25), samples = surfaceSamples(skin, 0.3, (a, b, c) => lining && (lining[a] || lining[b] || lining[c]));
  const outer = samples.points, normals = samples.normals, grid = new PointGrid(outer, 1);
  const inner = lining && new PointGrid(surfaceSamples(skin, 0.3, (a, b, c) => !(lining[a] || lining[b] || lining[c])).points, 1);
  /* a point's place against the skin: the nearest skin sample, and its depth under it (negative outside) */
  const locate = (x, y, z, within) => {
    const inside = test.inside(x, y, z);
    if (inside === null) return null;
    const [index, distance] = grid.nearest(x, y, z, inside ? within : reach);
    if (index < 0) return inside ? null : { index: -1 };
    const depth = (outer[3 * index] - x) * normals[3 * index] + (outer[3 * index + 1] - y) * normals[3 * index + 1] + (outer[3 * index + 2] - z) * normals[3 * index + 2];
    /* nearer the lining than the outer skin: in the mouth or behind the eyelids, where it belongs, unless it has come
       out past the outer skin there (a tooth through a lip) */
    if (inner && inner.nearest(x, y, z, distance)[0] >= 0 && (inside || depth > 0)) return null;
    return { index, distance, depth: inside ? depth : -distance, inside };
  };
  /* how far short of its place the worst point under each skin vertex is, capped (more than that is a stray part, not a
     layer to make room for) and spread over the neighbouring skin */
  const MOST = 0.8;
  let short = new Float32Array(count);
  for (const structure of structures) {
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) {
      const at = locate(p[k], p[k + 1], p[k + 2], gap);
      if (!at || at.index < 0 || at.depth >= gap || (at.inside && at.depth < -0.5)) continue;
      for (let c = 0; c < 3; c++) { const v = samples.corners[3 * at.index + c]; if (!thin?.[v]) short[v] = Math.max(short[v], Math.min(MOST, gap - at.depth)); }
    }
  }
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < skin.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[skin.indices[t + a]].add(skin.indices[t + b]); neighbours[skin.indices[t + b]].add(skin.indices[t + a]); }
  for (let pass = 0; pass < 3; pass++) {
    const next = Float32Array.from(short);
    for (let v = 0; v < count; v++) { if (thin?.[v]) continue; let sum = 0, top = 0; for (const w of neighbours[v]) { sum += short[w]; top = Math.max(top, short[w]); } next[v] = Math.max(short[v], 0.6 * top, neighbours[v].size ? sum / neighbours[v].size : 0); }
    short = next;
  }
  const normal = vertexNormals(skin);
  let pressed = 0;
  for (const structure of structures) {
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) {
      const at = locate(p[k], p[k + 1], p[k + 2], 0.8 + 2 * MOST);
      if (!at || at.index < 0 || (at.inside && at.depth < -0.5)) continue;
      let N = 0; const n = [0, 0, 0];
      for (let c = 0; c < 3; c++) { const v = samples.corners[3 * at.index + c], w = samples.weights[3 * at.index + c]; N += w * short[v]; for (let i = 0; i < 3; i++) n[i] += w * normal[3 * v + i]; }
      const deep = 0.8 + 2 * N;
      if (N < 0.01 || at.depth >= deep) continue;
      const move = N * (deep - Math.max(at.depth, gap - N)) / (deep - gap + N), length = Math.hypot(...n) || 1;
      for (let c = 0; c < 3; c++) p[k + c] -= move * n[c] / length;
      pressed++;
    }
  }
  const GAP = { skeleton: gap + 0.1, muscles: gap, organs: gap, vessels: gap - 0.08, nerves: gap - 0.08 };
  let moved = 0, most = 0, left = 0;
  const worst = new Map();
  for (const structure of structures) {
    const p = structure.positions, under = GAP[structure.layer] ?? gap;
    let furthest = 0;
    for (let k = 0; k < p.length; k += 3) {
      const at = locate(p[k], p[k + 1], p[k + 2], under);
      if (!at) continue;
      if (at.index < 0) { left++; continue; }
      const { index } = at;
      /* outside: straight to its place beneath the nearest skin point (on a toe or a finger, moving it down to the
         plane of that point's surface would leave it beside the toe) */
      if (!at.inside) { for (let c = 0; c < 3; c++) p[k + c] = outer[3 * index + c] - under * normals[3 * index + c]; moved++; most = Math.max(most, at.distance); furthest = Math.max(furthest, at.distance); continue; }
      if (at.depth >= under || at.depth < -0.5) continue;
      for (let c = 0; c < 3; c++) p[k + c] += (at.depth - under) * normals[3 * index + c];
      moved++;
    }
    if (furthest > 1) worst.set(structure.name, furthest);
  }
  const names = [...worst].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, by]) => `${name} ${by.toFixed(1)}`).join(', ');
  return `${pressed} points pressed inward with their layers; ${moved} then put in place, from up to ${most.toFixed(1)} cm outside; ${left} further than ${reach} cm outside left alone${names ? `; furthest out: ${names}` : ''}`;
}

/* MakeHuman's lips stand a few millimetres apart, and the teeth show in the gap as a broken line. The lips are closed:
   along the line where the outer lip turns into the lining of the mouth, the upper and lower edges meet halfway, and
   the skin around follows by less and less. Returns a line for the log. */
function closeLips(skin, weights, lining) {
  const count = skin.positions.length / 3, lip = new Float32Array(count);
  for (const [bone, list] of Object.entries(weights)) if (/^oris/.test(bone)) for (const [vertex, weight] of list) lip[vertex] += weight;
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < skin.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[skin.indices[t + a]].add(skin.indices[t + b]); neighbours[skin.indices[t + b]].add(skin.indices[t + a]); }
  const edge = [];
  for (let v = 0; v < count; v++) if (!lining[v] && lip[v] > 0.3 && [...neighbours[v]].some(w => lining[w])) edge.push(v);
  if (edge.length < 8) throw new Error('no lip line found on the skin');
  const middle = edge.reduce((sum, v) => sum + skin.positions[3 * v + 1], 0) / edge.length;
  const upper = edge.filter(v => skin.positions[3 * v + 1] > middle), lower = edge.filter(v => skin.positions[3 * v + 1] <= middle);
  let move = new Float32Array(count), widest = 0;
  const fixed = new Uint8Array(count);
  for (const [mine, others] of [[upper, lower], [lower, upper]]) for (const v of mine) {
    let nearest = -1;
    for (const w of others) if (nearest < 0 || Math.abs(skin.positions[3 * w] - skin.positions[3 * v]) < Math.abs(skin.positions[3 * nearest] - skin.positions[3 * v])) nearest = w;
    const gap = skin.positions[3 * nearest + 1] - skin.positions[3 * v + 1];
    if (Math.abs(skin.positions[3 * nearest] - skin.positions[3 * v]) > 0.6 || (mine === upper ? gap > 0 : gap < 0)) continue;   // the corner of the mouth, or already met
    move[v] = gap / 2; fixed[v] = 1; widest = Math.max(widest, Math.abs(gap));
  }
  /* the skin around follows: each ring of neighbours by the average of what moved beside it, fading over four rings */
  for (let ring = 0; ring < 4; ring++) {
    const next = Float32Array.from(move);
    for (let v = 0; v < count; v++) {
      if (fixed[v]) continue;
      let sum = 0, n = 0;
      for (const w of neighbours[v]) { sum += move[w]; n++; }
      if (n) next[v] = 0.7 * sum / n;
    }
    move = next;
  }
  for (let v = 0; v < count; v++) skin.positions[3 * v + 1] += move[v];
  return `${upper.length + lower.length} vertices along the lip line, up to ${widest.toFixed(2)} cm apart`;
}

/* how far each vertex belongs to the head, a hand or a foot (0 to 1), from MakeHuman's skin weights: these fade over
   the neck, wrist and ankle */
function ownShare(body, segment) {
  const END = /^(head|jaw|eye|tongue|levator|oculi|orbicularis|oris|risorius|special|temporalis|wrist|finger|metacarpal|foot|toe)/;
  const ends = new Float32Array(body.count), total = new Float32Array(body.count);
  const isEnd = name => END.test(name) || (body.bones[name].parent ? isEnd(body.bones[name].parent) : false);
  for (const [bone, list] of Object.entries(body.weights)) { const end = isEnd(bone); for (const [vertex, weight] of list) { total[vertex] += weight; if (end) ends[vertex] += weight; } }
  return ends.map((value, v) => (total[v] ? value / total[v] : 0));
}
const endOf = segment => (/^(hand|foot)/.test(segment) ? segment : /^(lowerForeArm|foreArm)/.test(segment) ? 'hand' + segment.at(-1) : /^(lowerShin|shin)/.test(segment) ? 'foot' + segment.at(-1) : 'head');

/**
 * structures: the source body, [{ name, layer, positions, indices }], positions changed in place; its 'Skin' takes the
 *   new skin's positions and indices
 * folder: the MakeHuman files; sourceTargets: the morph targets nearest the source body; targets: the new body's
 * Returns { segment: each new skin vertex's body segment, lining: 1 where it lines the mouth or an eye socket, breast: its
 *   share of the breast (0 to 1) }
 */
export function transfer(structures, folder, sourceTargets, targets, { height = null, log = console.log } = {}) {
  const named = (layer, name, { optional = false } = {}) => {
    const found = structures.find(structure => structure.layer === layer && structure.name === name);
    if (!found && optional) return null;
    if (!found) throw new Error(`no ${name} in the ${layer}`);
    return found.positions;
  };
  const skin = structures.find(structure => structure.layer === 'skin' && structure.name === 'Skin');
  const target = landmarks(named);
  const like = readMakeHuman(folder, sourceTargets), body = readMakeHuman(folder, targets);
  log('MakeHuman posed to the source skeleton:');
  const posed = poseMakeHuman(like, target, line => log(line));
  const HAND_OR_FOOT = /^(hand|foot)/;
  /* MakeHuman's skin runs on inside the head: a pouch behind each pair of eyelids, and the lining of the mouth. Those
     vertices are no part of anyone's outer skin, so they are neither drawn onto his nor used as marks. A vertex is one
     of them if a short step out along its normal is still inside the head. */
  const lining = new Uint8Array(like.count);
  {
    const rest = { positions: like.positions, indices: like.indices }, test = new InsideTest(rest, 0.25), normal = vertexNormals(rest);
    for (let v = 0; v < like.count; v++) if (posed.segment[v] === 'head' && test.inside(like.positions[3 * v] + 0.4 * normal[3 * v], like.positions[3 * v + 1] + 0.4 * normal[3 * v + 1], like.positions[3 * v + 2] + 0.4 * normal[3 * v + 2]) !== false) lining[v] = 1;
    log(`${lining.reduce((sum, value) => sum + value, 0)} vertices line the eye sockets and mouth`);
  }
  log('and drawn onto the source skin:');
  const onSkin = drawOnto({ positions: posed.positions, indices: like.indices }, skin, { free: v => !HAND_OR_FOOT.test(posed.segment[v]) && !lining[v], log });
  /* The new skin: his own skin, changed by what separates the two MakeHuman shapes in this pose, so the pose's own
     flaws (a twisted forearm, a trunk a little too narrow), which both shapes share, cancel. The head, hands and feet
     are MakeHuman's own: his face would stay his under the change, and his fingers were not drawn onto. There, only
     the average of that correction around the neck, wrist or ankle is kept, so they sit right on the body. */
  const there = posed.poseOther(body), fresh = new Float32Array(there.positions.length);
  const own = ownShare(body, posed.segment);
  const ends = {};
  for (let v = 0; v < body.count; v++) {
    if (own[v] < 0.15 || own[v] > 0.85) continue;
    const end = (ends[endOf(posed.segment[v])] ||= [0, 0, 0, 0]);
    for (let c = 0; c < 3; c++) end[c] += onSkin.positions[3 * v + c] - posed.positions[3 * v + c];
    end[3]++;
  }
  for (let v = 0; v < body.count; v++) {
    const end = ends[endOf(posed.segment[v])];
    for (let c = 0; c < 3; c++) {
      const correction = onSkin.positions[3 * v + c] - posed.positions[3 * v + c];
      fresh[3 * v + c] = there.positions[3 * v + c] + (1 - own[v]) * correction + own[v] * (end ? end[c] / end[3] : correction);
    }
  }
  log(`lips closed: ${closeLips({ positions: fresh, indices: body.indices }, body.weights, lining)}`);

  /* ---------- the pairs: each vertex's place on the source skin, to its place on the new skin ---------- */
  const from = [], to = [];
  const breast = new Float32Array(body.count);
  for (const side of ['L', 'R']) for (const [vertex, weight] of body.weights[`breast.${side}`] || []) breast[vertex] += weight;
  const taken = new Set();
  let skinPairs = 0, move = 0;
  for (let v = 0; v < body.count; v++) {
    if (HAND_OR_FOOT.test(posed.segment[v]) || lining[v] || breast[v] > 0.2) continue;
    const a = [onSkin.positions[3 * v], onSkin.positions[3 * v + 1], onSkin.positions[3 * v + 2]];
    const key = a.map(value => Math.floor(value / (posed.segment[v] === 'head' ? 1.2 : 2.4))).join(',');
    if (taken.has(key)) continue;
    taken.add(key);
    const b = [fresh[3 * v], fresh[3 * v + 1], fresh[3 * v + 2]];
    from.push(...a); to.push(...b); skinPairs++; move += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  /* his eyes onto MakeHuman's, so they sit in its eyelids */
  for (const side of ['L', 'R']) { from.push(...target['eye' + side]); to.push(...there.place(`eye.${side}`, body.bones[`eye.${side}`].head).map((value, c) => value + ends.head[c] / ends.head[3])); }
  /* the hands and feet, joint by joint: the bones' ends onto MakeHuman's joints */
  const joints = handAndFootPairs(named, target, body.bones, landmarksOf(body), there.place);
  for (const [a, b] of joints) { from.push(...a); to.push(...b); }
  log(`${skinPairs} skin points move by ${(move / skinPairs).toFixed(1)} cm on average; ${joints.length} hand and foot joints`);

  const spline = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 0.3);
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
  log(`everything inside moved by up to ${most.toFixed(1)} cm`);
  skin.positions = fresh; skin.indices = body.indices;
  log(`hands and feet fitted joint by joint: ${fitHandsAndFeet(structures.filter(structure => structure !== skin), named, landmarks(named), body.bones, landmarksOf(body), there.place)}`);
  /* each eyeball goes exactly into MakeHuman's eye: centred where its eye sits and sized to lie just under its lids */
  for (const [side, word] of [['L', 'Left'], ['R', 'Right']]) {
    const centre = there.place(`eye.${side}`, body.bones[`eye.${side}`].head).map((value, c) => value + ends.head[c] / ends.head[3]);
    const lids = [];
    for (const bone of [`orbicularis03.${side}`, `orbicularis04.${side}`]) for (const [v, weight] of body.weights[bone]) if (weight > 0.5 && !lining[v]) lids.push(Math.hypot(fresh[3 * v] - centre[0], fresh[3 * v + 1] - centre[1], fresh[3 * v + 2] - centre[2]));
    lids.sort((a, b) => a - b);
    /* his eyeball: the middle of the white of the eye, and half its width and height (front to back it carries the
       stump of the optic nerve) */
    const sclera = named('organs', `${word} sclera`), low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < sclera.length; k++) { low[k % 3] = Math.min(low[k % 3], sclera[k]); high[k % 3] = Math.max(high[k % 3], sclera[k]); }
    const from = low.map((value, c) => (value + high[c]) / 2), radius = (high[0] - low[0] + high[1] - low[1]) / 4;
    const factor = (lids[Math.floor(0.1 * lids.length)] - 0.07) / radius;
    let parts = 0;
    for (const structure of structures) {
      if (!isGlobe(structure) || !new RegExp(`\\b${word}\\b`, 'i').test(structure.name)) continue;
      const p = structure.positions;
      for (let k = 0; k < p.length; k += 3) for (let c = 0; c < 3; c++) p[k + c] = centre[c] + factor * (p[k + c] - from[c]);
      parts++;
    }
    log(`${word.toLowerCase()} eye: ${parts} parts moved ${Math.hypot(centre[0] - from[0], centre[1] - from[1], centre[2] - from[2]).toFixed(2)} cm into the lids, sized ×${factor.toFixed(2)}`);
  }
  log(`kept under the skin: ${keepUnder(skin, structures.filter(structure => structure !== skin && !isGlobe(structure)), { lining, thin: Uint8Array.from(posed.segment, name => (HAND_OR_FOOT.test(name) ? 1 : 0)) })}`);
  if (height) {
    const factor = height / fresh.reduce((top, value, k) => (k % 3 === 1 ? Math.max(top, value) : top), 0);
    for (const structure of structures) for (let k = 0; k < structure.positions.length; k++) structure.positions[k] *= factor;
    log(`scaled by ${factor.toFixed(3)} to stand ${height} cm tall`);
  }
  return { segment: posed.segment, lining, breast };
}
