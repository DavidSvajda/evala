import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  cleanStudyKit,
  repertoireLine,
  repertoireCards,
  recordRecall,
  encodeTask,
  decodeTask,
  ENDGAME_LESSONS,
} from '../src/training/study-kit.js';
import { preferences } from '../server/account-preferences.mjs';
import { coachPrinciple, reviewEpisodes } from '../src/study/coach-evidence.js';
import { parsePgn } from '../src/study/game.js';
import { trainedThemeRecurrence } from '../src/training/study-progress.js';

test('repertoire cards deduplicate transpositions and accept saved alternatives', () => {
  const kit = cleanStudyKit({
    lines: [
      { id: 'a', title: 'A', pgn: '1. Nf3 Nf6 2. g3 g6 3. Bg2 *', side: 'w' },
      { id: 'b', title: 'B', pgn: '1. g3 g6 2. Nf3 Nf6 3. d3 *', side: 'w' },
    ],
  });
  const cards = repertoireCards(kit);
  assert.deepEqual(cards.find((c) => c.id.startsWith('rnbqkb1r/pppppp1p/5np1')).moves.sort(), [
    'd2d3',
    'f1g2',
  ]);
  assert.deepEqual(cards[0].moves.sort(), ['g1f3', 'g2g3']);
  assert.throws(() => repertoireLine('1. e4 e5 2. e4 *'));
});

test('recall distinguishes memory from chess quality and keeps a bounded schedule', () => {
  const now = Date.now(),
    first = recordRecall(null, true, now),
    wrong = recordRecall(first, false, now);
  assert.equal(first.due, now + 86400000);
  assert.equal(wrong.level, 0);
  assert.equal(wrong.correct, 1);
  assert.equal(wrong.wrong, 1);
  assert.equal(wrong.due, now + 600000);
  const kit = cleanStudyKit({ lines: [{ id: 'a', pgn: '1. e4 e5 *', side: 'w' }] });
  const card = repertoireCards(kit)[0];
  assert.equal(repertoireCards(kit, now, { [card.id]: first }).length, 0);
});

test('promotion choices survive PGN normalisation, including underpromotion', () => {
  const base = '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/4K3 w - - 0 1"]\n\n';
  for (const piece of ['Q', 'R', 'B', 'N']) {
    const kit = cleanStudyKit({
      lines: [{ id: piece, pgn: base + '1. a8=' + piece + ' *', side: 'w' }],
    });
    assert.equal(repertoireCards(kit)[0].moves[0], 'a7a8' + piece.toLowerCase());
  }
});

test('private SQL preferences validate study data, reject oversized inputs and ignore foreign fields', () => {
  const p = preferences({
    studyKit: {
      lines: [{ id: 'line', title: '<script>x</script>', pgn: '1. d4 d5 *', side: 'w' }],
      tasks: [{ id: 'bad', fen: 'invalid' }],
      admin: true,
    },
    admin: true,
  });
  assert.equal(p.studyKit.lines.length, 1);
  assert.equal(p.studyKit.tasks.length, 0);
  assert.equal(p.studyKit.admin, undefined);
  assert.equal(p.admin, undefined);
  assert.equal(
    cleanStudyKit({ lines: [{ id: 123, pgn: '1. e4 *' }], tasks: [{ id: 'missing-fen' }] }).lines
      .length,
    0,
  );
  assert.equal(cleanStudyKit({ tasks: [{ id: 'missing-fen' }] }).tasks.length, 0);
  assert.throws(
    () => preferences({ studyKit: { junk: 'x'.repeat(46000) } }),
    (e) => e.status === 413,
  );
});

test('exercise links round-trip Czech text and lawful lines without trusting author identity', () => {
  const task = {
    id: 'exercise',
    title: 'Plán věže',
    fen: new Chess().fen(),
    prompt: 'Co bys zahrál?',
    answer: 'Zkouším pěšce.',
    solution: ['e2e4', 'e7e5'],
  };
  assert.deepEqual(decodeTask(encodeTask(task)), cleanStudyKit({ tasks: [task] }).tasks[0]);
  assert.throws(() => decodeTask('!'));
  assert.throws(() => decodeTask('a'.repeat(7001)));
  assert.equal(cleanStudyKit({ tasks: [{ ...task, solution: ['e2e5'] }] }).tasks.length, 0);
});

test('endgame curriculum starts from legal, unfinished standard positions', () => {
  assert.equal(new Set(ENDGAME_LESSONS.map((l) => l.id)).size, 8);
  for (const lesson of ENDGAME_LESSONS) {
    const chess = new Chess(lesson.fen);
    assert.ok(!chess.isGameOver(), lesson.id);
    assert.equal(chess.turn(), 'w');
    assert.ok(chess.moves().length);
    assert.equal(lesson.idea.length, 2);
  }
});

test('coach explanations rely on legal engine evidence and avoid fabricated material claims', () => {
  const fen = new Chess().fen();
  assert.equal(coachPrinciple(fen, { depth: 8, lines: [{ pv: ['e2e4'] }] }), '');
  assert.equal(coachPrinciple(fen, { depth: 18, lines: [{ pv: ['e2e5'] }] }), '');
  const mate = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  assert.match(
    coachPrinciple(mate.moves[3].fenBefore, { depth: 18, lines: [{ pv: ['d8h4'] }] }),
    /ends in checkmate/,
  );
  assert.doesNotMatch(
    coachPrinciple(fen, { depth: 18, lines: [{ pv: ['e2e4', 'e7e5'] }] }),
    /wins|captures|forced mate/,
  );
});

test('guided review groups nearby same-theme decisions and limits highlights without losing all-moment access', () => {
  const game = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d6 *');
  game.analysis = { positions: [], moves: game.moves.map(() => ({ kind: 'mistake', loss: 15 })) };
  assert.ok(reviewEpisodes(game, 'w').length < 4);
  assert.ok(reviewEpisodes(game, 'w')[0].related.length);
  assert.ok(reviewEpisodes(game, 'all', 3).length <= 3);
  assert.ok(reviewEpisodes(game, 'all').every((r) => game.moves[r.index] === r.move));
});

test('weekly goals are bounded and themed recurrence excludes earlier games and other players', () => {
  assert.equal(
    cleanStudyKit({ weeklyGoal: 999, days: ['invalid', '2026-11-05', '2026-11-05'] }).weeklyGoal,
    3,
  );
  assert.deepEqual(cleanStudyKit({ days: ['2026-11-05', '2026-11-05'] }).days, ['2026-11-05']);
  const make = (date, white = 'Player') => {
    const game = parsePgn(
      `[White "${white}"]\n[Black "Other"]\n[Date "${date}"]\n[TimeControl "600"]\n\n1. e4 e5 2. Nf3 Nc6 *`,
    );
    game.analysis = {
      complete: true,
      positions: [],
      moves: game.moves.map(() => ({ loss: 15, depth: 18 })),
    };
    return game;
  };
  const source = make('2026.10.01');
  source.learning = { attempts: [{ ply: 0, at: Date.parse('2026-10-01T12:00:00Z') }] };
  const rows = trainedThemeRecurrence(
    [
      source,
      make('2026.09.30'),
      make('2026.10.01'),
      make('2026.10.02'),
      make('2026.10.03', 'Another'),
    ],
    'Player',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 1);
  assert.equal(rows[0].decisions, 2);
  assert.equal(rows[0].errors, 2);
});
