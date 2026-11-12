// The limbs and the back: nothing here moves. A joint's story lights the muscles that work it, in turn, while its
// steps say what each does. (The parts are scans of one still body: bending them made stray tendons and bones, and
// showed no more than the lit muscle does.) See ../motions.mjs for the format.
import { light } from './shared.mjs';

const working = phase => ({ going: Math.max(0, Math.sin(2 * Math.PI * phase)), returning: Math.max(0, -Math.sin(2 * Math.PI * phase)) });   // the two halves of a round: one group of muscles, then the other
/* a region that lights one set of parts through the first half of its round and another through the second */
const turns = ({ cycle, watch, first, second, captions }) => ({
  cycle, skin: 0, watch,
  build: kit => ({ first: first.flatMap(key => kit.entry(key)), second: second.flatMap(key => kit.entry(key)) }),
  step(rig, phase, act) {
    const { going, returning } = working(phase);
    light(act, rig.first, 0.75 * going); light(act, rig.second, 0.75 * returning);
    return { caption: captions[phase < 0.5 ? 0 : 1] };
  },
});

export const shoulder = turns({ cycle: 5200, watch: 'how the shoulder lifts the arm', first: ['shoulderDeltoid', 'shoulderSupraspinatus'], second: ['shoulderInfraspinatus', 'shoulderTeresMinor', 'shoulderSubscapularis'],
  captions: ['Lifting the arm: supraspinatus and deltoid work together, supraspinatus helping most at the start', 'The cuff muscles hold the ball of the humerus in its shallow socket. The shoulder moves more than any other joint and dislocates more easily'] });
export const elbow = turns({ cycle: 4600, watch: 'how the elbow bends', first: ['elbowBiceps', 'elbowBrachialis'], second: ['elbowTriceps'],
  captions: ['Bending: biceps and brachialis, at the front, pull the forearm up', 'Straightening: triceps, at the back, pulls it down. A muscle can only pull, so they work in pairs'] });
export const hip = turns({ cycle: 5000, watch: 'how the hip swings the thigh', first: ['hipIliopsoas'], second: ['hipGluteusMaximus'],
  captions: ['Lifting the thigh: iliopsoas, which runs from the spine and the hip bone to the femur', 'Moving the thigh back: gluteus maximus. You use it to climb stairs and to stand up from a chair'] });
export const knee = turns({ cycle: 4800, watch: 'how the knee bends', first: ['kneeHamstrings'], second: ['kneeQuadriceps'],
  captions: ['Bending: the hamstrings, at the back of the thigh, pull the shin back', 'Straightening: the quadriceps pull through the kneecap, which works as a pulley and makes them up to a third stronger'] });
export const foot = turns({ cycle: 3600, watch: 'how the ankle moves the foot', first: ['footCalcanealTendon'], second: ['footDorsalMuscles'],
  captions: ['Pushing off: the calf muscles pull the heel up by the Achilles tendon, the strongest tendon in the body', 'Lifting the toes, so that they clear the ground on the next step'] });
export const hand = turns({ cycle: 6000, watch: 'what moves the fingers', first: ['handFingerBones'], second: ['handThenar', 'handHypothenar'],
  captions: ['Making a fist: the fingers are curled by tendons from muscles up in the forearm', 'The fingers contain tendons and bone, and no muscles'] });
/* the back keeps its skin: it is seen in the whole trunk */
export const spine = { ...turns({ cycle: 9000, watch: 'how the spine bends', first: ['discs'], second: ['thoracicVertebrae', 'lumbarVertebrae'],
  captions: ['Bending forward: each disc allows a few degrees, and there are 23 discs', 'Bending sideways: small joints at the back of each vertebra guide the movement and stop it going too far'] }), skin: undefined };
