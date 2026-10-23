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
  ['G', 'Grenade (unlock)'],
  ['F', 'Take weapon from crate'],
  ['1-3 / Wheel', 'Switch weapon · pick upgrade'],
  ['Esc / P', 'Pause'],
];

const TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Move (push fully forward to sprint)'],
  ['Right side drag', 'Look / aim'],
  ['FIRE', 'Shoot — drag while holding to aim'],
  ['AIM · JUMP · R', 'Aim down sights · jump · reload'],
  ['DASH · NADE · SWAP', 'Abilities and weapon switch'],
  ['TAKE', 'Appears next to a weapon crate'],
];

/** Shared "How to play" dialog, opened from the main menu and the pause menu. */
export class HowToPlay {
  readonly root: HTMLElement;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, isTouch = false) {
    const close = h('button', { class: 'btn btn-primary' }, 'GOT IT');
    const controls = isTouch ? TOUCH_CONTROLS : CONTROLS;
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
            h('div', { class: 'controls-list' }, ...controls.map(([k, v]) => h('div', { class: 'control-row' }, h('kbd', null, k), h('span', null, v)))),
          ),
          h(
            'section',
            { class: 'htp-section' },
            h('h3', null, 'Enemies'),
            enemy('chaser', 'Chaser', 'Rushes in and swings. Keep moving and go for the head.'),
            enemy('shooter', 'Shooter', 'Keeps its distance and fires slow bolts after a glowing wind-up. Sidestep, or headshot it to interrupt.'),
            enemy('tank', 'Tank', 'Armoured head. Shoot the glowing chest core and stay out of the red slam ring.'),
            enemy('elite', 'Elites & the boss', 'Gold-crowned elites have an extra ability and drop weapon crates. Wave 10: the Obsidian Colossus.'),
            h('h3', null, 'Between waves'),
            h(
              'div',
              { class: 'htp-row' },
              h('i', { class: 'htp-icon', html: upgradeIcon('heavyRounds') }),
              h('span', null, 'Choose 1 of 3 upgrades. Builds stack — try Explosive Kills with Rapid Fire.'),
            ),
            h('div', { class: 'htp-row' }, h('i', { class: 'htp-icon', html: upgradeIcon('dashCharge') }), h('span', null, 'Dash Charge unlocks a quick dash on Q with a moment of invulnerability.')),
            h('div', { class: 'htp-row' }, h('i', { class: 'htp-icon', html: ICONS.crate }), h('span', null, 'Weapon crates hold procedural guns — modules add chain lightning, explosions or freeze.')),
            h('div', { class: 'htp-row' }, h('i', { class: 'htp-icon heart', html: ICONS.heart }), h('span', null, 'Earn Scrap every run to unlock weapons, abilities, themes and challenges.')),
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
