// Serves site/body as static files, as the deployed site does.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/body/', import.meta.url));
const port = Number(process.env.PORT || 4174);
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://local').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = root + (path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`serving site/body on http://127.0.0.1:${port}`));
