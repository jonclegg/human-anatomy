// The beating heart: what moves, when, and where the blood goes.
// One cycle, slowed to about 46 beats a minute so each step can be followed:
//   0.00-0.13  the atria squeeze and top up the ventricles
//   0.14       the tricuspid and mitral valves shut (the first heart sound)
//   0.19-0.47  the ventricles squeeze, the pulmonary and aortic valves are open, blood leaves
//   0.48       the pulmonary and aortic valves shut (the second heart sound)
//   0.58-1.00  the heart relaxes, the tricuspid and mitral valves open, and it refills
import { smooth, SPENT, FRESH } from './shared.mjs';
const FIRST_SOUND = 0.14, SECOND_SOUND = 0.48, CYCLE = 1.3;   // CYCLE: one beat, in seconds
export function beatAt(phase) {
  return {
    atria: phase < 0.13 ? Math.sin(Math.PI * phase / 0.13) ** 2 : 0,           // how far the atria are squeezed, 0 to 1
    ventricles: smooth(0.14, 0.27, phase) * (1 - smooth(0.42, 0.57, phase)),    // and the ventricles
    inflowOpen: phase < 0.13 || phase > 0.58,                                   // tricuspid and mitral
    outflowOpen: phase > 0.19 && phase < 0.47,                                  // pulmonary and aortic
    moment: phase < 0.14 ? 0 : phase < 0.5 ? 1 : 2,
  };
}
/* How a structure moves: 1 an atrium's wall, 2 the ventricles' wall and what rides on it, 3 an atrium's cavity,
   4 a ventricle's cavity. Each shrinks toward a pivot by its own share: a cavity far more than a wall. */
const MOVES = [[/^Wall of (left|right) atrium$/, 1], [/^Wall of ventricle$|papillary muscle/i, 2], [/^Cavity of (left|right) atrium$/, 3], [/^Cavity of (left|right) ventricle$/, 4]];
const SQUEEZE = [0, 0.07, 0.09, 0.2, 0.26];
const RIDES_THE_WALL = ['heartLeftCoronary', 'heartAnteriorInterventricular', 'heartCircumflex', 'heartRightCoronary', 'cardiacVeins'];
const INFLOW_VALVE = /leaflet of (tricuspid|mitral) valve$/i, OUTFLOW_VALVE = /cusp of (pulmonary|aortic) valve$/i;
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
    return { movers, valves: valves.map(part => ({ part, inflow: INFLOW_VALVE.test(part.name) })), streams };
  },
  step(rig, phase, act) {
    const beat = beatAt(phase), squeeze = [0, beat.atria, beat.ventricles, beat.atria, beat.ventricles];
    for (const { part, kind, pivot } of rig.movers) act.rigid(part, { pivot, scale: 1 - squeeze[kind] * SQUEEZE[kind] });
    /* a valve shows solid when shut and faint when open */
    for (const { part, inflow } of rig.valves) act.fade(part, (inflow ? beat.inflowOpen : beat.outflowOpen) ? 0.18 : 1);
    return { caption: MOMENTS[beat.moment], moment: beat.moment };
  },
  sounds: [[FIRST_SOUND, play => play.thump(58, 0.13, 0.5)], [SECOND_SOUND, play => play.thump(74, 0.09, 0.36)]],
};
