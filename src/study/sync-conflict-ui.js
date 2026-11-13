import { language } from './i18n.js';
import { escapeHtml as esc } from '../ui/dom.js';
const t = (cs, en) => (language() === 'en' ? en : cs);

export function showGameConflict(game, backup) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sync-conflict-dialog';
  dialog.setAttribute('aria-labelledby', 'sync-conflict-title');
  dialog.innerHTML = `<h2 id="sync-conflict-title">${esc(t('Dvě verze partie', 'Two versions of this game'))}</h2>
    <p>${esc(t('Změny z tohoto zařízení a z účtu se liší. Stáhni si obě verze nebo vyber, se kterou pokračovat. Při výběru zůstane záloha obou verzí v tomto prohlížeči.', 'This device and your account have different changes. Download both versions or choose which to use. Choosing a version keeps a backup of both in this browser.'))}</p>
    <div class="sync-conflict-versions"></div><div class="sync-conflict-actions"></div>`;
  const versions = dialog.querySelector('.sync-conflict-versions');
  for (const [label, value] of [
    [t('Toto zařízení', 'This device'), backup.local],
    [t('Účet', 'Account'), backup.remote],
  ]) {
    const section = document.createElement('section'),
      heading = document.createElement('h3'),
      notes = document.createElement('p');
    heading.textContent = label;
    notes.textContent = value.notes || t('Bez poznámek', 'No notes');
    section.append(heading, notes);
    const counts = document.createElement('p');
    const positions = value.analysis?.positions?.filter(Boolean).length || 0;
    const positionNotes = Object.entries(value.learning?.notes || {});
    counts.textContent =
      language() === 'en'
        ? `${positions} analysed positions · ${positionNotes.length} position notes`
        : `${positions} vyhodnocených pozic · ${positionNotes.length} poznámek k pozicím`;
    section.append(counts);
    for (const [ply, note] of positionNotes.slice(0, 3)) {
      const preview = document.createElement('p');
      preview.textContent = `${Number(ply) + 1}: ${(note.text || note.plan || '').slice(0, 300)}`;
      section.append(preview);
    }
    versions.append(section);
  }
  const actions = dialog.querySelector('.sync-conflict-actions');
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'quiet-button';
  download.textContent = t('Stáhnout obě verze (JSON)', 'Download both versions (JSON)');
  download.onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = `evala-${game.id}-versions.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  actions.append(download);
  return new Promise((resolve) => {
    for (const [choice, label] of [
      ...(game._syncConflict
        ? [
            ['local', t('Použít toto zařízení', 'Use this device')],
            ['remote', t('Použít verzi z účtu', 'Use account version')],
          ]
        : []),
      ['cancel', t('Zavřít', 'Close')],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet-button';
      button.textContent = label;
      button.onclick = () => dialog.close(choice);
      actions.append(button);
    }
    dialog.addEventListener(
      'close',
      () => {
        document.removeEventListener('evala:identity', closeForIdentity);
        const choice = dialog.returnValue;
        dialog.remove();
        resolve(['local', 'remote'].includes(choice) ? choice : null);
      },
      { once: true },
    );
    const closeForIdentity = () => dialog.close('cancel');
    document.addEventListener('evala:identity', closeForIdentity);
    document.body.append(dialog);
    dialog.showModal();
    download.focus();
  });
}
