import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { httpError } from './http.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.gz': 'application/gzip',
  '.zip': 'application/zip',
};
const localPolicy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client; frame-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data:; font-src 'self'; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'";
const contained = (root, file) => {
  const name = relative(root, file);
  return name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name);
};

export function createStaticFiles({ root, publicReports }) {
  // Hosted public mode uses our backend and the two chess import providers.
  // Custom remote engines remain available in the local/private deployment.
  const policy = publicReports
    ? localPolicy.replace(
        "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
        "connect-src 'self' https://api.chess.com https://lichess.org https://accounts.google.com",
      )
    : localPolicy;
  const absoluteRoot = resolve(root);
  let rootPath;
  return async (req, res, url) => {
    if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, 'Method not allowed');
    let name;
    try {
      name = decodeURIComponent(url.pathname === '/' ? '/study.html' : url.pathname);
    } catch {
      throw httpError(400, 'Bad URL');
    }
    if (/[\0\\:]/.test(name) || name.split('/').some((p) => p.startsWith('.')))
      throw httpError(404, 'Not found');
    const candidate = resolve(absoluteRoot, '.' + name);
    if (!contained(absoluteRoot, candidate)) throw httpError(404, 'Not found');
    let file, info;
    try {
      rootPath ||= realpath(absoluteRoot);
      file = await realpath(candidate);
      if (!contained(await rootPath, file)) throw httpError(404, 'Not found');
      info = await stat(file);
    } catch (e) {
      if (e instanceof Error && e.status === 404) throw e;
      throw httpError(404, 'Not found');
    }
    const type =
      types[extname(file)] || (basename(file) === 'LICENSE' ? 'text/plain; charset=utf-8' : null);
    if (!info.isFile() || !type) throw httpError(404, 'Not found');
    const etag = `W/"${info.size}-${info.mtimeMs}-${publicReports ? 1 : 0}"`;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Security-Policy', policy);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', file.endsWith('.wasm') ? 'public, max-age=86400' : 'no-cache');
    if (
      req.headers['if-none-match']
        ?.split(',')
        .map((s) => s.trim())
        .includes(etag)
    ) {
      res.writeHead(304);
      res.end();
      return;
    }
    if (file.endsWith(sep + 'study.html')) {
      const data = Buffer.from(
        (await readFile(file, 'utf8')).replace(
          /<\/head\s*>/i,
          `<meta name="evala-backend" content="server">${publicReports ? '<meta name="evala-public" content="true">' : ''}</head>`,
        ),
      );
      res.setHeader('Content-Length', data.length);
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }
    res.setHeader('Content-Length', info.size);
    res.writeHead(200);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    // WASM and GPL source archives may be large: never buffer them per request.
    await pipeline(createReadStream(file), res);
  };
}
