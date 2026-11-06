import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanStudyKit } from '../src/training/study-kit.js';
import { mergeStudyKits, STUDY_KIT_BYTES, jsonBytes } from '../src/training/study-kit-sync.js';
import {
  mergeAccountPreferences,
  combinePreferencePatches,
  remainingPreferencePatch,
} from '../src/core/account-preferences.js';
import { START_FEN } from '../src/core/position.js';

const task = (id, prompt = id) =>
  cleanStudyKit({ tasks: [{ id, title: id, fen: START_FEN, prompt }] }).tasks[0];
const kit = (...tasks) => cleanStudyKit({ tasks });

test('two devices retain independent additions, edits and explicit deletions', () => {
  const base = kit(task('a'), task('b')),
    pc = kit({ ...task('a'), answer: 'PC answer' }, task('b'), task('pc')),
    phone = kit(task('a'), task('phone'));
  const merged = mergeStudyKits(pc, phone, base);
  assert.deepEqual(
    merged.tasks.map((t) => t.id),
    ['a', 'pc', 'phone'],
  );
  assert.equal(merged.tasks[0].answer, 'PC answer');
  const independent = mergeStudyKits(
    kit({ ...task('a'), answer: 'PC' }),
    kit({ ...task('a'), prompt: 'Phone' }),
    kit(task('a')),
  );
  assert.equal(independent.tasks.length, 1);
  assert.equal(independent.tasks[0].prompt, 'Phone');
  assert.equal(independent.tasks[0].answer, 'PC');
});

test('conflicting content keeps both versions and retrying the same patch makes no extra copies', () => {
  const base = kit(task('a')),
    pc = kit(task('a', 'PC')),
    phone = kit(task('a', 'Phone'));
  let copies = 0;
  const merged = mergeStudyKits(pc, phone, base, () => copies++);
  assert.equal(copies, 1);
  assert.deepEqual(
    merged.tasks.map((t) => t.prompt),
    ['PC', 'Phone'],
  );
  assert.deepEqual(mergeStudyKits(merged, phone, base), merged);
  assert.deepEqual(mergeStudyKits(pc, kit(), base), pc);
  assert.deepEqual(mergeStudyKits(kit(), phone, base), phone);
  assert.deepEqual(mergeStudyKits(pc, phone), merged);
});

test('offline outbox retains its first base, rebases edits made in flight and strips wire-only metadata', () => {
  const base = kit(task('a')),
    first = kit(task('a'), task('b')),
    second = kit(task('a'), task('b'), task('c'));
  const sent = { studyKitBase: base, studyKit: first, sound: false },
    pending = combinePreferencePatches(sent, {
      studyKitBase: first,
      studyKit: second,
      study: { hash: 128 },
    }),
    acknowledged = mergeAccountPreferences({ studyKit: kit(task('a'), task('remote')) }, sent);
  assert.deepEqual(pending.studyKitBase, base);
  assert.equal(Object.hasOwn(acknowledged, 'studyKitBase'), false);
  const remaining = remainingPreferencePatch(pending, sent, acknowledged);
  assert.deepEqual(remaining.studyKitBase, acknowledged.studyKit);
  assert.deepEqual(
    new Set(remaining.studyKit.tasks.map((t) => t.id)),
    new Set(['a', 'remote', 'b', 'c']),
  );
  assert.deepEqual(remainingPreferencePatch(pending, pending, acknowledged), {});
});

test('merging cannot silently truncate at task or UTF-8 byte limits', () => {
  const full = kit(...Array.from({ length: 128 }, (_, i) => task('t' + i)));
  assert.throws(() => mergeStudyKits(full, kit(task('extra')), kit()), { status: 413 });
  const large = kit(...Array.from({ length: 30 }, (_, i) => task('t' + i, 'a'.repeat(900))));
  assert.ok(jsonBytes(large) > 24000 && jsonBytes(large) <= STUDY_KIT_BYTES);
  assert.deepEqual(mergeStudyKits({}, large, {}), large);
  assert.throws(
    () =>
      mergeStudyKits(
        {},
        kit(...Array.from({ length: 128 }, (_, i) => task('t' + i, '棋'.repeat(1200)))),
        {},
      ),
    { status: 413 },
  );
});
