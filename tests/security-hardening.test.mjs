import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
import { createEngineBudget } from '../server/engine-budget.mjs';
import { parseServerPgn } from '../server/pgn-parser.mjs';
import { clientAddress, createRequestGuard } from '../server/security.mjs';

const pgn = '[Result "0-1"]\n1. f3 e5 2. g4 Qh4# 0-1';

test('durable engine budget survives recreated services and concurrent reservations', async () => {
  const disk = createDocumentStore({ directory: await mkdtemp(join(tmpdir(), 'evala-budget-')) });
  const store = { ...disk, durable: true };
  const first = createEngineBudget({ store, limit: 10 });
  await first.reserve(4);
  const restarted = createEngineBudget({ store, limit: 10 });
  assert.equal(await restarted.remaining(), 6);
  const attempts = await Promise.allSettled([first.reserve(4), restarted.reserve(4)]);
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  assert.equal(await restarted.remaining(), 2);
  for (const seconds of [0, -1, NaN, Infinity]) await assert.rejects(first.reserve(seconds));
  const broken = createEngineBudget({
    store: {
      durable: true,
      transact: async () => {
        throw Error('offline');
      },
    },
    limit: 10,
  });
  await assert.rejects(broken.reserve(1), /offline/);
});

test('ACA client identity uses only rightmost ingress address and ignores spoofing elsewhere', () => {
  const req = {
    headers: { 'x-forwarded-for': '1.2.3.4, 2001:db8::5' },
    socket: { remoteAddress: '10.0.0.1' },
  };
  assert.equal(clientAddress(req, true), '2001:db8::5');
  assert.equal(clientAddress(req, false), '10.0.0.1');
  req.headers['x-forwarded-for'] = '1.2.3.4, not-an-ip';
  assert.equal(clientAddress(req, true), '10.0.0.1');
});

test('request guard bounds in-flight work, releases on disconnect and blocks metadata-only CSRF', () => {
  const guard = createRequestGuard({ activeLimit: 2 });
  const url = new URL('http://localhost/api/account/library');
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const response = () => Object.assign(new EventEmitter(), { setHeader() {} });
  const first = response(),
    second = response();
  guard(req, first, url);
  guard(req, second, url);
  assert.throws(() => guard(req, response(), url), { status: 429 });
  first.emit('close');
  first.emit('finish');
  guard(req, response(), url);
  for (const site of ['same-site', 'cross-site'])
    assert.throws(() => guard({ ...req, headers: { 'sec-fetch-site': site } }, response(), url), {
      status: 403,
    });
});

test('PGN input is isolated and bounded before parsing; terminated parser does not block subsequent imports', async () => {
  assert.equal((await parseServerPgn(pgn)).moves.length, 4);
  await assert.rejects(parseServerPgn('x'.repeat(200001)), { status: 413 });
  await assert.rejects(parseServerPgn('1. illegal'), { status: 400 });
  await assert.rejects(parseServerPgn(pgn, { timeoutMs: 1 }), { status: 422 });
  await assert.rejects(parseServerPgn(pgn, { signal: AbortSignal.abort() }), { status: 408 });
  assert.equal((await parseServerPgn(pgn)).moves.length, 4);
});

test('public API rejects simple-content CSRF, compression and foreign origins before expensive work', async () => {
  const server = createAnalysisServer({ token: 'test-only', publicReports: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const session = await fetch(base + '/api/session');
    const Cookie = session.headers.get('set-cookie').split(';')[0];
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const response = await fetch(base + '/api/review-game', {
        method: 'POST',
        headers: { Cookie, 'Content-Type': type },
        body: JSON.stringify({ pgn }),
      });
      assert.equal(response.status, 415);
    }
    const compressed = await fetch(base + '/api/review-game', {
      method: 'POST',
      headers: { Cookie, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: '{}',
    });
    assert.equal(compressed.status, 415);
    for (const Origin of ['null', 'https://evil.example', 'https://localhost.evil.example'])
      assert.equal(
        (await fetch(base + '/api/account/config', { headers: { Origin } })).status,
        403,
      );
    const html = await fetch(base + '/study.html');
    const csp = html.headers.get('content-security-policy');
    assert.ok(csp.includes('https://api.chess.com'));
    assert.ok(!csp.includes("connect-src 'self' https:" + ' '));
    assert.ok(!csp.includes('http://localhost:'));
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
    const missing = await fetch(base + '/api/missing');
    assert.equal(
      missing.headers.get('content-security-policy'),
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    assert.equal(missing.headers.get('cache-control'), 'no-store');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
