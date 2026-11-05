// Collects a body's structures into parts.json and one GLB per layer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { LAYERS, regionOf } from './systems.mjs';
import { weld, simplify, bounds, volume, writeLayer } from './mesh.mjs';

/* surface error allowed by the simplifier, cm: bone keeps its detail, the skin is context */
export const ERROR = { skeleton: 0.025, muscles: 0.05, organs: 0.03, vessels: 0.035, nerves: 0.035, skin: 0.08 };
/* and the least share of its triangles a structure keeps: the skin is one big mesh whose fingers and face need them */
export const MINIMUM_SHARE = { skeleton: 0.04, muscles: 0.04, organs: 0.04, vessels: 0.04, nerves: 0.04, skin: 0.3 };

export class Assembly {
  constructor(sex, height) { this.sex = sex; this.height = height; this.parts = []; this.pieces = Object.fromEntries(LAYERS.map(layer => [layer, []])); }
  /* a mesh already in the model frame; welded and simplified here unless told it already is */
  add({ name, layer, group = null, source, fitted = false, id = null, concept = null }, mesh, { prepared = false } = {}) {
    if (!LAYERS.includes(layer)) throw new Error(`unknown layer ${layer} for ${name}`);
    const ready = prepared ? mesh : simplify(weld(mesh), ERROR[layer], MINIMUM_SHARE[layer]);
    if (ready.indices.length === 0) throw new Error(`${name} simplified to nothing`);
    const { min, max } = bounds(ready.positions), centre = min.map((value, axis) => (value + max[axis]) / 2);
    name = tidyName(name, { min, max, centre, height: this.height });
    /* the same mesh twice under one name (BodyParts3D has a few pelvic-floor muscles twice) is drawn once */
    const size = max.map((value, axis) => value - min[axis]);
    const key = `${name}|${layer}|${centre.map(value => Math.round(value * 2)).join(',')}|${size.map(value => Math.round(value * 2)).join(',')}`;   // to half a centimetre
    if ((this.seen ||= new Set()).has(key)) { this.repeats = (this.repeats || 0) + 1; return null; }
    this.seen.add(key);
    const part = {
      name, layer, group: group || regionOf(name, centre, this.height),
      side: /^left\b|\bleft\b/i.test(name) ? 'left' : /^right\b|\bright\b/i.test(name) ? 'right' : null,
      source, ...(fitted ? { fitted: true } : {}), ...(id ? { id } : {}), ...(concept ? { concept } : {}),
      centre: centre.map(round), min: min.map(round), max: max.map(round), volume: round(volume(ready)),
    };
    this.parts.push(part);
    this.pieces[layer].push({ ...ready, part: this.parts.length - 1 });
    return part;
  }
  async write(folder) {
    mkdirSync(folder, { recursive: true });
    console.log(`${this.sex}: ${this.repeats || 0} repeated meshes dropped; ${sidesTurned.length} names turned to the side the structure is on${sidesTurned.length ? `: ${sidesTurned.join('; ')}` : ''}`);
    const files = {};
    for (const layer of LAYERS) {
      const { glb, triangles } = await writeLayer(this.pieces[layer]);
      writeFileSync(new URL(`${layer}.glb`, folder), glb);
      files[layer] = { triangles, bytes: glb.byteLength };
      console.log(`${this.sex} ${layer}: ${this.pieces[layer].length} structures, ${triangles} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB`);
    }
    writeFileSync(new URL('parts.json', folder), JSON.stringify({ sex: this.sex, height: this.height, files, parts: this.parts }));
  }
}

export function round(value) { return Math.round(value * 100) / 100; }

/* Source names, tidied: typos, a stray full stop, leftover codes; a left or right that names the other side from where
   the structure lies (some source files swap them; one brain set is mirrored) is turned to the side it is on. Organs that
   reach across the midline by nature (the heart's chambers, the liver's lobes, the gut's arteries) keep their names. */
const TYPOS = [[/\bPosetrior\b/i, 'Posterior'], [/\bposetrior\b/, 'posterior'], [/^ingulo/i, 'Cingulo'], [/\bof FuGt\b/, 'of fusiform gyrus'], [/ area [FT]l$/, '']];
const CROSSES_MIDLINE = /^(left|right) (ventricle|atrium|auricle)|(of|to) (left|right) (ventricle|atrium)|atri(um|al)|auricle|valve|cusp|papillary|chorda|conus|trabecul|coronary|cardiac|marginal (branch|artery|vein)|interventricular|hepatic|liver|portal|gastr|colic|epiploic|lobe of|segment of|bronch|lung|pulmonary|vagus|crus of|bundle|brachiocephalic|subclavian|carotid|duct|lymphatic trunk/i;
export function tidyName(name, { min, max, centre, height }) {
  for (const [pattern, replacement] of TYPOS) name = name.replace(pattern, replacement);
  name = name.replace(/\.$/, '').replace(/ B(I|II|III|IV|V|VI|VII|VIII|IX|X)$/, '');
  /* a metacarpal vein in the foot is a metatarsal one */
  if (/metacarpal/i.test(name) && centre[1] < 0.12 * height) name = name.replace(/metacarpal/i, 'metatarsal');
  const word = name.match(/\b(left|right)\b/i);
  if (word && !CROSSES_MIDLINE.test(name)) {
    const saysLeft = word[1].toLowerCase() === 'left';
    const onLeft = min[0] > 0.3, onRight = max[0] < -0.3;   // +x is the body's left
    if ((saysLeft && onRight) || (!saysLeft && onLeft)) {
      const swapped = saysLeft ? 'right' : 'left';
      name = name.slice(0, word.index) + (word[1][0] === word[1][0].toUpperCase() ? swapped[0].toUpperCase() + swapped.slice(1) : swapped) + name.slice(word.index + word[1].length);
      sidesTurned.push(name);
    }
  }
  return name;
}
export const sidesTurned = [];
