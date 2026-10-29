import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn, DEMO_PGN } from '../src/study/game.js';
import { estimateGamePerformance, summarize } from '../src/study/review.js';

function analysed(accuracy = 85) {
  const game = parsePgn(DEMO_PGN);
  game.headers.WhiteElo = '1200';
  game.headers.BlackElo = '1200';
  game.analysis = {
    complete: true,
    positions: game.fens.map((_, i) => ({
      kind: 'cp',
      value: i % 2 ? -(100 - accuracy) * 6 : 0,
      depth: 18,
    })),
    moves: game.moves.map(() => ({ kind: 'best', accuracy, loss: 0 })),
  };
  return game;
}
test('performance requires a completed, sufficiently deep and informative game with a known baseline', () => {
  const game = analysed();
  assert.ok(estimateGamePerformance(game, 'w').value);
  const short = analysed();
  short.moves = short.moves.slice(0, 16);
  assert.equal(estimateGamePerformance(short, 'w').value, null);
  const missing = analysed();
  delete missing.headers.WhiteElo;
  assert.equal(estimateGamePerformance(missing, 'w').value, null);
  const incomplete = analysed();
  incomplete.analysis.complete = false;
  assert.equal(estimateGamePerformance(incomplete, 'w').value, null);
  const shallow = analysed();
  shallow.analysis.positions.forEach((p) => (p.depth = 8));
  assert.equal(estimateGamePerformance(shallow, 'w').value, null);
  const won = analysed();
  won.analysis.positions.forEach((p) => (p.value = 3000));
  assert.equal(estimateGamePerformance(won, 'w').value, null);
  const repeated = analysed();
  repeated.moves.forEach((m) => (m.fenBefore = repeated.initialFen));
  assert.equal(estimateGamePerformance(repeated, 'w').value, null);
});
test('performance uses current engine evidence and requires both sides of each decision', () => {
  const game = analysed(95);
  const first = estimateGamePerformance(game, 'w').value;
  game.analysis.positions.forEach((p, i) => {
    p.value = i % 2 ? -400 : 0;
  });
  assert.ok(estimateGamePerformance(game, 'w').value < first);
  game.analysis.moves.forEach((m) => {
    m.accuracy = 100;
  });
  assert.ok(
    estimateGamePerformance(game, 'w').value < first,
    'saved marks cannot inflate performance',
  );
  game.analysis.positions.forEach((p, i) => {
    if (i % 2) delete p.depth;
  });
  assert.equal(estimateGamePerformance(game, 'w').value, null);
});
test('performance is an explicitly uncalibrated relative estimate and move counts preserve both colours', () => {
  const low = estimateGamePerformance(analysed(55), 'w'),
    high = estimateGamePerformance(analysed(95), 'w');
  assert.ok(high.value > low.value);
  assert.equal(high.calibrated, false);
  assert.equal(high.baseline, 1200);
  assert.ok(high.low < high.value && high.high > high.value);
  const game = analysed();
  game.analysis.moves[0].kind = 'brilliant';
  game.analysis.moves[1].kind = 'blunder';
  const summary = summarize(game);
  assert.equal(summary.w.brilliants, 1);
  assert.equal(summary.b.counts.blunder, 1);
  for (const color of ['w', 'b'])
    assert.equal(
      Object.values(summary[color].counts).reduce((n, v) => n + v, 0),
      game.moves.filter((m) => m.color === color).length,
    );
});
