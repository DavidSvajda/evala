import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  classifyMove,
  sacrificeCandidates,
  verifiedBrilliant,
  brilliantEligible,
  SACRIFICE_VERSION,
  specialReviewBudget,
  currentReview,
  REVIEW_VERSION,
} from '../src/study/review.js';
import { REPORT_PROFILES } from '../server/public-reviews.mjs';
const cp = (value, depth = 18, pv = []) => ({ kind: 'cp', value, depth, pv });
function move(fen, uci) {
  const b = new Chess(fen),
    m = b.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  return { ...m, uci, fenBefore: fen, fenAfter: b.fen() };
}
const scores = (m, value = 0, alternative = -200) => [
  { ...cp(value), lines: [cp(value, 18, [m.uci]), cp(alternative, 18, ['a1a2'])] },
  cp(value),
];

test('finds a rook-for-bishop exchange and a quiet offer of a different piece', () => {
  const exchange = move('3rk3/8/8/8/3b4/8/3R4/4K3 w - - 0 1', 'd2d4');
  assert.ok(
    sacrificeCandidates(exchange).some((c) => c.capture === 'd8d4' && c.materialLoss === 170),
  );
  const quiet = move('3rk3/8/8/8/3B4/8/3R4/4K3 w - - 0 1', 'd2h2');
  assert.ok(sacrificeCandidates(quiet).some((c) => c.capture === 'd8d4' && c.materialLoss === 330));
});

test('a sound interposition in check can be Brilliant, while losing or unproved offers cannot', () => {
  const m = move('6kr/8/8/8/8/8/6Q1/7K w - - 0 1', 'g2h2');
  assert.ok(new Chess(m.fenBefore).isCheck());
  const [before, after] = scores(m),
    candidates = sacrificeCandidates(m);
  assert.ok(candidates.some((c) => c.capture === 'h8h2'));
  const proof = {
    version: SACRIFICE_VERSION,
    captures: candidates.map((c) => ({ capture: c.capture, score: cp(0) })),
  };
  assert.equal(verifiedBrilliant(m, before, after, proof)?.kind, 'brilliant');
  assert.equal(verifiedBrilliant(m, before, cp(-300), proof), null);
  assert.equal(verifiedBrilliant(m, before, after, { ...proof, captures: [] }), null);
  assert.equal(
    verifiedBrilliant(m, before, after, {
      ...proof,
      captures: proof.captures.map((c) => ({ ...c, score: cp(-300) })),
    }),
    null,
  );
});

test('giving back a large already-winning material advantage is not Brilliant', () => {
  const m = move('6k1/5ppp/8/8/8/8/PPP2PPP/3QRRK1 w - - 0 1', 'd1d8');
  const [before, after] = scores(m, 800, 700);
  assert.equal(brilliantEligible(m, before, after), false);
});

test('Great finds the sole good move and a decisive punishment for either colour', () => {
  for (const color of ['w', 'b']) {
    const sign = color === 'w' ? 1 : -1,
      m = { color, uci: color === 'w' ? 'e2e4' : 'e7e5' };
    let [before, after] = scores(m, 0, -200 * sign);
    assert.equal(classifyMove(m, before, after)?.kind, 'great');
    [before, after] = scores(m, 400 * sign, 160 * sign);
    assert.equal(classifyMove(m, before, after, { previous: cp(0) })?.kind, 'great');
    assert.equal(classifyMove(m, before, after, { previous: cp(0, 8) })?.kind, 'best');
    assert.equal(
      classifyMove(m, { ...before, depth: 8 }, after, { previous: cp(0) })?.kind,
      'best',
    );
  }
});

test('a verified mating move is not rejected solely because terminal scores have depth zero', () => {
  const m = { color: 'w', uci: 'd6e7' },
    before = {
      kind: 'mate',
      value: 1,
      depth: 18,
      lines: [{ kind: 'mate', value: 1, depth: 18, pv: [m.uci] }, cp(0)],
    };
  assert.equal(
    classifyMove(m, before, { kind: 'mate', value: 1, terminal: true, depth: 0 }).kind,
    'great',
  );
});

test('Quick and Balanced both verify sacrifices with bounded CPU reservations', () => {
  assert.equal(REPORT_PROFILES.quick.verifySacrifices, true);
  for (const profile of Object.values(REPORT_PROFILES)) {
    const budget = specialReviewBudget(profile);
    assert.ok(budget > 0 && budget < 70);
  }
});

test('legacy reviews and a Quick-to-Balanced upgrade are not silently reused', () => {
  const game = { analysis: { complete: true, version: REVIEW_VERSION - 1, profile: 'quick' } };
  assert.equal(currentReview(game, 'quick'), false);
  game.analysis.version = REVIEW_VERSION;
  assert.equal(currentReview(game, 'quick'), true);
  assert.equal(currentReview(game, 'balanced'), false);
  game.analysis.profile = 'balanced';
  assert.equal(currentReview(game, 'balanced'), true);
  assert.equal(currentReview(game, 'quick'), true);
});
