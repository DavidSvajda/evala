import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnalysisServer } from '../server/index.mjs';
import { createRateLimiter, constantTimeEqual } from '../server/security.mjs';
import { escapeHtml } from '../src/ui/dom.js';
import { validPosition, START_FEN } from '../src/core/position.js';

async function start(options = {}) {
  const server = createAnalysisServer({ token: 'fixture-token', ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

test('static serving blocks traversal, hidden files, symlinks and unknown types; HEAD/ETag work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evala-static-')),
    outside = root + '-outside.js';
  await writeFile(join(root, 'safe.js'), 'export const safe=true;');
  await writeFile(join(root, '.env'), 'private-marker');
  await writeFile(join(root, 'private.pem'), 'private-marker');
  await writeFile(outside, 'outside-marker');
  let linked = true;
  try {
    await symlink(outside, join(root, 'link.js'), 'file');
  } catch (e) {
    if (['EPERM', 'EACCES'].includes(e.code)) linked = false;
    else throw e;
  }
  const app = await start({ root });
  try {
    for (const path of [
      '/.env',
      '/private.pem',
      '/%2e%2e%2foutside.js',
      '/%5c..%5coutside.js',
      '/safe.js%00.css',
      '/C:%5coutside.js',
      ...(linked ? ['/link.js'] : []),
    ]) {
      const response = await fetch(app.base + path);
      assert.equal(response.status, 404, path);
      assert.ok(!(await response.text()).includes('private-marker'));
    }
    const safe = await fetch(app.base + '/safe.js');
    assert.equal(safe.status, 200);
    assert.match(safe.headers.get('Content-Type'), /javascript/);
    assert.equal(safe.headers.get('X-Content-Type-Options'), 'nosniff');
    const etag = safe.headers.get('ETag');
    assert.ok(etag);
    assert.equal(
      (await fetch(app.base + '/safe.js', { headers: { 'If-None-Match': etag } })).status,
      304,
    );
    const head = await fetch(app.base + '/safe.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.ok(Number(head.headers.get('Content-Length')) > 0);
  } finally {
    await app.close();
  }
});

test('API validates body, encoding and UCI inputs and stays available after hostile requests', async () => {
  const app = await start(),
    headers = { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' };
  try {
    for (const body of [
      'null',
      '[]',
      '{bad json',
      JSON.stringify({ fen: START_FEN.replace(' w ', '\nw ') }),
      JSON.stringify({ fen: START_FEN, history: { initialFen: START_FEN, moves: ['e2e4\nquit'] } }),
    ])
      assert.equal(
        (await fetch(app.base + '/api/analyze', { method: 'POST', headers, body })).status,
        400,
      );
    assert.equal(
      (await fetch(app.base + '/api/analyze', { method: 'POST', headers, body: 'x'.repeat(66000) }))
        .status,
      413,
    );
    assert.equal(
      (
        await fetch(app.base + '/api/analyze', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'text/plain' },
          body: '{}',
        })
      ).status,
      415,
    );
    assert.equal((await fetch(app.base + '/api/health', { headers })).status, 200);
    const spoof = await fetch(app.base + '/api/health', {
      headers: { ...headers, 'X-Forwarded-Proto': 'https', Origin: app.base },
    });
    assert.equal(spoof.status, 403);
    const good = await fetch(app.base + '/api/health', {
      headers: {
        ...headers,
        'X-Forwarded-Proto': 'https',
        Origin: app.base.replace('http:', 'https:'),
      },
    });
    assert.equal(good.status, 200);
    assert.match(good.headers.get('Strict-Transport-Security'), /max-age/);
  } finally {
    await app.close();
  }
});

test('unexpected storage errors are private and cannot crash the request boundary', async () => {
  const store = {
    durable: true,
    get: async () => {
      throw new Error('DO_NOT_EXPOSE_FIXTURE_CREDENTIAL');
    },
  };
  const app = await start({ accounts: { store } });
  try {
    const response = await fetch(app.base + '/api/account/me', {
      headers: { Cookie: 'evala_account=' + 'a'.repeat(64) },
    });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('DO_NOT_EXPOSE'));
    assert.equal(
      (
        await fetch(app.base + '/api/health', {
          headers: { Authorization: 'Bearer fixture-token' },
        })
      ).status,
      200,
    );
    const config = await fetch(app.base + '/api/account/config', {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.match(
      config.headers.get('Set-Cookie'),
      /^__Host-evala_login=.*; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/,
    );
  } finally {
    await app.close();
  }
});

test('rate limits stay bounded; HTML escaping and FEN command boundaries are explicit', () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2 });
  assert.equal(allow('a', 0), true);
  assert.equal(allow('a', 1), true);
  assert.equal(allow('a', 2), false);
  assert.equal(allow('b', 3), true);
  assert.equal(allow('c', 4), false);
  assert.equal(allow('c', 1001), true);
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual(undefined, 'secret'), false);
  assert.equal(constantTimeEqual('a', 'long'), false);
  assert.equal(
    escapeHtml('<img src="x" onerror=\'run()\'>&'),
    '&lt;img src=&quot;x&quot; onerror=&#39;run()&#39;&gt;&amp;',
  );
  assert.equal(validPosition(START_FEN.replace(' w ', '\nw ')), false);
  assert.equal(validPosition(START_FEN + '\0'), false);
});
