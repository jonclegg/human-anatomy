// Close-up sheets of a built body: node scripts/body/shots.mjs <sex> <name> <view> '<json: [[label, target, position], ...] as shares of height>' [clothed]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [sex, name, view, json, clothed] = process.argv.slice(2);
const out = new URL(`../../build/review/${sex}/`, import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => console.error('page error:', error.message));
await page.goto(`http://127.0.0.1:4174/?sex=${sex}`);
await page.waitForSelector('html[data-model-ready="true"]', { timeout: 120_000 });
const sheet = await page.evaluate(async ({ view, clothed, angles }) => {
  const m = window.bodyModel, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (m.state.view !== view) document.querySelector(`#views [data-view="${view}"]`).click();
  await wait(300); await m.ready();
  while (m.busy()) await wait(100);
  if (m.state.clothed !== clothed) document.querySelector('[data-toggle="clothed"]').click();
  document.querySelectorAll('.masthead,#inspector,.rail,.views,.top-right,.figure,#heightRuler,#labels,#isolateChip,.hint').forEach(el => { el.style.visibility = 'hidden'; });
  const h = m.body().height;
  const canvas = document.getElementById('scene'), W = canvas.width, H = canvas.height, tile = [600, 450];
  const composite = document.createElement('canvas'); composite.width = tile[0] * 3; composite.height = tile[1] * Math.ceil(angles.length / 3);
  const g = composite.getContext('2d'); g.fillStyle = '#e3e5e6'; g.fillRect(0, 0, composite.width, composite.height);
  for (let k = 0; k < angles.length; k++) {
    const [label, t, p] = angles[k], target = t.map(v => v * h), position = p.map(v => v * h);
    m.controls.dispatchEvent({ type: 'start' });
    m.controls.target.set(...target); m.camera.position.set(...position); m.camera.lookAt(...target); m.controls.update();
    m.coverage();
    const image = new Image(); image.src = canvas.toDataURL(); await image.decode();
    const s = Math.min(tile[0] / W, tile[1] / H), x = (k % 3) * tile[0], y = Math.floor(k / 3) * tile[1];
    g.drawImage(image, x + (tile[0] - W * s) / 2, y + (tile[1] - H * s) / 2, W * s, H * s);
    g.fillStyle = '#111'; g.font = '600 16px sans-serif'; g.fillText(label, x + 10, y + 22);
  }
  return composite.toDataURL('image/png');
}, { view, clothed: clothed === 'clothed', angles: JSON.parse(json) });
writeFileSync(new URL(`${name}.png`, out), Buffer.from(sheet.split(',')[1], 'base64'));
console.log(`build/review/${sex}/${name}.png`);
await browser.close();
