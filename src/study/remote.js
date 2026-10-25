import { checkedResult } from '../core/engine-result.js';
export { checkedResult } from '../core/engine-result.js';
import { applyReviewProgress } from './review-stream.js';

export function serverAddress(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Zadej platnou HTTPS adresu serveru.');
  }
  if (
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Server musí používat HTTPS. HTTP je povoleno jen pro localhost.');
  return url.origin;
}
export class RemoteEngine {
  constructor(base, token) {
    this.base = serverAddress(base);
    this.token = token;
    this.pending = new Set();
  }
  async search(request, { signal, onInfo } = {}) {
    const controller = new AbortController();
    this.pending.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 45000);
    if (signal?.aborted) controller.abort();
    try {
      const response = await fetch(this.base + '/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Server odmítl API token.'
            : response.status === 429
              ? 'Server je vytížený. Počkej chvíli a spusť rozbor znovu.'
              : `Server vrátil chybu ${response.status}.`,
        );
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        result;
      const consume = (line) => {
        if (!line.trim()) return;
        const message = JSON.parse(line);
        if (message.type === 'error') throw new Error(String(message.message).slice(0, 300));
        if (message.type === 'info') onInfo?.(checkedResult(message.result));
        if (message.type === 'done') result = checkedResult(message.result);
      };
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        if (buffer.length > 2_000_000) throw new Error('Server poslal příliš velkou odpověď.');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          consume(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
        }
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!result) throw new Error('Server ukončil spojení bez výsledku.');
      return result;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      this.pending.delete(controller);
    }
  }
  dispose() {
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
}

export async function connectPublicServer(base, { signal } = {}) {
  const response = await fetch(serverAddress(base) + '/api/session', {
    credentials: 'include',
    signal,
  });
  if (!response.ok)
    throw new Error('Připojení není dostupné. Obnov stránku nebo to zkus za chvíli.');
  return await response.json();
}

export async function remoteReview(
  base,
  token,
  game,
  { profile = 'quick', signal, onUpdate } = {},
) {
  const response = await fetch(serverAddress(base) + '/api/review-game', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ pgn: game.pgn, profile, streamVersion: 2 }),
    signal,
  });
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new Error(message.error || `Server vrátil chybu ${response.status}.`);
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    result;
  const consume = (line) => {
    if (!line.trim()) return;
    const message = JSON.parse(line);
    if (message.type === 'error') throw new Error(message.message);
    if (message.type === 'progress') {
      applyReviewProgress(game, message);
      onUpdate?.(message);
    }
    if (message.type === 'game') result = message.game;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      if (buffer.length > 8_000_000) throw new Error('Výsledek je příliš velký.');
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (
      !result?.analysis?.complete ||
      result.id !== game.id ||
      result.moves.length !== game.moves.length
    )
      throw new Error('Server nevrátil dokončený rozbor této partie.');
    game.analysis = result.analysis;
    return game;
  } finally {
    reader.releaseLock();
  }
}
