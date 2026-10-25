import { readSettings, writeSettings } from './core/settings.js';
import { scoreText, evaluationLabel, whitePercent } from './core/evaluation.js';
import { bindSettings, settingsMarkup } from './ui/settings-form.js';
import { icons, brand } from './ui/icons.js';

let settings = await readSettings();
document.querySelector('.brand-mark').innerHTML = brand;
document.querySelector('.arrow').innerHTML = icons.arrow;
const root = document.querySelector('#settings');
root.innerHTML = settingsMarkup(settings);
const form = bindSettings(root, settings, async (next) => {
  settings = next;
  await writeSettings(settings);
  refresh();
});
const power = document.querySelector('.power');
function renderPower() {
  document.querySelector('.local-tag').textContent =
    settings.backend === 'server' ? 'SERVER' : 'LOKÁLNĚ';
  power.innerHTML = settings.enabled ? icons.pause : icons.play;
  power.setAttribute('aria-label', settings.enabled ? 'Pozastavit engine' : 'Spustit engine');
  power.title = settings.enabled ? 'Pozastavit engine' : 'Spustit engine';
}
power.addEventListener('click', async () => {
  settings.enabled = !settings.enabled;
  await writeSettings(settings);
  renderPower();
  refresh();
});
document.querySelector('.demo-link:not(.study-link)').addEventListener('click', () => {
  if (globalThis.chrome?.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
  else location.href = 'demo.html';
});
const studyLink = document.querySelector('.study-link');
if (studyLink) {
  studyLink.querySelector('.study-arrow').innerHTML = icons.arrow;
  studyLink.addEventListener('click', () => {
    if (globalThis.chrome?.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('study.html') });
    else location.href = 'study.html';
  });
}
async function refresh() {
  renderPower();
  let status = null;
  try {
    if (globalThis.chrome?.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) status = await chrome.tabs.sendMessage(tab.id, { type: 'evala-status' });
    }
  } catch {
    /* An unsupported tab has no content script. */
  }
  const hasBoard = !!status?.board;
  document.querySelector('.connection').dataset.connected = String(hasBoard);
  document.querySelector('#connection-text').textContent = !settings.enabled
    ? 'Výpočet pozastaven'
    : hasBoard
      ? `Připojeno · ${status.site.includes('chess.com') ? 'Chess.com' : status.site.includes('lichess') ? 'Lichess' : 'zkušební deska'}`
      : 'Čekám na šachovnici';
  document.querySelector('.summary-score').textContent = scoreText(status?.score);
  document.querySelector('.summary-label').textContent = status?.score
    ? evaluationLabel(status.score)
    : hasBoard
      ? status.state === 'waiting'
        ? 'Čekám na úplnou pozici'
        : settings.enabled
          ? 'Připravuji rozbor…'
          : 'Výpočet pozastaven'
      : 'Otevři Chess.com nebo Lichess';
  document.querySelector('.summary-detail').textContent = status?.score
    ? `Hloubka ${status.score.depth} · skóre z pohledu bílého`
    : 'Bar se zobrazí vedle viditelné šachovnice.';
  document.querySelector('.mini-white').style.height = `${whitePercent(status?.score)}%`;
}
globalThis.chrome?.storage?.onChanged.addListener(async (changes) => {
  if (changes.settings) {
    settings = await readSettings();
    form.sync(settings);
    renderPower();
  }
});
refresh();
setInterval(refresh, 1000);
