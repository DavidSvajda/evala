import { escapeHtml as esc } from '../../ui/dom.js';
import { MOVE_KINDS, moveIcon } from '../../ui/move-icons.js';
import { language } from '../i18n.js';
export function summaryMarkup(selected, summary) {
  const number = (value) =>
    new Intl.NumberFormat(language() === 'en' ? 'en-GB' : 'cs-CZ').format(value);
  return `<div class="summary-players">${['w', 'b']
    .map((color) => {
      const s = summary[color],
        p = s.performance;
      return `<section class="summary-player"><span class="summary-side"><i class="player-dot ${color === 'b' ? 'black' : ''}"></i>${color === 'w' ? 'Bílý' : 'Černý'}</span><strong class="summary-name">${esc(selected.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'Bílý' : 'Černý'))}</strong><span class="accuracy-value" title="Průměr skóre vyhodnocených tahů Evaly">${s.accuracy === null ? '—' : s.accuracy.toFixed(1) + ' %'}</span><span class="summary-caption">Přesnost Evaly</span><div class="performance-estimate"><span>Odhad Elo v partii</span><strong>${p.value ? '≈ ' + number(p.value) : '—'}</strong><small>${p.value ? number(p.low) + '–' + number(p.high) : esc(p.reason)}</small></div></section>`;
    })
    .join(
      '',
    )}</div><div class="move-summary"><div class="summary-coverage"><span>${summary.w.count + summary.b.count}/${selected.moves.length} vyhodnocených tahů</span><span>Kliknutím přejdeš na tah</span></div>${MOVE_KINDS.map(([kind, label]) => `<div class="move-summary-row"><button data-jump-kind="${kind}" data-color="w" ${!summary.w.counts[kind] ? 'disabled' : ''} aria-label="Bílý: ${label} ${summary.w.counts[kind] || 0}">${summary.w.counts[kind] || 0}</button><span>${moveIcon(kind)}<span>${label}</span></span><button data-jump-kind="${kind}" data-color="b" ${!summary.b.counts[kind] ? 'disabled' : ''} aria-label="Černý: ${label} ${summary.b.counts[kind] || 0}">${summary.b.counts[kind] || 0}</button></div>`).join('')}</div><p><a class="text-link" href="#/puzzles" data-start-lesson="${esc(selected.id)}">Procvičit chyby z partie</a></p><details class="performance-method"><summary>Jak vzniká odhad výkonu</summary><p>Vlastní orientační heuristika Evaly, ne výpočet Chess.com. Vychází z Elo v PGN a kvality nejméně 12 nevyhraných či nevynucených rozhodnutí po prvních čtyřech tazích, spočítaných do hloubky alespoň 12. Krátké partie a chybějící Elo neodhadujeme. Rozmezí vyjadřuje rezervu heuristiky, nejde o statistický interval. Model není kalibrovaný na oficiálním ratingovém systému.</p></details>`;
}
