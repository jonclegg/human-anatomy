import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 500, height: 950 } });
await p.goto(`http://127.0.0.1:8793/mh.html?f=${process.argv[3] || 'thin.json'}`); await p.waitForSelector('html[data-ready]'); await p.screenshot({ path: process.argv[2] }); await b.close();
