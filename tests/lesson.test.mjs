import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLesson,
  nextLessonId,
  chesscomUsername,
  publicChesscomProfile,
} from '../src/training/lesson.js';
import { trainingState } from '../src/training/logic.js';
const bank = JSON.parse(await readFile('public/data/puzzles.json', 'utf8')).puzzles;
test('lesson has six distinct legal bank IDs, progresses and completes', () => {
  const plan = createLesson(bank, [], '', trainingState());
  assert.equal(new Set(plan.ids).size, 6);
  assert.ok(bank.some((p) => p.id === nextLessonId(plan)));
  plan.done = [...plan.ids];
  assert.equal(nextLessonId(plan), null);
});
test('Chess.com links are normalized without accepting other hosts or credentials', async () => {
  assert.equal(chesscomUsername('https://www.chess.com/member/Schweits'), 'schweits');
  for (const value of [
    'https://evil.test/member/name',
    'https://evil@chess.com/member/name',
    'https://chess.com/play/name',
  ])
    assert.throws(() => chesscomUsername(value));
  assert.equal(
    (
      await publicChesscomProfile('Schweits', {
        fetcher: async () => ({ ok: true, json: async () => ({ username: 'Schweits' }) }),
      })
    ).username,
    'schweits',
  );
});
