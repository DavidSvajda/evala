import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
import { parsePgn } from '../src/study/game.js';

const client = 'test.apps.googleusercontent.com',
  issuer = 'https://accounts.google.com';
const keys = await generateKeyPair('RS256');
const pgn =
  '[Event "Account test"]\n[White "Friend"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const bank = JSON.parse(await readFile('public/data/puzzles.json', 'utf8')).puzzles;
async function serverFor(directory, { store = createDocumentStore({ directory }) } = {}) {
  const server = createAnalysisServer({
    token: 'owner-test',
    publicReports: true,
    accounts: {
      store,
      googleClientId: client,
      verifyGoogle: async (token) =>
        (
          await jwtVerify(token, keys.publicKey, {
            audience: client,
            issuer,
            algorithms: ['RS256'],
          })
        ).payload,
    },
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
async function login(
  base,
  sub,
  { audience = client, nonceMismatch = false, secure = false, oldCookie = '' } = {},
) {
  const transport = secure ? { 'X-Forwarded-Proto': 'https' } : {};
  const config = await fetch(base + '/api/account/config', { headers: transport }),
    data = await config.json(),
    challengeCookie = config.headers.get('set-cookie').split(';')[0];
  const credential = await new SignJWT({
    sub,
    email: sub + '@example.test',
    email_verified: true,
    name: sub,
    nonce: nonceMismatch ? 'invalid' : data.challenge,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
  const response = await fetch(base + '/api/account/google', {
    method: 'POST',
    headers: {
      ...transport,
      Cookie: challengeCookie + (oldCookie ? '; ' + oldCookie : ''),
      'Content-Type': 'application/json',
      'X-CSRF-Token': data.challenge,
    },
    body: JSON.stringify({ credential }),
  });
  if (!response.ok) return { response };
  const body = await response.json();
  return {
    response,
    ...body,
    cookie: response.headers.get('set-cookie').split(';')[0],
    headers: {
      ...transport,
      Cookie: response.headers.get('set-cookie').split(';')[0],
      'Content-Type': 'application/json',
      'X-CSRF-Token': body.csrf,
    },
    replay: { credential, challengeCookie, challenge: data.challenge },
  };
}
test('Google signatures, audience, nonce, CSRF and session isolation protect a persistent account library', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evala-account-'));
  let running = await serverFor(directory);
  try {
    const { base } = running;
    assert.equal((await login(base, 'alice', { audience: 'wrong' })).response.status, 401);
    assert.equal((await login(base, 'alice', { nonceMismatch: true })).response.status, 401);
    const alice = await login(base, 'alice'),
      bob = await login(base, 'bob');
    assert.equal(alice.response.status, 200);
    assert.notEqual(alice.user.id, bob.user.id);
    assert.match(alice.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    assert.ok(!JSON.stringify(alice.user).includes('credential'));
    const replay = await fetch(base + '/api/account/google', {
      method: 'POST',
      headers: {
        Cookie: alice.replay.challengeCookie,
        'Content-Type': 'application/json',
        'X-CSRF-Token': alice.replay.challenge,
      },
      body: JSON.stringify({ credential: alice.replay.credential }),
    });
    assert.equal(replay.status, 403);
    const game = parsePgn(pgn);
    game.notes = 'Remember the diagonal.';
    game.learning = {
      notes: { 1: { text: 'My candidate', critical: true } },
      attempts: [],
      selfAnalysis: true,
    };
    game.analysis = {
      positions: game.fens.map(() => ({
        kind: 'cp',
        value: 0,
        depth: 18,
        lines: [{ kind: 'cp', value: 0, depth: 18, pv: ['f2f3'] }],
      })),
      moves: game.moves.map(() => ({ kind: 'brilliant', note: 'forged' })),
      complete: true,
    };
    const path = '/api/account/library/' + game.id;
    assert.equal(
      (
        await fetch(base + path, {
          method: 'PUT',
          headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify(game),
        })
      ).status,
      403,
    );
    let response = await fetch(base + path, {
      method: 'PUT',
      headers: alice.headers,
      body: JSON.stringify(game),
    });
    assert.equal(response.status, 200);
    const { version } = await response.json();
    const saved = await (await fetch(base + path, { headers: alice.headers })).json();
    assert.equal(saved.game.notes, game.notes);
    assert.equal(saved.game._remoteVersion, version);
    assert.equal(saved.game.learning.notes[1].text, 'My candidate');
    assert.equal(saved.game.learning.selfAnalysis, true);
    assert.ok(saved.game.analysis.moves.every((m) => m.kind !== 'brilliant'));
    assert.equal((await fetch(base + path, { headers: bob.headers })).status, 404);
    assert.equal(
      (await (await fetch(base + '/api/account/library', { headers: bob.headers })).json()).games
        .length,
      0,
    );
    assert.equal(
      (
        await fetch(base + path, {
          method: 'PUT',
          headers: alice.headers,
          body: JSON.stringify(game),
        })
      ).status,
      409,
      'stale device must not overwrite a saved game',
    );
    response = await fetch(base + '/api/account/profile', {
      method: 'PATCH',
      headers: alice.headers,
      body: JSON.stringify({
        preferences: { boardTheme: 'blue', pieceStyle: 'letters', token: 'never-store' },
      }),
    });
    assert.equal(response.status, 200);
    await running.close();
    running = await serverFor(directory);
    const restored = await (
      await fetch(running.base + '/api/account/me', { headers: alice.headers })
    ).json();
    assert.equal(restored.user.name, 'alice');
    assert.equal(restored.user.preferences.boardTheme, 'blue');
    assert.ok(!('token' in restored.user.preferences));
    assert.equal((await fetch(running.base + path, { headers: alice.headers })).status, 200);
    assert.equal(
      (
        await fetch(running.base + '/api/account/logout', {
          method: 'POST',
          headers: alice.headers,
          body: '{}',
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: alice.headers })).json())
        .user,
      null,
    );
  } finally {
    await running.close();
  }
});
test('account puzzle grading is server-authoritative, cannot be replayed for points, and persists reviews', async () => {
  const running = await serverFor(await mkdtemp(join(tmpdir(), 'evala-training-')));
  try {
    const user = await login(running.base, 'learner'),
      post = async (path, body) => {
        const response = await fetch(running.base + '/api/account/' + path, {
          method: 'POST',
          headers: user.headers,
          body: JSON.stringify(body),
        });
        return { response, data: await response.json() };
      };
    let result = await post('puzzle/next', { theme: 'mateIn1', mode: 'rated' });
    assert.equal(result.response.status, 200);
    const challenge = result.data.puzzle,
      puzzle = bank.find((p) => p.id === challenge.id);
    assert.ok(!challenge.moves);
    for (let i = 1; i < puzzle.moves.length; i += 2)
      result = await post('puzzle/move', {
        challengeId: challenge.challengeId,
        move: puzzle.moves[i],
      });
    assert.equal(result.data.state.complete, true);
    assert.equal(result.data.training.solved, 1);
    assert.ok(result.data.training.history[puzzle.id]);
    const replay = await post('puzzle/move', {
      challengeId: challenge.challengeId,
      move: puzzle.moves[1],
    });
    assert.equal(replay.response.status, 400);
    const next = await post('puzzle/next', { theme: 'fork', mode: 'rated' }),
      hint = await post('puzzle/hint', { challengeId: next.data.puzzle.challengeId });
    assert.equal(hint.data.training.attempted, 2);
    assert.ok(hint.data.delta < 0);
    const again = await post('puzzle/hint', { challengeId: next.data.puzzle.challengeId });
    assert.equal(again.data.training.attempted, 2);
    assert.equal(again.data.delta, 0);
  } finally {
    await running.close();
  }
});
test('local document transactions serialize concurrent account updates', async () => {
  const store = createDocumentStore({ directory: await mkdtemp(join(tmpdir(), 'evala-store-')) });
  await Promise.all(
    Array.from({ length: 30 }, () =>
      store.transact('counter', (prior) => ({ value: (prior?.value || 0) + 1 })),
    ),
  );
  assert.equal((await store.get('counter')).value.value, 30);
});

test('HTTPS uses host-bound cookies, rejects a legacy injected cookie, and rotates an existing login', async () => {
  const running = await serverFor(await mkdtemp(join(tmpdir(), 'evala-secure-session-')));
  try {
    const first = await login(running.base, 'secure', { secure: true });
    assert.match(first.cookie, /^__Host-evala_account=/);
    assert.match(first.response.headers.get('set-cookie'), /; Secure$/);
    const legacy = await (
      await fetch(running.base + '/api/account/me', {
        headers: {
          ...first.headers,
          Cookie: first.cookie.replace('__Host-evala_account=', 'evala_account='),
        },
      })
    ).json();
    assert.equal(legacy.user, null);
    assert.equal(
      (
        await fetch(running.base + '/api/account/library', {
          headers: { ...first.headers, 'X-Evala-Account': 'another-account' },
        })
      ).status,
      409,
    );
    const second = await login(running.base, 'secure', { secure: true, oldCookie: first.cookie });
    assert.notEqual(first.cookie, second.cookie);
    assert.equal(first.user.generation, second.user.generation);
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: first.headers })).json())
        .user,
      null,
    );
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: second.headers })).json())
        .user.id,
      first.user.id,
    );
  } finally {
    await running.close();
  }
});

test('deletion revokes concurrent writes before cleanup; interrupted cleanup resumes on verified login', async () => {
  const baseStore = createDocumentStore({
    directory: await mkdtemp(join(tmpdir(), 'evala-delete-race-')),
  });
  let signalStarted,
    release,
    failOnce = false;
  const started = new Promise((r) => (signalStarted = r)),
    gate = new Promise((r) => (release = r));
  const store = {
    ...baseStore,
    remove: async (key) => {
      if (key.startsWith('game:')) {
        signalStarted();
        await gate;
        if (failOnce) {
          failOnce = false;
          throw new Error('fixture failure');
        }
      }
      return baseStore.remove(key);
    },
  };
  const running = await serverFor('', { store });
  try {
    const user = await login(running.base, 'delete-race'),
      game = parsePgn(pgn),
      path = '/api/account/library/' + game.id;
    assert.equal(
      (
        await fetch(running.base + path, {
          method: 'PUT',
          headers: user.headers,
          body: JSON.stringify(game),
        })
      ).status,
      200,
    );
    failOnce = true;
    const deleting = fetch(running.base + '/api/account/delete', {
      method: 'POST',
      headers: user.headers,
      body: '{}',
    });
    await started;
    assert.equal(
      (
        await fetch(running.base + path, {
          method: 'PUT',
          headers: user.headers,
          body: JSON.stringify(game),
        })
      ).status,
      401,
    );
    release();
    assert.equal((await deleting).status, 500);
    const fresh = await login(running.base, 'delete-race');
    assert.equal(fresh.response.status, 200);
    assert.notEqual(fresh.user.generation, user.user.generation);
    assert.equal(
      (
        await (
          await fetch(running.base + '/api/account/library', { headers: fresh.headers })
        ).json()
      ).games.length,
      0,
    );
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: user.headers })).json())
        .user,
      null,
    );
  } finally {
    release();
    await running.close();
  }
});

test('lesson selection is validated and lesson completion cannot inflate the rated score', async () => {
  const running = await serverFor(await mkdtemp(join(tmpdir(), 'evala-lesson-')));
  try {
    const user = await login(running.base, 'lesson-player'),
      puzzle = bank.find((p) => p.themes.includes('mateIn1'));
    const response = await fetch(running.base + '/api/account/puzzle/next', {
      method: 'POST',
      headers: user.headers,
      body: JSON.stringify({ mode: 'lesson', puzzleId: puzzle.id }),
    });
    const next = await response.json();
    assert.equal(next.puzzle.id, puzzle.id);
    let result;
    for (let i = 1; i < puzzle.moves.length; i += 2)
      result = await (
        await fetch(running.base + '/api/account/puzzle/move', {
          method: 'POST',
          headers: user.headers,
          body: JSON.stringify({ challengeId: next.puzzle.challengeId, move: puzzle.moves[i] }),
        })
      ).json();
    assert.equal(result.training.rating, 800);
    assert.equal(result.training.solved, 1);
    assert.equal(result.delta, 0);
  } finally {
    await running.close();
  }
});

test('deleting an account revokes sessions on every device even after signing in again', async () => {
  const running = await serverFor(await mkdtemp(join(tmpdir(), 'evala-revocation-')));
  try {
    const first = await login(running.base, 'same-user'),
      other = await login(running.base, 'same-user');
    const response = await fetch(running.base + '/api/account/delete', {
      method: 'POST',
      headers: first.headers,
      body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: other.headers })).json())
        .user,
      null,
    );
    const fresh = await login(running.base, 'same-user');
    assert.equal(fresh.response.status, 200);
    assert.equal(
      (await (await fetch(running.base + '/api/account/me', { headers: other.headers })).json())
        .user,
      null,
    );
    assert.equal(
      (
        await fetch(running.base + '/api/account/profile', {
          method: 'PATCH',
          headers: other.headers,
          body: JSON.stringify({ preferences: { boardTheme: 'blue' } }),
        })
      ).status,
      401,
    );
  } finally {
    await running.close();
  }
});

test('sign out all devices revokes other sessions and stale sessions cannot delete an account', async () => {
  const store = createDocumentStore({
    directory: await mkdtemp(join(tmpdir(), 'evala-all-sessions-')),
  });
  const running = await serverFor('', { store });
  try {
    const first = await login(running.base, 'owner'),
      second = await login(running.base, 'owner');
    const key = 'session:' + createHash('sha256').update(first.cookie.split('=')[1]).digest('hex');
    await store.transact(key, (s) => ({ ...s, createdAt: Date.now() - 16 * 60000 }));
    assert.equal(
      (
        await fetch(running.base + '/api/account/delete', {
          method: 'POST',
          headers: first.headers,
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(running.base + '/api/account/logout-all', {
          method: 'POST',
          headers: first.headers,
          body: '{}',
        })
      ).status,
      200,
    );
    for (const user of [first, second]) {
      assert.equal(
        (await fetch(running.base + '/api/account/library', { headers: user.headers })).status,
        401,
      );
    }
    const again = await login(running.base, 'owner');
    assert.equal(again.response.status, 200);
    assert.notEqual(again.user.generation, first.user.generation);
  } finally {
    await running.close();
  }
});
