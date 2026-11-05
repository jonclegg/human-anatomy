// The model's text: layers, views, the tour, and a note for each main part.
// An entry gathers the structures whose names match its pattern (in entry order, first match wins) and gives them one
// description, a common misconception, published measurements and, where there is one, the other sex's equivalent.
// Female-only and male-only entries come last, so the shared parts keep the same numbers in both bodies.

export const LAYER_INFO = {
  skeleton: { name: 'Skeleton', short: 'B', dot: '#d9cdb4' },
  muscles: { name: 'Muscles', short: 'M', dot: '#c84b3f' },
  organs: { name: 'Organs', short: 'O', dot: '#e0507a' },
  vessels: { name: 'Vessels', short: 'V', dot: '#b8322b' },
  nerves: { name: 'Nervous system', short: 'N', dot: '#e8b923' },
  skin: { name: 'Skin', short: 'S', dot: '#d9a98e' },
};
export const GROUP_INFO = {
  skull: { name: 'Skull' }, spine: { name: 'Spine' }, chest: { name: 'Chest' }, arm: { name: 'Arm' }, hand: { name: 'Hand' },
  pelvis: { name: 'Pelvis' }, leg: { name: 'Leg' }, foot: { name: 'Foot' }, head: { name: 'Head' }, neck: { name: 'Neck' }, trunk: { name: 'Trunk' },
  heart: { name: 'Heart' }, respiratory: { name: 'Respiratory system' }, digestive: { name: 'Digestive system' }, urinary: { name: 'Urinary system' },
  reproductive: { name: 'Reproductive system' }, endocrine: { name: 'Endocrine glands' }, lymphatic: { name: 'Lymphatic system' }, senses: { name: 'Eye and ear' },
  breast: { name: 'Breast' }, arteries: { name: 'Arteries' }, veins: { name: 'Veins' }, brain: { name: 'Brain' }, spinal: { name: 'Spinal cord' }, nerves: { name: 'Nerves' }, skin: { name: 'Skin' },
};

/* colours: bone ivory, cartilage pale blue-grey, muscle red with pale tendons, each organ its own, arteries red, veins blue, nerves yellow */
const ORGAN_COLOURS = [
  [/heart|ventric|atri|myocard|wall of/i, '#a8323a'], [/valve|cusp|leaflet|chorda/i, '#e8d4c0'], [/papillary/i, '#b5463f'],
  [/lung|bronchopulmonary|lobe of (left|right) lung/i, '#d9a3a0'], [/bronch|trachea/i, '#dcc8b8'], [/cartilage|larynx|epiglott|vocal|conus/i, '#c7d3d1'],
  [/liver|hepat/i, '#7c3328'], [/gallbladder|cystic duct|bile|biliary/i, '#5f7d3e'], [/pancrea/i, '#e2bf86'], [/spleen/i, '#6f2a3e'],
  [/stomach/i, '#d58f7f'], [/esophag|oesophag/i, '#c9877a'], [/duoden|jejun|ileum|ileal|small intestine/i, '#e0a98f'], [/colon|cecum|caecum|appendix|rectum|taenia|intestine/i, '#c48873'],
  [/mesentery|mesocolon|mesoappendix|omentum/i, '#ecd9a8'], [/tooth/i, '#f4efe2'], [/tongue|lip|gingiva|uvul/i, '#c9707a'], [/gland|salivary/i, '#e6c3a0'],
  [/kidney|renal/i, '#8f3c35'], [/ureter|urethra/i, '#e3c07a'], [/bladder/i, '#e0b49c'], [/adrenal/i, '#e0a33e'], [/thym/i, '#e8c8b0'], [/thyroid gland|parathyroid/i, '#a5463a'],
  [/testis|epididym/i, '#e3c2b0'], [/prostate|seminal/i, '#c99a80'], [/penis|glans|cavernos|spongios/i, '#c58078'], [/deferent/i, '#e0cdb0'],
  [/uterus|cervix|vagina/i, '#c85d6a'], [/ovary/i, '#e8c8a8'], [/fallopian|uterine tube/i, '#d98a8a'], [/ligament/i, '#e2cdbb'], [/mammary|breast/i, '#efc9a8'],
  [/sclera|eyeball|fibrous layer/i, '#f2efe8'], [/iris/i, '#5f7f91'], [/lens|cornea|chamber|vitreous/i, '#cfe0e6'], [/choroid|retina|corona ciliaris/i, '#8c3a3a'], [/lacrimal|eyelid|tarsal/i, '#e4b9a2'],
  [/ear/i, '#dba78e'], [/tonsil|lymph/i, '#c9a0b0'], [/pituitary|pineal/i, '#d98f55'],
];
export function colourOf(part) {
  const name = part.name;
  if (part.layer === 'skeleton') return /cartilage|disk|disc|ligament|membrane|symphysis|meniscus/i.test(name) ? '#c8d5d3' : '#e9dfc9';
  if (part.layer === 'muscles') return /tendon|retinaculum|tract|raphe|aponeuros|linea alba|tendinous|ring|check ligament|trochlea/i.test(name) ? '#e6dccb' : '#b8463f';
  if (part.layer === 'vessels') return part.group === 'veins' ? (/portal|mesenteric|splenic|pulmonary vein/i.test(name) ? '#5a4f9e' : '#3e5ba8') : (/pulmonary (trunk|artery)/i.test(name) ? '#4f6fb8' : '#c2392f');
  if (part.layer === 'nerves') return part.group === 'brain' ? (/white matter|corpus callosum|internal capsule|fornix|commissure/i.test(name) ? '#efe6dc' : /ventric|aqueduct|foramen|canal/i.test(name) ? '#9cc7d8' : /thalam|putamen|caudate|pallidus|amygdala|hippocamp|nucleus|geniculate|body/i.test(name) ? '#d6a092' : /cerebell/i.test(name) ? '#d8a8a0' : '#e6b8ab') : '#ecc33a';
  for (const [pattern, colour] of ORGAN_COLOURS) if (pattern.test(name)) return colour;
  return '#d8a090';
}

/* Views: which layers show solid, which as faint context; X-ray fades the listed layers; and the opening text */
export const VIEW_INFO = {
  body: {
    title: 'The body', figure: 'Fig. 0 · The whole body, skin see-through', main: 'organs',
    text: { any: 'A see-through body with the skeleton and organs inside. Choose a system below, or step through the parts one by one.' },
    layers: { skeleton: 'solid', muscles: 'off', organs: 'solid', vessels: 'off', nerves: 'solid', skin: 'ghost' }, body: 0.22, xray: ['skeleton'], isolate: true,
    items: [['heart', 'pumps about 5 litres a minute'], ['liver', 'the largest internal organ'], ['femur', 'the longest bone']],
    labels: { any: ['brain', 'heart', 'lungs', 'liver', 'stomach', 'kidney', 'smallIntestine', 'colon', 'bladder', 'skull', 'femur', 'pelvis', 'ribs', 'spleen'] },
  },
  skeleton: {
    title: 'The skeleton', figure: 'Fig. 1 · The skeleton', main: 'skeleton',
    text: { any: 'An adult skeleton has about 206 bones. The skull, spine and rib cage protect the brain, spinal cord and chest organs; the limbs are levers for the muscles.' },
    layers: { skeleton: 'solid', muscles: 'off', organs: 'off', vessels: 'off', nerves: 'off', skin: 'ghost' }, body: 0.1, xray: ['skeleton'], isolate: true,
    items: [['femur', 'the longest bone'], ['skull', '22 bones'], ['spine', '33 vertebrae'], ['pelvis', 'differs most between the sexes']],
    labels: { any: ['skull', 'mandible', 'clavicle', 'scapula', 'sternum', 'ribs', 'humerus', 'radius', 'ulna', 'spine', 'pelvis', 'femur', 'patella', 'tibia', 'fibula', 'hand', 'foot'] },
  },
  muscles: {
    title: 'The muscles', figure: 'Fig. 2 · The muscles', main: 'muscles',
    text: { any: 'More than 600 skeletal muscles move the bones, hold the posture and make heat. Each one pulls; none can push.' },
    layers: { skeleton: 'solid', muscles: 'solid', organs: 'off', vessels: 'off', nerves: 'off', skin: 'off' }, body: 0, xray: ['muscles'], isolate: true,
    items: [['gluteusMaximus', 'the heaviest muscle'], ['deltoid', 'lifts the arm'], ['diaphragm', 'the main breathing muscle']],
    labels: { any: ['sternocleidomastoid', 'trapezius', 'deltoid', 'pectoralisMajor', 'bicepsBrachii', 'tricepsBrachii', 'externalOblique', 'serratusAnterior', 'forearmFlexors', 'rectusFemoris', 'vastusLateralis', 'vastusMedialis', 'sartorius', 'adductors', 'tibialisAnterior', 'gastrocnemius', 'gluteusMaximus', 'hamstrings'] },
  },
  organs: {
    title: 'The organs', figure: 'Fig. 3 · The organs, bones see-through', main: 'organs',
    text: { any: 'The organs of the chest, abdomen and pelvis, with the skeleton as a faint outline for reference.' },
    layers: { skeleton: 'ghost', muscles: 'off', organs: 'solid', vessels: 'off', nerves: 'solid', skin: 'ghost' }, body: 0.12, xray: ['organs'], isolate: true,
    items: [['liver', 'about 1.5 kg'], ['lungs', 'about 6 litres of air'], ['smallIntestine', 'about 6 m long'], ['kidney', 'filter 180 litres a day']],
    labels: { any: ['brain', 'thyroidCartilage', 'trachea', 'lungs', 'heart', 'liver', 'stomach', 'spleen', 'pancreas', 'gallbladder', 'kidney', 'smallIntestine', 'colon', 'bladder', 'rectum', 'eye'] },
  },
  vessels: {
    title: 'The blood vessels', figure: 'Fig. 4 · Arteries and veins', main: 'vessels',
    text: { any: 'Arteries (red) carry blood away from the heart; veins (blue) bring it back. Laid end to end, an adult\'s vessels would run about 100,000 km, most of it capillaries too small to show.' },
    layers: { skeleton: 'ghost', muscles: 'off', organs: 'ghost', vessels: 'solid', nerves: 'off', skin: 'ghost' }, body: 0.1, xray: ['vessels'], isolate: true,
    items: [['aorta', 'the largest artery'], ['venaCava', 'returns blood to the heart'], ['femoralArtery', 'the pulse in the groin']],
    labels: { any: ['aorta', 'venaCava', 'carotid', 'jugular', 'subclavian', 'pulmonaryArteries', 'coronaryArteries', 'renalArtery', 'iliacArteries', 'femoralArtery', 'femoralVein', 'saphenous', 'brachialArtery', 'portalVein'] },
  },
  nerves: {
    title: 'The nervous system', figure: 'Fig. 5 · Brain and spinal cord', main: 'nerves',
    text: { any: 'The brain and spinal cord form the central nervous system. The free models used here include the brain in detail, the spinal cord and the nerves of the eye; the nerves of the limbs are not in them.' },
    layers: { skeleton: 'ghost', muscles: 'off', organs: 'off', vessels: 'off', nerves: 'solid', skin: 'ghost' }, body: 0.1, xray: ['nerves'], isolate: true,
    items: [['cerebrum', 'about 85% of brain weight'], ['cerebellum', 'coordinates movement'], ['spinalCord', 'about 45 cm long']],
    labels: { any: ['cerebrum', 'frontalLobe', 'cerebellum', 'brainstem', 'spinalCord', 'opticNerve', 'corpusCallosum', 'thalamus'] },
  },
};
for (const view of Object.values(VIEW_INFO)) view.direction = null;

export const TOUR = [
  ['skull', 'skeleton'], ['spine', 'skeleton'], ['ribs', 'skeleton'], ['pelvis', 'skeleton'], ['femur', 'skeleton'],
  ['deltoid', 'muscles'], ['pectoralisMajor', 'muscles'], ['bicepsBrachii', 'muscles'], ['diaphragm', 'muscles'], ['gluteusMaximus', 'muscles'], ['quadriceps', 'muscles'], ['gastrocnemius', 'muscles'],
  ['heart', 'organs'], ['lungs', 'organs'], ['liver', 'organs'], ['stomach', 'organs'], ['smallIntestine', 'organs'], ['kidney', 'organs'], ['bladder', 'organs'],
  ['uterus', 'organs'], ['ovary', 'organs'], ['testis', 'organs'], ['prostate', 'organs'],
  ['aorta', 'vessels'], ['venaCava', 'vessels'], ['cerebrum', 'nerves'], ['cerebellum', 'nerves'], ['spinalCord', 'nerves'],
];

export const BUGS = [
  ['The heart is on the left', 'It sits in the middle of the chest, behind the breastbone. Only its tip points left.'],
  ['We use 10% of our brain', 'Scans show activity across the whole brain over a day. No large part sits idle.'],
  ['Men have one rib fewer', 'Both sexes have 12 pairs. The Adam story is not anatomy.'],
  ['Bones are dry and dead', 'Bone is living tissue with blood vessels and nerves. The whole skeleton is replaced about every 10 years.'],
  ['The appendix is useless', 'It holds lymphoid tissue and gut bacteria that can restock the colon after illness.'],
  ['The stomach is behind the belly button', 'Most of it sits higher, under the left ribs. The navel overlies the small intestine.'],
  ['Blood in the veins is blue', 'It is dark red. Veins look blue through skin because of how skin scatters light.'],
  ['Muscle turns into fat', 'They are different tissues. One does not become the other; their amounts change separately.'],
];

export const DIFFERENCES = [
  ['Wider, shallower pelvis with a round inlet; subpubic angle 80–90°', 'Narrower, deeper pelvis with a heart-shaped inlet; subpubic angle 50–60°'],
  ['Average height 162 cm (worldwide adult mean, NCD-RisC 2016)', 'Average height 175 cm'],
  ['Ovaries, fallopian tubes, uterus, vagina, vulva', 'Testes, epididymides, seminal vesicles, prostate, penis'],
  ['Mammary glands develop at puberty', 'Mammary glands stay rudimentary'],
  ['Heart about 250–300 g', 'Heart about 300–350 g'],
  ['Larynx smaller; vocal folds 12.5–17.5 mm', 'Larynx larger, the thyroid notch forms the "Adam\'s apple"; vocal folds 17–25 mm'],
  ['Urethra about 4 cm', 'Urethra about 20 cm'],
  ['Same 206 bones, 12 pairs of ribs, same muscles', 'Same 206 bones, 12 pairs of ribs, same muscles'],
];

/* what the free models do not have, said plainly */
export const GAPS = [
  ['Female skeleton and muscles', 'Fitted from the male, apart from her scanned pelvis, thigh and leg bones, kneecaps and breastbone.'],
  ['Peripheral nerves', 'Only the brain, spinal cord and the nerves around the eye are in the free models.'],
  ['Some muscles', 'BodyParts3D has no latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, masseter or temporalis.'],
  ['Thyroid gland', 'Not in either free source.'],
];

/* ---------- The main parts ---------- */
const E = (pattern, fields) => ({ pattern, ...fields });
export const ENTRIES = {
  /* Skeleton */
  skull: E(/^(frontal|occipital|sphenoid|ethmoid|(left|right) (parietal|temporal|zygomatic|maxilla|lacrimal|palatine|nasal) bone|(left|right) maxilla|vomer|(left|right) inferior nasal concha|septal nasal cartilage|(left|right) (lateral nasal|major alar) cartilage)/i, { layer: 'skeleton', whole: false, name: 'Skull', aka: 'Cranium and facial bones',
    what: 'Twenty-two bones: eight form the braincase and fourteen the face. All but the lower jaw are locked together at wavy seams called sutures.',
    does: 'Encloses the brain, holds the eyes, ears and teeth, and anchors the muscles of chewing and facial expression.',
    bug: 'A baby\'s skull is not one bone with soft spots. It is separate plates held by membranes, so it can squeeze through the birth canal.',
    stats: [['Bones', '22 (8 cranial, 14 facial)'], ['Braincase volume', '1,200–1,500 mL'], ['Sutures close', 'Mostly by age 30–40']],
    other: { any: 'Same bones; the male skull is usually larger, with a heavier brow ridge and jaw' } }),
  mandible: E(/^mandible$/i, { layer: 'skeleton', name: 'Mandible', aka: 'Lower jaw',
    what: 'The only movable bone of the skull: a horseshoe-shaped body carrying the lower teeth and two upright branches that hinge at the ears.',
    does: 'Moves to chew and speak. The joint in front of each ear both hinges and slides.',
    bug: 'It is not fixed to the skull. It hangs from it by muscles and ligaments and moves at two joints at once.',
    stats: [['Teeth held', '16 in an adult'], ['Bite force, molars', 'About 700 N average']], other: { any: 'Same bone; usually larger and squarer in men' } }),
  hyoid: E(/^hyoid bone$/i, { layer: 'skeleton', name: 'Hyoid bone', aka: 'Tongue bone',
    what: 'A small U-shaped bone in the front of the neck, below the jaw and above the larynx.',
    does: 'Anchors the tongue and the muscles that raise the larynx when you swallow.',
    bug: 'It touches no other bone. Muscles and ligaments alone hold it in place.',
    stats: [['Width', 'About 4 cm'], ['Joints with other bones', 'None']], other: { any: 'Same bone' } }),
};
