import test from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN } from '../src/core/position.js';
import { annotatedPgn, parsePgn } from '../src/study/game.js';
import { exportPgnTree, parsePgnTree, treePath } from '../src/core/pgn-tree.js';
import {
  localOpeningRows,
  opponentReport,
  tablebasePosition,
  tablebaseResult,
} from '../src/core/preparation.js';
import { repertoirePgnLines } from '../src/training/pgn-repertoire.js';

const pgn = `[White "Rival"]\n[Black "Other"]\n[TimeControl "600"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5 $5 {Sicilian} 2. Nf3 (2. c3 {Alapin}) d6) 2. Nf3 Nc6 1-0`;

test('nested variations, NAGs and comments survive game import and annotated export', () => {
  const game = parsePgn(pgn);
  const tree = parsePgnTree(annotatedPgn(game));
  const alternative = tree.nodes.find((n) => n.san === 'c5');
  assert.deepEqual(alternative.nags, [5]);
  assert.deepEqual(alternative.comments, ['Sicilian']);
  assert.deepEqual(treePath(tree, tree.nodes.find((n) => n.san === 'c3').id), [
    'e2e4',
    'c7c5',
    'c2c3',
  ]);
  assert.equal(parsePgn(exportPgnTree(tree)).id, game.id);
  assert.equal(repertoirePgnLines(game.pgn).length, 3);
  assert.equal(repertoirePgnLines(game.pgn, 1).length, 1);
  assert.throws(() => parsePgn(pgn.replace('2. c3', '2. Qh8')));
});

test('opening and opponent reports use completed samples and the correct side', () => {
  const game = parsePgn(pgn);
  assert.deepEqual(
    localOpeningRows(START_FEN, [game]).map(({ uci, white, total }) => [uci, white, total]),
    [['e2e4', 1, 1]],
  );
  assert.equal(
    opponentReport([game, game], 'rival', { side: 'w', speed: 'rapid' }).rows[0].wins,
    1,
  );
  assert.equal(opponentReport([game], 'rival', { side: 'b' }).total, 0);
  assert.equal(opponentReport([game], 'other', { side: 'b' }).rows[0].losses, 1);
});

test('tablebase outcomes use the player to move and omit impossible moves', () => {
  const fen = '8/8/8/8/8/2K5/4Q3/7k w - - 0 1';
  assert.equal(tablebasePosition(START_FEN), false);
  assert.equal(tablebasePosition(fen), true);
  const result = tablebaseResult(fen, {
    category: 'win',
    dtz: 7,
    moves: [
      { uci: 'e2e3', category: 'loss' },
      { uci: 'e2d1', category: 'blessed-loss' },
      { uci: 'e2a1', category: 'win' },
    ],
  });
  assert.deepEqual(
    result.moves.map((m) => m.category),
    ['win', 'cursed-win'],
  );
  assert.equal(result.dtz, 7);
});
