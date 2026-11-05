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

/* "VH_F_left_ventricle" -> "Left ventricle"; a trailing _L / _R becomes a leading Left / Right */
export function cleanName(raw) {
  let name = raw.replace(/^VH_[FM]_/, '').replace(/^Allen_/, '').replace(/^Yao_/, '').replace(/_+/g, ' ').trim();
  const side = name.match(/\s([LR])$/) || name.match(/\s([LR])(?=\s)/);
  if (side) name = `${side[1] === 'L' ? 'left' : 'right'} ${name.replace(/\s[LR](\s|$)/, ' ').trim()}`;
  name = name.replace(/\s\d+$/, '').replace(/\b(sup)$/, 'superior').replace(/\b(inf)$/, 'inferior');
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
      out.push({ raw: node.getName(), name: cleanName(node.getName()), positions, indices });
    }
  }
  return out;
}
