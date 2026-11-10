// The beating heart: what moves, when, and where the blood goes.
// One cycle, slowed to about 46 beats a minute so each step can be followed:
//   0.00-0.13  the atria squeeze and top up the ventricles
//   0.14       the tricuspid and mitral valves shut (the first heart sound)
//   0.19-0.47  the ventricles squeeze, the pulmonary and aortic valves are open, blood leaves
//   0.48       the pulmonary and aortic valves shut (the second heart sound)
//   0.58-1.00  the heart relaxes, the tricuspid and mitral valves open, and it refills
import { smooth, SPENT, FRESH } from './shared.mjs';
const FIRST_SOUND = 0.14, SECOND_SOUND = 0.48;
export function beatAt(phase) {
  return {
    atria: phase < 0.13 ? Math.sin(Math.PI * phase / 0.13) ** 2 : 0,           // how far the atria are squeezed, 0 to 1
    ventricles: smooth(0.14, 0.27, phase) * (1 - smooth(0.42, 0.57, phase)),    // and the ventricles
    inflowOpen: phase < 0.13 || phase > 0.58,                                   // tricuspid and mitral
    outflowOpen: phase > 0.19 && phase < 0.47,                                  // pulmonary and aortic
    caption: phase < 0.14 ? 'The atria squeeze: the ventricles are topped up' : phase < 0.5 ? 'The ventricles squeeze: blood leaves for the lungs and the body' : 'The heart relaxes and refills',
  };
}
/* How a structure moves: 1 an atrium's wall, 2 the ventricles' wall and what rides on it, 3 an atrium's cavity,
   4 a ventricle's cavity. Each shrinks toward a pivot by its own share: a cavity far more than a wall. */
const MOVES = [[/^Wall of (left|right) atrium$/, 1], [/^Wall of ventricle$|papillary muscle/i, 2], [/^Cavity of (left|right) atrium$/, 3], [/^Cavity of (left|right) ventricle$/, 4]];
const SQUEEZE = [0, 0.07, 0.09, 0.2, 0.26];
const RIDES_THE_WALL = ['heartLeftCoronary', 'heartAnteriorInterventricular', 'heartCircumflex', 'heartRightCoronary', 'cardiacVeins'];
const INFLOW_VALVE = /leaflet of (tricuspid|mitral) valve$/i, OUTFLOW_VALVE = /cusp of (pulmonary|aortic) valve$/i;
/* The two streams, as the structures each passes through, in order; a valve is where its stream waits */
const STREAMS = [
  { colour: SPENT, through: ['Superior vena cava', 'Cavity of right atrium', { inflow: /tricuspid/i }, { ventricle: 'Cavity of right ventricle' }, { outflow: /pulmonary/i }, 'Pulmonary trunk'] },
  { colour: FRESH, through: ['Left superior pulmonary vein', 'Cavity of left atrium', { inflow: /mitral/i }, { ventricle: 'Cavity of left ventricle' }, { outflow: /aortic/i }, 'Ascending aorta', 'Arch of aorta'] },
];
/* how fast a drop of blood moves along its stream (shares of the stream a second), by where it is and the moment of the beat */
function flowAt(where, inflowAt, outflowAt, beat) {
  if (where < inflowAt) return beat.inflowOpen ? 0.3 : 0.07;
  if (where < outflowAt) return beat.outflowOpen ? 0.95 : beat.inflowOpen ? 0.22 : 0.02;
  return beat.outflowOpen ? 1.1 : 0.25;
}
const exact = name => new RegExp(`^${name}$`);

export const heart = {
  cycle: 1300, stop: 'Stop the heart beating', start: 'Set the heart beating', context: 0.4,
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
    const now = { beat: beatAt(0) };   // this moment of the beat, worked out once a frame (in step) for every drop
    const streams = STREAMS.map(({ colour, through }) => {
      const points = [], marks = {};
      for (const stop of through) {
        if (typeof stop === 'string') points.push(kit.centre(kit.one(exact(stop))));
        else if (stop.ventricle) points.push(kit.centre(kit.one(exact(stop.ventricle))).lerp(base, -0.55));   // down toward the apex before it turns for the way out
        else { marks[stop.inflow ? 'inflow' : 'outflow'] = points.length; points.push(kit.centre(valves.filter(part => (stop.inflow || stop.outflow).test(part.name)))); }
      }
      const last = points.at(-1), before = points.at(-2);
      points.push(last.clone().add(last.clone().sub(before).setLength(2.5)));
      const line = kit.curve(points), inflowAt = line.whereOf(points[marks.inflow]), outflowAt = line.whereOf(points[marks.outflow]);
      return { curve: line.curve, colour, count: 320, size: 0.8, spread: 0.33, speed: where => flowAt(where, inflowAt, outflowAt, now.beat),
        gates: [{ at: inflowAt, open: () => now.beat.inflowOpen }, { at: outflowAt, open: () => now.beat.outflowOpen }] };
    });
    return { now, movers, valves: valves.map(part => ({ part, inflow: INFLOW_VALVE.test(part.name) })), streams };
  },
  step(rig, phase, act) {
    const beat = rig.now.beat = beatAt(phase), squeeze = [0, beat.atria, beat.ventricles, beat.atria, beat.ventricles];
    for (const { part, kind, pivot } of rig.movers) act.rigid(part, { pivot, scale: 1 - squeeze[kind] * SQUEEZE[kind] });
    /* a valve shows solid when shut and faint when open */
    for (const { part, inflow } of rig.valves) act.fade(part, (inflow ? beat.inflowOpen : beat.outflowOpen) ? 0.18 : 1);
    return { caption: beat.caption };
  },
  sounds: [[FIRST_SOUND, play => play.thump(58, 0.13, 0.5)], [SECOND_SOUND, play => play.thump(74, 0.09, 0.36)]],
};
