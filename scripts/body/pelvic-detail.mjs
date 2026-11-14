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

/**
 * Her skin is MakeHuman's, smooth between the legs. The close-up model's skin sheet (mons and labia majora, open at the
 * vestibule) takes its place there. The sheet is drawn as rings around the vestibule crossed by spokes. On each spoke
 * the sheet ends where it comes nearest her skin, the last stretch before that is drawn onto her skin (each point to
 * the nearest point of her skin, whichever way that lies: her thighs close in beside the vulva, and their skin is
 * beside the sheet, not under it), and her own skin inside that rim is cut away. What lies at and under the sheet
 * moves with it.
 * Returns { skin: her skin with the opening cut, parts: the sheet in named parts }; the other meshes of detail are moved in place.
 */
const RINGS = 131, SPOKES = 240;                 // the sheet's grid (SKIN_GRID in site/index.html): vertex = ring * SPOKES + spoke
const RX = 3.0, CY = 1.25, FRONT = 5.25, BACK = 4.2;   // the furthest the rim may lie, on the layout (cm): half an ellipse forward to the top of the mons, half back to just behind the fourchette
const NEAREST_RIM = 0.72;                        // and the nearest, as a share of that ellipse: outside the crest of the labia majora
const KEPT_AS_MODELLED = 0.55, ON_HER_SKIN = 0.8, BAND = 0.83;   // shares of the rim's distance on a spoke
const SHALLOW = 1.5, DEEP = 5;                   // cm under the surface: what is shallower moves with the sheet's rim, what is deeper stays
const SAME_SKIN = 3;                             // cm from the sheet within which her skin over it is the skin the sheet replaces
const UNDER = 0.04;                              // cm the rim lies under her skin, so her skin covers it
export function vulvaSkin(skin, detail, outward, log = console.log) {
  const sheet = detail.skin, count = sheet.positions.length / 3;
  if (count !== RINGS * SPOKES) throw new Error(`the close-up model's skin sheet has ${count} vertices, not ${RINGS} rings of ${SPOKES}`);
  const reach = v => Math.hypot(sheet.detail[3 * v] / RX, (sheet.detail[3 * v + 1] - CY) / (sheet.detail[3 * v + 1] > CY ? FRONT : BACK));
  /* Her own skin is coarse there (triangles a centimetre across): it is divided finer near the sheet, so that the cut
     made below can follow the sheet. Then its height under each sheet vertex. */
  const within = Float32Array.from(sheet.positions.filter((_, k) => reach(Math.floor(k / 3)) <= 1)), box = bounds(within);
  {
    const around = new PointGrid(within, 0.5);
    skin = dividedWhere(skin, (x, y, z) => around.nearest(x, y, z, 2.2)[0] >= 0, 3);   // the sheet lies up to a couple of centimetres from her skin
  }
  const local = [];
  for (let t = 0; t < skin.indices.length; t += 3) if ([0, 1, 2].some(k => [0, 1, 2].every(axis => skin.positions[3 * skin.indices[t + k] + axis] > box.min[axis] - 4 && skin.positions[3 * skin.indices[t + k] + axis] < box.max[axis] + 4))) local.push(skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]);
  /* each vertex's way to her skin: to the nearest point of it that faces as the sheet does there (the skin of a thigh
     beside the sheet faces across it, and the sheet's front end, drawn to it, bridged her thighs), or failing that
     the nearest of all; and a little under her skin there */
  const surface = new Surface({ positions: skin.positions, indices: local }), gap = new Float32Array(count).fill(NaN), exact = new Float32Array(count * 3);
  {
    const point = [0, 0, 0], facing = vertexNormals(sheet);
    for (let v = 0; v < count; v++) {
      if (reach(v) > 1) continue;
      const p = sheet.positions.subarray(3 * v, 3 * v + 3);
      let distance = surface.nearestFacing(p[0], p[1], p[2], facing[3 * v], facing[3 * v + 1], facing[3 * v + 2], 0.2, 6, point);
      if (distance === Infinity) distance = surface.nearestFacing(p[0], p[1], p[2], 0, 0, 0, -2, 12, point);
      if (distance === Infinity) continue;
      gap[v] = distance;
      for (let c = 0; c < 3; c++) exact[3 * v + c] = point[c] - UNDER * surface.normals[3 * surface.found + c] - p[c];
    }
  }
  /* the rim on each spoke: where the sheet comes nearest her skin, between the nearest and furthest it may lie; then evened out around */
  let rim = new Float32Array(SPOKES);
  for (let spoke = 0; spoke < SPOKES; spoke++) {
    let best = -1;
    for (let ring = 0; ring < RINGS; ring++) { const v = ring * SPOKES + spoke; if (reach(v) >= NEAREST_RIM && reach(v) <= 1 && !Number.isNaN(gap[v]) && (best < 0 || gap[v] < gap[best])) best = v; }
    if (best < 0) throw new Error(`the vulva sheet finds none of her skin on spoke ${spoke}`);
    rim[spoke] = reach(best);
  }
  for (let pass = 0; pass < 12; pass++) rim = rim.map((value, spoke) => (rim[(spoke + SPOKES - 1) % SPOKES] + 2 * value + rim[(spoke + 1) % SPOKES]) / 4);
  const share = v => reach(v) / rim[v % SPOKES];   // 0 at the layout's middle, 1 at the rim
  const kept = [];
  for (let t = 0; t < sheet.indices.length; t += 3) if ([0, 1, 2].every(k => share(sheet.indices[t + k]) <= 1)) kept.push(sheet.indices[t], sheet.indices[t + 1], sheet.indices[t + 2]);
  const used = [...new Set(kept)];
  /* each kept vertex's way to her skin, smoothed over the sheet so the rim does not crease */
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < kept.length; t += 3) for (let k = 0; k < 3; k++) { neighbours[kept[t + k]].add(kept[t + (k + 1) % 3]); neighbours[kept[t + k]].add(kept[t + (k + 2) % 3]); }
  for (const v of used) if (Number.isNaN(gap[v])) throw new Error('part of the vulva sheet finds none of her skin');
  let way = exact.slice();
  for (let pass = 0; pass < 8; pass++) {
    const next = way.slice();
    for (const v of used) for (let c = 0; c < 3; c++) { let sum = 0; for (const w of neighbours[v]) sum += way[3 * w + c]; next[3 * v + c] = 0.5 * way[3 * v + c] + 0.5 * sum / neighbours[v].size; }
    way = next;
  }
  const positions = sheet.positions.slice(), moved = new Float32Array(count * 3), onSkin = new Float32Array(count);
  let furthest = 0;
  for (const v of used) {
    const t = Math.min(1, Math.max(0, (share(v) - KEPT_AS_MODELLED) / (ON_HER_SKIN - KEPT_AS_MODELLED))), blend = t * t * (3 - 2 * t);
    onSkin[v] = blend;
    for (let c = 0; c < 3; c++) { moved[3 * v + c] = blend >= 1 ? exact[3 * v + c] : blend * way[3 * v + c]; positions[3 * v + c] += moved[3 * v + c]; }
    furthest = Math.max(furthest, Math.hypot(moved[3 * v], moved[3 * v + 1], moved[3 * v + 2]));
  }
  /* what lies at and under the sheet moves with it: each point by the move of the sheet at its place on the layout, less
     with depth, so the labia, the vestibule and the glands stay in the skin that was modelled around them */
  {
    const layout = Float32Array.from(used.flatMap(v => [sheet.detail[3 * v], sheet.detail[3 * v + 1], 0])), flat = new PointGrid(layout, 0.5);
    for (const [id, mesh] of Object.entries(detail)) {
      if (id === 'skin') continue;
      for (let k = 0; k < mesh.positions.length; k += 3) {
        const [index] = flat.nearest(mesh.detail[k], mesh.detail[k + 1], 0, 1.5);
        if (index < 0) continue;
        const t = Math.min(1, Math.max(0, (-mesh.detail[k + 2] - SHALLOW) / (DEEP - SHALLOW))), follow = 1 - t * t * (3 - 2 * t);
        for (let c = 0; c < 3; c++) mesh.positions[k + c] += follow * moved[3 * used[index] + c];
      }
    }
  }
  /* Her own skin inside the rim is cut away: a vertex of it whose nearest point of the sheet, as the sheet now lies, is
     short of the last stretch before the sheet's rim (so the sheet's rim always overlaps what is left of her skin),
     and which faces outward as the vulva does (not the skin of a thigh, which faces across it from beside or beneath). */
  const fine = skin, vertices = fine.positions.length / 3, state = new Uint8Array(vertices), INSIDE = 2;
  const normals = vertexNormals({ positions, indices: Uint32Array.from(kept) });
  {
    const set = new PointGrid(Float32Array.from(used.flatMap(v => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]])), 0.5);
    for (let v = 0; v < vertices; v++) {
      const q = fine.positions.subarray(3 * v, 3 * v + 3);
      if ([0, 1, 2].some(axis => q[axis] < box.min[axis] - 4 || q[axis] > box.max[axis] + 4)) continue;
      if (fine.normals[3 * v] * outward[0] + fine.normals[3 * v + 1] * outward[1] + fine.normals[3 * v + 2] * outward[2] < 0.1) continue;
      const [index] = set.nearest(q[0], q[1], q[2], SAME_SKIN);
      if (index >= 0 && share(used[index]) < BAND) state[v] = INSIDE;
    }
  }
  const cut = [];
  let removed = 0;
  for (let t = 0; t < fine.indices.length; t += 3) {
    if ([0, 1, 2].every(k => state[fine.indices[t + k]] === INSIDE)) { removed++; continue; }
    cut.push(fine.indices[t], fine.indices[t + 1], fine.indices[t + 2]);
  }
  log(`  vulva: ${kept.length / 3} triangles of modelled skin set into hers, its rim ${(Math.min(...rim) * 100).toFixed(0)}-${(Math.max(...rim) * 100).toFixed(0)}% of the way out and moved up to ${furthest.toFixed(2)} cm onto her skin; her skin cut away inside it (${removed} triangles, once divided finer there)`);
  /* the sheet in the parts an atlas names, by where each triangle lies on the layout */
  const groups = { 'Mons pubis': [], 'Left labium majus': [], 'Right labium majus': [] };
  for (let t = 0; t < kept.length; t += 3) {
    const y = (sheet.detail[3 * kept[t] + 1] + sheet.detail[3 * kept[t + 1] + 1] + sheet.detail[3 * kept[t + 2] + 1]) / 3, x = sheet.detail[3 * kept[t]] + sheet.detail[3 * kept[t + 1]] + sheet.detail[3 * kept[t + 2]];
    groups[y > 3.9 ? 'Mons pubis' : x > 0 ? 'Left labium majus' : 'Right labium majus'].push(kept[t], kept[t + 1], kept[t + 2]);
  }
  /* the sheet is shaded as modelled in its middle and as her skin at its rim, so the join does not show as a line */
  {
    const hers = new PointGrid(fine.positions, 0.5);
    for (const v of used) {
      if (!onSkin[v]) continue;
      const [index] = hers.nearest(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2], 2);
      if (index < 0) continue;
      const n = [0, 1, 2].map(c => (1 - onSkin[v]) * normals[3 * v + c] + onSkin[v] * fine.normals[3 * index + c]), length = Math.hypot(...n) || 1;
      for (let c = 0; c < 3; c++) normals[3 * v + c] = n[c] / length;
    }
  }
  return {
    skin: compactWithNormals({ positions: fine.positions, normals: fine.normals, indices: Uint32Array.from(cut) }),
    parts: Object.entries(groups).map(([name, indices]) => ({ name, layer: 'skin', group: 'skin', ...compactWithNormals({ positions, normals, indices: Uint32Array.from(indices) }) })),
  };
}
