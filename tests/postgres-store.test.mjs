import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createAnalysisServer } from '../server/index.mjs';
import { exportPostgres, streamPostgres, digest } from '../server/database-snapshot.mjs';
import { createPostgresStore, postgresPool } from '../server/postgres-store.mjs';

test('capacity checks reserve estimated burst growth between measurements', async () => {
  let measurements = 0;
  const client = {
    release() {},
    async query(sql) {
      if (sql.includes('pg_database_size')) {
        measurements++;
        return { rows: [{ bytes: '0' }] };
      }
      return { rows: [] };
    },
  };
  const store = createPostgresStore({
    softLimitMB: 0.02,
    pool: { query: (...a) => client.query(...a), connect: async () => client, end: async () => {} },
  });
  try {
    const r = await Promise.allSettled(
      [0, 1, 2].map((i) => store.put('game:owner:id:v' + i, { pgn: 'fixture' })),
    );
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 2);
    assert.equal(r.find((x) => x.status === 'rejected').reason.status, 507);
    assert.equal(measurements, 1);
  } finally {
    await store.close();
  }
});

test('database capacity reserve rejects growing game revisions while keeping deletions available', async () => {
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      queries.push(sql);
      return {
        rows: sql.includes('pg_database_size') ? [{ bytes: String(20 * 1024 * 1024) }] : [],
      };
    },
  };
  const store = createPostgresStore({
    softLimitMB: 10,
    pool: { query: (...a) => client.query(...a), connect: async () => client, end: async () => {} },
  });
  try {
    await assert.rejects(
      store.put('game:owner:id:version', { pgn: 'fixture' }),
      (e) => e.status === 507,
    );
    await store.remove('game:owner:id:version');
    assert.ok(queries.some((s) => s.startsWith('DELETE FROM')));
    assert.ok(!queries.some((s) => s.startsWith('INSERT INTO')));
  } finally {
    await store.close();
  }
});

test(
  'PostgreSQL preserves libraries, training and atomic nested writes with a restricted role',
  {
    skip: !process.env.EVALA_TEST_DATABASE_URL,
  },
  async () => {
    const pool = postgresPool(process.env.EVALA_TEST_DATABASE_URL);
    const store = createPostgresStore({ pool });
    const id = createHash('sha256').update(randomUUID()).digest('hex');
    const accountKey = 'account:' + id;
    const gameKey = `game:${id}:test:version1`;
    const account = {
      id,
      name: 'Regression test',
      email: 'test@example.invalid',
      authEpoch: 'one',
      createdAt: Date.now(),
      preferences: { theme: 'dark' },
      games: {},
      training: { rating: 1200, history: { abc: { attempts: 3, correct: 2 } } },
      activePuzzle: { id: 'abc' },
    };
    try {
      await store.ready();
      await store.put(accountKey, account, null);
      assert.deepEqual((await store.get(accountKey)).value, account);
      await assert.rejects(store.put(accountKey, account, null), { statusCode: 412 });
      await assert.rejects(
        store.transact(accountKey, async (a) => {
          await store.put(gameKey, { pgn: 'private test' });
          a.name = 'must roll back';
          throw new Error('rollback');
        }),
        /rollback/,
      );
      assert.equal((await store.get(gameKey)).value, null);
      assert.equal((await store.get(accountKey)).value.name, account.name);
      await store.transact(accountKey, async (a) => {
        await store.put(gameKey, { pgn: 'private test', analysis: { complete: true } });
        a.games.test = {
          id: 'test',
          version: 'version1',
          white: 'A',
          black: 'B',
          result: '1-0',
          updatedAt: account.createdAt,
          analyzed: true,
        };
        return a;
      });
      assert.equal((await store.get(accountKey)).value.games.test.white, 'A');
      const admin = await store.accountSummaries();
      const record = admin.users.find((user) => user.email === account.email);
      assert.equal(record.lastUsedAt, account.createdAt);
      assert.equal(record.reviews, 1);
      assert.equal(Object.hasOwn(record, 'id'), false);
      assert.ok(admin.totals.activeThisWeek >= 1);
      await Promise.all(
        Array.from({ length: 8 }, () =>
          store.transact(accountKey, (a) => {
            a.training.history.abc.attempts++;
            return a;
          }),
        ),
      );
      assert.equal((await store.get(accountKey)).value.training.history.abc.attempts, 11);
      const stale = await store.get(accountKey);
      await store.transact(accountKey, (a) => ({ ...a, name: 'new name' }));
      await assert.rejects(store.put(accountKey, stale.value, stale.etag), { statusCode: 412 });
      await store.put('session:' + id, {
        userId: id,
        expires: Date.now() + 60000,
        csrf: 'test',
        epoch: 'one',
      });
      assert.equal((await store.get('session:' + id)).value.userId, id);
      // Parameterised keys cannot escape their row or become SQL.
      await store.put("regression:'; DROP TABLE evala.users; --", { safe: true });
      assert.deepEqual((await store.get("regression:'; DROP TABLE evala.users; --")).value, {
        safe: true,
      });
      await store.remove("regression:'; DROP TABLE evala.users; --");
      assert.equal(
        (await pool.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed"))
          .rows[0].allowed,
        false,
      );
      await assert.rejects(pool.query('CREATE TABLE evala.should_fail(id int)'), { code: '42501' });
      const buffered = await exportPostgres(pool);
      let streamed = '';
      for await (const chunk of streamPostgres(pool)) streamed += chunk;
      const snapshot = JSON.parse(streamed);
      assert.equal(snapshot.checksum, digest(snapshot.tables));
      assert.deepEqual(snapshot.tables, buffered.tables);
      assert.equal(snapshot.tables.sessions, undefined);
      assert.equal(
        (await pool.query("SELECT has_schema_privilege('anon','evala','USAGE') AS allowed")).rows[0]
          .allowed,
        false,
      );
      await store.remove(gameKey); // deletion cleanup removes links before account tombstone
      assert.deepEqual((await store.get(accountKey)).value.games, {});
      await store.transact(accountKey, () => null);
      assert.equal((await store.get(accountKey)).value, null);
      assert.equal((await store.get('session:' + id)).value, null);
    } finally {
      await store.remove(accountKey);
      await store.close();
    }
  },
);

test(
  'SQL-backed HTTP account login, PGN saving and deletion roundtrip',
  { skip: !process.env.EVALA_TEST_DATABASE_URL },
  async () => {
    const store = createPostgresStore({ connectionString: process.env.EVALA_TEST_DATABASE_URL });
    const subject = 'sql-api-' + randomUUID();
    const id = createHash('sha256')
      .update('google:' + subject)
      .digest('hex');
    let nonce;
    const server = createAnalysisServer({
      localEngineOnly: true,
      accounts: {
        store,
        googleClientId: 'test',
        verifyGoogle: async () => ({
          sub: subject,
          email: 'sql@example.invalid',
          email_verified: true,
          name: 'SQL test',
          nonce,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      },
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      const config = await fetch(base + '/api/account/config');
      nonce = (await config.json()).challenge;
      const login = await fetch(base + '/api/account/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: config.headers.get('set-cookie').split(';')[0],
          'X-CSRF-Token': nonce,
        },
        body: JSON.stringify({ credential: 'test' }),
      });
      assert.equal(login.status, 200);
      const user = await login.json();
      const headers = {
        'Content-Type': 'application/json',
        Cookie: login.headers.get('set-cookie').split(';')[0],
        'X-CSRF-Token': user.csrf,
      };
      const pgn = '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
      const { parsePgn } = await import('../src/study/game.js');
      const game = parsePgn(pgn);
      const saved = await fetch(base + '/api/account/library/' + game.id, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pgn }),
      });
      assert.equal(saved.status, 200, await saved.text());
      const library = await (await fetch(base + '/api/account/library', { headers })).json();
      assert.equal(library.games.length, 1);
      const removed = await fetch(base + '/api/account/delete', {
        method: 'POST',
        headers,
        body: '{}',
      });
      assert.equal(removed.status, 200);
      assert.equal((await store.get('account:' + id)).value, null);
    } finally {
      await store.remove('account:' + id);
      // Nonces have no account FK: remove this test's nonce explicitly.
      if (nonce) await store.remove('login:' + createHash('sha256').update(nonce).digest('hex'));
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  },
);

test(
  'six SQL accounts can write the same game concurrently without crossing ownership',
  { skip: !process.env.EVALA_TEST_DATABASE_URL },
  async () => {
    const pool = postgresPool(process.env.EVALA_TEST_DATABASE_URL);
    const store = createPostgresStore({ pool });
    const ids = Array.from({ length: 6 }, () =>
      createHash('sha256').update(randomUUID()).digest('hex'),
    );
    try {
      await Promise.all(
        ids.map((id) =>
          store.put('account:' + id, {
            id,
            name: 'Concurrent fixture',
            email: 'concurrent@example.invalid',
            authEpoch: 'fixture',
            createdAt: Date.now(),
            games: {},
            training: { rating: 1200, history: {} },
          }),
        ),
      );
      for (let round = 0; round < 3; round++)
        await Promise.all(
          ids.map((id) =>
            store.transact('account:' + id, async (a) => {
              const version = 'round-' + round;
              await store.put('game:' + id + ':same-id:' + version, { notes: id, round });
              a.games['same-id'] = {
                id: 'same-id',
                version,
                white: 'Fixture',
                black: 'Opponent',
                result: '*',
              };
              return a;
            }),
          ),
        );
      for (const id of ids) {
        const account = (await store.get('account:' + id)).value;
        assert.equal(account.games['same-id'].version, 'round-2');
        assert.equal((await store.get('game:' + id + ':same-id:round-2')).value.notes, id);
      }
    } finally {
      for (const id of ids) await store.remove('account:' + id);
      await store.close();
    }
  },
);
