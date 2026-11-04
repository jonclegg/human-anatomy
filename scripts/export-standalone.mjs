// Turns site/index.html (written for the claude.ai artifact host, which adds the document skeleton)
// into a complete page for wooten-labs.com: node scripts/export-standalone.mjs <output.html>
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const output = process.argv[2];
if (!output) throw new Error('usage: node scripts/export-standalone.mjs <output.html>');
const headEnd = source.indexOf('</style>') + '</style>'.length;
if (headEnd < '</style>'.length) throw new Error('site/index.html has no <style> block');
const head = source.slice(0, headEnd)
  .replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
  .replace('<style>', '<style>\nbody { margin: 0; }');
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${source.slice(headEnd).trim()}
</body>
</html>
`;
await writeFile(output, page);
console.log(`wrote ${output}`);
