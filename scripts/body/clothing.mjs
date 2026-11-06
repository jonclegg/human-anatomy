// Plain underwear, so the bodies open clothed: a crop top and shorts for the female body, boxer briefs for the male.
// Each garment is shaped from the body's own skin: at each height the trunk's (or a leg's) outline is closed over its
// hollows (its convex hull, so cloth bridges the cleft between the buttocks and the dip between the breasts) and set a
// few millimetres off the skin. The male briefs add a pouch where the genitals hang between the legs.
// Usage: node scripts/body/clothing.mjs <female|male>   (after the body is built; writes data/<sex>/clothing.glb)
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
import { readLayer, readParts, builtFolder } from './built.mjs';

const OFFSET = 0.5;         // cm off the skin
const AROUND = 96;          // points around each ring
const STEP = 0.5;           // cm between rings
/* linear colours (as glTF stores them): a charcoal cloth (#40444f on screen) and a darker band at the edges (#24262c) */
const CLOTH = [0.051, 0.058, 0.078], BAND = [0.018, 0.019, 0.025];

const sex = process.argv[2];
if (!['female', 'male'].includes(sex)) throw new Error('usage: node scripts/body/clothing.mjs <female|male>');
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
const shoulder = [top(bone('Left humerus')), top(bone('Right humerus'))];
const hipY = (hip[0][1] + hip[1][1]) / 2 - 2.3, hipX = (Math.abs(hip[0][0]) + Math.abs(hip[1][0])) / 2;
const shoulderY = (shoulder[0][1] + shoulder[1][1]) / 2 - 2.5, shoulderX = (Math.abs(shoulder[0][0]) + Math.abs(shoulder[1][0])) / 2;

/* ---------- the skin cut at a height: clusters of outline points ----------
   Where the skin's edges cross the height, and the skin's own points within 0.75 cm of it (a coarse mesh crosses a
   height in few places, which alone would let the outline miss the widest point between rings) */
function slice(y) {
  const p = skin.positions, t = skin.indices, points = [];
  for (let k = 0; k < t.length; k += 3) {
    const v = [t[k], t[k + 1], t[k + 2]].map(n => [p[3 * n], p[3 * n + 1], p[3 * n + 2]]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const A = v[a], B = v[b];
      if ((A[1] - y) * (B[1] - y) >= 0) continue;
      const f = (y - A[1]) / (B[1] - A[1]);
      points.push([A[0] + f * (B[0] - A[0]), A[2] + f * (B[2] - A[2])]);
    }
  }
  for (let k = 0; k < p.length; k += 3) if (Math.abs(p[k + 1] - y) < 0.75) points.push([p[k], p[k + 2]]);
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
  const waist = sex === 'female' ? hipY + 8 : hipY + 9.5, legEnd = sex === 'female' ? crotch - 7 : crotch - 13;
  const above = [];
  for (let y = waist; y > crotch; y -= STEP) above.push({ y, points: ring(trunkAt(y, hipX + 12).flatMap(cluster => cluster.points)) });
  above.push({ y: crotch, points: ring(trunkAt(crotch + 0.3, hipX + 12).flatMap(cluster => cluster.points)) });
  tube(sex === 'female' ? 'Shorts' : 'Boxer briefs', above, { capBottom: true, band: r => r < 3 });
  /* below the crotch the outline is split point by point: each leg, and what lies within 2.5 cm of the midline (inner
     thighs that touch, and the male genitals), which gets a pouch closed below */
  const MIDDLE = 2.5;
  for (const sign of [1, -1]) {
    const rings = [];
    for (let y = crotch + 1.5; y >= legEnd; y -= STEP) {
      const leg = trunkAt(y, hipX + 12).flatMap(cluster => cluster.points).filter(([x]) => x * sign > MIDDLE);
      if (leg.length > 6) rings.push({ y, points: ring(leg) });
    }
    tube(`${sex === 'female' ? 'Shorts' : 'Boxer briefs'} (${sign > 0 ? 'left' : 'right'} leg)`, rings, { band: (r, n) => r >= n - 2 });
  }
  const pouch = [];
  for (let y = crotch + 1; y >= legEnd; y -= STEP) {
    const middle = trunkAt(y, hipX + 12).flatMap(cluster => cluster.points).filter(([x]) => Math.abs(x) <= MIDDLE);
    if (middle.length < 6) break;
    pouch.push({ y, points: ring(middle) });
  }
  if (pouch.length > 1) tube(`${sex === 'female' ? 'Shorts' : 'Boxer briefs'} (front)`, pouch, { capBottom: true });
  console.log(`${sex}: lower garment from ${waist.toFixed(1)} to ${legEnd.toFixed(1)} cm, crotch at ${crotch.toFixed(1)} cm${pouch.length > 1 ? `, pouch ${(pouch.length * STEP).toFixed(1)} cm` : ''}`);
}

/* the female crop top: from below the breasts to just under the arms, with a strap over each shoulder */
if (sex === 'female') {
  const nipples = ['Left nipple', 'Right nipple'].map(name => {
    const index = parts.parts.findIndex(part => part.layer === 'organs' && part.name === name);
    if (index < 0) throw new Error(`no ${name}`);
    return parts.parts[index].centre;
  });
  const nippleY = (nipples[0][1] + nipples[1][1]) / 2;
  const bottom = nippleY - 8, upper = shoulderY - 10;
  const reach = shoulderX + 1;   // the arms hang beyond this
  const rings = [];
  for (let y = upper; y >= bottom; y -= STEP) {
    /* the trunk's own outline (the arms hang clear of it as their own pieces); where an arm has joined it near the
       armpit, the joined piece is cut at the shoulder joints */
    const trunk = trunkAt(y, reach).flatMap(cluster => {
      const xs = cluster.points.map(q => q[0]), wide = Math.max(...xs) - Math.min(...xs) > 2 * shoulderX;
      return wide ? cluster.points.filter(([x]) => Math.abs(x) < shoulderX) : cluster.points;
    });
    rings.push({ y, points: ring(trunk) });
  }
  tube('Crop top', rings, { band: (r, n) => r >= n - 3 });
  /* the straps: the skin cut front to back through each shoulder, above the top's upper edge, set off it */
  for (const sign of [1, -1]) {
    const x = sign * (Math.abs(nipples[sign > 0 ? 0 : 1][0]) - 1.5), width = 1.4;
    const p = skin.positions, t = skin.indices, cut = [];
    for (let k = 0; k < t.length; k += 3) {
      const v = [t[k], t[k + 1], t[k + 2]].map(n => [p[3 * n], p[3 * n + 1], p[3 * n + 2]]);
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const A = v[a], B = v[b];
        if ((A[0] - x) * (B[0] - x) >= 0) continue;
        const f = (x - A[0]) / (B[0] - A[0]), y = A[1] + f * (B[1] - A[1]), z = A[2] + f * (B[2] - A[2]);
        if (y > upper - 1.5 && y < shoulderY + 6) cut.push([y, z]);   // the shoulder, not the neck and head above it
      }
    }
    /* order front to back over the shoulder by angle about a point below the shoulder's top */
    const pivot = [upper - 2, cut.reduce((sum, q) => sum + q[1], 0) / cut.length];
    cut.sort((a, b) => Math.atan2(a[1] - pivot[1], a[0] - pivot[0]) - Math.atan2(b[1] - pivot[1], b[0] - pivot[0]));
    /* thin the points to about one per centimetre, then set each out along the outline's normal */
    const path = [];
    for (const q of cut) if (!path.length || Math.hypot(q[0] - path.at(-1)[0], q[1] - path.at(-1)[1]) > 1) path.push(q);
    const positions = [], colours = [], indices = [];
    path.forEach((q, k) => {
      const a = path[Math.max(0, k - 1)], b = path[Math.min(path.length - 1, k + 1)];
      const ty = b[0] - a[0], tz = b[1] - a[1], length = Math.hypot(ty, tz) || 1;
      let ny = -tz / length, nz = ty / length;
      if (ny * (q[0] - pivot[0]) + nz * (q[1] - pivot[1]) < 0) { ny = -ny; nz = -nz; }   // outward, away from the pivot
      const y = q[0] + ny * OFFSET, z = q[1] + nz * OFFSET;
      positions.push(x - width / 2, y, z, x + width / 2, y, z); colours.push(...BAND, ...BAND);
      if (k) { const s = 2 * k; indices.push(s - 2, s, s - 1, s - 1, s, s + 1); }
    });
    garments.push({ name: `Crop top (${sign > 0 ? 'left' : 'right'} strap)`, positions, colours, indices });
  }
  console.log(`female: crop top from ${bottom.toFixed(1)} to ${upper.toFixed(1)} cm`);
}

/* ---------- writing: one primitive, positions, normals and colours ---------- */
const all = { positions: [], colours: [], indices: [] };
for (const garment of garments) {
  const base = all.positions.length / 3;
  all.positions.push(...garment.positions); all.colours.push(...garment.colours); all.indices.push(...garment.indices.map(index => index + base));
}
const positions = Float32Array.from(all.positions), normal = new Float32Array(positions.length);
for (let k = 0; k < all.indices.length; k += 3) {
  const [a, b, c] = [all.indices[k], all.indices[k + 1], all.indices[k + 2]].map(v => 3 * v);
  const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
  const w = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const v of [a, b, c]) for (let i = 0; i < 3; i++) normal[v + i] += n[i];
}
for (let k = 0; k < normal.length; k += 3) { const length = Math.hypot(normal[k], normal[k + 1], normal[k + 2]) || 1; for (let i = 0; i < 3; i++) normal[k + i] /= length; }
const document = new Document(), buffer = document.createBuffer();
const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const primitive = document.createPrimitive()
  .setAttribute('POSITION', accessor('VEC3', positions)).setAttribute('NORMAL', accessor('VEC3', normal))
  .setAttribute('COLOR_0', accessor('VEC3', Float32Array.from(all.colours))).setIndices(accessor('SCALAR', Uint32Array.from(all.indices)));
document.createScene().addChild(document.createNode('clothing').setMesh(document.createMesh('clothing').addPrimitive(primitive)));
await MeshoptEncoder.ready;
await document.transform(
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, pattern: /^(POSITION|NORMAL|COLOR_0)$/ }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const glb = await io.writeBinary(document);
writeFileSync(new URL('clothing.glb', builtFolder(sex)), glb);
console.log(`${sex} clothing: ${garments.map(garment => garment.name).join(', ')}; ${all.indices.length / 3} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB`);
