import { randomUUID } from 'node:crypto';
import { parseServerPgn } from './pgn-parser.mjs';
import { classifyMove, normalizeReview } from '../src/study/review.js';
import { cleanLearning } from '../src/training/practice.js';
import { checkedResult } from '../src/core/engine-result.js';
import { json, readJsonBody, httpError } from './http.mjs';
const fail = (message, status = 400) => httpError(status, message);
const body = (req, limit = 2_500_000) => readJsonBody(req, { limit });
export async function handleLibrary(req, res, url, { store, s, account, mutateAccount }) {
  if (url.pathname === '/api/account/library' && req.method === 'GET') {
    json(res, 200, { games: Object.values(account.games) });
    return true;
  }
  const gamePath = url.pathname.match(/^\/api\/account\/library\/([a-zA-Z0-9_-]{1,80})$/);
  if (gamePath) {
    const id = gamePath[1],
      key = `game:${s.userId}:${id}`;
    if (req.method === 'GET') {
      const game = account.games[id]
        ? (await store.get(key + ':' + account.games[id].version)).value
        : null;
      if (!account.games[id] || !game) throw fail('Partie nebyla nalezena.', 404);
      json(res, 200, {
        game: { ...normalizeReview(game), _remoteVersion: account.games[id].version },
      });
      return true;
    }
    if (req.method === 'DELETE') {
      let version;
      await mutateAccount((a) => {
        version = a.games[id]?.version;
        delete a.games[id];
        return a;
      });
      if (version) await store.remove(key + ':' + version);
      json(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'PUT') {
      const input = await body(req);
      const game = await parseServerPgn(input.pgn);
      if (game.id !== id) throw fail('Partie neodpovídá svému identifikátoru.');
      game.createdAt = Math.max(0, Math.min(Date.now(), Number(input.createdAt) || Date.now()));
      game.notes = typeof input.notes === 'string' ? input.notes.slice(0, 4000) : '';
      game.learning = cleanLearning(input.learning || game.learning, game.moves);
      if (input.analysis) {
        const a = input.analysis;
        if (!Array.isArray(a.positions) || a.positions.length > game.fens.length)
          throw fail('Neplatný rozbor.');
        let positions;
        try {
          positions = a.positions.map((p) => (p ? checkedResult(p) : null));
        } catch {
          throw fail('Neplatné hodnocení pozice.');
        }
        game.analysis = {
          key: String(a.key || '').slice(0, 1000),
          version: Number(a.version) || 3,
          engine: a.engine === 'lite' ? 'lite' : 'full',
          positions,
          complete: positions.length === game.fens.length && positions.every(Boolean),
          moves: game.moves.map((m, i) =>
            classifyMove(m, positions[i], positions[i + 1], { previous: positions[i - 1] }),
          ),
          finishedAt: Math.min(Date.now(), Number(a.finishedAt) || Date.now()),
        };
        // Recheck the certificate; never trust a client-supplied badge.
        for (let i = 0; i < game.analysis.moves.length; i++) {
          const source = a.moves?.[i],
            mark = game.analysis.moves[i];
          if (
            mark &&
            source?.proof?.version === 2 &&
            Array.isArray(source.proof.captures) &&
            source.proof.captures.length <= 3
          ) {
            try {
              mark.proof = {
                version: 2,
                captures: source.proof.captures.map((p) => ({
                  capture: String(p.capture).slice(0, 5),
                  score: checkedResult(p.score),
                })),
              };
            } catch {
              /* Invalid proof falls back to ordinary quality. */
            }
          }
        }
        normalizeReview(game);
      }
      const bytes = Buffer.byteLength(JSON.stringify(game)),
        version = randomUUID();
      let previousVersion;
      try {
        await mutateAccount(async (a) => {
          const previous = a.games[id];
          previousVersion = previous?.version;
          if (previous && input._remoteVersion !== previous.version)
            throw fail('Partie se změnila na jiném zařízení. Obnov knihovnu.', 409);
          if (!previous && Object.keys(a.games).length >= 200)
            throw fail('Účet má limit 200 partií.', 413);
          const used =
            Object.values(a.games).reduce((n, g) => n + (g.bytes || 0), 0) -
            (previous?.bytes || 0) +
            bytes;
          if (used > 50_000_000)
            throw fail('Úložiště účtu je plné. Exportuj a smaž starší partie.', 413);
          // An immutable revision keeps the old index valid if writing the index fails.
          await store.put(key + ':' + version, game);
          a.games[id] = {
            id,
            version,
            bytes,
            updatedAt: Date.now(),
            white: game.headers.White,
            black: game.headers.Black,
            result: game.headers.Result,
            analyzed: !!game.analysis?.complete,
          };
          return a;
        });
      } catch (error) {
        // A competing logout/deletion can revoke the index CAS after the immutable
        // revision was written. Remove only a revision proven not to be indexed;
        // an ambiguous storage outage must never delete a successfully saved game.
        try {
          const current = (await store.get('account:' + s.userId)).value;
          if (current?.games?.[id]?.version !== version) await store.remove(key + ':' + version);
        } catch {
          console.error('Uncommitted game revision cleanup deferred.');
        }
        throw error;
      }
      if (previousVersion) await store.remove(key + ':' + previousVersion);
      // Reads use the indexed immutable revision, never an uncommitted write.
      json(res, 200, { version });
      return true;
    }
    throw fail('Nepodporovaná metoda.', 405);
  }

  return false;
}
