// Builds the female body.
// No free model of a whole female body exists whose skin, bones, muscles and organs belong together, so hers is the
// male body (data/male/, built first by build-male.mjs: one man, whose parts all fit each other) carried onto a slim
// young woman's skin: the MakeHuman base mesh (CC0) with its young-female and low-weight shapes. The MakeHuman mesh is
// laid onto his skin vertex by vertex, the same mesh in its female shape is her skin, and one smooth deformation takes
// each spot on his skin to the same spot on hers; everything inside follows (transfer.mjs). The pose does not change
// and nothing is cut, so what fitted in him fits in her.
// What is hers alone is scanned: her uterus, vagina, ovaries, tubes and their ligaments, and her breasts, from the NIH
// Visible Human Female (Human Reference Atlas, CC BY 4.0), fitted into her pelvis and under her skin. His own
// reproductive organs are left out.
// She is dressed in MakeHuman's own clothing (CC0): a sports top and shorts, from `MakeHuman clothes (CC0)/clothes`
// in the models folder (the makehuman_system_assets_cc0 pack of files.makehumancommunity.org).
// Usage: node scripts/body/build-female.mjs <"Human Anatomy 3D Models" folder> <female-reproductive-3d-models folder>
import { readParts, readLayer } from './built.mjs';
import { transfer, keepUnder } from './transfer.mjs';
import { readOrgan, FRAMES } from './hra.mjs';
import { register, warpMesh, startMap } from './register.mjs';
import { pushOutOf, obstacleOf, centreOf } from './clearance.mjs';
import { Assembly } from './assemble.mjs';
import { readGarment, wear, writeClothing } from './garments.mjs';
import { bounds, soften } from './mesh.mjs';
import { LAYERS } from './systems.mjs';
import { readDetail, detailParts, meetOpening, joinToBladder, vulvaSkin } from './pelvic-detail.mjs';
import { breastSurface, breastFat } from './breast-surface.mjs';

const [root, reproductive] = process.argv.slice(2);
if (!root || !reproductive) throw new Error('usage: node scripts/body/build-female.mjs <"Human Anatomy 3D Models" folder> <female-reproductive-3d-models folder>');
const HEIGHT = 163;   // cm
/* the MakeHuman shape nearest the man, and hers: its young Caucasian female shape plus half its lowest-weight one */
const HIS_SHAPE = { 'caucasian-male-young': 1 };
const HER_SHAPE = { 'caucasian-female-young': 1, 'universal-female-young-averagemuscle-minweight': 0.5 };

/* ---------- His body, without what is his alone ---------- */
/* his outer ear is a part of its own; her skin has ears */
const HIS_ALONE = /penis|penile|testi|scrot|prostat|seminal|vesicular|deferent|epididym|cremaster|^urethra$|^External ear$/i;
const male = readParts('male');
const structures = [];
let left = 0;
for (const layer of LAYERS) for (const piece of await readLayer('male', layer)) {
  const part = male.parts[piece.part];
  if (HIS_ALONE.test(part.name) || (layer === 'organs' && part.group === 'reproductive') || (layer === 'skin' && part.name !== 'Skin')) { left++; continue; }
  structures.push({ positions: piece.positions, indices: piece.indices, name: part.name, layer, part });
}
console.log(`female: ${structures.length} of his structures carried across, ${left} left out`);
const { lining, breast, rest } = transfer(structures, `${root}/MakeHuman (CC0)`, HIS_SHAPE, HER_SHAPE, { height: HEIGHT });
const skin = structures.find(structure => structure.layer === 'skin');
const hers = name => { const found = structures.filter(structure => structure.name === name); if (!found.length) throw new Error(`she has no ${name}`); return found; };

/* ---------- Her scanned pelvic organs ---------- */
const read = async path => (await readOrgan(path, FRAMES.female)).map(mesh => ({ ...mesh, file: path.split('/').pop() }));
const pelvis = await read(`${reproductive}/HRA_bony_pelvis_female_VHF.glb`);
const bladder = await read(`${root}/Urinary/Human Reference Atlas (GLB)/HRA_urinary_bladder_female_vh.glb`);
const rectum = (await read(`${reproductive}/HRA_female_pelvic_soft_tissue_set_VHF.glb`)).filter(mesh => /F_rectum$/.test(mesh.raw));
const scanned = [];
for (const file of ['uterus', 'vagina', 'cervix', 'fallopian_tube_left', 'fallopian_tube_right', 'ovary_left', 'ovary_right', 'uterine_ovarian_ligaments_broad_round']) scanned.push(...await read(`${reproductive}/HRA_${file}_female_VHF.glb`));
/* the same organ appears in more than one file (the cervix in three): keep the first */
{
  const seen = new Set();
  for (let k = 0; k < scanned.length; k++) { const key = `${scanned[k].raw}|${scanned[k].positions.length}`; if (seen.has(key)) scanned.splice(k--, 1); else seen.add(key); }
}
/* the scan's pelvis onto hers, bone by bone, and its bladder and rectum onto hers, so that what lay between them in
   the scan (the uterus and vagina) lies between hers */
console.log('fitting the scanned pelvis to hers:');
const bone = pattern => pelvis.filter(mesh => pattern.test(mesh.raw));
const pairs = [
  { name: 'left hip bone', source: bone(/(pubis|ilium|ischium)_compact_bone_L/), target: hers('Left hip bone') },
  { name: 'right hip bone', source: bone(/(pubis|ilium|ischium)_compact_bone_R/), target: hers('Right hip bone') },
  { name: 'sacrum', source: bone(/F_sacrum/), target: hers('Sacrum') },
  { name: 'bladder', source: bladder, target: hers('Urinary bladder') },
  { name: 'rectum', source: rectum, target: hers('Rectum') },
];
for (const pair of pairs) if (!pair.source.length) throw new Error(`nothing scanned to match for the ${pair.name}`);
const hips = meshes => centreOf(meshes);
const toHer = register({ pairs, start: startMap(1, 1, hips(bone(/(pubis|ilium|ischium)_compact/)), hips([...hers('Left hip bone'), ...hers('Right hip bone')])) });
const added = scanned.map(mesh => ({ ...warpMesh(mesh, toHer), name: mesh.name, layer: 'organs', group: 'reproductive' }));
/* the close-up pelvic model, placed by the same map; her scanned vagina, cervix and uterus then meet its opening */
const detail = readDetail(toHer);
{
  const correct = meetOpening(added, detail, [...hers('Left hip bone'), ...hers('Right hip bone'), ...hers('Sacrum')]);
  for (const mesh of added) mesh.positions = warpMesh(mesh, correct).positions;
}
/* her bladder, rectum and bowel are his, and he had no uterus: where they would pass through hers, they give way,
   and so do the muscles of his pelvic floor, which had no opening for a vagina */
const PELVIC_FLOOR = /levator ani|pubococcygeus|puborectalis|iliococcygeus|anal sphincter/i;
{
  const uterus = added.filter(mesh => /uterus|cervi|vagina|ovary/i.test(mesh.name)), grid = obstacleOf(uterus), centre = centreOf(uterus);
  const { min, max } = bounds(Float32Array.from(uterus.flatMap(mesh => [...mesh.positions])));
  let cleared = 0;
  for (const structure of structures) {
    if (structure.layer !== 'organs' && structure.layer !== 'vessels' && !PELVIC_FLOOR.test(structure.name)) continue;
    const box = bounds(structure.positions);
    if ([0, 1, 2].some(c => box.min[c] > max[c] + 1 || box.max[c] < min[c] - 1)) continue;
    cleared += pushOutOf(structure, grid, centre, { gap: 0.25 });
  }
  console.log(`  his bladder, rectum and bowel kept clear of her uterus: ${cleared} points moved`);
  /* the bladder is a couple of hundred triangles: the points pushed clear of the uterus stand out of it as corners, so it is rounded off again */
  { const bladder = hers('Urinary bladder')[0], floor = bounds(bladder.positions).min[1]; soften(bladder, 8, (x, y) => y < floor + 1.5); }   // its neck, where the urethra leaves it, stays where it is
}

/* ---------- Her scanned breasts ---------- */
/* what of a breast is too small for the scan to have caught, and is modelled on her own skin instead (breast-surface.mjs) */
const MODELLED_ON_SKIN = /nipple$|areola$|areolar tubercles$|lactiferous sinuses$|^fat of (left|right) breast$/i, onSkin = [];
/* The scan's breasts are a heavier, older woman's. Each is fitted into the breast of her skin: its nipple under the tip,
   its back on her chest wall, its top, bottom and sides inside the breast's own, each side of the nipple scaled on its
   own (the scan's nipple sits low on the breast). */
for (const [side, word, sign] of [['left', 'Left', 1], ['right', 'Right', -1]]) {
  const gland = await read(`${root}/Skin/Human Reference Atlas (GLB)/HRA_${side}_mammary_gland_female_vh.glb`);
  const nipple = centreOf(gland.filter(mesh => /nipple/.test(mesh.raw))), from = bounds(Float32Array.from(gland.flatMap(mesh => [...mesh.positions])));
  /* her breast: the skin MakeHuman gives to it on this side; its tip is its most forward point */
  const low = [Infinity, Infinity], high = [-Infinity, -Infinity];
  let tip = null;
  const ofBreast = [];
  for (let v = 0; v < breast.length; v++) {
    const p = skin.positions.subarray(3 * v, 3 * v + 3);
    if (breast[v] < 0.3 || p[0] * sign < 0) continue;
    ofBreast.push(v);
    for (let c = 0; c < 2; c++) { low[c] = Math.min(low[c], p[c]); high[c] = Math.max(high[c], p[c]); }
    if (!tip || p[2] > tip[2]) tip = Array.from(p);
  }
  /* her chest wall behind the tip: the front of the muscle and rib there */
  let wall = -Infinity;
  for (const structure of structures) {
    if (structure.layer !== 'muscles' && structure.layer !== 'skeleton') continue;
    const p = structure.positions;
    for (let k = 0; k < p.length; k += 3) if (Math.hypot(p[k] - tip[0], p[k + 1] - tip[1]) < 1.5 && p[k + 2] < tip[2]) wall = Math.max(wall, p[k + 2]);
  }
  const front = tip[2] - 0.3, depth = front - (wall + 0.15);
  const INSET = 0.8;   // of the way from the tip to the breast's edge
  const scale = [0, 1].map(c => [INSET * (tip[c] - low[c]) / (nipple[c] - from.min[c]), INSET * (high[c] - tip[c]) / (from.max[c] - nipple[c])]);
  const place = p => [tip[0] + (p[0] - nipple[0]) * scale[0][p[0] < nipple[0] ? 0 : 1], tip[1] + (p[1] - nipple[1]) * scale[1][p[1] < nipple[1] ? 0 : 1], front + (p[2] - nipple[2]) * depth / (nipple[2] - from.min[2])];
  for (const mesh of gland) if (!MODELLED_ON_SKIN.test(mesh.name)) added.push({ ...warpMesh(mesh, (x, y, z) => place([x, y, z])), name: mesh.name, layer: 'organs', group: 'breast' });
  const base = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, wall + 0.15];
  /* the mound of fat runs as far from the tip as the scanned gland is placed, and no further up or down than a little more than it is wide: the skin's own breast area runs on up toward the collarbone */
  const sideways = [INSET * (tip[0] - low[0]), INSET * (high[0] - tip[0])], most = 1.2 * Math.max(...sideways);
  const made = [...breastSurface(word, skin.positions, ofBreast, tip, base), breastFat(side, skin.positions, tip, wall, [...sideways, Math.min(most, INSET * (tip[1] - low[1])), Math.min(most, INSET * (high[1] - tip[1]))])];
  if (gland.filter(mesh => MODELLED_ON_SKIN.test(mesh.name)).length !== made.length) throw new Error(`${side} breast: the scan's parts ${gland.filter(mesh => MODELLED_ON_SKIN.test(mesh.name)).map(mesh => mesh.name).join(', ')} are not the five that are modelled`);
  for (const part of made) onSkin.push({ ...part, layer: 'organs', group: 'breast' });
  console.log(`  ${side} breast: ${(high[0] - low[0]).toFixed(1)} cm wide, ${(high[1] - low[1]).toFixed(1)} cm high, ${depth.toFixed(1)} cm from chest wall to nipple (the scan's: ${(from.max[0] - from.min[0]).toFixed(1)}, ${(from.max[1] - from.min[1]).toFixed(1)}, ${(nipple[2] - from.min[2]).toFixed(1)})`);
}
console.log(`  her scanned parts kept under the skin: ${keepUnder(skin, added, { lining })}`);

/* ---------- Her vulva, clitoris and urethra, modelled ---------- */
const vulva = vulvaSkin(skin, detail, detail.outward);
const modelled = [...detailParts(detail), ...vulva.parts];
console.log(`  urethra drawn ${joinToBladder(modelled.find(part => part.name === 'Urethra'), hers('Urinary bladder')[0]).toFixed(1)} cm up to her bladder`);

/* ---------- Assembly ---------- */
const assembly = new Assembly('female', HEIGHT);
for (const structure of structures) {
  const { part } = structure, isSkin = structure.layer === 'skin';
  assembly.add({ name: structure.name, layer: structure.layer, group: part.group, source: isSkin ? 'MakeHuman' : part.source, fitted: !isSkin, id: part.id, concept: part.concept }, isSkin ? vulva.skin : structure, { prepared: true });
}
/* her scanned vagina is not drawn: the scan took in the tissue round it, and gives a slab 6 cm wide where the vagina
   is a flattened tube about half that. The modelled one is drawn in its place; the scanned one has still set where
   the cervix and uterus sit, and what the organs round it keep clear of. */
for (const mesh of added) if (mesh.name !== 'Vagina') assembly.add({ name: mesh.name, layer: mesh.layer, group: mesh.group, source: 'NIH female' }, mesh);
/* the modelled skin comes with its own shading, which simplifying would lose */
for (const part of modelled) assembly.add({ name: part.name, layer: part.layer, group: part.group, source: 'Wooten Labs' }, part, { prepared: part.layer === 'skin' });
/* built to their final shape, a few hundred triangles each: simplifying would only spoil them */
for (const part of onSkin) assembly.add({ name: part.name, layer: part.layer, group: part.group, source: 'Wooten Labs' }, part, { prepared: true });
console.log(`female: ${structures.length} structures from the male body, ${added.length} scanned, ${modelled.length + onSkin.length} modelled`);
await assembly.write(new URL('../../site/body/data/female/', import.meta.url));

/* ---------- Her clothing ---------- */
{
  const clothes = `${root}/MakeHuman clothes (CC0)/clothes`;
  const restSkin = { positions: rest.positions, indices: rest.indices }, isLining = (a, b, c) => lining[a] || lining[b] || lining[c];
  /* linear colours (as glTF stores them): a slate-blue top (#3c4c64 on screen) and charcoal shorts (#40444f) */
  const garments = [];
  for (const [label, name, pick, colour] of [['Top', 'female_sportsuit01', piece => piece.high > 0.6, [0.045, 0.072, 0.127]], ['Shorts', 'female_casualsuit02', piece => piece.high < 0.62, [0.051, 0.058, 0.078]]]) {
    /* a suit is a top and a bottom: its pieces are told apart by how high they reach, as a share of her rest height */
    const height = rest.positions.reduce((top, value, k) => (k % 3 === 1 ? Math.max(top, value) : top), 0);
    const pieces = readGarment(clothes, name, rest.all).filter(piece => pick({ high: piece.positions.reduce((top, value, k) => (k % 3 === 1 ? Math.max(top, value) : top), 0) / height }));
    if (!pieces.length) throw new Error(`no ${label.toLowerCase()} in ${name}`);
    pieces.forEach((piece, k) => {
      const positions = wear(piece, restSkin, skin, { skip: isLining });
      garments.push({ name: k ? `${label} (part ${k + 1})` : label, positions, colours: Array.from({ length: positions.length / 3 }, () => colour).flat(), indices: piece.indices });
    });
  }
  console.log(`female clothing: ${await writeClothing(garments, new URL('../../site/body/data/female/clothing.glb', import.meta.url))}`);
}
