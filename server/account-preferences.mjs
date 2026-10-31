import { httpError } from './http.mjs';
import { portableStudySettings } from '../src/core/account-preferences.js';
export function preferences(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError(400, 'Neplatné nastavení.');
  const p = {};
  if (input.study && typeof input.study === 'object' && !Array.isArray(input.study))
    p.study = portableStudySettings(input.study);
  if (input.soundVersion === 1) p.soundVersion = 1;
  if (
    input.lastPosition &&
    /^[A-Za-z0-9_-]{1,80}$/.test(input.lastPosition.gameId) &&
    Number.isInteger(input.lastPosition.ply) &&
    input.lastPosition.ply >= 0 &&
    input.lastPosition.ply <= 600 &&
    typeof input.lastPosition.flipped === 'boolean'
  )
    p.lastPosition = {
      gameId: input.lastPosition.gameId,
      ply: input.lastPosition.ply,
      flipped: input.lastPosition.flipped,
    };
  for (const [key, options] of Object.entries({
    boardTheme: ['sage', 'walnut', 'blue', 'slate'],
    pieceStyle: ['classic', 'letters'],
    skill: ['beginner', 'club', 'advanced'],
    difficulty: ['easy', 'normal', 'hard'],
    language: ['cs', 'en'],
    theme: ['light', 'dark'],
  }))
    if (options.includes(input[key])) p[key] = input[key];
  for (const key of [
    'coordinates',
    'legalMoves',
    'sound',
    'autoNext',
    'sidebarCollapsed',
    'onboardingComplete',
  ])
    if (typeof input[key] === 'boolean') p[key] = input[key];
  if (['tactics', 'review', 'balanced'].includes(input.trainingGoal))
    p.trainingGoal = input.trainingGoal;
  if (Number.isInteger(input.reviewBudget) && input.reviewBudget >= 1 && input.reviewBudget <= 50)
    p.reviewBudget = input.reviewBudget;
  if (Number.isFinite(input.reviewPausedUntil))
    p.reviewPausedUntil = Math.max(
      0,
      Math.min(Date.now() + 30 * 86400000, input.reviewPausedUntil),
    );
  if (
    input.lesson &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.lesson.day) &&
    Array.isArray(input.lesson.ids) &&
    input.lesson.ids.length <= 6 &&
    input.lesson.ids.every((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id))
  ) {
    p.lesson = {
      day: input.lesson.day,
      ids: input.lesson.ids,
      done: Array.isArray(input.lesson.done)
        ? input.lesson.done.filter((id) => input.lesson.ids.includes(id)).slice(0, 6)
        : [],
    };
    if (
      ['mate', 'king', 'material', 'opening', 'middlegame', 'endgame'].includes(
        input.lesson.focusKey,
      )
    )
      p.lesson.focusKey = input.lesson.focusKey;
  }
  if (typeof input.chessUsername === 'string' && /^[A-Za-z0-9_-]{0,40}$/.test(input.chessUsername))
    p.chessUsername = input.chessUsername;
  if (['chesscom', 'lichess'].includes(input.chessPlatform)) p.chessPlatform = input.chessPlatform;
  return p;
}
