// The nipple, the areola, its tubercles, the lactiferous sinuses and the fat of the breast, modelled. The scan's are a few millimetres of a
// heavier breast: fitted into a smaller one they are crushed to shards, and they are too small for a scan to have
// caught their shape in the first place. These are built on her own skin, under the tip of her breast, to textbook
// sizes for a young adult (areola about 3.5 cm across, nipple about 1 cm across and 0.6 cm high, ten or so tubercles,
// a dozen sinuses under the nipple).
const AREOLA_RADIUS = 1.75, NIPPLE_RADIUS = 0.5, NIPPLE_HEIGHT = 0.6, UNDER_SKIN = 0.1, AROUND = 32;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a); return a.map(value => value / length); };

/* a surface of revolution about the breast's axis, closed at both ends: profile is [radius, height] from one pole to the other */
function turned(profile, place) {
  const positions = [], indices = [];
  profile.forEach(([radius, height]) => { for (let k = 0; k < AROUND; k++) { const angle = 2 * Math.PI * k / AROUND; positions.push(...place(radius * Math.cos(angle), radius * Math.sin(angle), height)); } });
  for (let ring = 0; ring + 1 < profile.length; ring++) for (let k = 0; k < AROUND; k++) {
    const a = ring * AROUND + k, b = ring * AROUND + (k + 1) % AROUND, c = a + AROUND, d = b + AROUND;
    indices.push(a, c, b, b, c, d);   // facing outward, the profile running from the pole in front to the pole behind
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
/* a ball, squeezed to `long` along a direction given in the breast's own frame */
function ball(centre, radius, place, { long = radius, along = [0, 0, 1] } = {}) {
  const positions = [], indices = [], BANDS = 8, SLICES = 12, axis = unit(along);
  for (let band = 0; band <= BANDS; band++) for (let slice = 0; slice < SLICES; slice++) {
    const polar = Math.PI * band / BANDS, turn = 2 * Math.PI * slice / SLICES, point = [Math.sin(polar) * Math.cos(turn), Math.sin(polar) * Math.sin(turn), Math.cos(polar)].map(value => value * radius);
    const stretch = dot(point, axis) * (long / radius - 1);
    positions.push(...place(centre[0] + point[0] + axis[0] * stretch, centre[1] + point[1] + axis[1] * stretch, centre[2] + point[2] + axis[2] * stretch));
  }
  for (let band = 0; band < BANDS; band++) for (let slice = 0; slice < SLICES; slice++) {
    const a = band * SLICES + slice, b = band * SLICES + (slice + 1) % SLICES, c = a + SLICES, d = b + SLICES;
    indices.push(a, c, b, b, c, d);
  }
  return { positions, indices };
}
function together(pieces) {
  const positions = [], indices = [];
  for (const piece of pieces) { const start = positions.length / 3; positions.push(...piece.positions); indices.push(...piece.indices.map(index => index + start)); }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** The four parts for one breast. skin: her skin's positions; of: which of its vertices are this breast's; tip: the
 *  breast's most forward point; base: the middle of the breast on the chest wall. Returns [{ name, positions, indices }]. */
export function breastSurface(word, skin, of, tip, base) {
  const out = unit(sub(tip, base)), across = unit(cross([0, 1, 0], out)), up = cross(out, across);
  /* the breast's own shape round the tip, without the skin's nipple: a dome, height falling with the square of the
     distance from the axis, fitted to the skin between 1 and 3.5 cm out */
  let sumR2 = 0, sumR4 = 0, sumH = 0, sumHR2 = 0, count = 0;
  for (const v of of) {
    const from = sub(skin.subarray(3 * v, 3 * v + 3), tip), height = dot(from, out), r2 = dot(from, across) ** 2 + dot(from, up) ** 2;
    if (r2 < 1 || r2 > 3.5 ** 2) continue;
    sumR2 += r2; sumR4 += r2 * r2; sumH += height; sumHR2 += height * r2; count++;
  }
  if (count < 8) throw new Error(`${word} breast: only ${count} points of skin round the tip to shape the areola on`);
  const fall = (count * sumHR2 - sumR2 * sumH) / (count * sumR4 - sumR2 * sumR2), top = (sumH - fall * sumR2) / count;   // height = top + fall r²
  const dome = radius => top + fall * radius * radius - UNDER_SKIN;
  const place = (x, y, height) => [0, 1, 2].map(c => tip[c] + across[c] * x + up[c] * y + out[c] * height);
  const onDome = (x, y, height) => place(x, y, dome(Math.hypot(x, y)) + height);
  const rings = Array.from({ length: 9 }, (_, k) => AREOLA_RADIUS * k / 8);
  const areola = turned([[0.001, 0], ...rings.slice(1).map(radius => [radius, 0]), [AREOLA_RADIUS, -0.12], ...rings.slice(1, -1).reverse().map(radius => [radius, -0.12]), [0.001, -0.12]], onDome);
  /* the nipple: a short column with a rounded top and a slightly narrower waist, standing on the areola */
  const nipple = turned([[0.001, NIPPLE_HEIGHT], [0.2, NIPPLE_HEIGHT - 0.02], [0.36, NIPPLE_HEIGHT - 0.08], [0.45, NIPPLE_HEIGHT - 0.18], [0.47, NIPPLE_HEIGHT - 0.3], [0.44, 0.14], [NIPPLE_RADIUS, 0.02], [NIPPLE_RADIUS, -0.1], [0.001, -0.1]], (x, y, height) => place(x, y, dome(0) + height));
  /* the tubercles: small glands that stand up on the areola, scattered round a ring */
  const tubercles = together(Array.from({ length: 11 }, (_, k) => { const angle = 2 * Math.PI * (k + 0.37 * Math.sin(k * 2.1)) / 11, radius = 1.2 + 0.22 * Math.sin(k * 1.7); return ball([radius * Math.cos(angle), radius * Math.sin(angle), 0.02], 0.085, onDome); }));
  /* the sinuses: where each duct widens just behind the nipple, a dozen of them fanning back from it */
  const sinuses = together(Array.from({ length: 12 }, (_, k) => { const angle = 2 * Math.PI * (k + 0.5) / 12, lean = [Math.cos(angle) * 0.55, Math.sin(angle) * 0.55, -1]; return ball([0.3 * Math.cos(angle) + lean[0] * 0.45, 0.3 * Math.sin(angle) + lean[1] * 0.45, -0.62], 0.13, onDome, { long: 0.4, along: lean }); }));
  return [{ name: `${word} nipple`, ...nipple }, { name: `${word} areola`, ...areola }, { name: `${word} areolar tubercles`, ...tubercles }, { name: `${word} main lactiferous sinuses`, ...sinuses }];
}

/** The fat of one breast: a smooth mound that follows her own skin a little under it, round the tip, and comes down to
 *  the chest wall at its rim. The scan's fat, squeezed into a breast a third its depth, came out folded and holed; and
 *  the fat is what gives a breast its shape, which is her skin's. skin: her skin's positions; tip: the breast's most
 *  forward point; wall: how far forward the chest wall is behind it; reach: how far the mound runs from the tip toward
 *  [the body's right, its left, down, up] (cm). */
export function breastFat(side, skin, tip, wall, reach) {
  const UNDER = 0.3, RINGS = 12, back = wall + 0.15, positions = [], indices = [];
  /* how far forward her skin is over a spot of the chest: the skin near it, the nearest counting most */
  const front = [];
  for (let k = 0; k < skin.length; k += 3) if (skin[k + 2] > wall - 1 && Math.abs(skin[k] - tip[0]) < 9 && Math.abs(skin[k + 1] - tip[1]) < 9) front.push(k);
  const skinAt = (x, y) => {
    let sum = 0, weight = 0;
    for (const k of front) { const d2 = (skin[k] - x) ** 2 + (skin[k + 1] - y) ** 2; if (d2 > 4) continue; const w = 1 / (d2 + 0.05) ** 2; sum += w * skin[k + 2]; weight += w; }
    if (!weight) throw new Error(`${side} breast: no skin over ${x.toFixed(1)}, ${y.toFixed(1)}`);
    return sum / weight;
  };
  positions.push(tip[0], tip[1], Math.max(back, skinAt(tip[0], tip[1]) - UNDER));
  for (let ring = 1; ring <= RINGS; ring++) for (let k = 0; k < AROUND; k++) {
    const angle = 2 * Math.PI * k / AROUND, out = ring / RINGS, x = tip[0] + out * Math.cos(angle) * reach[Math.cos(angle) < 0 ? 0 : 1], y = tip[1] + out * Math.sin(angle) * reach[Math.sin(angle) < 0 ? 2 : 3];
    positions.push(x, y, back + Math.max(0, skinAt(x, y) - UNDER - back) * (1 - out ** 4));
  }
  for (let k = 0; k < AROUND; k++) indices.push(0, 1 + k, 1 + (k + 1) % AROUND);
  for (let ring = 1; ring < RINGS; ring++) for (let k = 0; k < AROUND; k++) {
    const a = 1 + (ring - 1) * AROUND + k, b = 1 + (ring - 1) * AROUND + (k + 1) % AROUND, c = a + AROUND, d = b + AROUND;
    indices.push(a, c, b, b, c, d);
  }
  /* closed flat across the back, on the chest wall */
  const middle = positions.length / 3, rim = 1 + (RINGS - 1) * AROUND;
  positions.push(tip[0], tip[1], back);
  for (let k = 0; k < AROUND; k++) indices.push(middle, rim + (k + 1) % AROUND, rim + k);
  return { name: `Fat of ${side} breast`, positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
