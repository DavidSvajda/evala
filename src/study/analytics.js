export * from '../core/game-analytics.js';
import { PHASES, QUALITY, REASONS } from '../core/game-analytics.js';
import { escapeHtml as esc } from '../ui/dom.js';
const percent = (value) => (value === null ? '—' : value.toFixed(1) + ' %');
const resultBar = (b) =>
  `<div class="result-bar" aria-label="${b.win} výher, ${b.draw} remíz, ${b.loss} proher">${['win', 'draw', 'loss'].map((k) => `<span class="${k}" style="width:${b.games ? (b[k] / b.games) * 100 : 0}%"></span>`).join('')}</div>`;
export function renderAnalytics(root, report, onPosition) {
  const r = report,
    b = r.overall;
  if (!r.username.trim()) {
    root.innerHTML =
      '<div class="analytics-empty"><h2>Začni svou přezdívkou</h2><p>Načti poslední partie a vyber je pro společný rozbor. Výsledky i tréninkové pozice se uloží do tohoto prohlížeče.</p></div>';
    return;
  }
  if (!b.games) {
    root.innerHTML = `<div class="analytics-empty"><h2>${r.matched ? 'Žádné odpovídající partie' : 'Připraveno pro tvůj rozbor'}</h2><p>${r.matched ? 'Změň filtr barvy, tempa nebo výsledku.' : 'Nahoře načti partie podle přezdívky. Výsledky uvidíš ihned; chyby a doporučení přibudou po rozboru.'}</p></div>`;
    return;
  }
  root.innerHTML = `<div class="analytics-overview"><div><h2>${esc(r.username)}</h2><p>${b.games} dokončených partií · ${r.analyzedGames} s vyhodnocenými tahy · ${b.moves} tahů vyhodnoceno</p></div><button class="quiet-button" id="export-insights">Exportovat JSON</button></div>
  <div class="analytics-results">${resultBar(b)}<div class="result-labels"><span><i class="win"></i>${b.win} výher</span><span><i class="draw"></i>${b.draw} remíz</span><span><i class="loss"></i>${b.loss} proher</span><span>Skóre ${percent(b.score)} · průměr tahů ${percent(b.accuracy)}</span></div></div>
  <div class="analytics-columns"><section><h3>Co procvičit</h3>${r.insights.length ? r.insights.map((item, i) => `<article class="insight"><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p>${item.moment ? `<button class="text-button" data-insight="${i}">Otevřít konkrétní pozici →</button>` : ''}</article>`).join('') : '<p class="muted">Rozebereš-li partie, objeví se tu chyby podle fáze a pozice k procvičení.</p>'}
  <h3>Fáze hry</h3><table><thead><tr><th>Fáze</th><th>Tahy</th><th>Skóre tahů</th><th>Chyby</th></tr></thead><tbody>${r.phases.map((p) => `<tr><td>${p.name}</td><td>${p.moves}</td><td>${percent(p.accuracy)}</td><td>${p.errors}${p.moves ? ' / ' + Math.round(p.errorRate) + ' %' : ''}</td></tr>`).join('')}</tbody></table>
  <p class="data-note">Koncovka: nejvýše 26 bodů materiálu bez pěšců a králů. Jinak zahájení do 10. tahu, poté střední hra. Chyba = ztráta alespoň 10 procentních bodů podle převodu hodnocení.</p>
  <h3>Kdy přicházejí chyby</h3><table><thead><tr><th>Tahy partie</th><th>Tvé tahy</th><th>Chyby / 100</th><th>Rozmezí 95 %</th></tr></thead><tbody>${r.intervals.map((item) => `<tr><td>${item.name}</td><td>${item.moves}</td><td>${item.errorRate === null ? '—' : item.errorRate.toFixed(1)}</td><td>${item.interval ? item.interval.map((v) => Math.round(v)).join('–') : '—'}</td></tr>`).join('')}</tbody></table><p class="data-note">Rozmezí vyjadřuje nejistotu odhadu (Wilson). Malé vzorky neber jako stabilní slabinu.</p>
  <h3>Bílými a černými</h3><table><thead><tr><th>Barva</th><th>Partie</th><th>V / R / P</th><th>Skóre</th></tr></thead><tbody>${['w', 'b'].map((c) => `<tr><td>${c === 'w' ? 'Bílými' : 'Černými'}</td><td>${r.colors[c].games}</td><td>${r.colors[c].win} / ${r.colors[c].draw} / ${r.colors[c].loss}</td><td>${percent(r.colors[c].score)}</td></tr>`).join('')}</tbody></table>
  <h3>Jak partie končí</h3><table><thead><tr><th>Zakončení</th><th>Výhry</th><th>Remízy</th><th>Prohry</th></tr></thead><tbody>${r.terminations.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.win}</td><td>${t.draw}</td><td>${t.loss}</td></tr>`).join('')}</tbody></table></section>
  <section><h3>Zahájení a výsledky</h3><div class="table-scroll"><table><thead><tr><th>Zahájení / tahová řada</th><th>Barva</th><th>Partie</th><th>V / R / P</th><th>Skóre</th></tr></thead><tbody>${r.openings.map((o) => `<tr><td>${esc(o.name)}${o.games < 3 ? '<small>Malý vzorek</small>' : ''}</td><td>${o.color === 'w' ? 'B' : 'Č'}</td><td>${o.games}</td><td>${o.win} / ${o.draw} / ${o.loss}</td><td>${percent(o.score)}</td></tr>`).join('')}</tbody></table></div>
  <h3>Co je vidět ve variantách</h3><div class="pattern-list">${Object.entries(REASONS)
    .map(
      ([key, label]) =>
        `<button class="pattern-row" data-pattern="${key}" ${!r.reasons[key] ? 'disabled' : ''}><span>${label}</span><strong>${r.reasons[key] || 0}</strong><span>→</span></button>`,
    )
    .join(
      '',
    )}</div><p class="data-note">Jde o rozpoznané následky v krátké variantě enginu. Neodhalují samy o sobě příčinu tvého rozhodnutí.</p>
  <h3>Úseky s více chybami</h3><div class="training-list">${r.windows.map((w, i) => `<button data-window="${i}"><span class="training-number">${w.range}</span><span>${w.errors} ${w.errors === 1 ? 'chyba' : 'chyb'}<small>vs ${esc(w.opponent)} · ${esc(w.date || '')}</small></span><span>→</span></button>`).join('') || '<p class="muted">Úseky přibudou po vyhodnocení tahů.</p>'}</div>
  <details class="analytics-detail"><summary>Kvalita tahů a práce s figurami</summary><div class="quality-distribution">${Object.entries(
    QUALITY,
  )
    .map(
      ([key, label]) =>
        `<div><span class="quality-dot ${key}"></span><span>${label}</span><strong>${r.quality[key] || 0}</strong></div>`,
    )
    .join(
      '',
    )}</div><table><thead><tr><th>Figura</th><th>Tahy</th><th>Skóre tahů</th><th>Chyby</th></tr></thead><tbody>${r.pieces.map((p) => `<tr><td>${p.name}</td><td>${p.moves}</td><td>${percent(p.accuracy)}</td><td>${p.errors}</td></tr>`).join('')}</tbody></table></details>
  <h3>Pozice k procvičení</h3><p class="data-note">Největší ztráty hodnocení v tvých vyhodnocených tazích. Kliknutím otevřeš partii v daném tahu.</p><div class="training-list">${
    r.moments
      .slice(0, 12)
      .map(
        (m, i) =>
          `<button data-moment="${i}"><span class="training-number">${m.number}${m.color === 'w' ? '.' : '…'} ${esc(m.move)}</span><span>${esc(m.mark.label)} · ${PHASES[m.phase]}<small>vs ${esc(m.opponent)} · ${esc(m.date || '')}</small></span><span>→</span></button>`,
      )
      .join('') || '<p class="muted">Zatím nejsou vyhodnocené chyby.</p>'
  }</div></section></div>
  <p class="data-note analytics-method">Skóre výsledků = (výhry + ½ remíz) / partie. Skóre tahů je vlastní výpočet Evala, nikoli přesnost Chess.com. Částečné rozbory jsou zahrnuty jen svými hotovými tahy. Způsob ukončení se doplňuje pouze z konečné pozice nebo PGN.</p>`;
  root
    .querySelectorAll('[data-moment]')
    .forEach(
      (button) => (button.onclick = () => onPosition(r.moments[Number(button.dataset.moment)])),
    );
  root
    .querySelectorAll('[data-insight]')
    .forEach(
      (button) =>
        (button.onclick = () => onPosition(r.insights[Number(button.dataset.insight)].moment)),
    );
  root
    .querySelectorAll('[data-window]')
    .forEach(
      (button) => (button.onclick = () => onPosition(r.windows[Number(button.dataset.window)])),
    );
  root
    .querySelectorAll('[data-pattern]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          onPosition(r.moments.find((m) => m.reason === button.dataset.pattern))),
    );
  root.querySelector('#export-insights').onclick = () => {
    const { records, ...safe } = r;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evala-prehled.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
