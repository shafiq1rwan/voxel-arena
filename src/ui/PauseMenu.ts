import { formatTime } from '../core/MathUtil';
import type { OwnedUpgrade } from '../upgrades/UpgradeManager';
import { ICONS, h, setText } from './dom';
import { upgradeIcon } from './icons';

export interface PauseInfo {
  wave: number;
  timeSec: number;
  kills: number;
  score: number;
  arena: string;
  build: OwnedUpgrade[];
  /** Optional instruction shown prominently (e.g. "Click RESUME to start"). */
  message?: string;
}

export class PauseMenu {
  readonly root: HTMLElement;
  onResume: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onHowToPlay: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  private hint: HTMLElement;
  private stats: HTMLElement;
  private arena: HTMLElement;
  private build: HTMLElement;
  private message: HTMLElement;

  constructor(parent: HTMLElement) {
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = h('button', { class: `btn ${cls}` }, label);
      b.addEventListener('click', fn);
      return b;
    };
    this.hint = h('div', { class: 'pause-hint' });
    this.stats = h('div', { class: 'pause-stats' });
    this.arena = h('div', { class: 'pause-arena' });
    this.build = h('div', { class: 'upgrade-build pause-build' });
    this.message = h('div', { class: 'pause-message' });

    this.root = h(
      'div',
      { class: 'screen overlay pause-menu hidden' },
      h(
        'div',
        { class: 'panel modal-card pause-card' },
        h('span', { class: 'panel-tag' }, 'PAUSED'),
        h('h2', { class: 'modal-title' }, 'PAUSED'),
        this.message,
        this.stats,
        this.arena,
        this.build,
        h(
          'div',
          { class: 'menu-buttons' },
          btn('RESUME', 'btn-primary btn-lg', () => this.onResume?.()),
          btn('HOW TO PLAY', '', () => this.onHowToPlay?.()),
          btn('SETTINGS', '', () => this.onSettings?.()),
          btn('QUIT TO MENU', 'btn-danger', () => this.onQuit?.()),
        ),
        this.hint,
      ),
    );
    parent.append(this.root);
  }

  show(info: PauseInfo): void {
    const stat = (icon: string, value: string, label: string, cls = '') =>
      h('div', { class: 'pause-stat' }, h('span', { class: `stat-icon ${cls}`, html: icon }), h('b', null, value), h('small', null, label));
    this.stats.replaceChildren(
      stat(ICONS.waves, String(info.wave), 'Wave'),
      stat(ICONS.clock, formatTime(info.timeSec), 'Time'),
      stat(ICONS.skull, String(info.kills), 'Kills'),
      stat(ICONS.coin, String(info.score), 'Score', 'coin'),
    );
    setText(this.arena, info.arena);
    this.build.replaceChildren(
      ...(info.build.length
        ? [
            h('span', { class: 'upgrade-build-label' }, 'BUILD'),
            ...info.build.map((o) => h('span', { class: `build-chip cat-${o.def.category}`, title: o.def.name }, h('i', { html: upgradeIcon(o.def.id) }), o.stacks > 1 ? `×${o.stacks}` : '')),
          ]
        : [h('span', { class: 'upgrade-build-label' }, 'NO UPGRADES YET — CLEAR A WAVE TO PICK ONE')]),
    );
    setText(this.message, info.message ?? '');
    this.message.classList.toggle('hidden', !info.message);
    setText(this.hint, '');
    this.root.classList.remove('hidden');
  }

  setHint(text: string): void {
    setText(this.hint, text);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
