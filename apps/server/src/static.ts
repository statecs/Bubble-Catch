/**
 * Serves the BUILT client apps so one port (and one tunnel) covers everything:
 *   /        -> apps/controller/dist   (phones)
 *   /host/   -> apps/host/dist         (big screen)
 * Only used by `npm start`. In `npm run dev` the Vite dev servers serve the apps.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '../../..');
const CONTROLLER_DIST = join(ROOT, 'apps/controller/dist');
const HOST_DIST = join(ROOT, 'apps/host/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

export function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  let dist = CONTROLLER_DIST;
  let path = url.pathname;
  if (path === '/host') {
    res.writeHead(302, { location: '/host/' + url.search }).end();
    return;
  }
  if (path.startsWith('/host/')) {
    dist = HOST_DIST;
    path = path.slice('/host'.length);
  }
  if (!existsSync(dist)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not built. Run: npm run build\n(missing ${dist})`);
    return;
  }
  let file = normalize(join(dist, decodeURIComponent(path)));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html'); // SPA fallback
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
}
