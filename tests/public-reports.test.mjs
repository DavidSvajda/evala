import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
import { applyReviewProgress } from '../src/study/review-stream.js';

const pgn = '[White "Friend"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
test('shared web has no token prompt; anonymous computation requires an expiring session and is bounded', async () => {
  const server = createAnalysisServer({
    token: 'owner-secret',
    publicReports: true,
    publicBudgetSeconds: 20,
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base)).text();
    assert.match(html, /name="evala-public" content="true"/);
    assert.ok(!html.includes('owner-secret'));
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal(
      (await fetch(base + '/api/review-game', { method: 'POST', body: JSON.stringify({ pgn }) }))
        .status,
      401,
    );
    const session = await fetch(base + '/api/session');
    const cookie = session.headers.get('set-cookie').split(';')[0];
    assert.match(cookie, /evala_session=[0-9a-f]{48}/);
    assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await session.json()).maxGames, 100);
    const before = await fetch(base + '/api/review-game', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgn, profile: 'quick', streamVersion: 2 }),
    });
    assert.equal(before.status, 200);
    const messages = (await before.text()).trim().split('\n').map(JSON.parse);
    assert.ok(messages.some((m) => m.phase === 'positions'));
    const game = messages.find((m) => m.type === 'game').game;
    assert.equal(game.id, parsePgn(pgn).id);
    assert.equal(game.analysis.complete, true);
    assert.equal(game.analysis.moves.length, 4);
    const partial = parsePgn(pgn);
    for (const message of messages.filter((m) => m.type === 'progress')) {
      assert.equal(message.report, undefined);
      applyReviewProgress(partial, message);
    }
    assert.deepEqual(partial.analysis.positions, game.analysis.positions);
    assert.deepEqual(partial.analysis.moves, game.analysis.moves);
    assert.equal(partial.analysis.complete, true);
    assert.equal(
      (await fetch(base + '/api/session', { headers: { Origin: 'https://foreign.example' } }))
        .status,
      403,
    );
    const invalid = await fetch(base + '/api/review-game', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ pgn: 'not pgn' }),
    });
    assert.equal(invalid.status, 400);
    const huge = await fetch(base + '/api/review-game', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: 'x'.repeat(310000),
    });
    assert.equal(huge.status, 413);
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.busy, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
test('public budget cannot be bypassed with a new session', async () => {
  const server = createAnalysisServer({
    token: 'owner-secret',
    publicReports: true,
    publicBudgetSeconds: 1,
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(base + '/api/session');
      const cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await fetch(base + '/api/review-game', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ pgn, profile: 'balanced' }),
      });
      assert.equal(result.status, 429);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
