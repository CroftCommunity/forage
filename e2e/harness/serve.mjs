// Workflow harness: static server over the repo root (1d). No deps — node http.
// Returns { origin, close() }. Port 0 = OS-assigned, so parallel runs never fight.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..', '..'));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

// `root`: which tree to serve. Default is this checkout; scripts/mock-snaps.mjs
// passes another checkout to capture a mock's CURRENT frames from the tree the
// owner is running (main) with the branch's fixtures and script.
export async function serve({ root = ROOT } = {}) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const rel = path === '/' ? '/index.html' : path;
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      // 3n: mirror GitHub Pages — an unknown PATH gets 404.html (the app
      // shell, 404 status); a missing ASSET stays a plain 404. Faithful to
      // production, including the status code.
      if (extname(file)) { res.writeHead(404).end('not found'); return; }
      try {
        const shell = await readFile(join(root, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end(shell);
      } catch { res.writeHead(404).end('not found'); }
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}
