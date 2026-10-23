import { h, setText } from './dom';

export class PauseMenu {
  readonly root: HTMLElement;
  onResume: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  private hint: HTMLElement;
  private controls: HTMLElement;
  private info: HTMLElement;

  constructor(parent: HTMLElement) {
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = h('button', { class: `btn ${cls}` }, label);
      b.addEventListener('click', fn);
      return b;
    };
    this.hint = h('div', { class: 'pause-hint' });
    this.info = h('div', { class: 'pause-info' });
    const rows: [string, string][] = [
      ['W A S D', 'Move'],
      ['Mouse', 'Look / aim'],
      ['Left click', 'Fire'],
      ['Right click', 'Aim down sights'],
      ['R', 'Reload'],
      ['Space', 'Jump'],
      ['Shift', 'Sprint'],
      ['Esc / P', 'Pause'],
      ['F3', 'Debug overlay'],
    ];
    this.controls = h('div', { class: 'controls-list hidden' }, ...rows.map(([k, v]) => h('div', { class: 'control-row' }, h('kbd', null, k), h('span', null, v))));

    this.root = h(
      'div',
      { class: 'screen overlay pause-menu hidden' },
      h(
        'div',
        { class: 'panel modal-card' },
        h('h2', { class: 'modal-title' }, 'PAUSED'),
        this.info,
        h(
          'div',
          { class: 'menu-buttons' },
          btn('RESUME', 'btn-primary btn-lg', () => this.onResume?.()),
          btn('CONTROLS', '', () => this.controls.classList.toggle('hidden')),
          btn('SETTINGS', '', () => this.onSettings?.()),
          btn('QUIT TO MENU', 'btn-danger', () => this.onQuit?.()),
        ),
        this.controls,
        this.hint,
      ),
    );
    parent.append(this.root);
  }

  show(info: string): void {
    setText(this.info, info);
    setText(this.hint, '');
    this.controls.classList.add('hidden');
    this.root.classList.remove('hidden');
  }

  setHint(text: string): void {
    setText(this.hint, text);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
