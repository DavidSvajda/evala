import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createAnalysisServer } from '../server/index.mjs';
import { humanRequest } from '../server/human-opponent.mjs';
import { chooseHumanMove } from '../src/training/human-policy.js';

test('practice validates bounded legal history, rating and style', () => {
  const request = { initialFen: new Chess().fen(), moves: ['e2e4'], elo: 1400, style: 'natural' };
  assert.equal(humanRequest(request).chess.turn(), 'b');
  for (const patch of [
    { elo: Infinity },
    { elo: 0 },
    { style: 'shell' },
    { initialFen: 'bad' },
    { moves: ['e2e5'] },
    { moves: Array(601).fill('e2e4') },
  ])
    assert.throws(() => humanRequest({ ...request, ...patch }));
});
test('attacking policy prefers a sound material offer but rejects excessive loss and shallow proof', () => {
  const board = new Chess('4k3/1p6/8/1B6/8/8/8/4K3 w - - 0 1');
  const prediction = {
    move: 'b5a4',
    candidates: [
      { move: 'b5a4', probability: 0.8 },
      { move: 'b5a6', probability: 0.1 },
    ],
  };
  const lines = [
    { pv: ['b5a4'], kind: 'cp', value: 0, depth: 16 },
    { pv: ['b5a6'], kind: 'cp', value: -30, depth: 16 },
  ];
  assert.equal(chooseHumanMove(board, prediction, { lines }, 'natural').move, 'b5a4');
  assert.equal(chooseHumanMove(board, prediction, { lines }, 'attacking').sacrifice, true);
  lines[1].value = -250;
  assert.equal(chooseHumanMove(board, prediction, { lines }, 'attacking').move, 'b5a4');
  assert.equal(chooseHumanMove(board, prediction, { lines: [] }, 'attacking').styleApplied, false);
  assert.throws(() => chooseHumanMove(board, { move: 'e2e4' }, null, 'natural'));
});
test('public practice requires a session, shares server limits and returns only a legal move', async () => {
  let called = 0;
  const server = createAnalysisServer({
    token: 'owner',
    publicReports: true,
    human: {
      maia: {
        available: true,
        ready: true,
        async predict() {
          called++;
          return { move: 'e2e4', candidates: [] };
        },
        dispose() {},
      },
    },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({
    initialFen: new Chess().fen(),
    moves: [],
    elo: 1400,
    style: 'natural',
  });
  try {
    assert.equal(
      (
        await fetch(base + '/api/opponent/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      ).status,
      401,
    );
    const session = await fetch(base + '/api/session'),
      cookie = session.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base + '/api/opponent/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).move, 'e2e4');
    assert.equal(called, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
