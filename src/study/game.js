import { Chess } from 'chess.js';
import { validPosition } from '../core/position.js';

export const DEMO_PGN = `[Event "Ukázková partie"]
[White "Bílý"]
[Black "Černý"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

function fingerprint(text) {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function parsePgn(pgn) {
  if (typeof pgn !== 'string' || pgn.length > 2_000_000)
    throw new Error('PGN je prázdné nebo větší než 2 MB. Rozděl soubor na menší části.');
  const chess = new Chess();
  pgn = normalizePgn(pgn);
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new Error('PGN obsahuje neplatný tah nebo zápis. Zkus původní export PGN z webu.');
  }
  const explicitFen = pgn.match(/^\[FEN\s+"([^"]+)"\]/m)?.[1];
  if (!chess.history().length && /^\[SetUp\s+"1"\]/m.test(pgn) && validPosition(explicitFen)) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', chess.fen());
  }
  const headers = chess.getHeaders();
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant))
    throw new Error('Podporujeme standardní šachy. Tato partie používá jinou variantu.');
  const history = chess.history({ verbose: true });
  if (!history.length && !(headers.SetUp === '1' && headers.FEN && validPosition(headers.FEN)))
    throw new Error('V PGN nejsou žádné tahy.');
  if (history.length > 600) throw new Error('Limit je 600 půltahů na partii.');
  const initialFen = history[0]?.before || chess.fen();
  if (!validPosition(initialFen)) throw new Error('Neplatná výchozí pozice partie.');
  const comments = new Map(chess.getComments().map((item) => [item.fen, item.comment]));
  const moves = history.map((m) => {
    const clock = comments.get(m.after)?.match(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/);
    return {
      san: m.san,
      uci: m.from + m.to + (m.promotion || ''),
      color: m.color,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured || null,
      promotion: m.promotion || null,
      fenBefore: m.before,
      fenAfter: m.after,
      clockAfter: clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : null,
    };
  });
  const canonical = initialFen + '|' + moves.map((m) => m.uci).join(' ');
  const notes = {};
  for (const [i, fen] of [initialFen, ...moves.map((m) => m.fenAfter)].entries()) {
    const comment = comments.get(fen) || '',
      plain = /\[Evala |\[%eval/.test(comment) ? '' : comment.replace(/\[%[^\]]*\]/g, '').trim(),
      text = comment.match(/\[Evala note\]([\s\S]*?)(?=\[Evala plan\]|$)/)?.[1]?.trim() || plain,
      plan = comment.match(/\[Evala plan\]([\s\S]*)/)?.[1]?.trim() || '';
    if (text || plan || comment.includes('[Evala critical]'))
      notes[i] = {
        text: text.slice(0, 1200),
        plan: plan.slice(0, 800),
        critical: comment.includes('[Evala critical]'),
      };
  }
  return {
    id: fingerprint(canonical),
    pgn: chess.pgn(),
    headers,
    initialFen,
    moves,
    fens: [initialFen, ...moves.map((m) => m.fenAfter)],
    createdAt: Date.now(),
    analysis: null,
    learning: { notes, attempts: [] },
  };
}

// Accept the common human-readable title format without silently dropping
// arbitrary invalid text or repairing illegal chess moves.
export function normalizePgn(text) {
  let value = text
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim();
  value = value.replace(/^```(?:pgn)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  const title = value.match(
    /^([^\n\r\[\]]{1,120}?)\s+(?:v\.?|vs\.?)\s+([^\n\r\[\]]{1,120}?)\s*\((\d{4})\)\s*\r?\n\s*(?=\d+\.)/i,
  );
  if (title) {
    const safe = (s) => s.trim().replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    value =
      `[White "${safe(title[1])}"]\n[Black "${safe(title[2])}"]\n[Date "${title[3]}.??.??"]\n\n` +
      value.slice(title[0].length);
  }
  return value;
}

export function parseFenGame(text) {
  const fen =
    typeof text === 'string'
      ? text
          .trim()
          .replace(/^FEN:\s*/i, '')
          .replace(/\s+/g, ' ')
      : '';
  if (!validPosition(fen)) throw new Error('Neplatný FEN. Vlož úplný zápis pozice se šesti poli.');
  return parsePgn(
    `[Event "FEN"]\n[White "Position"]\n[Black "FEN"]\n[SetUp "1"]\n[FEN "${new Chess(fen).fen()}"]\n[Result "*"]\n\n*`,
  );
}

export function parsePgnCollection(text) {
  if (typeof text !== 'string' || text.length > 2_000_000)
    throw new Error('Soubor je větší než 2 MB. Importuj menší výběr partií.');
  const parts = [];
  let lines = [],
    started = false,
    comment = false;
  for (const line of normalizePgn(text).split(/\r?\n/)) {
    const header = !comment && /^\s*\[\w+\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/.test(line);
    if (header && started) {
      parts.push(lines.join('\n'));
      lines = [];
      started = false;
    }
    lines.push(line);
    if (!header) {
      const visible = line.replace(/;.*$/, '');
      if (!comment && /^\s*(?:\d+\.|1-0|0-1|1\/2-1\/2|\*)/.test(visible)) started = true;
      for (const c of visible) {
        if (c === '{') comment = true;
        else if (c === '}') comment = false;
      }
    }
  }
  if (lines.join('').trim()) parts.push(lines.join('\n'));
  if (parts.length > 100) throw new Error('Importuj nejvýše 100 partií najednou.');
  const games = [],
    errors = [];
  for (const [i, part] of parts.entries()) {
    try {
      games.push(parsePgn(part));
    } catch (error) {
      errors.push(`Partie ${i + 1}: ${error.message}`);
    }
  }
  if (!games.length) throw new Error(errors[0] || 'Vlož PGN nebo vyber soubor s partií.');
  return { games, errors };
}

export function lineToSan(fen, pv, limit = 12) {
  const chess = new Chess(fen),
    result = [];
  for (const uci of pv.slice(0, limit)) {
    try {
      const number = chess.moveNumber(),
        turn = chess.turn();
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      result.push(
        `${turn === 'w' ? number + '.' : result.length === 0 ? number + '…' : ''}${move.san}`,
      );
    } catch {
      break;
    }
  }
  return result.join(' ');
}

export function annotatedPgn(game, { engine = true, plies = null } = {}) {
  const chess = new Chess(game.initialFen);
  Object.entries(game.headers).forEach(([k, v]) => chess.setHeader(k, v));
  chess.setHeader('Annotator', engine ? 'Evala / Stockfish 19' : 'Evala notes');
  const noteAt = (index) => {
    if (plies && !plies.includes(index)) return '';
    const n = game.learning?.notes?.[index];
    return n
      ? `${n.critical ? '[Evala critical] ' : ''}${n.text ? '[Evala note] ' + n.text + ' ' : ''}${n.plan ? '[Evala plan] ' + n.plan : ''}`.replace(
          /[{}]/g,
          '',
        )
      : '';
  };
  if (noteAt(0)) chess.setComment(noteAt(0));
  for (const [i, move] of game.moves.entries()) {
    chess.move(move.san);
    const result = game.analysis?.positions?.[i + 1],
      mark = game.analysis?.moves?.[i];
    const note = noteAt(i + 1);
    if (!result || !engine) {
      if (note) chess.setComment(note);
      continue;
    }
    const value = result.kind === 'mate' ? `#${result.value}` : (result.value / 100).toFixed(2);
    const before = game.analysis.positions[i];
    const best = before?.lines?.[0]?.pv;
    chess.setComment(
      `[%eval ${value}] ${mark?.label || ''}${mark?.note ? ' ' + mark.note : ''}${best?.length ? ' | Engine: ' + lineToSan(move.fenBefore, best, 8) : ''} ${note}`.replace(
        /[{}]/g,
        '',
      ),
    );
  }
  return chess.pgn({ maxWidth: 90 });
}
