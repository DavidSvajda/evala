import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../src/study/game.js';
import { estimateGamePerformance } from '../src/study/review.js';

test('Scholar’s Mate gets a rating-relative short-game grade including opening moves', () => {
  const game = parsePgn(
    '[WhiteElo "1200"]\n[BlackElo "1200"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
  );
  game.analysis = {
    complete: true,
    positions: game.fens.map((_, i) =>
      i < 6
        ? { kind: 'cp', value: 30, depth: 14 }
        : { kind: 'mate', value: 1, depth: 14, terminal: i === 7 },
    ),
  };
  const white = estimateGamePerformance(game, 'w'),
    black = estimateGamePerformance(game, 'b');
  assert.equal(white.basis, 'short-game');
  assert.equal(white.sample, 4);
  assert.equal(white.baseline, 1200);
  assert.ok(white.value > 1200 && white.value > black.value);
  assert.ok(white.high - white.low >= 1000);
  assert.equal(white.provisional, true);
  game.analysis.positions[2].depth = 2;
  assert.equal(estimateGamePerformance(game, 'w').value, null);
});

test('Fool’s Mate separates quality and never treats incomplete analysis as a final grade', () => {
  const g = parsePgn('[WhiteElo "1500"]\n[BlackElo "1500"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  g.analysis = {
    complete: true,
    positions: [30, -150, -150, -900, -1000].map((value) => ({ kind: 'cp', value, depth: 12 })),
  };
  assert.ok(estimateGamePerformance(g, 'b').value > estimateGamePerformance(g, 'w').value);
  g.analysis.complete = false;
  assert.equal(estimateGamePerformance(g, 'b').value, null);
});
