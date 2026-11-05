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
