// Builds the female body.
// Scanned: her skin, organs, vessels of the trunk and head, brain, spinal cord, bony pelvis, thigh and leg bones,
// kneecaps, breastbone and intervertebral discs, from the NIH Visible Human Female (Human Reference Atlas, CC BY 4.0).
// Fitted: no free female skeleton or muscle model exists, so her other bones and all her muscles (and the few organs
// the NIH set lacks, such as the stomach) are the BodyParts3D male ones, warped to her body. The warp is pinned to her
// scanned bones and organs, her spine disc by disc, and her skin (register.mjs). Fitted parts are marked as such.
// Usage: node scripts/body/build-female.mjs <"Human Anatomy 3D Models" folder> <female-reproductive-3d-models folder>
import { listStructures, readMesh } from './bodyparts3d.mjs';
import { classify } from './systems.mjs';
import { weld, simplify } from './mesh.mjs';
import { readOrgan, FRAMES } from './hra.mjs';
import { register, warpMesh, meanGap, startMap } from './register.mjs';
import { PointGrid, spread, icpSimilarity, applyAffine } from './fit.mjs';
import { Assembly, ERROR, MINIMUM_SHARE } from './assemble.mjs';

const [root, reproductive] = process.argv.slice(2);
if (!root || !reproductive) throw new Error('usage: node scripts/body/build-female.mjs <"Human Anatomy 3D Models" folder> <female-reproductive-3d-models folder>');
const hra = (folder, file) => `${root}/${folder}/Human Reference Atlas (GLB)/${file}`;

/* ---------- Her scanned parts: file, layer, group, and which meshes to keep ---------- */
const LIVER_SURFACES = /impression|capsule|bare_area|diaphragmatic_surface|porta_hepatis/;
const NIH = [
  [hra('Skeletal', 'HRA_intervertebral_disk_female_vh.glb'), 'skeleton', 'spine', raw => !/nucleus/.test(raw)],
  [hra('Skeletal', 'HRA_left_knee_female_vh.glb'), 'skeleton', 'leg', raw => /femur_L|tibia|fibula|patella|meniscus|articular_cartilage/.test(raw)],
  [hra('Skeletal', 'HRA_right_knee_female_vh.glb'), 'skeleton', 'leg', raw => /femur_R|tibia|fibula|patella|meniscus|articular_cartilage/.test(raw)],
  [hra('Skeletal', 'HRA_sternum_female_vh.glb'), 'skeleton', 'chest'],
  [hra('Skeletal', 'HRA_manubrium_female_vh.glb'), 'skeleton', 'chest'],
  [`${reproductive}/HRA_bony_pelvis_female_VHF.glb`, 'skeleton', 'pelvis', raw => !/spongy/.test(raw)],
  [hra('Circulatory', 'HRA_heart_female_vh.glb'), 'organs', 'heart'],
  [hra('Circulatory', 'HRA_blood_vasculature_female_vh.glb'), 'vessels', null],
  [hra('Digestive', 'HRA_large_intestine_female_sbu.glb'), 'organs', 'digestive'],
  [hra('Digestive', 'HRA_liver_female_vh.glb'), 'organs', 'digestive', raw => !LIVER_SURFACES.test(raw)],
  [hra('Digestive', 'HRA_mouth_female_vh.glb'), 'organs', 'digestive'],
  [hra('Digestive', 'HRA_pancreas_female_vh.glb'), 'organs', 'digestive'],
  [hra('Digestive', 'HRA_small_intestine_female_vh.glb'), 'organs', 'digestive'],
  [hra('Lymphatic', 'HRA_left_palatine_tonsil_female_vh.glb'), 'organs', 'lymphatic'],
  [hra('Lymphatic', 'HRA_right_palatine_tonsil_female_vh.glb'), 'organs', 'lymphatic'],
  [hra('Lymphatic', 'HRA_spleen_female_vh.glb'), 'organs', 'lymphatic'],
  [hra('Lymphatic', 'HRA_thymus_female_vh.glb'), 'organs', 'lymphatic'],
  [hra('Nervous', 'HRA_brain_female_allen.glb'), 'nerves', 'brain'],
  [hra('Nervous', 'HRA_spinal_cord_female_vh.glb'), 'nerves', 'spinal'],
  [hra('Respiratory', 'HRA_larynx_female_vh.glb'), 'organs', 'respiratory'],
  [hra('Respiratory', 'HRA_lung_female_vh.glb'), 'organs', 'respiratory'],
  [hra('Respiratory', 'HRA_main_bronchus_female_vh.glb'), 'organs', 'respiratory'],
  [hra('Respiratory', 'HRA_trachea_female_vh.glb'), 'organs', 'respiratory'],
  [hra('Sense Organs', 'HRA_left_eye_female_vh.glb'), 'organs', 'senses'],
  [hra('Sense Organs', 'HRA_right_eye_female_vh.glb'), 'organs', 'senses'],
  [hra('Skin', 'HRA_skin_female_vh.glb'), 'skin', 'skin'],
  [hra('Skin', 'HRA_left_mammary_gland_female_vh.glb'), 'organs', 'breast'],
  [hra('Skin', 'HRA_right_mammary_gland_female_vh.glb'), 'organs', 'breast'],
  [hra('Urinary', 'HRA_left_kidney_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_right_kidney_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_left_renal_pelvis_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_right_renal_pelvis_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_left_ureter_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_right_ureter_female_vh.glb'), 'organs', 'urinary'],
  [hra('Urinary', 'HRA_urinary_bladder_female_vh.glb'), 'organs', 'urinary'],
  [`${reproductive}/HRA_uterus_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_vagina_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_cervix_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_fallopian_tube_left_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_fallopian_tube_right_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_ovary_left_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_ovary_right_female_VHF.glb`, 'organs', 'reproductive'],
  [`${reproductive}/HRA_uterine_ovarian_ligaments_broad_round_female_VHF.glb`, 'organs', 'reproductive'],
];
/* a few raw names read better with a fix */
const RENAME = { Jejenum: 'Jejunum', 'Ginviva of upper jaw': 'Gingiva of upper jaw', 'Ucinate process': 'Uncinate process of pancreas', Caecum: 'Cecum',
  'Opthalmic artery': 'Ophthalmic artery', 'Fibria of uterine tube': 'Fimbriae of uterine tube', Thyroid_cartilage: 'Thyroid cartilage', 'Epiglotic cartilage': 'Epiglottic cartilage' };
const fixName = name => { for (const [from, to] of Object.entries(RENAME)) name = name.replace(from, to); return name.replace(/ (a|b|c)$/, (m, letter) => ` (part ${'abc'.indexOf(letter) + 1})`); };

const nih = [];   // { name, raw, file, layer, group, positions, indices }
for (const [path, layer, group, keep] of NIH) {
  for (const mesh of await readOrgan(path, FRAMES.female)) {
    if (keep && !keep(mesh.raw)) continue;
    nih.push({ ...mesh, name: fixName(mesh.name), file: path.split('/').pop(), layer, group: group || (/vein|sinus|vena/i.test(mesh.raw) ? 'veins' : 'arteries') });
  }
}
/* the same organ appears in more than one file (the bladder sits in two): keep the first */
{
  const seen = new Set();
  for (let k = nih.length - 1; k >= 0; k--) { const key = `${nih[k].raw}|${nih[k].positions.length}`; if (seen.has(key)) nih.splice(k, 1); else seen.add(key); }
}
const her = (pattern, file) => nih.filter(mesh => pattern.test(mesh.raw) && (!file || file.test(mesh.file)));
const herSkin = her(/skin/, /skin_female/)[0];
const skinHeight = heightOf(herSkin);
console.log(`female: ${nih.length} scanned meshes, ${skinHeight.toFixed(1)} cm tall`);

/* ---------- His parts, simplified, in the model frame ---------- */
const his = listStructures(root).map(structure => ({ ...structure, ...classify(structure) }));
for (const structure of his) structure.mesh = simplify(weld(readMesh(structure.path)), ERROR[structure.layer], MINIMUM_SHARE[structure.layer]);
const him = pattern => his.filter(structure => pattern.test(structure.name)).map(structure => structure.mesh);
const himGroup = (layer, group) => his.filter(structure => structure.layer === layer && structure.group === group).map(structure => structure.mesh);

/* ---------- The warp, his body onto hers ---------- */
/* discs are matched top to bottom by their share of the spine's length: she has six lumbar discs to his five */
const hisDiscs = his.filter(structure => /^Intervertebral disk/.test(structure.name)).sort((a, b) => centreY(b.mesh) - centreY(a.mesh));
const herDiscs = her(/intervertebral_disk/).sort((a, b) => centreY(b) - centreY(a));
const pelvisCentre = meshes => { const points = meshes.flatMap(mesh => [...mesh.positions]); const sum = [0, 0, 0]; for (let k = 0; k < points.length; k++) sum[k % 3] += points[k]; return sum.map(value => value / (points.length / 3)); };
const start = startMap(171.9, skinHeight, pelvisCentre(him(/^(Left|Right) hip bone$/)), pelvisCentre(her(/(pubis|ilium|ischium)_compact/)));

console.log('fitting the male body to the female:');
const pairs = [
  { name: 'left hip bone', source: him(/^Left hip bone$/), target: her(/(pubis|ilium|ischium)_compact_bone_L/) },
  { name: 'right hip bone', source: him(/^Right hip bone$/), target: her(/(pubis|ilium|ischium)_compact_bone_R/) },
  { name: 'sacrum', source: him(/^Sacrum$/), target: her(/F_sacrum/) },
  ...['L', 'R'].flatMap(side => {
    const word = side === 'L' ? 'Left' : 'Right';
    return ['femur', 'tibia', 'fibula', 'patella'].map(bone => ({ name: `${word.toLowerCase()} ${bone}`, source: him(new RegExp(`^${word} ${bone}$`)), target: her(new RegExp(`F_${bone}_${side}$`)) }));
  }),
  { name: 'sternum', source: him(/^(Body of sternum|Xiphoid process)$/), target: her(/sternum/, /sternum_female/) },
  { name: 'manubrium', source: him(/^Manubrium$/), target: her(/manubrium/) },
  { name: 'heart', source: himGroup('organs', 'heart'), target: nih.filter(mesh => /heart_female/.test(mesh.file)), spacing: 2 },
  { name: 'liver', source: him(/^(Hepatovenous segment|Caudate lobe of liver)/), target: nih.filter(mesh => /liver_female/.test(mesh.file) && /segment|lobe/.test(mesh.raw)), spacing: 3 },
  { name: 'left kidney', source: him(/^Left kidney$/), target: her(/outer_cortex_of_kidney_L|kidney_capsule_L/) },
  { name: 'right kidney', source: him(/^Right kidney$/), target: her(/outer_cortex_of_kidney_R|kidney_capsule_R/) },
  { name: 'spleen', source: him(/^Spleen$/), target: nih.filter(mesh => /spleen_female/.test(mesh.file)) },
  { name: 'bladder', source: him(/^Urinary bladder$/), target: nih.filter(mesh => /bladder_female/.test(mesh.file)) },
  { name: 'rectum', source: him(/^Rectum$/), target: her(/F_rectum$/, /large_intestine/) },
  { name: 'brain', source: himGroup('nerves', 'brain'), target: nih.filter(mesh => /brain_female/.test(mesh.file)), spacing: 3 },
  { name: 'left eye', source: him(/^Left sclera$/), target: her(/sclera_L/) },
  { name: 'right eye', source: him(/^Right sclera$/), target: her(/sclera_R/) },
  { name: 'trachea', source: him(/^Trachea$/), target: her(/F_trachea$/) },
  { name: 'thyroid cartilage', source: him(/^Thyroid cartilage$/), target: her(/thyroid_cartilage/) },
];
/* Her feet: she was scanned lying down with her feet pointed, so each foot is turned at the ankle as a whole to match
   her scanned foot, rather than pulled point by point onto her skin (which would drag his toes up her shins). */
const hisSkin = his.find(structure => structure.name === 'Skin').mesh;
const FOOT_TOP = 10;   // cm above the floor: his foot, below the ankle
const extra = { from: [], to: [] };
for (const side of [1, -1]) {
  const word = side > 0 ? 'Left' : 'Right', letter = side > 0 ? 'L' : 'R';
  const region = (mesh, top) => { const out = []; for (let k = 0; k < mesh.positions.length; k += 3) if (mesh.positions[k + 1] < top && mesh.positions[k] * side > 2) out.push(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]); return out; };
  const hisTibia = him(new RegExp(`^${word} tibia$`))[0], herTibia = her(new RegExp(`F_tibia_${letter}$`))[0];
  const ankle = (mesh, ceiling) => { const low = region(mesh, ceiling); return [0, 1, 2].map(c => low.filter((_, k) => k % 3 === c).reduce((a, b) => a + b, 0) / (low.length / 3)); };
  const hisAnkle = ankle(hisTibia, lowest(hisTibia) + 1.5), herAnkle = ankle(herTibia, lowest(herTibia) + 1.5);
  const hisFoot = region(hisSkin, FOOT_TOP), herFoot = region(herSkin, herAnkle[1] + 2.5);
  const map = footMap(hisFoot, hisAnkle, herFoot, herAnkle);
  const bones = his.filter(structure => structure.layer === 'skeleton' && centreY(structure.mesh) < FOOT_TOP - 2 && centreX(structure.mesh) * side > 0).flatMap(structure => [...structure.mesh.positions]);
  const anchors = [...spread(bones, 2), ...spread(hisFoot, 3)];
  for (let k = 0; k < anchors.length; k += 3) { extra.from.push(anchors[k], anchors[k + 1], anchors[k + 2]); extra.to.push(...applyAffine(map.map, anchors[k], anchors[k + 1], anchors[k + 2])); }
  console.log(`  ${word.toLowerCase()} foot: turned ${map.degrees.toFixed(0)}° at the ankle, ICP left ${map.meanDistance.toFixed(2)} cm, ${anchors.length / 3} anchors`);
}
/* Her hands are posed differently too: each hand is fitted as a whole to her scanned hand, the same way */
const HAND_REACH = 19;   // cm back from the fingertip: the hand
const handOf = (mesh, side) => {
  let tip = null, best = -Infinity;
  for (let k = 0; k < mesh.positions.length; k += 3) if (mesh.positions[k] * side > best) { best = mesh.positions[k] * side; tip = mesh.positions.slice(k, k + 3); }
  const out = [];
  for (let k = 0; k < mesh.positions.length; k += 3) if (Math.hypot(mesh.positions[k] - tip[0], mesh.positions[k + 1] - tip[1], mesh.positions[k + 2] - tip[2]) < HAND_REACH) out.push(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]);
  return { points: out, tip: Array.from(tip) };
};
const hisHands = {}, handWrist = {}, handWristTarget = {};
for (const side of [1, -1]) {
  const word = side > 0 ? 'left' : 'right';
  const hisHand = handOf(hisSkin, side), herHand = handOf(herSkin, side);
  const middle = points => [0, 1, 2].map(c => points.filter((_, k) => k % 3 === c).reduce((a, b) => a + b, 0) / (points.length / 3));
  const map = footMap(hisHand.points, middle(hisHand.points), herHand.points, middle(herHand.points), hisHand.tip, herHand.tip);
  hisHands[side] = hisHand;
  /* the wrist: the end of the hand away from the fingertip, and where the hand's fit puts it */
  const wrist = hisHand.tip.map((value, c) => middle(hisHand.points)[c] + (middle(hisHand.points)[c] - value) * 0.9);
  handWrist[side] = wrist; handWristTarget[side] = applyAffine(map.map, ...wrist);
  const inHand = mesh => { const c = [centreX(mesh), centreY(mesh), centreZ(mesh)]; return Math.hypot(c[0] - hisHand.tip[0], c[1] - hisHand.tip[1], c[2] - hisHand.tip[2]) < HAND_REACH - 2; };
  const bones = his.filter(structure => structure.layer === 'skeleton' && inHand(structure.mesh)).flatMap(structure => [...structure.mesh.positions]);
  const anchors = [...spread(bones, 1.5), ...spread(hisHand.points, 2.5)];
  for (let k = 0; k < anchors.length; k += 3) { extra.from.push(anchors[k], anchors[k + 1], anchors[k + 2]); extra.to.push(...applyAffine(map.map, anchors[k], anchors[k + 1], anchors[k + 2])); }
  console.log(`  ${word} hand: turned ${map.degrees.toFixed(0)}°, ICP left ${map.meanDistance.toFixed(2)} cm, ${anchors.length / 3} anchors`);
}
/* Her skin is not a good guide for his muscles where her fat is much thicker than his (trunk, hips, thighs, upper arms):
   pulling muscle out to skin would bulge it. So the trunk and legs follow her scanned bones and organs alone; the arms,
   which have no scanned bones, follow the centre line of her arm, slice by slice; only the head and neck match skin. */
const spine = { source: hisDiscs.map(disc => disc.mesh), target: herDiscs };
const quiet = () => {};
const rough = register({ pairs, extra, spine, start, log: quiet });
const shoulder = side => { const humerus = him(new RegExp(`^${side > 0 ? 'Left' : 'Right'} humerus$`))[0]; let top = -Infinity, at = null; for (let k = 0; k < humerus.positions.length; k += 3) if (humerus.positions[k + 1] > top) { top = humerus.positions[k + 1]; at = humerus.positions.slice(k, k + 3); } return [at[0], at[1] - 2.5, at[2]]; };
const ringCentre = (mesh, centre, axis) => {
  let point = centre;
  for (let pass = 0; pass < 2; pass++) {
    const sum = [0, 0, 0]; let n = 0;
    for (let k = 0; k < mesh.positions.length; k += 3) {
      const d = [0, 1, 2].map(c => mesh.positions[k + c] - point[c]), along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      if (Math.abs(along) > 1.2) continue;
      const across = Math.hypot(...d.map((value, c) => value - along * axis[c]));
      if (across > 9) continue;
      for (let c = 0; c < 3; c++) sum[c] += mesh.positions[k + c]; n++;
    }
    if (n < 12) return null;
    point = sum.map(value => value / n);
  }
  return point;
};
for (const side of [1, -1]) {
  const hisShoulder = shoulder(side), hisWrist = handWrist[side], herShoulder = rough(...hisShoulder), herWrist = handWristTarget[side];
  const axisOf = (a, b) => { const d = b.map((value, c) => value - a[c]), length = Math.hypot(...d); return d.map(value => value / length); };
  let count = 0;
  for (let t = 0.2; t <= 0.9; t += 0.07) {
    const his = ringCentre(hisSkin, hisShoulder.map((value, c) => value + t * (hisWrist[c] - value)), axisOf(hisShoulder, hisWrist));
    const hers = ringCentre(herSkin, herShoulder.map((value, c) => value + t * (herWrist[c] - value)), axisOf(herShoulder, herWrist));
    if (!his || !hers) continue;
    extra.from.push(...his); extra.to.push(...hers); count++;
  }
  console.log(`  ${side > 0 ? 'left' : 'right'} arm: ${count} slices matched along its length`);
}
const headAndNeck = (x, y) => y > 138 && Math.abs(x) < 13;
const warp = register({ pairs, extra, spine, skin: { source: hisSkin, target: herSkin, skip: (x, y, z) => !headAndNeck(x, y) }, start });
for (const [name, source, target] of [['left femur', him(/^Left femur$/), her(/F_femur_L$/)], ['skull to brain', himGroup('nerves', 'brain'), nih.filter(mesh => /brain_female/.test(mesh.file))]]) {
  console.log(`  check ${name}: ${meanGap(warpMesh(source[0], warp), target[0]).toFixed(2)} cm from hers after the warp`);
}

/* ---------- Which of his parts she keeps (fitted), and which her scans replace ---------- */
const REPLACED = [
  /^(Left|Right) hip bone$/, /^Sacrum$/, /^(Left|Right) (femur|tibia|fibula|patella)$/, /^(Body of sternum|Manubrium|Xiphoid process)$/, /^Intervertebral disk/,
  /hepatovenous|caudate lobe of liver|pancrea|^spleen$|kidney|ureter|urinary bladder|^urethra$/i,
  /duodenum|jejunum|ileum|ileocecal|colon|appendix|^rectum$|taenia|mesentery|mesocolon|mesoappendix/i,
  /^trachea$|main bronchus|bronchial tree|thyroid cartilage|cricoid|arytenoid|corniculate|cuneiform cartilage|epiglott|vocal ligament|conus elasticus/i,
  /thymus|tooth|tongue|gingiva|sublingual|submandibular|^lip$/i,
  /sclera|cornea|iris|lens|choroid|retina|vitreous|anterior chamber|corona ciliaris/i,
  /spinal cord|central canal/i,
];
function keepsHis(structure) {
  if (structure.layer === 'skin') return false;
  if (structure.layer === 'organs' && (structure.group === 'heart' || structure.group === 'reproductive')) return false;
  if (structure.layer === 'nerves' && structure.group === 'brain') return false;
  if (structure.layer === 'vessels' && /penis|penile|testicular|scrotal|cremaster|prostat|vesicular|deferent/i.test(structure.name)) return false;
  return !REPLACED.some(pattern => pattern.test(structure.name));
}
/* his vessels where hers were scanned would double up: drop any that mostly runs within 1.2 cm of one of hers */
const herVessels = new PointGrid(Float32Array.from(nih.filter(mesh => mesh.layer === 'vessels').flatMap(mesh => spread(mesh.positions, 0.3))), 1);
const duplicatesHers = mesh => { const points = spread(mesh.positions, 0.5); let near = 0; for (let k = 0; k < points.length; k += 3) if (herVessels.nearest(points[k], points[k + 1], points[k + 2], 1.2)[0] >= 0) near++; return near / (points.length / 3) > 0.4; };

const assembly = new Assembly('female', Math.round(skinHeight * 10) / 10);
let fitted = 0, dropped = 0;
for (const structure of his) {
  if (!keepsHis(structure)) { dropped++; continue; }
  const mesh = warpMesh(structure.mesh, warp);
  if (structure.layer === 'vessels' && duplicatesHers(mesh)) { dropped++; continue; }
  assembly.add({ name: structure.name, layer: structure.layer, group: structure.group, source: 'BodyParts3D', fitted: true, id: structure.id, concept: structure.concept }, mesh, { prepared: true });
  fitted++;
}
for (const mesh of nih) assembly.add({ name: mesh.name, layer: mesh.layer, group: mesh.group, source: 'NIH female' }, mesh);
console.log(`female: ${fitted} fitted from the male, ${dropped} of his replaced by hers, ${nih.length} scanned`);
await assembly.write(new URL('../../site/body/data/female/', import.meta.url));

function centreY(mesh) { let sum = 0; for (let k = 1; k < mesh.positions.length; k += 3) sum += mesh.positions[k]; return sum / (mesh.positions.length / 3); }
function centreX(mesh) { let sum = 0; for (let k = 0; k < mesh.positions.length; k += 3) sum += mesh.positions[k]; return sum / (mesh.positions.length / 3); }
function centreZ(mesh) { let sum = 0; for (let k = 2; k < mesh.positions.length; k += 3) sum += mesh.positions[k]; return sum / (mesh.positions.length / 3); }
function lowest(mesh) { let low = Infinity; for (let k = 1; k < mesh.positions.length; k += 3) low = Math.min(low, mesh.positions[k]); return low; }
/* turn and scale his foot (or hand) about a pivot so its long axis lies along hers, then refine without shearing it */
function footMap(hisFoot, hisAnkle, herFoot, herAnkle, hisEnd = null, herEnd = null) {
  const axis = (points, pivot, end) => {
    if (end) { const length = Math.hypot(...end.map((value, c) => value - pivot[c])); return { direction: end.map((value, c) => (value - pivot[c]) / length), length }; }
    let far = null, best = -1;
    for (let k = 0; k < points.length; k += 3) { const d = Math.hypot(points[k] - pivot[0], points[k + 1] - pivot[1], points[k + 2] - pivot[2]); if (d > best) { best = d; far = [points[k], points[k + 1], points[k + 2]]; } }
    return { direction: far.map((value, c) => (value - pivot[c]) / best), length: best };
  };
  const a = axis(hisFoot, hisAnkle, hisEnd), b = axis(herFoot, herAnkle, herEnd);
  /* the rotation taking a onto b about their common perpendicular (Rodrigues) */
  const cross = [a.direction[1] * b.direction[2] - a.direction[2] * b.direction[1], a.direction[2] * b.direction[0] - a.direction[0] * b.direction[2], a.direction[0] * b.direction[1] - a.direction[1] * b.direction[0]];
  const sine = Math.hypot(...cross), cosine = a.direction.reduce((sum, value, c) => sum + value * b.direction[c], 0), k = cross.map(value => value / (sine || 1));
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const R = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + sine * K[i][j] + (1 - cosine) * [0, 1, 2].reduce((sum, m) => sum + K[i][m] * K[m][j], 0)));
  const scale = b.length / a.length, M = R.map(row => row.map(value => value * scale));
  const t = [0, 1, 2].map(c => herAnkle[c] - M[c].reduce((sum, value, i) => sum + value * hisAnkle[i], 0));
  const start = Float64Array.from([M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2], t[0], t[1], t[2]]);
  const { map, meanDistance } = icpSimilarity(spread(hisFoot, 0.8), spread(herFoot, 0.5), start);
  return { map, meanDistance, degrees: Math.atan2(sine, cosine) * 180 / Math.PI };
}
function heightOf(mesh) { let top = -Infinity; for (let k = 1; k < mesh.positions.length; k += 3) top = Math.max(top, mesh.positions[k]); return top; }
