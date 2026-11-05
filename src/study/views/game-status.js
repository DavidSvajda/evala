import { escapeHtml as esc } from '../../ui/dom.js';
export function playedToday(game, now = new Date()) {
  const h = game.headers || {};
  if (
    /^\d{4}\.\d{2}\.\d{2}$/.test(h.UTCDate || '') &&
    /^\d{2}:\d{2}:\d{2}$/.test(h.UTCTime || '')
  ) {
    const date = new Date(h.UTCDate.replaceAll('.', '-') + 'T' + h.UTCTime + 'Z');
    return !Number.isNaN(date.getTime()) && date.toDateString() === now.toDateString();
  }
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('.');
  return h.Date === date;
}
export function gameStatusMarkup(game) {
  const partial = !game.analysis?.complete && game.analysis?.positions?.some(Boolean);
  const status = game.analysis?.complete ? 'complete' : partial ? 'partial' : 'pending';
  const label =
    status === 'complete' ? 'Rozebráno' : status === 'partial' ? 'Částečně' : 'Bez rozboru';
  return `<span class="game-state status-group">${game._syncConflict ? '<span class="game-status status-partial">Konflikt verzí</span>' : ''}${playedToday(game) ? '<span class="game-status status-today">Dnes</span>' : ''}<span class="game-status status-${status}"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><circle cx="6" cy="6" r="3" fill="currentColor"/></svg>${esc(label)}</span></span>`;
}
