// Public Lichess accuracy model, independently expressed for Evala's White-POV scores.
// Method: https://lichess.org/page/accuracy
// Constants/aggregation: lila AccuracyPercent.scala and scalalib Maths.scala (2026-10-25).
export const ACCURACY_METHOD = 'lichess-weighted-harmonic-v1';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function winPercent(score) {
  if (!score || !['cp', 'mate'].includes(score.kind) || !Number.isFinite(score.value)) return null;
  const cp = score.kind === 'mate' ? Math.sign(score.value) * 1000 : score.value;
  return 100 / (1 + Math.exp(-0.00368208 * clamp(cp, -1000, 1000)));
}

function moveAccuracy(before, after, color) {
  const loss = (before - after) * (color === 'w' ? 1 : -1);
  if (loss <= 0) return 100;
  // The public implementation adds one point for engine uncertainty.
  return clamp(
    103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411 + 1,
    0,
    100,
  );
}

export function gameAccuracy(game) {
  const empty = { w: null, b: null, method: ACCURACY_METHOD, provisional: false };
  const moves = game.moves || [],
    positions = game.analysis?.positions;
  // A partial review must not masquerade as a whole-game percentage.
  if (!game.analysis?.complete || !moves.length || !positions) return empty;
  const scores = Array.from({ length: moves.length + 1 }, (_, i) => winPercent(positions[i]));
  if (scores.some((score) => score === null) || moves.some((m) => !['w', 'b'].includes(m.color)))
    return empty;

  const size = clamp(Math.floor(moves.length / 10), 2, 8),
    samples = { w: [], b: [] };
  for (let i = 0; i < moves.length; i++) {
    const start = Math.max(0, i - size + 2),
      window = scores.slice(start, start + size),
      mean = window.reduce((sum, value) => sum + value, 0) / window.length,
      variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length,
      weight = clamp(Math.sqrt(variance), 0.5, 12);
    samples[moves[i].color].push({
      value: moveAccuracy(scores[i], scores[i + 1], moves[i].color),
      weight,
    });
  }
  const result = { ...empty };
  for (const color of ['w', 'b']) {
    const own = samples[color];
    if (!own.length) continue;
    const weight = own.reduce((sum, sample) => sum + sample.weight, 0),
      weighted = own.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / weight,
      harmonic = own.length / own.reduce((sum, sample) => sum + 1 / Math.max(1, sample.value), 0);
    result[color] = clamp((weighted + harmonic) / 2, 0, 100);
  }
  result.provisional = positions
    .slice(0, moves.length + 1)
    .some((p) => !p.terminal && !(p.depth >= 12));
  return result;
}
