import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { StudyEngine } from '../src/study/uci.js';
import { nodeWorker } from '../server/worker.mjs';
import { parsePgn, DEMO_PGN } from '../src/study/game.js';
import {
  reviewGame,
  normalizeReview,
  SACRIFICE_VERSION,
  SPECIAL_DEPTH,
} from '../src/study/review.js';
import { REPORT_PROFILES } from '../server/public-reviews.mjs';
const engine = new StudyEngine(() => nodeWorker());
try {
  for (const [name, pgn, brilliants] of [
    [
      'Immortal',
      await readFile(new URL('./fixtures/immortal.pgn', import.meta.url), 'utf8'),
      ['Qf6+'],
    ],
    ['Opera', DEMO_PGN, ['Rxd7', 'Qb8+']],
  ]) {
    const game = parsePgn(pgn),
      start = Date.now();
    await reviewGame(game, engine, { ...REPORT_PROFILES.quick, engine: 'full', hash: 128 });
    for (const san of brilliants) {
      const i = game.moves.findIndex((m) => m.san === san),
        mark = game.analysis.moves[i];
      assert.equal(mark?.kind, 'brilliant', `${name}: ${san} needs a verified Brilliant`);
      assert.equal(mark.proof.version, SACRIFICE_VERSION);
      assert.ok(mark.proof.captures.length > 0);
      assert.ok(
        mark.proof.captures.every((c) => c.score.depth >= SPECIAL_DEPTH || c.score.terminal),
      );
    }
    assert.ok(
      game.analysis.moves.some((m) => m?.kind === 'great'),
      `${name}: finds a critical Great move`,
    );
    const saved = JSON.parse(JSON.stringify(game));
    normalizeReview(saved);
    assert.deepEqual(
      saved.analysis.moves.map((m) => m?.kind),
      game.analysis.moves.map((m) => m?.kind),
      'verified labels survive save/reload normalization',
    );
    console.log(
      `PASS ${name}: real Full NNUE Quick review, ${brilliants.join(', ')} Brilliant, Great, proof and saved labels (${Math.round((Date.now() - start) / 1000)}s)`,
    );
  }
} finally {
  engine.dispose();
}
