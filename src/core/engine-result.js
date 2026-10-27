export function checkedResult(data) {
  const score = (s) => {
    if (!s || !['cp', 'mate'].includes(s.kind) || !Number.isFinite(s.value))
      throw new Error('Server vrátil neplatné hodnocení.');
    const number = (key) => (Number.isFinite(s[key]) ? Math.max(0, Math.min(1e12, s[key])) : 0);
    return {
      kind: s.kind,
      value: Math.max(-1e7, Math.min(1e7, s.value)),
      depth: number('depth'),
      time: number('time'),
      nps: number('nps'),
      nodes: number('nodes'),
      multipv: number('multipv') || 1,
      terminal: s.terminal === true,
      pv: Array.isArray(s.pv)
        ? s.pv
            .slice(0, 100)
            .filter((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
        : [],
      wdl:
        Array.isArray(s.wdl) && s.wdl.length === 3 && s.wdl.every(Number.isFinite) ? s.wdl : null,
    };
  };
  const result = score(data);
  result.lines = Array.isArray(data.lines) ? data.lines.slice(0, 5).map(score) : [];
  return result;
}
