import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createAnalysisServer } from '../server/index.mjs';

test('server authentication, CORS, streaming, request bounds and real full engine', async () => {
  const server = createAnalysisServer({
    token: 'test-secret',
    origins: ['https://allowed.example'],
    allowExtensionOrigins: true,
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`,
    headers = { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' };
  try {
    const document = await (await fetch(base + '/')).text();
    assert.match(document, /<meta name="evala-backend" content="server">/);
    assert.ok(!document.includes('test-secret'), 'the public HTML must not contain the API secret');
    assert.equal((await fetch(base + '/api/health')).status, 401);
    const extension = 'chrome-extension://' + 'a'.repeat(32);
    assert.equal(
      (await fetch(base + '/api/health', { headers: { ...headers, Origin: extension } })).status,
      200,
    );
    assert.equal(
      (await fetch(base + '/api/health', { headers: { Origin: extension } })).status,
      401,
    );
    const preflight = await fetch(base + '/api/analyze', {
      method: 'OPTIONS',
      headers: {
        Origin: extension,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), extension);
    assert.equal(
      (
        await fetch(base + '/api/health', {
          headers: { ...headers, Origin: 'chrome-extension://invalid' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/api/health', {
          headers: { ...headers, Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    const health = await fetch(base + '/api/health', {
      headers: { ...headers, Origin: 'https://allowed.example' },
    });
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://allowed.example');
    assert.equal((await health.json()).engine, 'Stockfish 19 Full');
    assert.equal(
      (
        await fetch(base + '/api/analyze', {
          method: 'POST',
          headers,
          body: JSON.stringify({ fen: 'invalid' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + '/api/analyze', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fen: new Chess().fen(),
            history: { initialFen: new Chess().fen(), moves: ['e2e5'] },
          }),
        })
      ).status,
      400,
    );
    const response = await fetch(base + '/api/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fen: new Chess().fen(),
        settings: { time: 200, depth: 10, multipv: 2 },
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /ndjson/);
    const records = (await response.text())
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s));
    assert.ok(records.some((r) => r.type === 'info'));
    const done = records.find((r) => r.type === 'done');
    assert.ok(done);
    assert.equal(done.result.lines.length, 2);
    assert.equal(
      (await fetch(base + '/api/analyze', { method: 'POST', headers, body: 'x'.repeat(66000) }))
        .status,
      413,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
