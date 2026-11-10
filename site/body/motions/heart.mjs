// The beating heart: what moves, when, and where the blood goes.
// One cycle, slowed to about 46 beats a minute so each step can be followed:
//   0.00-0.13  the atria squeeze and top up the ventricles
//   0.14       the tricuspid and mitral valves swing shut (the first heart sound)
//   0.19-0.47  the ventricles squeeze, the pulmonary and aortic valves are open, blood leaves
//   0.48       the pulmonary and aortic valves swing shut (the second heart sound)
//   0.58-1.00  the heart relaxes, the tricuspid and mitral valves open, and it refills
// The valves are models of their own while it beats (see VALVES). A step of its story (stories.mjs) cuts it open, so
// the valves and the blood are seen from inside.
import { smooth, SPENT, FRESH } from './shared.mjs';
const FIRST_SOUND = 0.14, SECOND_SOUND = 0.48, CYCLE = 1.3;   // CYCLE: one beat, in seconds
export function beatAt(phase) {
  return {
    atria: phase < 0.13 ? Math.sin(Math.PI * phase / 0.13) ** 2 : 0,           // how far the atria are squeezed, 0 to 1
    ventricles: smooth(0.14, 0.27, phase) * (1 - smooth(0.42, 0.57, phase)),    // and the ventricles
    inflow: phase < 0.2 ? 1 - smooth(0.13, 0.17, phase) : smooth(0.58, 0.68, phase),   // how far open the tricuspid and mitral valves are, 0 to 1
    outflow: smooth(0.19, 0.25, phase) * (1 - smooth(0.44, 0.49, phase)),               // and the pulmonary and aortic
    moment: phase < 0.14 ? 0 : phase < 0.5 ? 1 : 2,
  };
}
/* How a structure moves: 1 an atrium's wall, 2 the ventricles' wall and what rides on it, 3 an atrium's cavity,
   4 a ventricle's cavity. Each shrinks toward a pivot by its own share: a cavity far more than a wall. */
const MOVES = [[/^Wall of (left|right) atrium$/, 1], [/^Wall of ventricle$|papillary muscle/i, 2], [/^Cavity of (left|right) atrium$/, 3], [/^Cavity of (left|right) ventricle$/, 4]];
const SQUEEZE = [0, 0.07, 0.09, 0.2, 0.26];
const RIDES_THE_WALL = ['heartLeftCoronary', 'heartAnteriorInterventricular', 'heartCircumflex', 'heartRightCoronary', 'cardiacVeins'];
/* The four valves. The source has each one shut, its leaflets fused with their cords, and a shape like that cannot be
   made to open. So while the heart beats each valve is a model of its own (the engine draws it in place of the source's
   parts), fitted to the source's: its ring where the source's leaflets hang, as wide as they reach, one leaflet where
   each of the source's is. `from` is the chamber the blood comes from and `to` the one it goes to, which give the way
   through; `muscles` are the papillary muscles its cords are tied to.
   An inflow valve's leaflets hang from the ring into the ventricle. Shut, their edges meet along lines from the ring to
   its middle, a little below it, and the cords are taut; open, they hang apart as a funnel, and the cords go slack.
   An outflow valve's cusps are pockets on the artery's wall, each fixed along a U. Shut, they fill, belly back toward
   the ventricle, and their free edges meet at the middle; open, they lie up against the wall. */
const VALVES = [
  { name: 'tricuspid', leaflets: /leaflet of tricuspid valve$/i, from: 'Cavity of right atrium', to: 'Cavity of right ventricle', muscles: /papillary muscle of right ventricle$/i },
  { name: 'mitral', leaflets: /leaflet of mitral valve$/i, from: 'Cavity of left atrium', to: 'Cavity of left ventricle', muscles: /papillary muscle of left ventricle$/i },
  { name: 'pulmonary', leaflets: /cusp of pulmonary valve$/i, from: 'Cavity of right ventricle' },
  { name: 'aortic', leaflets: /cusp of aortic valve$/i, from: 'Cavity of left ventricle' },
];
const ACROSS = 14, ALONG = 8;                              // a leaflet's mesh: steps across it, and from the ring to its free edge
const CORDS = [0.1, 0.24, 0.38, 0.62, 0.76, 0.9], CORD_STEPS = 5, CORD_WIDTH = 0.045;   // where along a leaflet's edge its cords are tied; a cord's mesh, and its half-width in cm
function modelValve(kit, { name, leaflets, from, to, muscles }) {
  const parts = kit.find(leaflets), inflow = !!to, points = kit.points(parts), start = kit.centre(kit.one(exact(from)));
  const onward = (to ? kit.centre(kit.one(exact(to))).sub(start) : kit.centre(parts).sub(start)).normalize();   // roughly the way through
  /* an inflow valve's leaflets are the part of the source's shape nearest the atrium: its cords run on below them */
  const first = Math.min(...points.map(point => point.dot(onward))), isLeaf = point => !inflow || point.dot(onward) < first + 1.5, leaf = points.filter(isLeaf);
  const axis = kit.thin(leaf, onward), middle = leaf.reduce((sum, point) => sum.add(point), kit.V(0, 0, 0)).divideScalar(leaf.length);   // shut, the leaflets lie across the way through
  const deep = point => point.clone().sub(middle).dot(axis), wide = point => point.clone().sub(middle).addScaledVector(axis, -deep(point)).length();
  const reach = leaf.map(wide).sort((a, b) => a - b), radius = reach[Math.floor(reach.length * 0.85)];
  const depths = leaf.map(deep), rim = leaf.filter(point => wide(point) > radius * 0.8);
  /* the ring: for an inflow valve where its leaflets hang from, for an outflow valve at the bottom of its cusps */
  const level = inflow ? rim.reduce((sum, point) => sum + deep(point), 0) / rim.length : Math.min(...depths);
  const ring = middle.clone().addScaledVector(axis, level), height = Math.min(Math.max(...depths) - Math.min(...depths), radius * 1.05);
  const one = Math.abs(axis.y) < 0.9 ? kit.V(0, 1, 0) : kit.V(1, 0, 0), across = one.cross(axis).normalize(), other = axis.clone().cross(across);
  const place = (r, angle, h) => ring.clone().addScaledVector(across, r * Math.cos(angle)).addScaledVector(other, r * Math.sin(angle)).addScaledVector(axis, h);
  /* a leaflet for each of the source's, where it is round the ring: each runs from halfway to its neighbour on one side to halfway on the other */
  const angleOf = part => { const mine = kit.points(part).filter(isLeaf), mean = mine.reduce((sum, point) => sum.add(point), kit.V(0, 0, 0)).divideScalar(mine.length).sub(ring); return Math.atan2(mean.dot(other), mean.dot(across)); };
  const round = parts.map(part => ({ part, angle: angleOf(part) })).sort((a, b) => a.angle - b.angle);
  const sectors = round.map(({ part, angle }, k) => {
    const before = round[(k + round.length - 1) % round.length].angle - (k === 0 ? 2 * Math.PI : 0), after = round[(k + 1) % round.length].angle + (k === round.length - 1 ? 2 * Math.PI : 0);
    return { part, from: (before + angle) / 2, to: (angle + after) / 2 };
  });
  /* a point of a leaflet: u across it (0 to 1), v from the ring to its free edge, with the valve `open` from 0 to 1 */
  const length = u => radius * 1.1 * (0.45 + 0.55 * Math.sin(Math.PI * u));
  function point({ from: left, to: right }, u, v, open) {
    const angle = left + (right - left) * u, side = Math.abs(2 * u - 1), edge = u < 0.5 ? left : right;   // side: 0 at the leaflet's middle, 1 where it meets its neighbour
    if (inflow) {
      const shut = [radius * 0.9 * side, edge, 0.3 * radius * (1 - side * side) + 0.35 * length(u) * side * side], wide = [radius * (0.7 + 0.08 * side), angle, length(u)];
      const free = place(shut[0] + (wide[0] - shut[0]) * open, shut[1] + (wide[1] - shut[1]) * open, shut[2] + (wide[2] - shut[2]) * open);
      return place(radius, angle, 0).lerp(free, v).addScaledVector(axis, -0.1 * radius * Math.sin(Math.PI * v) * (1 - side * side) * (1 - open));   // shut, it billows a little toward the atrium
    }
    const fixed = place(radius, angle, height * side ** 1.6);   // the U it is fixed along
    const shut = [radius * side, edge, height * (0.8 + 0.2 * side)], wide = [radius * (0.84 + 0.1 * side), angle, height * (1.25 - 0.25 * side)];
    const free = place(shut[0] + (wide[0] - shut[0]) * open, shut[1] + (wide[1] - shut[1]) * open, shut[2] + (wide[2] - shut[2]) * open);
    return fixed.lerp(free, v).addScaledVector(axis, -0.3 * height * Math.sin(Math.PI * v) * (1 - side * side) * (1 - open));   // shut, it bellies back toward the ventricle
  }
  /* the cords, each from a place on a leaflet's edge to the tip of the muscle nearest that place when the valve is open; taut when it is shut */
  const tips = muscles ? kit.find(muscles).map(part => kit.end(part, ring.clone().sub(kit.centre(part)).normalize(), 0.5)) : [];
  const cords = tips.length ? sectors.flatMap(sector => CORDS.map(u => {
    const hangs = point(sector, u, 1, 1), tip = tips.reduce((best, each) => (each.distanceTo(hangs) < best.distanceTo(hangs) ? each : best));
    return { sector, u, tip, taut: point(sector, u, 1, 0).distanceTo(tip) };
  })) : [];
  /* the mesh: a sheet for each leaflet, then a three-sided tube for each cord */
  const index = [], of = [], sheet = (ACROSS + 1) * (ALONG + 1);
  sectors.forEach(({ part }, s) => {
    for (let k = 0; k < sheet; k++) of.push(part);
    for (let i = 0; i < ACROSS; i++) for (let j = 0; j < ALONG; j++) { const a = s * sheet + i * (ALONG + 1) + j, b = a + ALONG + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
  });
  const corded = sectors.length * sheet;
  cords.forEach(({ sector }, c) => {
    for (let k = 0; k < (CORD_STEPS + 1) * 3; k++) of.push(sector.part);
    for (let i = 0; i < CORD_STEPS; i++) for (let j = 0; j < 3; j++) { const a = corded + c * (CORD_STEPS + 1) * 3 + i * 3 + j, b = corded + c * (CORD_STEPS + 1) * 3 + i * 3 + (j + 1) % 3; index.push(a, b, a + 3, b, b + 3, a + 3); }
  });
  const model = kit.model({ name, parts, count: of.length, index, of });
  const sideways = kit.V(0, 0, 0), up = kit.V(0, 0, 0), bow = kit.V(0, 0, 0), at = kit.V(0, 0, 0);
  /* drawn `open` (0 to 1), its cords tied to muscles that the ventricle's squeeze has drawn toward a point by a share */
  return { name, inflow, pose(open, toward, share) {
    const positions = model.positions; let k = 0;
    for (const sector of sectors) for (let i = 0; i <= ACROSS; i++) for (let j = 0; j <= ALONG; j++) { const spot = point(sector, i / ACROSS, j / ALONG, open); positions[k++] = spot.x; positions[k++] = spot.y; positions[k++] = spot.z; }
    for (const { sector, u, tip, taut } of cords) {
      const tied = point(sector, u, 1, open), end = tip.clone().lerp(toward, share), along = end.clone().sub(tied), far = along.length();
      /* slack, it bows toward the middle of the way through, by as much as its length allows */
      bow.copy(ring).addScaledVector(axis, tied.clone().sub(ring).dot(axis)).sub(tied).addScaledVector(along, -bow.dot(along) / (far * far)).setLength(0.5 * Math.sqrt(Math.max(0, taut * taut - far * far)));
      sideways.copy(along).cross(axis).setLength(CORD_WIDTH); up.copy(along).cross(sideways).setLength(CORD_WIDTH);
      for (let i = 0; i <= CORD_STEPS; i++) {
        const t = i / CORD_STEPS; at.copy(tied).addScaledVector(along, t).addScaledVector(bow, 4 * t * (1 - t));
        for (let j = 0; j < 3; j++) { const turn = j * 2.0944; positions[k++] = at.x + sideways.x * Math.cos(turn) + up.x * Math.sin(turn); positions[k++] = at.y + sideways.y * Math.cos(turn) + up.y * Math.sin(turn); positions[k++] = at.z + sideways.z * Math.cos(turn) + up.z * Math.sin(turn); }
      }
    }
    model.state.open = open;
  } };
}
const SPENT_CELLS = '#8fb0ff', FRESH_CELLS = '#ff9a8c';   // the blood in motion: paler than the chamber it runs through, so it shows
/* The two streams, as the structures each passes through, in order */
const STREAMS = [
  { colour: SPENT_CELLS, through: ['Superior vena cava', { atrium: 'Cavity of right atrium' }, { inflow: /tricuspid/i }, { ventricle: 'Cavity of right ventricle' }, { outflow: /pulmonary/i }, 'Pulmonary trunk'] },
  { colour: FRESH_CELLS, through: ['Left superior pulmonary vein', { atrium: 'Cavity of left atrium' }, { inflow: /mitral/i }, { ventricle: 'Cavity of left ventricle' }, { outflow: /aortic/i }, 'Ascending aorta', 'Arch of aorta'] },
];
/* Where the blood is. Each stream is a queue of drops, and five places along it are each reached on a clock of their
   own: every clock counts one more with each beat, but a valve's counts only while that valve is open. The drops between
   two places spread evenly between them, so a chamber holds more blood, through its whole depth, while the valve ahead of
   it is shut, and gives it up when that valve opens. Nothing heaps up and nothing passes a shut valve. */
const steady = phase => phase;                                                                                         // the veins bring blood in, and the far arteries carry it off, without a pause
const filling = phase => phase < 0.13 ? 0.2 * smooth(0, 0.13, phase) : phase < 0.58 ? 0.2 : 0.2 + 0.8 * (1 - (1 - (phase - 0.58) / 0.42) ** 2);   // through the tricuspid and mitral valves: a rush as they open, and the atria's top-up last
const leaving = phase => smooth(0.19, 0.47, phase);                                                                     // through the pulmonary and aortic valves
/* how much blood lies between one place and the next when their clocks agree, in beats' worth: the vein, the atrium, the ventricle, the artery */
const HELD = [0.8, 0.6, 1.3, 1.2], QUEUE = HELD.reduce((sum, held) => sum + held, 0);
function layBlood(places, time, cycle) {
  const beats = time / cycle, whole = Math.floor(beats), phase = beats - whole;
  const clocks = [steady(phase), steady(phase), filling(phase), leaving(phase), steady(phase)];
  const reached = [0, 0, 0, 0, 0];   // which drop of the queue is at each place now
  for (let k = 0, held = 0; k < 5; held += HELD[k++]) reached[k] = held - whole - clocks[k];
  return label => {
    const drop = reached[0] + ((((label * QUEUE - reached[0]) % QUEUE) + QUEUE) % QUEUE);
    let k = 0; while (k < 3 && drop >= reached[k + 1]) k++;
    return places[k] + (places[k + 1] - places[k]) * (drop - reached[k]) / (reached[k + 1] - reached[k]);
  };
}
/* the three moments of a beat, as the line under the heart names them */
const MOMENTS = ['Atria squeeze', 'Ventricles squeeze', 'Heart refills'];
/* how wide the blood runs, in cm from the middle of its stream, at each stop on its way */
const WIDTH = { vessel: 0.6, atrium: 1.45, inflow: 0.95, ventricle: 1.35, outflow: 0.8, end: 0.7 };
const exact = name => new RegExp(`^${name}$`);

export const heart = {
  cycle: CYCLE * 1000, moments: MOMENTS, stop: 'Stop the heart beating', start: 'Set the heart beating', context: 0.4,
  /* the walls as glass, so the blood shows; the cavities in the colour of their blood */
  look(name) {
    if (/^Wall of /.test(name)) return { opacity: 0.22 };
    if (/^Cavity of right/.test(name)) return { colour: SPENT, opacity: 0.62 };
    if (/^Cavity of left/.test(name)) return { colour: FRESH, opacity: 0.62 };
    return null;
  },
  /* and cut open (a step of its story): the walls solid, with a flat face where they are cut; the chambers emptied but
     for their blood; the valves, their cords and the muscles that hold them whole, never sliced */
  opened(name) {
    if (/^Wall of /.test(name)) return { opacity: 1, cap: true };
    if (/^Cavity of /.test(name)) return { opacity: 0 };
    const valve = /(tricuspid|mitral|pulmonary|aortic) valve$/i.exec(name)?.[1].toLowerCase();
    if (valve) return { opacity: 1, whole: valve, lead: true };
    const holds = /papillary muscle of (right|left) ventricle$/i.exec(name)?.[1].toLowerCase();   // the muscles a valve's cords are tied to go with the valve
    return holds ? { opacity: 1, whole: holds === 'right' ? 'tricuspid' : 'mitral' } : null;
  },
  build(kit) {
    const valves = kit.find(/leaflet of (tricuspid|mitral) valve$|cusp of (pulmonary|aortic) valve$/i);
    const base = kit.centre(valves);   // the plane of the four valves: the ventricles shorten toward it
    const riding = RIDES_THE_WALL.flatMap(key => (kit.has(key) ? kit.entry(key) : []));
    const movers = [];
    for (const part of kit.own) {
      const kind = riding.includes(part) ? 2 : MOVES.find(([pattern]) => pattern.test(part.name))?.[1];
      if (!kind) continue;
      /* an atrium's wall shrinks about its cavity's middle, the ventricles' wall toward the valves, a ventricle's cavity toward a point between */
      const centre = kit.centre(part);
      movers.push({ part, kind, pivot: kind === 2 ? base : kind === 1 ? kit.centre(kit.one(exact(part.name.replace('Wall', 'Cavity')))) : kind === 4 ? centre.lerp(base, 0.45) : centre });
    }
    const streams = STREAMS.map(({ colour, through }) => {
      const points = [], widths = [], marks = {};
      for (const stop of through) {
        if (typeof stop === 'string') { points.push(kit.centre(kit.one(exact(stop)))); widths.push(WIDTH.vessel); }
        else if (stop.atrium) { marks.atrium = points.length; points.push(kit.centre(kit.one(exact(stop.atrium)))); widths.push(WIDTH.atrium); }
        else if (stop.ventricle) { points.push(kit.centre(kit.one(exact(stop.ventricle))).lerp(base, -0.55)); widths.push(WIDTH.ventricle); }   // down toward the apex before it turns for the way out
        else { const which = stop.inflow ? 'inflow' : 'outflow'; marks[which] = points.length; points.push(kit.centre(valves.filter(part => stop[which].test(part.name)))); widths.push(WIDTH[which]); }
      }
      const last = points.at(-1), before = points.at(-2);
      points.push(last.clone().add(last.clone().sub(before).setLength(2.5))); widths.push(WIDTH.end);
      const line = kit.curve(points), stops = points.map(point => line.whereOf(point));
      const places = [0, (stops[marks.atrium - 1] + stops[marks.atrium]) / 2, stops[marks.inflow], stops[marks.outflow], 1];   // the vein's start, the atrium's mouth, the two valves, the end
      const width = where => { const found = stops.findIndex(stop => stop >= where), k = found < 0 ? stops.length - 1 : Math.max(1, found); return widths[k - 1] + (widths[k] - widths[k - 1]) * smooth(stops[k - 1], stops[k], where); };
      return { curve: line.curve, colour, count: 2400, size: 0.13, spread: 1, width, swirl: 1.1, strength: 0.7, lay: (phase, time) => layBlood(places, time, CYCLE) };
    });
    return { movers, base, valves: VALVES.map(valve => modelValve(kit, valve)), streams };
  },
  step(rig, phase, act) {
    const beat = beatAt(phase), squeeze = [0, beat.atria, beat.ventricles, beat.atria, beat.ventricles];
    for (const { part, kind, pivot } of rig.movers) act.rigid(part, { pivot, scale: 1 - squeeze[kind] * SQUEEZE[kind] });
    for (const valve of rig.valves) valve.pose(valve.inflow ? beat.inflow : beat.outflow, rig.base, beat.ventricles * SQUEEZE[2]);   // the papillary muscles ride the ventricles' wall
    return { caption: MOMENTS[beat.moment], moment: beat.moment };
  },
  sounds: [[FIRST_SOUND, play => play.thump(58, 0.13, 0.5)], [SECOND_SOUND, play => play.thump(74, 0.09, 0.36)]],
};
