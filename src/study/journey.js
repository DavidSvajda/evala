import { escapeHtml as esc } from '../ui/dom.js';
import { FOCUS } from '../training/journey.js';

export function renderJourney(
  root,
  data,
  { lang, username, plan, today, onImport, onReview, onTrain },
) {
  if (!Array.isArray(plan?.ids) || !Array.isArray(plan?.done)) plan = null;
  const t = (cs, en) => (lang === 'en' ? en : cs);
  const focus =
      data.priorities.find(
        (p) =>
          p.key ===
          (plan?.day === today && plan.done?.length < plan.ids.length ? plan.focusKey : ''),
      ) || data.priorities[0],
    total = plan?.day === today ? plan.ids.length : 0;
  const done = total ? new Set((plan.done || []).filter((id) => plan.ids.includes(id))).size : 0;
  const completed = total > 0 && done === total;
  const label = focus
    ? FOCUS[focus.key][lang === 'en' ? 'en' : 'cs']
    : t('Pravidelný trénink', 'Regular practice');
  const needsImport = !username || !data.imported,
    needsReview = !needsImport && !data.reviewed;
  const heading = needsImport
    ? t('Začni svými partiemi', 'Start with your games')
    : needsReview
      ? t('Najdi první rozhodující moment', 'Find your first critical moment')
      : completed
        ? t('Dnešní lekce je hotová', 'Today’s lesson is complete')
        : label;
  const description = needsImport
    ? t(
        'Načti poslední partie. Z jejich rozboru vybereme téma i konkrétní pozice k procvičení.',
        'Import your recent games. Their analysis will provide a focus and specific positions to practise.',
      )
    : needsReview
      ? t(
          'Otevři uloženou partii a spusť rozbor. Doporučení vznikne až z vyhodnocených tahů.',
          'Open a saved game and run its review. Recommendations require analysed moves.',
        )
      : completed
        ? t(
            'Procvičené pozice nejsou důkazem vyššího Elo. V dalších partiích sleduj, zda stejná chyba mizí.',
            'Practised positions do not prove a rating gain. Watch whether the same mistake recurs in later games.',
          )
        : focus
          ? t(
              `${focus.count} chybových pozic v ${focus.games} partiích. ${focus.recurring ? 'Téma se opakuje ve více partiích.' : 'Zatím malý vzorek; jde o námět k procvičení.'}`,
              `${focus.count} error positions across ${focus.games} games. ${focus.recurring ? 'The focus recurs across games.' : 'A small sample so far; treat this as a practice suggestion.'}`,
            )
          : t(
              'V dostupném rozboru nemáme dost podkladů pro konkrétní slabinu. Začni smíšenou lekcí.',
              'The available analysis does not support a specific weakness. Start a mixed lesson.',
            );
  root.innerHTML = `<div class="journey-main"><h2>${esc(heading)}</h2><p>${esc(description)}</p><button class="primary-button" id="journey-primary">${needsImport ? t('Načíst moje partie', 'Import my games') : needsReview ? t('Otevřít partii k rozboru', 'Open a game to review') : completed ? t('Prohlédnout vlastní pozice', 'Review my positions') : done ? t('Pokračovat v lekci', 'Continue lesson') : t('Procvičit téma · 6 pozic', 'Practise focus · 6 positions')}</button>${total ? `<p class="journey-progress" role="status">${t('Dnešní lekce', 'Today’s lesson')}: ${done}/${total}</p>` : ''}</div><div class="journey-evidence"><h3>${t('Na čem doporučení stojí', 'What the recommendation is based on')}</h3><p>${t(`${data.reviewed} rozebraných z ${data.imported} vlastních partií · ${data.decisions} vyhodnocených rozhodnutí`, `${data.reviewed} reviewed of ${data.imported} own games · ${data.decisions} evaluated decisions`)}</p>${
    focus
      ? focus.examples
          .slice(0, 3)
          .map(
            (e, i) =>
              `<button class="journey-example" data-journey-example="${i}"><span>${Math.floor(e.ply / 2) + 1}${e.ply % 2 ? '…' : '.'} ${esc(e.san)}</span><span>vs ${esc(e.opponent)}</span><span>${t('Proč?', 'Why?')}</span></button>`,
          )
          .join('')
      : `<p>${t('Rozebírají se jen tvoje tahy pod zadanou přezdívkou.', 'Only your moves under the selected username are considered.')}</p>`
  }<p class="hint">${t('Výsledek rozboru popisuje tahy, ne důvod, proč jsi je zahrál.', 'Analysis describes your moves, not why you chose them.')}${data.due ? ' ' + t(`${data.due} pozic čeká na opakování.`, `${data.due} positions are due for review.`) : ''}</p></div>`;
  root.querySelector('#journey-primary').onclick = () =>
    needsImport
      ? onImport()
      : needsReview
        ? onReview(data.nextReview)
        : completed && focus
          ? onReview(focus.examples[0].gameId, focus.examples[0].ply)
          : onTrain(focus?.key);
  root.querySelectorAll('[data-journey-example]').forEach(
    (b) =>
      (b.onclick = () => {
        const e = focus.examples[Number(b.dataset.journeyExample)];
        onReview(e.gameId, e.ply);
      }),
  );
}
