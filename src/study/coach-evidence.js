import { Chess } from 'chess.js';
import { legalContinuation, reviewMoments } from './coach-review.js';
import { errorReason } from '../core/game-analytics.js';

export function coachPrinciple(fen, position, lang = 'en') {
  const en = lang === 'en';
  if (!(position?.depth >= 12)) return '';
  const line = legalContinuation(fen, position.lines?.[0]?.pv, 5);
  if (!line.length) return '';
  const capture = line.find((m, index) => index % 2 === 0 && m.captured);
  if (line.some((m) => m.mate))
    return en
      ? 'Check the forcing moves first: this legal engine continuation ends in checkmate.'
      : 'Nejdřív prověř vynucující tahy: toto legální pokračování enginu končí matem.';
  if (capture)
    return en
      ? `Start with the opponent’s captures. In this engine line, ${capture.san} takes material. Before choosing a plan, check what is left undefended.`
      : `Začni braním soupeře. V této variantě enginu bere ${capture.san} materiál. Než zvolíš plán, zkontroluj nechráněné figury.`;
  const first = new Chess(fen).move({
    from: line[0].uci.slice(0, 2),
    to: line[0].uci.slice(2, 4),
    promotion: line[0].uci[4],
  });
  if (first.san.includes('+'))
    return en
      ? 'Check forcing checks before quiet plans. The engine starts with a check; follow the defence before judging the resulting position.'
      : 'Před klidným plánem prověř šachy. Engine začíná šachem; před hodnocením výsledku přehraj obranu.';
  return en
    ? 'Compare your plan with the opponent’s strongest reply. Play the short continuation, then name what changed in piece activity or king safety.'
    : 'Porovnej svůj plán s nejsilnější odpovědí soupeře. Přehraj krátkou variantu a pojmenuj změnu aktivity figur nebo bezpečí krále.';
}

// Group nearby same-theme mistakes as review episodes, without claiming causality.
export function reviewEpisodes(game, color = 'all', limit = Infinity) {
  const episodes = [],
    last = new Map();
  for (const moment of reviewMoments(game, color)) {
    if (['great', 'brilliant'].includes(moment.mark.kind)) {
      episodes.push({ ...moment, related: [] });
      last.delete(moment.move.color);
      continue;
    }
    const reason = errorReason(
      moment.move,
      game.analysis.positions?.[moment.index],
      game.analysis.positions?.[moment.ply],
    );
    const prior = last.get(moment.move.color);
    if (prior && moment.index - prior.lastIndex <= 4 && prior.reason === reason) {
      prior.related.push(moment);
      prior.lastIndex = moment.index;
      prior.weight = Math.max(prior.weight, moment.mark.loss || 0);
    } else {
      const entry = {
        ...moment,
        reason,
        related: [],
        lastIndex: moment.index,
        weight: moment.mark.loss || 0,
      };
      episodes.push(entry);
      last.set(moment.move.color, entry);
    }
  }
  return episodes
    .sort(
      (a, b) =>
        (b.mark.kind === 'brilliant' ? 100 : b.weight || 0) -
        (a.mark.kind === 'brilliant' ? 100 : a.weight || 0),
    )
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
}
