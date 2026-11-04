// Serves site/index.html wrapped in the same skeleton the claude.ai artifact host adds at publish time.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const page = fileURLToPath(new URL('../site/index.html', import.meta.url));
const port = Number(process.env.PORT || 4173);

const skeleton = body => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}</style>
</head><body>${body}</body></html>`;

createServer(async (request, response) => {
  if (request.url !== '/' && !request.url.startsWith('/?')) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  // STANDALONE=<file> serves a finished page as-is (the wooten-labs.com export) instead of wrapping site/index.html
  response.end(process.env.STANDALONE ? await readFile(process.env.STANDALONE, 'utf8') : skeleton(await readFile(page, 'utf8')));
}).listen(port, '127.0.0.1', () => console.log(`serving on http://127.0.0.1:${port}`));
