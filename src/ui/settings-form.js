import { DEFAULTS, sanitizeSettings } from '../core/settings.js';

export function settingsMarkup(settings) {
  return `<div class="settings-form">
    <fieldset class="presets"><legend>Výkon enginu</legend><div class="segmented"><button type="button" data-preset="quiet">Úsporný</button><button type="button" data-preset="balanced">Vyvážený</button><button type="button" data-preset="deep">Důkladný</button></div></fieldset>
    <label class="range-label" for="depth">Maximální hloubka <output id="depth-value">${settings.depth}</output></label>
    <input id="depth" name="depth" type="range" min="6" max="30" value="${settings.depth}">
    <div class="range-captions"><span>Rychlejší odezva</span><span>Hlubší rozbor</span></div>
    <div class="form-row"><label for="time">Čas na pozici</label><select id="time" name="time">${[
      [300, '0,3 s'],
      [750, '0,75 s'],
      [1500, '1,5 s'],
      [3000, '3 s'],
      [10000, '10 s'],
      [30000, '30 s'],
    ]
      .map(([v, t]) => `<option value="${v}">${t}</option>`)
      .join('')}</select></div>
    <div class="form-row"><label for="hash">Paměť enginu</label><select id="hash" name="hash">${[16, 32, 64, 128, 256].map((v) => `<option value="${v}">${v} MB</option>`).join('')}</select></div>
    <p class="hint">Výpočet skončí při dosažení hloubky nebo času. Jedno CPU vlákno · lokální výpočet.</p>
    <div class="section-rule"></div>
    <div class="form-row"><label for="side">Umístění baru</label><select id="side" name="side"><option value="left">Vlevo</option><option value="right">Vpravo</option></select></div>
    <label class="range-label" for="width">Šířka baru <output id="width-value">${settings.width} px</output></label><input id="width" name="width" type="range" min="26" max="48" value="${settings.width}">
    <label class="range-label gap-control" for="gap">Odstup od desky <output id="gap-value">${settings.gap} px</output></label><input id="gap" name="gap" type="range" min="4" max="48" value="${settings.gap}">
    <label class="check-row"><span>Otáčet podle šachovnice</span><input type="checkbox" name="autoFlip" ${settings.autoFlip ? 'checked' : ''}></label>
    <label class="check-row"><span>Zobrazovat dosaženou hloubku</span><input type="checkbox" name="showDepth" ${settings.showDepth ? 'checked' : ''}></label>
    <label class="check-row"><span>Pozastavit na neaktivní kartě</span><input type="checkbox" name="pauseHidden" ${settings.pauseHidden ? 'checked' : ''}></label>
    <button type="button" class="text-button reset">Obnovit výchozí nastavení</button>
  </div>`;
}

export function bindSettings(root, initial, onChange) {
  let settings = sanitizeSettings(initial);
  const presets = {
    quiet: { depth: 12, time: 300, hash: 16 },
    balanced: { depth: 18, time: 1500, hash: 32 },
    deep: { depth: 24, time: 10000, hash: 128 },
  };
  const sync = () => {
    root.querySelectorAll('[name]').forEach((input) => {
      if (input.type === 'checkbox') input.checked = settings[input.name];
      else {
        if (
          input.tagName === 'SELECT' &&
          ![...input.options].some((option) => option.value === String(settings[input.name]))
        ) {
          input.add(
            new Option(
              input.name === 'time' ? `${settings.time / 1000} s` : `${settings.hash} MB`,
              settings[input.name],
            ),
          );
        }
        input.value = settings[input.name];
      }
    });
    for (const key of ['depth', 'width', 'gap'])
      root.querySelector(`#${key}-value`).textContent =
        settings[key] + (key === 'depth' ? '' : ' px');
    root.querySelectorAll('[data-preset]').forEach((button) => {
      const active = Object.entries(presets[button.dataset.preset]).every(
        ([key, value]) => settings[key] === value,
      );
      button.setAttribute('aria-pressed', String(active));
    });
  };
  const commit = () => {
    sync();
    onChange({ ...settings });
  };
  root.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.name) return;
    settings = sanitizeSettings({
      ...settings,
      [input.name]:
        input.type === 'checkbox'
          ? input.checked
          : input.tagName === 'SELECT' && input.name === 'side'
            ? input.value
            : Number(input.value),
    });
    commit();
  });
  root.querySelectorAll('[data-preset]').forEach((button) =>
    button.addEventListener('click', () => {
      settings = { ...settings, ...presets[button.dataset.preset] };
      commit();
    }),
  );
  root.querySelector('.reset').addEventListener('click', () => {
    settings = { ...DEFAULTS, enabled: settings.enabled };
    commit();
  });
  sync();
  return {
    sync: (next) => {
      settings = sanitizeSettings(next);
      sync();
    },
  };
}
