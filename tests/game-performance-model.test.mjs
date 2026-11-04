import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contextualPerformance } from '../src/core/game-performance.js';
import { estimateGamePerformance } from '../src/study/review.js';
import { parsePgn } from '../src/study/game.js';
async function fixture() {
  const data = JSON.parse(
    await readFile(new URL('./fixtures/performance-rapid.json', import.meta.url)),
  );
  const game = parsePgn(data.pgn);
  game.analysis = data.analysis;
  return game;
}
test('relative game performance responds nonlinearly and remains finite at extreme qualities', () => {
  for (const rating of [100, 800, 1700, 2400, 3500]) {
    const values = [0, 20, 50, 80, 90, 97, 100].map((q) => contextualPerformance(rating, q).value);
    assert.ok(values.every((v) => Number.isFinite(v) && v >= 100 && v <= 3500));
    assert.deepEqual(
      [...values].sort((a, b) => a - b),
      values,
    );
  }
  const expected = contextualPerformance(1700, 80.5);
  assert.equal(expected.value, 1700);
  assert.ok(contextualPerformance(1700, 98).value - contextualPerformance(1700, 90).value >= 200);
});
test('completed real rapid game uses fast evidence, separates sides and reveals recorded rating', async () => {
  const g = await fixture(),
    white = estimateGamePerformance(g, 'w'),
    black = estimateGamePerformance(g, 'b');
  assert.equal(white.baseline, 1697);
  assert.equal(black.baseline, 1714);
  assert.equal(white.sample, 19);
  assert.equal(black.sample, 16);
  assert.ok(black.value >= 2100 && black.value > white.value + 200);
  assert.equal(black.provisional, true);
  assert.equal(black.calibrated, false);
  assert.ok(black.low < black.value && black.high > black.value);
  // A shallow preset changes the uncertainty, not the rating just because more
  // complex positions were silently removed from the sample.
  g.analysis.positions.forEach((p) => {
    if (!p.terminal) p.depth = 18;
  });
  const deeper = estimateGamePerformance(g, 'b');
  assert.equal(deeper.value, black.value);
  assert.equal(deeper.provisional, false);
  assert.ok(deeper.high - deeper.low < black.high - black.low);
});
test('missing or untrustworthy evidence cannot inflate a rating, and repetitions do not add evidence', async () => {
  const g = await fixture();
  const prior = estimateGamePerformance(g, 'b').value;
  g.analysis.moves = g.moves.map(() => ({ accuracy: 100, kind: 'brilliant' }));
  assert.equal(estimateGamePerformance(g, 'b').value, prior);
  delete g.analysis.positions[10];
  assert.equal(estimateGamePerformance(g, 'b').value, null);
  const repeated = await fixture();
  repeated.moves.forEach((m) => {
    m.fenBefore = repeated.initialFen;
  });
  assert.equal(estimateGamePerformance(repeated, 'b').value, null);
});
test('two real engine budgets retain an estimate for both sides without depth-filter jumps', async () => {
  const data = JSON.parse(
    await readFile(new URL('./fixtures/performance-rapid.json', import.meta.url)),
  );
  const game = await fixture();
  const fast = ['w', 'b'].map((c) => estimateGamePerformance(game, c));
  game.analysis.positions = data.balanced.positions;
  for (const [i, color] of ['w', 'b'].entries()) {
    const deeper = estimateGamePerformance(game, color);
    assert.ok(deeper.value && fast[i].value);
    assert.ok(Math.abs(deeper.value - fast[i].value) <= 150);
    assert.equal(deeper.sample, fast[i].sample);
  }
});
