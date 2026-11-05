// Reads the BodyParts3D v4.0 "is-a" OBJ set: one mesh per structure, all in one body frame (mm).
// Each OBJ header names its structure; the folder's _index.csv names are less reliable, so the header wins.
// The BodyParts3D frame: +x the body's left, -y the front, +z up. The model's frame is cm, +x left, +y up, +z front,
// with the floor at y = 0 and the body centred left-right and front-back on its pelvis.
import { readdirSync, readFileSync } from 'node:fs';

export const FRAME = { centreX: 0, centreY: -70, floor: -78.1 };   // mm: the midline, the hip bones' front-to-back middle, the soles
export const toModel = (x, y, z) => [(x - FRAME.centreX) / 10, (z - FRAME.floor) / 10, -(y - FRAME.centreY) / 10];

const capital = text => text.charAt(0).toUpperCase() + text.slice(1);

/* every structure: its file, element id, FMA concept, name and bounds (model frame, cm). Exact duplicates are dropped. */
export function listStructures(root) {
  const structures = [], seen = new Set();
  for (const folder of readdirSync(root)) {
    const directory = `${root}/${folder}/BodyParts3D (OBJ)`;
    let files;
    try { files = readdirSync(directory).filter(file => file.endsWith('.obj')).sort(); } catch { continue; }
    const index = Object.fromEntries(readFileSync(`${directory}/_index.csv`, 'utf8').trim().split('\n').slice(1)
      .map(line => line.match(/^"?(.*?\.obj)"?,([^,]*),"?(.*?)"?$/)).filter(Boolean).map(match => [match[1], match[3]]));
    for (const file of files) {
      const head = readFileSync(`${directory}/${file}`, 'utf8').slice(0, 2048);
      const field = key => (head.match(new RegExp(`# ${key} : (.*)`)) || [])[1]?.trim();
      const bounds = head.match(/Bounds\(mm\): \(([^)]*)\)-\(([^)]*)\)/);
      const name = capital(field('English name') || index[file] || file.replace(/^\S+ - |\.obj$/g, ''));
      const key = `${name}|${bounds?.[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      structures.push({ id: field('File ID'), concept: field('Concept ID'), name, folder, path: `${directory}/${file}` });
    }
  }
  return structures;
}

/* the mesh, in the model frame (cm): flat positions and triangle indices */
export function readMesh(path) {
  const positions = [], indices = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('v ')) { const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number); positions.push(...toModel(x, y, z)); }
    else if (line.startsWith('f ')) {
      const corners = line.slice(2).trim().split(/\s+/).map(corner => parseInt(corner) - 1);
      for (let k = 1; k + 1 < corners.length; k++) indices.push(corners[0], corners[k], corners[k + 1]);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
