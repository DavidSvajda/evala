// SPDX-License-Identifier: AGPL-3.0-or-later
import * as ort from 'onnxruntime-web/wasm';
import { Chess } from 'chess.js';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('./', self.location.href).href;
let session;
const mirror = (m) => m[0] + (9 - Number(m[1])) + m[2] + (9 - Number(m[3])) + m.slice(4);
function tokens(board) {
  const out = new Float32Array(768),
    black = board.turn() === 'b';
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++) {
      const p = board.get('abcdefgh'[file] + (rank + 1));
      if (!p) continue;
      const sq = (black ? 7 - rank : rank) * 8 + file;
      out[sq * 12 + 'pnbrqk'.indexOf(p.type) + ((p.color === 'b') !== black ? 6 : 0)] = 1;
    }
  return out;
}
function index(move) {
  const sq = (s) => 'abcdefgh'.indexOf(s[0]) + (Number(s[1]) - 1) * 8;
  return move.length === 5
    ? 4096 +
        'abcdefgh'.indexOf(move[0]) * 32 +
        'abcdefgh'.indexOf(move[2]) * 4 +
        'qrbn'.indexOf(move[4])
    : sq(move.slice(0, 2)) * 64 + sq(move.slice(2, 4));
}
self.onmessage = async (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const { data } = event;
  if (
    !data ||
    !Number.isSafeInteger(data.id) ||
    (data.moves && (!Array.isArray(data.moves) || data.moves.length > 600))
  )
    return;
  try {
    session ||= ort.InferenceSession.create(new URL('maia3-5m.onnx', self.location.href).href, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    const model = await session,
      board = new Chess(data.initialFen || data.fen),
      history = [tokens(board)];
    for (const m of data.moves || []) {
      board.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      history.push(tokens(board));
      if (history.length > 8) history.shift();
    }
    while (history.length < 8) history.unshift(history[0]);
    const input = new Float32Array(64 * 97);
    for (let s = 0; s < 64; s++)
      for (let h = 0; h < 8; h++)
        input.set(history[h].subarray(s * 12, s * 12 + 12), s * 97 + h * 12);
    const elo = Math.max(800, Math.min(2400, Math.round(data.elo || 1400)));
    const result = await model.run({
      tokens: new ort.Tensor('float32', input, [1, 64, 97]),
      self_elo: new ort.Tensor('int64', BigInt64Array.of(BigInt(elo)), [1]),
      opponent_elo: new ort.Tensor('int64', BigInt64Array.of(BigInt(elo)), [1]),
    });
    const candidates = board.moves({ verbose: true }).map((m) => {
      const move = m.from + m.to + (m.promotion || '');
      return { move, logit: result.policy.data[index(board.turn() === 'b' ? mirror(move) : move)] };
    });
    if (!candidates.length) throw new Error('Pozice nemá legální tah.');
    const max = Math.max(...candidates.map((c) => c.logit));
    let total = 0;
    for (const c of candidates) {
      c.probability = Math.exp(c.logit - max);
      total += c.probability;
    }
    let pick = Math.random(),
      selected = candidates[0].move;
    for (const c of candidates) {
      c.probability /= total;
      pick -= c.probability;
      if (pick <= 0) {
        selected = c.move;
        break;
      }
    }
    // Normalize every candidate, including those after the sampled move.
    for (const c of candidates) c.probability = Math.exp(c.logit - max) / total;
    candidates.sort((a, b) => b.probability - a.probability);
    self.postMessage({ id: data.id, move: selected, candidates: candidates.slice(0, 8) });
  } catch (e) {
    session = null;
    self.postMessage({ id: data.id, error: e.message });
  }
};
