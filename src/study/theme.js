export const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
export function setTheme(value) {
  const next = value === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('evala-theme', next);
  } catch {
    /* The current tab still works. */
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'dark' ? '#1b211d' : '#f4f3ec');
  const toggle = document.querySelector('#toggle-theme');
  if (toggle) toggle.setAttribute('aria-pressed', String(next === 'dark'));
}
