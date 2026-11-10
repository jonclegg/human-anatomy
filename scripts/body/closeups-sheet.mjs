// Contact sheets of the close-up screenshots (closeups-review.mjs), six to a sheet: build/review/closeups/sheet-<sex>-<n>.jpg
// Usage: node scripts/body/closeups-sheet.mjs <sex>
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const [sex] = process.argv.slice(2);
const folder = new URL('../../build/review/closeups/', import.meta.url);
const files = readdirSync(folder).filter(name => name.startsWith(`${sex}-`) && name.endsWith('.png')).sort();
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1920, height: 800 } });
for (let n = 0; n < files.length; n += 6) {
  const tiles = files.slice(n, n + 6).map(name => `<img src="data:image/png;base64,${readFileSync(new URL(name, folder)).toString('base64')}" style="width:640px;height:400px;display:block">`);
  await page.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(3,640px)">${tiles.join('')}</body>`);
  writeFileSync(new URL(`sheet-${sex}-${n / 6}.jpg`, folder), await page.screenshot({ type: 'jpeg', quality: 80 }));
  console.log(`sheet-${sex}-${n / 6}.jpg: ${files.slice(n, n + 6).join(', ')}`);
}
await browser.close();
