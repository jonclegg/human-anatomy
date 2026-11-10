// Motions: what a close-up does while you watch. One per close-up, under the close-up's id; app.mjs runs them.
//
// A motion:
//   cycle           how long one round takes, in ms
//   stop, start     the words on the switch that stops and starts it
//   look(name)      how a part of the close-up looks while it runs: { colour, opacity }, either may be left out
//   context, skin   how solid the faint context and the skin are while it runs, as a share of what they usually are
//   build(kit)      measures the body once and returns the rig: whatever step needs, plus streams (the specs of what
//                   flows: see makeStream in app.mjs) and sounds, if they depend on the body
//   step(rig, phase, act, time)   sets this moment: phase runs 0 to 1 over the cycle, time is seconds since it began.
//                   act.rigid / act.bend / act.held move a part, act.fade and act.glow change its look (app.mjs);
//                   returns { caption }
//   sounds          [[phase, play => ...]]: what sounds as the cycle passes each moment
import { heart } from './motions/heart.mjs';
import * as chest from './motions/chest.mjs';
import * as head from './motions/head.mjs';
import * as limbs from './motions/limbs.mjs';
import * as pelvis from './motions/pelvis.mjs';
import { REGIONS } from './closeups.mjs';

export const MOTIONS = { heart, ...chest, ...head, ...limbs, ...pelvis };
for (const key of Object.keys(MOTIONS)) if (!REGIONS[key]) throw new Error(`a motion is called ${key}, which is no close-up`);
