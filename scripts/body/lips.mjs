// Lips for a body whose own are not fit to show. BodyParts3D's "Lip" is a scrap of a scan: a slab a centimetre and a
// half tall with a slit in it and loose fragments around, over a skin that is blank where the mouth is. MakeHuman's
// lips are modelled ones. Its mesh is laid onto the body's skin (transfer.mjs), so the skin around its mouth marks
// where the mouth is on this face; its lips, set there, are the mould the body's own skin is shaped to. The skin
// stays one surface, with no piece laid on it, and the lips are the part of it that was shaped most.
import { layMakeHumanOnto, closeLips, surfaceSamples } from './transfer.mjs';
import { PointGrid } from './fit.mjs';
import { normals } from './mesh.mjs';

const EDGE = 0.25, FULL = 0.7;   // the shares of the mouth's weights at which the mould ends, and from which it is all MakeHuman's shape
const LIP = 0.8;                 // and from which the skin counts as lip
const FINER = 2;                 // times the skin's triangles around the mouth are split in four
const smooth = (low, high, value) => { const t = Math.min(1, Math.max(0, (value - low) / (high - low))); return t * t * (3 - 2 * t); };

/* Each triangle for which inside(a, b, c) holds, split in four at the middles of its sides, `times` over. A triangle
   beside one, sharing a split side, is split along with it (in two, three or four), so the surface stays one, with no
   point of one triangle lying on the side of another. Every vertex there was stays where it is. */
function refine({ positions, indices }, inside, times) {
  const points = Array.from(positions);
  let all = Array.from(indices);
  for (let round = 0; round < times; round++) {
    const middles = new Map(), next = [], key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const middle = (a, b) => {
      if (!middles.has(key(a, b))) { middles.set(key(a, b), points.length / 3); for (let c = 0; c < 3; c++) points.push((points[3 * a + c] + points[3 * b + c]) / 2); }
      return middles.get(key(a, b));
    };
    const whole = [];
    for (let t = 0; t < all.length; t += 3) {
      const [a, b, c] = [all[t], all[t + 1], all[t + 2]];
      if (!inside(a, b, c, points)) { whole.push(t); continue; }
      const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    for (const t of whole) {
      /* turned so that its split sides come first */
      let corners = [all[t], all[t + 1], all[t + 2]];
      const split = () => [0, 1, 2].map(side => middles.get(key(corners[side], corners[(side + 1) % 3])));
      const count = split().filter(value => value !== undefined).length;
      if (count === 0) { next.push(...corners); continue; }
      while (split()[0] === undefined || (count === 2 && split()[2] !== undefined)) corners = [corners[1], corners[2], corners[0]];
      const [a, b, c] = corners, [ab, bc, ca] = split();
      if (count === 1) next.push(a, ab, c, ab, b, c);
      else if (count === 2) next.push(a, ab, c, ab, bc, c, ab, b, bc);
      else next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    all = next;
  }
  return { positions: Float32Array.from(points), indices: Uint32Array.from(all) };
}

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
  let shaped = 0, most = 0;
  for (let v = 0; v < count; v++) {
    const [x, y, z] = skin.positions.subarray(3 * v, 3 * v + 3);
    if (!around(x, y, z) || facing[3 * v + 2] < 0.3) continue;   // the outer wall of the face, not the wall inside it
    const [index] = grid.nearest(x, y, 0, 0.08);
    if (index < 0) continue;
    const by = smooth(EDGE, FULL, along(index, share)) * (samples.points[3 * index + 2] - z);
    skin.positions[3 * v + 2] += by;
    lip[v] = along(index, share);
    shaped++; most = Math.max(most, Math.abs(by));
  }
  if (shaped < 100) throw new Error(`only ${shaped} points of the skin lie under the lips`);
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
