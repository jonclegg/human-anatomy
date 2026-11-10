// Checks the close-ups (site/body/closeups/) against the built bodies: every listed part must match structures in each
// body that has the region, and every entry must have its text. Prints, per region and body, how many structures each
// part takes. Usage: node scripts/body/check-closeups.mjs [region]
import { readParts } from './built.mjs';
import { REGIONS, ALL, indexParts, regionContext } from '../../site/body/closeups.mjs';

const only = process.argv[2];
let problems = 0;
const problem = text => { problems++; console.log(`  PROBLEM: ${text}`); };
for (const region of Object.values(REGIONS)) {
  if (only && region.id !== only) continue;
  console.log(`\n${region.id}: ${region.name}`);
  for (const field of ['name', 'note', 'title', 'figure', 'text', 'parts', 'direction']) if (region[field] === undefined) problem(`no ${field}`);
  for (const sex of region.sex ? [region.sex] : ['female', 'male']) {
    if (!(region.text?.[sex] || region.text?.any)) problem(`no opening text for the ${sex} body`);
    const data = readParts(sex), index = indexParts(data.parts, sex, data.height, region), { context, min, max } = regionContext(data.parts, index, region);
    console.log(`  ${sex}: box ${max.map((value, c) => (value - min[c]).toFixed(0)).join(' x ')} cm, ${context.size} context structures`);
    region.parts.forEach((key, k) => {
      const found = index.entries[key] || [], entry = ALL[key];
      const missing = (!entry.sex || entry.sex === sex) && !found.length;
      console.log(`    ${String(k + 1).padStart(2)} ${key}: ${found.length}${found.length && found.length <= 4 ? ` (${found.map(at => data.parts[at].name).join('; ')})` : ''}`);
      if (missing) problem(`${key} matches nothing in the ${sex} body`);
    });
  }
  for (const key of region.parts) {
    const entry = ALL[key];
    for (const field of ['name', 'what', 'does', 'bug', 'stats']) if (!entry[field]) problem(`${key} has no ${field}`);
    if (entry.stats && (entry.stats.length !== 3 || entry.stats.some(row => row.length !== 2))) problem(`${key} needs three stats of [label, value]`);
  }
}
console.log(problems ? `\n${problems} problem${problems > 1 ? 's' : ''}` : '\nall close-ups check out');
process.exit(problems ? 1 : 0);
