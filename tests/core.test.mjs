import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parseInfo, whitePercent, scoreText } from '../src/core/evaluation.js';
import {
  validPosition,
  reconstructPosition,
  placementFromPieces,
  terminalScore,
  START_FEN,
} from '../src/core/position.js';
import { sanitizeSettings } from '../src/core/settings.js';
import { EngineController } from '../src/engine/controller.js';

test('UCI centipawns and mates are always converted to White perspective', () => {
  assert.equal(
    parseInfo('info depth 18 score cp 320 nodes 100 nps 50000 time 500', 'b').value,
    -320,
  );
  assert.equal(parseInfo('info depth 10 score mate -3', 'b').value, 3);
  assert.equal(parseInfo('info depth 8 multipv 2 score cp 100', 'w'), null);
  assert.equal(parseInfo('info depth 8 score cp 100 lowerbound').bound, true);
  assert.equal(parseInfo('info string hello'), null);
});

test('bar is symmetric and its values represent pawns, not win probability', () => {
  assert.equal(whitePercent({ kind: 'cp', value: 0 }), 50);
  assert.ok(whitePercent({ kind: 'cp', value: 300 }) > 80);
  assert.ok(
    Math.abs(
      whitePercent({ kind: 'cp', value: 320 }) + whitePercent({ kind: 'cp', value: -320 }) - 100,
    ) < 0.001,
  );
  assert.equal(whitePercent({ kind: 'mate', value: -3 }), 0);
  assert.equal(scoreText({ kind: 'cp', value: -320 }), '−3.2');
  assert.equal(scoreText({ kind: 'mate', value: 3 }), '+M3');
  assert.equal(scoreText({ kind: 'mate', value: -1, terminal: true }), 'Mat');
});

test('reconstruction preserves side, castling and en passant metadata', () => {
  const chess = new Chess();
  const moves = ['e4', 'a6', 'e5', 'd5'];
  moves.forEach((move) => chess.move(move));
  const fen = reconstructPosition(moves, chess.fen().split(' ')[0]);
  assert.equal(fen, chess.fen());
  assert.equal(fen.split(' ')[3], 'd6');
  assert.equal(validPosition(fen), true);
  const castleMoves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O'];
  const castle = new Chess();
  castleMoves.forEach((move) => castle.move(move));
  assert.equal(reconstructPosition(castleMoves, castle.fen().split(' ')[0]), castle.fen());
  assert.equal(castle.fen().split(' ')[2], 'kq');
  assert.equal(reconstructPosition(['e4', 'not-a-move'], '8/8/8/8/8/8/8/8'), null);
});

test('rejects broken positions and duplicate pieces', () => {
  assert.equal(validPosition('8/8/8/8/8/8/8/8 w - - 0 1'), false);
  assert.equal(validPosition('8/8/8/8/8/8/4k3/4K3 w - - 0 1'), false);
  assert.equal(validPosition('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1'), true);
  assert.equal(
    placementFromPieces([
      { square: 'e1', piece: 'K' },
      { square: 'e1', piece: 'k' },
    ]),
    null,
  );
});

test('terminal positions distinguish checkmate, stalemate and normal play', () => {
  assert.equal(terminalScore(START_FEN), null);
  assert.equal(terminalScore('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1').kind, 'cp');
  assert.equal(terminalScore('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1').value, 1);
});

test('settings from storage or messages cannot create unbounded UCI commands', () => {
  assert.equal(sanitizeSettings({ hash: 999999 }).hash, 256);
  assert.equal(sanitizeSettings({ depth: '30\ngo infinite' }).depth, 18);
  assert.equal(sanitizeSettings({ time: Infinity }).time, 1500);
  assert.equal(sanitizeSettings({ enabled: 'false' }).enabled, true);
});

test('UCI waits for stop acknowledgement and drops all stale evaluation output', () => {
  const sent = [],
    events = [];
  const worker = { postMessage: (command) => sent.push(command), terminate: () => {} };
  const engine = new EngineController(
    () => worker,
    (event) => events.push(event),
  );
  engine.analyze({ id: 1, fen: START_FEN });
  engine.onLine('uciok');
  engine.onLine('readyok');
  assert.equal(sent.at(-1), 'go depth 18 movetime 1500');
  const next = new Chess();
  next.move('e4');
  engine.analyze({ id: 2, fen: next.fen() });
  engine.analyze({ id: 3, fen: START_FEN });
  assert.equal(sent.filter((line) => line.startsWith('go ')).length, 1);
  engine.onLine('info depth 10 score cp 123');
  assert.equal(events.filter((event) => event.type === 'evaluation').length, 0);
  engine.onLine('bestmove e2e4');
  assert.equal(sent.filter((line) => line.startsWith('go ')).length, 2);
  engine.onLine('info depth 11 score cp 42');
  assert.equal(events.at(-1).id, 3);
  engine.pause();
  engine.onLine('info depth 12 score cp 55');
  assert.equal(events.filter((event) => event.type === 'evaluation').length, 1);
  engine.onLine('bestmove e2e4');
  assert.equal(engine.active, null);
  engine.dispose();
});
