// Her vulva, clitoris, urethra and the glands and muscles around them: the close-up pelvic model (site/index.html,
// built in code from published measurements; export-pelvic-detail.mjs writes its meshes), placed in her pelvis.
// That model is built around the Human Reference Atlas female pelvis, the same scan whose organs the female build fits
// into her, so one map carries both: the model's frame to the scan's (hra-frame.mjs), then the scan's pelvis onto hers.
import { readFileSync, existsSync } from 'node:fs';
import { fromModel } from '../hra-frame.mjs';
import { FRAMES, toModel } from './hra.mjs';
import { PointGrid, thinPlateSpline, spread } from './fit.mjs';
import { vertexNormals } from './clearance.mjs';
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

/* where the line through a point along a direction meets a set of triangles, nearest an expected signed distance along
   the direction: that signed distance, or null */
function alongLine(point, direction, triangles, positions, reach, expected) {
  let best = null;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]], e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const h = [direction[1] * e2[2] - direction[2] * e2[1], direction[2] * e2[0] - direction[0] * e2[2], direction[0] * e2[1] - direction[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-9) continue;
    const s = [point[0] - positions[a], point[1] - positions[a + 1], point[2] - positions[a + 2]], u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const distance = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (Math.abs(distance) <= reach && (best === null || Math.abs(distance - expected) < Math.abs(best - expected))) best = distance;
  }
  return best;
}

/**
 * Her skin is MakeHuman's, smooth between the legs. The close-up model's skin sheet (mons and labia majora, open at the
 * vestibule) takes its place there. The sheet is a surface of heights over a flat layout, drawn as rings around
 * the vestibule crossed by spokes. Her own skin is read as heights over the same layout (along the model's outward
 * axis); on each spoke the sheet ends where it comes nearest her skin, the last stretch before that is drawn onto her
 * skin, and her own skin inside that rim is cut away. What lies at and under the sheet moves with it.
 * Returns { skin: her skin with the opening cut, parts: the sheet in named parts }; the other meshes of detail are moved in place.
 */
const RINGS = 131, SPOKES = 240;                 // the sheet's grid (SKIN_GRID in site/index.html): vertex = ring * SPOKES + spoke
const RX = 3.0, CY = 1.25, FRONT = 5.25, BACK = 4.2;   // the furthest the rim may lie, on the layout (cm): half an ellipse forward to the top of the mons, half back to just behind the fourchette
const NEAREST_RIM = 0.72;                        // and the nearest, as a share of that ellipse: outside the crest of the labia majora
const KEPT_AS_MODELLED = 0.55, ON_HER_SKIN = 0.8, BAND = 0.83;   // shares of the rim's distance on a spoke
const SHALLOW = 1.5, DEEP = 5;                   // cm under the surface: what is shallower moves with the sheet's rim, what is deeper stays
const SAME_SKIN = 0.6;                           // cm along the outward axis within which her skin is the skin the sheet met
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
    skin = dividedWhere(skin, (x, y, z) => around.nearest(x, y, z, 2.2)[0] >= 0, 3);   // the sheet lies up to a centimetre and a half from her skin
  }
  const local = [];
  for (let t = 0; t < skin.indices.length; t += 3) if ([0, 1, 2].some(k => [0, 1, 2].every(axis => skin.positions[3 * skin.indices[t + k] + axis] > box.min[axis] - 4 && skin.positions[3 * skin.indices[t + k] + axis] < box.max[axis] + 4))) local.push(skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]);
  const height = new Float32Array(count).fill(NaN);
  /* worked outward along each spoke, each vertex taking the crossing nearest its inner neighbour's: the same skin all
     the way out, not the skin of a thigh that the line also meets */
  for (let spoke = 0; spoke < SPOKES; spoke++) {
    let last = 0;
    for (let ring = 0; ring < RINGS; ring++) {
      const v = ring * SPOKES + spoke;
      if (reach(v) > 1) break;
      const distance = alongLine(sheet.positions.subarray(3 * v, 3 * v + 3), outward, local, skin.positions, 4, last);
      if (distance !== null) { height[v] = distance; last = distance; }
    }
  }
  /* the rim on each spoke: where the sheet comes nearest her skin, between the nearest and furthest it may lie; then evened out around */
  let rim = new Float32Array(SPOKES);
  for (let spoke = 0; spoke < SPOKES; spoke++) {
    let best = -1;
    for (let ring = 0; ring < RINGS; ring++) { const v = ring * SPOKES + spoke; if (reach(v) >= NEAREST_RIM && reach(v) <= 1 && !Number.isNaN(height[v]) && (best < 0 || Math.abs(height[v]) < Math.abs(height[best]))) best = v; }
    rim[spoke] = best < 0 ? NaN : reach(best);
  }
  /* a spoke may find none of her skin that far out (its lines pass between her thighs): it takes its rim from the
     nearest spokes that found theirs, as a vertex without a height takes its neighbours' below */
  {
    const lost = [...rim.keys()].filter(spoke => Number.isNaN(rim[spoke]));
    if (lost.length > 0.1 * SPOKES) throw new Error(`the vulva sheet finds none of her skin on ${lost.length} of its ${SPOKES} spokes`);
    const found = rim.slice();
    for (const spoke of lost) {
      const next = step => { for (let k = 1; k < SPOKES; k++) { const other = (spoke + step * k + SPOKES * k) % SPOKES; if (!Number.isNaN(found[other])) return [k, found[other]]; } };
      const [before, low] = next(-1), [after, high] = next(1);
      rim[spoke] = (low * after + high * before) / (before + after);
    }
  }
  for (let pass = 0; pass < 12; pass++) rim = rim.map((value, spoke) => (rim[(spoke + SPOKES - 1) % SPOKES] + 2 * value + rim[(spoke + 1) % SPOKES]) / 4);
  const share = v => reach(v) / rim[v % SPOKES];   // 0 at the layout's middle, 1 at the rim
  const kept = [];
  for (let t = 0; t < sheet.indices.length; t += 3) if ([0, 1, 2].every(k => share(sheet.indices[t + k]) <= 1)) kept.push(sheet.indices[t], sheet.indices[t + 1], sheet.indices[t + 2]);
  const used = [...new Set(kept)];
  /* each kept vertex's way to her skin, smoothed over the sheet so the rim does not crease */
  let way = new Float32Array(count);
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < kept.length; t += 3) for (let k = 0; k < 3; k++) { neighbours[kept[t + k]].add(kept[t + (k + 1) % 3]); neighbours[kept[t + k]].add(kept[t + (k + 2) % 3]); }
  /* a line can slip between two of her skin's triangles, or meet the skin of a thigh first: a vertex with no height, or
     one more than a centimetre from its neighbours', takes its neighbours' */
  {
    for (let pass = 0; pass < 2; pass++) {
      const odd = used.filter(v => { const known = [...neighbours[v]].filter(w => !Number.isNaN(height[w])); return known.length && Math.abs(height[v] - known.reduce((sum, w) => sum + height[w], 0) / known.length) > 1; });
      for (const v of odd) height[v] = NaN;
    }
    let missing = used.filter(v => Number.isNaN(height[v]));
    if (missing.length > 0.05 * used.length) throw new Error(`the vulva sheet finds none of her skin under ${missing.length} of its ${used.length} vertices`);
    while (missing.length) {
      const filled = [];
      for (const v of missing) { const known = [...neighbours[v]].filter(w => !Number.isNaN(height[w])); if (known.length) filled.push([v, known.reduce((sum, w) => sum + height[w], 0) / known.length]); }
      if (!filled.length) throw new Error('part of the vulva sheet finds none of her skin');
      for (const [v, value] of filled) height[v] = value;
      missing = missing.filter(v => Number.isNaN(height[v]));
    }
  }
  for (const v of used) way[v] = height[v] - UNDER;
  const exact = way.slice();
  for (let pass = 0; pass < 8; pass++) {
    const next = way.slice();
    for (const v of used) { let sum = 0; for (const w of neighbours[v]) sum += way[w]; next[v] = 0.5 * way[v] + 0.5 * sum / neighbours[v].size; }
    way = next;
  }
  const positions = sheet.positions.slice(), moved = new Float32Array(count), onSkin = new Float32Array(count);
  let furthest = 0;
  for (const v of used) {
    const t = Math.min(1, Math.max(0, (share(v) - KEPT_AS_MODELLED) / (ON_HER_SKIN - KEPT_AS_MODELLED))), blend = t * t * (3 - 2 * t);
    onSkin[v] = blend;
    moved[v] = blend >= 1 ? exact[v] : blend * way[v];
    furthest = Math.max(furthest, Math.abs(moved[v]));
    for (let c = 0; c < 3; c++) positions[3 * v + c] += moved[v] * outward[c];
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
        for (let c = 0; c < 3; c++) mesh.positions[k + c] += follow * moved[used[index]] * outward[c];
      }
    }
  }
  /* Her own skin inside the rim is cut away: a vertex of it that, seen along the outward axis, lies over the sheet
     short of the last stretch before its rim, and at the height where the sheet found her skin (not the skin of a
     thigh, further out along the same line). */
  const fine = skin, vertices = fine.positions.length / 3, state = new Uint8Array(vertices), INSIDE = 2;
  {
    const across = Math.abs(outward[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const e1 = across.map((value, c) => value - dot(across, outward) * outward[c]), length = Math.hypot(...e1); for (let c = 0; c < 3; c++) e1[c] /= length;
    const e2 = [outward[1] * e1[2] - outward[2] * e1[1], outward[2] * e1[0] - outward[0] * e1[2], outward[0] * e1[1] - outward[1] * e1[0]];
    const seen = new PointGrid(Float32Array.from(used.flatMap(v => { const p = sheet.positions.subarray(3 * v, 3 * v + 3); return [dot(p, e1), dot(p, e2), 0]; })), 0.25);
    for (let v = 0; v < vertices; v++) {
      const q = fine.positions.subarray(3 * v, 3 * v + 3);
      if ([0, 1, 2].some(axis => q[axis] < box.min[axis] - 4 || q[axis] > box.max[axis] + 4)) continue;
      /* the sheet is open at the vestibule: her skin over that opening is over the sheet's innermost ring */
      const [index, distance] = seen.nearest(dot(q, e1), dot(q, e2), 0, 1.5);
      if (index < 0 || share(used[index]) >= BAND || (distance > 0.2 && used[index] >= 2 * SPOKES)) continue;
      const under = used[index], above = dot(q, outward) - dot(sheet.positions.subarray(3 * under, 3 * under + 3), outward);
      if (Math.abs(above - height[under]) < (distance > 0.2 ? 3 : 1) * SAME_SKIN) state[v] = INSIDE;
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
  const normals = vertexNormals({ positions, indices: Uint32Array.from(kept) });
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
