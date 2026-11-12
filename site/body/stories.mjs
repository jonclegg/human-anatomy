// The stories: how a thing works, one step at a time. Every close-up that moves has one. Each step is one moment: what is said (written for the ear, and shown beside the model),
// the part it is about, what to look at and from where, and which stretch of the motion plays, slowed, while it is told.
//   entry    the part it is about: lit, and labelled
//   frame    the parts the view closes in on (default: the whole close-up); from: the direction to look from; fill: how closely
//   open     cuts the close-up open, facing the viewer: the parts through whose middle the cut passes (default: left whole);
//            lift: how far nearer the viewer than that, in cm
//   labels   the parts labelled during the step (default: its entry alone; [] for none)
//   keep     'all': nothing stands back while the step is told (default: all but the parts it frames, names and labels do)
//   span     the stretch of the motion's cycle that plays, over and over, taking `seconds` each time (default: all of it, at its own pace)
//   once     the stretch plays one time and holds its end (for a change that goes one way, as bones drawn apart)
//   streams  which of the motion's streams show (default: all)
const FRONT = [0.6, 0.1, 0.8], LEFT = [0.85, 0.1, 0.5];   // both sides are seen from the front and the body's left, the left side from further round, as an opened heart is drawn in an atlas
const ABOVE = [-0.25, 1, -0.1];     // from above, down the two great arteries onto their valves
const RIGHT_SIDE = ['heartRightAtrium', 'heartRightVentricle'], LEFT_SIDE = ['heartLeftAtrium', 'heartLeftVentricle'];
/* the cut lies `lift` cm nearer the viewer than the side's two valves: near enough that the valves and their cords are whole behind it, and deep enough that it crosses the walls squarely, so their cut edge is as thick as they are and no thicker */
const RIGHT_VALVES = ['heartTricuspidValve', 'heartPulmonaryValve'], LEFT_VALVES = ['heartMitralValve', 'heartAorticValve'];
const LOBES = ['lungsRightUpperLobe', 'lungsRightMiddleLobe', 'lungsRightLowerLobe', 'lungsLeftUpperLobe', 'lungsLeftLowerLobe'];
const COLON = ['digestiveAscendingColon', 'digestiveTransverseColon', 'digestiveDescendingColon', 'rectum'];
const LIVER = ['liverRightLiver', 'liverLeftLiver'];
const MILK = [0, 1, 2, 3, 4, 5, 6, 7, 8];   // the breast's streams of milk; its lymph is the one after
const BRAIN = ['frontalLobe', 'parietalLobe', 'temporalLobe', 'occipitalLobe', 'cerebellum'];
const NERVES_OF_HEAD = ['opticNerve', 'cranialNervesOphthalmic', 'cranialNervesMandibular', 'cranialNervesFacial', 'cranialNervesHypoglossal'];   // the cranial nerves are each shown against the same view of the head
const ERECTILE = ['clitorisGlans', 'clitorisBody', 'clitorisCrura', 'clitorisBulbs'];
const SKULL = ['skullFrontalBone', 'skullParietalBone', 'skullOccipitalBone', 'skullTemporalBone', 'skullMaxilla', 'skullZygomaticBone', 'mandible'];
export const STORIES = {
  heart: [
    { title: 'One beat, slowed down', entry: 'heartVentricularWall', labels: [],
      say: 'This is one heartbeat, slowed down. Blue blood has given up its oxygen. Red blood has just picked more up.' },
    { title: 'Blood returns to the heart', entry: 'heartRightAtrium', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 1.1, from: FRONT, fill: 1.15, labels: ['heartRightAtrium', 'heartTricuspidValve'], span: [0.14, 0.58], seconds: 5, streams: [0],
      say: 'Used blood from the body pours into the right atrium. The valve in its floor is shut, so the chamber fills.' },
    { title: 'The tricuspid valve opens', entry: 'heartTricuspidValve', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 1.1, from: FRONT, fill: 1.15, labels: ['heartRightAtrium', 'heartTricuspidValve', 'heartRightVentricle'], span: [0.5, 1.13], seconds: 6, streams: [0],
      say: 'The ventricle below relaxes, and the tricuspid valve opens. Blood runs through, and the atrium squeezes to finish filling the ventricle.' },
    { title: 'The right ventricle squeezes', entry: 'heartRightVentricle', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 1.1, from: FRONT, fill: 1.15, labels: ['heartTricuspidValve', 'heartRightVentricle', 'heartPulmonaryValve'], span: [0.08, 0.58], seconds: 5.5, streams: [0],
      say: 'Now the ventricle squeezes. The tricuspid valve closes, which makes the first heart sound. The blood pushes the pulmonary valve open and goes to the lungs.' },
    { title: 'Back from the lungs', entry: 'heartLeftAtrium', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 1.1, fill: 1.15, labels: ['heartLeftAtrium', 'heartMitralValve'], from: LEFT, span: [0.14, 0.58], seconds: 5, streams: [1],
      say: 'It comes back from the lungs bright red, full of oxygen, into the left atrium.' },
    { title: 'The mitral valve opens', entry: 'heartMitralValve', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 1.1, fill: 1.15, labels: ['heartLeftAtrium', 'heartMitralValve', 'heartLeftVentricle'], from: LEFT, span: [0.5, 1.13], seconds: 6, streams: [1],
      say: 'The mitral valve opens, and the left ventricle fills, in step with the right.' },
    { title: 'The left ventricle squeezes', entry: 'heartLeftVentricle', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 0.5, fill: 1.15, labels: ['heartMitralValve', 'heartLeftVentricle', 'heartAorticValve'], from: LEFT, span: [0.08, 0.58], seconds: 5.5, streams: [1],
      say: 'The left ventricle has the thickest wall, because it drives blood round the whole body. It squeezes, the mitral valve shuts, the aortic valve opens, and blood is pushed into the aorta. You can feel that as your pulse.' },
    { title: 'The outflow valves close', entry: 'heartAorticValve', frame: ['heartAorticValve', 'heartPulmonaryValve'], open: ['heartAorticValve', 'heartPulmonaryValve'], lift: 2.2, fill: 0.8, from: ABOVE, labels: ['heartAorticValve', 'heartPulmonaryValve'], span: [0.3, 0.72], seconds: 5, streams: [],
      say: 'As the ventricles relax, blood in the two great arteries falls back, fills the cups of these valves, and closes them. That makes the second heart sound.' },
    { title: 'The whole beat', entry: 'heartVentricularWall', frame: ['heartVentricularWall'], open: ['heartTricuspidValve', 'heartMitralValve'], lift: 1.1, from: [0.72, 0.1, 0.68], fill: 1.05, labels: [],
      say: 'The whole beat at normal speed. The atria squeeze, then the ventricles, about a hundred thousand times a day.' },
  ],

  circulation: [
    { title: 'Two loops', entry: 'heart', labels: ['heart', 'lungs'],
      say: 'The heart pumps blood round two loops. One goes to the lungs and back. The other goes round the rest of the body.' },
    { title: 'Back from the body', entry: 'venaCava', frame: ['venaCava', 'heart'], labels: ['venaCava', 'heart'], keep: 'all', streams: [0, 1],
      say: 'Blood that has given up its oxygen is shown in blue. It comes back from the body by two large veins, the venae cavae, into the right side of the heart.' },
    { title: 'Out to the lungs', entry: 'lungsPulmonaryArteries', frame: ['heart', 'lungs'], labels: ['lungsPulmonaryArteries', 'lungs'], keep: 'all', streams: [2, 3],
      say: 'The right side of the heart pumps it through the pulmonary arteries into both lungs. There it gives up carbon dioxide and picks up oxygen.' },
    { title: 'Back to the heart', entry: 'lungsPulmonaryVeins', frame: ['heart', 'lungs'], labels: ['lungsPulmonaryVeins'], keep: 'all', streams: [4, 5, 6, 7],
      say: 'The pulmonary veins bring it back, now bright red, to the left side of the heart.' },
    { title: 'Out to the body', entry: 'aorta', frame: ['heart', 'aorta'], labels: ['aorta'], keep: 'all', streams: [8],
      say: 'The left side pumps it into the aorta, the largest artery. Branches of the aorta carry it to every part of the body.' },
    { title: 'The whole circuit', entry: 'heart', labels: [],
      say: 'The two sides of the heart beat together, so both loops flow at once. At rest, one round takes about a minute.' },
  ],

  lungs: [
    { title: 'One breath', entry: 'trachea', labels: ['trachea', 'diaphragm'],
      say: 'This is one breath. Air goes down the windpipe into the two lungs, and comes back out the same way.' },
    { title: 'Breathing in', entry: 'diaphragm', frame: [...LOBES, 'diaphragm'], from: [0.35, -0.3, 1], labels: ['diaphragm'], keep: 'all', span: [0, 0.42], seconds: 4,
      say: 'To breathe in, the diaphragm pulls flat and the ribs lift. The chest gets bigger, and air is drawn down into the lungs.' },
    { title: 'Down the airways', entry: 'lungsMainBronchi', frame: ['trachea', 'lungsMainBronchi', 'lungsSegmentalBronchi'], labels: ['trachea', 'lungsMainBronchi', 'lungsSegmentalBronchi'], span: [0, 0.42], seconds: 4,
      say: 'The windpipe splits into two main tubes, one to each lung. They branch again and again into smaller tubes. The smallest end in tiny air sacs, where oxygen passes into the blood.' },
    { title: 'Breathing out', entry: 'diaphragm', frame: [...LOBES, 'diaphragm'], from: [-0.35, -0.3, 1], labels: ['diaphragm'], keep: 'all', span: [0.42, 0.95], seconds: 4.5,
      say: 'To breathe out, the diaphragm relaxes and rises. The lungs spring back to their smaller size and push the air out.' },
    { title: 'The whole breath', entry: 'trachea', labels: [],
      say: 'The whole breath at normal speed. At rest you take twelve to fifteen a minute, about twenty thousand a day.' },
  ],

  digestive: [
    { title: 'One meal', entry: 'stomach', labels: [],
      say: 'This follows one meal through the gut. The whole trip takes a day or more.' },
    { title: 'Down the oesophagus', entry: 'esophagus', frame: ['esophagus', 'stomach'], labels: ['esophagus'], span: [0, 0.25], seconds: 5,
      say: 'Each swallow is squeezed down the oesophagus to the stomach. It takes a few seconds.' },
    { title: 'The stomach', entry: 'stomach', frame: ['stomach', 'duodenum'], labels: ['stomach'], span: [0.25, 0.5], seconds: 5,
      say: 'The stomach churns the food with acid for a few hours, and turns it into a thin paste.' },
    { title: 'The small intestine', entry: 'digestiveJejunum', frame: ['duodenum', 'digestiveJejunum', 'digestiveIleum'], labels: ['duodenum', 'digestiveJejunum', 'digestiveIleum'], span: [0.5, 0.75], seconds: 5,
      say: 'The small intestine is about six metres long. Almost all the nutrients pass into the blood here.' },
    { title: 'The colon', entry: 'digestiveTransverseColon', frame: COLON, labels: ['digestiveAscendingColon', 'digestiveTransverseColon', 'digestiveDescendingColon', 'rectum'], span: [0.75, 1], seconds: 5,
      say: 'The colon takes back water and salt. What is left collects in the rectum.' },
  ],

  liver: [
    { title: 'What the liver does', entry: 'liverRightLiver', labels: ['liverRightLiver', 'liverLeftLiver'],
      say: 'The liver processes the blood that comes from the gut. It also makes bile, which helps to digest fat.' },
    { title: 'Blood comes in two ways', entry: 'liverPortalVein', frame: ['liverPortalVein', 'liverHepaticArtery', ...LIVER], labels: ['liverPortalVein', 'liverHepaticArtery'], span: [0, 0.3], seconds: 5, streams: [0, 1],
      say: 'Blood reaches the liver two ways. The portal vein brings blood from the gut, carrying what you have just digested. The hepatic artery brings fresh blood from the heart.' },
    { title: 'Blood goes back to the heart', entry: 'liverHepaticVeins', frame: ['liverHepaticVeins', ...LIVER], labels: ['liverHepaticVeins'], span: [0, 0.3], seconds: 5, streams: [2],
      say: 'All of it leaves by the hepatic veins at the top of the liver, and goes back to the heart.' },
    { title: 'Bile is stored', entry: 'liverGallbladder', frame: ['liverHepaticDucts', 'liverGallbladder', 'liverCysticDuct'], labels: ['liverHepaticDucts', 'liverGallbladder'], span: [0.3, 0.58], seconds: 5, streams: [3],
      say: 'The liver makes bile all day. Between meals the bile runs down the ducts and is stored in the gallbladder.' },
    { title: 'Bile goes to the gut', entry: 'liverGallbladder', frame: ['liverGallbladder', 'liverCysticDuct', 'duodenum'], labels: ['liverGallbladder', 'duodenum'], span: [0.62, 0.98], seconds: 5, streams: [4],
      say: 'After a meal the gallbladder squeezes. The bile runs down to the duodenum, where it breaks up fat.' },
    { title: 'The pancreas adds its juice', entry: 'liverPancreas', frame: ['liverPancreas', 'liverPancreaticDuct', 'duodenum'], labels: ['liverPancreas', 'liverPancreaticDuct', 'duodenum'], span: [0.62, 0.98], seconds: 5, streams: [5],
      say: 'The pancreas lies behind the stomach. It makes a juice that digests fat, protein and starch. The juice runs along a duct and enters the duodenum at the same opening as the bile.' },
  ],

  hormones: [
    { title: 'Messages in the blood', entry: 'pituitary', labels: ['pituitary', 'thyroid', 'adrenal', 'pancreas'], span: [0, 0.02], seconds: 4,
      say: 'Hormones are chemical messages. A gland releases one into the blood, and it acts on organs far away.' },
    { title: 'The pituitary gives the orders', entry: 'pituitary', frame: ['hypothalamus', 'pituitary'], from: [0.9, 0.1, 0.4], fill: 0.5, labels: ['hypothalamus', 'pituitary'], span: [0, 0.25], seconds: 5,
      say: 'The pituitary is the size of a pea, and hangs under the brain. The hypothalamus, just above it, tells it what to release. Its hormones control several other glands.' },
    { title: 'The thyroid sets the pace', entry: 'thyroid', frame: ['pituitary', 'thyroid'], labels: ['pituitary', 'thyroid'], span: [0.25, 0.5], seconds: 5,
      say: 'One pituitary hormone tells the thyroid, in the neck, to release a hormone of its own. Thyroid hormone sets how fast the body uses energy.' },
    { title: 'The adrenals answer stress', entry: 'adrenal', frame: ['adrenal'], fill: 0.45, labels: ['adrenal'], span: [0.5, 0.75], seconds: 5,
      say: 'Another tells the adrenal glands, on top of the kidneys, to release cortisol. The adrenals also make adrenaline, which speeds the heart when you are frightened.' },
    { title: 'The pancreas works alone', entry: 'pancreas', frame: ['pancreas'], fill: 0.6, labels: ['pancreas'], span: [0.75, 1], seconds: 5,
      say: 'The pancreas does not wait for the pituitary. It measures the sugar in the blood itself. Its hormone insulin lowers the sugar, and glucagon raises it.' },
    { title: 'Enough turns it down', entry: 'pituitary', labels: ['pituitary', 'thyroid', 'adrenal'], span: [0, 0.02], seconds: 4,
      say: 'When there is enough of a hormone in the blood, the pituitary sends less of the signal for it. That keeps each level steady. The ovaries and the testes are controlled the same way.' },
  ],

  kidney: [
    { title: 'What the kidneys do', entry: 'kidneyKidney', labels: ['kidneyKidney', 'bladder'],
      say: 'The two kidneys filter the blood and make urine. The urine runs down to the bladder.' },
    { title: 'Blood in and out', entry: 'kidneyRenalArtery', frame: ['kidneyKidney', 'kidneyRenalArtery', 'kidneyRenalVein'], labels: ['kidneyRenalArtery', 'kidneyRenalVein'], keep: 'all', span: [0, 0.4], seconds: 5, streams: [0, 1],
      say: 'About a litre of blood passes through the kidneys every minute. It comes in by the renal artery and leaves, cleaned, by the renal vein.' },
    { title: 'Urine runs down the ureter', entry: 'kidneyUreter', frame: ['kidneyKidney', 'kidneyUreter', 'bladder'], labels: ['kidneyUreter', 'bladder'], span: [0.4, 0.8], seconds: 6, streams: [2],
      say: 'The waste and spare water that the kidney takes out is urine. It is squeezed down the ureter in small spurts, and the bladder slowly fills.' },
    { title: 'The bladder empties', entry: 'bladder', frame: ['bladder', 'urethra'], labels: ['bladder', 'urethra'], span: [0.8, 1], seconds: 4, streams: [2, 3],
      say: 'When the bladder is full, its wall squeezes and the urine leaves through the urethra.' },
  ],

  lymphatic: [
    { title: 'What lymph is', entry: 'lymphaticThoracicNodes', labels: [],
      say: 'Fluid leaks out of the blood into the tissues all the time. The lymph vessels collect it and return it to the blood.' },
    { title: 'Up from the legs', entry: 'lymphaticInguinalNodes', frame: ['lymphaticPoplitealNodes', 'lymphaticInguinalNodes', 'lymphaticPelvicNodes'], labels: ['lymphaticPoplitealNodes', 'lymphaticInguinalNodes'], keep: 'all', span: [0, 0.5], seconds: 5, streams: [0, 1],
      say: 'Lymph from the legs moves up through the nodes behind the knee and in the groin. Each group of nodes filters it and checks it for infection.' },
    { title: 'From the arms and head', entry: 'lymphaticAxillaryNodes', frame: ['lymphaticCubitalNodes', 'lymphaticAxillaryNodes', 'lymphaticCervicalNodes', 'lymphaticHeadNodes'], labels: ['lymphaticAxillaryNodes', 'lymphaticCervicalNodes'], keep: 'all', span: [0.3, 0.9], seconds: 5, streams: [2, 3, 4, 5],
      say: 'Lymph from the arms passes through the nodes in the armpit. Lymph from the head passes through the nodes in the neck.' },
    { title: 'Back to the blood', entry: 'lymphaticThoracicNodes', frame: ['lymphaticLumbarNodes', 'lymphaticThoracicNodes', 'lymphaticCervicalNodes'], labels: ['lymphaticThoracicNodes'], keep: 'all', span: [0.5, 1], seconds: 5,
      say: 'Most of the body drains into one duct. It runs up in front of the spine and empties into the veins under the left collarbone. The right arm, and the right side of the head and chest, drain on the right.' },
  ],

  breast: [
    { title: 'What the breast is made of', entry: 'breastLobes', labels: ['breastLobes', 'breastFat'],
      say: 'The breast is mostly fat, with milk glands set in it. This shows where milk is made, and where the lymph of the breast drains.' },
    { title: 'Milk is made in the lobes', entry: 'breastLobes', frame: ['breastLobes', 'breastLactiferousDucts'], labels: ['breastLobes'], keep: 'all', span: [0, 0.3], seconds: 4, streams: MILK,
      say: 'Milk is made in the lobes. There are fifteen to twenty of them, arranged around the nipple.' },
    { title: 'Down the ducts to the nipple', entry: 'breastLactiferousDucts', frame: ['breastLactiferousDucts', 'breastLactiferousSinuses', 'breastNipple'], labels: ['breastLactiferousDucts', 'breastNipple'], keep: 'all', span: [0.15, 0.55], seconds: 5, streams: MILK,
      say: 'When a baby feeds, the milk runs down a duct from each lobe and out at the nipple.' },
    { title: 'Lymph drains to the armpit', entry: 'breastAxillaryNodes', frame: ['breastLobes', 'breastAxillaryNodes'], labels: ['breastAxillaryNodes'], keep: 'all', span: [0.55, 1], seconds: 5, streams: [9],
      say: 'Most of the lymph from the breast drains to the nodes in the armpit. That is why those nodes are checked first for breast cancer.' },
  ],

  brain: [
    { title: 'Seeing and reaching', entry: 'frontalLobe', labels: [],
      say: 'You see something and reach for it. This follows the signal across the brain. It takes about a quarter of a second.' },
    { title: 'You see it', entry: 'occipitalLobe', frame: BRAIN, from: [0.7, 0.2, -0.75], keep: 'all', span: [0.05, 0.42], seconds: 5,
      say: 'Light from the eyes becomes a signal. It arrives at the back of the brain, in the occipital lobe. This is where you see.' },
    { title: 'You recognise it', entry: 'temporalLobe', frame: BRAIN, from: [1, -0.05, 0.1], keep: 'all', span: [0.36, 0.58], seconds: 4,
      say: 'The temporal lobe works out what you are looking at.' },
    { title: 'You decide', entry: 'frontalLobe', frame: BRAIN, from: [0.8, 0.25, 0.6], keep: 'all', span: [0.52, 0.74], seconds: 4,
      say: 'The frontal lobe decides what to do about it.' },
    { title: 'The order goes out', entry: 'brainPrecentralGyrus', frame: BRAIN, from: [0.75, 0.6, 0.1], labels: ['brainPrecentralGyrus', 'brainMedulla'], keep: 'all', span: [0.66, 1], seconds: 5,
      say: 'The motor strip sends the order down through the brainstem to the muscles, and your arm moves.' },
  ],

  brainDeep: [
    { title: 'The fluid round the brain', entry: 'brainDeepLateralVentricles', labels: [],
      say: 'The brain floats in a clear fluid. This shows where the fluid is made, and the way it drains.' },
    { title: 'Where it is made', entry: 'brainDeepChoroidPlexus', frame: ['brainDeepLateralVentricles', 'brainDeepChoroidPlexus'], labels: ['brainDeepLateralVentricles', 'brainDeepChoroidPlexus'], span: [0, 0.5], seconds: 5,
      say: 'The fluid is made by the choroid plexus, mostly in the two lateral ventricles. It makes about half a litre a day.' },
    { title: 'How it drains', entry: 'brainDeepThirdVentricle', frame: ['brainDeepThirdVentricle', 'brainDeepFourthVentricle'], from: [1, 0.1, 0.1], labels: ['brainDeepThirdVentricle', 'brainDeepFourthVentricle'], span: [0.5, 1], seconds: 5,
      say: 'It drains down through the third ventricle and a narrow channel to the fourth. From there it flows out around the brain and the spinal cord.' },
    { title: 'The whole flow', entry: 'brainDeepLateralVentricles', labels: [],
      say: 'The fluid cushions the brain and carries waste away. All of it is replaced three or four times a day.' },
  ],

  eye: [
    { title: 'How the eye works', entry: 'eyeSclera', labels: [],
      say: 'The eye lets light in, focuses it, and sends a signal to the brain. Six muscles turn it.' },
    { title: 'Light enters through the pupil', entry: 'eyeIris', frame: ['eyeIris', 'eyeCornea', 'eyeLens'], from: [-0.45, 0.12, 1], fill: 0.5, labels: ['eyeIris', 'eyeCornea'], keep: 'all', span: [0, 0.3], seconds: 5,
      say: 'Light enters through the pupil, the dark opening in the middle of the iris. In bright light the iris makes the pupil smaller.' },
    { title: 'The cornea and lens focus it', entry: 'eyeLens', frame: ['eyeSclera'], from: [-1, 0.1, 0.2], labels: ['eyeCornea', 'eyeLens', 'eyeRetina'], keep: 'all', span: [0.14, 0.53], seconds: 5,
      say: 'The cornea bends the light, and the lens behind it finishes the focusing. The light lands on the retina, at the back of the eye.' },
    { title: 'The optic nerve carries the signal', entry: 'eyeOpticNerve', frame: ['eyeSclera', 'eyeOpticNerve'], from: [-0.85, 0.35, -0.45], labels: ['eyeRetina', 'eyeOpticNerve'], keep: 'all', span: [0.14, 0.53], seconds: 5,
      say: 'The retina turns the light into nerve signals. The optic nerve carries them to the brain.' },
    { title: 'Muscles turn the eye', entry: 'eyeMedialRectus', frame: ['eyeSclera', 'eyeMedialRectus', 'eyeLateralRectus'], from: [-0.2, 0.75, 0.6], labels: ['eyeMedialRectus', 'eyeLateralRectus'], keep: 'all', span: [0.55, 1], seconds: 5, streams: [],
      say: 'Six muscles aim the eye. Here two of them turn it. The medial rectus turns it toward the nose, and the lateral rectus turns it away.' },
  ],

  skull: [
    { title: 'One skull, 22 bones', entry: 'skullParietalBone', labels: [], span: [0, 0.1], seconds: 4,
      say: 'The skull looks like one bone, but it is twenty-two. Most are joined along wavy seams called sutures.' },
    { title: 'The bones round the brain', entry: 'skullParietalBone', frame: SKULL, from: [0.8, 0.35, 0.5], labels: ['skullFrontalBone', 'skullParietalBone', 'skullOccipitalBone', 'skullTemporalBone'], keep: 'all', once: true, span: [0.1, 0.5], seconds: 6,
      say: 'Here they are pulled apart. Eight bones surround the brain: the frontal, two parietal, two temporal, the occipital, the sphenoid and the ethmoid.' },
    { title: 'The bones of the face', entry: 'skullMaxilla', frame: SKULL, from: [0.15, 0, 1], labels: ['skullMaxilla', 'skullZygomaticBone', 'skullNasalBone', 'mandible'], keep: 'all', span: [0.4, 0.6], seconds: 5,
      say: 'Fourteen bones form the face. The largest are the two upper jaw bones and the lower jaw.' },
    { title: 'Only the jaw moves', entry: 'mandible', frame: SKULL, from: [0.9, 0, 0.45], labels: ['mandible'], keep: 'all', once: true, span: [0.6, 0.95], seconds: 5,
      say: 'They come back together. In an adult the seams are fixed, and the lower jaw is the only bone of the skull that moves.' },
  ],

  teeth: [
    { title: 'Three shapes of tooth', entry: 'teethCentralIncisors', labels: [],
      say: 'An adult has thirty-two teeth, in three main shapes. Each shape does a different job.' },
    { title: 'Incisors cut', entry: 'teethCentralIncisors', frame: ['teethCentralIncisors', 'teethLateralIncisors', 'teethCanines'], from: [0.1, 0, 1], labels: ['teethCentralIncisors', 'teethLateralIncisors'], keep: 'all', span: [0, 1 / 3], seconds: 4,
      say: 'The eight incisors at the front have a thin, straight edge. They bite pieces off.' },
    { title: 'Canines grip and tear', entry: 'teethCanines', frame: ['teethLateralIncisors', 'teethCanines', 'teethFirstPremolars'], from: [0.7, 0, 0.75], labels: ['teethCanines'], keep: 'all', span: [1 / 3, 2 / 3], seconds: 4,
      say: 'The four canines are pointed. They grip food and tear it.' },
    { title: 'Premolars and molars grind', entry: 'teethFirstMolars', frame: ['teethFirstPremolars', 'teethSecondPremolars', 'teethFirstMolars', 'teethSecondMolars'], from: [1, 0.05, 0.3], labels: ['teethFirstPremolars', 'teethFirstMolars'], keep: 'all', span: [2 / 3, 1], seconds: 4,
      say: 'The premolars and molars at the back have broad tops. They crush and grind food before you swallow it.' },
  ],

  face: [
    { title: 'Muscles under the skin', entry: 'faceZygomaticus', labels: [],
      say: 'The muscles of the face attach to the skin. When they shorten, the face changes shape. Here are six things they do.' },
    ...[
      ['A smile', ['faceZygomaticus', 'faceRisorius', 'faceLevatorAnguliOris'], 'A smile. Zygomaticus pulls the corners of the mouth up and out.'],
      ['A frown', ['faceCorrugatorProcerus', 'faceDepressorAnguliOris'], 'A frown. Corrugator draws the eyebrows together, and another muscle pulls the corners of the mouth down.'],
      ['Surprise', ['faceOccipitofrontalis'], 'Surprise. Frontalis lifts the eyebrows and wrinkles the forehead.'],
      ['Eyes shut tight', ['faceOrbicularisOculi'], 'Eyes shut tight. Orbicularis oculi is a ring of muscle round each eye.'],
      ['A whistle', ['faceOrbicularisOris', 'faceBuccinator'], 'A whistle. Orbicularis oris purses the lips, and buccinator holds the cheeks in.'],
      ['A bite', ['faceMasseter', 'faceTemporalis'], 'A bite. Masseter and temporalis close the jaw. They are the strongest muscles in the head.'],
    ].map(([title, muscles, say], k) => ({ title, entry: muscles[0], frame: muscles, fill: 0.5, labels: muscles.slice(0, 2), keep: 'all', span: [k / 6, (k + 1) / 6], seconds: 3.5, say })),
  ],

  mouth: [
    { title: 'One swallow', entry: 'tongue', labels: [],
      say: 'This is one swallow. It takes about a second, and most of it happens without you thinking.' },
    { title: 'The tongue pushes back', entry: 'tongue', frame: ['tongue', 'mouthSoftPalate'], labels: ['tongue'], keep: 'all', span: [0, 0.3], seconds: 4,
      say: 'You start a swallow yourself. The tongue pushes the mouthful to the back of the mouth.' },
    { title: 'The nose and airway close', entry: 'larynxEpiglottis', frame: ['mouthSoftPalate', 'mouthUvula', 'larynxEpiglottis'], labels: ['mouthSoftPalate', 'larynxEpiglottis'], keep: 'all', span: [0.2, 0.6], seconds: 5,
      say: 'The rest is automatic. The soft palate lifts and closes off the nose. The epiglottis folds down over the airway, so that food cannot go into the lungs.' },
    { title: 'The throat squeezes', entry: 'mouthPharyngealConstrictors', frame: ['mouthOropharynx', 'mouthLaryngopharynx', 'mouthPharyngealConstrictors'], labels: ['mouthPharyngealConstrictors'], keep: 'all', span: [0.5, 0.95], seconds: 5,
      say: 'The muscles of the throat squeeze one after another, from the top down, and push the mouthful into the oesophagus.' },
  ],

  larynx: [
    { title: 'The voice box', entry: 'larynxThyroidCartilage', labels: ['larynxThyroidCartilage', 'trachea'],
      say: 'The voice box sits at the top of the windpipe. Two folds inside it open for breathing and close for speaking.' },
    { title: 'Open for breathing', entry: 'larynxVocalFolds', frame: ['larynxVocalFolds', 'larynxArytenoidCartilages', 'larynxThyroidCartilage'], from: [0, 1, 0.3], labels: ['larynxVocalFolds', 'larynxArytenoidCartilages'], keep: 'all', span: [0, 0.5], seconds: 5,
      say: 'When you breathe, the vocal folds are pulled apart, and air passes freely between them.' },
    { title: 'Closed for speaking', entry: 'larynxVocalFolds', frame: ['larynxVocalFolds', 'larynxArytenoidCartilages', 'larynxThyroidCartilage'], from: [0, 1, 0.3], labels: ['larynxVocalFolds'], keep: 'all', span: [0.52, 0.98], seconds: 5,
      say: 'When you speak, the folds close. Air from the lungs makes them vibrate, about a hundred and ten times a second in a man and two hundred in a woman.' },
    { title: 'Changing the pitch', entry: 'larynxCricothyroidMuscle', frame: ['larynxThyroidCartilage', 'larynxCricoidCartilage', 'larynxCricothyroidMuscle'], labels: ['larynxThyroidCartilage', 'larynxCricoidCartilage', 'larynxCricothyroidMuscle'], keep: 'all', span: [0.52, 0.98], seconds: 5,
      say: 'The cricothyroid muscle tilts the cartilage at the front and stretches the folds. Tighter folds vibrate faster and make a higher note.' },
  ],

  cranialNerves: [
    { title: 'Nerves straight from the brain', entry: 'cranialNervesTrigeminal', labels: [], span: [0, 0.02], seconds: 4,
      say: 'Twelve pairs of nerves leave the brain directly, without going through the spinal cord. This shows nine of them, one at a time.' },
    ...[
      ['Optic nerve', 'opticNerve', 'The optic nerve, number two. It carries sight in from the retina.'],
      ['Oculomotor nerve', 'cranialNervesOculomotor', 'The oculomotor nerve, number three. It works most of the muscles that move the eye, and it sets the size of the pupil.'],
      ['Trochlear nerve', 'cranialNervesTrochlear', 'The trochlear nerve, number four. It works one muscle, which turns the eye down and outward.'],
      ['Trigeminal nerve', 'cranialNervesTrigeminal', 'The trigeminal nerve, number five. It carries feeling from the whole face and the teeth, and it works the chewing muscles.'],
      ['Facial nerve', 'cranialNervesFacial', 'The facial nerve, number seven. It works the muscles of expression, and carries taste from the front of the tongue.'],
      ['Glossopharyngeal nerve', 'cranialNervesGlossopharyngeal', 'The glossopharyngeal nerve, number nine. It carries taste and feeling from the back of the tongue and the throat.'],
      ['Vagus nerve', 'cranialNervesVagus', 'The vagus nerve, number ten. It runs down to the heart, the lungs and the gut.', ['cranialNervesVagus']],   // the long one: seen whole
      ['Accessory nerve', 'cranialNervesAccessory', 'The accessory nerve, number eleven. It turns the head and shrugs the shoulders.'],
      ['Hypoglossal nerve', 'cranialNervesHypoglossal', 'The hypoglossal nerve, number twelve. It moves the tongue.'],
    ].map(([title, entry, say, frame = NERVES_OF_HEAD], k) => ({ title, entry, frame, from: [k % 2 ? 0.95 : 0.8, 0.1, k % 2 ? 0.3 : 0.6], keep: 'all', span: [k / 9, (k + 1) / 9], seconds: 4, say })),
  ],

  shoulder: [
    { title: 'A ball in a shallow socket', entry: 'shoulderHumerus', labels: ['shoulderHumerus', 'shoulderScapula'],
      say: 'The shoulder is a ball in a shallow socket. It moves more than any other joint.' },
    { title: 'Lifting the arm', entry: 'shoulderDeltoid', frame: ['shoulderDeltoid', 'shoulderSupraspinatus'], labels: ['shoulderDeltoid', 'shoulderSupraspinatus'], keep: 'all', span: [0, 0.5], seconds: 4,
      say: 'To lift the arm, supraspinatus and deltoid work together. Supraspinatus does most at the start, and then deltoid takes over.' },
    { title: 'Holding the ball in place', entry: 'shoulderInfraspinatus', frame: ['shoulderSupraspinatus', 'shoulderInfraspinatus', 'shoulderTeresMinor', 'shoulderSubscapularis'], from: [-0.45, 0.3, -0.85], labels: ['shoulderSupraspinatus', 'shoulderInfraspinatus', 'shoulderTeresMinor', 'shoulderSubscapularis'], keep: 'all', span: [0.5, 1], seconds: 4,
      say: 'Four muscles wrap round the joint. They are called the rotator cuff, and they hold the ball of the humerus in its socket.' },
    { title: 'The whole movement', entry: 'shoulderHumerus', labels: [],
      say: 'Because the socket is shallow, the shoulder dislocates more easily than any other joint.' },
  ],

  elbow: [
    { title: 'A hinge', entry: 'elbowHumerus', labels: ['elbowHumerus', 'elbowRadius', 'elbowUlna'],
      say: 'The elbow is a hinge. Muscles at the front bend it, and a muscle at the back straightens it.' },
    { title: 'Bending', entry: 'elbowBiceps', frame: ['elbowBiceps', 'elbowBrachialis', 'elbowCapsule'], labels: ['elbowBiceps', 'elbowBrachialis'], keep: 'all', span: [0, 0.5], seconds: 4,
      say: 'To bend the elbow, biceps and brachialis, at the front, pull the forearm up.' },
    { title: 'Straightening', entry: 'elbowTriceps', frame: ['elbowTriceps', 'elbowCapsule'], from: [-0.6, 0.1, -0.8], labels: ['elbowTriceps'], keep: 'all', span: [0.5, 1], seconds: 4,
      say: 'To straighten it, triceps, at the back, pulls the forearm down.' },
    { title: 'Muscles work in pairs', entry: 'elbowBiceps', labels: ['elbowBiceps', 'elbowTriceps'],
      say: 'A muscle can only pull. It cannot push. So muscles work in pairs, one for each direction.' },
  ],

  hip: [
    { title: 'A ball in a deep socket', entry: 'hipFemur', labels: ['hipFemur', 'hipHipBone'],
      say: 'The hip is a ball in a deep socket. It carries the weight of the body, and still lets the leg swing.' },
    { title: 'Lifting the thigh', entry: 'hipIliopsoas', frame: ['hipIliopsoas', 'hipCapsule'], labels: ['hipIliopsoas'], keep: 'all', span: [0, 0.5], seconds: 4,
      say: 'To lift the thigh, iliopsoas pulls. It runs from the spine and the hip bone to the top of the femur.' },
    { title: 'Moving the thigh back', entry: 'hipGluteusMaximus', frame: ['hipGluteusMaximus', 'hipCapsule'], from: [-0.6, 0.1, -0.8], labels: ['hipGluteusMaximus'], keep: 'all', span: [0.5, 1], seconds: 4,
      say: 'To move the thigh back, gluteus maximus pulls. You use it to climb stairs and to stand up from a chair.' },
    { title: 'The whole swing', entry: 'hipFemur', labels: [],
      say: 'The whole swing. You do this with every step you take.' },
  ],

  knee: [
    { title: 'The largest joint', entry: 'kneePatella', labels: ['kneeFemur', 'kneeTibia', 'kneePatella'],
      say: 'The knee is the largest joint in the body. It bends and straightens, and it carries your weight.' },
    { title: 'Bending', entry: 'kneeHamstrings', frame: ['kneePatella', 'kneeArcuateLigament', 'kneePopliteus'], from: [-0.75, 0.05, -0.65], fill: 0.6, labels: ['kneeHamstrings'], keep: 'all', span: [0, 0.5], seconds: 4,
      say: 'To bend the knee, the hamstrings, at the back of the thigh, pull the shin back.' },
    { title: 'Straightening', entry: 'kneeQuadriceps', frame: ['kneePatella', 'kneeArcuateLigament', 'kneePopliteus'], from: [-0.6, 0.1, 0.8], fill: 0.6, labels: ['kneeQuadriceps', 'kneePatella'], keep: 'all', span: [0.5, 1], seconds: 4,
      say: 'To straighten it, the quadriceps, at the front, pull through the kneecap. The kneecap works as a pulley and makes them up to a third stronger.' },
    { title: 'What holds it together', entry: 'kneeAnteriorCruciate', frame: ['kneePatella', 'kneeAnteriorCruciate', 'kneeArcuateLigament'], fill: 0.6, labels: ['kneeAnteriorCruciate', 'kneeArcuateLigament'], span: [0, 0.04], seconds: 4,
      say: 'The bones of the knee do not lock together. Ligaments hold them in place. The two cruciate ligaments cross inside the joint and stop the shin sliding forward or back.' },
  ],

  foot: [
    { title: 'Twenty-six bones', entry: 'footTalus', labels: ['footCalcaneus', 'footTalus', 'footMetatarsals'],
      say: 'The foot has twenty-six bones. It is stiff enough to push off from, and it gives a little at each step.' },
    { title: 'Pushing off', entry: 'footCalcanealTendon', frame: ['footCalcaneus', 'footCalcanealTendon', 'footTalus'], fill: 0.6, labels: ['footCalcanealTendon', 'footCalcaneus'], keep: 'all', span: [0, 0.5], seconds: 4,
      say: 'To push off, the calf muscles pull the heel up by the Achilles tendon. It is the strongest tendon in the body.' },
    { title: 'Lifting the toes', entry: 'footToeBones', frame: ['footMetatarsals', 'footToeBones'], fill: 0.6, labels: ['footToeBones', 'footDorsalMuscles'], keep: 'all', span: [0.5, 1], seconds: 4,
      say: 'Then muscles at the front of the shin lift the foot and the toes, so that they clear the ground on the next step.' },
    { title: 'The arch', entry: 'footLongPlantarLigament', frame: ['footCalcaneus', 'footNavicular', 'footMetatarsals'], from: [0.9, -0.1, 0.3], labels: ['footLongPlantarLigament', 'footNavicular'], keep: 'all', span: [0, 0.04], seconds: 4,
      say: 'The bones form an arch, held up by ligaments and by muscles in the sole. The arch flattens a little under your weight and springs back.' },
  ],

  hand: [
    { title: 'Twenty-seven bones', entry: 'handMetacarpals', labels: ['handMetacarpals', 'handFingerBones'], span: [0, 0.04], seconds: 4,
      say: 'The hand has twenty-seven bones. Most of the muscles that move the fingers are not in the hand at all.' },
    { title: 'Tendons from the forearm', entry: 'handMetacarpals', frame: ['handMetacarpals', 'handFingerBones'], from: [-0.2, -0.35, 1], labels: ['handMetacarpals'], keep: 'all', span: [0, 0.5], seconds: 5,
      say: 'To make a fist, tendons pull the fingers closed. The tendons come from muscles up in the forearm.' },
    { title: 'No muscles in the fingers', entry: 'handMetacarpals', frame: ['handMetacarpals', 'handFingerBones'], from: [0, -1, 0.75], labels: ['handMetacarpals'], keep: 'all', span: [0.5, 1], seconds: 5,
      say: 'The fingers themselves contain bones and tendons, and no muscles.' },
    { title: 'Small muscles in the palm', entry: 'handThenar', frame: ['handThenar', 'handHypothenar', 'handMetacarpals'], labels: ['handThenar', 'handHypothenar', 'handInterossei'], keep: 'all', span: [0, 0.04], seconds: 4,
      say: 'Small muscles in the palm do the fine work. The pad at the base of the thumb moves the thumb across to meet the fingers.' },
  ],

  spine: [
    { title: 'A column of bones', entry: 'lumbarVertebrae', labels: ['spineCervical', 'thoracicVertebrae', 'lumbarVertebrae', 'sacrum'], span: [0, 0.02], seconds: 4,
      say: 'The spine is a column of thirty-three bones. It holds the body up, protects the spinal cord, and still bends.' },
    { title: 'Bending forward', entry: 'discs', frame: ['thoracicVertebrae', 'lumbarVertebrae'], from: [1, 0.1, 0.25], labels: ['discs', 'lumbarVertebrae'], keep: 'all', span: [0, 0.5], seconds: 5,
      say: 'Between the bones are discs. Each disc allows a few degrees of bending. There are twenty-three of them, and together they let you bend right over.' },
    { title: 'Bending sideways', entry: 'lumbarVertebrae', frame: ['thoracicVertebrae', 'lumbarVertebrae'], from: [0.1, 0.1, -1], labels: ['thoracicVertebrae', 'lumbarVertebrae'], keep: 'all', span: [0.5, 1], seconds: 5,
      say: 'Small joints at the back of each vertebra guide the movement, and stop it going too far.' },
    { title: 'The spinal cord', entry: 'spinalCord', frame: ['thoracicVertebrae', 'lumbarVertebrae'], from: [0.8, 0.1, -0.6], labels: ['spinalCord', 'spineCaudaEquina', 'spineNerveRoots'], span: [0, 0.02], seconds: 4,
      say: 'The spinal cord runs down a canal inside the column. A pair of nerves leaves between each two bones.' },
  ],

  femalePelvis: [
    { title: 'An egg, once a month', entry: 'uterus', labels: ['ovary', 'uterineTube', 'uterus'],
      say: 'About once a month an ovary releases an egg. This follows the egg to the uterus.' },
    { title: 'The ovary releases an egg', entry: 'ovary', frame: ['ovary', 'uterineTube'], labels: ['ovary'], keep: 'all', span: [0, 0.2], seconds: 4,
      say: 'An egg ripens in one of the two ovaries, and is released from its surface.' },
    { title: 'The tube catches it', entry: 'uterineTube', frame: ['ovary', 'uterineTube'], labels: ['uterineTube', 'ovary'], keep: 'all', span: [0.14, 0.4], seconds: 4.5,
      say: 'The end of the uterine tube has a fringe. It sweeps over the ovary and catches the egg.' },
    { title: 'Along the tube', entry: 'uterineTube', frame: ['uterineTube', 'uterus'], labels: ['uterineTube'], keep: 'all', span: [0.36, 0.82], seconds: 6,
      say: 'Fine hairs and gentle squeezing move the egg along the tube. This takes several days. If the egg is fertilised, it happens here.' },
    { title: 'Into the uterus', entry: 'uterus', frame: ['uterus', 'cervix'], labels: ['uterus'], keep: 'all', span: [0.8, 1], seconds: 4,
      say: 'The egg reaches the uterus, where the lining has thickened. A fertilised egg settles into the lining. If the egg is not fertilised, the lining is shed as a period.' },
  ],

  clitoris: [
    { title: 'Mostly inside', entry: 'clitorisGlans', labels: ERECTILE, span: [0, 0.02], seconds: 4,
      say: 'Only the tip of the clitoris can be seen from outside. The rest is inside: a body, two legs called crura, and two bulbs beside the vaginal opening.' },
    { title: 'Blood flows in', entry: 'clitorisPudendalVessels', frame: [...ERECTILE, 'clitorisPudendalVessels'], labels: ['clitorisPudendalVessels'], keep: 'all', span: [0.04, 0.3], seconds: 5,
      say: 'All of it is erectile tissue, the same kind as in the penis. During arousal, an artery on each side brings in more blood.' },
    { title: 'The bulbs and crura swell', entry: 'clitorisBulbs', frame: ERECTILE, labels: ['clitorisCrura', 'clitorisBulbs'], keep: 'all', once: true, span: [0.1, 0.52], seconds: 6,
      say: 'The tissue fills like a sponge. The bulbs and the crura swell and become firm, and the glans becomes more sensitive.' },
    { title: 'Muscles hold the blood in', entry: 'clitorisBulbospongiosus', frame: ERECTILE, labels: ['clitorisIschiocavernosus', 'clitorisBulbospongiosus'], keep: 'all', span: [0.54, 0.8], seconds: 5,
      say: 'Two pairs of muscles lie over the crura and the bulbs. When they tighten, they press on the veins and keep the blood in.' },
    { title: 'Afterwards', entry: 'clitorisBulbs', frame: ERECTILE, labels: [], keep: 'all', once: true, span: [0.8, 0.999], seconds: 5,
      say: 'Afterwards the arteries narrow again. The blood drains away, and the tissue goes back to its resting size.' },
  ],

  malePelvis: [
    { title: 'One way out for two things', entry: 'urethra', labels: ['bladder', 'prostate', 'urethra'], span: [0, 0.02], seconds: 4,
      say: 'In a man, urine and semen leave by the same tube, the urethra, but not at the same time.' },
    { title: 'Urine leaves the bladder', entry: 'bladder', frame: ['bladder', 'prostate', 'urethra'], labels: ['bladder', 'prostate', 'urethra'], keep: 'all', span: [0.02, 0.48], seconds: 5, streams: [0],
      say: 'The bladder squeezes, and urine runs out through the middle of the prostate and along the urethra.' },
    { title: 'Sperm arrive', entry: 'deferentDuct', frame: ['deferentDuct', 'seminalVesicle', 'prostate'], from: [0.5, 0.3, -0.8], labels: ['deferentDuct'], span: [0.52, 0.98], seconds: 5, streams: [1, 2],
      say: 'Sperm come up from the testes by the two deferent ducts, which loop over the bladder to reach the prostate.' },
    { title: 'Fluid is added', entry: 'seminalVesicle', frame: ['seminalVesicle', 'prostate'], from: [0.5, 0.3, -0.8], labels: ['deferentDuct', 'seminalVesicle', 'prostate'], span: [0.52, 0.98], seconds: 5, streams: [1, 2],
      say: 'The seminal vesicles and the prostate add most of the fluid. The mixture is semen, and it leaves by the urethra.' },
  ],

  penis: [
    { title: 'Where sperm come from', entry: 'testis', labels: ['testis', 'epididymis', 'deferentDuct'], streams: [0, 1],
      say: 'Sperm are made in the testes. This shows where they are made and stored, and the way out. Then it shows how an erection happens.' },
    { title: 'Made in the testes', entry: 'testis', frame: ['testis', 'epididymis'], labels: ['testis'], keep: 'all', span: [0, 0.33], seconds: 5, streams: [0, 1],
      say: 'Sperm are made inside the testes, more than a thousand every second.' },
    { title: 'Stored in the epididymis', entry: 'epididymis', frame: ['testis', 'epididymis'], from: [0.6, 0.1, -0.8], labels: ['epididymis'], keep: 'all', span: [0.33, 0.66], seconds: 5, streams: [0, 1],
      say: 'They move into the epididymis, a coiled tube behind each testis, and spend up to two weeks there maturing.' },
    { title: 'Up the deferent duct', entry: 'deferentDuct', frame: ['epididymis', 'deferentDuct'], labels: ['deferentDuct'], keep: 'all', span: [0.33, 0.66], seconds: 5, streams: [0, 1],
      say: 'From there the deferent duct carries them up into the pelvis.' },
    { title: 'Blood fills the penis', entry: 'penisDeepArtery', frame: ['penisCorpusCavernosum', 'penisGlans'], labels: ['penisCorpusCavernosum', 'penisDeepArtery'], keep: 'all', span: [0.7, 0.98], seconds: 5, streams: [2, 3],
      say: 'An erection is made by blood. An artery runs down the middle of each of the two corpora cavernosa. The arteries widen, and blood fills the spongy tissue.' },
    { title: 'The veins are pressed shut', entry: 'penisDeepDorsalVein', frame: ['penisCorpusCavernosum', 'penisGlans'], labels: ['penisCorpusCavernosum', 'penisDeepDorsalVein'], keep: 'all', span: [0.7, 0.98], seconds: 5, streams: [2, 3],
      say: 'The tissue swells inside a tough coat and presses the veins shut against it. Blood comes in faster than it can leave, and the penis becomes firm.' },
  ],
};
