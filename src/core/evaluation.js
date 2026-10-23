export function parseInfo(line, turn = 'w') {
  if (!line.startsWith('info ') || !/\bscore (cp|mate) -?\d+/.test(line)) return null;
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const number = (name) => Number(line.match(new RegExp(`\\b${name} (\\d+)`))?.[1] || 0);
  if (number('multipv') > 1) return null;
  return {
    kind: score[1], value: Number(score[2]) * (turn === 'w' ? 1 : -1),
    depth: number('depth'), seldepth: number('seldepth'), nps: number('nps'),
    nodes: number('nodes'), time: number('time'),
    bound: /\b(lowerbound|upperbound)\b/.test(line),
  };
}

export function whitePercent(score) {
  if (!score) return 50;
  if (score.kind === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
  return 50 + 50 * Math.tanh(score.value / 400);
}

export function scoreText(score) {
  if (!score) return '—';
  if (score.kind === 'mate') return score.terminal || score.value === 0 ? 'Mat' : `${score.value > 0 ? '+' : '−'}M${Math.abs(score.value)}`;
  const pawns = Math.abs(score.value / 100);
  return `${score.value > 0 ? '+' : score.value < 0 ? '−' : ''}${pawns.toFixed(pawns >= 100 ? 0 : 1)}`;
}

export function evaluationLabel(score) {
  if (!score) return 'Čekám na hodnocení';
  if (score.kind === 'mate') return score.value === 0 ? 'Šach mat' : `Vynucený mat · ${score.value > 0 ? 'bílý' : 'černý'}`;
  if (Math.abs(score.value) < 35) return 'Vyrovnaná pozice';
  return `${Math.abs(score.value) > 200 ? 'Výhoda' : 'Mírná výhoda'} · ${score.value > 0 ? 'bílý' : 'černý'}`;
}
