export const MOVE_KINDS = [
  ['brilliant', 'Brilantní'],
  ['great', 'Skvělé'],
  ['best', 'Nejlepší'],
  ['excellent', 'Výborné'],
  ['good', 'Dobré'],
  ['inaccuracy', 'Nepřesnosti'],
  ['mistake', 'Chyby'],
  ['blunder', 'Hrubé chyby'],
  ['miss', 'Promarněné šance'],
  ['sacrifice', 'Zajímavé oběti'],
];
const shapes = {
  brilliant: '<path d="m8 3 5 7-5 7-5-7 5-7Zm9 5 4 6-4 7-4-7 4-6Z"/>',
  great: '<path d="M12 4v10"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
  best: '<path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z"/>',
  excellent: '<path d="m2 12 4 4 8-9m-3 8 3 3 8-10"/>',
  good: '<path d="m5 12 4 4L19 6"/>',
  inaccuracy:
    '<path d="M8 8a4 4 0 1 1 6 3.5c-1.5.9-2 1.5-2 3"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
  mistake:
    '<path d="m12 3 10 18H2L12 3Zm0 6v5"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  blunder: '<path d="m7 3-4 4v10l4 4h10l4-4V7l-4-4H7Zm1 5 8 8m0-8-8 8"/>',
  miss: '<circle cx="12" cy="12" r="8"/><path d="m3 3 7 7m-1-6 1 6-6-1m8 6 5 5"/>',
  sacrifice: '<path d="m12 3 8 9-8 9-8-9 8-9Zm-8 9h16M12 3l-3 9 3 9 3-9-3-9Z"/>',
};
export function moveIcon(kind) {
  return `<span class="move-emblem ${shapes[kind] ? kind : 'good'}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${shapes[kind] || shapes.good}</svg></span>`;
}
