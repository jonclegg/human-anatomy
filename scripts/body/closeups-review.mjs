// Screenshots of every close-up as the visitor sees it, to build/review/closeups/<sex>-<id>.png (with the site served:
// npm run serve:body). Usage: node scripts/body/closeups-review.mjs [sex] [region ...]; a region may end in "+cut"
// for the midline cut, and "body" stands for the whole-body view.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { REGIONS } from '../../site/body/closeups.mjs';

const [only, ...wanted] = process.argv.slice(2);
const out = new URL('../../build/review/closeups/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const sex of only ? [only] : ['female', 'male']) {
  const ids = wanted.length ? wanted : Object.values(REGIONS).filter(region => !region.sex || region.sex === sex).map(region => region.id);
  for (const item of ids) {
    const [id, cut] = item.split('+');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => console.error(`${sex} ${item}: page error: ${error.message}`));
    await page.goto(`http://127.0.0.1:4174/?sex=${sex}${id === 'body' ? '' : `&closeup=${id}`}`);
    await page.waitForSelector('html[data-model-ready="true"]', { timeout: 120_000 });
    await page.evaluate(async cut => {
      const m = window.bodyModel, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      await m.ready();
      if (cut) document.querySelector('#cutBtn').click();
      await wait(300);
      while (m.busy()) await wait(100);
      await wait(400);
    }, cut === 'cut');
    await page.screenshot({ path: new URL(`${sex}-${item}.png`, out).pathname });
    console.log(`build/review/closeups/${sex}-${item}.png`);
    await page.close();
  }
}
await browser.close();
