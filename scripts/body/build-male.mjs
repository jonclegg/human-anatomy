// Builds the male body: every BodyParts3D structure, plus the lungs, which BodyParts3D lacks, from the NIH Visible Human
// Male (Human Reference Atlas). His lungs come from a different man, so they are carried into the BodyParts3D body by
// the same fit the female body uses (register.mjs), pinned to the matching bones, organs, spine and skin of both men.
// Usage: node scripts/body/build-male.mjs <"Human Anatomy 3D Models" folder>
import { listStructures, readMesh } from './bodyparts3d.mjs';
import { classify } from './systems.mjs';
import { weld, simplify } from './mesh.mjs';
import { readOrgan, FRAMES } from './hra.mjs';
import { register, warpMesh, meanGap, startMap } from './register.mjs';
import { Assembly, ERROR, MINIMUM_SHARE } from './assemble.mjs';

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/body/build-male.mjs <"Human Anatomy 3D Models" folder>');
const hra = (folder, file) => `${root}/${folder}/Human Reference Atlas (GLB)/${file}`;
const HEIGHT = 171.9;

const assembly = new Assembly('male', HEIGHT);
const his = listStructures(root).map(structure => ({ ...structure, ...classify(structure) }));
for (const structure of his) {
  structure.mesh = simplify(weld(readMesh(structure.path)), ERROR[structure.layer], MINIMUM_SHARE[structure.layer]);
  assembly.add({ name: structure.name, layer: structure.layer, group: structure.group, source: 'BodyParts3D', id: structure.id, concept: structure.concept }, structure.mesh, { prepared: true });
}
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

const lungs = (await nihMale([['Respiratory', 'HRA_lung_male_vh.glb']])).filter(mesh => /bronchopulmonary_segment|segmen/.test(mesh.raw));
for (const mesh of lungs) {
  assembly.add({ name: lungSegmentName(mesh.raw), layer: 'organs', group: 'respiratory', source: 'NIH male' }, warpMesh(mesh, warp));
}
console.log(`  check left femur: ${meanGap(warpMesh(vh(/M_femur_L$/)[0], warp), him(/^Left femur$/)[0]).toFixed(2)} cm from the BodyParts3D femur after the warp; ${lungs.length} lung segments carried across`);
await assembly.write(new URL('../../site/body/data/male/', import.meta.url));

/* "VH_M_lingula_superior_bronchopulmonary_segment" -> "Superior lingular segment of left lung" */
export function lungSegmentName(raw) {
  const words = raw.replace(/^VH_[MF]_/, '').replace(/segm\w*$/, '').replace(/bronchopulmonary_?/, '').split('_').filter(Boolean);
  const lung = words[0] === 'left' || words[0] === 'lingula' ? 'left' : 'right';
  const rest = words[0] === 'lingula' ? [...words.slice(1), 'lingular'] : words.slice(1);
  const name = `${rest.join(' ')} segment of ${lung} lung`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
