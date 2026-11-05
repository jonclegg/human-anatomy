// Registers one body onto another: matched structures pin the warp, the spine is matched disc by disc along its length,
// and the skin pulls the outline into place. The result is a smooth map of the whole source body (thin-plate spline).
import { icpAffine, applyAffine, thinPlateSpline, spread, PointGrid } from './fit.mjs';

const flat = meshes => { const out = []; for (const mesh of meshes) for (const value of mesh.positions) out.push(value); return out; };

/* points along a polyline at even shares of its length */
function alongSpine(centres) {
  const lengths = [0];
  for (let k = 1; k < centres.length; k++) lengths.push(lengths[k - 1] + Math.hypot(...[0, 1, 2].map(c => centres[k][c] - centres[k - 1][c])));
  const total = lengths.at(-1);
  return { shares: lengths.map(length => length / total), at(share) {
    const k = Math.max(1, lengths.findIndex(length => length / total >= share));
    const t = (share * total - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
    return [0, 1, 2].map(c => centres[k - 1][c] + (centres[k][c] - centres[k - 1][c]) * t);
  } };
}
const centreOf = mesh => { const sum = [0, 0, 0], n = mesh.positions.length / 3; for (let k = 0; k < mesh.positions.length; k++) sum[k % 3] += mesh.positions[k]; return sum.map(value => value / n); };

/**
 * pairs: [{ name, source: [meshes], target: [meshes] }] structures that match one to one
 * spine: { source: [disc meshes, top to bottom], target: [...] }
 * skin: { source: mesh, target: mesh }
 * start: the affine map (fit.mjs layout) to begin from
 * extra: landmark pairs worked out elsewhere ({ from, to } flat arrays)
 * skin.skip(x, y, z): source skin points to leave out of the skin match
 */
export function register({ pairs, spine, skin, start, extra = { from: [], to: [] }, lambda = 2, skinRounds = [5, 3.5, 2.5], log = console.log }) {
  const from = [...extra.from], to = [...extra.to], fitted = [];
  for (const pair of pairs) {
    const source = spread(flat(pair.source), 1), target = spread(flat(pair.target), 0.6);
    const { map, meanDistance } = icpAffine(source, target, start);
    const near = Float32Array.from(spread(source, 0.8)), low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < near.length; k++) { low[k % 3] = Math.min(low[k % 3], near[k]); high[k % 3] = Math.max(high[k % 3], near[k]); }
    fitted.push({ map, grid: new PointGrid(near, BLEND_REACH), low, high });
    const anchors = spread(source, pair.spacing || 2.5);
    for (let k = 0; k < anchors.length; k += 3) { from.push(anchors[k], anchors[k + 1], anchors[k + 2]); to.push(...applyAffine(map, anchors[k], anchors[k + 1], anchors[k + 2])); }
    log(`  ${pair.name}: ${anchors.length / 3} anchors, ICP left ${meanDistance.toFixed(2)} cm`);
  }
  if (spine) {
    const source = spine.source.map(centreOf), target = alongSpine(spine.target.map(centreOf)), shares = alongSpine(source).shares;
    source.forEach((point, k) => { from.push(...point); to.push(...target.at(shares[k])); });
    log(`  spine: ${source.length} discs matched to ${spine.target.length}`);
  }
  let warp = thinPlateSpline(Float64Array.from(from), Float64Array.from(to), lambda);
  if (skin) {
    const all = spread(skin.source.positions, 4.5), samples = [];
    for (let k = 0; k < all.length; k += 3) if (!skin.skip?.(all[k], all[k + 1], all[k + 2])) samples.push(all[k], all[k + 1], all[k + 2]);
    const grid = new PointGrid(skin.target.positions, 1.5);
    for (const reach of skinRounds) {
      const skinFrom = [], skinTo = [];
      for (let k = 0; k < samples.length; k += 3) {
        const p = warp(samples[k], samples[k + 1], samples[k + 2]);
        const [index] = grid.nearest(p[0], p[1], p[2], reach);
        if (index < 0) continue;
        skinFrom.push(samples[k], samples[k + 1], samples[k + 2]); skinTo.push(...skin.target.positions.subarray(3 * index, 3 * index + 3));
      }
      warp = thinPlateSpline(Float64Array.from([...from, ...skinFrom]), Float64Array.from([...to, ...skinTo]), lambda);
      log(`  skin within ${reach} cm: ${skinFrom.length / 3} of ${samples.length / 3} points`);
    }
  }
  /* how far the finished warp misses its own landmarks, worst first: a large miss means two landmarks disagree */
  const misses = [];
  for (let k = 0; k < from.length; k += 3) { const p = warp(from[k], from[k + 1], from[k + 2]); misses.push([Math.hypot(p[0] - to[k], p[1] - to[k + 1], p[2] - to[k + 2]), from.slice(k, k + 3).map(v => v.toFixed(0)).join(',')]); }
  misses.sort((a, b) => b[0] - a[0]);
  /* landmarks that start close together but are sent far apart pull against each other */
  for (const [, at] of misses.slice(0, 2)) {
    const [x, y, z] = at.split(',').map(Number), k0 = misses.length && from.findIndex((v, k) => k % 3 === 0 && Math.abs(from[k] - x) < 0.6 && Math.abs(from[k + 1] - y) < 0.6 && Math.abs(from[k + 2] - z) < 0.6);
    const near = [];
    for (let k = 0; k < from.length; k += 3) if (Math.hypot(from[k] - from[k0], from[k + 1] - from[k0 + 1], from[k + 2] - from[k0 + 2]) < 3 && Math.hypot(to[k] - to[k0], to[k + 1] - to[k0 + 1], to[k + 2] - to[k0 + 2]) > 6) near.push(`#${k / 3} (${from.slice(k, k + 3).map(v => v.toFixed(0))}) -> (${to.slice(k, k + 3).map(v => v.toFixed(0))})`);
    log(`    #${k0 / 3} (${from.slice(k0, k0 + 3).map(v => v.toFixed(0))}) -> (${to.slice(k0, k0 + 3).map(v => v.toFixed(0))}) disagrees with ${near.slice(0, 4).join('; ') || 'none nearby'}`);
  }
  log(`  landmarks missed by: median ${misses[misses.length >> 1][0].toFixed(2)} cm, worst ${misses.slice(0, 4).map(([d, at]) => `${d.toFixed(1)} cm at (${at})`).join(', ')}`);
  return blend(fitted, warp);
}

/* Near a matched structure, a point moves with that structure's own fit, as skin follows a bone; between structures the
   fits blend; far from all of them the spline decides. This keeps soft tissue beside a bone the shape it had, where a
   spline alone, stretched between a wide pelvis and a thigh bone, would swell it. */
const BLEND_REACH = 7;   // cm: how far a structure's own fit holds sway
export function blend(fitted, spline) {
  return (x, y, z) => {
    const base = spline(x, y, z), out = [0, 0, 0];
    let total = 0;
    for (const { map, grid, low, high } of fitted) {
      const reach = 2.5 * BLEND_REACH;
      if (x < low[0] - reach || x > high[0] + reach || y < low[1] - reach || y > high[1] + reach || z < low[2] - reach || z > high[2] + reach) continue;
      const [index, distance] = grid.nearest(x, y, z, reach);
      if (index < 0) continue;
      const weight = Math.exp(-((distance / BLEND_REACH) ** 2));
      const p = applyAffine(map, x, y, z);
      for (let c = 0; c < 3; c++) out[c] += weight * p[c];
      total += weight;
    }
    const rest = Math.max(0, 1 - total);
    const sum = total + rest;
    return [0, 1, 2].map(c => (out[c] + rest * base[c]) / sum);
  };
}

/* apply a warp to a mesh's positions, returning a new mesh */
export function warpMesh(mesh, warp) {
  const positions = new Float32Array(mesh.positions.length);
  for (let k = 0; k < positions.length; k += 3) positions.set(warp(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]), k);
  return { positions, indices: mesh.indices };
}

/* mean distance (cm) from a mesh's points to the nearest point of another */
export function meanGap(mesh, target) {
  const grid = new PointGrid(target.positions, 1.5), points = spread(mesh.positions, 1);
  let total = 0, count = 0;
  for (let k = 0; k < points.length; k += 3) { const [, distance] = grid.nearest(points[k], points[k + 1], points[k + 2], 30); if (Number.isFinite(distance)) { total += distance; count++; } }
  return total / count;
}

/* scale about the floor and the midline, so the source's height matches the target's: where the fit starts */
export function startMap(sourceHeight, targetHeight, sourcePelvis, targetPelvis) {
  const s = targetHeight / sourceHeight;
  /* rows: coefficients of x, y, z, 1 for the outputs x, y, z */
  return Float64Array.from([s, 0, 0, 0, s, 0, 0, 0, s, targetPelvis[0] - s * sourcePelvis[0], targetPelvis[1] - s * sourcePelvis[1], targetPelvis[2] - s * sourcePelvis[2]]);
}
