// Dresses the male body, so it opens clothed: shorts.
// The clothing is MakeHuman's (CC0; garments.mjs). A MakeHuman garment is tied to the MakeHuman body mesh, and his skin
// is not that mesh, so the mesh is first laid onto his skin, vertex by vertex (transfer.mjs), and the garment follows
// it. MakeHuman has no shorts for men: these are its jeans, cut off at mid-thigh.
// Usage: node scripts/body/clothing.mjs male <"Human Anatomy 3D Models" folder>   (after the body is built; writes
// data/male/clothing.glb)
import { readLayer, readParts, builtFolder } from './built.mjs';
import { readGarment, wear, writeClothing } from './garments.mjs';
import { layMakeHumanOnto } from './transfer.mjs';
import { PointGrid } from './fit.mjs';
import { LAYERS } from './systems.mjs';

const [sex, root] = process.argv.slice(2);
if (sex !== 'male' || !root) throw new Error('usage: node scripts/body/clothing.mjs male <"Human Anatomy 3D Models" folder>');
/* the MakeHuman shape nearest him, as the female build uses */
const HIS_SHAPE = { 'caucasian-male-young': 1 };
const parts = readParts(sex), structures = [];
for (const layer of ['skeleton', 'organs', 'skin']) for (const piece of await readLayer(sex, layer)) structures.push({ ...piece, name: parts.parts[piece.part].name, layer, group: parts.parts[piece.part].group });
if (!LAYERS.includes('skin')) throw new Error('no skin layer');
const laid = layMakeHumanOnto(structures, `${root}/MakeHuman (CC0)`, HIS_SHAPE, () => {});
const { skin, like, lining, onSkin } = laid;

/* the jeans: the suit's lower piece, cut off 45% of the way from the hip joint to the knee */
const hip = like.bones['upperleg01.L'].head[1], knee = like.bones['lowerleg01.L'].head[1], cut = hip - 0.45 * (hip - knee);
const height = like.positions.reduce((top, value, k) => (k % 3 === 1 ? Math.max(top, value) : top), 0);
const jeans = readGarment(`${root}/MakeHuman clothes (CC0)/clothes`, 'male_casualsuit04', like.all).filter(piece => piece.positions.reduce((top, value, k) => (k % 3 === 1 ? Math.max(top, value) : top), 0) / height < 0.66);
if (!jeans.length) throw new Error('no jeans in male_casualsuit04');
const garments = [];
for (const piece of jeans) {
  /* what reaches below the cut is drawn up to it, which makes the hem level; what lies wholly below is dropped */
  const kept = [];
  for (let k = 0; k < piece.indices.length; k += 3) if ([0, 1, 2].some(c => piece.positions[3 * piece.indices[k + c] + 1] > cut + 0.01)) kept.push(piece.indices[k], piece.indices[k + 1], piece.indices[k + 2]);
  if (!kept.length) continue;
  const positions = Float32Array.from(piece.positions, (value, k) => (k % 3 === 1 ? Math.max(value, cut) : value));
  garments.push({ positions, indices: Uint32Array.from(kept) });
}

/* his true skin, without his arms and hands, which hang beside the shorts (a skin vertex belongs to the arm if the
   bone nearest it is one of the arm's or the hand's) */
const cover = [];
{
  const points = [], arm = [];
  for (const structure of structures) if (structure.layer === 'skeleton') for (let k = 0; k < structure.positions.length; k += 3) { points.push(structure.positions[k], structure.positions[k + 1], structure.positions[k + 2]); arm.push(structure.group === 'arm' || structure.group === 'hand'); }
  const bones = new PointGrid(Float32Array.from(points), 2);
  for (let k = 0; k < skin.positions.length; k += 3) { const [index] = bones.nearest(skin.positions[k], skin.positions[k + 1], skin.positions[k + 2], 30); if (index >= 0 && !arm[index]) cover.push(skin.positions[k], skin.positions[k + 1], skin.positions[k + 2]); }
}
const rest = { positions: like.positions, indices: like.indices }, worn = { positions: onSkin.positions, indices: like.indices };
/* a linear colour (as glTF stores them): charcoal (#40444f on screen) */
const CLOTH = [0.051, 0.058, 0.078];
const { target } = laid, centre = target.pelvis;
const out = garments.map((garment, k) => {
  const positions = wear(garment, rest, worn, { skip: (a, b, c) => lining[a] || lining[b] || lining[c] });
  /* MakeHuman's mesh has no genitals, so its jeans do not allow for his. The front of the shorts is let out: seen
     from the middle of the pelvis, in every forward direction the cloth lies at least half a centimetre beyond the
     furthest skin in that direction (and twelve degrees around it, so the cloth rounds over him and does not cling).
     Directions are sorted into cells of 3 degrees. */
  const CELL = 3 * Math.PI / 180, AROUND = 4, CLEAR = 0.5, furthest = new Map();
  /* only the skin between his legs and in front of the pelvis: within 5.5 cm of the midline, from the hip joints to
     15 cm below them (further down are the thighs, which the jeans already fit) */
  const NEAR_MIDDLE = 5.5, BELOW = 15;
  const hem = positions.reduce((low, value, i) => (i % 3 === 1 ? Math.min(low, value) : low), Infinity);
  const cellOf = d => { const r = Math.hypot(...d); return [Math.round(Math.atan2(d[0], d[2]) / CELL), Math.round(Math.asin(d[1] / r) / CELL), r]; };
  for (let i = 0; i < cover.length; i += 3) {
    const d = [cover[i] - centre[0], cover[i + 1] - centre[1], cover[i + 2] - centre[2]];
    if (d[2] <= 0 || cover[i + 1] < Math.max(hem + 1, centre[1] - BELOW) || cover[i + 1] > centre[1] + 2 || Math.abs(cover[i]) > NEAR_MIDDLE) continue;
    const [a, b, r] = cellOf(d);
    for (let da = -AROUND; da <= AROUND; da++) for (let db = -AROUND; db <= AROUND; db++) { const key = `${a + da},${b + db}`; if (r > (furthest.get(key) || 0)) furthest.set(key, r); }
  }
  const needAt = i => { const d = [positions[i] - centre[0], positions[i + 1] - centre[1], positions[i + 2] - centre[2]]; if (d[2] <= 0) return null; const [a, b, r] = cellOf(d); return { d, r, need: (furthest.get(`${a},${b}`) || 0) + CLEAR }; };
  const moved = new Set();
  const letOutTo = () => { let most = 0; for (let i = 0; i < positions.length; i += 3) { const at = needAt(i); if (!at || at.r >= at.need) continue; for (let c = 0; c < 3; c++) positions[i + c] = centre[c] + at.d[c] * at.need / at.r; moved.add(i / 3); most = Math.max(most, at.need - at.r); } return most; };
  const most = letOutTo(), letOut = moved.size;
  /* the let-out cloth is then smoothed with what lies around it near the midline (two rings of neighbours; not the cloth over the thighs,
     which smoothing would draw into them), and let out again where
     smoothing has drawn it back in: a rounded front, not the facets of a coarse mesh pushed out point by point */
  const neighbours = Array.from({ length: positions.length / 3 }, () => new Set());
  for (let t = 0; t < garment.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[garment.indices[t + a]].add(garment.indices[t + b]); neighbours[garment.indices[t + b]].add(garment.indices[t + a]); }
  let soft = new Set(moved);
  for (let ring = 0; ring < 2; ring++) { const wider = new Set(soft); for (const v of soft) for (const w of neighbours[v]) if (Math.abs(positions[3 * w]) < NEAR_MIDDLE + 1) wider.add(w); soft = wider; }
  /* smoothing only ever moves cloth outward: each point keeps at least its distance from the middle of the pelvis */
  const away = v => Math.hypot(positions[3 * v] - centre[0], positions[3 * v + 1] - centre[1], positions[3 * v + 2] - centre[2]);
  const least = new Map([...soft].map(v => [v, away(v)]));
  for (let pass = 0; pass < 8; pass++) {
    const next = Float32Array.from(positions);
    for (const v of soft) for (let c = 0; c < 3; c++) { let sum = 0; for (const w of neighbours[v]) sum += positions[3 * w + c]; next[3 * v + c] = 0.5 * positions[3 * v + c] + 0.5 * sum / neighbours[v].size; }
    positions.set(next);
    for (const v of soft) { const r = away(v); if (r < least.get(v)) for (let c = 0; c < 3; c++) positions[3 * v + c] = centre[c] + (positions[3 * v + c] - centre[c]) * least.get(v) / r; }
    letOutTo();
  }
  console.log(`  front of the shorts let out over him: ${letOut} points, by up to ${most.toFixed(1)} cm`);
  return { name: k ? `Shorts (part ${k + 1})` : 'Shorts', positions, colours: Array.from({ length: positions.length / 3 }, () => CLOTH).flat(), indices: garment.indices };
});
console.log(`male clothing: ${await writeClothing(out, new URL('clothing.glb', builtFolder(sex)))}`);
