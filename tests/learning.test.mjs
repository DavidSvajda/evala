import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parsePgn, DEMO_PGN, annotatedPgn } from '../src/study/game.js';
import {
  sacrificeCandidates,
  verifiedBrilliant,
  normalizeReview,
  REVIEW_VERSION,
} from '../src/study/review.js';
import {
  cleanLearning,
  practicePositions,
  openingRepertoire,
  weaknessEvidence,
} from '../src/training/practice.js';
import { choosePuzzle, recordPuzzle, trainingState } from '../src/training/logic.js';
const moved = (fen, uci) => {
  const c = new Chess(fen),
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  return { ...m, fenBefore: fen, fenAfter: c.fen(), uci };
};
const cp = (value, depth = 18, pv = []) => ({
  kind: 'cp',
  value,
  depth,
  lines: [{ kind: 'cp', value, depth, pv }],
});

test('brilliant excludes unrelated hanging pieces, winning queen captures and equal exchanges', () => {
  assert.deepEqual(sacrificeCandidates(moved('4k3/8/8/1p6/2B5/8/7R/4K3 w - - 0 1', 'h2h3')), []);
  assert.deepEqual(sacrificeCandidates(moved('3rk3/8/8/8/3q4/8/3R4/4K3 w - - 0 1', 'd2d4')), []);
  assert.deepEqual(sacrificeCandidates(moved('3rk3/8/8/8/8/8/3R4/3QK3 w - - 0 1', 'd2d4')), []);
});
test('brilliant needs current, deep, complete acceptance proof; losing or shallow sacrifices fail', () => {
  const m = parsePgn(DEMO_PGN).moves[30],
    before = {
      kind: 'mate',
      value: 2,
      depth: 20,
      lines: [
        { kind: 'mate', value: 2, depth: 20, pv: [m.uci] },
        { kind: 'cp', value: 0, depth: 20, pv: ['b3a3'] },
      ],
    },
    after = { kind: 'mate', value: 1, depth: 20 };
  const proof = {
    version: 2,
    captures: [{ capture: 'd7b8', score: { kind: 'mate', value: 1, depth: 20 } }],
  };
  assert.equal(verifiedBrilliant(m, before, after, proof).kind, 'brilliant');
  for (const p of [
    { ...proof, version: 1 },
    { ...proof, captures: [] },
    { ...proof, captures: [{ capture: 'd7b8', score: cp(-200) }] },
    { ...proof, captures: [{ capture: 'd7b8', score: cp(20, 13) }] },
  ])
    assert.equal(verifiedBrilliant(m, before, after, p), null);
  assert.equal(verifiedBrilliant(m, { ...before, depth: 13 }, after, proof), null);
  assert.equal(
    verifiedBrilliant(
      m,
      { ...before, lines: [before.lines[0], { kind: 'cp', value: 600, depth: 20 }] },
      after,
      proof,
    ),
    null,
  );
});
test('legacy brilliant badges are removed on migration without losing completed analysis', () => {
  const g = parsePgn('1. e4 e5 *');
  g.analysis = {
    complete: true,
    positions: [cp(0, 18, ['e2e4']), cp(0, 18, ['e7e5']), cp(0)],
    moves: [{ kind: 'brilliant', proof: { score: cp(0) } }],
  };
  normalizeReview(g);
  assert.equal(g.analysis.moves[0].kind, 'best');
  assert.equal(g.analysis.complete, true);
  assert.equal(g.analysis.classificationVersion, REVIEW_VERSION);
  assert.deepEqual(g.analysis.specials, []);
});
test('selected notes round-trip privately through PGN, excluding unselected notes and engine', () => {
  const g = parsePgn(DEMO_PGN);
  g.learning = {
    notes: {
      0: { plan: 'Develop first' },
      1: { text: 'Candidate d4', critical: true },
      2: { text: 'PRIVATE' },
    },
  };
  const pgn = annotatedPgn(g, { engine: false, plies: [0, 1] });
  assert.ok(!pgn.includes('PRIVATE'));
  assert.ok(!pgn.includes('[%eval'));
  const parsed = parsePgn(pgn);
  assert.equal(parsed.id, g.id);
  assert.equal(parsed.learning.notes[1].text, 'Candidate d4');
  assert.equal(parsed.learning.notes[1].critical, true);
  assert.equal(parsed.learning.notes[0].plan, 'Develop first');
  assert.equal(
    parsePgn('1. e4 {Coach: consider d4} e5 *').learning.notes[1].text,
    'Coach: consider d4',
  );
});
test('review pause and daily quota preserve the queue and leave normal tactics available', () => {
  const now = Date.UTC(2026, 9, 25),
    bank = [{ id: 'a', rating: 800, themes: ['fork'] }],
    state = trainingState({ history: { a: { dueAt: now - 1000 } } });
  assert.equal(
    choosePuzzle(bank, state, { mode: 'review', now, reviewPausedUntil: now + 1000 }),
    null,
  );
  const graded = recordPuzzle(state, bank[0], false, { mode: 'review', now }).state;
  assert.equal(
    choosePuzzle(bank, graded, { mode: 'review', reviewBudget: 1, now: now + 700000 }),
    null,
  );
  assert.equal(
    choosePuzzle(bank, graded, { mode: 'review', reviewBudget: 1, now: now + 86400000 }).id,
    'a',
  );
  assert.equal(
    choosePuzzle(bank, graded, { mode: 'rated', reviewPausedUntil: now + 1000, now }).id,
    'a',
  );
  assert.equal(graded.rating, state.rating);
});
test('practice pool, repertoire and evidence use the linked player and require actual engine depth', () => {
  const g = parsePgn(
    '[White "Me"]\n[Black "You"]\n[TimeControl "600"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 *',
  );
  g.analysis = {
    complete: true,
    positions: g.fens.map((f, i) => ({
      ...cp(20, 18, [g.moves[i]?.uci || 'e2e4']),
      lines: [
        { ...cp(20), pv: [g.moves[i]?.uci || 'e2e4'] },
        { ...cp(10), pv: [] },
      ],
    })),
    moves: g.moves.map(() => ({ loss: 0, accuracy: 100 })),
  };
  assert.ok(practicePositions([g], 'Me', 'mixed').length > 0);
  assert.equal(practicePositions([g], 'Other').length, 0);
  assert.equal(practicePositions([g], 'Me', 'conversion').length, 0);
  assert.ok(openingRepertoire([g, g], 'Me')[0].count === 2);
  assert.equal(weaknessEvidence([g], 'Me')[0].speed, 'rapid');
  g.analysis.positions.forEach((s) => (s.depth = 8));
  assert.equal(practicePositions([g], 'Me').length, 0);
  assert.equal(
    Object.keys(
      cleanLearning(
        {
          notes: { 999: { text: 'bad' }, 1: { text: 'ok' } },
          attempts: [{ mode: 'rated', ply: 1, at: 0, loss: 0 }],
        },
        g.moves,
      ).notes,
    ).length,
    1,
  );
});
