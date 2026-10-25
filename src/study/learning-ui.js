import { escapeHtml as esc } from '../ui/dom.js';
import { Chess } from 'chess.js';
import { StudyBoard } from './board.js';
import { annotatedPgn, parsePgn, lineToSan } from './game.js';
import { language } from './i18n.js';
import {
  cleanLearning,
  practicePositions,
  openingRepertoire,
  weaknessEvidence,
  ownScore,
} from '../training/practice.js';
import { scoreText } from '../core/evaluation.js';

const $ = (s) => document.querySelector(s);
const t = (cs, en) => (language() === 'en' ? en : cs);
const uci = (m) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
function download(text, name) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initLearning(context) {
  const panel = document.createElement('section');
  panel.id = 'learning-notes';
  panel.className = 'learning-notes';
  panel.dataset.i18nIgnore = '';
  $('.analysis-panel').prepend(panel);
  let noteKey = '',
    comparison = false,
    drill = null,
    controller = null,
    mode = 'mixed',
    busy = false,
    seen = new Set(),
    lastQuiet = false;
  const learning = (game) => (game.learning ||= cleanLearning(null, game.moves));
  const cancel = () => {
    controller?.abort();
    controller = null;
    busy = false;
  };
  const status = (text) => {
    const el = $('#practice-status');
    if (el) el.textContent = text;
  };
  async function safely(task) {
    let active;
    try {
      const pending = task();
      active = controller;
      await pending;
    } catch (e) {
      if (e.name !== 'AbortError' && active === controller) status(e.message);
    } finally {
      if (active === controller) {
        busy = false;
        if (drill) paint();
      }
    }
  }
  function refresh() {
    const game = context.selected(),
      ply = context.ply(),
      key = (game?.id || '') + ':' + ply + ':' + language();
    document.body.dataset.selfAnalysis = String(!!game?.learning?.selfAnalysis);
    if (noteKey === key) return;
    noteKey = key;
    const n = game?.learning?.notes?.[ply] || {},
      notesOpen = !!$('#position-notes-detail')?.open;
    panel.innerHTML = `<div class="section-title"><h2>${t('Moje poznámky', 'My notes')}</h2><button id="self-analysis" class="quiet-button" ${!game ? 'disabled' : ''}>${game?.learning?.selfAnalysis ? t('Ukázat engine', 'Reveal engine') : t('Nejdřív bez enginu', 'Analyse without engine')}</button></div><details id="position-notes-detail"><summary>${t('Poznámky, porovnání a sdílení', 'Notes, comparison and sharing')}</summary><p class="hint">${t('Označ důležitou pozici a zapiš, co jsi počítal. Poznámka patří k právě zobrazené pozici v partii.', 'Mark a critical position and record your calculation. The note belongs to the displayed game position.')}</p><label class="check-row"><span>${t('Důležitá pozice', 'Critical position')}</span><input id="critical-note" type="checkbox" ${n.critical ? 'checked' : ''} ${!game ? 'disabled' : ''}></label><label for="position-note">${t('Co jsem počítal', 'My calculation')}</label><textarea id="position-note" rows="2" maxlength="1200" ${!game ? 'disabled' : ''}>${esc(n.text || '')}</textarea><label for="position-plan">${t('Plán v této pozici', 'My plan in this position')}</label><textarea id="position-plan" rows="2" maxlength="800" ${!game ? 'disabled' : ''}>${esc(n.plan || '')}</textarea><div class="setup-actions"><button id="save-position-note" class="quiet-button" ${!game ? 'disabled' : ''}>${t('Uložit poznámku', 'Save note')}</button><button id="next-my-critical" class="text-button" ${!game ? 'disabled' : ''}>${t('Další označená', 'Next marked position')}</button><button id="compare-move" class="text-button" ${!game || !ply || game.learning?.selfAnalysis ? 'disabled' : ''}>${t('Proč ne můj tah?', 'Why not my move?')}</button></div><p id="note-status" class="inline-status" role="status"></p><div id="move-comparison"></div><details><summary>${t('Probrat partii s trenérem', 'Discuss with a coach')}</summary><p class="hint">${t('Vyber poznámky k odeslání. PGN obsahuje tahy a jména hráčů; soukromá poznámka k celé partii se nepřidá. Soubor odešleš sám.', 'Select the notes to share. The PGN contains moves and player names; your private game note is excluded. You send the file yourself.')}</p><div id="share-notes"></div><button id="share-pgn" class="quiet-button" ${!game ? 'disabled' : ''}>${t('Stáhnout vybrané poznámky', 'Download selected notes')}</button><label class="file-button" for="review-notes-file">${t('Přijmout poznámky z PGN', 'Import feedback PGN')}<input id="review-notes-file" type="file" accept=".pgn" ${!game ? 'disabled' : ''}></label></details></details>`;
    $('#position-notes-detail').open = notesOpen;
    if (game)
      for (const [index, note] of Object.entries(game.learning?.notes || {})) {
        if (!note.text && !note.plan && !note.critical) continue;
        const label = document.createElement('label');
        label.className = 'check-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = index;
        const text = document.createElement('span');
        text.textContent = `${index}: ${(note.text || note.plan || t('Důležitá pozice', 'Critical position')).slice(0, 70)}`;
        label.append(box, text);
        $('#share-notes').append(label);
      }
    $('#self-analysis').onclick = async () => {
      if (context.busy()) {
        $('#note-status').textContent = t('Nejprve pozastav rozbor.', 'Pause the analysis first.');
        return;
      }
      learning(game).notes[ply] = {
        text: $('#position-note').value,
        plan: $('#position-plan').value,
        critical: $('#critical-note').checked,
      };
      game.learning.selfAnalysis = !game.learning.selfAnalysis;
      context.cancel();
      globalThis.speechSynthesis?.cancel();
      comparison = false;
      noteKey = '';
      context.render();
      await context.save(game);
    };
    $('#save-position-note').onclick = async () => {
      const data = learning(game);
      data.notes[ply] = {
        text: $('#position-note').value,
        plan: $('#position-plan').value,
        critical: $('#critical-note').checked,
      };
      game.learning = cleanLearning(data, game.moves);
      await context.save(game);
      noteKey = '';
      refresh();
      context.render();
      $('#note-status').textContent = t('Poznámka uložena.', 'Note saved.');
    };
    $('#next-my-critical').onclick = () => {
      const indices = Object.entries(learning(game).notes)
        .filter(([, n]) => n.critical)
        .map(([i]) => Number(i))
        .sort((a, b) => a - b);
      if (indices.length) context.navigate(indices.find((i) => i > ply) ?? indices[0]);
      else
        $('#note-status').textContent = t(
          'Nejdřív označ důležitou pozici.',
          'Mark a critical position first.',
        );
    };
    $('#compare-move').onclick = () => {
      comparison = !comparison;
      renderComparison();
    };
    $('#share-pgn').onclick = () => {
      const indices = [...$('#share-notes').querySelectorAll('input:checked')].map((x) =>
        Number(x.value),
      );
      download(annotatedPgn(game, { engine: false, plies: indices }), `evala-notes-${game.id}.pgn`);
    };
    $('#review-notes-file').onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2000000) throw Error(t('Soubor je příliš velký.', 'File is too large.'));
        const feedback = parsePgn(await file.text());
        if (
          feedback.id !== game.id ||
          feedback.initialFen !== game.initialFen ||
          feedback.moves.map((m) => m.uci).join(' ') !== game.moves.map((m) => m.uci).join(' ')
        )
          throw Error(t('Poznámky patří k jiné partii.', 'These notes belong to another game.'));
        for (const [index, n] of Object.entries(feedback.learning.notes)) {
          const old = learning(game).notes[index] || {};
          game.learning.notes[index] = {
            text: [old.text, n.text]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join('\n')
              .slice(0, 1200),
            plan: [old.plan, n.plan]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join('\n')
              .slice(0, 800),
            critical: old.critical || n.critical,
          };
        }
        game.learning = cleanLearning(game.learning, game.moves);
        await context.save(game);
        noteKey = '';
        refresh();
        $('#note-status').textContent = t(
          'Poznámky přidány. Původní rozbor zůstal uložen.',
          'Feedback added. Your analysis is preserved.',
        );
      } catch (e) {
        $('#note-status').textContent = e.message;
      }
    };
    renderComparison();
    for (const id of ['self-analysis', 'save-position-note', 'review-notes-file']) {
      const el = $('#' + id),
        key = id === 'review-notes-file' ? 'onchange' : 'onclick',
        handler = el[key];
      el[key] = async (e) => {
        try {
          await handler(e);
        } catch (error) {
          $('#note-status').textContent = error.message;
        }
      };
    }
  }
  function renderComparison() {
    const root = $('#move-comparison'),
      game = context.selected(),
      ply = context.ply();
    root.replaceChildren();
    if (!comparison || !game || !ply || game.learning?.selfAnalysis) return;
    const index = ply - 1,
      m = game.moves[index],
      before = game.analysis?.positions?.[index],
      after = game.analysis?.positions?.[ply];
    if (!before || !after) {
      root.textContent = t('Nejprve spočítej rozbor partie.', 'Analyse the game first.');
      return;
    }
    for (const [label, line, score] of [
      [
        t('Zahraný tah a odpověď', 'Played move and reply'),
        [m.uci, ...(after.lines?.[0]?.pv || [])],
        after,
      ],
      [t('Doporučení enginu', 'Engine recommendation'), before.lines?.[0]?.pv || [], before],
    ]) {
      const button = document.createElement('button');
      button.className = 'compare-line';
      button.innerHTML = `<strong>${label} · ${esc(scoreText(score))} · d${score.depth}</strong><span>${esc(lineToSan(m.fenBefore, line, 8))}</span><small>${t('Přehrát na šachovnici', 'Play on the board')}</small>`;
      button.onclick = () => context.playLine(index, line);
      root.append(button);
    }
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t(
      'Obě hodnocení jsou z pohledu bílého. Po přehrání můžeš změnit odpověď soupeře přímo na šachovnici.',
      'Both scores are from White’s perspective. After replaying, change the opponent’s reply directly on the board.',
    );
    root.append(p);
  }
  function renderWorkshop() {
    cancel();
    drill = null;
    const root = $('#practice-root');
    root.innerHTML = `<div class="page-heading"><div><h1>${t('Cvičebna', 'Practice room')}</h1><p>${t('Rozhodování z vlastních partií. Bez tréninkového Elo.', 'Decisions from your own games. No puzzle rating at stake.')}</p></div></div><div class="practice-controls"><label for="practice-mode">${t('Co procvičit', 'Training mode')}</label><select id="practice-mode"><option value="mixed">${t('Smíšené pozice', 'Mixed positions')}</option><option value="defense">${t('Udržet pozici', 'Hold the position')}</option><option value="conversion">${t('Dotáhnout výhodu', 'Convert an advantage')}</option><option value="opening">${t('Moje zahájení', 'My openings')}</option><option value="families">${t('Stejný motiv, jiná pozice', 'Same motif, another position')}</option></select><button id="practice-next" class="primary-button">${t('Vybrat pozici', 'Choose a position')}</button><button id="practice-stop" class="quiet-button">${t('Zastavit výpočet', 'Stop calculation')}</button></div><p id="practice-status" role="status">${t('Nastav svou přezdívku, importuj a rozeber partie. Smíšený režim střídá běžné pozice s rozhodnutími, kde záleží na přesném tahu.', 'Set your chess username, import and analyse games. Mixed mode alternates ordinary positions and decisions requiring precision.')}</p><div class="practice-layout"><div><div id="practice-board" tabindex="0"></div><div id="practice-promotion" class="setup-actions" hidden>${['q', 'r', 'b', 'n'].map((p) => `<button class="quiet-button" data-promote="${p}">${p.toUpperCase()}</button>`).join('')}</div><div id="practice-playback" class="setup-actions" hidden><button id="practice-back" class="quiet-button">←</button><button id="practice-forward" class="quiet-button">→</button><button id="practice-reset" class="text-button">${t('Zkusit znovu', 'Try again')}</button></div><p id="practice-line"></p></div><aside><div id="practice-context"></div><div id="practice-result" role="status"></div><div id="practice-families"></div><details><summary>${t('Mé nejčastější pozice v zahájení', 'My most common opening positions')}</summary><div id="opening-repertoire"></div></details></aside></div><section id="weakness-evidence"></section>`;
    $('#practice-mode').value = mode;
    $('#practice-mode').onchange = (e) => {
      cancel();
      mode = e.target.value;
      drill = null;
      $('#practice-board').replaceChildren();
      $('#practice-result').replaceChildren();
    };
    $('#practice-next').onclick = () => safely(startDrill);
    $('#practice-stop').onclick = () => {
      cancel();
      status(
        t(
          'Výpočet zastaven. Můžeš pokračovat tahem nebo vybrat jinou pozici.',
          'Calculation stopped. Play a move or choose another position.',
        ),
      );
      paint();
    };
    renderFamilies();
    renderRepertoire();
    renderEvidence();
  }
  function renderFamilies() {
    const root = $('#practice-families');
    root.innerHTML = `<h2>${t('Opakovat motiv v jiných pozicích', 'Repeat a motif in different positions')}</h2><p class="hint">${t('Vyber rodinu úloh. Dostaneš nové pozice místo zapamatovaného diagramu. Obtížnost odpovídá tvému tréninkovému ratingu.', 'Choose a puzzle family. Train new positions instead of memorising one diagram, at your training rating.')}</p>`;
    for (const [theme, cs, en] of [
      ['hangingPiece', 'Nechráněné figury', 'Loose pieces'],
      ['fork', 'Vidličky', 'Forks'],
      ['pin', 'Vazby', 'Pins'],
      ['defensiveMove', 'Obrana', 'Defence'],
      ['quietMove', 'Tiché tahy', 'Quiet moves'],
      ['mateIn2', 'Matová síť', 'Mating net'],
    ]) {
      const b = document.createElement('button');
      b.className = 'quiet-button';
      b.textContent = t(cs, en);
      b.onclick = () =>
        document.dispatchEvent(new CustomEvent('evala:train-theme', { detail: theme }));
      root.append(b);
    }
  }
  function renderRepertoire() {
    const root = $('#opening-repertoire'),
      rows = openingRepertoire(context.library(), context.username());
    root.innerHTML = rows.length
      ? ''
      : `<p>${t('Přibude po importu tvých partií.', 'Import your games to build this list.')}</p>`;
    rows.forEach((row) => {
      const b = document.createElement('button');
      b.className = 'repertoire-row';
      b.innerHTML = `<strong>${esc(
        lineToSan(
          row.game.initialFen,
          row.game.moves.slice(0, row.ply).map((m) => m.uci),
          20,
        ) || t('Výchozí pozice', 'Starting position'),
      )}</strong><span>${row.count}× · ${esc(
        Object.entries(row.moves)
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => `${m} (${n})`)
          .join(', '),
      )}</span><small>${t('Odpovědi soupeřů', 'Opponent replies')}: ${esc(
        Object.entries(row.replies)
          .sort((a, b) => b[1] - a[1])
          .map(([m, n]) => `${m} (${n})`)
          .join(', '),
      )}</small>`;
      b.onclick = () => {
        context.openGame(row.game, row.ply);
      };
      root.append(b);
    });
  }
  function renderEvidence() {
    const root = $('#weakness-evidence'),
      groups = weaknessEvidence(context.library(), context.username());
    root.innerHTML = `<h2>${t('Vracejí se stejné chyby?', 'Are the same mistakes recurring?')}</h2><p class="hint">${t('Posledních 10 rozebraných partií proti předchozím 10, odděleně podle tempa. Počet chyb na 100 tahů není důkaz zlepšení; soupeři i pozice se mění.', 'Last 10 analysed games versus the previous 10, separated by time control. Errors per 100 moves do not prove improvement; opponents and positions differ.')}</p>`;
    if (!groups.length)
      root.insertAdjacentHTML(
        'beforeend',
        `<p>${t('Nejdřív rozeber vlastní partie.', 'Analyse your own games first.')}</p>`,
      );
    const attempts = context
      .library()
      .flatMap((game) => (game.learning?.attempts || []).map((a) => ({ ...a, game })))
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);
    if (attempts.length) {
      const h = document.createElement('h3');
      h.textContent = t('Poslední tréninky', 'Recent practice');
      root.append(h);
      for (const a of attempts) {
        const button = document.createElement('button');
        button.className = 'repertoire-row';
        button.textContent = `${new Date(a.at).toLocaleDateString(language() === 'en' ? 'en-GB' : 'cs-CZ')} · ${{ mixed: t('smíšené pozice', 'mixed positions'), defense: t('obrana', 'defence'), conversion: t('výhoda', 'conversion'), opening: t('zahájení', 'opening') }[a.mode]} · ${a.steps} ${t('tahů', 'moves')} · ${a.result === 'success' ? t('cíl splněn', 'target met') : t('k opakování', 'revisit')} · ${t('ztráta', 'loss')} ${(a.loss / 100).toFixed(2)}`;
        button.onclick = () => context.openGame(a.game, a.ply);
        root.append(button);
      }
    }
    for (const g of groups) {
      const section = document.createElement('section');
      section.innerHTML = `<h3>${esc(g.speed)} · ${g.recentGames} / ${g.priorGames} ${t('partií', 'games')}</h3>`;
      for (const [phase, b] of Object.entries(g.recent)) {
        const prev = g.prior[phase],
          label = {
            opening: ['Zahájení', 'Opening'],
            middlegame: ['Střední hra', 'Middlegame'],
            endgame: ['Koncovka', 'Endgame'],
          }[phase],
          row = document.createElement('div');
        row.className = 'evidence-row';
        row.innerHTML = `<strong>${t(...label)}</strong><span>${b.errors}/${b.moves} · ${((100 * b.errors) / b.moves).toFixed(1)}/100</span><small>${prev && g.priorGames >= 5 && g.recentGames >= 5 && prev.moves >= 30 && b.moves >= 30 ? `${t('Dříve', 'Previously')}: ${((100 * prev.errors) / prev.moves).toFixed(1)}/100` : t('Málo dat pro porovnání', 'Not enough data to compare')}</small>`;
        for (const ex of b.examples) {
          const button = document.createElement('button');
          button.className = 'text-button';
          button.textContent = `${ex.game.headers.Date?.includes('?') ? '' : ex.game.headers.Date || ''} · ${ex.game.moves[ex.ply - 1].san} →`;
          button.onclick = () => context.openGame(ex.game, ex.ply);
          row.append(button);
        }
        section.append(row);
      }
      root.append(section);
    }
  }
  let practiceBoard;
  async function startDrill() {
    if (mode === 'families') {
      status(t('Vyber motiv napravo.', 'Choose a motif on the right.'));
      return;
    }
    if (context.busy())
      throw Error(t('Nejprve pozastav rozbor partie.', 'Pause the game analysis first.'));
    cancel();
    let pool = practicePositions(context.library(), context.username(), mode).filter(
      (p) => !seen.has(p.game.id + ':' + p.ply + ':' + mode),
    );
    if (!pool.length) {
      seen.clear();
      pool = practicePositions(context.library(), context.username(), mode);
    }
    if (mode === 'mixed') {
      const preferred = pool.filter((p) => p.quiet !== lastQuiet);
      if (preferred.length) pool = preferred;
    }
    const p = pool[Math.floor(Math.random() * pool.length)];
    if (!p) {
      status(
        t(
          'V knihovně zatím není vhodná pozice s rozborem do hloubky alespoň 14. Nastav přezdívku v Nastavení a rozeber další partie.',
          'No suitable position with analysis depth 14 or higher. Set your chess username in Settings and analyse more games.',
        ),
      );
      return;
    }
    seen.add(p.game.id + ':' + p.ply + ':' + mode);
    lastQuiet = p.quiet;
    controller = new AbortController();
    busy = true;
    drill = {
      ...p,
      mode,
      chess: new Chess(p.fen),
      fens: [p.fen],
      played: [],
      index: 0,
      steps: 0,
      loss: 0,
      finished: false,
    };
    practiceBoard = new StudyBoard($('#practice-board'), {
      onMove: (m) => {
        if (busy || !drill || drill.finished) return;
        if (m.promotions.length) {
          drill.promotion = m;
          $('#practice-promotion').hidden = false;
          return;
        }
        safely(() => play(m.from + m.to));
      },
    });
    $('#practice-promotion').onclick = (e) => {
      if (e.target.dataset.promote && drill?.promotion) {
        const m = drill.promotion;
        drill.promotion = null;
        $('#practice-promotion').hidden = true;
        safely(() => play(m.from + m.to + e.target.dataset.promote));
      }
    };
    $('#practice-context').innerHTML =
      `<h2>${t('Tvůj tah', 'Your move')} · ${p.color === 'w' ? t('bílý', 'White') : t('černý', 'Black')}</h2><p>${mode === 'conversion' ? t('Zahraj až 8 vlastních tahů proti enginu. Cílem je zachovat výhodu; nejde o potvrzení vyhrané partie.', 'Play up to 8 of your moves against the engine. Preserve your advantage; this does not certify a won game.') : mode === 'defense' ? t('Najdi obranu a udrž pozici až 8 vlastních tahů. Výsledek je tréninkový, nikoli důkaz remízy.', 'Find a defence and hold for up to 8 of your moves. This exercise does not prove a draw.') : t('Najdi užitečný tah. Pozice nemusí obsahovat vítěznou kombinaci.', 'Find a useful move. There may be no winning combination.')}</p><p>${t('Plán a vlastní výpočet před kontrolou', 'Your plan and calculation before checking')}</p><textarea id="drill-thought" maxlength="800" rows="3" aria-label="${t('Můj výpočet', 'My calculation')}"></textarea><p class="hint">${mode === 'opening' ? t('Ve vlastní partii můžeš k této pozici uložit plán. Tady se hodnotí engine, nikoli četnost hraných tahů.', 'Save a plan for this position in the original game. This exercise grades with the engine, not move popularity.') : ''}</p>`;
    $('#practice-result').replaceChildren();
    $('#practice-playback').hidden = true;
    status(t('Připravuji pozici…', 'Preparing position…'));
    paint();
    const d = drill,
      signal = controller.signal;
    d.baseline = await context.search(d.fen, signal);
    if (signal.aborted || d !== drill) return;
    busy = false;
    status(t('Zahraj tah na šachovnici.', 'Play a move on the board.'));
    paint();
  }
  async function play(move) {
    const d = drill;
    if (!d || busy || d.finished) return;
    if (context.busy())
      throw Error(t('Nejprve pozastav rozbor partie.', 'Pause the game analysis first.'));
    controller = new AbortController();
    const signal = controller.signal;
    busy = true;
    paint();
    status(t('Ověřuji odpověď…', 'Checking the reply…'));
    const chess = new Chess(d.chess.fen()),
      m = chess.move(uci(move));
    const before = d.baseline || (await context.search(d.chess.fen(), signal)),
      after = await context.search(chess.fen(), signal);
    if (signal.aborted || drill !== d) return;
    if ((!before.terminal && before.depth < 14) || (!after.terminal && after.depth < 14)) {
      status(
        t(
          'Výpočet nedosáhl hloubky 14. Tah nehodnotíme, zkus jej znovu.',
          'Search did not reach depth 14. No grade was recorded; try again.',
        ),
      );
      return;
    }
    const loss = Math.max(0, ownScore(before, d.color) - ownScore(after, d.color));
    d.loss += loss;
    d.steps++;
    d.played.push(move);
    d.fens.push(chess.fen());
    const reply = after.lines?.[0]?.pv?.[0];
    if (reply && !chess.isGameOver()) {
      chess.move(uci(reply));
      d.played.push(reply);
      d.fens.push(chess.fen());
    }
    d.chess = chess;
    d.index = d.fens.length - 1;
    d.baseline = null;
    const value = ownScore(after, d.color),
      multi = ['conversion', 'defense'].includes(d.mode);
    const targetLost =
      d.mode === 'conversion' ? value < 150 : d.mode === 'defense' ? value < -200 : false;
    d.finished = !multi || chess.isGameOver() || d.steps >= 8 || targetLost;
    $('#practice-result').innerHTML =
      `<h3>${esc(m.san)} · ${esc(scoreText(after))} · d${after.depth}</h3><p>${t('Ztráta proti doporučení', 'Loss against the recommendation')}: ${(loss / 100).toFixed(2)} · ${d.steps}/${multi ? 8 : 1}</p><p>${t('Doporučená varianta', 'Recommended continuation')}: ${esc(lineToSan(d.fens[d.fens.length - (reply ? 3 : 2)], before.lines?.[0]?.pv || [], 6))}</p><p>${t('Odpověď soupeře', 'Opponent reply')}: ${esc(lineToSan(chess.fen(), after.lines?.[0]?.pv?.slice(1) || [], 4))}</p>`;
    // Display the actual searched reply from the position after the player's move.
    $('#practice-result').lastElementChild.textContent =
      t('Varianta po tvém tahu: ', 'Line after your move: ') +
      lineToSan(d.fens[d.fens.length - (reply ? 2 : 1)], after.lines?.[0]?.pv || [], 6);
    if (d.finished) {
      const success = multi
        ? !targetLost && !(chess.isCheckmate() && chess.turn() === d.color) && d.loss <= 120
        : loss <= 40;
      const data = learning(d.game),
        thought = $('#drill-thought').value.trim();
      if (thought) {
        const old = data.notes[d.ply] || {};
        data.notes[d.ply] = {
          ...old,
          text: [old.text, thought].filter(Boolean).join('\n').slice(0, 1200),
        };
      }
      data.attempts.push({
        mode: d.mode,
        ply: d.ply,
        at: Date.now(),
        loss: d.loss,
        steps: d.steps,
        result: success ? 'success' : 'practice',
      });
      d.game.learning = cleanLearning(data, d.game.moves);
      await context.save(d.game);
      status(
        success
          ? t(
              'Trénink dokončen. Projdi si varianty a zkus další pozici.',
              'Exercise complete. Review the lines and try another position.',
            )
          : t(
              'Trénink uložen. Vrať se k rozhodnutí a porovnej varianty.',
              'Practice recorded. Revisit the decision and compare the lines.',
            ),
      );
      $('#practice-playback').hidden = false;
      $('#practice-back').onclick = () => {
        d.index = Math.max(0, d.index - 1);
        paint();
      };
      $('#practice-forward').onclick = () => {
        d.index = Math.min(d.fens.length - 1, d.index + 1);
        paint();
      };
      $('#practice-reset').onclick = () => {
        cancel();
        d.chess = new Chess(d.fen);
        d.fens = [d.fen];
        d.played = [];
        d.steps = 0;
        d.loss = 0;
        d.index = 0;
        d.finished = false;
        d.baseline = null;
        $('#practice-playback').hidden = true;
        status(t('Zkus pozici znovu.', 'Try the position again.'));
        paint();
      };
      const open = document.createElement('button');
      open.className = 'text-button';
      open.textContent = t('Otevřít původní partii', 'Open the original game');
      open.onclick = () => context.openGame(d.game, d.ply);
      $('#practice-result').append(open);
      renderEvidence();
    } else
      status(
        t('Engine odpověděl. Pokračuj ve svém plánu.', 'The engine replied. Continue your plan.'),
      );
  }
  function paint() {
    if (!drill || !practiceBoard) return;
    practiceBoard.interactive = !busy && !drill.finished;
    practiceBoard.set(drill.fens[drill.index], {
      flipped: drill.color === 'b',
      lastMove: drill.index ? uci(drill.played[drill.index - 1]) : null,
    });
    $('#practice-line').textContent = lineToSan(drill.fen, drill.played.slice(0, drill.index), 40);
  }
  document.addEventListener('evala:page', (e) => {
    if (e.detail === 'practice') renderWorkshop();
    else cancel();
  });
  document.addEventListener('evala:identity', () => {
    cancel();
    seen.clear();
    drill = null;
    noteKey = '';
    comparison = false;
    $('#practice-root').replaceChildren();
  });
  document.addEventListener('evala:library', () => {
    if (document.body.dataset.page === 'practice') renderWorkshop();
  });
  document.addEventListener('evala:language', () => {
    noteKey = '';
    refresh();
    if (document.body.dataset.page === 'practice') renderWorkshop();
  });
  window.addEventListener('pagehide', cancel);
  refresh();
  return { refresh };
}
