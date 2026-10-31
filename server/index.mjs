import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StudyEngine } from '../src/study/uci.js';
import { nodeWorker } from './worker.mjs';
import { createPublicReviews } from './public-reviews.mjs';
import { createAccounts } from './accounts.mjs';
import { createAnalysisApi } from './analysis-api.mjs';
import { createStaticFiles } from './static-files.mjs';
import {
  allowOrigin,
  constantTimeEqual,
  securityHeaders,
  createRequestGuard,
} from './security.mjs';
import { createDocumentStore } from './document-store.mjs';
import { createHumanOpponent } from './human-opponent.mjs';
import { httpError, sendError } from './http.mjs';

export function createAnalysisServer({
  token = process.env.API_TOKEN || '',
  concurrency = Number(process.env.ENGINE_CONCURRENCY || 1),
  origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  allowExtensionOrigins = process.env.ALLOW_EXTENSION_ORIGINS === 'true',
  publicReports = process.env.PUBLIC_REPORTS === 'true',
  publicBudgetSeconds = Number(process.env.PUBLIC_ENGINE_SECONDS || 1800),
  root = resolve('dist'),
  accounts = {},
  human = {},
} = {}) {
  const limit = Math.max(1, Math.min(4, Math.floor(concurrency) || 1));
  const slots = Array.from({ length: limit }, () => ({
    engine: new StudyEngine(() => nodeWorker()),
    busy: false,
  }));
  const authorized = (req) =>
    !token || constantTimeEqual(req.headers.authorization || '', 'Bearer ' + token);
  const store = accounts.store || createDocumentStore();
  const guard = createRequestGuard();
  const reports = createPublicReviews({
    store,
    slots,
    enabled: publicReports,
    isOwner: authorized,
    budgetSeconds: Math.max(1, Math.min(7200, publicBudgetSeconds || 1800)),
  });
  const identity = createAccounts({
    puzzlePath: resolve(root, 'data/puzzles.json'),
    ...accounts,
    store,
  });
  const analyze = createAnalysisApi({ slots, authorized, reports, publicReports });
  const opponent = createHumanOpponent({ reports, isOwner: authorized, ...human });
  const staticFiles = createStaticFiles({ root, publicReports });
  const originsSet = new Set(origins);
  async function handle(req, res) {
    securityHeaders(req, res);
    allowOrigin(req, res, { origins: originsSet, allowExtensionOrigins, token });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-CSRF-Token, X-Evala-Account, X-Evala-Generation',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      throw httpError(400, 'Bad URL');
    }
    guard(req, res, url);
    if (await identity.handle(req, res, url)) return;
    if (await reports.handle(req, res, url)) return;
    if (await analyze(req, res, url)) return;
    if (await opponent.handle(req, res, url)) return;
    if (url.pathname.startsWith('/api/')) throw httpError(404, 'Not found');
    await staticFiles(req, res, url);
  }
  // Node's HTTP callback does not consume rejected async functions.
  const server = http.createServer(
    { maxHeaderSize: 16384, connectionsCheckingInterval: 1000 },
    (req, res) => {
      handle(req, res).catch((error) => sendError(res, error));
    },
  );
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  server.timeout = 200000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 256;
  server.on('close', () => {
    slots.forEach((s) => s.engine.dispose());
    opponent.dispose();
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || '127.0.0.1',
    port = Number(process.env.PORT || 8080);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.API_TOKEN)
    throw new Error('Set API_TOKEN before binding a public interface.');
  const server = createAnalysisServer();
  server.listen(port, host, () =>
    console.log(`Evala server listening on ${host}:${port}. Engine: Stockfish 19 Full.`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(() => process.exit(0)));
}
