import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../src/study/game.js';
import { cleanLearning, practiceFollowThrough } from '../src/training/practice.js';
const fixture = () =>
  parsePgn('[White "Player"]\n[Black "Other"]\n[TimeControl "600+0"]\n\n1. e4 e5 2. Nf3 Nc6 *');
test('saved variations are legal, bounded and preserve only known reflection choices', () => {
  const game = fixture();
  const data = cleanLearning(
    {
      notes: { 0: { cause: 'time' }, 1: { cause: '<script>' } },
      variations: [
        { ply: 0, moves: ['d2d4', 'd7d5', 'd2d4'] },
        { ply: 1, moves: ['e2e4'] },
        { ply: -1, moves: ['e2e4'] },
        { ply: 999, moves: ['e2e4'] },
      ],
    },
    game.moves,
  );
  assert.equal(data.notes[0].cause, 'time');
  assert.equal(data.notes[1].cause, '');
  assert.deepEqual(data.variations, [{ ply: 0, moves: ['d2d4', 'd7d5'] }]);
  assert.deepEqual(cleanLearning(data, game.moves), data);
});
test('follow-through requires later dated games, own side, same speed and deep evidence', () => {
  const source = fixture();
  source.id = 'source';
  source.learning = { attempts: [{ ply: 0, at: Date.parse('2026-10-20T12:00:00Z') }] };
  const later = fixture();
  later.id = 'later';
  later.headers.Date = '2026.10.21';
  later.analysis = { complete: true, moves: [{ loss: 12, depth: 18 }] };
  let rows = practiceFollowThrough([source, later], 'Player');
  assert.equal(rows[0].errors, 1);
  assert.equal(rows[0].examples.length, 1);
  later.headers.Date = '2026.10.20';
  assert.equal(practiceFollowThrough([source, later], 'Player')[0].examples.length, 0);
  later.headers.Date = '2026.10.21';
  later.headers.TimeControl = '60+0';
  assert.equal(practiceFollowThrough([source, later], 'Player')[0].examples.length, 0);
  later.headers.TimeControl = '600+0';
  later.analysis.moves[0].depth = 5;
  assert.equal(practiceFollowThrough([source, later], 'Player')[0].examples.length, 0);
  assert.deepEqual(practiceFollowThrough([source, later], 'Someone else'), []);
});
