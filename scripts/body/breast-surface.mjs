// The nipple, the areola, its tubercles, the lactiferous sinuses and the fat of the breast, modelled. The scan's are a few millimetres of a
// heavier breast: fitted into a smaller one they are crushed to shards, and they are too small for a scan to have
// caught their shape in the first place. These are built on her own skin, under the tip of her breast, to textbook
// sizes for a young adult (areola about 3.5 cm across, nipple about 1 cm across and 0.6 cm high, ten or so tubercles,
// a dozen sinuses under the nipple).
const AREOLA_RADIUS = 1.75, NIPPLE_RADIUS = 0.5, NIPPLE_HEIGHT = 0.6, UNDER_SKIN = 0.2, AROUND = 32;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a); return a.map(value => value / length); };

/* Her skin's triangles within reach of a point, to find where a line meets the skin: the first crossing coming in
   from in front, and the skin's facing there. */
function skinNear({ positions, indices }, centre, reach) {
  const triangles = [];
  for (let t = 0; t < indices.length; t += 3) {
    const corners = [0, 1, 2].map(k => positions.subarray(3 * indices[t + k], 3 * indices[t + k] + 3));
    if (corners.some(p => Math.abs(p[0] - centre[0]) < reach && Math.abs(p[1] - centre[1]) < reach && Math.abs(p[2] - centre[2]) < reach)) triangles.push(corners.map(p => Array.from(p)));
  }
  /* from a point, along a direction: the distance to the nearest crossing ahead and the skin's outward normal there, or null */
  return (from, direction) => {
    let best = null;
    for (const [a, b, c] of triangles) {
      const e1 = sub(b, a), e2 = sub(c, a), h = cross(direction, e2), det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const q = sub(from, a), u = dot(q, h) / det;
      if (u < 0 || u > 1) continue;
      const r = cross(q, e1), v = dot(direction, r) / det;
      if (v < 0 || u + v > 1) continue;
      const distance = dot(e2, r) / det;
      if (distance < 0 || (best && distance >= best.distance)) continue;
      const n = unit(cross(e1, e2));
      best = { distance, normal: dot(n, direction) > 0 ? n.map(value => -value) : n };
    }
    return best;
  };
}

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

/** The four parts for one breast. skin: her skin { positions, indices }; tip: the breast's most forward point; base:
 *  the middle of the breast on the chest wall. Returns [{ name, positions, indices }].
 *  Each lies on her skin as it is, a little under it: a breast is not round about its tip (it falls away more steeply
 *  below than above), and a dome fitted to it stood out of the skin on one side and sank on the other. */
export function breastSurface(word, skin, tip, base) {
  const out = unit(sub(tip, base)), across = unit(cross([0, 1, 0], out)), up = cross(out, across), meet = skinNear(skin, tip, 6);
  const place = (x, y, height) => [0, 1, 2].map(c => tip[c] + across[c] * x + up[c] * y + out[c] * height);
  /* how far forward of the tip her skin is over a spot of the breast's own plane (seen along the breast's axis) */
  const FROM = 3;
  const skinAt = (x, y) => { const hit = meet(place(x, y, FROM), out.map(value => -value)); if (!hit) throw new Error(`${word} breast: no skin over ${x.toFixed(2)}, ${y.toFixed(2)} of the areola`); return FROM - hit.distance; };
  const onDome = (x, y, height) => place(x, y, skinAt(x, y) - UNDER_SKIN + height);
  const rings = Array.from({ length: 17 }, (_, k) => AREOLA_RADIUS * k / 16);
  const areola = turned([[0.001, 0], ...rings.slice(1).map(radius => [radius, 0]), [AREOLA_RADIUS, -0.12], ...rings.slice(1, -1).reverse().map(radius => [radius, -0.12]), [0.001, -0.12]], onDome);
  /* the nipple: a short column with a rounded top and a slightly narrower waist, its top just under the top of her
     skin's own nipple, and nowhere nearer her skin than the areola is */
  const crown = skinAt(0, 0) - UNDER_SKIN - NIPPLE_HEIGHT;
  const nipple = turned([[0.001, NIPPLE_HEIGHT], [0.2, NIPPLE_HEIGHT - 0.02], [0.36, NIPPLE_HEIGHT - 0.08], [0.45, NIPPLE_HEIGHT - 0.18], [0.47, NIPPLE_HEIGHT - 0.3], [0.44, 0.14], [NIPPLE_RADIUS, 0.02], [NIPPLE_RADIUS, -0.1], [0.001, -0.1]], (x, y, height) => place(x, y, Math.min(crown + height, skinAt(x, y) - UNDER_SKIN)));
  /* the tubercles: small glands that stand up on the areola, scattered round a ring, their tops as far under the skin as the areola (on a slope the skin is nearer than it is straight along the breast) */
  const tubercles = together(Array.from({ length: 11 }, (_, k) => { const angle = 2 * Math.PI * (k + 0.37 * Math.sin(k * 2.1)) / 11, radius = 1.2 + 0.22 * Math.sin(k * 1.7); return ball([radius * Math.cos(angle), radius * Math.sin(angle), -0.1], 0.085, onDome); }));
  /* the sinuses: where each duct widens just behind the nipple, a dozen of them fanning back from it */
  const sinuses = together(Array.from({ length: 12 }, (_, k) => { const angle = 2 * Math.PI * (k + 0.5) / 12, lean = [Math.cos(angle) * 0.55, Math.sin(angle) * 0.55, -1]; return ball([0.3 * Math.cos(angle) + lean[0] * 0.45, 0.3 * Math.sin(angle) + lean[1] * 0.45, -0.62], 0.13, onDome, { long: 0.4, along: lean }); }));
  return [{ name: `${word} nipple`, ...nipple }, { name: `${word} areola`, ...areola }, { name: `${word} areolar tubercles`, ...tubercles }, { name: `${word} main lactiferous sinuses`, ...sinuses }];
}

/** The fat of one breast: a smooth mound that follows her own skin a little under it, round the tip, and comes down to
 *  the chest wall at its rim. The scan's fat, squeezed into a breast a third its depth, came out folded and holed; and
 *  the fat is what gives a breast its shape, which is her skin's. skin: her skin { positions, indices }; tip: the
 *  breast's most forward point; wall: how far forward the chest wall is behind it; reach: how far the mound runs from
 *  the tip toward [the body's right, its left, down, up] (cm). */
export function breastFat(side, skin, tip, wall, reach) {
  const UNDER = 0.3, RINGS = 12, back = wall + 0.15, positions = [], indices = [], meet = skinNear(skin, tip, 12);
  /* how far forward the mound may come over a spot of the chest: UNDER inside her skin, measured square to the skin,
     so it stays as far under where the breast slopes away as at its front */
  const FRONT = tip[2] + 3;
  const skinAt = (x, y) => {
    const hit = meet([x, y, FRONT], [0, 0, -1]);
    if (!hit) throw new Error(`${side} breast: no skin over ${x.toFixed(1)}, ${y.toFixed(1)}`);
    return FRONT - hit.distance - (UNDER / Math.max(0.1, hit.normal[2]) - UNDER);
  };
  positions.push(tip[0], tip[1], Math.max(back, skinAt(tip[0], tip[1]) - UNDER));
  for (let ring = 1; ring <= RINGS; ring++) for (let k = 0; k < AROUND; k++) {
    const angle = 2 * Math.PI * k / AROUND, out = ring / RINGS, x = tip[0] + out * Math.cos(angle) * reach[Math.cos(angle) < 0 ? 0 : 1], y = tip[1] + out * Math.sin(angle) * reach[Math.sin(angle) < 0 ? 2 : 3];
    /* toward its rim the mound comes down to the chest wall behind the tip; above and below the breast her chest
       curves back behind that, and there the mound stays under her skin */
    const under = skinAt(x, y) - UNDER;
    positions.push(x, y, Math.min(under, back + Math.max(0, under - back) * (1 - out ** 4)));
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
