import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../src/study/game.js';
import { trainingJourney, localDay } from '../src/training/journey.js';
import { createLesson } from '../src/training/lesson.js';
import { trainingState, personalPuzzles } from '../src/training/logic.js';
import { preferences } from '../server/account-preferences.mjs';
function game(id) {
  const g = parsePgn('[White "Player"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  g.id = id;
  const cp = (value) => ({
    kind: 'cp',
    value,
    depth: 18,
    lines: [
      { kind: 'cp', value, depth: 18, pv: ['e2e4'] },
      { kind: 'cp', value: value - 150, depth: 18, pv: ['d2d4'] },
    ],
  });
  g.analysis = {
    complete: true,
    positions: [
      cp(0),
      cp(-100),
      cp(0),
      {
        kind: 'mate',
        value: -1,
        depth: 18,
        lines: [{ kind: 'mate', value: -1, depth: 18, pv: ['d8h4'] }],
      },
      { kind: 'mate', value: -1, terminal: true, lines: [] },
    ],
    moves: [{ loss: 15 }, { loss: 0 }, { loss: 30 }, { loss: 0 }],
  };
  return g;
}
test('priorities require own, complete and sufficiently analysed decisions; repetitions need multiple games', () => {
  const one = game('a'),
    incomplete = game('b'),
    shallow = game('c');
  incomplete.analysis.complete = false;
  shallow.analysis.positions.forEach((p) => {
    p.depth = 4;
  });
  assert.equal(trainingJourney([one], 'Someone else').decisions, 0);
  const report = trainingJourney([one, incomplete, shallow], 'player');
  assert.equal(report.decisions, 2);
  assert.ok(report.priorities.every((p) => !p.recurring));
  const repeated = trainingJourney([one, game('d'), game('e')], 'Player');
  assert.ok(repeated.priorities.find((p) => p.key === 'king').recurring);
});
test('focused lessons include due personal review, related positions and never duplicate board positions', () => {
  const games = [game('a'), game('b'), game('c')];
  const own = personalPuzzles(games, 'Player');
  const bank = games[0].moves.map((m, i) => ({
    id: 'bank-' + i,
    fen: m.fenBefore,
    moves: [m.uci],
    rating: 1000,
    themes: ['defensiveMove'],
  }));
  const state = trainingState({ history: { [own[0].id]: { dueAt: 1, attempts: 1 } } });
  const plan = createLesson(bank, games, 'Player', state, { focusKey: 'king' });
  assert.equal(plan.focusKey, 'king');
  assert.ok(plan.ids.includes(own[0].id));
  assert.ok(plan.ids.some((id) => id === 'own-a-2'));
  const pool = [...own, ...bank];
  const fens = plan.ids.map((id) =>
    pool
      .find((p) => p.id === id)
      .fen.split(' ')
      .slice(0, 4)
      .join(' '),
  );
  assert.equal(new Set(fens).size, fens.length);
  assert.ok(plan.ids.length <= 6);
  assert.equal(preferences({ lesson: plan }).lesson.focusKey, 'king');
});
test('daily lesson keys use the local calendar date', () => {
  assert.equal(localDay(new Date(2026, 9, 31, 0, 1)), '2026-10-31');
});
