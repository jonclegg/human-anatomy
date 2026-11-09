// Plain underwear for the male body, so it opens clothed: boxer briefs.
// The garment is shaped from the body's own skin: at each height the trunk's (or a leg's) outline is closed over its
// hollows (its convex hull, so cloth bridges the cleft between the buttocks) and set a few millimetres off the skin,
// with a pouch where the genitals hang between the legs. (The female body wears modelled clothing: garments.mjs.)
// Usage: node scripts/body/clothing.mjs male   (after the body is built; writes data/male/clothing.glb)
import { readLayer, readParts, builtFolder } from './built.mjs';
import { writeClothing } from './garments.mjs';
import { PointGrid } from './fit.mjs';

const OFFSET = 0.5;         // cm off the skin
const AROUND = 96;          // points around each ring
const STEP = 0.5;           // cm between rings
/* linear colours (as glTF stores them): a charcoal cloth (#40444f on screen) and a darker band at the edges (#24262c) */
const CLOTH = [0.051, 0.058, 0.078], BAND = [0.018, 0.019, 0.025];

const sex = process.argv[2];
if (sex !== 'male') throw new Error('usage: node scripts/body/clothing.mjs male');
const parts = readParts(sex);
const skin = (await readLayer(sex, 'skin')).find(structure => parts.parts[structure.part].name === 'Skin');
const skeleton = await readLayer(sex, 'skeleton');
const bone = name => {
  const index = parts.parts.findIndex(part => part.layer === 'skeleton' && part.name === name);
  if (index < 0) throw new Error(`no ${name} in the ${sex} skeleton`);
  return skeleton.find(structure => structure.part === index).positions;
};
const top = points => { let best = null; for (let k = 0; k < points.length; k += 3) if (!best || points[k + 1] > best[1]) best = [points[k], points[k + 1], points[k + 2]]; return best; };
const hip = [top(bone('Left femur')), top(bone('Right femur'))];
const hipY = (hip[0][1] + hip[1][1]) / 2 - 2.3, hipX = (Math.abs(hip[0][0]) + Math.abs(hip[1][0])) / 2;

/* The skin of the arms and hands is no part of a garment's outline, and the hands may hang against the thighs. A skin
   vertex may belong to the arm if the bone nearest it is one of the arm's or the hand's; the arm is those that connect,
   through others like them, to the fingers (the skin of the hip beside a hanging hand has a hand bone nearest too, but
   joins the hand only by way of the trunk). */
const onArm = new Uint8Array(skin.positions.length / 3);
{
  const points = [], group = [];
  for (const structure of skeleton) {
    const name = parts.parts[structure.part].group;
    for (let k = 0; k < structure.positions.length; k += 3) { points.push(structure.positions[k], structure.positions[k + 1], structure.positions[k + 2]); group.push(name); }
  }
  const grid = new PointGrid(Float32Array.from(points), 2), may = new Uint8Array(onArm.length), queue = [];
  for (let v = 0; v < onArm.length; v++) {
    const [index, distance] = grid.nearest(skin.positions[3 * v], skin.positions[3 * v + 1], skin.positions[3 * v + 2], 30);
    if (index < 0 || (group[index] !== 'arm' && group[index] !== 'hand')) continue;
    may[v] = 1;
    if (group[index] === 'hand' && distance < 1.2) { onArm[v] = 1; queue.push(v); }
  }
  const neighbours = Array.from({ length: onArm.length }, () => []);
  for (let k = 0; k < skin.indices.length; k += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[skin.indices[k + a]].push(skin.indices[k + b]); neighbours[skin.indices[k + b]].push(skin.indices[k + a]); }
  while (queue.length) for (const w of neighbours[queue.pop()]) if (may[w] && !onArm[w]) { onArm[w] = 1; queue.push(w); }
}

/* ---------- the skin cut at a height: clusters of outline points ----------
   Where the skin's edges cross the height, and the skin's own points within 0.75 cm of it (a coarse mesh crosses a
   height in few places, which alone would let the outline miss the widest point between rings) */
function slice(y) {
  const p = skin.positions, t = skin.indices, points = [];
  for (let k = 0; k < t.length; k += 3) {
    if (onArm[t[k]] || onArm[t[k + 1]] || onArm[t[k + 2]]) continue;
    const v = [t[k], t[k + 1], t[k + 2]].map(n => [p[3 * n], p[3 * n + 1], p[3 * n + 2]]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const A = v[a], B = v[b];
      if ((A[1] - y) * (B[1] - y) >= 0) continue;
      const f = (y - A[1]) / (B[1] - A[1]);
      points.push([A[0] + f * (B[0] - A[0]), A[2] + f * (B[2] - A[2])]);
    }
  }
  for (let k = 0; k < p.length; k += 3) if (!onArm[k / 3] && Math.abs(p[k + 1] - y) < 0.75) points.push([p[k], p[k + 2]]);
  /* join points closer than 2.5 cm into clusters (MakeHuman's skin is coarse: its outline points can be 2 cm apart) */
  const cell = 2.5, cells = new Map(), parent = points.map((_, k) => k);
  const find = k => parent[k] === k ? k : (parent[k] = find(parent[k]));
  points.forEach(([x, z], k) => { const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`; (cells.get(key) || cells.set(key, []).get(key)).push(k); });
  for (const [key, list] of cells) {
    const [i, j] = key.split(',').map(Number);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const m of cells.get(`${i + a},${j + b}`) || []) for (const k of list) {
      if (Math.hypot(points[k][0] - points[m][0], points[k][1] - points[m][1]) < cell) parent[find(k)] = find(m);
    }
  }
  const groups = new Map();
  points.forEach((point, k) => { const root = find(k); (groups.get(root) || groups.set(root, []).get(root)).push(point); });
  /* every cluster is kept, however small: where the mesh's triangles are large, gaps over the join distance break the
     outline into fragments, and leaving out the small ones would cut the cloth into the body there */
  return [...groups.values()].map(group => ({ points: group, x: group.reduce((sum, q) => sum + q[0], 0) / group.length, z: group.reduce((sum, q) => sum + q[1], 0) / group.length }));
}

/* the convex hull of 2D points, set out by OFFSET, sampled at AROUND even angles about its middle */
function ring(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of sorted) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...sorted].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const middle = [hull.reduce((sum, q) => sum + q[0], 0) / hull.length, hull.reduce((sum, q) => sum + q[1], 0) / hull.length];
  const out = [];
  for (let k = 0; k < AROUND; k++) {
    const angle = 2 * Math.PI * k / AROUND, d = [Math.sin(angle), Math.cos(angle)];   // starts at the front (+z), turns to the body's left
    let reach = 0;
    for (let e = 0; e < hull.length; e++) {
      const a = hull[e], b = hull[(e + 1) % hull.length];
      /* where the ray from the middle meets edge a-b */
      const ex = b[0] - a[0], ez = b[1] - a[1], denominator = d[0] * ez - d[1] * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const s = ((a[0] - middle[0]) * ez - (a[1] - middle[1]) * ex) / denominator, u = ((a[0] - middle[0]) * d[1] - (a[1] - middle[1]) * d[0]) / denominator;
      if (s > 0 && u >= -1e-9 && u <= 1 + 1e-9) reach = Math.max(reach, s);
    }
    out.push([middle[0] + d[0] * (reach + OFFSET), middle[1] + d[1] * (reach + OFFSET)]);
  }
  return out;
}

/* ---------- meshes ---------- */
const garments = [];
function tube(name, rings, { capBottom = false, band = () => false } = {}) {
  const positions = [], colours = [], indices = [];
  rings.forEach(({ y, points }, r) => points.forEach(([x, z]) => { positions.push(x, y, z); colours.push(...(band(r, rings.length) ? BAND : CLOTH)); }));
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < AROUND; k++) {
    const a = r * AROUND + k, b = r * AROUND + (k + 1) % AROUND, c = a + AROUND, d = b + AROUND;
    indices.push(a, c, b, b, c, d);
  }
  if (capBottom) {
    const last = rings.at(-1), centre = positions.length / 3;
    positions.push(last.points.reduce((sum, q) => sum + q[0], 0) / AROUND, last.y, last.points.reduce((sum, q) => sum + q[1], 0) / AROUND);
    colours.push(...CLOTH);
    const base = (rings.length - 1) * AROUND;
    for (let k = 0; k < AROUND; k++) indices.push(base + k, centre, base + (k + 1) % AROUND);
  }
  garments.push({ name, positions, colours, indices });
}
/* the trunk's clusters at a height: those within reach of the middle (leaving out the arms and hands) */
const trunkAt = (y, reach) => slice(y).filter(cluster => Math.abs(cluster.x) < reach);
/* the crotch: three centimetres of soft tissue below the lowest point of the pelvis (the ischial tuberosities) */
const PELVIS = /^(Left|Right) hip bone$|ischium compact bone|pubis compact bone/;
const pelvisBottom = Math.min(...parts.parts.map((part, index) => ({ part, index })).filter(({ part }) => part.layer === 'skeleton' && PELVIS.test(part.name)).map(({ part }) => part.min[1]));
if (!Number.isFinite(pelvisBottom)) throw new Error('no pelvis bones');
const crotch = pelvisBottom - 3;

/* the lower garment: shorts or boxer briefs, from a waistband down over the crotch and part way down each thigh */
{
  const waist = hipY + 9.5, legEnd = crotch - 13;
  const above = [];
  for (let y = waist; y > crotch; y -= STEP) above.push({ y, points: ring(trunkAt(y, hipX + 12).flatMap(cluster => cluster.points)) });
  above.push({ y: crotch, points: ring(trunkAt(crotch + 0.3, hipX + 12).flatMap(cluster => cluster.points)) });
  tube('Boxer briefs', above, { capBottom: true, band: r => r < 3 });
  /* below the crotch the outline is split point by point: each leg, and what lies within 2.5 cm of the midline (inner
     thighs that touch, and the male genitals), which gets a pouch closed below */
  const MIDDLE = 2.5;
  for (const sign of [1, -1]) {
    const rings = [];
    for (let y = crotch + 1.5; y >= legEnd; y -= STEP) {
      const leg = trunkAt(y, hipX + 12).flatMap(cluster => cluster.points).filter(([x]) => x * sign > MIDDLE);
      if (leg.length > 6) rings.push({ y, points: ring(leg) });
    }
    tube(`Boxer briefs (${sign > 0 ? 'left' : 'right'} leg)`, rings, { band: (r, n) => r >= n - 2 });
  }
  const pouch = [];
  for (let y = crotch + 1; y >= legEnd; y -= STEP) {
    const middle = trunkAt(y, hipX + 12).flatMap(cluster => cluster.points).filter(([x]) => Math.abs(x) <= MIDDLE);
    if (middle.length < 6) break;
    pouch.push({ y, points: ring(middle) });
  }
  if (pouch.length > 1) tube(`Boxer briefs (front)`, pouch, { capBottom: true });
  console.log(`male: lower garment from ${waist.toFixed(1)} to ${legEnd.toFixed(1)} cm, crotch at ${crotch.toFixed(1)} cm${pouch.length > 1 ? `, pouch ${(pouch.length * STEP).toFixed(1)} cm` : ''}`);
}

console.log(`male clothing: ${await writeClothing(garments, new URL('clothing.glb', builtFolder(sex)))}`);
