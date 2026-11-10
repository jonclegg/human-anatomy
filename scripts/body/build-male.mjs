// Builds the male body: every BodyParts3D structure, plus the lungs and spinal cord, which BodyParts3D lacks, from the NIH Visible Human
// Male (Human Reference Atlas). His lungs come from a different man, so they are carried into the BodyParts3D body by
// the same fit the female body uses (register.mjs), pinned to the matching bones, organs, spine and skin of both men.
// Z-Anatomy adds what BodyParts3D lacks (zanatomy.mjs); export it first with the scripts in blender/.
// Usage: node scripts/body/build-male.mjs <"Human Anatomy 3D Models" folder>
import { listStructures, readMesh } from './bodyparts3d.mjs';
import { classify } from './systems.mjs';
import { weld, simplify } from './mesh.mjs';
import { readOrgan, FRAMES } from './hra.mjs';
import { register, warpMesh, meanGap, startMap } from './register.mjs';
import { Assembly, ERROR, MINIMUM_SHARE } from './assemble.mjs';
import { zanatomyAdditions } from './zanatomy.mjs';
import { clear, obstacleOf, centreOf, towardCentre } from './clearance.mjs';
import { keepUnder, isGlobe, surfaceSamples } from './transfer.mjs';
import { PointGrid } from './fit.mjs';

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/body/build-male.mjs <"Human Anatomy 3D Models" folder>');
const hra = (folder, file) => `${root}/${folder}/Human Reference Atlas (GLB)/${file}`;
const HEIGHT = 171.9;

const assembly = new Assembly('male', HEIGHT);
/* BodyParts3D has some structures twice under two names, the same mesh or nearly (the audit finds them: audit.mjs): the
   external anal sphincter again as "Superficial perineal muscle"; the celiac trunk as "Celiac artery"; the superior
   mesenteric and renal arteries again as their "Trunk of"; the marginal artery of the colon as "Marginal colic artery";
   one ileal branch as "Ileal artery"; the pancreas as its "Parenchyma"; one bile duct of the caudate lobe under two
   names. And it has the left longus colli in three parts with no right one (Z-Anatomy has both sides whole). */
const NOT_HIS = new RegExp(['Superficial perineal muscle', '(Superior oblique|Vertical intermediate|Inferior oblique) part of left longus colli', 'Celiac artery',
  'Trunk of superior mesenteric artery', 'Trunk of (left|right) renal artery', 'Marginal colic artery', 'Ileal artery', 'Parenchyma of pancreas',
  'Caudate lobe tributary of left hepatic biliary tree'].map(name => `^${name}$`).join('|'));
const his = listStructures(root).map(structure => ({ ...structure, ...classify(structure) })).filter(structure => !NOT_HIS.test(structure.name));
const everything = [];   // { info, mesh }, in the order they are added
for (const structure of his) {
  if (structure.name === 'Intervertebral disk') structure.name = 'Intervertebral disk of twelfth thoracic vertebra';   // unnamed in the source: the one between T12 and L1
  structure.mesh = simplify(weld(readMesh(structure.path)), ERROR[structure.layer], MINIMUM_SHARE[structure.layer]);
  everything.push({ info: { name: structure.name, layer: structure.layer, group: structure.group, source: 'BodyParts3D', id: structure.id, concept: structure.concept }, mesh: structure.mesh });
}
/* what BodyParts3D lacks, from Z-Anatomy, aligned to these bones. Two of its left-side muscles repeat his under another
   name (he has the plantar interossei one by one, and the rotators by region), and its segmental bronchi are thick
   tubes over the bronchial trees he has in detail. */
const REPEATS_HIS = /^Left plantar interossei muscles$|^Left rotatores$|segmental bronchus of (left|right) lung( B[IVX+]+)?$/;
const additions = (await zanatomyAdditions(`${root}/Whole Body - Z-Anatomy (Blender)/export`, his)).filter(structure => !REPEATS_HIS.test(structure.name));
/* Z-Anatomy's left side is its right side mirrored, and the test for what he already has sometimes keeps one side
   only (a chin muscle, a bursa): the missing twin is the kept one, mirrored */
{
  const names = new Set([...his, ...additions].map(structure => structure.name.toLowerCase()));
  const twin = name => name.replace(/\b(left|right)\b/i, word => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' })[word]);
  /* the organs of the chest and belly are not mirror images of each other: the right lung has no lingula */
  const ONE_SIDED_BY_NATURE = /lung|lingula|bronch|hepat|liver|gastr|colic|splen|cardi|coronar|atri|ventric|aort|\bcav|azyg/i;
  const mirrored = [];
  for (const structure of additions) {
    if (!/\b(left|right)\b/i.test(structure.name) || ONE_SIDED_BY_NATURE.test(structure.name) || names.has(twin(structure.name).toLowerCase())) continue;
    const positions = Float32Array.from(structure.mesh.positions, (value, k) => (k % 3 === 0 ? -value : value)), indices = Uint32Array.from(structure.mesh.indices);
    for (let k = 0; k < indices.length; k += 3) { const swap = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = swap; }
    mirrored.push({ ...structure, name: twin(structure.name), mesh: { positions, indices } });
  }
  console.log(`  ${mirrored.length} one-sided Z-Anatomy structures given their twin: ${mirrored.map(structure => structure.name).join(', ')}`);
  additions.push(...mirrored);
}
/* Z-Anatomy's orbicularis oris is a ring around an open mouth, with the teeth showing through it. The lips are closed:
   along the front of the mouth the upper and lower halves of the ring are drawn together to meet at the lip line, and
   the muscle above and below follows by less and less, to nothing 1.2 cm away. */
{
  const lips = additions.filter(structure => /orbicularis oris/i.test(structure.name));
  if (lips.length !== 2) throw new Error(`expected the two halves of orbicularis oris, found ${lips.length}`);
  const front = Math.max(...lips.flatMap(({ mesh }) => Array.from({ length: mesh.positions.length / 3 }, (_, v) => mesh.positions[3 * v + 2])));
  const WIDE = 0.5, REACH = 1.2, columns = new Map();
  for (const { mesh } of lips) for (let k = 0; k < mesh.positions.length; k += 3) {
    if (mesh.positions[k + 2] < front - 1.5) continue;
    const key = Math.round(mesh.positions[k] / WIDE);
    (columns.get(key) || columns.set(key, []).get(key)).push(mesh.positions[k + 1]);
  }
  /* in each column across the mouth, the opening is the widest gap between the heights of the ring's points */
  const opening = new Map();
  for (const [key, heights] of columns) {
    heights.sort((a, b) => a - b);
    let widest = 0, middle = 0;
    for (let k = 1; k < heights.length; k++) if (heights[k] - heights[k - 1] > widest) { widest = heights[k] - heights[k - 1]; middle = (heights[k] + heights[k - 1]) / 2; }
    if (widest > 0.15 && widest < 2 * REACH) opening.set(key, { half: widest / 2, middle });
  }
  let closed = 0;
  for (const { mesh } of lips) for (let k = 0; k < mesh.positions.length; k += 3) {
    const gap = opening.get(Math.round(mesh.positions[k] / WIDE));
    if (!gap || mesh.positions[k + 2] < front - 2.5) continue;
    const from = mesh.positions[k + 1] - gap.middle, far = Math.abs(from);
    if (far >= REACH) continue;
    mesh.positions[k + 1] = gap.middle + Math.sign(from) * Math.max(0, far - gap.half) * REACH / (REACH - gap.half);
    closed++;
  }
  console.log(`  lips closed: the mouth of orbicularis oris was open by up to ${(2 * Math.max(0, ...[...opening.values()].map(gap => gap.half))).toFixed(1)} cm; ${closed} points moved`);
}
for (const structure of additions) everything.push({ info: { name: structure.name, layer: structure.layer, group: structure.group, source: structure.source }, mesh: structure.mesh });
const him = pattern => his.filter(structure => pattern.test(structure.name)).map(structure => structure.mesh);
const himGroup = (layer, group) => his.filter(structure => structure.layer === layer && structure.group === group).map(structure => structure.mesh);

/* the Visible Human Male: the matching structures, and the lungs to carry across */
const nihMale = async file => (await Promise.all(file.map(([folder, name]) => readOrgan(hra(folder, name), FRAMES.male)))).flat();
const vhm = await nihMale([
  ['Skeletal', 'HRA_pelvis_male_vh.glb'], ['Skeletal', 'HRA_left_knee_male_vh.glb'], ['Skeletal', 'HRA_right_knee_male_vh.glb'], ['Skeletal', 'HRA_intervertebral_disk_male_vh.glb'],
  ['Circulatory', 'HRA_heart_male_vh.glb'], ['Digestive', 'HRA_liver_male_vh.glb'], ['Urinary', 'HRA_left_kidney_male_vh.glb'], ['Urinary', 'HRA_right_kidney_male_vh.glb'],
  ['Lymphatic', 'HRA_spleen_male_vh.glb'], ['Respiratory', 'HRA_trachea_male_vh.glb'], ['Respiratory', 'HRA_larynx_male_vh.glb'], ['Skin', 'HRA_skin_male_vh.glb'],
]);
const vh = pattern => vhm.filter(mesh => pattern.test(mesh.raw));
const vhSkin = vh(/skin/)[0];
const centre = meshes => { const sum = [0, 0, 0]; let n = 0; for (const mesh of meshes) for (let k = 0; k < mesh.positions.length; k++) { sum[k % 3] += mesh.positions[k]; if (k % 3 === 0) n++; } return sum.map(value => value / n); };
const centreY = mesh => centre([mesh])[1];
console.log('fitting the Visible Human Male to the BodyParts3D male:');
const pairs = [
  { name: 'left hip bone', source: vh(/(pubis|ilium|ischium)_compact_bone_L/), target: him(/^Left hip bone$/) },
  { name: 'right hip bone', source: vh(/(pubis|ilium|ischium)_compact_bone_R/), target: him(/^Right hip bone$/) },
  { name: 'sacrum', source: vh(/M_sacrum/), target: him(/^Sacrum$/) },
  ...['L', 'R'].flatMap(side => ['femur', 'tibia', 'patella'].map(bone => ({ name: `${side} ${bone}`, source: vh(new RegExp(`M_${bone}_${side}$`)), target: him(new RegExp(`^${side === 'L' ? 'Left' : 'Right'} ${bone}$`)) }))),
  { name: 'heart', source: vh(/ventricle|atrium|septum/), target: himGroup('organs', 'heart'), spacing: 2 },
  { name: 'liver', source: vh(/segment|lobe/).filter(mesh => /liver/.test(mesh.raw) || /segment|caudate|quadrate/.test(mesh.raw)), target: him(/^(Hepatovenous segment|Caudate lobe of liver)/), spacing: 3 },
  { name: 'left kidney', source: vh(/outer_cortex_of_kidney_L|kidney_capsule_L/), target: him(/^Left kidney$/) },
  { name: 'right kidney', source: vh(/outer_cortex_of_kidney_R|kidney_capsule_R/), target: him(/^Right kidney$/) },
  { name: 'trachea', source: vh(/M_trachea$/), target: him(/^Trachea$/) },
  { name: 'thyroid cartilage', source: vh(/thyroid_cartilage/), target: him(/^Thyroid cartilage$/) },
];
for (const pair of pairs) if (!pair.source.length || !pair.target.length) throw new Error(`nothing to match for ${pair.name}`);
const discs = his.filter(structure => /^Intervertebral disk/.test(structure.name)).map(structure => structure.mesh).sort((a, b) => centreY(b) - centreY(a));
const vhDiscs = vh(/intervertebral_disk/).filter(mesh => !/nucleus/.test(mesh.raw)).sort((a, b) => centreY(b) - centreY(a));
const vhHeight = 182.4;
const start = startMap(vhHeight, HEIGHT, centre(vh(/(pubis|ilium|ischium)_compact/)), centre(him(/^(Left|Right) hip bone$/)));
const warp = register({ pairs, spine: { source: vhDiscs, target: discs }, skin: { source: vhSkin, target: his.find(s => s.name === 'Skin').mesh, skip: (x, y) => y < 16 || Math.abs(x) > 22 }, start });

/* BodyParts3D has the spinal cord's central canal but not the cord itself: carried across from the Visible Human Male too */
for (const mesh of await nihMale([['Nervous', 'HRA_spinal_cord_male_vh.glb']])) everything.push({ info: { name: mesh.name, layer: 'nerves', group: 'spinal', source: 'NIH male' }, mesh: simplify(weld(warpMesh(mesh, warp)), ERROR.nerves, MINIMUM_SHARE.nerves) });
const lungs = (await nihMale([['Respiratory', 'HRA_lung_male_vh.glb']])).filter(mesh => /bronchopulmonary_segm/.test(mesh.raw));
/* his lungs came from another man: where they would pass through this man's ribs, they give way, as lungs carry the
   impressions of the ribs; each lung is pushed toward its own middle */
const chestBones = obstacleOf(his.filter(structure => /rib$|costal cartilage|vertebra$|sternum|xiphoid|manubrium|clavicle|scapula/i.test(structure.name)).map(structure => structure.mesh));
const lungCentre = { left: centreOf(lungs.filter(mesh => /left/.test(mesh.name)).map(mesh => warpMesh(mesh, warp))), right: centreOf(lungs.filter(mesh => /right/.test(mesh.name)).map(mesh => warpMesh(mesh, warp))) };
let pushed = 0;
for (const mesh of lungs) {
  const placed = warpMesh(mesh, warp);
  pushed += clear(placed, chestBones, towardCentre(lungCentre[/left/.test(mesh.name) ? 'left' : 'right']), { reach: 1.8, depth: 1.6 });
  everything.push({ info: { name: mesh.name, layer: 'organs', group: 'respiratory', source: 'NIH male' }, mesh: simplify(weld(placed), ERROR.organs, MINIMUM_SHARE.organs) });
}
console.log(`  lungs kept clear of the ribs: ${pushed} points moved`);
console.log(`  check left femur: ${meanGap(warpMesh(vh(/M_femur_L$/)[0], warp), him(/^Left femur$/)[0]).toFixed(2)} cm from the BodyParts3D femur after the warp; ${lungs.length} lung segments carried across`);
/* Z-Anatomy's occipitalis is a thin sheet modelled on another skull: where it dips into this man's, it is lifted
   to lie on it. Each point's height over the skull is raised by a rule that keeps heights in order (what was higher
   stays higher), so a sheet's outer face stays outside its inner face: below 0.4 cm the height eases toward 0.1 cm. */
{
  const vault = everything.filter(({ info }) => /^(Frontal|Occipital|(Left|Right) (parietal|temporal)) bone$/.test(info.name)).map(({ mesh }) => mesh);
  /* the skull's surface closely sampled, each sample with its face's normal turned outward: its own vertices are
     centimetres apart on the smooth vault, too far to measure a height against */
  const middle = centreOf(vault), points = [], normals = [], FROM = 0.4, LEAST = 0.1;
  for (const mesh of vault) {
    const samples = surfaceSamples(mesh, 0.25);
    for (let k = 0; k < samples.points.length; k += 3) {
      const out = [0, 1, 2].map(c => samples.points[k + c] - middle[c]), n = [0, 1, 2].map(c => samples.normals[k + c]);
      const sign = out[0] * n[0] + out[1] * n[1] + out[2] * n[2] < 0 ? -1 : 1;
      points.push(samples.points[k], samples.points[k + 1], samples.points[k + 2]); normals.push(sign * n[0], sign * n[1], sign * n[2]);
    }
  }
  const skull = new PointGrid(Float32Array.from(points), 1);
  let lifted = 0;
  for (const { info, mesh } of everything) {
    if (info.source !== 'Z-Anatomy' || !/occipitalis/i.test(info.name)) continue;
    const p = mesh.positions;
    for (let k = 0; k < p.length; k += 3) {
      const [index] = skull.nearest(p[k], p[k + 1], p[k + 2], 3);
      if (index < 0) continue;
      const n = normals.slice(3 * index, 3 * index + 3);
      const height = (p[k] - points[3 * index]) * n[0] + (p[k + 1] - points[3 * index + 1]) * n[1] + (p[k + 2] - points[3 * index + 2]) * n[2];
      if (height >= FROM) continue;
      const raised = LEAST + (FROM - LEAST) * Math.exp((height - FROM) / (FROM - LEAST));
      for (let c = 0; c < 3; c++) p[k + c] += (raised - height) * n[c];
      lifted++;
    }
  }
  console.log(`  occipitalis lifted onto his skull: ${lifted} points moved`);
}
/* Z-Anatomy's structures were modelled on another body: some lie a little outside this man's skin (the frontalis, the
   latissimus dorsi at the armpit, a vein). Whatever lies outside the skin or just under it is brought under, with the
   layers beneath it (transfer.mjs). The hands and feet have no depth to press into. */
{
  /* his outer surface: his skin, and his hair, under which the skin has no scalp */
  const outer = everything.filter(({ info }) => info.layer === 'skin' && /^(Skin|Hair of head)$/.test(info.name)).map(({ mesh }) => mesh);
  if (outer.length !== 2) throw new Error('expected his skin and his hair');
  const skin = { positions: Float32Array.from([...outer[0].positions, ...outer[1].positions]), indices: Uint32Array.from([...outer[0].indices, ...Array.from(outer[1].indices, index => index + outer[0].positions.length / 3)]) };
  const extremity = /metacarpal|metatarsal|phalanx|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|cuneiform|cuboid|navicular|talus|calcaneus/i;
  const points = [], thinBone = [];
  for (const { info, mesh } of everything) if (info.layer === 'skeleton') for (let k = 0; k < mesh.positions.length; k += 3) { points.push(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]); thinBone.push(extremity.test(info.name)); }
  const grid = new PointGrid(Float32Array.from(points), 2);
  const thin = Uint8Array.from({ length: skin.positions.length / 3 }, (_, v) => { const [index] = grid.nearest(skin.positions[3 * v], skin.positions[3 * v + 1], skin.positions[3 * v + 2], 30); return index >= 0 && thinBone[index] ? 1 : 0; });
  const inside = everything.filter(({ info }) => info.layer !== 'skin').map(({ info, mesh }) => ({ name: info.name, layer: info.layer, positions: mesh.positions, ownSkin: info.source === 'BodyParts3D' })).filter(structure => !isGlobe(structure));
  /* not on the vault of his head: under the hair his skin has no scalp, and nothing there needs it. It fades out
     over the brow, from a centimetre under the eyes' level to a centimetre and a half over it. */
  const eyes = everything.filter(({ info }) => /^(Left|Right) sclera$/.test(info.name)).map(({ mesh }) => centreOf([mesh])[1]);
  if (eyes.length !== 2) throw new Error('expected his two eyes');
  const eyeLevel = (eyes[0] + eyes[1]) / 2;
  const share = (x, y) => { const t = Math.min(1, Math.max(0, (y - (eyeLevel - 1)) / 2.5)); return 1 - t * t * (3 - 2 * t); };
  console.log(`  kept under his skin: ${keepUnder(skin, inside, { thin, share, openings: true })}`);
}
for (const { info, mesh } of everything) assembly.add(info, mesh, { prepared: true });
await assembly.write(new URL('../../site/body/data/male/', import.meta.url));

