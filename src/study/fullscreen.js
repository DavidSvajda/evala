import { icons } from '../ui/icons.js';
import { translate } from './i18n.js';

export function initializeFullscreen(onError) {
  const buttons = [...document.querySelectorAll('[id^="fullscreen-"]')];
  const supported = !!document.fullscreenEnabled;
  let pending = false;
  function render() {
    const active = !!document.fullscreenElement;
    for (const button of buttons) {
      button.hidden = !supported;
      button.disabled = pending;
      button.innerHTML = active ? icons.fullscreenExit : icons.fullscreen;
      button.title = translate(active ? 'Ukončit celou obrazovku' : 'Celá obrazovka');
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      render();
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        onError(translate('Prohlížeč nepovolil celou obrazovku. Zkus to znovu tlačítkem.'));
      } finally {
        pending = false;
        render();
      }
    });
  }
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('evala:language', render);
  render();
}
