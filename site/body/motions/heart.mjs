// The beating heart: what moves, when, and where the blood goes. The app (app.mjs) draws it in the heart close-up.
// One cycle, slowed to about 46 beats a minute so each step can be followed:
//   0.00-0.13  the atria squeeze and top up the ventricles
//   0.14       the tricuspid and mitral valves shut (the first heart sound)
//   0.19-0.47  the ventricles squeeze, the pulmonary and aortic valves are open, blood leaves
//   0.48       the pulmonary and aortic valves shut (the second heart sound)
//   0.58-1.00  the heart relaxes, the tricuspid and mitral valves open, and it refills
export const CYCLE_MS = 1300;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const FIRST_SOUND = 0.14, SECOND_SOUND = 0.48;
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
   4 a ventricle's cavity (the shader shrinks each toward a pivot by its own share: a cavity far more than a wall) */
const MOVES = [[/^Wall of (left|right) atrium$/, 1], [/^Wall of ventricle$|papillary muscle/i, 2], [/^Cavity of (left|right) atrium$/, 3], [/^Cavity of (left|right) ventricle$/, 4]];
export const RIDES_THE_WALL = ['heartLeftCoronary', 'heartAnteriorInterventricular', 'heartCircumflex', 'heartRightCoronary', 'cardiacVeins'];   // close-up entries
export const moveOf = name => MOVES.find(([pattern]) => pattern.test(name))?.[1] || 0;
export const INFLOW_VALVE = /leaflet of (tricuspid|mitral) valve$/i, OUTFLOW_VALVE = /cusp of (pulmonary|aortic) valve$/i;

/* How it looks while it beats: the walls as glass, so the blood shows; the cavities in the colour of their blood */
const SPENT = '#2f6fe0', FRESH = '#e23a2e';
export function lookOf(name) {
  if (/^Wall of /.test(name)) return { opacity: 0.22 };
  if (/^Cavity of right/.test(name)) return { colour: SPENT, opacity: 0.62 };
  if (/^Cavity of left/.test(name)) return { colour: FRESH, opacity: 0.62 };
  return null;
}

/* The two streams, as the structures each passes through, in order; a valve is where its stream waits */
export const STREAMS = [
  { colour: SPENT, through: ['Superior vena cava', 'Cavity of right atrium', { inflow: /tricuspid/i }, { ventricle: 'Cavity of right ventricle' }, { outflow: /pulmonary/i }, 'Pulmonary trunk'] },
  { colour: FRESH, through: ['Left superior pulmonary vein', 'Cavity of left atrium', { inflow: /mitral/i }, { ventricle: 'Cavity of left ventricle' }, { outflow: /aortic/i }, 'Ascending aorta', 'Arch of aorta'] },
];
/* how fast a drop of blood moves along its stream (shares of the stream a second), by where it is and the moment of the beat */
export function flowAt(where, inflowAt, outflowAt, beat) {
  if (where < inflowAt) return beat.inflowOpen ? 0.3 : 0.07;
  if (where < outflowAt) return beat.outflowOpen ? 0.95 : beat.inflowOpen ? 0.22 : 0.02;
  return beat.outflowOpen ? 1.1 : 0.25;
}
