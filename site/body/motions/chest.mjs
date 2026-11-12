// Motions of the chest and abdomen: breathing, the blood's two loops, a meal's journey, the liver's blood and bile, the
// kidney's blood and urine, the drift of lymph, milk in the breast, and the hormone glands taking their turns. See ../motions.mjs for the format.
import { smooth, during, chain, light, SPENT, FRESH, AIR, FOOD, URINE, BILE, LYMPH, JUICE } from './shared.mjs';

/* ---------- The lungs: one breath ----------
   0.00-0.42 in: the diaphragm flattens, the ribs lift, the lungs fill; 0.42-0.95 out: it all springs back; then a pause */
const breathAt = phase => smooth(0, 0.42, phase) * (1 - smooth(0.42, 0.95, phase));
export const lungs = {
  cycle: 5200, watch: 'how you breathe',
  look: name => (/segment of (left|right) lung$/i.test(name) ? { opacity: 0.55 } : null),   // the lobes part-clear, so the airways show in them
  build(kit) {
    const { V } = kit, up = V(0, 1, 0), trachea = kit.one(/^Trachea$/), top = kit.end(trachea, up, 1.5), fork = kit.end(trachea, V(0, -1, 0), 1.5);
    const diaphragm = kit.one(/^Diaphragm$/), dome = kit.box(diaphragm);
    const sides = [1, -1].map(side => {   // +x is the body's left
      const lobes = kit.find(/segment of (left|right) lung$/i).filter(part => Math.sign(part.centre[0]) === side), box = kit.box(lobes), middle = box.getCenter(V(0, 0, 0));
      /* a lung fills from where it is held, at its root and its top; everything in it swells with it */
      const within = kit.own.filter(part => part !== trachea && part !== diaphragm && !/main bronchus|nodes$/i.test(part.name) && box.containsPoint(V(...part.centre)));
      const root = V(side > 0 ? box.min.x : box.max.x, box.max.y - 0.3 * (box.max.y - box.min.y), middle.z);
      const bronchus = kit.one(side > 0 ? /^Left main bronchus/ : /^Right main bronchus/);
      const way = kit.curve([top.clone().add(V(0, 3, 0)), top, top.clone().lerp(fork, 0.5), fork, kit.centre(bronchus), middle.clone().lerp(root, 0.4), middle.clone().add(V(0, -0.2 * (box.max.y - box.min.y), 0))]);
      return { within, root, way };
    });
    const cage = kit.find(/^(left|right) \w+ rib$|costal cartilage|sternum$/i, kit.shown), ribs = kit.box(cage);
    return {
      sides, diaphragm, floor: V((dome.min.x + dome.max.x) / 2, dome.min.y, (dome.min.z + dome.max.z) / 2), cage, spine: V(0, (ribs.min.y + ribs.max.y) / 2, ribs.min.z + 3), V,
      /* the air is drawn in and breathed out again: the same drops, down and back */
      streams: sides.map(({ way }) => ({ curve: way.curve, colour: AIR, count: 360, size: 0.54, spread: 0.45, speed: (where, phase) => (phase < 0.42 ? 0.5 * Math.sin(Math.PI * phase / 0.42) : phase < 0.95 ? -0.4 * Math.sin(Math.PI * (phase - 0.42) / 0.53) : 0) })),
    };
  },
  step(rig, phase, act) {
    const breath = breathAt(phase), { V } = rig;
    for (const { within, root } of rig.sides) for (const part of within) act.rigid(part, { pivot: root, scale: V(1 + 0.05 * breath, 1 + 0.085 * breath, 1 + 0.06 * breath) });
    act.rigid(rig.diaphragm, { pivot: rig.floor, scale: V(1, 1 - 0.11 * breath, 1) });
    for (const part of rig.cage) act.rigid(part, { pivot: rig.spine, scale: V(1 + 0.03 * breath, 1, 1 + 0.045 * breath) });
    return { caption: phase < 0.42 ? 'Breathing in: the diaphragm flattens, the ribs lift, and air is drawn down the windpipe' : phase < 0.95 ? 'Breathing out: the diaphragm relaxes and the lungs spring back' : 'A short pause before the next breath. You take about 20,000 a day' };
  },
  sounds: [[0.02, play => play.breath(2.1, 0.05, 950)], [0.44, play => play.breath(2.5, 0.035, 520)]],
};

/* ---------- The gut: a meal's journey ---------- */
const MEAL = [
  [0.25, 'esophagus', 'Each swallow is squeezed down the oesophagus to the stomach in a few seconds'],
  [0.5, 'stomach', 'The stomach churns it with acid for a few hours, into a thin paste'],
  [0.75, 'small', 'The small intestine, about six metres of it, takes in almost all the nutrients'],
  [1.01, 'colon', 'The colon takes back water and salt; what is left collects in the rectum'],
];
export const digestive = {
  cycle: 16000, watch: 'how a meal moves through the gut',
  build(kit) {
    const { V } = kit, part = key => kit.entry(key), down = V(0, -1, 0);
    const gullet = kit.line(part('esophagus'), { from: kit.end(part('esophagus'), V(0, 1, 0), 1) });
    const stomach = kit.line(part('stomach'), { from: gullet.at(-1), radius: 3 });
    const duodenum = kit.line(part('duodenum'), { from: stomach.at(-1), radius: 1.8 });
    const coils = chain([...part('digestiveJejunum'), ...part('digestiveIleum')].map(piece => kit.centre(piece)), duodenum.at(-1));
    const rising = kit.line(part('digestiveAscendingColon'), { from: kit.end(part('digestiveAscendingColon'), down, 2), radius: 3 });
    const across = kit.line(part('digestiveTransverseColon'), { from: rising.at(-1), radius: 3 });
    const falling = kit.line(part('digestiveDescendingColon'), { from: across.at(-1), radius: 3 });
    const rectum = kit.line(part('rectum'), { from: kit.end(part('rectum'), V(0, 1, 0), 1.5), radius: 2.5 });
    const way = kit.curve([...gullet, ...stomach, ...duodenum, ...coils, ...rising, ...across, ...falling, ...rectum]);
    /* where along the way each stage of the meal ends: the food shows only in the stretch being told, so none of it is seen adrift in parts that are not */
    const ends = [way.whereOf(gullet.at(-1)), way.whereOf(stomach.at(-1)), way.whereOf(coils.at(-1)), 1];
    return {
      V, stomach: part('stomach')[0], middle: kit.centre(part('stomach')),
      lit: { esophagus: part('esophagus'), stomach: part('stomach'), small: [...part('duodenum'), ...part('digestiveJejunum'), ...part('digestiveIleum')], colon: [...part('digestiveAscendingColon'), ...part('digestiveTransverseColon'), ...part('digestiveDescendingColon'), ...part('rectum')] },
      /* it moves in mouthfuls: waves of squeezing travel down the gut and carry the food with them */
      streams: [{ curve: way.curve, colour: FOOD, to: '#8a5a2b', count: 1500, size: 0.6, spread: 0.28, speed: (where, phase, time) => 0.02 * (0.55 + 0.9 * Math.sin(Math.PI * (where * 30 - time * 3)) ** 2),
        stretch: phase => { const at = MEAL.findIndex(([until]) => phase < until); return [at ? ends[at - 1] : 0, ends[at]]; } }],
    };
  },
  step(rig, phase, act, time) {
    const churn = 0.045 * Math.sin(time * 2.1);
    act.rigid(rig.stomach, { pivot: rig.middle, scale: rig.V(1 + churn, 1 - churn, 1 + churn * 0.5) });
    const at = MEAL.findIndex(([until]) => phase < until), from = at ? MEAL[at - 1][0] : 0;
    light(act, rig.lit[MEAL[at][1]], 0.4 * during(phase, from, MEAL[at][0]));
    return { caption: MEAL[at][2] };
  },
};

/* ---------- The liver: blood in by two routes and out by one; bile stored, then sent to the gut ---------- */
export const liver = {
  cycle: 12000, watch: 'how blood and bile flow through the liver',
  look: name => (/^Hepatovenous segment|^Caudate lobe of liver$/.test(name) ? { opacity: 0.72 } : null),   // the liver part-clear, so its vessels and ducts show
  build(kit) {
    const { V } = kit, named = pattern => kit.one(pattern), up = V(0, 1, 0);
    const right = kit.centre(kit.entry('liverRightLiver')), left = kit.centre(kit.entry('liverLeftLiver'));
    const gallbladder = named(/^Gallbladder$/), store = kit.centre(gallbladder), gut = kit.centre(named(/^Duodenum$/));
    const portal = kit.line(kit.find(/^(Pre-hepatic|Hepatic) portal vein$/), { from: kit.end(kit.find(/^(Pre-hepatic|Hepatic) portal vein$/), V(0, -1, 0), 1), radius: 1.2 });
    const duct = kit.line(named(/^Common hepatic duct$/), { from: kit.end(named(/^Common hepatic duct$/), up, 0.6) }), cystic = kit.centre(named(/^Cystic duct$/));
    const drain = kit.centre(kit.find(/^(Right|Middle|Left) hepatic vein$/)), out = kit.end(kit.find(/^(Right|Middle|Left) hepatic vein$/), up, 1);
    const curve = points => kit.curve(points).curve;
    const juice = kit.line(named(/^Pancreatic duct$/), { to: gut, radius: 0.8 });   // from the tail of the pancreas to its head, where the duct meets the bile duct
    const opening = kit.points(named(/^Duodenum$/)).reduce((best, point) => (point.distanceTo(juice.at(-1)) < best.distanceTo(juice.at(-1)) ? point : best));   // where both enter the duodenum: its wall nearest the duct's end
    return {
      V, gallbladder, store, liver: kit.find(/^Hepatovenous segment/), ducts: kit.entry('liverHepaticDucts'),
      streams: [
        { curve: curve([...portal, kit.centre(named(/^Right portal vein$/)), right]), colour: '#8a63d2', count: 360, size: 0.54, spread: 0.3, speed: () => 0.16 },   // from the gut: rich in food, poor in oxygen
        { curve: curve([kit.centre(named(/^Celiac trunk$/)), kit.centre(named(/^Common hepatic artery$/)), kit.centre(named(/^Hepatic artery proper$/)), left.clone().lerp(right, 0.4)]), colour: FRESH, count: 168, size: 0.42, spread: 0.15, speed: (where, phase, time) => 0.2 + 0.25 * Math.max(0, Math.sin(time * 5)) },   // from the heart, in pulses
        { curve: curve([right, drain, out, out.clone().add(V(0, 3.5, 0))]), colour: SPENT, count: 312, size: 0.54, spread: 0.3, speed: () => 0.18 },
        { curve: curve([right.clone().lerp(left, 0.3), ...duct, cystic, store]), colour: BILE, count: 144, size: 0.42, spread: 0.12, speed: () => 0.14, shown: phase => 1 - during(phase, 0.58, 1) },
        { curve: curve([store, cystic, duct.at(-1).clone().lerp(opening, 0.5), opening]), colour: BILE, count: 216, size: 0.48, spread: 0.15, speed: () => 0.45, shown: phase => during(phase, 0.62, 0.98) },
        { curve: curve([...juice, opening]), colour: JUICE, count: 192, size: 0.42, spread: 0.1, speed: () => 0.3, shown: phase => during(phase, 0.62, 0.98) },
      ],
    };
  },
  step(rig, phase, act) {
    const squeeze = during(phase, 0.62, 0.98, 0.1);
    act.rigid(rig.gallbladder, { pivot: rig.store, scale: 1 - 0.22 * squeeze });
    light(act, [rig.gallbladder], 0.5 * squeeze);
    light(act, rig.ducts, 0.35 * during(phase, 0.3, 0.6));
    return { caption: phase < 0.3 ? 'Blood from the gut arrives by the portal vein, and from the heart by the hepatic artery; it all leaves by the hepatic veins' : phase < 0.6 ? 'The liver makes bile all day; between meals it is stored in the gallbladder' : 'After a meal the gallbladder squeezes, and bile runs down to the duodenum to break up fat. The pancreas adds its own juice at the same opening' };
  },
};

/* ---------- The kidney: blood in and out, urine down to the bladder, and the bladder emptying ---------- */
export const kidney = {
  cycle: 15000, watch: 'how the kidneys make urine',
  look: name => (/^Left kidney$/.test(name) ? { opacity: 0.45 } : null),
  build(kit) {
    const { V } = kit, up = V(0, 1, 0), down = V(0, -1, 0), organ = kit.one(/^Left kidney$/), middle = kit.centre(organ), bladder = kit.one(/^Urinary bladder$/), pool = kit.centre(bladder);
    const hilum = middle.clone().add(V(-0.25 * (organ.max[0] - organ.min[0]), 0, 0));   // the notch on its inner side, where everything enters and leaves
    const artery = kit.one(/^Left renal artery$/), vein = kit.find(/^Left renal vein$/), aorta = kit.one(/^Abdominal aorta$/), cava = kit.find(/^Inferior vena cava$/);
    const level = (parts, y) => { const box = kit.box(parts); return V((box.min.x + box.max.x) / 2, y, (box.min.z + box.max.z) / 2); };
    const ureter = kit.line(kit.one(/^Left ureter$/), { from: kit.end(kit.one(/^Left ureter$/), up, 1) });
    const urethra = kit.find(/^Urethra$/, kit.shown);
    const curve = points => kit.curve(points).curve;
    const streams = [
      { curve: curve([level(aorta, middle.y + 7), level(aorta, middle.y + 1), kit.centre(artery), hilum, middle]), colour: FRESH, count: 264, size: 0.48, spread: 0.22, speed: (where, phase, time) => 0.22 + 0.3 * Math.max(0, Math.sin(time * 5)) },
      { curve: curve([middle, hilum, kit.centre(vein), level(cava, middle.y + 1), level(cava, middle.y + 8)]), colour: SPENT, count: 264, size: 0.48, spread: 0.22, speed: () => 0.24 },
      /* urine is not poured down the ureter but squeezed down it, a spurt at a time (a few a minute in life; quicker here, to be seen) */
      { curve: curve([middle, hilum, ...ureter, pool]), colour: URINE, count: 264, size: 0.45, spread: 0.12, speed: (where, phase, time) => 0.06 * (0.15 + 1.9 * Math.sin(Math.PI * (where * 5 - time * 0.45)) ** 2), shown: phase => 1 - during(phase, 0.8, 1) },
    ];
    if (urethra.length) { const way = kit.line(urethra, { from: pool }); streams.push({ curve: curve([pool, ...way, way.at(-1).clone().add(down.multiplyScalar(2))]), colour: URINE, count: 216, size: 0.48, spread: 0.1, speed: () => 0.7, shown: phase => during(phase, 0.82, 0.99) }); }
    return { bladder, pool, organ, streams };
  },
  step(rig, phase, act) {
    const full = smooth(0, 0.8, phase) * (1 - smooth(0.82, 0.99, phase));
    act.rigid(rig.bladder, { pivot: rig.pool, scale: 0.86 + 0.16 * full });
    light(act, [rig.bladder], 0.4 * during(phase, 0.8, 1));
    return { caption: phase < 0.4 ? 'About a litre of blood passes through the two kidneys every minute, in by the renal artery and out by the renal vein' : phase < 0.8 ? 'What they filter out is squeezed down the ureter, a spurt a few times a minute, and the bladder slowly fills' : 'The bladder squeezes and empties through the urethra' };
  },
};

/* ---------- The lymph: seeping up from the limbs, node to node, back to the blood ---------- */
export const lymphatic = {
  cycle: 9000, watch: 'how lymph drains',
  build(kit) {
    const { V } = kit, side = (key, sign) => kit.entry(key).filter(part => Math.sign(part.centre[0]) === sign), middle = (key, sign) => kit.centre(side(key, sign));
    /* where the lymph rejoins the blood: the meeting of the great veins under each collarbone */
    const angle = sign => { const neck = side('lymphaticCervicalNodes', sign); return kit.centre(neck.filter(part => /inferior deep lateral cervical/i.test(part.name)).length ? neck.filter(part => /inferior deep lateral cervical/i.test(part.name)) : neck).add(V(-0.5 * sign, -1.5, 0)); };
    const lumbar = kit.centre(kit.entry('lymphaticLumbarNodes')), chest = kit.centre(kit.entry('lymphaticThoracicNodes'));
    const duct = [lumbar, V(0.4, (lumbar.y + chest.y) / 2, lumbar.z), V(0.8, chest.y + 4, lumbar.z + 1), angle(1)];   // the thoracic duct, up the front of the spine to the left
    const curve = points => kit.curve(points).curve, stream = (points, count) => ({ curve: curve(points), colour: LYMPH, count, size: 1.4, spread: 0.5, speed: () => 0.07 });
    return {
      nodes: kit.own.filter(part => /node/i.test(part.name)), height: kit.height,
      streams: [
        ...[1, -1].map(sign => stream([middle('lymphaticPoplitealNodes', sign), middle('lymphaticInguinalNodes', sign), middle('lymphaticPelvicNodes', sign), ...duct], 150)),
        ...[1, -1].map(sign => stream([middle('lymphaticCubitalNodes', sign), middle('lymphaticAxillaryNodes', sign), angle(sign)], 70)),
        ...[1, -1].map(sign => stream([middle('lymphaticHeadNodes', sign), middle('lymphaticCervicalNodes', sign), angle(sign)], 40)),
      ],
    };
  },
  step(rig, phase, act) {
    /* each cluster of nodes lights as the wave of lymph passes it, from the feet up */
    for (const part of rig.nodes) act.glow(part, 0.75 * Math.sin(Math.PI * (part.centre[1] / rig.height * 1.5 - phase)) ** 6);
    return { caption: phase < 0.5 ? 'Fluid that leaks from the blood seeps back as lymph, filtered at each cluster of nodes on its way up' : 'Three quarters of the body drains by one duct to the veins under the left collarbone; the right arm, and the right side of the head and chest, drain to the right' };
  },
};

/* ---------- The breast: milk from the lobes to the nipple, lymph to the armpit ---------- */
export const breast = {
  cycle: 10000, watch: 'how milk and lymph flow in the breast',
  look: name => (/^Fat of left breast$/.test(name) ? { opacity: 0.18 } : null),
  build(kit) {
    const { V } = kit, nipple = kit.centre(kit.entry('breastNipple')), lobes = kit.entry('breastLobes'), gland = kit.centre(lobes), size = kit.box(lobes).getSize(V(0, 0, 0));
    const outward = nipple.clone().sub(gland).normalize(), across = V(0, 1, 0).cross(outward).normalize(), upward = outward.clone().cross(across).normalize();
    const sinuses = kit.centre(kit.entry('breastLactiferousSinuses')), nodes = kit.entry('breastAxillaryNodes');
    const curve = points => kit.curve(points).curve;
    /* some fifteen to twenty lobes, set round the nipple like the segments of an orange, each with its own duct */
    const milk = Array.from({ length: 9 }, (_, k) => {
      const turn = 2 * Math.PI * k / 9, far = gland.clone().add(across.clone().multiplyScalar(Math.cos(turn) * size.x * 0.36)).add(upward.clone().multiplyScalar(Math.sin(turn) * size.y * 0.36));
      return { curve: curve([far, far.clone().lerp(sinuses, 0.6), sinuses, nipple, nipple.clone().add(outward.clone().multiplyScalar(0.8))]), colour: '#fff6e0', count: 48, size: 0.15, spread: 0.04, speed: () => 0.22, shown: phase => during(phase, 0, 0.55) };
    });
    return { lobes, ducts: [...kit.entry('breastLactiferousDucts'), ...kit.entry('breastLactiferousSinuses')], nodes,
      streams: [...milk, { curve: curve([gland, gland.clone().lerp(kit.centre(nodes), 0.5).add(V(0, 0.8, 0)), kit.centre(nodes)]), colour: LYMPH, count: 144, size: 0.54, spread: 0.35, speed: () => 0.12, shown: phase => during(phase, 0.5, 1) }] };
  },
  step(rig, phase, act) {
    light(act, rig.lobes, 0.3 * during(phase, 0, 0.3)); light(act, rig.ducts, 0.4 * during(phase, 0.15, 0.55)); light(act, rig.nodes, 0.6 * during(phase, 0.6, 1));
    return { caption: phase < 0.55 ? 'When a baby feeds, milk made in the lobes runs down the ducts and out at the nipple' : 'Most of the breast\'s lymph drains to the nodes of the armpit, which is why they are checked first' };
  },
};

/* ---------- The circulation: one heart, two loops: to the lungs and back, then round the body ---------- */
export const circulation = {
  cycle: 9000, watch: 'how blood goes round the body',
  look: name => (/segment of (left|right) lung$/i.test(name) ? { opacity: 0.3 } : /^Wall of /.test(name) ? { opacity: 0.45 } : null),   // the lungs and the heart's walls part-clear, so the blood shows in them
  build(kit) {
    const { V } = kit, up = V(0, 1, 0), down = V(0, -1, 0), named = pattern => kit.one(pattern), middle = pattern => kit.centre(named(pattern)), curve = points => kit.curve(points).curve;
    const rightAtrium = middle(/^Cavity of right atrium$/), rightVentricle = middle(/^Cavity of right ventricle$/), leftAtrium = middle(/^Cavity of left atrium$/), leftVentricle = middle(/^Cavity of left ventricle$/);
    const upper = kit.line(named(/^Superior vena cava$/), { from: kit.end(named(/^Superior vena cava$/), up, 1) });
    const lower = kit.line(kit.find(/^Inferior vena cava/), { from: kit.end(kit.find(/^Inferior vena cava/), down, 1), radius: 1.5 });
    const trunk = kit.line(named(/^Pulmonary trunk$/), { from: rightVentricle });
    const lungs = ['Left', 'Right'].map(side => ({
      artery: kit.line(named(new RegExp(`^${side} pulmonary artery$`)), { from: trunk.at(-1) }),
      lung: kit.centre(kit.find(new RegExp(`segment of ${side} lung$`, 'i'))),   // +x is the body's left
      veins: ['superior', 'inferior'].map(which => { const vein = kit.find(new RegExp(`^${side} ${which} pulmonary vein$`)); return kit.line(vein, { to: leftAtrium, radius: 0.7 }); }),
    }));
    /* the aorta, piece after piece, each from where the last one ended */
    const aorta = [/^Ascending aorta$/, /^Arch of aorta$/, /^Descending thoracic aorta$/, /^Descending aorta$/, /^Abdominal aorta$/].reduce((way, pattern) => [...way, ...kit.line(named(pattern), { from: way.at(-1) })], [leftVentricle]);
    const beat = (where, phase, time) => 0.1 + 0.16 * Math.max(0, Math.sin(time * 5));   // blood leaves the heart in pulses
    return {
      streams: [
        { curve: curve([...upper, rightAtrium]), colour: SPENT, count: 168, size: 0.5, spread: 0.25, speed: () => 0.2 },
        { curve: curve([...lower, rightAtrium]), colour: SPENT, count: 312, size: 0.5, spread: 0.25, speed: () => 0.12 },
        ...lungs.map(({ artery, lung }) => ({ curve: curve([rightAtrium, rightVentricle, ...trunk, ...artery, lung]), colour: SPENT, count: 264, size: 0.5, spread: 0.25, speed: beat })),
        ...lungs.map(({ veins }) => veins.map(vein => ({ curve: curve([...vein, leftAtrium]), colour: FRESH, count: 96, size: 0.45, spread: 0.12, speed: () => 0.22 }))).flat(),
        { curve: curve([leftAtrium, ...aorta]), colour: FRESH, count: 420, size: 0.5, spread: 0.25, speed: beat },
      ],
    };
  },
  step(rig, phase) {
    return { caption: phase < 0.5 ? 'The right side of the heart sends used blood, in blue, to the lungs' : 'The left side sends fresh blood, in red, round the rest of the body' };
  },
};

/* ---------- The hormone glands: the pituitary signals, and a gland answers; the pancreas on its own ----------
   Nothing moves and nothing is shown flowing: a hormone goes wherever the blood goes. Each gland is lit in its turn. */
export const hormones = {
  cycle: 16000, watch: 'how hormones carry messages',
  build(kit) {
    return { master: [...kit.entry('hypothalamus'), ...kit.entry('pituitary')], thyroid: kit.find(/^Thyroid gland$/), adrenal: kit.entry('adrenal'), pancreas: kit.entry('pancreas') };
  },
  step(rig, phase, act) {
    light(act, rig.master, 0.7 * Math.max(during(phase, 0.02, 0.4, 0.06), during(phase, 0.5, 0.65, 0.06)));
    light(act, rig.thyroid, 0.7 * during(phase, 0.33, 0.5, 0.06));
    light(act, rig.adrenal, 0.7 * during(phase, 0.58, 0.75, 0.06));
    light(act, rig.pancreas, 0.7 * during(phase, 0.77, 0.98, 0.06));
    return { caption: phase < 0.25 ? 'The pituitary, under the brain, controls several other glands' : phase < 0.5 ? 'One of its hormones tells the thyroid to release thyroid hormone' : phase < 0.75 ? 'Another tells the adrenal glands to release cortisol' : 'The pancreas measures blood sugar itself, and releases insulin or glucagon' };
  },
};
