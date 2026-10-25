import { EN, patterns } from './locale-en.js';

let selected = localStorage.getItem('evala-language') === 'en' ? 'en' : 'cs';
const originals = new WeakMap(),
  attributes = new WeakMap();
const ignored = (node) =>
  node.parentElement?.closest(
    '[data-i18n-ignore],script,style,code,textarea,.summary-name,.recent-players strong,.analytics-overview h2,.account-profile h2,.account-profile p,#game-title,.player-name,.line-san,.move-san,.notation-eval',
  );
export const language = () => selected;
export function translate(value) {
  if (selected !== 'en' || typeof value !== 'string') return value;
  const source = value.trim();
  if (!source) return value;
  let result = EN[source];
  if (result === undefined) {
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(source)) {
        result = source.replace(pattern, replacement);
        break;
      }
    }
  }
  const compound = result ?? source;
  if (compound.includes(' · '))
    result = compound
      .split(' · ')
      .map(
        (segment) =>
          EN[segment] ??
          patterns.reduce(
            (v, [pattern, replacement]) => (pattern.test(v) ? v.replace(pattern, replacement) : v),
            segment,
          ),
      )
      .join(' · ');
  return result === undefined
    ? value
    : value.slice(0, value.indexOf(source)) +
        result +
        value.slice(value.indexOf(source) + source.length);
}
function text(node) {
  if (ignored(node)) return;
  const previous = originals.get(node),
    current = node.nodeValue;
  const source = previous && current === previous.rendered ? previous.source : current;
  const rendered = translate(source);
  originals.set(node, { source, rendered });
  if (current !== rendered) node.nodeValue = rendered;
}
function attrs(element) {
  if (!element.getAttribute || element.closest('[data-i18n-ignore],script,style,code')) return;
  const saved = attributes.get(element) || {};
  for (const key of ['title', 'placeholder', 'aria-label']) {
    const current = element.getAttribute(key);
    if (current === null) continue;
    const source = saved[key]?.rendered === current ? saved[key].source : current,
      rendered = translate(source);
    saved[key] = { source, rendered };
    if (current !== rendered) element.setAttribute(key, rendered);
  }
  attributes.set(element, saved);
}
function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return text(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  attrs(root);
  root.querySelectorAll('[title],[placeholder],[aria-label]').forEach(attrs);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) text(walker.currentNode);
}
export function setLanguage(value) {
  const next = value === 'en' ? 'en' : 'cs',
    changed = next !== selected;
  selected = next;
  localStorage.setItem('evala-language', next);
  document.documentElement.lang = next;
  walk(document.body);
  if (changed) document.dispatchEvent(new CustomEvent('evala:language', { detail: next }));
}
export function initializeLanguage() {
  setLanguage(selected);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') text(record.target);
      else if (record.type === 'attributes') attrs(record.target);
      else for (const node of record.addedNodes) walk(node);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'placeholder', 'aria-label'],
  });
}
