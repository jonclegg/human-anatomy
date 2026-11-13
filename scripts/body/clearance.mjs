// Keeps a fitted or registered structure from passing through one that was scanned in place.
// The push is a smooth function of position (how close a point comes to the obstacle), so neighbouring pieces of an
// organ (a lung's segments) move together and their shared edges stay shared.
import { PointGrid } from './fit.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const smoothstep = (edge0, edge1, x) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/**
 * mesh: { positions, indices }, moved in place
 * obstacle: flat points of the structures to keep clear of
 * away(x, y, z): unit direction to push a point near the obstacle
 * reach: cm, points closer than this to the obstacle are pushed; depth: cm, the push at contact
 * Returns how many points moved.
 */
export function clear(mesh, obstacle, away, { reach = 1.4, depth = 1.2 } = {}) {
  let moved = 0;
  for (let k = 0; k < mesh.positions.length; k += 3) {
    const x = mesh.positions[k], y = mesh.positions[k + 1], z = mesh.positions[k + 2];
    const [index, distance] = obstacle.nearest(x, y, z, reach);
    if (index < 0) continue;
    const push = depth * smoothstep(reach, 0.15, distance), [u, v, w] = away(x, y, z);
    mesh.positions[k] = x + u * push; mesh.positions[k + 1] = y + v * push; mesh.positions[k + 2] = z + w * push;
    moved++;
  }
  return moved;
}

export const obstacleOf = meshes => new PointGrid(Float32Array.from(meshes.flatMap(mesh => [...mesh.positions])), 1.5);
export const centreOf = meshes => { const sum = [0, 0, 0]; let n = 0; for (const mesh of meshes) for (let k = 0; k < mesh.positions.length; k++) { sum[k % 3] += mesh.positions[k]; if (k % 3 === 0) n++; } return sum.map(value => value / n); };
/* the unit direction from a centre to a point, or from a point to a centre */
export const fromCentre = centre => (x, y, z) => { const d = [x - centre[0], y - centre[1], z - centre[2]], length = Math.hypot(...d) || 1; return d.map(value => value / length); };
export const towardCentre = centre => (x, y, z) => fromCentre(centre)(x, y, z).map(value => -value);

/* For a fitted structure near a scanned organ: a point inside the organ, or closer than a gap outside it, moves out to
   that gap beyond the organ's nearest surface point. Which side of the surface a point is on is judged against the
   organ's middle, which suits rounded organs like the lungs, heart and liver. Returns how many points moved. */
export function pushOutOf(mesh, obstacle, centre, { gap = 0.3, reach = 6 } = {}) {
  let moved = 0;
  for (let k = 0; k < mesh.positions.length; k += 3) {
    const x = mesh.positions[k], y = mesh.positions[k + 1], z = mesh.positions[k + 2];
    const [index] = obstacle.nearest(x, y, z, reach);
    if (index < 0) continue;
    const p = [0, 1, 2].map(c => obstacle.points[3 * index + c]);
    const outward = p.map((value, c) => value - centre[c]), length = Math.hypot(...outward) || 1, n = outward.map(value => value / length);
    const beyond = (x - p[0]) * n[0] + (y - p[1]) * n[1] + (z - p[2]) * n[2];   // how far outside the surface, along its outward direction
    if (beyond >= gap) continue;
    const push = gap - beyond;
    mesh.positions[k] = x + n[0] * push; mesh.positions[k + 1] = y + n[1] * push; mesh.positions[k + 2] = z + n[2] * push;
    moved++;
  }
  return moved;
}

/* Inside or outside a closed skin: for each column of a grid across x and y, where the skin crosses it along z; a point is
   inside when it lies between the first and last crossing. MakeHuman's skin is open at the eyes and mouth, so a column
   there may have an odd count; there, and beside such columns, the test does not answer (null). */
export class InsideTest {
  constructor({ positions, indices }, cell = 0.4) {
    this.cell = cell; this.columns = new Map();
    for (let t = 0; t < indices.length; t += 3) {
      const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
      const ax = positions[a], ay = positions[a + 1], bx = positions[b], by = positions[b + 1], cx = positions[c], cy = positions[c + 1];
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      for (let i = Math.ceil(Math.min(ax, bx, cx) / cell - 0.5); (i + 0.5) * cell <= Math.max(ax, bx, cx); i++) {
        for (let j = Math.ceil(Math.min(ay, by, cy) / cell - 0.5); (j + 0.5) * cell <= Math.max(ay, by, cy); j++) {
          const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
          const u = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area, v = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area, w = 1 - u - v;
          if (u < 0 || v < 0 || w < 0) continue;
          const z = u * positions[a + 2] + v * positions[b + 2] + w * positions[c + 2];
          const key = `${i},${j}`;
          let list = this.columns.get(key); if (!list) this.columns.set(key, list = []);
          list.push(z);
        }
      }
    }
    for (const list of this.columns.values()) list.sort((p, q) => p - q);
  }
  /* true inside, false outside, null where the column (or one beside it) is not closed */
  inside(x, y, z) {
    const i = Math.floor(x / this.cell), j = Math.floor(y / this.cell);
    const list = this.columns.get(`${i},${j}`);
    if (!list) return false;
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if ((this.columns.get(`${i + di},${j + dj}`)?.length ?? 0) % 2) return null;
    /* between the column's first and last crossing: right for a skin of one surface and for one modelled as two close
       surfaces (BodyParts3D's), where counting crossings would not be */
    return list.length >= 2 && z > list[0] && z < list[list.length - 1];
  }
  /* whether a point lies between its column's first and last crossing, whether or not the column is closed: this
     turns only on the skin at those two crossings, not on any opening along the way */
  between(x, y, z) {
    const list = this.columns.get(`${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`);
    return list !== undefined && list.length >= 2 && z > list[0] && z < list[list.length - 1];
  }
}

/* The same test along all three axes. One axis alone calls the air between two parts that line up along it inside
   (the gap between two toes, seen from the side), so on a closed skin a point is outside when any axis says so
   (agree = 1). On a skin with openings (an eye, an ear canal, a gap at the hairline) one axis also calls the inside of
   the head outside, along a column that leaves through the opening: there two axes must agree (agree = 2), and one
   alone gives null, as does any axis that cannot say. */
export class InsideAllWays {
  constructor({ positions, indices }, cell = 0.4, agree = 1) {
    this.agree = agree;
    const turned = shift => { const out = new Float32Array(positions.length); for (let k = 0; k < positions.length; k += 3) for (let c = 0; c < 3; c++) out[k + c] = positions[k + (c + shift) % 3]; return out; };
    this.tests = [0, 1, 2].map(shift => new InsideTest({ positions: turned(shift), indices }, cell));
  }
  inside(x, y, z) {
    const p = [x, y, z];
    let out = 0, unsure = 0;
    for (let shift = 0; shift < 3; shift++) {
      const answer = this.tests[shift].inside(p[shift % 3], p[(1 + shift) % 3], p[(2 + shift) % 3]);
      if (answer === false) out++;
      else if (answer === null) unsure++;
    }
    return out >= this.agree ? false : out || unsure ? null : true;
  }
  /* whether a point lies between the skin's first and last crossing along all three axes */
  between(x, y, z) {
    const p = [x, y, z];
    return this.tests.every((test, shift) => test.between(p[shift % 3], p[(1 + shift) % 3], p[(2 + shift) % 3]));
  }
}

/**
 * Raises the skin where inner points lie outside it or within gap under it. Each such point pushes only its nearest skin
 * vertex, out along that vertex's normal; the push spreads along the skin surface (not through the air, so the side of
 * the chest cannot lift the inside of the arm beside it) with a smooth falloff; and the pushes are smoothed over
 * neighbouring vertices (smoothing passes) before they are applied, so the skin rises as a swell rather than crumpling
 * in a hollow.
 * skin: { positions, indices }, moved in place; inner: flat points (cm); spread: cm along the surface over which a
 * push fades out; fixed: per vertex, true for vertices that stay put. Returns the largest push, cm.
 */
export function pushOutOver(skin, inner, { gap = 0.35, spread = 2, rounds = 2, fixed = null, smoothing = 3 } = {}) {
  const count = skin.positions.length / 3;
  /* the skin's edges: each vertex's neighbours */
  const neighbours = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < skin.indices.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { neighbours[skin.indices[t + a]].add(skin.indices[t + b]); neighbours[skin.indices[t + b]].add(skin.indices[t + a]); }
  const list = neighbours.map(set => [...set]);
  let largest = 0;
  for (let round = 0; round < rounds; round++) {
    const normal = vertexNormals(skin), test = new InsideTest(skin), surface = new PointGrid(skin.positions, 1);
    const need = new Float32Array(count);
    for (let k = 0; k < inner.length; k += 3) {
      const q = [inner[k], inner[k + 1], inner[k + 2]];
      const [v, distance] = surface.nearest(q[0], q[1], q[2], 4);
      if (v < 0) continue;
      if (test.inside(q[0], q[1], q[2]) !== false && distance >= gap) continue;
      const n = [normal[3 * v], normal[3 * v + 1], normal[3 * v + 2]];
      const along = (q[0] - skin.positions[3 * v]) * n[0] + (q[1] - skin.positions[3 * v + 1]) * n[1] + (q[2] - skin.positions[3 * v + 2]) * n[2];
      need[v] = Math.max(need[v], along + gap);
    }
    /* spread along the surface: from each pushed vertex outward over its edges, up to spread cm */
    const push = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      if (need[v] <= 0) continue;
      const reached = new Map([[v, 0]]), queue = [v];
      while (queue.length) {
        const u = queue.shift(), d = reached.get(u);
        const t = d / spread;
        push[u] = Math.max(push[u], need[v] * (1 - t * t) ** 2);
        for (const w of list[u]) {
          const e = Math.hypot(skin.positions[3 * w] - skin.positions[3 * u], skin.positions[3 * w + 1] - skin.positions[3 * u + 1], skin.positions[3 * w + 2] - skin.positions[3 * u + 2]);
          if (d + e < spread && (!reached.has(w) || reached.get(w) > d + e)) { reached.set(w, d + e); queue.push(w); }
        }
      }
    }
    /* each vertex's move, smoothed over its neighbours three times */
    let move = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) if (push[v] > 0 && !fixed?.[v]) for (let c = 0; c < 3; c++) move[3 * v + c] = normal[3 * v + c] * push[v];
    for (let pass = 0; pass < smoothing; pass++) {
      const next = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        if (fixed?.[v]) continue;
        const around = list[v];
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (const w of around) sum += move[3 * w + c];
          next[3 * v + c] = around.length ? 0.5 * move[3 * v + c] + 0.5 * sum / around.length : move[3 * v + c];
        }
      }
      move = next;
    }
    let moved = 0;
    for (let v = 0; v < count; v++) {
      const length = Math.hypot(move[3 * v], move[3 * v + 1], move[3 * v + 2]);
      if (length < 1e-4) continue;
      for (let c = 0; c < 3; c++) skin.positions[3 * v + c] += move[3 * v + c];
      largest = Math.max(largest, length); moved++;
    }
    if (!moved) break;
  }
  return largest;
}

export function vertexNormals({ positions, indices }) {
  const normal = new Float32Array(positions.length);
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]];
    const pa = [positions[3 * a], positions[3 * a + 1], positions[3 * a + 2]];
    const n = cross(sub([positions[3 * b], positions[3 * b + 1], positions[3 * b + 2]], pa), sub([positions[3 * c], positions[3 * c + 1], positions[3 * c + 2]], pa));
    for (const v of [a, b, c]) for (let i = 0; i < 3; i++) normal[3 * v + i] += n[i];
  }
  for (let v = 0; v < positions.length; v += 3) { const length = Math.hypot(normal[v], normal[v + 1], normal[v + 2]) || 1; normal[v] /= length; normal[v + 1] /= length; normal[v + 2] /= length; }
  return normal;
}
