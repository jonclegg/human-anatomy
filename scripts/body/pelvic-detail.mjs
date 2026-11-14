// Her vulva, clitoris, urethra and the glands and muscles around them: the close-up pelvic model (site/index.html,
// built in code from published measurements; export-pelvic-detail.mjs writes its meshes), placed in her pelvis.
// That model is built around the Human Reference Atlas female pelvis, the same scan whose organs the female build fits
// into her, so one map carries both: the model's frame to the scan's (hra-frame.mjs), then the scan's pelvis onto hers.
import { readFileSync, existsSync } from 'node:fs';
import { fromModel } from '../hra-frame.mjs';
import { FRAMES, toModel } from './hra.mjs';
import { PointGrid, thinPlateSpline, spread } from './fit.mjs';
import { vertexNormals } from './clearance.mjs';
import { Surface } from './transfer.mjs';
import { bounds, compact } from './mesh.mjs';

const FILE = new URL('../../build/pelvic-detail.json', import.meta.url);

/* what she takes from the close-up model, and its name in her; a pair is split or told apart by side */
const TAKEN = [
  ['glans', 'Glans of clitoris'], ['clitBody', 'Body of clitoris'], ['crura', 'crus of clitoris', 'sides'], ['bulbs', 'bulb of vestibule', 'sides'],
  ['hood', 'Prepuce of clitoris'], ['labiaMinora', 'labium minus', 'sides'], ['vestibule', 'Vestibule of vagina'], ['hymen', 'Hymen'],
  ['meatus', 'External urethral orifice'], ['urethra', 'Urethra', null, 'organs', 'urinary'], ['vagina', 'Vagina'],
  ['bartholin', 'greater vestibular gland', 'sides'], ['skene', 'paraurethral gland', 'sides'],
  ['bulbospongiosus', 'bulbospongiosus', 'sides', 'muscles', 'pelvis'], ['ischiocavernosus', 'ischiocavernosus', 'sides', 'muscles', 'pelvis'], ['perinealBody', 'Perineal body', null, 'muscles', 'pelvis'],
];

const join = meshes => {
  const positions = [], detail = [], indices = [];
  for (const mesh of meshes) { const base = positions.length / 3; positions.push(...mesh.positions); detail.push(...mesh.detail); for (const index of mesh.indices) indices.push(base + index); }
  return { positions: Float32Array.from(positions), detail: Float32Array.from(detail), indices: Uint32Array.from(indices) };
};
/* the triangles of a mesh on one side of the model's midline (its own x, before it was placed) */
const sideOf = (mesh, sign) => {
  const indices = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const x = mesh.detail[3 * mesh.indices[t]] + mesh.detail[3 * mesh.indices[t + 1]] + mesh.detail[3 * mesh.indices[t + 2]];
    if (x * sign > 0) indices.push(mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
  }
  return { positions: mesh.positions, detail: mesh.detail, indices: Uint32Array.from(indices) };
};

/* The page draws most of its shapes from both sides, and many are wound inside out. Here each faces outward: a closed
   shape encloses a positive volume; an open sheet of the surface faces away from the body (the model's +z). */
const SHEETS = ['skin', 'vestibule', 'hood'];
function facingOut({ positions: p, indices }, sheet) {
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => indices[t + k] * 3);
    total += sheet ? (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])
      : p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  if (total >= 0) return indices;
  const turned = indices.slice();
  for (let t = 0; t < turned.length; t += 3) { turned[t + 1] = indices[t + 2]; turned[t + 2] = indices[t + 1]; }
  return turned;
}

/**
 * The close-up model's meshes in her body. scanToHer(x, y, z) carries the scan's body frame onto hers. The model is
 * symmetric about its midline, and her midline is x = 0: each point keeps its distance from the model's midline.
 * Returns { id: one joined mesh { positions, detail (the model's own frame), indices } }, and outward (not listed
 * among the ids): the model's outward axis in her frame.
 */
export function readDetail(scanToHer) {
  if (!existsSync(FILE)) throw new Error('build/pelvic-detail.json is missing: run node scripts/body/export-pelvic-detail.mjs first');
  const route = (x, y, z) => scanToHer(...toModel(FRAMES.female, fromModel([x, y, z])));
  const place = (x, y, z) => { const p = route(x, y, z), middle = route(0, y, z); return [p[0] - middle[0], p[1], p[2]]; };
  const out = {};
  /* the model's outward axis (its +z, out of the vulva's surface) in her frame */
  const from = place(0, 0, 0), to = place(0, 0, 1), length = Math.hypot(...to.map((value, c) => value - from[c]));
  Object.defineProperty(out, 'outward', { value: to.map((value, c) => (value - from[c]) / length) });
  for (const [id, meshes] of Object.entries(JSON.parse(readFileSync(FILE, 'utf8')))) {
    out[id] = join(meshes.map(mesh => {
      const positions = new Float32Array(mesh.positions.length);
      for (let k = 0; k < positions.length; k += 3) positions.set(place(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]), k);
      return { positions, detail: mesh.positions, indices: facingOut(mesh, SHEETS.includes(id)) };
    }));
  }
  return out;
}

/* the parts she takes, named: [{ name, layer, group, positions, indices }] */
export function detailParts(detail) {
  const parts = [];
  for (const [id, name, sides, layer = 'organs', group = 'reproductive'] of TAKEN) {
    const mesh = detail[id];
    if (!mesh) throw new Error(`the close-up model has no ${id}`);
    for (const [word, sign] of sides ? [['Left', 1], ['Right', -1]] : [[null, 0]]) {
      const piece = compact(word ? sideOf(mesh, sign) : mesh);
      if (!piece.indices.length) throw new Error(`the close-up model's ${id} has nothing on the ${word.toLowerCase()}`);
      parts.push({ name: word ? `${word} ${name}` : name, layer, group, positions: piece.positions, indices: piece.indices });
    }
  }
  return parts;
}

/* the middle of a tube at even steps up the body */
function centreline(meshes, steps) {
  const points = meshes.flatMap(mesh => Array.from({ length: mesh.positions.length / 3 }, (_, k) => [mesh.positions[3 * k], mesh.positions[3 * k + 1], mesh.positions[3 * k + 2]]));
  const low = Math.min(...points.map(p => p[1])), high = Math.max(...points.map(p => p[1])), line = [];
  for (let k = 0; k < steps; k++) {
    const slice = points.filter(p => p[1] >= low + (high - low) * k / steps && p[1] <= low + (high - low) * (k + 1) / steps);
    line.push([0, 1, 2].map(c => slice.reduce((sum, p) => sum + p[c], 0) / slice.length));
  }
  return line;
}
const middleOf = meshes => { const { min, max } = bounds(Float32Array.from(meshes.flatMap(mesh => [...mesh.positions]))); return min.map((value, c) => (value + max[c]) / 2); };

/**
 * The scan's vagina was fitted into her between the bladder and the rectum, which are the man's; its lower end comes
 * out well in front of the opening her pelvic bones give her. This is the correction, in her frame: the scanned
 * vagina's middle line onto the close-up model's (which runs from that opening), the cervix and uterus onto the
 * model's, and her pelvic bones held where they are. scanned: her scanned organs, already in her; bones: her pelvis.
 */
export function meetOpening(scanned, detail, bones, log = console.log) {
  const named = pattern => { const found = scanned.filter(mesh => pattern.test(mesh.name)); if (!found.length) throw new Error(`nothing scanned matches ${pattern}`); return found; };
  const from = [], to = [];
  const STEPS = 6, theirs = centreline(named(/^Vagina$/), STEPS), model = centreline([detail.vagina], STEPS);
  theirs.forEach((point, k) => { from.push(...point); to.push(...model[k]); });
  for (const [pattern, id] of [[/^Cervix$/, 'cervix'], [/^Body of uterus$/, 'uterus']]) { from.push(...middleOf(named(pattern))); to.push(...middleOf([detail[id]])); }
  log(`  scanned vagina brought to her opening: its lower end moves ${Math.hypot(...theirs[0].map((value, c) => value - model[0][c])).toFixed(1)} cm, its upper end ${Math.hypot(...theirs[STEPS - 1].map((value, c) => value - model[STEPS - 1][c])).toFixed(1)} cm`);
  const fixed = spread(Float32Array.from(bones.flatMap(mesh => [...mesh.positions])), 4);
  from.push(...fixed); to.push(...fixed);
  return thinPlateSpline(Float64Array.from(from), Float64Array.from(to), 0.3);
}

/* the middle of one of the model's parts (the mean of its points) */
export const partCentre = (detail, id) => { if (!detail[id]) throw new Error(`the close-up model has no ${id}`); const p = detail[id].positions, n = p.length / 3, m = [0, 0, 0]; for (let k = 0; k < p.length; k++) m[k % 3] += p[k] / n; return m; };

/**
 * The model comes into her by the map that fits the scan's pelvis to hers, and lies as her pelvic bones lie: they are
 * a man's, scanned on his back, and rocked back some thirty degrees, so the vulva came out tilted, its clitoris at
 * the bottom of her crotch and its opening right under her anus. The model is seated on her skin: turned and moved
 * as one rigid piece in the body's midplane (front to back and up and down), so that the first of two of its points comes to its
 * place and the second lies toward its own, as near as their distance apart allows. anchors: [[from, to], [from, to]],
 * each a point [x, y, z]. All of it moves
 * together, so its parts keep their fit to one another (moved less with depth, the bulbs and crura stood out behind
 * the vulva); her scanned organs are then brought to it (meetOpening). The outward axis turns with it. Returns the
 * turn (degrees) and how far each anchor moved (cm), for the log.
 */
/** The way the model's own layout runs forward in the body, as it lies now: from the back of its skin sheet to the front. */
export function layoutForward(detail) {
  const sheet = detail.skin, count = sheet.positions.length / 3, mean = [0, 0, 0, 0], along = [0, 0, 0];
  for (let v = 0; v < count; v++) { mean[3] += sheet.detail[3 * v + 1] / count; for (let c = 0; c < 3; c++) mean[c] += sheet.positions[3 * v + c] / count; }
  for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) along[c] += (sheet.detail[3 * v + 1] - mean[3]) * (sheet.positions[3 * v + c] - mean[c]);
  const length = Math.hypot(...along);
  return along.map(value => value / length);
}

export function seat(detail, anchors) {
  const from = anchors.map(([place]) => place), to = anchors.map(([, place]) => place);
  /* in the midplane: (front, up) = (z, y) */
  const angle = v => Math.atan2(v[1], v[2]), along = (a, b) => [0, b[1] - a[1], b[2] - a[2]];
  const turn = angle(along(to[0], to[1])) - angle(along(from[0], from[1])), cos = Math.cos(turn), sin = Math.sin(turn);
  const centreFrom = from[0], centreTo = to[0];
  const rotate = (y, z) => [y * cos + z * sin, -y * sin + z * cos];   // (z, y) turned by `turn`
  const move = ([x, y, z]) => { const [ry, rz] = rotate(y - centreFrom[1], z - centreFrom[2]); return [x, centreTo[1] + ry, centreTo[2] + rz]; };
  for (const mesh of Object.values(detail)) for (let k = 0; k < mesh.positions.length; k += 3) mesh.positions.set(move([mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]]), k);
  [detail.outward[1], detail.outward[2]] = rotate(detail.outward[1], detail.outward[2]);
  return { turn: ((turn * 180 / Math.PI + 540) % 360) - 180, moved: from.map(point => Math.hypot(...move(point).map((value, c) => value - point[c]))) };
}

/** The vulva was modelled lying open, six centimetres across; she stands with her thighs together, and the cleft of
 *  her crotch between them is half that. Its outer lips are pressed together as her thighs press them: what lies
 *  beside the midline is drawn toward it, so that what was WIDE from the midline comes to halfWidth; the middle
 *  (clitoris, inner lips, openings) keeps its width, and so does what lies deep (crura, bulbs, vagina). */
export function pressTogether(detail, halfWidth) {
  const MIDDLE = 0.4, WIDE = 2.4, FULLY = 1, NOT_AT_ALL = 3;   // cm from the midline; cm under the surface
  if (halfWidth <= MIDDLE) throw new Error(`her crotch is ${(2 * halfWidth).toFixed(1)} cm wide: no room for a vulva`);
  if (halfWidth >= WIDE) return;
  const rate = (halfWidth - MIDDLE) / (WIDE - MIDDLE);
  for (const mesh of Object.values(detail)) for (let k = 0; k < mesh.positions.length; k += 3) {
    const x = mesh.positions[k], from = Math.abs(x);
    if (from <= MIDDLE) continue;
    const t = Math.min(1, Math.max(0, (-mesh.detail[k + 2] - FULLY) / (NOT_AT_ALL - FULLY))), share = 1 - t * t * (3 - 2 * t);
    mesh.positions[k] = Math.sign(x) * (from + share * (MIDDLE + (from - MIDDLE) * rate - from));
  }
}

/** The crura of the clitoris run back along the pubic arch, each fixed under the edge of its ischiopubic ramus, with
 *  the ischiocavernosus over it. Seated with the vulva they ran straight out to the side and rose, across the arch:
 *  2 cm above the bone's edge by its outer end, and into the bone. Each is let down to hang under the edge of her own
 *  ramus: at each distance from her midline, by what its top stands above GAP cm under the lowest of her hip bone
 *  beside it; never raised, and not at all at its inner end, where it joins the body of the clitoris. bones: her hip
 *  bones. Returns the most any part was let down (cm). */
export function hangUnderArch(detail, bones) {
  const GAP = 0.3, STEP = 0.5, BESIDE = 1, parts = [detail.crura, detail.ischiocavernosus];
  const crura = detail.crura.positions, bins = new Map();
  for (let k = 0; k < crura.length; k += 3) { const bin = Math.round(Math.abs(crura[k]) / STEP), had = bins.get(bin) || { top: -Infinity, back: Infinity, front: -Infinity }; had.top = Math.max(had.top, crura[k + 1]); had.back = Math.min(had.back, crura[k + 2]); had.front = Math.max(had.front, crura[k + 2]); bins.set(bin, had); }
  for (const [bin, crus] of bins) {
    let edge = Infinity;
    for (const bone of bones) for (let k = 0; k < bone.positions.length; k += 3) if (Math.abs(Math.abs(bone.positions[k]) - bin * STEP) <= STEP && bone.positions[k + 2] > crus.back - BESIDE && bone.positions[k + 2] < crus.front + BESIDE) edge = Math.min(edge, bone.positions[k + 1]);
    crus.down = edge === Infinity ? 0 : Math.max(0, crus.top - (edge - GAP));
  }
  /* evened along the crus, and never more at one place than further out, so it runs down and back without a kink */
  const order = [...bins.keys()].sort((a, b) => a - b), down = order.map(bin => bins.get(bin).down);
  down[0] = 0;
  for (let i = 1; i < down.length; i++) down[i] = Math.max(down[i], down[i - 1]);
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i + 1 < down.length; i++) down[i] = (down[i - 1] + 2 * down[i] + down[i + 1]) / 4;
  const at = x => { const place = Math.abs(x) / STEP - order[0], i = Math.min(down.length - 2, Math.max(0, Math.floor(place))), t = Math.min(1, Math.max(0, place - i)); return down.length < 2 ? down[0] : down[i] + (down[i + 1] - down[i]) * t; };
  for (const mesh of parts) for (let k = 0; k < mesh.positions.length; k += 3) mesh.positions[k + 1] -= at(mesh.positions[k]);
  return Math.max(...down);
}

/* the urethra's upper end is drawn up to the bladder it drains: each point moves by its share of the way up the tube.
   The bladder's neck is the middle of its lowest part, and the urethra's end the middle of its highest: each point
   counts the more the nearer it is to the very bottom (or top), so neither middle jumps when one point of a coarse
   mesh rises or sinks past a line. */
export function joinToBladder(urethra, bladder) {
  const middle = (positions, from, sign, depth) => {
    const sum = [0, 0, 0]; let total = 0;
    for (let k = 0; k < positions.length; k += 3) {
      const weight = Math.max(0, 1 - sign * (positions[k + 1] - from) / depth) ** 2;
      for (let c = 0; c < 3; c++) sum[c] += weight * positions[k + c];
      total += weight;
    }
    return sum.map(value => value / total);
  };
  const { min, max } = bounds(urethra.positions);
  const neck = middle(bladder.positions, bounds(bladder.positions).min[1], 1, 0.4), top = middle(urethra.positions, max[1], -1, 0.3);
  const shift = [0, 1, 2].map(c => neck[c] - top[c]);
  shift[1] += 0.3;   // its end sits just inside the bladder's floor
  for (let k = 0; k < urethra.positions.length; k += 3) {
    const share = ((urethra.positions[k + 1] - min[1]) / (max[1] - min[1])) ** 2;
    for (let c = 0; c < 3; c++) urethra.positions[k + c] += share * shift[c];
  }
  return Math.hypot(...shift);
}

/* A mesh with the triangles that have a corner where near(x, y, z) holds split in four, a number of times. Each new
   vertex, in the middle of an edge, takes the mean of the two ends' normals, and is lifted onto the curve those normals
   describe (Phong tessellation): the finer skin is rounder, and is shaded just as the coarse skin was, so no edge shows
   where the finer skin begins. An edge shared with an undivided triangle stays straight. Returns the normals too. */
const ROUNDING = 0.75;
function dividedWhere({ positions, indices }, near, rounds) {
  const points = Array.from(positions), normals = Array.from(vertexNormals({ positions, indices }));
  let triangles = Array.from(indices);
  for (let round = 0; round < rounds; round++) {
    const close = new Map(), isNear = v => { if (!close.has(v)) close.set(v, near(points[3 * v], points[3 * v + 1], points[3 * v + 2])); return close.get(v); };
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const divided = [], sharedWithWhole = new Set();
    for (let t = 0; t < triangles.length; t += 3) {
      divided.push(isNear(triangles[t]) || isNear(triangles[t + 1]) || isNear(triangles[t + 2]));
      if (!divided[t / 3]) for (let k = 0; k < 3; k++) sharedWithWhole.add(key(triangles[t + k], triangles[t + (k + 1) % 3]));
    }
    const middles = new Map(), next = [];
    const middle = (a, b) => {
      const name = key(a, b);
      if (!middles.has(name)) {
        const p = [0, 1, 2].map(c => (points[3 * a + c] + points[3 * b + c]) / 2);
        if (!sharedWithWhole.has(name)) {
          const lift = [0, 0, 0];
          for (const end of [a, b]) { const off = [0, 1, 2].reduce((sum, c) => sum + (p[c] - points[3 * end + c]) * normals[3 * end + c], 0); for (let c = 0; c < 3; c++) lift[c] -= off * normals[3 * end + c] / 2; }
          for (let c = 0; c < 3; c++) p[c] += ROUNDING * lift[c];
        }
        const n = [0, 1, 2].map(c => normals[3 * a + c] + normals[3 * b + c]), length = Math.hypot(...n) || 1;
        middles.set(name, points.length / 3); points.push(...p); normals.push(...n.map(value => value / length));
      }
      return middles.get(name);
    };
    for (let t = 0; t < triangles.length; t += 3) {
      if (!divided[t / 3]) continue;
      const [a, b, c] = triangles.slice(t, t + 3), ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    /* an undivided triangle beside a divided one takes the new vertex on the edge they share, so no gap can open there */
    for (let t = 0; t < triangles.length; t += 3) {
      if (divided[t / 3]) continue;
      const corners = triangles.slice(t, t + 3), split = [0, 1, 2].map(k => middles.get(key(corners[k], corners[(k + 1) % 3])));
      const count = split.filter(value => value !== undefined).length;
      if (count === 0) { next.push(...corners); continue; }
      if (count === 3) { const [a, b, c] = corners, [ab, bc, ca] = split; next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
      /* turn the triangle so its first edge is a split one */
      const first = count === 1 ? split.findIndex(value => value !== undefined) : [0, 1, 2].find(k => split[k] !== undefined && split[(k + 1) % 3] !== undefined);
      const [a, b, c] = [0, 1, 2].map(k => corners[(first + k) % 3]), ab = split[first], bc = split[(first + 1) % 3];
      if (count === 1) next.push(a, ab, c, ab, b, c);
      else next.push(a, ab, c, ab, bc, c, ab, b, bc);
    }
    triangles = next;
  }
  return { positions: Float32Array.from(points), normals: Float32Array.from(normals), indices: Uint32Array.from(triangles) };
}
/* a mesh without the vertices no triangle uses, its normals kept */
function compactWithNormals({ positions, normals, indices }) {
  const remap = new Int32Array(positions.length / 3).fill(-1), keptPositions = [], keptNormals = [], out = new Uint32Array(indices.length);
  for (let t = 0; t < indices.length; t++) {
    const v = indices[t];
    if (remap[v] < 0) { remap[v] = keptPositions.length / 3; keptPositions.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); keptNormals.push(normals[3 * v], normals[3 * v + 1], normals[3 * v + 2]); }
    out[t] = remap[v];
  }
  return { positions: Float32Array.from(keptPositions), normals: Float32Array.from(keptNormals), indices: out };
}

/** What of the vulva's inner parts still reaches her skin there, or passes it, goes straight in under it: each such
 *  point to gap cm under the nearest point of her skin. (The cleft is a centimetre wide, and the general test for
 *  what lies outside the skin, made for whole limbs, calls a point inside the cleft inside her.)
 *  Returns how many moves were made and the furthest (cm). */
export function tuckUnder(skin, parts, gap) {
  const surface = new Surface(skin), at = [0, 0, 0];
  let count = 0, furthest = 0;
  /* how far a point must go in, and which way: null if it is deep enough or nowhere near her skin */
  const short = (x, y, z) => {
    if (surface.nearestFacing(x, y, z, 0, 0, 0, -2, 1, at) === Infinity) return null;
    const n = surface.normals.subarray(3 * surface.found, 3 * surface.found + 3), depth = (at[0] - x) * n[0] + (at[1] - y) * n[1] + (at[2] - z) * n[2];
    return depth >= gap ? null : [-(gap - depth) * n[0], -(gap - depth) * n[1], -(gap - depth) * n[2]];
  };
  for (const part of parts) {
    const p = part.positions;
    for (let round = 0; round < 4; round++) {
      const moves = new Map(), take = (v, move) => { const had = moves.get(v); if (!had || Math.hypot(...move) > Math.hypot(...had)) moves.set(v, move); };
      for (let v = 0; v < p.length / 3; v++) { const move = short(p[3 * v], p[3 * v + 1], p[3 * v + 2]); if (move) take(v, move); }
      /* a triangle whose corners are all under her skin can still cross the cleft between them: its middle and the
         middles of its edges are tested too, and take its corners in with them */
      for (let t = 0; t < part.indices.length; t += 3) {
        const corners = [part.indices[t], part.indices[t + 1], part.indices[t + 2]], point = weights => [0, 1, 2].map(c => corners.reduce((sum, v, k) => sum + weights[k] * p[3 * v + c], 0));
        for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) { const move = short(...point(weights)); if (move) for (const v of corners) take(v, move); }
      }
      if (!moves.size) break;
      for (const [v, move] of moves) { for (let c = 0; c < 3; c++) p[3 * v + c] += move[c]; furthest = Math.max(furthest, Math.hypot(...move)); }
      count += moves.size;
    }
  }
  return `${count} moves, by up to ${furthest.toFixed(2)} cm`;
}

/**
 * The outside of her vulva is her own skin. Standing, the outer lips lie closed between her thighs, and all that
 * shows is skin with a cleft down its middle: the modelled sheet of skin, drawn open over the inner lips and the
 * vestibule, made her crotch a display of what lies inside. So the sheet is not drawn. It marks where on her skin the
 * vulva lies: her skin there is given the cleft, and is named in the parts an atlas names (the mons and the two outer
 * lips); the inner lips, clitoris and openings lie under it (build-female.mjs keeps them under).
 * Returns { skin: her skin without those parts, parts: them, whole: her skin with them, as one closed surface }.
 */
const RINGS = 131, SPOKES = 240;                 // the sheet's grid (SKIN_GRID in site/index.html): vertex = ring * SPOKES + spoke
const RX = 3.0, CY = 1.25, FRONT = 5.25, BACK = 4.2;   // the vulva's outline on the layout (cm): half an ellipse forward to the top of the mons, half back to just behind the fourchette
const OVER = 2;                                  // cm from the sheet within which her skin, facing as the vulva does, is the skin over it
const CLEFT_HALF = 0.3, CLEFT_DEPTH = 0.35;      // the cleft between the outer lips: half its width and its depth (cm), a rounded groove
const CLEFT_BACK = -2.6, CLEFT_FRONT = 4.2, CLEFT_ENDS = 1.6;   // where it runs on the layout, from the fourchette to the front of the lips, and over how far it shallows at each end
const MONS_FROM = 3.9;                           // forward of this on the layout the skin is the mons
export function vulvaSkin(skin, detail, outward, log = console.log) {
  const sheet = detail.skin, count = sheet.positions.length / 3;
  if (count !== RINGS * SPOKES) throw new Error(`the close-up model's skin sheet has ${count} vertices, not ${RINGS} rings of ${SPOKES}`);
  const reach = v => Math.hypot(sheet.detail[3 * v] / RX, (sheet.detail[3 * v + 1] - CY) / (sheet.detail[3 * v + 1] > CY ? FRONT : BACK));
  const inside = []; for (let v = 0; v < count; v++) if (reach(v) <= 1) inside.push(v);
  const around = new PointGrid(Float32Array.from(inside.flatMap(v => [sheet.positions[3 * v], sheet.positions[3 * v + 1], sheet.positions[3 * v + 2]])), 0.5);
  /* her own skin is coarse there (triangles a centimetre across): it is divided finer, so the cleft has a shape */
  const fine = dividedWhere(skin, (x, y, z) => around.nearest(x, y, z, OVER + 0.2)[0] >= 0, 3), vertices = fine.positions.length / 3;
  /* each vertex of her skin over the vulva: the sheet's vertex nearest it (the skin of a thigh faces across the vulva, not as it does) */
  const place = new Int32Array(vertices).fill(-1);
  for (let v = 0; v < vertices; v++) {
    if (fine.normals[3 * v] * outward[0] + fine.normals[3 * v + 1] * outward[1] + fine.normals[3 * v + 2] * outward[2] < 0.1) continue;
    const [index] = around.nearest(fine.positions[3 * v], fine.positions[3 * v + 1], fine.positions[3 * v + 2], OVER);
    if (index >= 0) place[v] = inside[index];
  }
  let cleft = 0;
  for (let v = 0; v < vertices; v++) {
    if (place[v] < 0) continue;
    const forward = sheet.detail[3 * place[v] + 1], x = fine.positions[3 * v], across = Math.abs(x) < CLEFT_HALF ? Math.cos(Math.PI * x / (2 * CLEFT_HALF)) ** 2 : 0, along = Math.min(1, (forward - CLEFT_BACK) / CLEFT_ENDS, (CLEFT_FRONT - forward) / CLEFT_ENDS);
    if (across <= 0 || along <= 0) continue;
    for (let c = 0; c < 3; c++) fine.positions[3 * v + c] -= CLEFT_DEPTH * across * along * outward[c];
    /* its walls face the midline: the skin's own shading there, leaned over by the cleft's slope */
    fine.normals[3 * v] -= CLEFT_DEPTH * along * Math.PI / (2 * CLEFT_HALF) * Math.sin(Math.PI * x / CLEFT_HALF);
    const length = Math.hypot(fine.normals[3 * v], fine.normals[3 * v + 1], fine.normals[3 * v + 2]);
    for (let c = 0; c < 3; c++) fine.normals[3 * v + c] /= length;
    cleft++;
  }
  if (!cleft) throw new Error('none of her skin lies over the vulva\'s midline: no cleft made');
  const groups = { 'Mons pubis': [], 'Left labium majus': [], 'Right labium majus': [] }, rest = [];
  for (let t = 0; t < fine.indices.length; t += 3) {
    const corners = [fine.indices[t], fine.indices[t + 1], fine.indices[t + 2]];
    if (corners.some(v => place[v] < 0)) { rest.push(...corners); continue; }
    const forward = corners.reduce((sum, v) => sum + sheet.detail[3 * place[v] + 1], 0) / 3, x = corners.reduce((sum, v) => sum + fine.positions[3 * v], 0);
    groups[forward > MONS_FROM ? 'Mons pubis' : x > 0 ? 'Left labium majus' : 'Right labium majus'].push(...corners);
  }
  for (const [name, indices] of Object.entries(groups)) if (!indices.length) throw new Error(`none of her skin to name ${name}`);
  log(`  vulva: her own skin over it, with a cleft ${CLEFT_DEPTH} cm deep (${cleft} vertices); ${Object.entries(groups).map(([name, indices]) => `${name} ${indices.length / 3} triangles`).join(', ')}`);
  return {
    skin: compactWithNormals({ positions: fine.positions, normals: fine.normals, indices: Uint32Array.from(rest) }),
    parts: Object.entries(groups).map(([name, indices]) => ({ name, layer: 'skin', group: 'skin', ...compactWithNormals({ positions: fine.positions, normals: fine.normals, indices: Uint32Array.from(indices) }) })),
    whole: { positions: fine.positions, indices: fine.indices },
  };
}
