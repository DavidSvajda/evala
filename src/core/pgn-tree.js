import { Chess } from 'chess.js';

const LIMIT = 4096;
const annotations = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const headerPattern = /^\s*\[(\w+)\s+"((?:\\.|[^"\\])*)"\]\s*/;

// A bounded, legal move tree. Node zero is the position before the first move;
// the first child is the main line, subsequent children are alternatives.
export function parsePgnTree(pgn) {
  if (typeof pgn !== 'string' || pgn.length > 200_000) throw Error('PGN tree limit: 200 kB.');
  let body = pgn.trim();
  const headers = {};
  for (let match; (match = body.match(headerPattern));) {
    headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
    body = body.slice(match[0].length);
  }
  const initial = new Chess(headers.FEN);
  const nodes = [
    { id: 0, parent: null, ply: 0, fen: initial.fen(), children: [], comments: [], nags: [] },
  ];
  let cursor = 0,
    result = headers.Result || '*',
    tokens = 0;
  const stack = [];
  for (const match of body.matchAll(/\{[^}]*\}|;[^\r\n]*|\(|\)|\$\d+|[^\s(){};]+|[{}]/g)) {
    if (++tokens > 24_000) throw Error('PGN token limit.');
    let token = match[0];
    if (token === '{' || token === '}') throw Error('Unclosed PGN comment.');
    if (token.startsWith('{') || token.startsWith(';')) {
      const text = token.startsWith('{') ? token.slice(1, -1) : token.slice(1);
      nodes[cursor].comments.push(text.trim());
      continue;
    }
    if (token === '(') {
      if (!cursor || stack.length >= 32) throw Error('Invalid or too deeply nested PGN variation.');
      stack.push(cursor);
      cursor = nodes[cursor].parent;
      continue;
    }
    if (token === ')') {
      if (!stack.length) throw Error('Unmatched PGN variation.');
      cursor = stack.pop();
      continue;
    }
    if (/^\$\d+$/.test(token)) {
      nodes[cursor].nags.push(Number(token.slice(1)));
      continue;
    }
    token = token.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.\.\./, '');
    if (!token) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
      if (!stack.length) result = token;
      continue;
    }
    const annotation = token.match(/[!?]+$/)?.[0];
    if (annotation) token = token.slice(0, -annotation.length);
    const chess = new Chess(nodes[cursor].fen);
    const move = chess.move(token);
    if (!move || nodes.length >= LIMIT || nodes[cursor].ply >= 600)
      throw Error('Invalid move or PGN node limit.');
    const id = nodes.length;
    nodes.push({
      id,
      parent: cursor,
      ply: nodes[cursor].ply + 1,
      fen: chess.fen(),
      san: move.san,
      uci: move.from + move.to + (move.promotion || ''),
      children: [],
      comments: [],
      nags: annotations[annotation] ? [annotations[annotation]] : [],
    });
    nodes[cursor].children.push(id);
    cursor = id;
  }
  if (stack.length) throw Error('Unclosed PGN variation.');
  return { headers, nodes, result };
}

export function hasPgnVariations(pgn) {
  return /[()]/.test(pgn.replace(/\{[^}]*\}|;[^\r\n]*|\[(?:[^"\]]|"(?:\\.|[^"\\])*")*\]/g, ''));
}

export function treePath(tree, id) {
  const path = [];
  for (let node = tree.nodes[id]; node?.parent !== null && node; node = tree.nodes[node.parent])
    path.unshift(node.uci);
  return path;
}

export function exportPgnTree(tree) {
  const { nodes } = tree;
  const comment = (node) => node.comments.map((s) => `{${s.replace(/[{}]/g, '')}}`).join(' ');
  const moveText = (node) => {
    const fen = nodes[node.parent].fen.split(' ');
    return `${fen[5]}${fen[1] === 'w' ? '.' : '...'} ${node.san} ${node.nags.map((n) => '$' + n).join(' ')} ${comment(node)}`.trim();
  };
  const branch = (id) => [moveText(nodes[id]), continuation(id)].filter(Boolean).join(' ');
  const continuation = (id) => {
    const [main, ...alternatives] = nodes[id].children;
    if (main === undefined) return '';
    return [moveText(nodes[main]), ...alternatives.map((n) => `(${branch(n)})`), continuation(main)]
      .filter(Boolean)
      .join(' ');
  };
  const quote = (s) => String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const headers = { ...tree.headers, Result: tree.result };
  return (
    Object.entries(headers)
      .map(([k, v]) => `[${k} "${quote(v)}"]`)
      .join('\n') +
    '\n\n' +
    [comment(nodes[0]), continuation(0), tree.result].filter(Boolean).join(' ')
  );
}

export function mergePgnAnnotations(original, annotated) {
  const tree = parsePgnTree(original),
    notes = parsePgnTree(annotated);
  let a = 0,
    b = 0;
  while (a !== undefined && b !== undefined) {
    if (tree.nodes[a].uci !== notes.nodes[b].uci) throw Error('PGN main lines differ.');
    tree.nodes[a].comments = notes.nodes[b].comments;
    a = tree.nodes[a].children[0];
    b = notes.nodes[b].children[0];
  }
  if (a !== b) throw Error('PGN main lines differ.');
  tree.headers = { ...tree.headers, ...notes.headers };
  return exportPgnTree(tree);
}
