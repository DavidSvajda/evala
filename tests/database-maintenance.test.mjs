import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';

test('production SQL mode cannot silently reopen a retired Blob library when its secret is missing', () => {
  assert.throws(
    () => createDocumentStore({ databaseUrl: '', requirePostgres: true }),
    /Refusing to fall back/,
  );
  const local = createDocumentStore({
    databaseUrl: '',
    requirePostgres: false,
    connectionString: '',
  });
  assert.equal(local.kind, 'local-file');
});

test('migration maintenance rejects writes before auth, keeps health and config readable', async () => {
  let writes = 0;
  const store = {
    kind: 'test',
    durable: true,
    get: async () => ({ value: null }),
    transact: async () => {
      writes++;
    },
    put: async () => {
      writes++;
    },
    remove: async () => {
      writes++;
    },
  };
  const server = createAnalysisServer({
    localEngineOnly: true,
    dataMaintenance: true,
    accounts: { store },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const path of ['/api/account/google', '/api/account/library/delete', '/api/share']) {
      const r = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('retry-after'), '120');
    }
    assert.equal((await fetch(base + '/api/account/config')).status, 200);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal(writes, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
