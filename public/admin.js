const $ = (selector) => document.querySelector(selector);
const status = $('#admin-status');
const reload = $('#reload-admin');
const previous = $('#admin-previous');
const next = $('#admin-next');
const users = $('#admin-users');
const data = $('#admin-data');
const number = new Intl.NumberFormat('cs-CZ');
const date = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
const timestamp = (ms) => (Number.isFinite(ms) && ms > 0 ? date.format(ms) : '—');
let currentPage = 1;
let activeRequest;
let expires;

function cell(row, value) {
  const td = row.insertCell();
  td.textContent = String(value ?? '—');
  return td;
}

function renderUsers(accounts) {
  users.replaceChildren();
  for (const user of accounts) {
    const row = users.insertRow();
    const identity = cell(row, user.name);
    const email = document.createElement('span');
    email.className = 'admin-email';
    email.textContent = user.email;
    identity.append(email);
    for (const value of [user.createdAt, user.lastLoginAt, user.lastUsedAt])
      cell(row, timestamp(value));
    cell(row, number.format(user.reviews));
    cell(row, number.format(user.attempts));
  }
  if (!accounts.length) cell(users.insertRow(), 'Na této stránce nejsou žádné účty.').colSpan = 6;
}

function renderTraffic(days) {
  const chart = $('#admin-traffic-chart');
  const table = $('#admin-days');
  chart.replaceChildren();
  table.replaceChildren();
  const max = Math.max(1, ...days.map((d) => d.loads));
  const sum = days.reduce((total, day) => total + day.loads, 0);
  $('#admin-traffic-summary').textContent =
    `${number.format(sum)} načtení včetně obnovení stránky a robotů. Nejde o unikátní návštěvníky.`;
  for (const [i, day] of days.entries()) {
    const row = table.insertRow();
    cell(row, day.date);
    cell(row, number.format(day.loads));
    const bar = document.createElementNS(chart.namespaceURI, 'rect');
    const height = day.loads ? Math.max(2, (98 * day.loads) / max) : 1;
    for (const [name, value] of Object.entries({
      x: i * 20 + 2,
      y: 100 - height,
      width: 15,
      height,
      rx: 2,
    }))
      bar.setAttribute(name, String(value));
    const tooltip = document.createElementNS(chart.namespaceURI, 'title');
    tooltip.textContent = `${day.date} · ${number.format(day.loads)}`;
    bar.append(tooltip);
    chart.append(bar);
  }
}

function clearPrivateData() {
  clearTimeout(expires);
  data.hidden = true;
  users.replaceChildren();
  activeRequest?.abort();
  activeRequest = undefined;
}

async function load(page = 1) {
  clearPrivateData();
  const request = new AbortController();
  activeRequest = request;
  const timeout = setTimeout(() => request.abort(), 15_000);
  reload.disabled = true;
  status.textContent = 'Načítání…';
  try {
    const response = await fetch(`/api/admin/overview?page=${page}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: request.signal,
    });
    const result = await response.json();
    if (activeRequest !== request || document.hidden) return;
    if (!response.ok) throw new Error(result.error || 'Přehled není dostupný.');
    const { totals } = result;
    $('#count-accounts').textContent = number.format(totals.accounts);
    $('#count-new').textContent = number.format(totals.newThisWeek);
    $('#count-active').textContent = number.format(totals.activeThisWeek);
    $('#count-reviews').textContent = number.format(totals.reviews);
    renderUsers(result.users);
    if (result.days) renderTraffic(result.days);
    currentPage = result.page;
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage * result.pageSize >= totals.accounts;
    const start = result.users.length ? (currentPage - 1) * result.pageSize + 1 : 0;
    $('#admin-page-range').textContent = start
      ? `${number.format(start)}–${number.format(start + result.users.length - 1)} z ${number.format(totals.accounts)}`
      : '0 účtů na stránce';
    data.hidden = false;
    expires = setTimeout(() => {
      clearPrivateData();
      status.textContent = 'Ověření správce vypršelo. Přihlas se znovu přes Můj účet.';
    }, result.validForMs);
    status.textContent = result.truncated
      ? 'Přehled obsahuje část účtů kvůli limitu úložiště.'
      : `Načteno ${timestamp(result.generatedAt)}`;
  } catch (error) {
    if (activeRequest === request)
      status.textContent =
        error.name === 'AbortError' ? 'Načítání vypršelo. Zkus přehled obnovit.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (activeRequest === request) {
      reload.disabled = false;
      activeRequest = undefined;
    }
  }
}

reload.onclick = () => void load();
previous.onclick = () => void load(currentPage - 1);
next.onclick = () => void load(currentPage + 1);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearPrivateData();
  else void load();
});
window.addEventListener('pagehide', clearPrivateData);
window.addEventListener('pageshow', () => void load());
