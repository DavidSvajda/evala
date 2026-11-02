import { EN, patterns } from './locale-en.js';

function initialLanguage() {
  const explicit = new URLSearchParams(location.search).get('lang');
  if (['en', 'cs'].includes(explicit)) return explicit;
  try {
    const saved = localStorage.getItem('evala-language');
    if (['en', 'cs'].includes(saved)) return saved;
  } catch {
    /* Storage can be unavailable. */
  }
  return 'en';
}
let selected = initialLanguage();
const originals = new WeakMap(),
  attributes = new WeakMap();
const canonicalSources = new Map();
const ignored = (node) =>
  node.parentElement?.closest(
    '[data-i18n-ignore],script,style,code,textarea,.summary-name,.recent-players strong,.analytics-overview h2,.account-profile h2,.account-profile p,#game-title,.player-name,.line-san,.move-san,.notation-eval',
  );
export const language = () => selected;
export function translate(value) {
  if (selected !== 'en' || typeof value !== 'string') return value;
  const source = value.trim();
  if (!source) return value;
  // HTML formatters wrap long paragraphs. Whitespace must not break an exact
  // translation while the original text remains available when switching back.
  let result = EN[source] ?? EN[source.replace(/\s+/g, ' ')];
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
  if (result !== undefined && result !== source) {
    if (canonicalSources.size > 3000) canonicalSources.clear();
    canonicalSources.set(result, source);
  }
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
  const source =
    previous && current === previous.rendered
      ? previous.source
      : canonicalSources.get(current) || current;
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
    const source =
        saved[key]?.rendered === current
          ? saved[key].source
          : canonicalSources.get(current) || current,
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
  try {
    localStorage.setItem('evala-language', next);
  } catch {
    /* Keep the current tab usable. */
  }
  if (changed) {
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    if (url.href !== location.href) history.replaceState(null, '', url);
  }
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
