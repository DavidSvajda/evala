import test from 'node:test';
import assert from 'node:assert/strict';
import { importUsername } from '../src/study/import.js';

test('username importer honors 10–100 games and asks Lichess for clock data', async () => {
  const original = globalThis.fetch;
  const urls = [];
  try {
    globalThis.fetch = async (url) => {
      urls.push(url);
      return new Response('[Event "Test"]\n\n1. e4 e5 *');
    };
    await importUsername('Friend', 'lichess', { limit: 100 });
    assert.match(urls[0], /max=100&moves=true&clocks=true/);
    globalThis.fetch = async (url) =>
      url.endsWith('/archives')
        ? Response.json({ archives: ['https://api.chess.com/pub/player/friend/games/2026/10'] })
        : Response.json({
            games: Array.from({ length: 120 }, (_, i) => ({
              rules: 'chess',
              pgn: `game-${i}`,
              end_time: 1000 + i,
            })),
          });
    const result = await importUsername('Friend', 'chesscom', { limit: 100 });
    assert.equal(result.split('\n\n').length, 100);
    assert.ok(result.startsWith('game-119'));
    assert.ok(!result.includes('game-19\n'));
    assert.equal(
      (await importUsername('Friend', 'chesscom', { limit: 10 })).split('\n\n').length,
      10,
    );
  } finally {
    globalThis.fetch = original;
  }
});
