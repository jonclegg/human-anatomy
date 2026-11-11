// Motions of the limbs and back: each joint doing what it does, with the muscles that do it lit as they work.
// See ../motions.mjs for the format. The close-ups are of the right limbs; a side is read from the bones, not assumed.
import { swell, smooth, during, light, joint, flex, isBone, ARM, LEG } from './shared.mjs';

const working = phase => ({ going: Math.max(0, Math.sin(2 * Math.PI * phase)), returning: Math.max(0, -Math.sin(2 * Math.PI * phase)) });   // the two halves of a swing: out, and back

/* ---------- The shoulder: the arm lifted out to the side ---------- */
export const shoulder = {
  cycle: 5200, skin: 0, watch: 'how the shoulder lifts the arm',
  build(kit) {
    const { V } = kit, bone = kit.one(/humerus$/i, kit.own), side = Math.sign(bone.centre[0]), outward = V(side, 0, 0), down = V(0, -1, 0);
    return {
      /* what hangs from the joint lies down and out from it: the ribs, below but inboard, stay where they are */
      joint: joint(kit, { limb: ARM, pivot: kit.end(bone, V(0, 1, 0), 3), along: V(side * 0.75, -0.66, 0).normalize(), width: 4, bones: part => (/humerus|radius|ulna/i.test(part.name) ? 1 : 0) }),
      axis: kit.swing(down, outward), lifters: [...kit.entry('shoulderDeltoid'), ...kit.entry('shoulderSupraspinatus')], cuff: ['shoulderInfraspinatus', 'shoulderTeresMinor', 'shoulderSubscapularis'].flatMap(key => kit.entry(key)),
    };
  },
  step(rig, phase, act) {
    flex(act, rig.joint, rig.axis, 62 * swell(phase));
    const { going, returning } = working(phase);
    light(act, rig.lifters, 0.7 * going); light(act, rig.cuff, 0.6 * returning);
    return { caption: phase < 0.5 ? 'Lifting the arm: supraspinatus and deltoid work together, supraspinatus helping most at the start' : 'The cuff muscles hold the ball of the humerus in its shallow socket. The shoulder moves more than any other joint and dislocates more easily' };
  },
};

/* ---------- The elbow: bent and straightened ---------- */
export const elbow = {
  cycle: 4600, skin: 0, watch: 'how the elbow bends',
  build(kit) {
    const { V } = kit, bone = kit.one(/humerus$/i, kit.own), down = V(0, -1, 0);
    return { joint: joint(kit, { limb: ARM, pivot: kit.end(bone, down, 2), along: down, width: 4 }), axis: V(-1, 0, 0), benders: [...kit.entry('elbowBiceps'), ...kit.entry('elbowBrachialis')], straightener: kit.entry('elbowTriceps') };
  },
  step(rig, phase, act) {
    flex(act, rig.joint, rig.axis, 95 * swell(phase));
    const { going, returning } = working(phase);
    light(act, rig.benders, 0.75 * going); light(act, rig.straightener, 0.75 * returning);
    return { caption: phase < 0.5 ? 'Bending: biceps and brachialis, at the front, pull the forearm up' : 'Straightening: triceps, at the back, pulls it down. A muscle can only pull, so they work in pairs' };
  },
};

/* ---------- The hip: the thigh swung forward and back ---------- */
export const hip = {
  cycle: 5000, skin: 0, watch: 'how the hip swings the thigh',
  build(kit) {
    const { V } = kit, bone = kit.one(/femur$/i, kit.own), side = Math.sign(bone.centre[0]), down = V(0, -1, 0);
    return {
      joint: joint(kit, { limb: LEG, pivot: kit.end(bone, V(-side * 0.7, 0.7, 0).normalize(), 2.5), along: down, width: 5, bones: part => (/femur|patella|tibia|fibula/i.test(part.name) ? 1 : 0) }),   // the ball at the top of the femur, on its inner side
      axis: V(-1, 0, 0), lifter: kit.entry('hipIliopsoas'), driver: kit.entry('hipGluteusMaximus'),
    };
  },
  step(rig, phase, act) {
    flex(act, rig.joint, rig.axis, 48 * swell(phase) - 8);
    const { going, returning } = working(phase);
    light(act, rig.lifter, 0.75 * going); light(act, rig.driver, 0.75 * returning);
    return { caption: phase < 0.5 ? 'Lifting the thigh: iliopsoas, which runs from the spine and the hip bone to the femur' : 'Moving the thigh back: gluteus maximus. You use it to climb stairs and to stand up from a chair' };
  },
};

/* ---------- The knee: bent and straightened ---------- */
export const knee = {
  cycle: 4800, skin: 0, watch: 'how the knee bends',
  build(kit) {
    const { V } = kit, bone = kit.one(/femur$/i, kit.own), down = V(0, -1, 0);
    return {
      /* the kneecap slides down its groove on the femur as the knee bends: it takes most of the turn */
      joint: joint(kit, { limb: LEG, pivot: kit.end(bone, down, 2.5).add(V(0, 0.6, -0.3)), along: down, width: 5, bones: part => (/patella/i.test(part.name) ? 0.7 : part.centre[1] < kit.end(bone, down, 2.5).y ? 1 : 0) }),
      axis: V(1, 0, 0), benders: kit.entry('kneeHamstrings'), straighteners: kit.entry('kneeQuadriceps'),
    };
  },
  step(rig, phase, act) {
    flex(act, rig.joint, rig.axis, 78 * swell(phase));
    const { going, returning } = working(phase);
    light(act, rig.benders, 0.75 * going); light(act, rig.straighteners, 0.75 * returning);
    return { caption: phase < 0.5 ? 'Bending: the hamstrings, at the back of the thigh, pull the shin back' : 'Straightening: the quadriceps pull through the kneecap, which works as a pulley and makes them up to a third stronger' };
  },
};

/* ---------- The foot: up on the toes, then toes up ---------- */
export const foot = {
  cycle: 3600, skin: 0, watch: 'how the ankle moves the foot',
  build(kit) {
    const { V } = kit, down = V(0, -1, 0);
    return { joint: joint(kit, { limb: LEG, pivot: kit.centre(kit.one(/talus$/i)).add(V(0, 0.6, 0)), along: down, width: 2, bones: part => (/tibia|fibula/i.test(part.name) ? 0 : 1) }), axis: V(1, 0, 0), heelCord: kit.entry('footCalcanealTendon'), lifters: kit.entry('footDorsalMuscles') };
  },
  step(rig, phase, act) {
    const point = Math.sin(2 * Math.PI * phase);
    flex(act, rig.joint, rig.axis, 20 * point + 7);
    light(act, rig.heelCord, 0.8 * Math.max(0, point)); light(act, rig.lifters, 0.6 * Math.max(0, -point));
    return { caption: point > 0 ? 'Pushing off: the calf muscles pull the heel up by the Achilles tendon, the strongest tendon in the body' : 'Lifting the toes, so that they clear the ground on the next step' };
  },
};

/* ---------- The hand: a fist, finger by finger ---------- */
const FINGERS = ['little', 'ring', 'middle', 'index'], CURL = [72, 96, 58];   // the most each knuckle bends, from the hand outward
export const hand = {
  cycle: 6000, skin: 0, watch: 'how the hand makes a fist',
  build(kit) {
    const { V } = kit, bone = (segment, digit) => kit.one(new RegExp(`^${segment} phalanx of (left|right) ${digit}$`, 'i'), kit.own);
    const palm = kit.centre(kit.entry('handPalmarAponeurosis')).sub(kit.centre(kit.entry('handMetacarpals')));   // from the back of the hand toward the palm
    const digit = (bones, toward) => {
      const along = kit.centre(bones.at(-1)).sub(kit.centre(bones[0])).normalize(), axis = kit.swing(along, toward.clone().addScaledVector(along, -toward.dot(along)).normalize());
      return { axis, bones: bones.map(part => ({ part, knuckle: kit.end(part, along.clone().negate(), 0.35) })) };
    };
    const fingers = FINGERS.map(name => digit(['Proximal', 'Middle', 'Distal'].map(segment => bone(segment, `${name} finger`)), palm));
    const across = kit.centre(bone('Proximal', 'little finger')).sub(kit.centre(bone('Proximal', 'index finger'))).normalize();   // the thumb closes across the palm, toward the little finger
    /* the thumb folds from its base: the bone in the palm swings across first, and carries the two beyond it */
    const thumb = digit([kit.one(/^(left|right) first metacarpal bone$/i, kit.own), ...['Proximal', 'Distal'].map(segment => bone(segment, 'thumb'))], palm.clone().normalize().add(across));
    /* what else reaches into the fingers (their nerves and arteries, and the sheaths of the palm's tough sheet) is not carried with the bones */
    const knuckles = kit.centre(fingers.map(finger => finger.bones[0].part)), outward = kit.centre(fingers.map(finger => finger.bones[2].part)).sub(knuckles).normalize();
    const reach = part => Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map(corner => V(part[corner & 1 ? 'max' : 'min'][0], part[corner & 2 ? 'max' : 'min'][1], part[corner & 4 ? 'max' : 'min'][2]).sub(knuckles).dot(outward)));
    return {
      V, turn: kit.turn, fingers, thumb, beyond: kit.own.filter(part => !isBone(part) && reach(part) > 1.5),
      /* of the faint context: the long tendons from the forearm, which would stay straight where the fingers were, give way too, and what is no part of the arm (the thigh bone the hand hangs beside) is not shown */
      tendons: kit.context.filter(part => !isBone(part) && reach(part) > 1.5), apart: kit.context.filter(part => isBone(part) && !ARM.test(part.name)),
    };
  },
  step(rig, phase, act) {
    const fist = during(phase, 0.05, 0.95, 0.4);
    const curl = ({ axis, bones }, amount, most) => {
      /* each bone turns at its own knuckle, and is carried by every knuckle before it */
      let turn = rig.turn(axis, 0), carry = point => point.clone();
      bones.forEach(({ part, knuckle }, k) => {
        const hinge = carry(knuckle), before = turn.clone(); turn = before.clone().multiply(rig.turn(axis, most[k] * amount));
        const total = turn.clone();
        act.rigid(part, { pivot: knuckle, turn: total, shift: hinge.clone().sub(knuckle) });
        carry = point => hinge.clone().add(point.clone().sub(knuckle).applyQuaternion(total));
      });
    };
    rig.fingers.forEach((finger, k) => curl(finger, smooth(0.1 * k, 0.7 + 0.1 * k, fist), CURL));   // the little finger leads
    curl(rig.thumb, smooth(0.45, 1, fist), [32, 38, 55]);
    for (const part of rig.beyond) act.fade(part, 1 - smooth(0, 0.25, fist));   // they give way while the hand closes
    for (const part of rig.tendons) act.dim(part, 1 - smooth(0, 0.25, fist));
    for (const part of rig.apart) act.fade(part, 0);
    return { caption: phase < 0.5 ? 'Making a fist: the fingers are curled by tendons from muscles up in the forearm' : 'The fingers contain tendons and bone, and no muscles' };
  },
};

/* ---------- The spine: bent forward, then to each side ---------- */
export const spine = {
  cycle: 9000, watch: 'how the spine bends',
  build(kit) {
    const { V } = kit, up = V(0, 1, 0), base = kit.end(kit.one(/^Sacrum$/), up, 1.5), length = kit.centre(kit.one(/^Atlas$/)).y - base.y;
    return {
      turn: kit.turn, base, up, length, forward: V(1, 0, 0), sideways: V(0, 0, 1), none: kit.turn(up, 0), partly: kit.turn(up, 0),
      /* a vertebra turns whole, by how far up it is; what runs the length of the spine (the cord, the ligaments, the long muscles) bends with it */
      movers: [...kit.shown, ...kit.skin].map(part => ({ part, share: isBone(part) ? smooth(0, length, part.centre[1] - base.y) : undefined })).filter(({ part, share }) => share !== 0 && part.max[1] > base.y),   // the skin too: the whole trunk leans
    };
  },
  step(rig, phase, act) {
    const forward = 30 * during(phase, 0, 0.5, 0.2), sideways = 20 * during(phase, 0.5, 1, 0.06) * Math.sin(2 * Math.PI * (phase - 0.5) / 0.5);
    const whole = rig.turn(rig.forward, forward).multiply(rig.turn(rig.sideways, sideways));
    for (const { part, share } of rig.movers) {
      if (share === undefined) act.bend(part, { pivot: rig.base, turn: whole, along: rig.up, from: 0, to: rig.length });
      else act.rigid(part, { pivot: rig.base, turn: rig.partly.slerpQuaternions(rig.none, whole, share) });   // a vertebra takes its share of the whole bow
    }
    return { caption: phase < 0.5 ? 'Bending forward: each disc allows a few degrees, and there are 23 discs' : 'Bending sideways: small joints at the back of each vertebra guide the movement and stop it going too far' };
  },
};
