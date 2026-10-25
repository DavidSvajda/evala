import { escapeHtml as esc } from '../../ui/dom.js';
import { moveIcon } from '../../ui/move-icons.js';
import { scoreText } from '../../core/evaluation.js';
export function renderNotation(
  root,
  { selected, ply, branch, requestedFilter, conceal, navigate },
) {
  const filter = conceal ? 'all' : requestedFilter,
    fragment = document.createDocumentFragment();
  if (!selected) {
    root.innerHTML = '<p class="panel-empty">Tady se objeví tahy importované partie.</p>';
    return;
  }
  for (let i = 0; i < selected.moves.length; i += 2) {
    const pair = document.createElement('div');
    pair.className = 'move-pair';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = Math.floor(i / 2) + 1 + '.';
    pair.append(number);
    let visible = filter === 'all';
    for (const index of [i, i + 1]) {
      const move = selected.moves[index];
      if (!move) continue;
      const mark = conceal ? null : selected.analysis?.moves?.[index];
      const accepted = {
        critical: ['inaccuracy', 'mistake', 'blunder', 'miss', 'great', 'brilliant', 'sacrifice'],
        errors: ['inaccuracy', 'mistake', 'blunder', 'miss'],
        best: ['best', 'great', 'brilliant'],
        brilliant: ['brilliant'],
      };
      const matches = mark && accepted[filter]?.includes(mark.kind);
      visible ||= !!matches;
      const button = document.createElement('button');
      button.className = 'move-button ' + (mark?.kind || '');
      button.dataset.ply = index + 1;
      button.classList.toggle('user-critical', !!selected.learning?.notes?.[index + 1]?.critical);
      button.setAttribute('aria-current', String(!branch && ply === index + 1));
      button.title = mark ? `${mark.label} · skóre tahu ${mark.accuracy.toFixed(1)} %` : move.san;
      const position = conceal ? null : selected.analysis?.positions?.[index + 1];
      button.innerHTML = `<span class="move-san">${esc(move.san)}</span><span class="notation-eval">${position ? esc(scoreText(position)) : ''}</span><span class="move-symbol">${mark ? moveIcon(mark.kind) : ''}</span>`;
      if (Number.isFinite(move.clockAfter) && move.clockAfter !== null)
        button.title +=
          ' · Zbývající čas ' +
          Math.floor(move.clockAfter / 60) +
          ':' +
          String(Math.floor(move.clockAfter % 60)).padStart(2, '0');
      if (filter !== 'all' && !matches) button.classList.add('filtered-out');
      button.addEventListener('click', () => navigate(index + 1));
      pair.append(button);
    }
    if (visible) fragment.append(pair);
  }
  const focused = root.contains(document.activeElement) ? document.activeElement.dataset.ply : null;
  root.replaceChildren(fragment);
  if (focused) root.querySelector(`[data-ply="${focused}"]`)?.focus({ preventScroll: true });
}
