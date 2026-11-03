const status = document.querySelector('#admin-status');
const button = document.querySelector('#reload-admin');
const date = (value) => (value ? new Date(value).toLocaleString('cs-CZ') : '—');
function rows(selector, values) {
  const fragment = document.createDocumentFragment();
  for (const cells of values) {
    const row = document.createElement('tr');
    for (const value of cells) {
      const cell = document.createElement('td');
      cell.textContent = String(value ?? '—');
      row.append(cell);
    }
    fragment.append(row);
  }
  document.querySelector(selector).replaceChildren(fragment);
}
async function load() {
  button.disabled = true;
  document.querySelector('#admin-data').hidden = true;
  status.textContent = 'Načítání…';
  try {
    const response = await fetch('/api/admin/overview', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Přehled není dostupný.');
    rows(
      '#admin-users',
      data.users.map((u) => [u.name, u.email, date(u.createdAt), date(u.lastLoginAt)]),
    );
    rows(
      '#admin-days',
      data.days.map((d) => [d.date, d.loads]),
    );
    document.querySelector('#user-count').textContent = `(${data.users.length})`;
    document.querySelector('#admin-data').hidden = false;
    status.textContent = data.truncated
      ? 'Přehled je částečný. Byl dosažen limit čtení úložiště.'
      : 'Aktualizováno ' + date(data.generatedAt);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
button.onclick = load;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelector('#admin-data').hidden = true;
});
window.addEventListener('pageshow', () => void load());
