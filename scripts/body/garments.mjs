// Clothing: MakeHuman's own garments (CC0), worn by a body whose skin is the MakeHuman mesh, and the writer of a
// body's clothing file. A MakeHuman garment (a .mhclo beside its .obj) says where each of its vertices sits on the base
// mesh: three base vertices, their weights, and an offset. Read against the body's rest shape that gives the garment as
// MakeHuman would dress that shape; each garment vertex is then tied to the nearest point of the rest skin (its place
// in a triangle, and its height off the skin) and follows that point onto the finished skin, whatever pose and shape
// that has since taken.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
import { PointGrid } from './fit.mjs';
import { vertexNormals } from './clearance.mjs';

/**
 * folder: holds <name>/<name>.mhclo and its .obj; all: every vertex of the MakeHuman base mesh in the body's rest shape
 * (model frame, cm; readMakeHuman's `all`)
 * Returns the garment's separate pieces, largest first: [{ positions, indices }], vertices at one place merged.
 */
export function readGarment(folder, name, all) {
  const at = v => [all[3 * v], all[3 * v + 1], all[3 * v + 2]];
  const lines = readFileSync(`${folder}/${name}/${name}.mhclo`, 'utf8').split('\n').map(line => line.trim());
  /* the offsets are in the garment's own units: each axis has two base vertices and the distance between them in those units */
  const scale = ['x', 'y', 'z'].map((axis, c) => {
    const [, a, b, size] = lines.find(line => line.startsWith(`${axis}_scale`)).split(/\s+/);
    return Math.abs(at(Number(a))[c] - at(Number(b))[c]) / Number(size);
  });
  const placed = [];
  for (const line of lines.slice(lines.findIndex(line => line.startsWith('verts')) + 1)) {
    if (!line || line.startsWith('#')) continue;
    const n = line.split(/\s+/).map(Number);
    if (n.some(Number.isNaN)) break;   // the next section
    if (n.length === 1) { placed.push(at(n[0])); continue; }
    if (n.length !== 9) throw new Error(`${name}: cannot read the vertex line "${line}"`);
    const [a, b, c] = [at(n[0]), at(n[1]), at(n[2])];
    placed.push([0, 1, 2].map(k => n[3] * a[k] + n[4] * b[k] + n[5] * c[k] + n[6 + k] * scale[k]));
  }
  const faces = [], source = [];
  for (const line of readFileSync(`${folder}/${name}/${name}.obj`, 'utf8').split('\n')) {
    if (line.startsWith('v ')) source.push(line.split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith('f ')) { const corners = line.trim().split(/\s+/).slice(1).map(corner => parseInt(corner) - 1); for (let k = 1; k + 1 < corners.length; k++) faces.push(corners[0], corners[k], corners[k + 1]); }
  }
  if (source.length !== placed.length) throw new Error(`${name}: ${source.length} vertices in the mesh, ${placed.length} placed`);
  /* the mesh repeats a vertex wherever its texture has a seam: merged, so the cloth shades as one surface */
  const merged = new Map(), remap = source.map(vertex => { const key = vertex.join(','); if (!merged.has(key)) merged.set(key, merged.size); return merged.get(key); });
  const positions = new Float32Array(merged.size * 3);
  remap.forEach((to, from) => positions.set(placed[from], 3 * to));
  /* its pieces: vertices joined by faces */
  const parent = Array.from({ length: merged.size }, (_, k) => k), find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const indices = faces.map(corner => remap[corner]);
  for (let t = 0; t < indices.length; t += 3) { parent[find(indices[t + 1])] = find(indices[t]); parent[find(indices[t + 2])] = find(indices[t]); }
  const pieces = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const root = find(indices[t]);
    let piece = pieces.get(root); if (!piece) pieces.set(root, piece = { map: new Map(), positions: [], indices: [] });
    for (let c = 0; c < 3; c++) {
      const v = indices[t + c];
      if (!piece.map.has(v)) { piece.map.set(v, piece.positions.length / 3); piece.positions.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); }
      piece.indices.push(piece.map.get(v));
    }
  }
  return [...pieces.values()].map(piece => ({ positions: Float32Array.from(piece.positions), indices: Uint32Array.from(piece.indices) })).sort((a, b) => b.positions.length - a.positions.length);
}

/**
 * Puts a garment made for the rest skin onto the finished skin.
 * rest, worn: the same mesh ({ positions, indices }) at rest and as finished; skip(a, b, c): triangles that are no part
 * of the outer skin; least: the least height off the skin, cm; drape: how many times the cloth is drawn level
 * Returns the garment's positions on the finished skin.
 */
export function wear(garment, rest, worn, { skip = () => false, least = 0.4, drape = 12 } = {}) {
  const points = [], corners = [], weights = [], SPACING = 0.25;
  const p = rest.positions, t = rest.indices;
  for (let k = 0; k < t.length; k += 3) {
    if (skip(t[k], t[k + 1], t[k + 2])) continue;
    const [a, b, c] = [0, 1, 2].map(n => [p[3 * t[k + n]], p[3 * t[k + n] + 1], p[3 * t[k + n] + 2]]);
    const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])) / SPACING));
    for (let i = 0; i <= steps; i++) for (let j = 0; i + j <= steps; j++) {
      const s = i / steps, r = j / steps;
      points.push(...[0, 1, 2].map(n => a[n] + s * (b[n] - a[n]) + r * (c[n] - a[n])));
      corners.push(t[k], t[k + 1], t[k + 2]); weights.push(1 - s - r, s, r);
    }
  }
  const grid = new PointGrid(Float32Array.from(points), 1), restNormal = vertexNormals(rest), wornNormal = vertexNormals(worn);
  const tied = new Set();
  const count = garment.positions.length / 3, base = new Float32Array(count * 3), normals = new Float32Array(count * 3), height = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const k = 3 * v, [index] = grid.nearest(garment.positions[k], garment.positions[k + 1], garment.positions[k + 2], 15);
    if (index < 0) throw new Error('a garment vertex lies more than 15 cm from the skin');
    const from = [0, 0, 0], to = [0, 0, 0], normal = [0, 0, 0], out0 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const u = corners[3 * index + c], w = weights[3 * index + c];
      tied.add(u);
      for (let n = 0; n < 3; n++) { from[n] += w * p[3 * u + n]; out0[n] += w * restNormal[3 * u + n]; to[n] += w * worn.positions[3 * u + n]; normal[n] += w * wornNormal[3 * u + n]; }
    }
    const length = Math.hypot(...normal) || 1, restLength = Math.hypot(...out0) || 1;
    height[v] = Math.max(least, [0, 1, 2].reduce((sum, n) => sum + (garment.positions[k + n] - from[n]) * out0[n] / restLength, 0));
    for (let n = 0; n < 3; n++) { base[k + n] = to[n]; normals[k + n] = normal[n] / length; }
  }
  /* cloth hangs across a hollow, it does not line it: each vertex rises toward the level of its neighbours, and never
     sinks, so the cloth spans the dip between the breasts and the cleft between the buttocks */
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let k = 0; k < garment.indices.length; k += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[garment.indices[k + a]].add(garment.indices[k + b]); neighbours[garment.indices[k + b]].add(garment.indices[k + a]); }
  const out = new Float32Array(count * 3);
  const place = () => { for (let k = 0; k < out.length; k++) out[k] = base[k] + height[k / 3 | 0] * normals[k]; };
  place();
  /* a garment's mesh is coarser than the skin: a point of the skin between its vertices (a nipple) may stand above
     it. The garment rises to clear each such point of the skin it lies on (the skin its vertices are tied to, and
     two rings of neighbours; not a hand that hangs beside it). */
  {
    const around = Array.from({ length: worn.positions.length / 3 }, () => []);
    for (let k = 0; k < t.length; k += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { around[t[k + a]].push(t[k + b]); around[t[k + b]].push(t[k + a]); }
    let under = new Set(tied);
    for (let ring = 0; ring < 2; ring++) { const wider = new Set(under); for (const u of under) for (const w of around[u]) wider.add(w); under = wider; }
    /* the garment triangle over each such point (the one whose middle is nearest, facing the same way) rises at all
       three corners; a point that would lift it more than 0.8 cm is some other part of the body beside it */
    const g = garment.indices, middles = new Float32Array(g.length), CLEAR = 0.35, rise = new Float32Array(count);
    for (let k = 0; k < g.length; k += 3) for (let n = 0; n < 3; n++) middles[k + n] = (out[3 * g[k] + n] + out[3 * g[k + 1] + n] + out[3 * g[k + 2] + n]) / 3;
    const cloth = new PointGrid(middles, 1);
    for (const u of under) {
      const [triangle] = cloth.nearest(worn.positions[3 * u], worn.positions[3 * u + 1], worn.positions[3 * u + 2], 2);
      if (triangle < 0) continue;
      const corner = [g[3 * triangle], g[3 * triangle + 1], g[3 * triangle + 2]];
      const facing = [0, 1, 2].map(n => (normals[3 * corner[0] + n] + normals[3 * corner[1] + n] + normals[3 * corner[2] + n]) / 3);
      if (facing[0] * wornNormal[3 * u] + facing[1] * wornNormal[3 * u + 1] + facing[2] * wornNormal[3 * u + 2] < 0.5) continue;
      const over = [0, 1, 2].reduce((sum, n) => sum + (worn.positions[3 * u + n] - middles[3 * triangle + n]) * facing[n], 0) + CLEAR;
      if (over > 0 && over < 0.8) for (const v of corner) rise[v] = Math.max(rise[v], over);
    }
    for (let v = 0; v < count; v++) height[v] += rise[v];
    place();
  }
  for (let pass = 0; pass < drape; pass++) {
    for (let v = 0; v < count; v++) {
      const mean = [0, 0, 0];
      for (const w of neighbours[v]) for (let n = 0; n < 3; n++) mean[n] += out[3 * w + n] / neighbours[v].size;
      const level = [0, 1, 2].reduce((sum, n) => sum + (mean[n] - base[3 * v + n]) * normals[3 * v + n], 0);
      if (level > height[v]) height[v] = level;
    }
    place();
  }
  return out;
}

/* a body's clothing file: one primitive with positions, normals and colours. garments: [{ name, positions, colours
   (linear, as glTF stores them), indices }]. Returns a line for the log. */
export async function writeClothing(garments, file) {
  const all = { positions: [], colours: [], indices: [] };
  for (const garment of garments) {
    const base = all.positions.length / 3;
    all.positions.push(...garment.positions); all.colours.push(...garment.colours); all.indices.push(...Array.from(garment.indices, index => index + base));
  }
  const positions = Float32Array.from(all.positions), indices = Uint32Array.from(all.indices), normal = vertexNormals({ positions, indices });
  const document = new Document(), buffer = document.createBuffer();
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', positions)).setAttribute('NORMAL', accessor('VEC3', normal))
    .setAttribute('COLOR_0', accessor('VEC3', Float32Array.from(all.colours))).setIndices(accessor('SCALAR', indices));
  document.createScene().addChild(document.createNode('clothing').setMesh(document.createMesh('clothing').addPrimitive(primitive)));
  await MeshoptEncoder.ready;
  await document.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, pattern: /^(POSITION|NORMAL|COLOR_0)$/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(document);
  writeFileSync(file, glb);
  return `${garments.map(garment => garment.name).join(', ')}; ${indices.length / 3} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB`;
}
