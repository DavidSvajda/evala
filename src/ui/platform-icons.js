const paths = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  games: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  analysis: 'M4 20V4m0 16h17M7 15l4-5 4 2 5-7',
  puzzle: 'M9 3h6v4a3 3 0 1 1 4 4h2v10h-7v-3a3 3 0 1 0-6 0v3H3v-7h3a3 3 0 1 0 0-6H3V3h6',
  chart: 'M4 20h16M7 16V9m5 7V4m5 12v-5',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  chevron: 'm9 5 7 7-7 7',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  cloud: 'M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10M12 21V11m-3 3 3-3 3 3',
  repeat: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  flip: 'M5 7h13l-4-4M19 17H6l4 4M18 7l-4 4M6 17l4-4',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  book: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.puzzle}"/></svg>`;
}
export function initializeIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
}
