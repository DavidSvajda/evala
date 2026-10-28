import http from 'node:http';
import { resolve } from 'node:path';
import { createStaticFiles } from '../server/static-files.mjs';
import { securityHeaders } from '../server/security.mjs';
import { sendError } from '../server/http.mjs';

export function createServer(port = 4173) {
  const files = createStaticFiles({ root: resolve('dist'), publicReports: false, backend: false });
  const server = http.createServer((req, res) => {
    securityHeaders(req, res);
    Promise.resolve()
      .then(() => files(req, res, new URL(req.url, 'http://127.0.0.1')))
      .catch((error) => sendError(res, error));
  });
  server.listen(port, '127.0.0.1');
  return server;
}
if (process.argv[1]?.endsWith('serve.mjs'))
  createServer().on('listening', () =>
    console.log('Evala preview: http://127.0.0.1:4173/demo.html'),
  );
