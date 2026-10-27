import { icon } from '../../ui/platform-icons.js';
import { escapeHtml as esc } from '../../ui/dom.js';
export function gameRows(games, empty) {
  if (!games.length)
    return `<div class="empty-state"><span class="empty-symbol">${icon('games')}</span><h3>${empty}</h3><p>Načti veřejné partie podle přezdívky nebo importuj PGN.</p><a href="#/games" class="text-link">Importovat partii ${icon('arrow')}</a></div>`;
  return games
    .map(
      (game) =>
        `<button class="recent-game" data-open-game="${esc(game.id)}"><span class="game-result">${esc(game.headers.Result || '*')}</span><span class="recent-players"><strong>${esc(game.headers.White || 'Bílý')} <span>–</span> ${esc(game.headers.Black || 'Černý')}</strong><small>${esc(game.headers.Opening || game.headers.ECO || 'Standardní šachy')} · ${Math.ceil(game.moves.length / 2)} tahů</small></span><span class="game-date">${esc(game.headers.Date?.includes('?') ? '' : game.headers.Date || '')}</span><span class="game-state ${game.analysis?.complete ? 'complete' : ''}">${game.analysis?.complete ? 'Rozebráno' : 'Bez rozboru'}</span><span>${icon('chevron')}</span></button>`,
    )
    .join('');
}
