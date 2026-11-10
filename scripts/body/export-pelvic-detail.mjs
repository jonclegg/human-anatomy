// Writes the parts of the close-up pelvic model (site/index.html, built in code from published measurements) as meshes,
// for the female build to place in her pelvis: build/pelvic-detail.json, { id: [{ positions, indices }] }, in that
// model's frame (cm; scripts/hra-frame.mjs maps it to the Human Reference Atlas frame its pelvis came from).
// The page is opened at rest (no arousal) in a headless browser, since its shapes are generated there.
// Usage: node scripts/body/export-pelvic-detail.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 4179;
const server = spawn(process.execPath, [fileURLToPath(new URL('../../tests/server.mjs', import.meta.url))], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', code => reject(new Error(`the page server stopped (${code})`))); });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  page.on('pageerror', error => { throw error; });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.wootenManual?.partIds().length > 20, null, { timeout: 120_000 });
  const parts = await page.evaluate(() => Object.fromEntries(window.wootenManual.partIds().map(id => [id, window.wootenManual.meshes(id)])));
  const out = new URL('../../build/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('pelvic-detail.json', out), JSON.stringify(parts));
  for (const [id, meshes] of Object.entries(parts)) console.log(`${id}: ${meshes.length} mesh${meshes.length > 1 ? 'es' : ''}, ${meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0)} triangles`);
} finally {
  await browser.close();
  server.kill();
}
