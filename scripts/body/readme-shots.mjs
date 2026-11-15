// Takes the README's pictures (docs/*.png) and its walkthrough (docs/demo.gif) from the site as it is served.
// Usage: node scripts/body/readme-shots.mjs [stills|demo]     (needs the site served: npm run serve:body; the demo needs ffmpeg)
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const only = process.argv[2];
const site = `http://127.0.0.1:${process.env.PORT || 4174}`;
const docs = fileURLToPath(new URL('../../docs/', import.meta.url));
// Headless Chromium otherwise draws WebGL in software, which is far slower and shades differently
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });

const settle = page => page.waitForFunction(() => !window.bodyModel.busy(), null, { timeout: 30_000 });
async function open(page, query) {
  await page.goto(`${site}/?${query}`);
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
  await page.evaluate(() => window.bodyModel.ready());
  await settle(page);
}
const layer = async (page, view) => { await page.locator(`#views [data-view="${view}"]`).click(); await settle(page); };

if (only !== 'demo') {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const stills = [
    ['home', 'sex=female'],
    ['organs', 'sex=female', 'organs'],
    ['eye', 'sex=female&closeup=eye'],
    ['skeleton-male', 'sex=male', 'skeleton'],
  ];
  for (const [name, query, view] of stills) {
    const page = await desktop.newPage();
    await open(page, query);
    if (view) await layer(page, view);
    await page.waitForTimeout(1200);   // the camera and the labels come to rest
    await page.screenshot({ path: `${docs}${name}.png` });
    await page.close();
  }
  const phone = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
  const page = await phone.newPage();
  await open(page, 'sex=female&closeup=heart');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${docs}phone.png` });
}

if (only !== 'stills') {
  const folder = mkdtempSync(`${tmpdir()}/readme-demo-`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: folder, size: { width: 1280, height: 800 } } });
  const page = await context.newPage();
  const began = Date.now();
  await open(page, 'sex=female');
  const loaded = (Date.now() - began) / 1000;   // the film starts on the loaded model, not the loading screen
  const pause = seconds => page.waitForTimeout(seconds * 1000);
  await pause(1.5);
  for (const view of ['muscles', 'organs', 'vessels', 'nerves', 'skeleton']) { await layer(page, view); await pause(1.2); }
  await layer(page, 'body');
  await pause(0.8);
  await page.locator('.spot', { hasText: 'Heart' }).click();
  await settle(page);
  await pause(2.5);
  await page.locator('#sheet [data-watch="heart"]').click();
  await pause(6);
  await page.locator('#transport [data-story="exit"]').click();
  await settle(page);
  await page.locator('#homeBtn').click();
  await settle(page);
  await pause(1);
  await page.locator('#sexSwitch [data-sex="male"]').click();
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
  await settle(page);
  await pause(2.5);
  await context.close();
  const film = `${folder}/${readdirSync(folder).find(name => name.endsWith('.webm'))}`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(loaded + 0.3), '-i', film,
    '-vf', 'fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', `${docs}demo.gif`]);
  rmSync(folder, { recursive: true });
}
await browser.close();
