// Reads Human Reference Atlas (NIH, CC BY 4.0) reference organs. Each sex's GLBs share one body frame
// (glTF axes: +x the body's left, +y up, +z front; metres; origin near the pubis), so organs line up when read together.
// The model's frame is cm with the floor at y = 0 and the body centred on its pelvis, as for BodyParts3D.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/* the frames, from the skin's lowest point and the bony pelvis (cm in the source): midline, front-to-back middle, floor */
export const FRAMES = {
  female: { centreX: -0.85, centreZ: -8.3, floor: -79.3 },
  male: { centreX: 0.55, centreZ: -3.25, floor: -91.3 },
};
export const toModel = (frame, [x, y, z]) => [x * 100 - frame.centreX, y * 100 - frame.floor, z * 100 - frame.centreZ];

/* typos and shorthand in the source names */
const FIXES = [[/jejenum/, 'jejunum'], [/ginviva/, 'gingiva'], [/ucinate process/, 'uncinate process of pancreas'], [/caecum/, 'cecum'], [/opthalmic/, 'ophthalmic'],
  [/fibria/, 'fimbriae'], [/epiglotic/, 'epiglottic'], [/eigth/, 'eighth'], [/heptopancreatic/, 'hepatopancreatic'], [/hepataduodenal/, 'hepatoduodenal'],
  [/schlemms/, "Schlemm's"], [/^ingulo/, 'cingulo'], [/segmennt|segm$/, 'segment'], [/heschls/, "Heschl's"], [/\bhth\b/i, 'hypothalamus'],
  [/papillary muscle of heart ant$/, 'anterior papillary muscle'], [/papillary muscle of heart antlat$/, 'anterolateral papillary muscle'], [/papillary muscle of heart med$/, 'medial papillary muscle'],
  [/papillary muscle of heart pos$/, 'posterior papillary muscle'], [/papillary muscle of heart posmed$/, 'posteromedial papillary muscle'], [/cardiac atrium/, 'atrium'], [/^lingula inferior bronchi$/, 'inferior lingular bronchus']];

/* "VH_F_left_ventricle" -> "Left ventricle"; a trailing _L / _R becomes a leading Left / Right; a trailing letter or
   number that only told pieces apart becomes "(part n)"; the organ's file adds context where the name lacks it */
export function cleanName(raw, file = '') {
  if (/bronchopulmonary_segm/.test(raw)) return lungSegmentName(raw);
  let name = raw.replace(/^VH_[FM]_/, '').replace(/^Allen_/, '').replace(/^Yao_/, '').replace(/_+/g, ' ').trim();
  const side = name.match(/\s([LR])$/) || name.match(/\s([LR])(?=\s)/);
  if (side) name = `${side[1] === 'L' ? 'left' : 'right'} ${name.replace(/\s[LR](\s|$)/, ' ').trim()}`;
  for (const [pattern, replacement] of FIXES) name = name.replace(pattern, replacement);
  name = name.replace(/\b(sup)$/, 'superior').replace(/\b(inf)$/, 'inferior');
  name = name.replace(/([a-z])(\d)$/, '$1 $2');
  const piece = name.match(/\s([a-k]|\d)$/);
  if (piece) name = `${name.slice(0, -2)} (part ${/\d/.test(piece[1]) ? Number(piece[1]) + 1 : 'abcdefghijk'.indexOf(piece[1]) + 1})`;
  if (/liver/.test(file) && /segment|lobe$/.test(name)) name += ' of liver';
  if (/spleen/.test(file) && !/spleen/.test(name)) name += ' of spleen';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/* "VH_M_lingula_superior_bronchopulmonary_segment" -> "Superior lingular segment of left lung" */
export function lungSegmentName(raw) {
  const words = raw.replace(/^VH_[MF]_/, '').replace(/segm\w*$/, '').replace(/bronchopulmonary_?/, '').split('_').filter(Boolean);
  const lung = words[0] === 'left' || words[0] === 'lingula' ? 'left' : 'right';
  const rest = words[0] === 'lingula' ? [...words.slice(1), 'lingular'] : words.slice(1);
  const name = `${rest.join(' ')} segment of ${lung} lung`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/* every mesh in a GLB: { name, raw, positions (model frame, cm), indices } */
export async function readOrgan(path, frame) {
  const document = await io.read(path), out = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;   // triangles only
      const position = primitive.getAttribute('POSITION'), count = position.getCount(), positions = new Float32Array(count * 3), p = [0, 0, 0];
      for (let k = 0; k < count; k++) {
        position.getElement(k, p);
        const world = [0, 1, 2].map(r => matrix[r] * p[0] + matrix[4 + r] * p[1] + matrix[8 + r] * p[2] + matrix[12 + r]);
        positions.set(toModel(frame, world), k * 3);
      }
      const indices = primitive.getIndices() ? Uint32Array.from(primitive.getIndices().getArray()) : Uint32Array.from({ length: count }, (_, k) => k);
      out.push({ raw: node.getName(), name: cleanName(node.getName(), path.split('/').pop()), positions, indices });
    }
  }
  return out;
}
