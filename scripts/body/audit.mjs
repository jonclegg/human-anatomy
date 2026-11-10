// Audits a built body's muscles (or another layer): pairs that should mirror each other and do not, structures with no
// twin on the other side, structures that float clear of every bone, and structures that lie in the same place as
// another (a muscle drawn twice from two sources). Prints what it finds; exits 0 either way.
// Usage: node scripts/body/audit.mjs <female|male> [layer]
import { readParts, readLayer } from './built.mjs';
import { PointGrid, spread } from './fit.mjs';

const [sex = 'male', layer = 'muscles'] = process.argv.slice(2);
const parts = readParts(sex);
const structures = (await readLayer(sex, layer)).map(piece => ({ ...piece, ...parts.parts[piece.part] }));
const bones = new PointGrid(Float32Array.from((await readLayer(sex, 'skeleton')).flatMap(piece => spread(piece.positions, 0.4))), 1.5);
const twinName = name => name.replace(/\b(left|right)\b/i, word => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' })[word]);
const sideless = name => name.replace(/\b(left|right)\b/i, 'SIDE');

console.log(`${sex} ${layer}: ${structures.length} structures\n`);
/* ---- twins ---- */
const byName = new Map();
for (const structure of structures) (byName.get(structure.name) || byName.set(structure.name, []).get(structure.name)).push(structure);
const lone = [], uneven = [];
for (const [name, list] of byName) {
  if (!/\b(left|right)\b/i.test(name)) continue;
  const twins = byName.get(twinName(name));
  if (!twins) { lone.push(`${name} (${list[0].source})`); continue; }
  if (!/\bleft\b/i.test(name)) continue;
  const volume = group => group.reduce((sum, structure) => sum + structure.volume, 0), a = volume(list), b = volume(twins);
  const centre = group => [0, 1, 2].map(c => group.reduce((sum, structure) => sum + structure.centre[c] * structure.volume, 0) / (volume(group) || 1));
  const p = centre(list), q = centre(twins), apart = Math.hypot(p[0] + q[0], p[1] - q[1], p[2] - q[2]);
  if (list.length !== twins.length || Math.max(a, b) / Math.max(1e-6, Math.min(a, b)) > 1.6 || apart > 2) uneven.push(`${sideless(name)}: ${list.length} left / ${twins.length} right pieces, volume ${a.toFixed(1)} / ${b.toFixed(1)} cm³, ${apart.toFixed(1)} cm from mirrored`);
}
console.log(`NO TWIN on the other side (${lone.length}):\n  ${lone.sort().join('\n  ')}\n`);
console.log(`UNEVEN twins (${uneven.length}):\n  ${uneven.join('\n  ')}\n`);
/* ---- floating ---- */
const floating = [];
for (const structure of structures) {
  let nearest = Infinity;
  for (let k = 0; k < structure.positions.length; k += 3) nearest = Math.min(nearest, bones.nearest(structure.positions[k], structure.positions[k + 1], structure.positions[k + 2], 6)[1]);
  if (nearest > 1.5) floating.push(`${structure.name} (${structure.source}): ${Number.isFinite(nearest) ? nearest.toFixed(1) : 'over 6'} cm from any bone`);
}
console.log(`FLOATING, more than 1.5 cm from every bone (${floating.length}):\n  ${floating.join('\n  ')}\n`);
/* ---- the same place twice ---- */
const sampled = structures.map(structure => Float32Array.from(spread(structure.positions, 0.5)));
const grids = sampled.map(points => new PointGrid(points, 1));
const boxes = structures.map(structure => ({ min: structure.min, max: structure.max }));
const doubled = [];
for (let a = 0; a < structures.length; a++) for (let b = a + 1; b < structures.length; b++) {
  if ([0, 1, 2].some(c => boxes[a].min[c] > boxes[b].max[c] || boxes[b].min[c] > boxes[a].max[c])) continue;
  const share = (points, grid) => { let near = 0; for (let k = 0; k < points.length; k += 3) if (grid.nearest(points[k], points[k + 1], points[k + 2], 0.35)[0] >= 0) near++; return near / (points.length / 3); };
  const ab = share(sampled[a], grids[b]), ba = share(sampled[b], grids[a]);
  if (Math.min(ab, ba) > 0.5 || (Math.max(ab, ba) > 0.8 && structures[a].source !== structures[b].source)) doubled.push(`${structures[a].name} (${structures[a].source}) ~ ${structures[b].name} (${structures[b].source}): ${(ab * 100).toFixed(0)}% / ${(ba * 100).toFixed(0)}% within 0.35 cm`);
}
console.log(`IN THE SAME PLACE as another (${doubled.length}):\n  ${doubled.join('\n  ')}`);
