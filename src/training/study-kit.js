import { Chess } from 'chess.js';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const key = (fen) => fen.split(' ').slice(0, 4).join(' ');
export const STUDY_LIMITS = { lines: 128, tasks: 128, moves: 80, reviews: 4096 };

export function repertoireLine(pgn, side = 'w') {
  if (typeof pgn !== 'string' || pgn.length > 12000) throw Error('Invalid PGN');
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history({ verbose: true });
  if (!moves.length || moves.length > STUDY_LIMITS.moves) throw Error('Use 1–80 half-moves');
  return { pgn: chess.pgn(), side: side === 'b' ? 'b' : 'w', moves };
}

export function cleanStudyKit(input = {}) {
  const validCards = new Set();
  const lines = [],
    tasks = [],
    reviews = {};
  for (const v of (Array.isArray(input?.lines) ? input.lines : []).slice(0, STUDY_LIMITS.lines)) {
    if (
      typeof v?.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(v.id) ||
      lines.some((r) => r.id === v.id)
    )
      continue;
    try {
      const line = repertoireLine(v.pgn, v.side);
      lines.push({
        id: v.id,
        title: text(v.title, 80),
        pgn: line.pgn,
        side: line.side,
        note: text(v.note, 800),
      });
      for (const move of line.moves) if (move.color === line.side) validCards.add(key(move.before));
    } catch {
      /* Invalid or oversized imported lines cannot become training data. */
    }
  }
  for (const v of (Array.isArray(input?.tasks) ? input.tasks : []).slice(0, STUDY_LIMITS.tasks)) {
    if (
      typeof v?.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(v.id) ||
      tasks.some((r) => r.id === v.id) ||
      typeof v.fen !== 'string' ||
      v.fen.length > 120
    )
      continue;
    try {
      const chess = new Chess(v.fen);
      if (chess.isGameOver()) continue;
      const solution = [];
      for (const move of (Array.isArray(v.solution) ? v.solution : []).slice(0, 16)) {
        if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
          throw Error('Invalid exercise line');
        chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        solution.push(move);
      }
      tasks.push({
        id: v.id,
        title: text(v.title, 80),
        fen: new Chess(v.fen).fen(),
        prompt: text(v.prompt, 1200),
        solution,
        answer: text(v.answer, 1200),
        done: v.done === true,
      });
    } catch {
      /* Illegal task positions and variations are rejected, never repaired. */
    }
  }
  for (const [id, r] of Object.entries(input?.reviews || {}).slice(0, STUDY_LIMITS.reviews)) {
    if (!validCards.has(id) || !r || !Number.isFinite(r.due)) continue;
    reviews[id] = {
      due: Math.max(0, Math.min(Date.now() + 366 * 86400000, r.due)),
      level: Math.max(0, Math.min(5, Math.floor(r.level) || 0)),
      correct: Math.max(0, Math.min(10000, Math.floor(r.correct) || 0)),
      wrong: Math.max(0, Math.min(10000, Math.floor(r.wrong) || 0)),
    };
  }
  const days = [
    ...new Set(
      (Array.isArray(input?.days) ? input.days : []).filter(
        (d) =>
          typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)),
      ),
    ),
  ]
    .sort()
    .slice(-30);
  return {
    version: 1,
    lines,
    tasks,
    reviews,
    days,
    weeklyGoal:
      Number.isInteger(input?.weeklyGoal) && input.weeklyGoal >= 1 && input.weeklyGoal <= 7
        ? input.weeklyGoal
        : 3,
  };
}

export function repertoireCards({ lines = [] }, now = Date.now(), reviews = {}) {
  const cards = new Map();
  for (const line of lines) {
    let parsed;
    try {
      parsed = repertoireLine(line.pgn, line.side);
    } catch {
      continue;
    }
    for (const m of parsed.moves) {
      if (m.color !== line.side) continue;
      const id = key(m.before),
        card = cards.get(id) || {
          id,
          fen: m.before,
          moves: [],
          titles: [],
          due: reviews[id]?.due || 0,
        };
      const uci = m.from + m.to + (m.promotion || '');
      if (!card.moves.includes(uci)) card.moves.push(uci);
      if (!card.titles.includes(line.title)) card.titles.push(line.title);
      cards.set(id, card);
    }
  }
  return [...cards.values()].filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

// A transparent graduated recall schedule, not an Elo or engine-quality score.
export function recordRecall(prior, correct, now = Date.now()) {
  const level = correct ? Math.min(5, (prior?.level || 0) + 1) : 0;
  return {
    level,
    due: now + (correct ? [0, 1, 3, 7, 14, 30][level] * 86400000 : 600000),
    correct: (prior?.correct || 0) + Number(correct),
    wrong: (prior?.wrong || 0) + Number(!correct),
  };
}

export function encodeTask(task) {
  const clean = cleanStudyKit({ tasks: [task] }).tasks[0];
  if (!clean) throw Error('Invalid exercise');
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export function decodeTask(value) {
  // The bounded text fields can expand in UTF-8, JSON escaping and base64.
  if (typeof value !== 'string' || value.length > 24000 || !/^[a-zA-Z0-9_-]+$/.test(value))
    throw Error('Invalid exercise link');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const raw = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    ),
  );
  const task = cleanStudyKit({ tasks: [raw] }).tasks[0];
  if (!task) throw Error('Invalid exercise');
  return task;
}

export const ENDGAME_LESSONS = [
  {
    id: 'queen',
    title: ['Mat dámou', 'Queen checkmate'],
    fen: '7k/8/5K2/5Q2/8/8/8/8 w - - 0 1',
    idea: [
      'Omez krále, přibliž vlastního a hlídej pat.',
      'Restrict the king, bring your king closer and watch for stalemate.',
    ],
  },
  {
    id: 'rook',
    title: ['Mat věží', 'Rook checkmate'],
    fen: '7k/8/5K2/8/8/8/8/R7 w - - 0 1',
    idea: [
      'Věží zmenšuj prostor. Král pomáhá vytlačit soupeře k okraji.',
      'Use the rook to reduce space. Your king helps drive the opponent to an edge.',
    ],
  },
  {
    id: 'ladder',
    title: ['Dvě věže', 'Two rooks'],
    fen: '6k1/8/5K2/8/8/8/8/RR6 w - - 0 1',
    idea: [
      'Střídej věže při odřezávání řad. Nedávej věž do dosahu krále.',
      'Alternate the rooks to cut off ranks. Keep them out of the king’s reach.',
    ],
  },
  {
    id: 'opposition',
    title: ['Opozice', 'Opposition'],
    fen: '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1',
    idea: [
      'Rozhoduje postavení králů a kdo musí ustoupit. Než posuneš pěšce, spočítej odpověď.',
      'King placement and who must give way matter. Calculate the reply before pushing the pawn.',
    ],
  },
  {
    id: 'square',
    title: ['Pravidlo čtverce', 'The square rule'],
    fen: '8/8/8/8/2k5/8/4P3/4K3 w - - 0 1',
    idea: [
      'Spočítej závod pěšce a krále. Započítej úvodní dvojkrok.',
      'Calculate the pawn-and-king race, including the initial two-square pawn move.',
    ],
  },
  {
    id: 'rook-pawn',
    title: ['Krajní pěšec a pat', 'Rook pawn and stalemate'],
    fen: '7k/7P/6K1/8/8/8/8/8 w - - 0 1',
    idea: [
      'Krajní pěšec má zvláštní remízové případy. Sleduj legální tahy soupeřova krále.',
      'Rook pawns have special drawing cases. Watch the opposing king’s legal moves.',
    ],
  },
  {
    id: 'seventh',
    title: ['Pěšec na sedmé řadě', 'Pawn on the seventh'],
    fen: '1K6/1P1k4/8/8/8/8/r7/5R2 w - - 0 1',
    idea: [
      'Připrav úkryt před šachy věže, aby král mohl uvolnit pěšci cestu.',
      'Prepare shelter from rook checks so your king can clear the pawn’s path.',
    ],
  },
  {
    id: 'active-rook',
    title: ['Aktivní věž v obraně', 'An active defending rook'],
    fen: '8/8/r3k3/4p3/4K3/8/8/7R w - - 0 1',
    idea: [
      'Hledej aktivitu věže a šachy z dálky. Pasivní obrana často ztěžuje úkol.',
      'Look for rook activity and distant checks. Passive defence often makes the task harder.',
    ],
  },
];
