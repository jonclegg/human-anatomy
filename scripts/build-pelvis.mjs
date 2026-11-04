// Embeds into site/index.html (the pelvisData block) a pelvis built from the Human Reference Atlas female bony pelvis (CC BY 4.0, Visible Human Female):
// keeps the outer (compact) bone, bakes in the alignment to the model's own frame, then simplifies and compresses it.
// Usage: node scripts/build-pelvis.mjs <HRA_bony_pelvis_female_VHF.glb>
//
// Alignment: see hra-frame.mjs.
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, prune, join, flatten, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
import { toModel, turn, scale } from './hra-frame.mjs';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(process.argv[2]);
const root = document.getRoot();

/* drop the inner spongy bone (it only shows as z-fighting) and the materials; the page supplies its own */
for (const node of root.listNodes()) if (/spongy/.test(node.getName())) { node.getMesh()?.dispose(); node.dispose(); }
for (const material of root.listMaterials()) material.dispose();
await document.transform(flatten(), prune());
for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
  for (const semantic of primitive.listSemantics()) if (semantic !== 'POSITION') primitive.setAttribute(semantic, null);   // normals are recomputed on load
  const position = primitive.getAttribute('POSITION'), point = [0, 0, 0];
  for (let k = 0; k < position.getCount(); k++) position.setElement(k, toModel(position.getElement(k, point)));
}
for (const node of root.listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
await document.transform(
  join(), dedup(), weld({ tolerance: 0.0005 }),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.002 }),
  prune(), quantize({ quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const glb = await io.writeBinary(document);
const triangles = root.listMeshes().flatMap(mesh => mesh.listPrimitives()).reduce((n, primitive) => n + primitive.getIndices().getCount() / 3, 0);
const page = new URL('../site/index.html', import.meta.url), html = readFileSync(page, 'utf8');
const block = /(<script type="application\/octet-stream" id="pelvisData">)[\s\S]*?(<\/script>)/;
if (!block.test(html)) throw new Error('site/index.html has no pelvisData block');
writeFileSync(page, html.replace(block, `$1\n${Buffer.from(glb).toString('base64')}\n$2`));
console.log(`pelvis: ${triangles} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB glb, turned ${(turn * 180 / Math.PI).toFixed(1)}°, scaled ${scale.toFixed(3)}`);
