import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createDocumentStore } from '../server/document-store.mjs';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn, parseFenGame } from '../src/study/game.js';
import { publicSnapshot } from '../src/study/share-snapshot.js';
import { playedToday, gameStatusMarkup } from '../src/study/views/game-status.js';
const pgn =
  '[White "Alice"]\n[Black "Bob"]\n[Event "PRIVATE EVENT"]\n[Result "*"]\n\n1. e4 {PRIVATE COMMENT [%clk 0:02:10]} e5 2. Nf3 Nc6 *';
test('public snapshot excludes comments, clocks, private notes and non-public headers; preserves FEN and legal variations', () => {
  const game = parsePgn(pgn);
  game.notes = 'PRIVATE NOTE';
  game.learning = { notes: { 0: { text: 'SECRET' } } };
  const snapshot = publicSnapshot(game, { ply: 1, moves: ['c7c5', 'g1f3'] });
  assert.ok(!JSON.stringify(snapshot).match(/PRIVATE|SECRET|clk/));
  assert.equal(parsePgn(snapshot.pgn).moves.length, 4);
  assert.deepEqual(snapshot.variation, { ply: 1, moves: ['c7c5', 'g1f3'] });
  assert.throws(() => publicSnapshot(game, { ply: 1, moves: ['e2e5'] }));
  assert.throws(() => publicSnapshot(game, { ply: 999, moves: ['e2e4'] }));
  const position = parseFenGame('4k3/8/8/8/8/8/8/4K2R b - - 0 1');
  assert.equal(parsePgn(publicSnapshot(position).pgn).initialFen, position.initialFen);
});
test('public sharing is durable, unlisted, bounded and revocable only with the owner capability', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'evala-shares-'));
  const store = createDocumentStore({ directory: dir, connectionString: '' });
  let server;
  const start = async () => {
    server = createAnalysisServer({ localEngineOnly: true, accounts: { store } });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return 'http://127.0.0.1:' + server.address().port;
  };
  let base = await start();
  const call = (path, options = {}) =>
    fetch(base + '/api/shares' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Origin: base, ...options.headers },
    });
  try {
    assert.equal(
      (
        await call('', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
          body: JSON.stringify({ pgn }),
        })
      ).status,
      403,
    );
    const create = await call('', {
      method: 'POST',
      body: JSON.stringify({ pgn, variation: { ply: 1, moves: ['c7c5'] } }),
    });
    assert.equal(create.status, 201);
    const own = await create.json();
    assert.match(own.id, /^[A-Za-z0-9_-]{22}$/);
    assert.match(own.deleteToken, /^[A-Za-z0-9_-]{43}$/);
    const read = await call('/' + own.id);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    const shared = await read.json();
    assert.equal(shared.deleteToken, undefined);
    assert.equal(shared.ownerHash, undefined);
    assert.ok(!JSON.stringify(shared).includes('PRIVATE'));
    assert.equal(shared.variation.moves[0], 'c7c5');
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    base = await start();
    assert.equal((await call('/' + own.id)).status, 200);
    assert.equal(
      (
        await call('/' + own.id, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + 'x'.repeat(43) },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call('/' + own.id, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + own.deleteToken },
        })
      ).status,
      200,
    );
    assert.equal((await call('/' + own.id)).status, 404);
    assert.equal(
      (
        await call('', {
          method: 'POST',
          body: JSON.stringify({ pgn, variation: { ply: 1, moves: ['e2e5'] } }),
        })
      ).status,
      400,
    );
    assert.equal((await call('/../accounts')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(dir.includes('evala-shares-'));
    await rm(dir, { recursive: true, force: true });
  }
});
test('library states distinguish today, partial and complete without using colour alone', () => {
  const game = parsePgn(pgn);
  const now = new Date(2026, 10, 2, 12);
  game.headers.Date = '2026.11.02';
  assert.equal(playedToday(game, now), true);
  game.headers.Date = '2026.11.01';
  assert.equal(playedToday(game, now), false);
  assert.match(gameStatusMarkup(game), /status-pending/);
  game.analysis = { positions: [{ value: 0 }] };
  assert.match(gameStatusMarkup(game), /status-partial/);
  game.analysis.complete = true;
  assert.match(gameStatusMarkup(game), /status-complete/);
});
