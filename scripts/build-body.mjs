// Embeds into site/index.html (the bodyData block) a whole-body outline, so the pelvis can be seen in the body around it:
// a slim young adult woman built from the MakeHuman base mesh and morph targets (CC0).
// Usage: node scripts/build-body.mjs <folder with base.obj and the .target files below>
//   from https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data (3dobjs/base.obj, targets/macrodetails/)
//
// Shape: MakeHuman's default even mix of its three young-female targets, plus half of its minimum-weight target.
// Fit: MakeHuman is decimetres, +Y up, +Z front. Scaled 1.08 (about 172 cm tall) and placed so her crotch meets the
// model's vulva, the NIH pelvis stays inside her (bone shows through by at most ~1 cm over the sacrum, where it lies
// just under the skin). The model draws its own vulva, mons and perineum, so the skin there is cut away.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';

const TARGETS = {
  'caucasian-female-young': 1 / 3, 'african-female-young': 1 / 3, 'asian-female-young': 1 / 3,
  'universal-female-young-averagemuscle-minweight': 0.5,
};
const SCALE = 1.08, FRONT = -6, DOWN = -8, CROTCH = 8;   // cm; the crotch is ~8 cm below MakeHuman's origin
const PATCH = { rx: 8.6, ry: 9.2, cy: 1, top: 7 };       // the model's own skin patch (SKIN_GRID), and how high it reaches
const inPatch = ([x, y, z]) => (x / PATCH.rx) ** 2 + ((y - PATCH.cy) / PATCH.ry) ** 2 < 0.92 && -z < PATCH.top;
const toModel = ([x, y, z]) => [x * 10 * SCALE, z * 10 * SCALE + FRONT, (-y * 10 - CROTCH) * SCALE + CROTCH + DOWN];

const folder = process.argv[2];
const vertices = [], triangles = [];
let group = '';
for (const line of readFileSync(`${folder}/base.obj`, 'utf8').split('\n')) {
  if (line.startsWith('v ')) vertices.push(line.split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith('g ')) group = line.slice(2).trim();
  else if (line.startsWith('f ') && group === 'body') {   // the skin only, not the helper and joint geometry
    const corners = line.trim().split(/\s+/).slice(1).map(corner => parseInt(corner) - 1);
    for (let k = 1; k + 1 < corners.length; k++) triangles.push([corners[0], corners[k], corners[k + 1]]);
  }
}
for (const [name, weight] of Object.entries(TARGETS)) {
  for (const line of readFileSync(`${folder}/${name}.target`, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [index, x, y, z] = line.trim().split(/\s+/).map(Number);
    vertices[index][0] += weight * x; vertices[index][1] += weight * y; vertices[index][2] += weight * z;
  }
}
const positions = vertices.map(toModel);
/* a plain mannequin head: the mouth cavity and deep eye sockets catch the see-through edge shading and read as a dark mask,
   so the head above the jaw is replaced by a smooth egg of the same size, which the neck runs up into */
const HEAD_CUT = 23.5;   // cm below the crown: the whole head down to the bottom of the chin
const top = Math.min(...triangles.flat().map(i => positions[i][2]));   // z is minus height
const isHead = i => positions[i][2] < top + HEAD_CUT;
const headPoints = triangles.flat().filter(isHead).map(i => positions[i]);
const lowest = [0, 1, 2].map(axis => Math.min(...headPoints.map(p => p[axis]))), highest = [0, 1, 2].map(axis => Math.max(...headPoints.map(p => p[axis])));
const headCentre = [(lowest[0] + highest[0]) / 2, (lowest[1] + highest[1]) / 2 - 0.6, top + 12];   // a little back: the nose stretches the box forward
const headRadii = [0.9 * (highest[0] - lowest[0]) / 2, 0.85 * (highest[1] - lowest[1]) / 2, 12];
const body = triangles.filter(corners => !corners.every(isHead));
{
  const RINGS = 24, SEGMENTS = 40, first = positions.length;
  for (let r = 0; r <= RINGS; r++) for (let s = 0; s < SEGMENTS; s++) {
    const polar = r / RINGS * Math.PI, around = s / SEGMENTS * 2 * Math.PI;
    positions.push([headCentre[0] + headRadii[0] * Math.sin(polar) * Math.cos(around), headCentre[1] + headRadii[1] * Math.sin(polar) * Math.sin(around), headCentre[2] - headRadii[2] * Math.cos(polar)]);
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEGMENTS; s++) {
    const a = first + r * SEGMENTS + s, b = first + r * SEGMENTS + (s + 1) % SEGMENTS, c = a + SEGMENTS, d = b + SEGMENTS;
    body.push([a, b, c], [b, d, c]);
  }
}
const kept = body.filter(corners => !inPatch([0, 1, 2].map(axis => corners.reduce((sum, i) => sum + positions[i][axis], 0) / 3)));

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const document = new Document(), buffer = document.createBuffer();
const primitive = document.createPrimitive()
  .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(positions.flat())).setBuffer(buffer))
  .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept.flat())).setBuffer(buffer));
document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));
await document.transform(
  prune(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.6, error: 0.002 }),
  quantize({ quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const glb = await io.writeBinary(document);
const page = new URL('../site/index.html', import.meta.url), html = readFileSync(page, 'utf8');
const block = /(<script type="application\/octet-stream" id="bodyData">)[\s\S]*?(<\/script>)/;
if (!block.test(html)) throw new Error('site/index.html has no bodyData block');
writeFileSync(page, html.replace(block, `$1\n${Buffer.from(glb).toString('base64')}\n$2`));
console.log(`body: ${primitive.getIndices().getCount() / 3} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB glb`);
