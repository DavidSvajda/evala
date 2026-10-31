import { Chess } from 'chess.js';
const value = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
export function chooseHumanMove(chess, prediction, analysis, style) {
  const legal = new Map(
    chess.moves({ verbose: true }).map((m) => [m.from + m.to + (m.promotion || ''), m]),
  );
  if (!legal.has(prediction.move)) throw new Error('Maia returned an illegal move.');
  if (style !== 'attacking')
    return { move: prediction.move, styleApplied: false, sacrifice: false };
  const lines = analysis?.lines || [],
    sign = chess.turn() === 'w' ? 1 : -1;
  if (lines[0]?.kind !== 'cp' || lines[0]?.depth < 12)
    return { move: prediction.move, styleApplied: false, sacrifice: false };
  const best = lines[0].value * sign,
    ranked = [];
  for (const candidate of prediction.candidates || []) {
    const move = legal.get(candidate.move),
      line = lines.find((l) => l?.pv?.[0] === candidate.move);
    if (
      !move ||
      !line ||
      line.kind !== 'cp' ||
      line.depth < 12 ||
      !Number.isFinite(line.value) ||
      best - line.value * sign > 80
    )
      continue;
    const board = new Chess(chess.fen());
    board.move(move);
    const offered = board
      .moves({ verbose: true })
      .some(
        (m) =>
          m.to === move.to && m.captured && value[m.captured] - value[move.captured || 'k'] >= 200,
      );
    const check = board.isCheck(),
      activity = (offered ? 4 : 0) + (check ? 2 : 0) + (move.captured ? 0.5 : 0);
    ranked.push({
      move: candidate.move,
      sacrifice: offered,
      activity,
      score: activity + Math.max(0, Math.min(1, candidate.probability || 0)),
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]
    ? { move: ranked[0].move, sacrifice: ranked[0].sacrifice, styleApplied: ranked[0].activity > 0 }
    : { move: prediction.move, styleApplied: false, sacrifice: false };
}
