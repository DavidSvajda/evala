import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createDocumentStore } from '../server/document-store.mjs';
import { createAnalysisServer } from '../server/index.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
test('admin is restricted to allowlisted Google accounts; counts contain no visitor identifiers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evala-admin-'));
  const store = createDocumentStore({ directory, connectionString: '' });
  const prior = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'owner@example.test';
  const server = createAnalysisServer({ localEngineOnly: true, accounts: { store } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const who of ['owner', 'member']) {
      const id = hash(who);
      await store.put('account:' + id, {
        id,
        name: '<img onerror=alert(1)>',
        email: who + '@example.test',
        createdAt: Date.now(),
        authEpoch: 'epoch',
        games: {},
        training: {},
        lastLoginAt: null,
      });
      await store.put('session:' + hash(hash(who + '-cookie')), {
        userId: id,
        epoch: 'epoch',
        cookieVersion: 1,
        expires: Date.now() + 60000,
      });
    }
    const cookie = (who) => ({ Cookie: 'evala_account=' + hash(who + '-cookie') });
    const api = base + '/api/admin/overview';
    assert.equal((await fetch(api)).status, 403);
    assert.equal((await fetch(api, { headers: cookie('member') })).status, 403);
    const response = await fetch(api, { headers: cookie('owner') });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const summary = await response.json();
    assert.equal(summary.users.length, 2);
    assert.deepEqual(Object.keys(summary.users[0]).sort(), [
      'createdAt',
      'email',
      'lastLoginAt',
      'name',
    ]);
    await store.put('admin:page-loads', { days: { '2000-01-01': 100 } });
    await fetch(base + '/study.html?private-query=secret', {
      headers: { 'User-Agent': 'secret-agent' },
    });
    let value;
    for (let i = 0; i < 30; i++) {
      value = (await store.get('admin:page-loads')).value;
      if (!value.days['2000-01-01']) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(value.days['2000-01-01'], undefined);
    assert.equal(Object.values(value.days)[0], 1);
    assert.deepEqual(Object.keys(value), ['days']);
    assert.equal(JSON.stringify(value).includes('secret'), false);
    assert.equal((await fetch(api, { method: 'POST', headers: cookie('owner') })).status, 405);
    await store.transact('account:' + hash('owner'), (a) => ({ ...a, deleting: 'operation' }));
    assert.equal((await fetch(api, { headers: cookie('owner') })).status, 403);
  } finally {
    if (prior === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prior;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
