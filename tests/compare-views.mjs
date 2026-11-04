// Renders the model from the angles of the reference drawings (Gray's 1166 midline cut, the Amphis clitoris
// drawing, the frontal schematic): node tests/compare-views.mjs  (needs the test server on PORT, default 4173)
import { webkit } from '@playwright/test';
const port = process.env.PORT || 4173;
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForSelector('html[data-model-ready="true"]');
const shots = [
  ['gray1166', { view: 'pee', xray: 0, layers: { bones: true, muscle: false }, position: [34, 5.5, 0.5], target: [0, 5.5, 0.5], up: [0, 1, 0] }],
  ['clitoris-front', { view: 'clitoris', xray: 0.95, layers: { bones: false, reproductive: true, urinary: true, glands: false }, position: [0, -26, 3], target: [0, 1.6, 0.6], up: [0, 0, 1] }],
  ['frontal', { view: 'inside', xray: 0.95, layers: { bones: true, neighbors: false, clitoris: false }, position: [0, 6, 44], target: [0, 6, 0], up: [0, 1, 0] }],
];
for (const [name, v] of shots) {
  await page.evaluate(v => {
    const m = window.wootenManual;
    m.setView(v.view);
    Object.assign(m.state.layers, v.layers);
    const xray = document.getElementById('xray'); xray.value = v.xray * 100; xray.dispatchEvent(new Event('input'));
    document.querySelector('#inspector [data-close]')?.click();
  }, v);
  await page.waitForFunction(() => !window.wootenManual.busy());
  await page.evaluate(v => {
    const m = window.wootenManual;
    m.camera.position.set(...v.position); m.controls.target.set(...v.target); m.camera.up.set(...v.up);
    m.controls.update(); m.frame(performance.now());
  }, v);
  await page.locator('#stage').screenshot({ path: `screens/compare-${name}.png` });
}
await browser.close();
