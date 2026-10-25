import { account, accountRequest, googleButton, logoutAccount } from './account.js';
import { migrateGuestGames, lastSyncStatus, clearAccountCache } from './storage.js';
import { icon } from '../ui/platform-icons.js';
import { escapeHtml as esc } from '../ui/dom.js';
const $ = (s) => document.querySelector(s);
export function createAccountPanel({
  context,
  getTraining,
  prefKey,
  trainingKey,
  renderHome,
  toast,
}) {
  function renderIdentity() {
    if (account.user) $('#sidebar-user').setAttribute('data-i18n-ignore', '');
    else $('#sidebar-user').removeAttribute('data-i18n-ignore');
    $('#sync-status').textContent = account.user
      ? lastSyncStatus.message || 'Účet připojen'
      : 'Jen v prohlížeči';
    $('#sync-status').classList.toggle('sync-error', !!account.user && lastSyncStatus.error);
    $('#sidebar-user').textContent = account.user?.name || 'Host';
    $('#sidebar-storage').textContent = account.user ? 'Osobní účet' : 'Uloženo v prohlížeči';
    $('#sidebar-avatar').removeAttribute('data-icon');
    $('#sidebar-avatar').innerHTML = account.user
      ? esc(account.user.name.slice(0, 1).toUpperCase())
      : icon('user');
    $('#header-signin').textContent = account.user ? 'Můj účet' : 'Přihlásit se';
    $('.storage-note').textContent = account.user
      ? 'Partie jsou uložené u tvého účtu.'
      : 'Uloženo v tomto prohlížeči.';
    $('#sync-library').hidden = !account.user;
  }
  async function renderAccount() {
    const root = $('#account-content');
    $('#account-error').textContent = '';
    if (!account.user) {
      root.innerHTML = `<div class="account-signin"><span class="account-symbol">${icon('user')}</span><h2>Přihlásit se</h2><p>Google potvrdí tvoji identitu. Evala nedostane tvoje heslo.</p><div id="google-signin"></div><p id="google-signin-status" class="inline-status" role="status"></p><hr><h3>Co se uloží k účtu</h3><ul><li>Importované partie, rozbory a poznámky</li><li>Výsledky úloh a plán opakování</li><li>Vzhled šachovnice a šachová přezdívka</li></ul><a href="#/games">Pokračovat bez přihlášení</a></div>`;
      if (account.config?.enabled && account.config.googleClientId)
        await googleButton(
          $('#google-signin'),
          (message) => ($('#account-error').textContent = message),
        );
      else
        $('#google-signin-status').textContent =
          'Přihlášení přes Google na tomto serveru zatím není dostupné. Knihovnu i trénink můžeš používat bez účtu.';
      return;
    }
    root.innerHTML = `<section class="account-profile"><span class="profile-avatar">${esc(account.user.name.slice(0, 1))}</span><div><h2>${esc(account.user.name)}</h2><p>${esc(account.user.email)}</p><span class="provider-label">Účet Google</span></div><button id="logout-account" class="quiet-button">Odhlásit se</button></section><section class="account-library"><h2>Knihovna účtu</h2><p>${context.library().length} uložených partií. Rozbory a nastavení se načtou po přihlášení i na jiném zařízení.</p><div class="account-actions"><button id="import-guest-games" class="quiet-button">Převzít místní partie</button><button id="export-account" class="quiet-button">Exportovat moje data</button></div><p class="hint">Místní partie patří k režimu hosta v tomto prohlížeči. Do účtu se přenesou až tímto tlačítkem.</p></section><details class="danger-zone"><summary>Smazat účet a jeho data</summary><p>Účet a aktivní data se smažou. Obnovovací kopie zůstanou nejvýše 7 dní. Pro potvrzení napiš SMAZAT.</p><form id="delete-account-form"><input aria-label="Potvrzení smazání účtu" pattern="SMAZAT" required autocomplete="off"><button type="submit" class="quiet-button">Smazat účet</button></form></details>`;
    $('#logout-account').onclick = async () => {
      try {
        if (context.busy()) throw new Error('Nejprve pozastav probíhající rozbor.');
        await logoutAccount();
      } catch (e) {
        $('#account-error').textContent = e.message;
      }
    };
    $('#import-guest-games').onclick = async (event) => {
      event.target.disabled = true;
      try {
        const count = await migrateGuestGames();
        await context.reload();
        renderHome();
        renderAccount();
        toast(`Přeneseno ${count} partií.`);
      } catch (e) {
        $('#account-error').textContent = e.message;
      } finally {
        event.target.disabled = false;
      }
    };
    $('#export-account').onclick = () => {
      const data = {
        user: account.user,
        training: getTraining(),
        games: context
          .library()
          .map(
            ({ _storageOwner, _storageGeneration, _remoteVersion, _syncPending, ...game }) => game,
          ),
      };
      const link = document.createElement('a'),
        url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      link.href = url;
      link.download = 'evala-moje-data.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#delete-account-form').onsubmit = async (event) => {
      event.preventDefault();
      if (event.target.querySelector('input').value !== 'SMAZAT') return;
      try {
        if (context.busy()) throw new Error('Nejprve pozastav probíhající rozbor.');
        await accountRequest('delete', { method: 'POST', body: {} });
        await clearAccountCache();
        localStorage.removeItem(prefKey());
        localStorage.removeItem(trainingKey());
        Object.assign(account, { user: null, csrf: '', training: null });
        document.dispatchEvent(new CustomEvent('evala:identity', { detail: null }));
      } catch (e) {
        $('#account-error').textContent = e.message;
      }
    };
  }

  return { renderIdentity, renderAccount };
}
