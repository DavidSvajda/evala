// Apply the last explicit choice before styles paint; parchment stays the default.
try {
  const theme = localStorage.getItem('evala-theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1b211d' : '#f4f3ec');
} catch {
  document.documentElement.dataset.theme = 'light';
}
