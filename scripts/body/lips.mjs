// Lips for a body whose own are not fit to show. BodyParts3D's "Lip" is a scrap of a scan: a slab a centimetre and a
// half tall with a slit in it and loose fragments around, over a skin that is blank where the mouth is. MakeHuman's
// lips are modelled ones. Its mesh is laid onto the body's skin (transfer.mjs), so the skin around its mouth marks
// where the mouth is on this face; its lips, set there, are the mould the body's own skin is shaped to. The skin
// stays one surface, with no piece laid on it, and the lips are the part of it that was shaped most.
import { layMakeHumanOnto, closeLips, surfaceSamples } from './transfer.mjs';
import { PointGrid, solve } from './fit.mjs';
import { normals, refine } from './mesh.mjs';

const EDGE = 0.25, FULL = 0.7;   // the shares of the mouth's weights at which the mould ends, and from which it is all MakeHuman's shape
const LIP = 0.8;                 // and from which the skin counts as lip
const FINER = 2;                 // times the skin's triangles around the mouth are split in four
const smooth = (low, high, value) => { const t = Math.min(1, Math.max(0, (value - low) / (high - low))); return t * t * (3 - 2 * t); };

/**
 * structures: the body, [{ name, layer, positions, indices }], its skin among them; folder: the MakeHuman files;
 * targets: the morph targets nearest the body.
 * Returns { skin, lip }: the skin with lips, and the lips cut from it; each { positions, indices, normals }, the
 * normals those of the one surface, so no edge shows between them. Away from the mouth the skin is as it was, vertex
 * for vertex.
 */
export function skinWithLips(structures, folder, targets, log = console.log) {
  const { like, posed, lining, onSkin, skin: plain } = layMakeHumanOnto(structures, folder, targets, log);
  const mould = { positions: posed.positions.slice(), indices: like.indices };
  log(`lips closed: ${closeLips(mould, like.weights, lining)}`);
  /* how far each vertex belongs to the mouth: its share of the weights of the muscles around it */
  const mouth = new Float32Array(like.count), total = new Float32Array(like.count);
  for (const [bone, list] of Object.entries(like.weights)) for (const [vertex, weight] of list) { total[vertex] += weight; if (/^oris/.test(bone)) mouth[vertex] += weight; }
  const share = Float32Array.from({ length: like.count }, (_, v) => (total[v] && !lining[v] ? mouth[v] / total[v] : 0));
  /* where the skin around the mouth went when it was drawn onto this face: the lips go with it as one piece, and
     toward the edge of the mould each point goes where it was itself drawn to */
  const carried = [0, 0, 0];
  let rim = 0;
  for (let v = 0; v < like.count; v++) {
    if (!(share[v] > EDGE && share[v] < (EDGE + FULL) / 2)) continue;
    for (let c = 0; c < 3; c++) carried[c] += onSkin.positions[3 * v + c] - posed.positions[3 * v + c];
    rim++;
  }
  if (rim < 20) throw new Error('too little skin around the mouth to place the lips by');
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < like.count; v++) {
    if (share[v] <= EDGE) continue;
    const whole = smooth(EDGE, FULL, share[v]);
    for (let c = 0; c < 3; c++) {
      mould.positions[3 * v + c] += whole * carried[c] / rim + (1 - whole) * (onSkin.positions[3 * v + c] - posed.positions[3 * v + c]);
      low[c] = Math.min(low[c], mould.positions[3 * v + c]); high[c] = Math.max(high[c], mould.positions[3 * v + c]);
    }
  }
  const triangles = [];
  for (let t = 0; t < like.indices.length; t += 3) if ([0, 1, 2].every(corner => share[like.indices[t + corner]] > EDGE)) triangles.push(like.indices[t], like.indices[t + 1], like.indices[t + 2]);
  /* the mould seen from the front, closely sampled: at each spot, how far forward it stands and how much it counts */
  const samples = surfaceSamples({ positions: mould.positions, indices: Uint32Array.from(triangles) }, 0.03);
  const flat = Float32Array.from(samples.points, (value, k) => (k % 3 === 2 ? 0 : value)), grid = new PointGrid(flat, 0.1);
  const along = (index, values) => [0, 1, 2].reduce((sum, corner) => sum + samples.weights[3 * index + corner] * values[samples.corners[3 * index + corner]], 0);
  /* the skin is made finer around the mouth, to take the shape: its outer wall there, not the wall inside the face */
  const around = (x, y, z) => x > low[0] - 0.5 && x < high[0] + 0.5 && y > low[1] - 0.5 && y < high[1] + 0.5 && z > low[2] - 1.5;
  const outward = normals(plain);
  const skin = refine(plain, (a, b, c, points) => [a, b, c].every(v => around(points[3 * v], points[3 * v + 1], points[3 * v + 2]) && (v >= outward.length / 3 || outward[3 * v + 2] > 0.3)), FINER);
  const facing = normals(skin), count = skin.positions.length / 3, lip = new Float32Array(count);
  const neighbours = Array.from({ length: count }, () => []);
  for (let t = 0; t < skin.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[skin.indices[t + a]].push(skin.indices[t + b]); neighbours[skin.indices[t + b]].push(skin.indices[t + a]); }
  /* the skin within the mouth's reach on the outer wall of the face (facing forward, down or aside, not into the face) */
  const reached = [];
  for (let v = 0; v < count; v++) if (facing[3 * v + 2] > -0.2 && around(skin.positions[3 * v], skin.positions[3 * v + 1], skin.positions[3 * v + 2])) reached.push(v);
  /* Under the scan's scrap of a lip his skin is a few crude steps across the mouth, which the scrap hid. There it is
     first laid on one smooth surface, fitted to his skin in a band round the edge of the mouth's reach (front to back,
     over the face seen from the front): fully over the mouth, less and less toward that band and where the skin turns
     aside. The lips are then shaped on it. */
  {
    const inset = v => Math.min(skin.positions[3 * v] - (low[0] - 0.5), high[0] + 0.5 - skin.positions[3 * v], skin.positions[3 * v + 1] - (low[1] - 0.5), high[1] + 0.5 - skin.positions[3 * v + 1]);
    const front = reached.filter(v => facing[3 * v + 2] > 0.5), band = front.filter(v => inset(v) < 0.6);
    /* the surface: height as a cubic in the two directions across the face, fitted by least squares, about the middle
       of the mouth's reach (so the powers stay small) */
    const middle = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2];
    const terms = (x, y) => { const u = x - middle[0], w = y - middle[1]; return [1, u, w, u * u, u * w, w * w, u * u * u, u * u * w, u * w * w, w * w * w]; };
    if (band.length < 40) throw new Error(`only ${band.length} points of skin round the mouth to lay its surface on`);
    const A = new Float64Array(100), b = new Float64Array(10);
    for (const v of band) {
      const row = terms(skin.positions[3 * v], skin.positions[3 * v + 1]);
      for (let i = 0; i < 10; i++) { b[i] += row[i] * skin.positions[3 * v + 2]; for (let j = 0; j < 10; j++) A[i * 10 + j] += row[i] * row[j]; }
    }
    const coefficients = solve(A, b, 10);
    const surface = (x, y) => terms(x, y).reduce((sum, value, i) => sum + value * coefficients[i], 0);
    /* how far each point moves onto it, smoothed over the skin round about (the move, not the skin: the skin's triangles
       are fine round the mouth and coarse beside it, and smoothing the skin itself creased it where they meet), so
       that skin which turns aside goes along with its neighbours and no fold opens between them */
    let move = new Float32Array(count);
    for (const v of front) move[v] = smooth(0.6, 1.6, inset(v)) * smooth(0.5, 0.85, facing[3 * v + 2]) * (surface(skin.positions[3 * v], skin.positions[3 * v + 1]) - skin.positions[3 * v + 2]);
    for (let pass = 0; pass < 12; pass++) {
      const next = move.slice();
      for (const v of reached) { let sum = move[v]; for (const w of neighbours[v]) sum += move[w]; next[v] = sum / (neighbours[v].length + 1); }
      move = next;
    }
    for (const v of reached) skin.positions[3 * v + 2] += move[v];
  }
  /* What the skin takes from the mould is the lips' own relief: how far each spot of the mould stands out from the
     mould's face just round the lips, there where the mouth's weights fade (a plane fitted to the gap between the
     mould and this face there). Taken whole, the mould's cheeks were drawn into his, and stood off them as a ledge. */
  const under = new Int32Array(count).fill(-1);
  for (let v = 0; v < count; v++) {
    const [x, y, z] = skin.positions.subarray(3 * v, 3 * v + 3);
    if (!around(x, y, z) || facing[3 * v + 2] < 0.3) continue;   // the outer wall of the face, not the wall inside it
    const [index] = grid.nearest(x, y, 0, 0.08);
    if (index >= 0) under[v] = index;
  }
  const gap = v => samples.points[3 * under[v] + 2] - skin.positions[3 * v + 2];
  const plane = (() => {
    const M = Array.from({ length: 3 }, () => [0, 0, 0]), b = [0, 0, 0];
    let used = 0;
    for (let v = 0; v < count; v++) {
      if (under[v] < 0) continue;
      const weight = along(under[v], share);
      if (weight < EDGE || weight > (EDGE + FULL) / 2) continue;
      const row = [1, skin.positions[3 * v], skin.positions[3 * v + 1]];
      for (let i = 0; i < 3; i++) { b[i] += row[i] * gap(v); for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j]; }
      used++;
    }
    if (used < 20) throw new Error(`only ${used} points of the skin round the lips to measure the mould against`);
    /* solve the 3 x 3 normal equations (Cramer) */
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const whole = det(M), solution = [0, 1, 2].map(k => det(M.map((row, i) => row.map((value, j) => (j === k ? b[i] : value)))) / whole);
    return (x, y) => solution[0] + solution[1] * x + solution[2] * y;
  })();
  const by = new Float32Array(count), fixed = new Uint8Array(count);
  let shaped = 0;
  for (let v = 0; v < count; v++) {
    if (under[v] < 0) continue;
    lip[v] = along(under[v], share);
    by[v] = smooth(EDGE, FULL, lip[v]) * (gap(v) - plane(skin.positions[3 * v], skin.positions[3 * v + 1]));
    fixed[v] = 1; shaped++;
  }
  if (shaped < 100) throw new Error(`only ${shaped} points of the skin lie under the lips`);
  /* The skin within the mouth's reach that the mould does not lie over (under the nose, round the corners of the mouth,
     where it faces down or aside) follows what moved beside it, so no crease opens between the two; the inner wall of
     the face does not move. */
  {
    const free = reached.filter(v => !fixed[v]);
    for (let pass = 0; pass < 40; pass++) {
      const next = by.slice();
      for (const v of free) { let sum = 0; for (const w of neighbours[v]) sum += by[w]; next[v] = neighbours[v].length ? 0.95 * sum / neighbours[v].length : 0; }
      by.set(next);
    }
  }
  let most = 0;
  for (let v = 0; v < count; v++) { skin.positions[3 * v + 2] += by[v]; most = Math.max(most, Math.abs(by[v])); }
  const normal = normals(skin);
  const cut = belongs => {
    const of = new Map(), positions = [], own = [], indices = [];
    for (let t = 0; t < skin.indices.length; t += 3) {
      const corners = [skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]];
      if (corners.every(v => lip[v] > LIP) !== belongs) continue;
      for (const v of corners) {
        if (!of.has(v)) { of.set(v, of.size); positions.push(skin.positions[3 * v], skin.positions[3 * v + 1], skin.positions[3 * v + 2]); own.push(normal[3 * v], normal[3 * v + 1], normal[3 * v + 2]); }
        indices.push(of.get(v));
      }
    }
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: Float32Array.from(own) };
  };
  const parts = { skin: cut(false), lip: cut(true) };
  if (parts.lip.indices.length < 3 * 50) throw new Error('the lips came out as next to nothing');
  log(`lips: ${shaped} points of the skin shaped to MakeHuman's lips, by up to ${most.toFixed(2)} cm; the lips are ${parts.lip.indices.length / 3} of its ${skin.indices.length / 3} triangles`);
  return parts;
}
