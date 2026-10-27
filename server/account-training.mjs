import { randomUUID } from 'node:crypto';
import {
  choosePuzzle,
  startPuzzle,
  playPuzzle,
  recordPuzzle,
  trainingState,
  personalPuzzles,
} from '../src/training/logic.js';
import { json, readJsonBody, httpError } from './http.mjs';
const fail = (message, status = 400) => httpError(status, message);
const body = (req, limit = 2000) => readJsonBody(req, { limit });
export async function handleTraining(req, res, url, { store, s, account, mutateAccount, puzzles }) {
  if (url.pathname === '/api/account/training' && req.method === 'GET') {
    json(res, 200, { training: account.training });
    return true;
  }
  if (url.pathname === '/api/account/puzzle/next' && req.method === 'POST') {
    const input = await body(req, 2000),
      all = await puzzles();
    let response;
    const mode = ['rated', 'review', 'daily', 'personal', 'lesson'].includes(input.mode)
      ? input.mode
      : 'rated';
    let personal = [];
    if (mode === 'personal') {
      const username = account.preferences.chessUsername || '',
        name = username.toLowerCase(),
        games = [];
      for (const item of Object.values(account.games)
        .filter((g) => g.analyzed && [g.white, g.black].some((n) => n?.toLowerCase() === name))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 30)) {
        const game = (await store.get(`game:${s.userId}:${item.id}:${item.version}`)).value;
        if (game) games.push(game);
      }
      personal = personalPuzzles(games, username);
    }
    await mutateAccount((a) => {
      const puzzle =
        mode === 'personal'
          ? input.puzzleId
            ? personal.find((p) => p.id === input.puzzleId)
            : personal.find((p) => a.training.history[p.id]?.dueAt <= Date.now()) ||
              personal.find((p) => !a.training.recent.includes(p.id)) ||
              personal[0]
          : mode === 'lesson'
            ? all.find((p) => p.id === input.puzzleId)
            : choosePuzzle(all, trainingState(a.training), {
                mode,
                theme: String(input.theme || 'all'),
                difficulty: input.difficulty,
                reviewBudget: a.preferences.reviewBudget || 10,
                reviewPausedUntil: a.preferences.reviewPausedUntil || 0,
              });
      if (!puzzle) {
        response = { puzzle: null, training: a.training };
        return a;
      }
      const state = startPuzzle(puzzle),
        challengeId = randomUUID();
      a.activePuzzle = {
        challengeId,
        puzzleId: puzzle.id,
        state,
        mode,
        personalPuzzle: puzzle.personal ? puzzle : null,
        expires: Date.now() + 3600000,
      };
      response = {
        puzzle: {
          id: puzzle.id,
          rating: puzzle.rating,
          personal: !!puzzle.personal,
          opponent: puzzle.opponent,
          challengeId,
          state,
        },
        training: a.training,
      };
      return a;
    });
    json(res, 200, response);
    return true;
  }
  if (
    /^\/api\/account\/puzzle\/(move|hint|solution)$/.test(url.pathname) &&
    req.method === 'POST'
  ) {
    const input = await body(req, 2000),
      all = await puzzles();
    let response;
    await mutateAccount((a) => {
      const active = a.activePuzzle;
      if (!active || active.challengeId !== input.challengeId || active.expires < Date.now())
        throw fail('Úloha vypršela. Načti další.', 409);
      const puzzle = active.personalPuzzle || all.find((p) => p.id === active.puzzleId);
      if (!puzzle) throw fail('Úloha není dostupná.', 404);
      let result,
        delta = 0;
      if (url.pathname.endsWith('/move')) {
        try {
          result = playPuzzle(puzzle, active.state, input.move);
        } catch {
          throw fail('Tah není platný nebo je úloha již dokončená.');
        }
      } else {
        if (active.state.complete) throw fail('Úloha je již dokončená.', 409);
        active.state.hinted = true;
        if (url.pathname.endsWith('/hint'))
          result = {
            state: active.state,
            hint: puzzle.moves[active.state.index].slice(0, 2),
            message: 'Zkus zahrát označenou figurou.',
          };
        else
          result = {
            state: { ...active.state, complete: true, failed: true },
            solution: puzzle.continuation || puzzle.moves.slice(1),
            message: 'Řešení úlohy.',
          };
      }
      active.state = result.state;
      if (
        !active.state.graded &&
        (active.state.complete || active.state.failed || active.state.hinted)
      ) {
        const grade = recordPuzzle(
          a.training,
          puzzle,
          active.state.complete && !active.state.failed,
          { hinted: active.state.hinted, mode: active.mode },
        );
        a.training = grade.state;
        delta = grade.delta;
        active.state.graded = true;
      }
      response = {
        ...result,
        state: active.state,
        delta,
        training: a.training,
        ...(active.state.complete
          ? {
              themes: puzzle.themes,
              source: puzzle.source,
              solution: puzzle.continuation || puzzle.moves.slice(1),
            }
          : {}),
      };
      return a;
    });
    json(res, 200, response);
    return true;
  }

  return false;
}
