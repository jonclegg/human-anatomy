// Keeps a fitted or registered structure from passing through one that was scanned in place.
// The push is a smooth function of position (how close a point comes to the obstacle), so neighbouring pieces of an
// organ (a lung's segments) move together and their shared edges stay shared.
import { PointGrid } from './fit.mjs';

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

/* An organ made of pieces (a lung's segments, the liver's) has faces inside it where the pieces meet. Only its outer
   surface should count as an obstacle: a point of one piece that lies against another piece is on an inner face. */
export function outerSurface(meshes, tolerance = 0.35) {
  const grids = meshes.map(mesh => new PointGrid(mesh.positions, 1));
  const out = [];
  meshes.forEach((mesh, m) => {
    for (let k = 0; k < mesh.positions.length; k += 3) {
      const x = mesh.positions[k], y = mesh.positions[k + 1], z = mesh.positions[k + 2];
      if (grids.some((grid, other) => other !== m && grid.nearest(x, y, z, tolerance)[0] >= 0)) continue;
      out.push(x, y, z);
    }
  });
  return new PointGrid(Float32Array.from(out), 1.5);
}
