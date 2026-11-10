// Motions of the head and neck: a thought crossing the brain, the fluid inside it, the eye at work, the skull drawn
// apart, the jaw chewing, the face making expressions, a swallow, the voice, and the cranial nerves one by one.
// See ../motions.mjs for the format.
import { smooth, swell, during, light, AIR, FOOD, SIGNAL } from './shared.mjs';

/* ---------- The brain: seeing something and reaching for it ---------- */
const THOUGHT = [
  ['occipitalLobe', 'Light from the eyes arrives at the back of the brain, in the occipital lobe: you see'],
  ['temporalLobe', 'The temporal lobe works out what it is you are looking at'],
  ['frontalLobe', 'The frontal lobe decides what to do about it'],
  ['brainPrecentralGyrus', 'The motor strip sends the order down through the brainstem to the muscles'],
];
export const brain = {
  cycle: 10000, stop: 'Stop the signal', start: 'Set a signal running',
  build(kit) {
    const { V } = kit, left = pattern => kit.centre(kit.one(pattern)), box = kit.box(kit.own);
    const stops = [left(/^Left occipital lobe$/), left(/^Left fusiform gyrus$/), left(/^Left middle frontal gyrus$/), left(/^Left precentral gyrus$/)];
    const stem = [kit.centre(kit.entry('brainMidbrain')), kit.centre(kit.entry('brainPons')), kit.centre(kit.entry('brainMedulla'))];
    const eye = V(3, stem[0].y - 1, box.max.z + 1.5);
    const way = kit.curve([eye, eye.clone().lerp(stops[0], 0.5), ...stops, ...stem, stem[2].clone().add(V(0, -2.5, 0))]);
    const reached = stops.map(stop => way.whereOf(stop));
    return {
      reached, stages: THOUGHT.map(([key]) => kit.entry(key)), stem: ['brainMidbrain', 'brainPons', 'brainMedulla'].flatMap(key => kit.entry(key)),
      streams: [{ curve: way.curve, colour: SIGNAL, count: 90, size: 1.0, spread: 0.12, packed: 0.1, place: phase => phase * 1.07 }],
      sounds: reached.map((at, k) => [at / 1.07, play => play.chime([523, 587, 659, 784][k], 0.05)]),
    };
  },
  step(rig, phase, act) {
    const head = phase * 1.07;
    /* each region lights as the signal reaches it, and fades as it moves on */
    rig.stages.forEach((parts, k) => light(act, parts, smooth(rig.reached[k] - 0.05, rig.reached[k], head) * (1 - smooth(rig.reached[k] + 0.08, rig.reached[k] + 0.2, head))));
    light(act, rig.stem, smooth(rig.reached[3] + 0.1, rig.reached[3] + 0.2, head));
    const at = rig.reached.findLastIndex(where => head >= where - 0.05);
    return { caption: at < 0 ? 'You notice something. What happens next takes about a quarter of a second' : THOUGHT[at][1] };
  },
};

/* ---------- Inside the brain: the fluid it floats in ---------- */
export const brainDeep = {
  cycle: 9000, stop: 'Stop the fluid', start: 'Set the fluid flowing',
  look: name => (/ventricle$|^Cerebral aqueduct$|^Interventricular foramen$/i.test(name) ? { colour: '#7fd4f0', opacity: 0.5 } : null),
  build(kit) {
    const { V } = kit, middle = pattern => kit.centre(kit.one(pattern));
    const third = middle(/^Third ventricle$/), duct = middle(/^Cerebral aqueduct$/), fourth = middle(/^Fourth ventricle$/), door = middle(/^Interventricular foramen$/);
    const streams = [/^Left lateral ventricle$/, /^Right lateral ventricle$/].map(pattern => {
      const chamber = kit.one(pattern), horn = kit.end(chamber, V(0, 0, -1), 1.5);
      return { curve: kit.curve([horn, kit.centre(chamber), kit.end(chamber, V(0, 0, 1), 2).lerp(door, 0.5), door, third, duct, fourth, fourth.clone().add(V(0, -1.5, -1))]).curve, colour: '#9be7ff', count: 110, size: 0.6, spread: 0.18, speed: () => 0.09 };
    });
    return { plexus: kit.entry('brainDeepChoroidPlexus'), streams };
  },
  step(rig, phase, act) {
    light(act, rig.plexus, 0.25 + 0.35 * swell(phase * 3 % 1));
    return { caption: phase < 0.5 ? 'The brain floats in a clear fluid, made by the choroid plexus, mostly in the two lateral ventricles: about half a litre a day' : 'It drains through the third ventricle and a narrow aqueduct to the fourth, then out to bathe the brain and the spinal cord' };
  },
};

/* ---------- The eye: light in, a signal out; then the muscles turn it ---------- */
const GLOBE = /cornea$|sclera$|^Anterior chamber|iris$|lens$|choroid$|corona ciliaris$|retina$|vitreous body$/i;
const AIMING = /rectus$|(inferior|superior) oblique$|optic nerve$/i;
export const eye = {
  cycle: 11000, stop: 'Stop the eye', start: 'Set the eye working',
  look: name => (/sclera$|choroid$|retina$|vitreous body$|corona ciliaris$/i.test(name) ? { opacity: 0.3 } : null),
  build(kit) {
    const { V } = kit, ball = kit.centre(kit.one(/vitreous body$/i)), front = kit.centre(kit.one(/cornea$/i)), lens = kit.centre(kit.one(/^(Left|Right) lens$/i));
    const forward = front.clone().sub(ball).normalize(), back = ball.clone().add(forward.clone().multiplyScalar(-1.05)), up = V(0, 1, 0);
    const nerve = kit.line(kit.find(/optic nerve$/i), { from: back, radius: 0.5 });
    const ray = lift => { const off = up.clone().multiplyScalar(lift); return { curve: kit.curve([front.clone().add(forward.clone().multiplyScalar(6)).add(off), front.clone().add(forward.clone().multiplyScalar(0.3)).add(off.clone().multiplyScalar(0.9)), lens.clone().add(off.clone().multiplyScalar(0.5)), back]).curve, colour: '#fff3b0', count: 60, size: 0.28, spread: 0.02, speed: () => 0.55, shown: phase => during(phase, 0, 0.5) }; };
    return {
      ball, up, turn: kit.turn, globe: kit.find(GLOBE), aiming: kit.find(AIMING), inward: kit.find(/medial rectus$/i), outward: kit.find(/lateral rectus$/i), retina: kit.find(/retina$/i),
      side: Math.sign(ball.x),   // which eye: its medial rectus turns it toward the nose
      streams: [ray(0.42), ray(0), ray(-0.42), { curve: kit.curve([back, ...nerve]).curve, colour: SIGNAL, count: 50, size: 0.55, spread: 0.06, speed: () => 0.5, shown: phase => during(phase, 0.05, 0.52) }],
    };
  },
  step(rig, phase, act) {
    const sweep = during(phase, 0.55, 1, 0.08) * Math.sin(2 * Math.PI * (phase - 0.55) / 0.45), turn = rig.turn(rig.up, 16 * sweep);
    for (const part of rig.globe) act.rigid(part, { pivot: rig.ball, turn });
    for (const part of rig.aiming) act.held(part, { pivot: rig.ball, turn, near: 1.25, far: 3 });
    /* turning toward +x is toward the nose for the right eye, away from it for the left */
    light(act, rig.inward, Math.max(0, -sweep * rig.side)); light(act, rig.outward, Math.max(0, sweep * rig.side));
    light(act, rig.retina, 0.5 * during(phase, 0.08, 0.5));
    return { caption: phase < 0.53 ? 'Light is bent by the cornea and focused by the lens onto the retina; the optic nerve carries the picture to the brain' : 'Six muscles aim the eye. Here two of them turn it: the medial rectus toward the nose, the lateral rectus away' };
  },
};

/* ---------- The skull: drawn apart along its seams, and put back ---------- */
export const skull = {
  cycle: 11000, stop: 'Keep the skull whole', start: 'Draw the skull apart',
  build(kit) {
    const { V } = kit, bones = kit.own.filter(part => !/tooth$|^Hyoid/i.test(part.name)), middle = kit.box(bones.filter(part => !/^Mandible$/.test(part.name))).getCenter(V(0, 0, 0));
    const jaw = kit.one(/^Mandible$/);
    const away = part => { const out = kit.centre(part).sub(middle); if (Math.abs(part.centre[0]) < 0.5) out.x = 0; return out.setLength(part === jaw ? 3.4 : 1.6 + 0.12 * out.length()); };
    const movers = bones.map(part => ({ part, away: away(part) }));
    /* each tooth goes with the bone it is rooted in */
    for (const tooth of kit.find(/tooth$/i)) {
      const holder = /lower/i.test(tooth.name) ? jaw : kit.one(tooth.centre[0] > 0 ? /^Left maxilla$/ : /^Right maxilla$/);
      movers.push({ part: tooth, away: movers.find(mover => mover.part === holder).away });
    }
    return { movers, nowhere: V(0, 0, 0), shift: V(0, 0, 0) };
  },
  step(rig, phase, act) {
    const apart = during(phase, 0.1, 0.9, 0.22);
    for (const { part, away } of rig.movers) act.rigid(part, { pivot: rig.nowhere, shift: rig.shift.copy(away).multiplyScalar(apart) });
    return { caption: apart < 0.5 ? 'The skull looks like one bone. It is 22, most of them locked together along wavy seams called sutures' : 'Drawn apart: 8 bones make the case round the brain and 14 the face. Only one of them, the jaw, moves' };
  },
};

/* the jaw's hinge: just in front of each ear, where the top of the jawbone sits in the skull */
function jawOf(kit) {
  const jaw = kit.one(/^Mandible$/), hinge = kit.end(jaw, kit.V(0, 1, 0), 1.2); hinge.x = 0;
  return { hinge, across: kit.V(1, 0, 0), turn: kit.turn, V: kit.V, lower: [jaw, ...kit.find(/lower.*tooth$|^Gingiva of lower jaw$/i, kit.shown)] };
}

/* ---------- The teeth: chewing ---------- */
export const teeth = {
  cycle: 2600, stop: 'Stop the chewing', start: 'Set the jaw chewing',
  build(kit) {
    const kind = pattern => kit.find(pattern);
    return { ...jawOf(kit), kinds: [kind(/incisor tooth$/i), kind(/canine tooth$/i), kind(/(premolar|molar) tooth$/i)] };
  },
  step(rig, phase, act, time) {
    const open = during(phase, 0.02, 0.7, 0.3), grind = 0.14 * Math.sin(2 * Math.PI * phase) * (1 - open);
    for (const part of rig.lower) act.rigid(part, { pivot: rig.hinge, turn: rig.turn(rig.across, 12 * open), shift: rig.V(grind, 0, 0) });
    const round = Math.floor(time / 2.6) % 3;   // a round of chewing for each kind of tooth
    light(act, rig.kinds[round], 0.55 * (1 - open));
    return { caption: ['The incisors, at the front, cut', 'The canines, the pointed ones, grip and tear', 'The premolars and molars, at the back, grind'][round] };
  },
  sounds: [[0.72, play => play.thump(150, 0.035, 0.12)]],
};

/* ---------- The face: six things it can do ---------- */
const FACES = [
  [['faceZygomaticus', 'faceRisorius', 'faceLevatorAnguliOris'], 'A smile: zygomaticus pulls the corners of the mouth up and out'],
  [['faceCorrugatorProcerus', 'faceDepressorAnguliOris'], 'A frown: corrugator draws the brows together, and the corners of the mouth are pulled down'],
  [['faceOccipitofrontalis'], 'Surprise: frontalis lifts the eyebrows and wrinkles the forehead'],
  [['faceOrbicularisOculi'], 'Eyes shut tight: orbicularis oculi, a ring of muscle round each eye'],
  [['faceOrbicularisOris', 'faceBuccinator'], 'A whistle: orbicularis oris purses the lips while buccinator holds the cheeks in'],
  [['faceMasseter', 'faceTemporalis'], 'A bite: masseter and temporalis close the jaw. They are chewing muscles, the strongest in the head'],
];
export const face = {
  cycle: 18000, stop: 'Stop the expressions', start: 'Set the face moving',
  build(kit) {
    return { faces: FACES.map(([keys]) => keys.filter(key => kit.has(key)).flatMap(key => kit.entry(key)).filter(part => !/aponeurosis|occipitalis|temporoparietalis/i.test(part.name)).map(part => ({ part, middle: kit.centre(part) }))) };
  },
  step(rig, phase, act) {
    const at = Math.min(FACES.length - 1, Math.floor(phase * FACES.length)), pull = during(phase * FACES.length - at, 0.05, 0.95, 0.25);
    /* a muscle that works shortens and thickens: here it draws in a little, and lights */
    for (const { part, middle } of rig.faces[at]) { act.rigid(part, { pivot: middle, scale: 1 - 0.08 * pull }); act.glow(part, 0.8 * pull); }
    return { caption: FACES[at][1] };
  },
};

/* ---------- The mouth and throat: one swallow ---------- */
export const mouth = {
  cycle: 5200, stop: 'Stop the swallowing', start: 'Set a swallow going',
  build(kit) {
    const { V } = kit, tongue = kit.one(/^Tongue$/), lid = kit.one(/^Epiglottis$/), palate = [...kit.entry('mouthSoftPalate'), ...kit.entry('mouthUvula')];
    const squeezers = [/superior pharyngeal constrictor$/i, /middle pharyngeal constrictor$/i, /inferior pharyngeal constrictor$/i].map(pattern => { const parts = kit.find(pattern); return { parts, middle: kit.centre(parts) }; });
    const top = kit.end(tongue, V(0, 1, 0), 0.8), throat = kit.centre(kit.one(/^Oropharynx$/)), lower = kit.centre(kit.one(/^Laryngopharynx$/));
    const way = kit.curve([top.clone().add(V(0, 0.4, 1.2)), top.clone().add(V(0, 0.5, -1)), throat, lower, lower.clone().add(V(0, -3, -0.3))]);
    return {
      V, turn: kit.turn, tongue, lid, hingeOfLid: kit.end(lid, V(0, -1, 0), 0.5), palate, squeezers,
      streams: [{ curve: way.curve, colour: FOOD, count: 50, size: 1.3, spread: 0.3, packed: 0.08, place: phase => 0.1 + 0.98 * smooth(0.18, 0.86, phase), shown: phase => during(phase, 0.02, 0.92) }],
    };
  },
  step(rig, phase, act) {
    const push = during(phase, 0.08, 0.5, 0.12), seal = during(phase, 0.2, 0.7, 0.1);
    act.rigid(rig.tongue, { pivot: rig.V(0, 0, 0), shift: rig.V(0, 0.45 * push, -0.5 * push) });
    for (const part of rig.palate) act.rigid(part, { pivot: rig.V(0, 0, 0), shift: rig.V(0, 0.35 * seal, -0.15 * seal) });
    act.rigid(rig.lid, { pivot: rig.hingeOfLid, turn: rig.turn(rig.V(1, 0, 0), -55 * seal) });
    rig.squeezers.forEach(({ parts, middle }, k) => { const squeeze = during(phase, 0.3 + 0.14 * k, 0.55 + 0.14 * k, 0.08); for (const part of parts) { act.rigid(part, { pivot: middle, scale: rig.V(1 - 0.12 * squeeze, 1, 1 - 0.12 * squeeze) }); act.glow(part, 0.6 * squeeze); } });
    return { caption: phase < 0.2 ? 'A swallow starts on purpose: the tongue pushes the mouthful back' : phase < 0.5 ? 'From here it runs itself. The soft palate lifts to seal off the nose, and the epiglottis folds down over the airway' : 'The muscles of the throat squeeze in turn, top to bottom, and the mouthful drops into the oesophagus' };
  },
  sounds: [[0.42, play => play.thump(105, 0.17, 0.22)]],
};

/* ---------- The larynx: breathing, then a note ---------- */
export const larynx = {
  cycle: 7000, stop: 'Stop the voice', start: 'Set the voice going',
  /* the folds lie inside the box of the larynx: its walls go clear, so they can be seen */
  look: name => (/^Thyroid cartilage$|thyrohyoid|quadrangular membrane|conus elasticus|cricothyroid$|thyro-arytenoid$|aryepiglotticus$|^Thyroid gland$|^Epiglottis$/i.test(name) ? { opacity: 0.22 } : null),
  build(kit) {
    const { V } = kit, folds = kit.entry('larynxVocalFolds'), cords = kit.find(/vocal ligament$/i), front = kit.end(folds, V(0, 0, 1), 0.3); front.x = 0;
    const sides = [1, -1].map(side => {   // +x is the body's left
      const cord = cords.find(part => Math.sign(part.centre[0]) === side), middle = kit.centre(cord), half = Math.max(0.3, front.z - middle.z);
      return { side, parts: [...folds, ...kit.find(/^(left|right) (arytenoid|corniculate) cartilage$/i)].filter(part => Math.sign(part.centre[0]) === side), shut: Math.atan2(Math.max(0, Math.abs(middle.x) - 0.06), half) * 180 / Math.PI };   // the turn that brings this fold to the midline
    });
    const windpipe = kit.one(/^Trachea$/), below = kit.centre(windpipe), gap = front.clone().add(V(0, 0, -0.9)), above = kit.end(kit.one(/^Epiglottis$/), V(0, 1, 0), 0.5).add(V(0, 1.5, -0.8));
    const way = kit.curve([below, kit.end(windpipe, V(0, 1, 0), 0.8), gap.clone().add(V(0, -1.2, 0)), gap, gap.clone().add(V(0, 1.5, -0.4)), above]);
    const pitch = kit.sex === 'male' ? 115 : 205;
    return {
      V, turn: kit.turn, front, sides, pitch, up: V(0, 1, 0),
      streams: [{ curve: way.curve, colour: AIR, count: 110, size: 0.6, spread: 0.22, speed: (where, phase) => (phase < 0.22 ? -0.6 * Math.sin(Math.PI * phase / 0.22) : phase < 0.5 ? 0.5 * Math.sin(Math.PI * (phase - 0.22) / 0.28) : 0.22 * during(phase, 0.54, 0.96)) }],
      sounds: [[0.02, play => play.breath(1.4, 0.04, 950)], [0.24, play => play.breath(1.7, 0.03, 520)], [0.56, play => play.voice(2.6, pitch, 0.07)]],
    };
  },
  step(rig, phase, act, time) {
    const apart = during(phase, 0, 0.5, 0.1), closed = during(phase, 0.52, 0.98, 0.06), tremble = closed * 0.035 * Math.sin(time * 70);
    for (const { side, parts, shut } of rig.sides) {
      /* a fold is hinged at the front, on the thyroid cartilage; its back end swings out to breathe and in to speak */
      const turn = rig.turn(rig.up, -side * (9 * apart - shut * closed));
      for (const part of parts) act.rigid(part, { pivot: rig.front, turn, shift: rig.V(side * tremble, 0, 0) });
      for (const part of parts) act.glow(part, 0.45 + 0.4 * closed);   // lit, so they show through the walls
    }
    return { caption: phase < 0.5 ? 'Breathing: the vocal folds are drawn apart, and air passes freely between them' : `Speaking: the folds close, and air from the lungs sets them trembling, about ${rig.pitch < 150 ? '110 times a second in a man' : '200 times a second in a woman'}` };
  },
};

/* ---------- The cranial nerves: one at a time, with what each is for ---------- */
const NERVES = [
  [['opticNerve'], 'II · The optic nerve: sight, carried in from the retina', true],
  [['cranialNervesOculomotor'], 'III · Oculomotor: most of the muscles that move the eye, and the size of the pupil', false],
  [['cranialNervesTrochlear'], 'IV · Trochlear: a single muscle, which turns the eye down and outward', false],
  [['cranialNervesTrigeminal', 'cranialNervesOphthalmic', 'cranialNervesMaxillary', 'cranialNervesMandibular', 'cranialNervesLingual', 'cranialNervesInferiorAlveolar'], 'V · Trigeminal: feeling from the whole face and the teeth, and the muscles of chewing', true],
  [['cranialNervesFacial'], 'VII · Facial: the muscles of expression, and taste from the front of the tongue', false],
  [['cranialNervesGlossopharyngeal'], 'IX · Glossopharyngeal: taste and feeling from the back of the tongue and the throat', true],
  [['cranialNervesVagus'], 'X · Vagus, "the wanderer": down to the heart, the lungs and the gut', false],
  [['cranialNervesAccessory'], 'XI · Accessory: turns the head and shrugs the shoulders', false],
  [['cranialNervesHypoglossal'], 'XII · Hypoglossal: moves the tongue', false],
];
const SCALE = [392, 440, 494, 523, 587, 659, 698, 784, 880];
export const cranialNerves = {
  cycle: 27000, stop: 'Stop the round of the nerves', start: 'Go round the nerves', context: 0.45,
  build(kit) {
    const { V } = kit, box = kit.box(kit.own), stem = V(0, box.getCenter(V(0, 0, 0)).y + 1, box.min.z + 0.35 * (box.max.z - box.min.z));   // about where the brainstem is, which they all leave from
    const slots = NERVES.map(([keys], k) => {
      const parts = keys.filter(key => kit.has(key)).flatMap(key => kit.entry(key));
      /* signals run along its longest pieces: inward for a nerve of sense, outward for one that moves muscle */
      const longest = parts.map(part => ({ part, length: kit.box(part).getSize(V(0, 0, 0)).length() })).sort((a, b) => b.length - a.length).slice(0, 10).filter(({ length }) => length > 1.5);
      return { parts, lines: longest.map(({ part }) => kit.line(part, { from: stem, radius: 0.45 })).filter(line => line.length > 2), from: k / NERVES.length, to: (k + 1) / NERVES.length };
    });
    return {
      slots, all: kit.own,
      streams: slots.flatMap(({ lines, from, to }, k) => lines.map(line => ({ curve: kit.curve(line).curve, colour: SIGNAL, count: 30, size: 0.8, spread: 0.05, speed: () => (NERVES[k][2] ? -0.6 : 0.6), shown: phase => during(phase, from, to, 0.012) }))),
      sounds: slots.map(({ from }, k) => [from + 0.004, play => play.chime(SCALE[k], 0.035)]),
    };
  },
  step(rig, phase, act) {
    const at = Math.min(NERVES.length - 1, Math.floor(phase * NERVES.length));
    const lit = new Set(rig.slots[at].parts);
    for (const part of rig.all) if (!lit.has(part)) act.fade(part, 0.3);   // the others step back while one is shown
    light(act, rig.slots[at].parts, during(phase, rig.slots[at].from, rig.slots[at].to, 0.012));
    return { caption: NERVES[at][1] };
  },
};
