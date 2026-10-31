import theme from './theme.css';
import css from './bar.css';
import { icons } from './icons.js';
import { bindSettings, settingsMarkup } from './settings-form.js';
import { evaluationLabel, scoreText, whitePercent } from '../core/evaluation.js';

export class EvalBar {
  constructor(settings, { onSettings, onToggle, assetUrl }) {
    this.settings = settings;
    this.host = document.createElement('evala-bar');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const fontCss = theme.replaceAll('./fonts/', assetUrl('fonts/'));
    this.shadow.innerHTML = `<style>${fontCss}\n${css}</style><div class="rail" hidden data-empty="true" data-state="waiting">
      <button class="gear" title="Nastavení Evala" aria-label="Nastavení Evala" aria-expanded="false">${icons.settings}</button>
      <div class="track" role="meter" aria-label="Hodnocení pozice z pohledu bílého" aria-valuemin="-10" aria-valuemax="10" aria-valuenow="0" aria-valuetext="Čekám na pozici">
        <div class="white"></div><span class="midpoint"></span><span class="polarity top" aria-hidden="true">−</span><span class="polarity bottom" aria-hidden="true">+</span><span class="value">—</span><span class="depth" title="Dosažená hloubka"></span>
      </div></div>
      <section class="popover" hidden aria-label="Nastavení Evala"><div class="popover-header"><h2>Evala</h2><button class="icon-button close" aria-label="Zavřít nastavení">${icons.close}</button></div><div class="status-row"><div class="status-text" role="status"><strong>Čekám na šachovnici</strong><span class="stats">Stockfish 19 Lite · lokálně</span></div><button class="icon-button toggle" aria-label="Pozastavit engine">${icons.pause}</button></div>${settingsMarkup(settings)}<p class="engine-name">Stockfish 19 Lite · zdarma · bez odesílání pozic</p></section>`;
    this.rail = this.shadow.querySelector('.rail');
    this.popover = this.shadow.querySelector('.popover');
    this.gear = this.shadow.querySelector('.gear');
    this.form = bindSettings(this.shadow.querySelector('.settings-form'), settings, onSettings);
    this.shadow.querySelector('.toggle').addEventListener('click', onToggle);
    this.gear.addEventListener('click', () => this.open(this.popover.hidden));
    this.shadow.querySelector('.close').addEventListener('click', () => this.open(false));
    this.onOutside = (event) => {
      if (!event.composedPath().includes(this.host)) this.open(false, false);
    };
    this.onKey = (event) => {
      if (event.key === 'Escape' && !this.popover.hidden) {
        event.stopPropagation();
        this.open(false);
      }
    };
    document.addEventListener('pointerdown', this.onOutside);
    this.host.addEventListener('keydown', this.onKey);
    document.body.append(this.host);
    this.updateSettings(settings);
  }

  open(visible, focus = true) {
    this.popover.hidden = !visible;
    this.gear.setAttribute('aria-expanded', String(visible));
    if (visible) {
      this.placePopover();
      if (focus) this.popover.querySelector('.close').focus();
    } else if (focus) this.gear.focus();
  }

  updateSettings(settings) {
    this.settings = settings;
    this.form.sync(settings);
    const toggle = this.shadow.querySelector('.toggle');
    toggle.innerHTML = settings.enabled ? icons.pause : icons.play;
    toggle.setAttribute('aria-label', settings.enabled ? 'Pozastavit engine' : 'Spustit engine');
    this.shadow.querySelector('.depth').hidden = !settings.showDepth;
    this.shadow.querySelector('.engine-name').textContent =
      settings.backend === 'server'
        ? 'Stockfish 19 Full · vlastní server'
        : `Stockfish 19 ${settings.engine === 'full' ? 'Full NNUE' : 'Lite'} · lokální výpočet`;
  }

  place(board, flipped) {
    const r = board.getBoundingClientRect();
    const width = this.settings.width;
    let left =
      this.settings.side === 'left'
        ? r.left - width - this.settings.gap
        : r.right + this.settings.gap;
    if (left < 3 && r.right + this.settings.gap + width < innerWidth)
      left = r.right + this.settings.gap;
    left = Math.max(3, Math.min(innerWidth - width - 3, left));
    Object.assign(this.rail.style, {
      left: `${left}px`,
      top: `${r.top}px`,
      width: `${width}px`,
      height: `${r.height}px`,
    });
    this.rail.hidden = r.bottom < 0 || r.top > innerHeight;
    this.rail.classList.toggle('flipped', this.settings.autoFlip && flipped);
    this.shadow.querySelector('.top').textContent = this.settings.autoFlip && flipped ? '+' : '−';
    this.shadow.querySelector('.bottom').textContent =
      this.settings.autoFlip && flipped ? '−' : '+';
    if (!this.popover.hidden) this.placePopover();
  }

  placePopover() {
    const rect = this.rail.getBoundingClientRect();
    const width = Math.min(320, innerWidth - 24);
    const left =
      rect.left + rect.width + 12 + width < innerWidth ? rect.right + 12 : rect.left - width - 12;
    Object.assign(this.popover.style, {
      left: `${Math.max(12, Math.min(innerWidth - width - 12, left))}px`,
      top: `${Math.max(16, Math.min(rect.top, innerHeight - this.popover.offsetHeight - 16))}px`,
    });
  }

  setState(state, message) {
    this.rail.dataset.state = state;
    const labels = {
      waiting: 'Čekám na úplnou pozici',
      loading: 'Načítám engine…',
      searching: 'Počítám pozici…',
      done: 'Rozbor dokončen',
      paused: 'Výpočet pozastaven',
      error: 'Výpočet není dostupný',
    };
    this.shadow.querySelector('.status-text strong').textContent =
      message || labels[state] || state;
    this.rail.title = message || labels[state] || state;
  }

  renderScore(score) {
    this.score = score;
    const percent = whitePercent(score);
    this.rail.dataset.empty = String(!score);
    this.shadow.querySelector('.white').style.height = `${percent}%`;
    const text = scoreText(score);
    this.shadow.querySelector('.value').textContent = text;
    this.shadow.querySelector('.value').style.fontSize =
      `${Math.min(11, (this.settings.width - 4) / (Math.max(1, text.length) * 0.67))}px`;
    this.shadow.querySelector('.depth').textContent = score?.depth ? `d${score.depth}` : '';
    const meter = this.shadow.querySelector('.track');
    meter.setAttribute(
      'aria-valuenow',
      String(
        score?.kind === 'mate'
          ? Math.sign(score.value) * 10
          : Math.max(-10, Math.min(10, (score?.value || 0) / 100)),
      ),
    );
    meter.setAttribute('aria-valuetext', `${evaluationLabel(score)} ${scoreText(score)}`);
    if (score)
      this.shadow.querySelector('.stats').textContent =
        `Hloubka ${score.depth} · ${new Intl.NumberFormat('cs-CZ', { notation: 'compact', maximumFractionDigits: 1 }).format(score.nps)} uzlů/s · ${(score.time / 1000).toFixed(1)} s`;
    else
      this.shadow.querySelector('.stats').textContent =
        this.settings.backend === 'server'
          ? 'Stockfish 19 Full · server'
          : `Stockfish 19 ${this.settings.engine === 'full' ? 'Full NNUE' : 'Lite'} · lokálně`;
  }

  hide() {
    this.rail.hidden = true;
    this.open(false, false);
  }

  renderHuman(data) {
    this.shadow.querySelector('.stats').textContent =
      `Maia ${data.elo}: ${data.move}${data.sacrifice ? ' · nabídka materiálu' : ''} · lokálně`;
    this.rail.title = `Lidský návrh: ${data.move} · hodnocení baru: Stockfish Lite`;
  }

  dispose() {
    document.removeEventListener('pointerdown', this.onOutside);
    this.host.removeEventListener('keydown', this.onKey);
    this.host.remove();
  }
}
