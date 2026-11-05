// Reads a built body back (site/body/data/<sex>/): parts.json and each layer's GLB, split into its structures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

export const builtFolder = sex => new URL(`../../site/body/data/${sex}/`, import.meta.url);
export const readParts = sex => JSON.parse(readFileSync(new URL('parts.json', builtFolder(sex)), 'utf8'));

/* a layer's structures: [{ part (index into parts.json), positions (model frame, cm), indices }] */
export const readLayer = (sex, layer) => readLayerFile(new URL(`${layer}.glb`, builtFolder(sex)).pathname);
export async function readLayerFile(path) {
  await MeshoptDecoder.ready;
  const document = await io.read(path);
  const node = document.getRoot().listNodes().find(item => item.getMesh());
  const primitive = node.getMesh().listPrimitives()[0], matrix = node.getWorldMatrix();
  const position = primitive.getAttribute('POSITION'), part = primitive.getAttribute('_PART'), index = primitive.getIndices();
  const count = position.getCount(), p = [0, 0, 0], q = [0];
  const world = new Float32Array(count * 3), owner = new Uint16Array(count);
  for (let k = 0; k < count; k++) {
    position.getElement(k, p);
    for (let c = 0; c < 3; c++) world[3 * k + c] = matrix[c] * p[0] + matrix[4 + c] * p[1] + matrix[8 + c] * p[2] + matrix[12 + c];
    part.getElement(k, q); owner[k] = q[0];
  }
  /* split by part: vertices of one part are contiguous (writeLayer appends piece by piece, and reorder keeps a
     triangle's vertices together), so gather each part's triangles and renumber */
  const byPart = new Map();
  const indices = index.getArray();
  for (let t = 0; t < indices.length; t += 3) {
    const id = owner[indices[t]];
    let entry = byPart.get(id); if (!entry) byPart.set(id, entry = { part: id, map: new Map(), positions: [], indices: [] });
    for (let c = 0; c < 3; c++) {
      const v = indices[t + c];
      let local = entry.map.get(v);
      if (local === undefined) { local = entry.positions.length / 3; entry.map.set(v, local); entry.positions.push(world[3 * v], world[3 * v + 1], world[3 * v + 2]); }
      entry.indices.push(local);
    }
  }
  return [...byPart.values()].map(entry => ({ part: entry.part, positions: Float32Array.from(entry.positions), indices: Uint32Array.from(entry.indices) }));
}
