import test from 'node:test';
import assert from 'node:assert/strict';
import { preferences } from '../server/account-preferences.mjs';
import {
  mergeAccountPreferences,
  remainingPreferencePatch,
} from '../src/core/account-preferences.js';

test('portable settings retain chess preferences without syncing credentials or device endpoints', () => {
  const result = preferences({
    sound: true,
    soundVersion: 1,
    study: {
      depth: 22,
      multipv: 2,
      hash: 128,
      profile: 'deep',
      backend: 'server',
      serverUrl: 'https://private.example',
      token: 'private',
    },
    lastPosition: { gameId: 'a1b2c3d4', ply: 22, flipped: true },
  });
  assert.deepEqual(result.study, { profile: 'deep', depth: 22, hash: 128, multipv: 2 });
  assert.deepEqual(result.lastPosition, { gameId: 'a1b2c3d4', ply: 22, flipped: true });
  assert.equal(result.soundVersion, 1);
  assert.deepEqual(
    preferences({
      study: { depth: -1, time: Infinity, multipv: 999, reportIds: [42, '../private', 'abc'] },
      lastPosition: { gameId: '../private', ply: 9999 },
    }),
    { study: { reportIds: ['abc'] } },
  );
});
test('patches preserve settings changed by another device and combine completed lesson items', () => {
  const result = mergeAccountPreferences(
    {
      boardTheme: 'blue',
      study: { depth: 22, multipv: 2 },
      lesson: { day: '2026-10-26', ids: ['a', 'b'], done: ['a'] },
    },
    {
      sound: false,
      study: { hash: 128 },
      lesson: { day: '2026-10-26', ids: ['a', 'b'], done: ['b'] },
    },
  );
  assert.equal(result.boardTheme, 'blue');
  assert.deepEqual(result.study, { depth: 22, multipv: 2, hash: 128 });
  assert.deepEqual(result.lesson.done, ['a', 'b']);
});
test('acknowledgements do not discard changes made while saving', () => {
  const pending = { sound: false, study: { depth: 24, multipv: 2 } },
    sent = { sound: false, study: { depth: 20 } };
  assert.deepEqual(remainingPreferencePatch(pending, sent), { study: { depth: 24, multipv: 2 } });
  assert.deepEqual(remainingPreferencePatch(pending, pending), {});
});
