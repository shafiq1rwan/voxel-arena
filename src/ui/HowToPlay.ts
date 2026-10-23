import { h } from './dom';
import { ICONS, upgradeIcon } from './icons';

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look / aim'],
  ['Left click', 'Fire'],
  ['Right click', 'Aim down sights'],
  ['R', 'Reload'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['Q', 'Dash (once unlocked)'],
  ['1 / 2 / 3', 'Pick an upgrade card'],
  ['Esc / P', 'Pause'],
];

/** Shared "How to play" dialog, opened from the main menu and the pause menu. */
export class HowToPlay {
  readonly root: HTMLElement;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    const close = h('button', { class: 'btn btn-primary' }, 'GOT IT');
    close.addEventListener('click', () => this.onClose?.());

    const enemy = (cls: string, name: string, text: string) =>
      h('div', { class: `htp-enemy ${cls}` }, h('i', { class: 'htp-swatch' }), h('div', null, h('b', null, name), h('span', null, text)));

    this.root = h(
      'div',
      { class: 'modal hidden', role: 'dialog', 'aria-label': 'How to play' },
      h(
        'div',
        { class: 'panel modal-card htp-card' },
        h('span', { class: 'panel-tag' }, 'HOW TO PLAY'),
        h('h2', { class: 'modal-title' }, 'SURVIVE THE ARENA'),
        h('p', { class: 'htp-lead' }, 'Clear each wave, pick an upgrade, and see how far your build can carry you.'),
        h(
          'div',
          { class: 'htp-grid' },
          h(
            'section',
            { class: 'htp-section' },
            h('h3', null, 'Controls'),
            h('div', { class: 'controls-list' }, ...CONTROLS.map(([k, v]) => h('div', { class: 'control-row' }, h('kbd', null, k), h('span', null, v)))),
          ),
          h(
            'section',
            { class: 'htp-section' },
            h('h3', null, 'Enemies'),
            enemy('chaser', 'Chaser', 'Rushes in and swings. Keep moving and go for the head.'),
            enemy('shooter', 'Shooter', 'Keeps its distance and fires slow bolts after a glowing wind-up. Sidestep, or headshot it to interrupt.'),
            h('h3', null, 'Between waves'),
            h(
              'div',
              { class: 'htp-row' },
              h('i', { class: 'htp-icon', html: upgradeIcon('heavyRounds') }),
              h('span', null, 'Choose 1 of 3 upgrades. Builds stack — try Explosive Kills with Rapid Fire.'),
            ),
            h('div', { class: 'htp-row' }, h('i', { class: 'htp-icon', html: upgradeIcon('dashCharge') }), h('span', null, 'Dash Charge unlocks a quick dash on Q with a moment of invulnerability.')),
            h('div', { class: 'htp-row' }, h('i', { class: 'htp-icon heart', html: ICONS.heart }), h('span', null, 'Health and ammo crates drop from enemies and appear after each wave.')),
          ),
        ),
        h('div', { class: 'modal-actions' }, close),
      ),
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose?.();
    });
    parent.append(this.root);
  }

  open(): void {
    this.root.classList.remove('hidden');
  }

  close(): void {
    this.root.classList.add('hidden');
  }
}
