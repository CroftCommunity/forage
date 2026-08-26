// Local preview that mirrors GitHub Pages (3n): real files served as-is, an
// unknown PATH gets 404.html (the app shell) so clean-path deep links work,
// and a missing ASSET stays a plain 404. Same rule as e2e/harness/serve.mjs —
// the preview should not be kinder than production.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.env.PORT || 8737);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path === '/' ? '/index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    if (extname(file)) { res.writeHead(404).end('not found'); return; }
    const shell = await readFile(join(ROOT, '404.html')).catch(() => null);
    if (!shell) { res.writeHead(404).end('not found'); return; }
    res.writeHead(404, { 'content-type': 'text/html' }); // Pages' real status
    res.end(shell);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${PORT}`));
