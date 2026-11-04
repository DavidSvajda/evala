import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
import { parsePgn } from '../src/study/game.js';

test('account synchronisation preserves a partial review even after every base position is evaluated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evala-resume-'));
  let nonce;
  const server = createAnalysisServer({
    localEngineOnly: true,
    accounts: {
      store: createDocumentStore({ directory, databaseUrl: '' }),
      googleClientId: 'test',
      verifyGoogle: async () => ({
        sub: 'resume-test',
        email: 'resume@example.invalid',
        email_verified: true,
        name: 'Test',
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
      body: JSON.stringify({ credential: 'fixture' }),
    });
    const state = await login.json();
    const headers = {
      'Content-Type': 'application/json',
      Cookie: login.headers.get('set-cookie').split(';')[0],
      'X-CSRF-Token': state.csrf,
    };
    const g = parsePgn('1. Nf3 Nf6 2. Nc3 Nc6 *');
    g.analysis = {
      key: 'resume-fixture',
      version: 5,
      complete: false,
      engine: 'full',
      profile: 'balanced',
      startedAt: Date.now(),
      options: { depth: 20, time: 500, multipv: 3 },
      refined: [1],
      refinedPositions: [1, 2],
      positions: g.fens.map(() => ({
        kind: 'cp',
        value: 0,
        depth: 14,
        lines: [{ kind: 'cp', value: 0, depth: 14, pv: [] }],
      })),
    };
    const path = base + '/api/account/library/' + g.id;
    const saved = await fetch(path, { method: 'PUT', headers, body: JSON.stringify(g) });
    assert.equal(saved.status, 200, await saved.text());
    const restored = await (await fetch(path, { headers })).json();
    assert.equal(restored.game.analysis.complete, false);
    assert.equal(restored.game.analysis.finishedAt, undefined);
    assert.equal(restored.game.analysis.key, 'resume-fixture');
    assert.deepEqual(restored.game.analysis.options, g.analysis.options);
    assert.deepEqual(restored.game.analysis.refinedPositions, [1, 2]);
    assert.equal(restored.game.analysis.profile, 'balanced');
    const library = await (await fetch(base + '/api/account/library', { headers })).json();
    assert.equal(library.games[0].analyzed, false);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
