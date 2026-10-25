import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Chess } from 'chess.js';
import {
  choosePuzzle,
  startPuzzle,
  playPuzzle,
  recordPuzzle,
  trainingState,
  personalPuzzles,
} from '../src/training/logic.js';
import { parsePgn } from '../src/study/game.js';

const { puzzles } = JSON.parse(await readFile('public/data/puzzles.json', 'utf8'));
test('the shipped CC0 bank contains thousands of legal, complete rated solutions across beginner and expert levels', () => {
  assert.ok(puzzles.length > 4000);
  assert.ok(puzzles.some((p) => p.rating < 600));
  assert.ok(puzzles.some((p) => p.rating > 2800));
  const ids = new Set();
  for (const puzzle of puzzles) {
    assert.ok(!ids.has(puzzle.id));
    ids.add(puzzle.id);
    let state = startPuzzle(puzzle);
    while (!state.complete) state = playPuzzle(puzzle, state, puzzle.moves[state.index]).state;
    assert.ok(state.complete);
    assert.equal(state.failed, false);
  }
});
test('puzzles adapt by rating and theme, avoid recent repeats, and return failed puzzles for scheduled review', () => {
  const state = trainingState();
  for (const rating of [500, 800, 1500, 2300, 2800]) {
    const selected = choosePuzzle(puzzles, { ...state, rating }, { random: () => 0 });
    assert.ok(Math.abs(selected.rating - rating) < 60);
  }
  const selected = choosePuzzle(puzzles, state, { theme: 'fork', random: () => 0 });
  assert.ok(selected.themes.includes('fork'));
  const fresh = choosePuzzle(
    puzzles,
    { ...state, recent: [selected.id] },
    { theme: 'fork', random: () => 0 },
  );
  assert.notEqual(fresh.id, selected.id);
  const now = Date.now(),
    result = recordPuzzle(state, selected, false, { now });
  assert.ok(result.delta < 0);
  assert.equal(choosePuzzle(puzzles, result.state, { mode: 'review', now }), null);
  assert.equal(
    choosePuzzle(puzzles, result.state, { mode: 'review', now: now + 600001 }).id,
    selected.id,
  );
  const solved = recordPuzzle(result.state, selected, true, { now: now + 600001 });
  assert.ok(solved.state.history[selected.id].dueAt > now + 86400000);
});
test('a wrong legal move preserves the original position and hints do not earn a clean solve', () => {
  const puzzle = puzzles.find((p) => new Chess(startPuzzle(p).fen).moves().length > 4),
    state = startPuzzle(puzzle);
  const wrong = new Chess(state.fen)
    .moves({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion || ''))
    .find((m) => m !== puzzle.moves[1]);
  const result = playPuzzle(puzzle, state, wrong);
  assert.equal(result.correct, false);
  assert.equal(result.state.fen, state.fen);
  assert.equal(result.state.failed, true);
  const grade = recordPuzzle(trainingState(), puzzle, true, { hinted: true });
  assert.equal(grade.state.solved, 0);
  assert.ok(grade.delta < 0);
  assert.equal(personalPuzzles([], 'friend').length, 0);
});

test('personal puzzles use only the named player and a clear alternative confirmed at sufficient depth', () => {
  const game = parsePgn('[White "Friend"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4#');
  game.analysis = {
    moves: [null, null, { loss: 40 }, null],
    positions: [
      null,
      null,
      {
        depth: 18,
        lines: [
          { kind: 'cp', value: 0, depth: 18, pv: ['g2g3'] },
          { kind: 'cp', value: -200, depth: 18, pv: ['h2h3'] },
        ],
      },
      null,
      null,
    ],
  };
  const personal = personalPuzzles([game], 'Friend');
  assert.equal(personal.length, 1);
  assert.equal(personal[0].rating, null);
  assert.deepEqual(personal[0].moves, ['g2g3']);
  assert.equal(personalPuzzles([game], 'SomeoneElse').length, 0);
  assert.equal(playPuzzle(personal[0], startPuzzle(personal[0]), 'g2g3').state.complete, true);
  game.analysis.positions[2].lines[1].depth = 8;
  assert.equal(personalPuzzles([game], 'Friend').length, 0);
});
