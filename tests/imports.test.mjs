import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn, parsePgnCollection, parseFenGame } from '../src/study/game.js';
import { readFileSync } from 'node:fs';
const IMMORTAL = readFileSync(new URL('./fixtures/immortal.pgn', import.meta.url), 'utf8');
test('imports the supplied Anderssen title and compact movetext without discarding moves', () => {
  const game = parsePgn(IMMORTAL);
  assert.equal(game.headers.White, 'Adolf Anderssen');
  assert.equal(game.headers.Black, 'Lionel Kieseritzky');
  assert.equal(game.moves.length, 45);
  assert.equal(game.moves.at(-1).san, 'Be7#');
  assert.equal(parsePgn(game.pgn).id, game.id);
  assert.equal(parsePgn('```pgn\n' + IMMORTAL + '\n```').id, game.id);
});
test('rejects illegal moves and arbitrary text; keeps valid games in mixed collections', () => {
  assert.throws(() => parsePgn('Unrecognised garbage\n1. e4 e5'));
  assert.throws(() => parsePgn('1. e4 e5 2. Qa8'));
  const collection = parsePgnCollection(
    '[Event "Good"]\n\n1. e4 e5 *\n\n[Event "Bad"]\n\n1. e4 Qa8 *',
  );
  assert.equal(collection.games.length, 1);
  assert.equal(collection.errors.length, 1);
  assert.equal(
    parsePgnCollection(
      '```pgn\n[White "A"]\n[Black "B"]\n\n1. e4 e5 *\n\n[White "C"]\n[Black "D"]\n\n1. d4 d5 *\n```',
    ).games.length,
    2,
  );
  assert.throws(() => parsePgn('[Event "Empty"]\n\n*'));
});
test('FEN positions survive PGN round trips, including the standard start and Black to move', () => {
  for (const fen of [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
  ]) {
    const game = parseFenGame(fen);
    assert.equal(game.moves.length, 0);
    assert.equal(parsePgn(game.pgn).initialFen, game.initialFen);
  }
  for (const fen of ['bad', '8/8/8/8/8/8/8/8 w - - 0 1', '4k3/8/8/8/8/8/8/4K3 w - -'])
    assert.throws(() => parseFenGame(fen));
});
