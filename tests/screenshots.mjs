// Saves screenshots of each view in WebKit for a visual check: node tests/screenshots.mjs
import { webkit, devices } from '@playwright/test';
const browser = await webkit.launch();
for (const [name, options] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 13']]]) {
  const page = await browser.newPage(options);
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('html[data-model-ready="true"]');
  for (const view of ['front', 'clitoris', 'pee', 'inside']) {
    await page.locator(`#views [data-view="${view}"]`).click();
    await page.waitForFunction(() => !window.wootenManual.busy());
    await page.screenshot({ path: `screens/${name}-${view}.png` });
  }
  if (name === 'desktop') {
    await page.locator('#tourBtn').click();
    await page.waitForFunction(() => !window.wootenManual.busy());
    await page.screenshot({ path: 'screens/desktop-tour.png' });
  }
}
await browser.close();
