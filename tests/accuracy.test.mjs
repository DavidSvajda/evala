import test from 'node:test';
import assert from 'node:assert/strict';
import { gameAccuracy } from '../src/core/game-accuracy.js';
import { summarize } from '../src/study/review.js';

function fixture(values, start = 'w') {
  return {
    headers: {},
    moves: values
      .slice(1)
      .map((_, i) => ({ color: (i % 2 === 0) === (start === 'w') ? 'w' : 'b' })),
    analysis: {
      complete: true,
      positions: values.map((value) => ({ kind: 'cp', value, depth: 18 })),
      moves: values.slice(1).map(() => ({ accuracy: 100, loss: 0, kind: 'best' })),
    },
  };
}

test('equal evaluations are perfect; missing and unfinished analyses never show a final percentage', () => {
  const game = fixture([0, 0, 0, 0, 0]);
  assert.equal(gameAccuracy(game).w, 100);
  assert.equal(gameAccuracy(game).b, 100);
  game.analysis.complete = false;
  assert.equal(gameAccuracy(game).w, null);
  game.analysis.complete = true;
  delete game.analysis.positions[2];
  assert.equal(gameAccuracy(game).w, null);
  for (const value of [NaN, Infinity, '0']) {
    game.analysis.positions[2] = { kind: 'cp', value };
    assert.equal(gameAccuracy(game).b, null);
  }
  assert.equal(gameAccuracy(fixture([0])).w, null);
});

test('a decisive blunder is not washed away by 39 routine moves or stale saved move scores', () => {
  const game = fixture([0, ...Array(80).fill(-1000)]),
    result = gameAccuracy(game);
  // The previous arithmetic mean is above 97%; this game must be materially lower.
  // Four White moves carry weight 12; the remaining 36 carry weight 0.5.
  assert.ok(Math.abs(result.w - 83.37282671729339) < 1e-9, String(result.w));
  assert.ok(Math.abs(result.b - 100) < 1e-10);
  assert.equal(summarize(game).w.accuracy, result.w);
  game.analysis.moves.forEach((mark) => (mark.accuracy = 0));
  assert.equal(summarize(game).w.accuracy, result.w);
});

test('White and Black are symmetric, including a custom position with Black to move', () => {
  const white = gameAccuracy(fixture([150, -200, -100, -400, -300])),
    black = gameAccuracy(fixture([-150, 200, 100, 400, 300], 'b'));
  assert.ok(Math.abs(white.w - black.b) < 1e-10);
  assert.ok(Math.abs(white.b - black.w) < 1e-10);
  // Use the actual initial evaluation, not an assumed equal starting position.
  assert.equal(gameAccuracy(fixture([-800, -600], 'b')).b < 100, true);
  assert.equal(gameAccuracy(fixture([800, 600], 'b')).b, 100);
});

test('lost winning chances matter more than equivalent centipawn loss in an already won position', () => {
  const balanced = gameAccuracy(fixture([0, -200])),
    won = gameAccuracy(fixture([1000, 800]));
  assert.ok(won.w > balanced.w + 25);
  const mate = fixture([-1000, -1000]);
  mate.analysis.positions[1] = { kind: 'mate', value: -1, depth: 0, terminal: true };
  assert.equal(gameAccuracy(mate).w, 100);
  assert.equal(gameAccuracy(mate).provisional, false);
  mate.analysis.positions[0].depth = 8;
  assert.equal(gameAccuracy(mate).provisional, true);
});

test('longer games use bounded sliding windows and always return finite percentages', () => {
  for (const length of [1, 19, 20, 39, 40, 80, 160]) {
    const values = Array.from({ length: length + 1 }, (_, i) => ((i % 5) - 2) * 200),
      result = gameAccuracy(fixture(values));
    for (const color of ['w', 'b']) {
      if (color === 'b' && length === 1) assert.equal(result.b, null);
      else assert.ok(Number.isFinite(result[color]) && result[color] >= 0 && result[color] <= 100);
    }
  }
});
