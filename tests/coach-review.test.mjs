import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { judgeRetry, legalContinuation, reviewMoments } from '../src/study/coach-review.js';

test('review keeps chronological decisions and respects player filtering', () => {
  const game = {
    moves: [{ color: 'w' }, { color: 'b' }, { color: 'w' }],
    analysis: { moves: [{ kind: 'blunder' }, { kind: 'brilliant' }, { kind: 'best' }] },
  };
  assert.deepEqual(
    reviewMoments(game).map((m) => m.ply),
    [1, 2],
  );
  assert.deepEqual(
    reviewMoments(game, 'b').map((m) => m.ply),
    [2],
  );
  assert.deepEqual(reviewMoments(null), []);
});
test('retry accepts verified sound alternatives, not unsearched or shallow guesses', () => {
  const fen = new Chess().fen();
  const line = (pv, value, depth = 18) => ({ pv: [pv], kind: 'cp', value, depth });
  const position = { lines: [line('e2e4', 30), line('d2d4', 20), line('f2f3', -250)] };
  assert.equal(judgeRetry(fen, 'e2e4', position), 'best');
  assert.equal(judgeRetry(fen, 'd2d4', position), 'sound');
  assert.equal(judgeRetry(fen, 'f2f3', position), 'retry');
  assert.equal(judgeRetry(fen, 'g1f3', position), 'unknown');
  position.lines[1].depth = 5;
  assert.equal(judgeRetry(fen, 'd2d4', position), 'unknown');
  const chess = new Chess();
  chess.move('e4');
  assert.equal(
    judgeRetry(chess.fen(), 'c7c5', { lines: [line('e7e5', -30), line('c7c5', -20)] }),
    'sound',
  );
});
test('line playback stops on illegal moves and bounds work', () => {
  const fen = new Chess().fen();
  assert.equal(legalContinuation(fen, ['e2e4', 'e7e5', 'e2e4']).length, 2);
  assert.equal(legalContinuation(fen, ['e2e4', 'e7e5'], 1).length, 1);
  assert.deepEqual(legalContinuation('invalid', ['e2e4']), []);
});
