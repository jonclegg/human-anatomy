// Contact sheets for looking a body over after a build: every view (the body clothed and unclothed, skeleton, muscles,
// organs, vessels, nerves), each from the front, back and side and close on the head, chest and pelvis, six to a sheet.
// Needs the site served (npm run serve:body). Writes build/review/<sex>/<view>.png.
// Usage: node scripts/body/review.mjs <female|male> [view ...]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [sex = 'female', ...only] = process.argv.slice(2);
const VIEWS = [['body-clothed', 'body', true], ['body', 'body', false], ['skeleton', 'skeleton', false], ['muscles', 'muscles', false],
  ['organs', 'organs', false], ['vessels', 'vessels', false], ['nerves', 'nerves', false]].filter(([name]) => !only.length || only.includes(name));
const out = new URL(`../../build/review/${sex}/`, import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => console.error('page error:', error.message));
await page.goto(`http://127.0.0.1:4174/?sex=${sex}`);
await page.waitForSelector('html[data-model-ready="true"]', { timeout: 120_000 });
for (const [name, view, clothed] of VIEWS) {
  const sheet = await page.evaluate(async ({ view, clothed }) => {
    const m = window.bodyModel, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    if (m.state.view !== view) document.querySelector(`#views [data-view="${view}"]`).click();
    await wait(300); await m.ready();
    while (m.busy()) await wait(100);
    if (m.state.clothed !== clothed) document.querySelector('[data-toggle="clothed"]').click();
    document.querySelectorAll('.masthead,#inspector,.rail,.views,.top-right,.figure,#heightRuler,#labels,#isolateChip,.hint').forEach(el => { el.style.visibility = 'hidden'; });
    const h = m.body().height;
    const angles = [['front', [0, h * 0.53, 0], [0, h * 0.55, h * 1.25]], ['back', [0, h * 0.53, 0], [0, h * 0.55, -h * 1.25]],
      ['side', [0, h * 0.53, 0], [h * 1.25, h * 0.55, 0]], ['head', [0, h * 0.93, 3], [-14, h * 0.94, 50]],
      ['chest', [0, h * 0.72, 2], [-30, h * 0.74, 80]], ['pelvis, back', [0, h * 0.54, 0], [25, h * 0.56, -80]]];
    const canvas = document.getElementById('scene'), W = canvas.width, H = canvas.height, tile = [600, 450];
    const composite = document.createElement('canvas'); composite.width = tile[0] * 3; composite.height = tile[1] * 2;
    const g = composite.getContext('2d'); g.fillStyle = '#e3e5e6'; g.fillRect(0, 0, composite.width, composite.height);
    for (let k = 0; k < angles.length; k++) {
      const [label, target, position] = angles[k];
      m.controls.dispatchEvent({ type: 'start' });   // stops any camera flight
      m.controls.target.set(...target); m.camera.position.set(...position); m.camera.lookAt(...target); m.controls.update();
      m.coverage();   // renders the frame
      const image = new Image(); image.src = canvas.toDataURL(); await image.decode();
      const s = Math.min(tile[0] / W, tile[1] / H), x = (k % 3) * tile[0], y = Math.floor(k / 3) * tile[1];
      g.drawImage(image, x + (tile[0] - W * s) / 2, y + (tile[1] - H * s) / 2, W * s, H * s);
      g.fillStyle = '#111'; g.font = '600 16px sans-serif'; g.fillText(label, x + 10, y + 22);
    }
    return composite.toDataURL('image/png');
  }, { view, clothed });
  writeFileSync(new URL(`${name}.png`, out), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log(`${sex} ${name}: build/review/${sex}/${name}.png`);
}
await browser.close();
