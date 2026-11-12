// Close-ups: a region of the body shown on its own, with its own numbered parts and notes.
//
// A region (REGIONS, in closeups/*.mjs):
//   name, note        its name in the trail, Contents and the search, and the search's line under it: "Heart", "chambers, valves and coronary arteries"
//   title, figure     the sheet's heading and the figure caption
//   group             (set here) the part of the body it is listed under in Contents, from the file it is in
//   text              { any } or { female, male }: the opening paragraph
//   sex               'female' or 'male' when only one body has it
//   parts             the region's parts in order, as entry keys: its own (DETAILS) or the main ones (ENTRIES in parts.mjs)
//   context           what else is drawn, faint, for orientation: [{ layer, pattern }] (either may be left out), limited
//                     to structures that touch the box around the region's parts
//   direction         from the subject toward the camera: [x, y, z], +x the body's left, +y up, +z the front
//   frame, margin     the parts the camera frames, with cm of room around them, when that is not all of them: a joint,
//                     where the bones that meet at it are far longer than the joint
//   body              how solid the skin is, 0 to 1
//   uncovered         true when the clothing comes off (the pelvis)
//
// A detail entry (DETAILS) has the fields of a main entry (parts.mjs): pattern, layer, name, aka, short, what, does, bug,
// stats, other, whole, sex, where; and side ('left' or 'right') to take only that side's structures. Inside a region its
// own entries are matched first, in the order of its parts, then the main entries; outside regions only the main ones.
import { ENTRIES } from './parts.mjs';
import * as reproductive from './closeups/reproductive.mjs';
import * as head from './closeups/head.mjs';
import * as trunk from './closeups/trunk.mjs';
import * as limbs from './closeups/limbs.mjs';

/* the part of the body each file's regions belong to, in the order Contents lists them */
const FILES = [['Head and neck', head], ['Chest and abdomen', trunk], ['Pelvis', reproductive], ['Limbs and back', limbs]];
export const GROUPS = FILES.map(([group]) => group);
export const REGIONS = {}, DETAILS = {};
for (const [group, file] of FILES) {
  for (const [key, region] of Object.entries(file.REGIONS)) { if (REGIONS[key]) throw new Error(`two close-ups are called ${key}`); REGIONS[key] = { ...region, id: key, group }; }
  for (const [key, entry] of Object.entries(file.DETAILS)) { if (DETAILS[key] || ENTRIES[key]) throw new Error(`two entries are called ${key}`); DETAILS[key] = entry; }
}
export const ALL = { ...ENTRIES, ...DETAILS };
for (const region of Object.values(REGIONS)) for (const key of region.parts) if (!ALL[key]) throw new Error(`close-up ${region.id} lists ${key}, which is no entry`);

export const sideOfPart = part => part.side || (part.centre[0] > 0.5 ? 'left' : part.centre[0] < -0.5 ? 'right' : null);
const takes = (entry, part, sex, height) => (!entry.layer || entry.layer === part.layer) && entry.pattern.test(part.name) && (!entry.sex || entry.sex === sex)
  && (!entry.side || entry.side === sideOfPart(part)) && (!entry.where || entry.where(part, height));   // where: a test of place, for names shared by distant parts

/**
 * Which entry each structure belongs to: the first, in order, whose pattern its name matches.
 * Returns { keys (the entries in matching order), entryOf (per structure, an index into keys or -1), entries (key ->
 * structure indices), order (the numbered parts: a region's own list, or every main entry the body has) }.
 */
export function indexParts(parts, sex, height, region = null) {
  const keys = region ? [...region.parts.filter(key => DETAILS[key]), ...Object.keys(ENTRIES)] : Object.keys(ENTRIES);
  const entryOf = new Int16Array(parts.length).fill(-1), entries = {};
  parts.forEach((part, index) => {
    const at = keys.findIndex(key => takes(ALL[key], part, sex, height));
    if (at >= 0) { entryOf[index] = at; (entries[keys[at]] ||= []).push(index); }
  });
  return { keys, entryOf, entries, order: (region ? region.parts : keys).filter(key => entries[key]) };
}

/* the box around a region's parts, and which other structures are its faint context */
const HAND_BONES = /scaphoid|lunate|triquetr|pisiform|trapezi|trapezoid|capitate|hamate|metacarpal bone|phalanx of .*(finger|thumb)/i;
const FOOT_BONES = /talus|calcaneus|navicular bone|cuboid bone|cuneiform bone|metatarsal bone|phalanx of .*toe|sesamoid bone of .*foot/i;
export function regionContext(parts, index, region) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const key of index.order) for (const at of index.entries[key]) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], parts[at].min[c]); max[c] = Math.max(max[c], parts[at].max[c]); }
  const own = new Set(index.order.flatMap(key => index.entries[key]));
  const context = new Set();
  parts.forEach((part, at) => {
    if (own.has(at) || part.layer === 'skin') return;
    if (!(region.context || []).some(rule => (!rule.layer || rule.layer === part.layer) && (!rule.pattern || rule.pattern.test(part.name)))) return;
    if ([0, 1, 2].every(c => part.max[c] >= min[c] && part.min[c] <= max[c])) context.add(at);
  });
  /* A hand or a foot is shown whole or not at all. The box catches whatever reaches into it, and of a foot below a
     knee that is the ankle and one long bone: cut off like that it reads as a stray piece, not as a foot. */
  for (const bones of [HAND_BONES, FOOT_BONES]) for (const side of [-1, 1]) {
    const all = parts.map((part, at) => at).filter(at => parts[at].layer === 'skeleton' && bones.test(parts[at].name) && Math.sign(parts[at].centre[0]) === side);
    const faint = all.filter(at => context.has(at));
    if (faint.length && faint.length < all.length && !all.some(at => own.has(at))) for (const at of faint) context.delete(at);
  }
  return { min, max, own, context };
}
