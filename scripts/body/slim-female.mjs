// Reshapes the fitted female body (build/female-fitted/, from build-female.mjs) to a slim young woman (slim.mjs) and
// writes the site's data, data/female/.
// Usage: node scripts/body/slim-female.mjs <MakeHuman folder>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readLayerFile } from './built.mjs';
import { slimFemale } from './slim.mjs';
import { writeLayer, bounds, volume } from './mesh.mjs';
import { round, tidyName, sidesTurned } from './assemble.mjs';
import { LAYERS } from './systems.mjs';

const makehuman = process.argv[2];
if (!makehuman) throw new Error('usage: node scripts/body/slim-female.mjs <MakeHuman folder>');
const fitted = new URL('../../build/female-fitted/', import.meta.url), out = new URL('../../site/body/data/female/', import.meta.url);
const parts = JSON.parse(readFileSync(new URL('parts.json', fitted), 'utf8'));
const structures = [];
for (const layer of LAYERS) for (const piece of await readLayerFile(new URL(`${layer}.glb`, fitted).pathname)) {
  const part = parts.parts[piece.part];
  structures.push({ ...piece, name: part.name, layer, group: part.group });
}
slimFemale(structures, makehuman);
mkdirSync(out, { recursive: true });
for (const layer of LAYERS) {
  const pieces = structures.filter(structure => structure.layer === layer);
  const { glb, triangles } = await writeLayer(pieces);
  writeFileSync(new URL(`${layer}.glb`, out), glb);
  parts.files[layer] = { triangles, bytes: glb.byteLength };
  for (const piece of pieces) {
    const { min, max } = bounds(piece.positions);
    Object.assign(parts.parts[piece.part], { centre: min.map((value, axis) => round((value + max[axis]) / 2)), min: min.map(round), max: max.map(round), volume: round(volume(piece)) });
  }
}
const skin = parts.parts.find(part => part.layer === 'skin' && part.name === 'Skin');
skin.source = 'MakeHuman';
parts.height = round(Math.max(...structures.filter(structure => structure.layer === 'skin').map(structure => bounds(structure.positions).max[1])));
/* the reshaping moves structures that lie close to the midline: each left or right name is checked again against where
   the structure now lies */
for (const part of parts.parts) part.name = tidyName(part.name, { ...part, height: parts.height });
if (sidesTurned.length) console.log(`female: ${sidesTurned.length} names turned to the side the structure is on after reshaping: ${sidesTurned.join('; ')}`);
writeFileSync(new URL('parts.json', out), JSON.stringify(parts));
console.log(`female: reshaped and written, ${parts.height} cm tall`);
