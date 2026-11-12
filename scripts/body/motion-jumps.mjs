// Every step of every story, watched frame by frame: how far the fastest part moves between two frames, and how much
// any part's opacity changes. A jump is a part that moves faster than anything gliding would.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { STORIES } from '../../site/body/stories.mjs';
import { REGIONS } from '../../site/body/closeups.mjs';
const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const out = [];
for (const [id, steps] of Object.entries(STORIES)) {
  if (only.length && !only.includes(id)) continue;
  await page.goto(`http://127.0.0.1:4174/?sex=${REGIONS[id].sex || 'female'}&closeup=${id}`);
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60000 });
  await page.waitForFunction(() => !window.bodyModel.busy());
  await page.locator('#sheet [data-watch]').click();
  for (let k = 0; k < steps.length; k++) {
    const watch = ((steps[k].seconds || 4) + 0.9 + 1.6) * 1000;
    const found = await page.evaluate(async ({ k, watch }) => {
      const m = window.bodyModel, parts = m.body().parts, moves = m.moves(), colours = m.colours();
      const place = index => {
        const o = index * 16, kind = moves[o + 3], c = parts[index].centre;
        if (kind !== 1) return kind === 2 ? [moves[o + 4] * 20, moves[o + 5] * 20, moves[o + 6] * 20] : [c[0], c[1], c[2]];
        const [px, py, pz] = [moves[o], moves[o + 1], moves[o + 2]], [qx, qy, qz, qw] = [moves[o + 4], moves[o + 5], moves[o + 6], moves[o + 7]];
        let x = (c[0] - px) * moves[o + 12], y = (c[1] - py) * moves[o + 13], z = (c[2] - pz) * moves[o + 14];
        const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
        x += qw * tx + qy * tz - qz * ty; y += qw * ty + qz * tx - qx * tz; z += qw * tz + qx * ty - qy * tx;
        return [x + px + moves[o + 8], y + py + moves[o + 9], z + pz + moves[o + 10]];
      };
      const snap = () => ({ at: performance.now(), places: parts.map((part, index) => place(index)), kinds: parts.map((part, index) => moves[index * 16 + 3]), alpha: parts.map((part, index) => colours[index * 4 + 3]) });
      let last = snap(); const start = last.at, worst = { move: 0, fade: 0 };   // the look before the step is gone to
      if (k > 0) document.querySelector(`#sheet [data-go="${k}"]`).click();
      await new Promise(done => { const frame = () => {
        const now = snap();
        for (let index = 0; index < parts.length; index++) {
          const a = last.places[index], b = now.places[index], far = last.kinds[index] === now.kinds[index] ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0;
          if (far > worst.move) Object.assign(worst, { move: far, mover: parts[index].name, moveAt: Math.round(now.at - start), moveGap: Math.round(now.at - last.at) });
          const fade = Math.abs(now.alpha[index] - last.alpha[index]) / 255;
          if (fade > worst.fade) Object.assign(worst, { fade, fader: parts[index].name, fadeAt: Math.round(now.at - start) });
        }
        last = now;
        if (now.at - start < watch) requestAnimationFrame(frame); else done();
      }; requestAnimationFrame(frame); });
      return worst;
    }, { k, watch });
    const row = { id, step: k + 1, title: steps[k].title, span: steps[k].span, seconds: steps[k].seconds, ...found, move: +found.move.toFixed(2), fade: +found.fade.toFixed(2) };
    out.push(row); console.log(JSON.stringify(row));
  }
}
writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
await browser.close();
