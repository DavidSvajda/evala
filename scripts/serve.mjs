import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
export function createServer(port = 4173) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const path = resolve(
        root,
        `.${decodeURIComponent(url.pathname === '/' ? '/study.html' : url.pathname)}`,
      );
      if (!path.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!(await stat(path)).isFile()) throw new Error('not file');
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'",
      });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}
if (process.argv[1]?.endsWith('serve.mjs'))
  createServer().on('listening', () =>
    console.log('Evala preview: http://127.0.0.1:4173/demo.html'),
  );
