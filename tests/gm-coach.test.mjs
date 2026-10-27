import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  detectThreats,
  assessSharpness,
  analyzeImbalances,
  generateGmAdvice,
} from '../src/study/gm-coach.js';

test('threat probe finds legal mate threats, ignores terminal positions and checks', () => {
  const threat = detectThreats(
    'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 4',
  );
  assert.equal(threat.type, 'mate');
  assert.equal(threat.uci, 'h5f7');
  const game = new Chess();
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) game.move(move);
  assert.equal(detectThreats(game.fen()), null);
  assert.equal(detectThreats('broken'), null);
  const check = new Chess('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.equal(detectThreats(check.fen()), null);
});
test('candidate comparison uses actual engine value and depth, without inventing only-move claims', () => {
  const lines = [
    { value: 350, kind: 'cp', depth: 18 },
    { value: 80, kind: 'cp', depth: 18 },
  ];
  assert.equal(assessSharpness(lines).type, 'sharp');
  assert.equal(assessSharpness(lines.map((l) => ({ ...l, depth: 6 }))).type, 'normal');
  assert.equal(
    assessSharpness([
      { value: 120, kind: 'cp', depth: 18 },
      { value: 110, kind: 'cp', depth: 18 },
    ]).type,
    'calm',
  );
  assert.equal(
    assessSharpness([
      { value: 3, kind: 'mate', depth: 18 },
      { value: 4, kind: 'mate', depth: 18 },
    ]).type,
    'normal',
  );
  assert.doesNotMatch(assessSharpness(lines, { lang: 'en' }).detail, /only|ONE|decisive/i);
});
test('positional facts identify the bishop pair and a genuinely passed pawn', () => {
  assert.ok(
    analyzeImbalances('4k3/8/8/3P4/8/8/8/2BBK3 w - - 0 1', { lang: 'en' }).includes(
      'White holds the bishop pair',
    ),
  );
  assert.ok(
    analyzeImbalances('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1', { lang: 'en' }).includes(
      'Dangerous passed pawn on d5',
    ),
  );
  assert.ok(
    !analyzeImbalances('4k3/8/3p4/3P4/8/8/8/4K3 w - - 0 1', { lang: 'en' }).some((v) =>
      v.includes('passed'),
    ),
  );
});
test('move explanations report engine evidence and never infer mate from the word material', () => {
  const move = { san: 'f5', color: 'b' };
  const text = generateGmAdvice(
    move,
    { kind: 'mistake', note: 'Ztráta materiálu.', loss: 12 },
    '',
    '',
    { lang: 'en', bestSan: 'd6' },
  );
  assert.match(text, /d6/);
  assert.match(text, /12 percentage points/);
  assert.doesNotMatch(text, /mate|king shelter|grandmaster/i);
  assert.match(generateGmAdvice(move, { kind: 'best' }, '', '', { lang: 'en' }), /first choice/);
  assert.match(
    generateGmAdvice(move, { kind: 'miss' }, '', '', {
      lang: 'en',
      before: { kind: 'mate', value: -3 },
      after: { kind: 'cp', value: 0 },
    }),
    /forced mate/,
  );
});
