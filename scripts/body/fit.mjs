// Fitting one body to another: affine ICP between matching structures, then a thin-plate spline through the matched points.
// The spline (3D biharmonic kernel, |r|) maps every point of the source body smoothly so the matched points land on their
// targets; between them it bends no more than it must.

/* a grid of cells for nearest-point lookups among many points */
export class PointGrid {
  constructor(points, cell = 1) {
    this.points = points; this.cell = cell; this.cells = new Map();
    for (let k = 0; k < points.length; k += 3) {
      const key = this.key(points[k], points[k + 1], points[k + 2]);
      let list = this.cells.get(key); if (!list) this.cells.set(key, list = []);
      list.push(k / 3);
    }
  }
  key(x, y, z) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`; }
  /* nearest point within maxDistance: [index, distance], or [-1, Infinity] */
  nearest(x, y, z, maxDistance = Infinity) {
    const reach = Math.min(Math.ceil(maxDistance / this.cell), 40);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bestDistance = Infinity;
    for (let ring = 0; ring <= reach; ring++) {
      if (best >= 0 && (ring - 1) * this.cell > bestDistance) break;
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (let k = -ring; k <= ring; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== ring) continue;
        const list = this.cells.get(`${cx + i},${cy + j},${cz + k}`);
        if (!list) continue;
        for (const index of list) {
          const d = (this.points[3 * index] - x) ** 2 + (this.points[3 * index + 1] - y) ** 2 + (this.points[3 * index + 2] - z) ** 2;
          if (d < bestDistance) { bestDistance = d; best = index; }
        }
      }
    }
    bestDistance = Math.sqrt(bestDistance);
    return bestDistance <= maxDistance ? [best, bestDistance] : [-1, Infinity];
  }  /* every point within distance: their indices */
  within(x, y, z, distance) {
    const reach = Math.ceil(distance / this.cell), out = [], limit = distance * distance;
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (let k = -reach; k <= reach; k++) {
      const list = this.cells.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const index of list) if ((this.points[3 * index] - x) ** 2 + (this.points[3 * index + 1] - y) ** 2 + (this.points[3 * index + 2] - z) ** 2 <= limit) out.push(index);
    }
    return out;
  }
}

/* solve A x = b in place (Gaussian elimination with partial pivoting); A is n x n row-major Float64Array */
export function solve(A, b, n, columns = 1) {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(A[row * n + col]) > Math.abs(A[pivot * n + col])) pivot = row;
    if (Math.abs(A[pivot * n + col]) < 1e-12) throw new Error(`singular system at column ${col}`);
    if (pivot !== col) {
      for (let k = 0; k < n; k++) { const t = A[col * n + k]; A[col * n + k] = A[pivot * n + k]; A[pivot * n + k] = t; }
      for (let c = 0; c < columns; c++) { const t = b[col * columns + c]; b[col * columns + c] = b[pivot * columns + c]; b[pivot * columns + c] = t; }
    }
    const diagonal = A[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row * n + col] / diagonal;
      if (factor === 0) continue;
      const rowStart = row * n, colStart = col * n;
      for (let k = col; k < n; k++) A[rowStart + k] -= factor * A[colStart + k];
      for (let c = 0; c < columns; c++) b[row * columns + c] -= factor * b[col * columns + c];
    }
  }
  for (let row = n - 1; row >= 0; row--) for (let c = 0; c < columns; c++) {
    let sum = b[row * columns + c];
    for (let k = row + 1; k < n; k++) sum -= A[row * n + k] * b[k * columns + c];
    b[row * columns + c] = sum / A[row * n + row];
  }
  return b;
}

/* least-squares affine map (3x4) taking source points to target points */
export function fitAffine(source, target) {
  const count = source.length / 3, M = new Float64Array(16), B = new Float64Array(12);
  for (let k = 0; k < count; k++) {
    const row = [source[3 * k], source[3 * k + 1], source[3 * k + 2], 1];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) M[i * 4 + j] += row[i] * row[j];
      for (let c = 0; c < 3; c++) B[i * 3 + c] += row[i] * target[3 * k + c];
    }
  }
  for (let i = 0; i < 4; i++) M[i * 4 + i] += 1e-9;
  solve(M, B, 4, 3);
  return B;   // rows: coefficient of x, y, z, 1; columns: output x, y, z
}
export const applyAffine = (A, x, y, z) => [0, 1, 2].map(c => A[c] * x + A[3 + c] * y + A[6 + c] * z + A[9 + c]);

/* affine ICP: start from a map, then alternately match points and refit. Matching runs both ways (each source point to
   its nearest target point, and each target point to its nearest moved source point), so the source cannot shrink
   into a target that has inner surfaces. Returns the final map and the mean distance left (cm). */
export function icpAffine(source, target, start, { iterations = 30 } = {}) {
  const grid = new PointGrid(target, 1.5);
  let map = start, meanDistance = Infinity;
  for (let pass = 0; pass < iterations; pass++) {
    const moved = new Float32Array(source.length);
    for (let k = 0; k < source.length; k += 3) moved.set(applyAffine(map, source[k], source[k + 1], source[k + 2]), k);
    const back = new PointGrid(moved, 1.5), from = [], to = [];
    let total = 0, used = 0;
    for (let k = 0; k < source.length; k += 3) {
      const [index, distance] = grid.nearest(moved[k], moved[k + 1], moved[k + 2], 15);
      if (index < 0) continue;
      from.push(source[k], source[k + 1], source[k + 2]); to.push(target[3 * index], target[3 * index + 1], target[3 * index + 2]);
      total += distance; used++;
    }
    for (let k = 0; k < target.length; k += 3) {
      const [index] = back.nearest(target[k], target[k + 1], target[k + 2], 15);
      if (index < 0) continue;
      from.push(source[3 * index], source[3 * index + 1], source[3 * index + 2]); to.push(target[k], target[k + 1], target[k + 2]);
    }
    if (used < 8) throw new Error('ICP lost its match');
    meanDistance = total / used;
    map = fitAffine(from, to);
  }
  return { map, meanDistance };
}

/* thin-plate spline through landmark pairs; lambda > 0 lets it pass near rather than through them */
export function thinPlateSpline(source, target, lambda = 0) {
  const n = source.length / 3, size = n + 4, A = new Float64Array(size * size), b = new Float64Array(size * 3);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = Math.hypot(source[3 * i] - source[3 * j], source[3 * i + 1] - source[3 * j + 1], source[3 * i + 2] - source[3 * j + 2]);
      A[i * size + j] = -r + (i === j ? lambda : 0);
    }
    const row = [1, source[3 * i], source[3 * i + 1], source[3 * i + 2]];
    for (let k = 0; k < 4; k++) { A[i * size + n + k] = row[k]; A[(n + k) * size + i] = row[k]; }
    for (let c = 0; c < 3; c++) b[i * 3 + c] = target[3 * i + c];
  }
  solve(A, b, size, 3);
  const weights = b;
  return (x, y, z) => {
    const out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const r = -Math.hypot(x - source[3 * i], y - source[3 * i + 1], z - source[3 * i + 2]);
      out[0] += weights[i * 3] * r; out[1] += weights[i * 3 + 1] * r; out[2] += weights[i * 3 + 2] * r;
    }
    for (let c = 0; c < 3; c++) out[c] += weights[(n) * 3 + c] + weights[(n + 1) * 3 + c] * x + weights[(n + 2) * 3 + c] * y + weights[(n + 3) * 3 + c] * z;
    return out;
  };
}

/* evenly spread sample of a point cloud: at most one point per cell of the given size */
export function spread(points, cell) {
  const seen = new Set(), out = [];
  for (let k = 0; k < points.length; k += 3) {
    const key = `${Math.floor(points[k] / cell)},${Math.floor(points[k + 1] / cell)},${Math.floor(points[k + 2] / cell)}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(points[k], points[k + 1], points[k + 2]);
  }
  return out;
}

/* eigenvector of the largest eigenvalue of a symmetric 4x4 matrix (Jacobi rotations) */
function largestEigenvector(S) {
  const A = S.map(row => row.slice()), V = [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += A[p][q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  let best = 0;
  for (let k = 1; k < 4; k++) if (A[k][k] > A[best][best]) best = k;
  return [0, 1, 2, 3].map(k => V[k][best]);
}

/* least-squares rotation, uniform scale and shift taking source points to target points (Horn 1987), in the affine layout */
export function fitSimilarity(source, target) {
  const n = source.length / 3, a = [0, 0, 0], b = [0, 0, 0];
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { a[c] += source[3 * k + c] / n; b[c] += target[3 * k + c] / n; }
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let spreadSource = 0, spreadTarget = 0;
  for (let k = 0; k < n; k++) {
    const p = [0, 1, 2].map(c => source[3 * k + c] - a[c]), q = [0, 1, 2].map(c => target[3 * k + c] - b[c]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += p[i] * q[j];
    spreadSource += p[0] ** 2 + p[1] ** 2 + p[2] ** 2; spreadTarget += q[0] ** 2 + q[1] ** 2 + q[2] ** 2;
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = M;
  const [w, x, y, z] = largestEigenvector([
    [xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]]);
  const R = [[w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]];
  const scale = Math.sqrt(spreadTarget / spreadSource);
  const t = [0, 1, 2].map(r => b[r] - scale * (R[r][0] * a[0] + R[r][1] * a[1] + R[r][2] * a[2]));
  return Float64Array.from([scale * R[0][0], scale * R[1][0], scale * R[2][0], scale * R[0][1], scale * R[1][1], scale * R[2][1], scale * R[0][2], scale * R[1][2], scale * R[2][2], t[0], t[1], t[2]]);
}

/* ICP that only turns, scales evenly and shifts: for parts that must keep their shape, like a foot */
export function icpSimilarity(source, target, start, iterations = 30) {
  const grid = new PointGrid(target, 1.5);
  let map = start, meanDistance = Infinity;
  for (let pass = 0; pass < iterations; pass++) {
    const moved = new Float32Array(source.length);
    for (let k = 0; k < source.length; k += 3) moved.set(applyAffine(map, source[k], source[k + 1], source[k + 2]), k);
    const back = new PointGrid(moved, 1.5), from = [], to = [];
    let total = 0, used = 0;
    for (let k = 0; k < source.length; k += 3) {
      const [index, distance] = grid.nearest(moved[k], moved[k + 1], moved[k + 2], 15);
      if (index < 0) continue;
      from.push(source[k], source[k + 1], source[k + 2]); to.push(target[3 * index], target[3 * index + 1], target[3 * index + 2]);
      total += distance; used++;
    }
    for (let k = 0; k < target.length; k += 3) {
      const [index] = back.nearest(target[k], target[k + 1], target[k + 2], 15);
      if (index >= 0) { from.push(source[3 * index], source[3 * index + 1], source[3 * index + 2]); to.push(target[k], target[k + 1], target[k + 2]); }
    }
    if (used < 8) throw new Error('ICP lost its match');
    meanDistance = total / used;
    map = fitSimilarity(from, to);
  }
  return { map, meanDistance };
}
