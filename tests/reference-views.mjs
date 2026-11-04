// Renders fixed reference views (true side view with the cut, x-ray views) for checking anatomy by eye:
// node tests/reference-views.mjs  (needs the test server on PORT, default 4173)
import { webkit } from '@playwright/test';
const port = process.env.PORT || 4173;
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForSelector('html[data-model-ready="true"]');
const shots = [];
for (const arousal of [0, 1]) {
  const tag = arousal ? 'aroused' : 'rest';
  shots.push(
    [`sagittal-${tag}`, { cut: true, xray: 0, arousal, position: [40, 6, 0], target: [0, 6, 0], up: [0, 1, 0] }],
    [`oblique-xray-${tag}`, { cut: false, xray: 0.85, arousal, position: [-16, -9, 13], target: [0, 3.5, 1], up: [0, 1, 0] }],
    [`front-xray-${tag}`, { cut: false, xray: 0.9, arousal, position: [0, 6, 42], target: [0, 6, 0], up: [0, 1, 0] }],
    [`below-${tag}`, { cut: false, xray: 0, arousal, position: [0, -22, 9], target: [0, 0.6, 0.6], up: [0, 0.4, 1] }],
    [`below-close-${tag}`, { cut: false, xray: 0, arousal, position: [2, -12, 5], target: [0, 0.4, 0.8], up: [0, 0.4, 1] }],
  );
}
shots.push(['top-xray-rest', { cut: false, xray: 0.9, arousal: 0, position: [0, 44, 1], target: [0, 4, 0], up: [0, 0, 1] }]);
for (const [name, view] of shots) {
  await page.evaluate(v => {
    const m = window.wootenManual;
    m.state.labels = false;
    m.setView(v.cut ? 'pee' : 'inside');
    m.state.xray = v.xray; m.state.arousal = v.arousal;
    document.getElementById('xray').dispatchEvent(new Event('input'));
    const slider = document.getElementById('arousal'); slider.value = v.arousal * 100; slider.dispatchEvent(new Event('input'));
    document.getElementById('xray').value = v.xray * 100; document.getElementById('xray').dispatchEvent(new Event('input'));
    document.querySelector('#inspector [data-close]')?.click();
  }, view);
  await page.waitForFunction(() => !window.wootenManual.busy());
  await page.evaluate(v => {
    const m = window.wootenManual;
    m.camera.position.set(...v.position); m.controls.target.set(...v.target); m.camera.up.set(...v.up);
    m.controls.update(); m.frame(performance.now());
  }, view);
  await page.locator('#stage').screenshot({ path: `screens/ref-${name}.png` });
}
await browser.close();
