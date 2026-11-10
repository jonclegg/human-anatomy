// Mesh helpers for the body build: weld, simplify, measure, and write one layer as a compressed GLB.
// A layer GLB holds a single merged mesh; its _PART vertex attribute says which structure each vertex belongs to,
// so the page draws a whole layer in a few calls and still colours, fades, isolates and picks structure by structure.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;

/* merge vertices closer than a tolerance (cm), so the simplifier sees one connected surface */
export function weld({ positions, indices }, tolerance = 0.002) {
  const map = new Map(), remap = new Uint32Array(positions.length / 3), welded = [];
  for (let k = 0; k < remap.length; k++) {
    const key = `${Math.round(positions[3 * k] / tolerance)},${Math.round(positions[3 * k + 1] / tolerance)},${Math.round(positions[3 * k + 2] / tolerance)}`;
    let index = map.get(key);
    if (index === undefined) { index = welded.length / 3; map.set(key, index); welded.push(positions[3 * k], positions[3 * k + 1], positions[3 * k + 2]); }
    remap[k] = index;
  }
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { positions: new Float32Array(welded), indices: new Uint32Array(kept) };
}

/* simplify to a surface error in cm, never below a share of the triangles, then drop the vertices no triangle uses */
export function simplify(mesh, error, minimumShare = 0.04) {
  const target = Math.min(mesh.indices.length, Math.max(3 * 12, Math.floor(mesh.indices.length * minimumShare / 3) * 3));
  const [indices] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, error, ['ErrorAbsolute']);
  return compact({ positions: mesh.positions, indices });
}

export function compact({ positions, indices }) {
  const remap = new Int32Array(positions.length / 3).fill(-1), kept = [];
  const out = new Uint32Array(indices.length);
  for (let t = 0; t < indices.length; t++) {
    const v = indices[t];
    if (remap[v] < 0) { remap[v] = kept.length / 3; kept.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); }
    out[t] = remap[v];
  }
  return { positions: new Float32Array(kept), indices: out };
}

/* area-weighted vertex normals */
export function normals({ positions, indices }) {
  const out = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map(v => 3 * v);
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { out[v] += nx; out[v + 1] += ny; out[v + 2] += nz; }
  }
  for (let v = 0; v < out.length; v += 3) {
    const length = Math.hypot(out[v], out[v + 1], out[v + 2]) || 1;
    out[v] /= length; out[v + 1] /= length; out[v + 2] /= length;
  }
  return out;
}

export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < positions.length; k += 3) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], positions[k + axis]); max[axis] = Math.max(max[axis], positions[k + axis]);
  }
  return { min, max };
}

/* signed volume of a closed mesh (cm³); open meshes give a rough figure */
export function volume({ positions, indices }) {
  let sum = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map(v => 3 * v);
    sum += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return Math.abs(sum / 6);
}

/* one layer, as a GLB: a single primitive with POSITION, NORMAL and _PART (the structure's index in the sex's part list) */
export async function writeLayer(pieces) {
  const vertexCount = pieces.reduce((sum, piece) => sum + piece.positions.length / 3, 0);
  const indexCount = pieces.reduce((sum, piece) => sum + piece.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3), part = new Uint16Array(vertexCount), indices = new Uint32Array(indexCount);
  let vertex = 0, index = 0;
  for (const piece of pieces) {   // a piece may bring its own normals
    positions.set(piece.positions, vertex * 3); normal.set(piece.normals || normals(piece), vertex * 3); part.fill(piece.part, vertex, vertex + piece.positions.length / 3);
    for (let k = 0; k < piece.indices.length; k++) indices[index + k] = piece.indices[k] + vertex;
    vertex += piece.positions.length / 3; index += piece.indices.length;
  }
  const document = new Document(), buffer = document.createBuffer();
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', positions)).setAttribute('NORMAL', accessor('VEC3', normal)).setAttribute('_PART', accessor('SCALAR', part))
    .setIndices(accessor('SCALAR', indices));
  document.createScene().addChild(document.createNode('layer').setMesh(document.createMesh('layer').addPrimitive(primitive)));
  await document.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, pattern: /^(POSITION|NORMAL)$/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return { glb: await io.writeBinary(document), triangles: indexCount / 3 };
}
