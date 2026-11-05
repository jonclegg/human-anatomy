// Adds what BodyParts3D lacks from Z-Anatomy (CC BY-SA 4.0): the muscles of the face, jaw, back and abdominal wall,
// ligaments and joint capsules, the peripheral and cranial nerves, lymph nodes, the thyroid gland, and more vessels.
// Z-Anatomy is itself built on BodyParts3D but remodelled, so it is aligned to the BodyParts3D bones by the same fit the
// female body uses, and a Z-Anatomy structure is kept only where BodyParts3D has nothing in the same place.
// Its non-commercial parts (the kidney, the inner ear) and its unlicensed brain models are never exported
// (blender/export-zanatomy.py).
import { readOrgan } from './hra.mjs';
import { register, warpMesh, startMap } from './register.mjs';
import { spread, PointGrid, icpSimilarity } from './fit.mjs';
import { weld, simplify } from './mesh.mjs';
import { ERROR, MINIMUM_SHARE } from './assemble.mjs';

const METRES = { centreX: 0, centreZ: 0, floor: 0 };   // read as-is, metres to cm; the fit places it

/* "Femur.l" -> "Left femur"; "(Ulnar recurrent artery).r" -> "Right ulnar recurrent artery" */
export function zName(raw) {
  let name = raw.replace(/\.\d{3}$/, '').replace(/[()]/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const side = name.match(/\.(l|r)$/);
  if (side) name = `${side[1] === 'l' ? 'left' : 'right'} ${name.slice(0, -2).replace(/^./, c => c.toLowerCase())}`;
  name = name.replace(/^(left|right) (left|right) /i, '$1 ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function placeOf(name, group) {
  if (group === '4: Muscular system') return { layer: 'muscles', group: null };
  if (group === '3: Joints' || group === '1: Skeletal system') return { layer: 'skeleton', group: null };
  if (group === '5: Cardiovascular system') return { layer: 'vessels', group: /vein|sinus|plexus/i.test(name) ? 'veins' : 'arteries' };
  if (group === '6: Lymphoid organs') return { layer: 'organs', group: 'lymphatic' };
  if (group === '7: Nervous system & Sense organs') return { layer: 'nerves', group: /spinal|cauda|horn/i.test(name) ? 'spinal' : 'nerves' };
  if (group === '8: Visceral systems') return { layer: 'organs', group: /thyroid|hypophysis|pineal/i.test(name) ? 'endocrine' : /bronch|trachea|larynx|nasal/i.test(name) ? 'respiratory' : 'digestive' };
  throw new Error(`no layer for Z-Anatomy ${name} (${group})`);
}

/* Z-Anatomy bone name -> BodyParts3D bone name, for the alignment */
const BONE_PAIRS = [
  ['femur', 'femur'], ['tibia', 'tibia'], ['fibula', 'fibula'], ['humerus', 'humerus'], ['radius', 'radius'], ['ulna', 'ulna'],
  ['scapula', 'scapula'], ['clavicle', 'clavicle'], ['hip bone', 'hip bone'], ['patella', 'patella'], ['calcaneus', 'calcaneus'],
];

/**
 * folder: the Z-Anatomy export folder (zanatomy.glb, zanatomy-bones.glb)
 * his: BodyParts3D structures with { name, layer, mesh } in the model frame
 * Returns [{ name, layer, group, mesh, source }] for the structures BodyParts3D lacks.
 */
export async function zanatomyAdditions(folder, his, log = console.log) {
  const bones = (await readOrgan(`${folder}/zanatomy-bones.glb`, METRES)).map(mesh => ({ ...mesh, name: zName(mesh.raw) }));
  const named = (list, name) => list.filter(item => item.name.toLowerCase() === name.toLowerCase()).map(item => item.mesh || item);
  const pairs = [];
  for (const [z, b] of BONE_PAIRS) for (const side of ['Left', 'Right']) {
    const source = bones.filter(mesh => mesh.name.toLowerCase() === `${side} ${z}`.toLowerCase()), target = named(his, `${side} ${b}`);
    if (source.length && target.length) pairs.push({ name: `${side.toLowerCase()} ${z}`, source, target });
  }
  for (const [z, b] of [['Sacrum', 'Sacrum'], ['Frontal bone', 'Frontal bone'], ['Mandible', 'Mandible'], ['Manubrium of sternum', 'Manubrium']]) {
    const source = bones.filter(mesh => mesh.name === z), target = named(his, b);
    if (source.length && target.length) pairs.push({ name: z.toLowerCase(), source, target });
  }
  if (pairs.length < 15) throw new Error(`only ${pairs.length} bone pairs to align Z-Anatomy with`);
  const centre = meshes => { const sum = [0, 0, 0]; let n = 0; for (const mesh of meshes) for (let k = 0; k < mesh.positions.length; k++) { sum[k % 3] += mesh.positions[k]; if (k % 3 === 0) n++; } return sum.map(value => value / n); };
  /* first the two skeletons as wholes (turn, even scale and shift), then bone by bone from there */
  const shift = startMap(1, 1, centre(pairs.flatMap(pair => pair.source)), centre(pairs.flatMap(pair => pair.target)));
  const all = list => spread(list.flatMap(mesh => [...mesh.positions]), 1.2);
  const whole = icpSimilarity(all(pairs.flatMap(pair => pair.source)), all(pairs.flatMap(pair => pair.target)), shift);
  log(`  skeletons as wholes: ICP left ${whole.meanDistance.toFixed(2)} cm`);
  const start = whole.map;
  log('aligning Z-Anatomy with BodyParts3D:');
  const warp = register({ pairs, start, log: line => log(line) });

  /* his structures, by layer, to judge which Z-Anatomy ones are new. A Z-Anatomy structure repeats one of his only when
     the two match both ways: most of it lies on that one structure, and most of that structure lies on it. A thin sheet
     over several of his muscles (the latissimus dorsi over the back) is new. */
  const index = {};
  for (const layer of ['skeleton', 'muscles', 'organs', 'vessels', 'nerves']) {
    const points = [], owner = [];
    his.forEach((structure, k) => { if (structure.layer !== layer) return; const p = spread(structure.mesh.positions, 0.4); points.push(...p); for (let i = 0; i < p.length; i += 3) owner.push(k); });
    index[layer] = { grid: new PointGrid(Float32Array.from(points), 1), owner };
  }
  const REACH = 0.7;
  const repeats = (mesh, layer) => {
    const points = spread(mesh.positions, 0.5), counts = new Map(), { grid, owner } = index[layer];
    for (let k = 0; k < points.length; k += 3) {
      const [near] = grid.nearest(points[k], points[k + 1], points[k + 2], REACH);
      if (near >= 0) counts.set(owner[near], (counts.get(owner[near]) || 0) + 1);
    }
    if (!counts.size) return false;
    /* or most of it lies on his structures of that layer, split differently (one of its vessels over several of his
       pieces); muscles and ligaments need nearly all, since a muscle sheet lies right on the muscles under it and a
       ligament right on its bones */
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0) / (points.length / 3);
    if (total > (layer === 'muscles' || layer === 'skeleton' ? 0.92 : 0.6)) return true;
    const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (count / (points.length / 3) <= 0.5) return false;
    const back = spread(his[best].mesh.positions, 0.5), mine = new PointGrid(mesh.positions, 1);
    let covered = 0;
    for (let k = 0; k < back.length; k += 3) if (mine.nearest(back[k], back[k + 1], back[k + 2], REACH)[0] >= 0) covered++;
    return covered / (back.length / 3) > 0.5;
  };
  /* or it has the same name as one of his, once sides, "muscle" and a few synonyms are set aside */
  const SYNONYMS = [[/ductus deferens/, 'deferent duct'], [/external abdominal oblique/, 'external oblique'], [/internal abdominal oblique/, 'internal oblique'], [/seminal gland/, 'seminal vesicle'],
    [/suprarenal gland/, 'adrenal gland'], [/vermiform appendix/, 'appendix'], [/oesophagus/, 'esophagus'], [/bucinator/, 'buccinator']];
  const plain = name => { let n = name.toLowerCase().replace(/\b(left|right)\b/g, '').replace(/\bmuscles?\b/g, '').replace(/\s+/g, ' ').trim(); for (const [pattern, to] of SYNONYMS) n = n.replace(pattern, to); return n.replace(/s$/, ''); };
  const hisNames = new Set(his.map(structure => plain(structure.name)));
  const out = [], seen = new Set();
  let duplicates = 0;
  for (const mesh of await readOrgan(`${folder}/zanatomy.glb`, METRES)) {
    if (/\.g$|\?/.test(mesh.raw)) continue;   // collection helpers and unnamed pieces
    const name = zName(mesh.raw), group = mesh.extras?.zgroup;
    const place = placeOf(name, group);
    if (hisNames.has(plain(name))) { duplicates++; continue; }
    const placed = simplify(weld(warpMesh(mesh, warp)), ERROR[place.layer], MINIMUM_SHARE[place.layer]);
    if (placed.indices.length === 0) continue;
    if (repeats(placed, place.layer)) { duplicates++; continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, ...place, mesh: placed, source: 'Z-Anatomy' });
  }
  log(`  Z-Anatomy: ${out.length} structures added, ${duplicates} already in BodyParts3D`);
  return out;
}
