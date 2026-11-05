// Sorts every structure into the model's layers (one GLB file each) and, within a layer, a group for the parts list.
// BodyParts3D's own folders were sorted automatically and a few pieces sit in the wrong one (vessels among the
// muscles, a liver duct among the brain parts), so the structure's name decides first and the folder second.

export const LAYERS = ['skeleton', 'muscles', 'organs', 'vessels', 'nerves', 'skin'];

const VESSEL = /\b(arter(y|ies)|arteria|vein|veins|aorta|vena cava|coronary sinus|venous (arch|network)|plantar arch|palmar (arterial )?arch|deep palmar arch|pulmonary trunk|celiac trunk|brachiocephalic trunk|thyrocervical trunk|costocervical trunk)\b/i;
const HEART = /ventric|atri(um|al)|valve|cusp|leaflet|papillary|chorda/i;
const NERVE = /\b(nerve|ganglion|optic chiasm|optic tract)\b/i;
const LARYNX = /\b(thyroid cartilage|cricoid|arytenoid|corniculate|cuneiform cartilage|vocal ligament|thyrohyoid (ligament|membrane)|cricothyroid ligament|conus elasticus|epiglott|hyo-epiglottic|thyro-epiglottic)\b/i;
const EYE_MUSCLE = /\b(rectus|oblique|levator palpebrae|common tendinous ring|check ligament|trochlea of)\b/i;
const FACE_BONE = /\b(nasal bone|vomer|inferior nasal concha)\b/i;
const TOOTH = /\btooth\b/i;

export function classify({ name, folder }) {
  if (/hair\b|^eyebrow$/i.test(name) || folder === 'Skin') return { layer: 'skin', group: 'skin' };
  if (VESSEL.test(name) && !/papillary/i.test(name)) return { layer: 'vessels', group: vesselGroup(name) };
  if (/hepatic|liver/i.test(name)) return { layer: 'organs', group: 'digestive' };
  if (name === 'Linea alba') return { layer: 'muscles', group: 'trunk' };
  if (folder === 'Nervous' || NERVE.test(name)) return { layer: 'nerves', group: /nerve|ganglion|optic/i.test(name) ? 'nerves' : /spinal cord/i.test(name) ? 'spinal' : 'brain' };
  if (HEART.test(name)) return { layer: 'organs', group: 'heart' };
  if (folder === 'Circulatory') return { layer: 'vessels', group: vesselGroup(name) };
  if (LARYNX.test(name)) return { layer: 'organs', group: 'respiratory' };
  if (TOOTH.test(name)) return { layer: 'organs', group: 'digestive' };
  if (name === 'Mandible' || FACE_BONE.test(name) || name === 'Septal nasal cartilage') return { layer: 'skeleton', group: 'skull' };
  if (folder === 'Skeletal') return { layer: 'skeleton', group: null };
  if (folder === 'Muscular' || name === 'Uvular muscle') {
    if (/^taenia/i.test(name)) return { layer: 'organs', group: 'digestive' };
    return { layer: 'muscles', group: null };
  }
  if (folder === 'Sense Organs') return EYE_MUSCLE.test(name) ? { layer: 'muscles', group: 'head' } : { layer: 'organs', group: 'senses' };
  const groups = { Digestive: 'digestive', Respiratory: 'respiratory', Urinary: 'urinary', Reproductive: 'reproductive', Endocrine: 'endocrine', Lymphatic: 'lymphatic' };
  if (groups[folder]) return { layer: 'organs', group: groups[folder] };
  throw new Error(`no layer for ${name} (${folder})`);
}

function vesselGroup(name) {
  if (/vein|venous|vena cava|sinus/i.test(name)) return 'veins';
  return 'arteries';
}

/* skeleton and muscle groups follow the body region, from where the structure sits (model frame, cm) */
export function regionOf(name, centre, height) {
  const [x, y] = centre, h = y / height, side = Math.abs(x);
  if (/rib|costal|sternum|manubrium|xiphoid|clavicle|scapula|intercostal|pectoral|serratus|subclavius|diaphragm|transversus thoracis|levatores costarum/i.test(name)) return 'chest';
  if (/vertebra|disk|sacrum|intervertebral|atlas|axis/i.test(name)) return 'spine';
  if (h > 0.86) return 'head';
  if (h > 0.8 && side < 9) return 'neck';
  if (side > 15 && h > 0.37) return h < 0.47 ? 'hand' : 'arm';
  if (h < 0.06) return 'foot';
  if (h < 0.5 && side > 3) return 'leg';
  return h < 0.6 ? 'pelvis' : 'trunk';
}
