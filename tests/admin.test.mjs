import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createDocumentStore } from '../server/document-store.mjs';
import { createAnalysisServer } from '../server/index.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const owner = hash('google:owner-sub');
const secure = { 'X-Forwarded-Proto': 'https' };
const foreign = 'https://other.example.test';
const findCookie = (res, name) => res.headers.getSetCookie().find((s) => s.startsWith(name + '='));
const pair = (header) => header.split(';')[0];

test('admin requires the bound identity and a current independent grant, with scoped usage metrics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evala-admin-'));
  const store = createDocumentStore({ directory, connectionString: '', databaseUrl: '' });
  const now = Date.now();
  const server = createAnalysisServer({
    localEngineOnly: true,
    adminAccountId: owner,
    origins: [foreign],
    accounts: {
      store,
      googleClientId: 'fixture-client',
      verifyGoogle: async (credential) => {
        const [sub, nonce] = credential.split(':');
        return {
          sub,
          nonce,
          email: 'owner@example.test',
          email_verified: true,
          iat: now / 1000,
          exp: now / 1000 + 3600,
        };
      },
    },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const api = base + '/api/admin/overview';
  async function login(sub, cookies = '') {
    const config = await fetch(base + '/api/account/config', { headers: secure });
    const { challenge } = await config.json();
    const loginCookie = findCookie(config, '__Host-evala_login');
    const response = await fetch(base + '/api/account/google', {
      method: 'POST',
      headers: {
        ...secure,
        'Content-Type': 'application/json',
        'X-CSRF-Token': challenge,
        Cookie: [pair(loginCookie), cookies].filter(Boolean).join('; '),
      },
      body: JSON.stringify({ credential: sub + ':' + challenge }),
    });
    assert.equal(response.status, 200);
    const main = pair(findCookie(response, '__Host-evala_account'));
    const admin = findCookie(response, '__Host-evala_admin');
    return { main, admin, cookie: admin ? `${main}; ${pair(admin)}` : main };
  }
  const headers = (cookie, extra) => ({ ...secure, Cookie: cookie, ...extra });
  try {
    const legit = await login('owner-sub');
    const impersonator = await login('different-sub');
    assert.match(legit.admin, /; HttpOnly; SameSite=Strict; Path=\/; Max-Age=900; Secure$/);
    assert.equal(impersonator.admin, undefined, 'same verified email cannot grant admin');
    assert.equal((await fetch(api)).status, 403);
    assert.equal(
      (await fetch(api, { headers: headers(legit.main) })).status,
      401,
      'stolen main cookie alone cannot read admin data',
    );
    assert.equal((await fetch(api, { headers: headers(impersonator.cookie) })).status, 403);
    assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 303);
    assert.equal(
      (await fetch(base + '/admin.html', { headers: headers(impersonator.cookie) })).status,
      404,
    );
    for (const path of [
      '/%61dmin.html',
      '/server/admin.html',
      '/..%2fserver%2fadmin.html',
      '/%252e%252e%252fserver%252fadmin.html',
      '/%2e%2e%5cserver%5cadmin.html',
    ]) {
      assert.equal(
        (await fetch(base + path, { headers: headers(impersonator.cookie) })).status,
        404,
        path,
      );
    }
    const shell = await fetch(base + '/admin/', { headers: headers(legit.cookie) });
    assert.equal(shell.status, 200);
    assert.equal(shell.headers.get('cache-control'), 'no-store, private');
    assert.equal(shell.headers.get('x-frame-options'), 'DENY');
    assert.match(
      shell.headers.get('content-security-policy'),
      /connect-src 'self';.*frame-ancestors 'none'/,
    );
    assert.equal(
      (
        await fetch(api, {
          headers: headers(legit.cookie, { Origin: foreign, 'Sec-Fetch-Site': 'cross-site' }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(api + '?page=1%20OR%201=1', { headers: headers(legit.cookie) })).status,
      400,
    );
    assert.equal(
      (await fetch(api, { method: 'POST', headers: headers(legit.cookie) })).status,
      405,
    );
    await store.transact('account:' + owner, (a) => ({
      ...a,
      games: { fixture: { updatedAt: now, analyzed: true, pgn: 'private-game' } },
      training: { attempted: 3, history: { test: { lastAt: now - 30 } } },
    }));
    for (let i = 0; i < 25; i++) {
      const id = hash(`archive-${i}`);
      await store.put('account:' + id, {
        id,
        name: 'Archive',
        email: 'archive@example.test',
        createdAt: now - 8 * 86400000 - i,
        games: {},
        training: {},
      });
    }
    await store.put('admin:page-loads', { days: { '2000-01-01': 100 } });
    await fetch(base + '/study.html?private-query=secret', {
      headers: { 'User-Agent': 'secret-agent' },
    });
    const response = await fetch(api, { headers: headers(legit.cookie) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const summary = await response.json();
    assert.deepEqual(summary.totals, {
      accounts: 27,
      newThisWeek: 2,
      activeThisWeek: 1,
      reviews: 1,
      attempts: 3,
    });
    assert.equal(summary.users.length, 25);
    assert.equal(summary.users.find((u) => u.reviews === 1).lastUsedAt, now);
    assert.equal(JSON.stringify(summary).includes('private-game'), false);
    assert.equal(summary.days.length, 30);
    assert.equal(summary.days.at(-1).loads, 1);
    assert.deepEqual(Object.keys((await store.get('admin:page-loads')).value), ['days']);
    assert.equal(
      JSON.stringify((await store.get('admin:page-loads')).value).includes('secret'),
      false,
    );
    const second = await (await fetch(api + '?page=2', { headers: headers(legit.cookie) })).json();
    assert.equal(second.users.length, 2);
    assert.equal(second.days, undefined);
    const newer = await login('owner-sub', legit.cookie);
    assert.equal((await fetch(api, { headers: headers(legit.cookie) })).status, 403);
    assert.equal(
      (await fetch(api, { headers: headers(`${newer.main}; ${pair(legit.admin)}`) })).status,
      401,
    );
    await store.transact('session:' + hash(newer.main.split('=')[1]), (s) => ({
      ...s,
      createdAt: now - 900001,
    }));
    assert.equal((await fetch(api, { headers: headers(newer.cookie) })).status, 401);
    await store.transact('account:' + owner, (a) => ({ ...a, deleting: 'operation' }));
    assert.equal((await fetch(api, { headers: headers(newer.cookie) })).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
