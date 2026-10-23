import type { PlayerRecords } from '../progression/SaveManager';
import { formatTime } from '../core/MathUtil';
import { ICONS, h, setText } from './dom';
import { createPixelLogo } from './PixelLogo';

export class MainMenu {
  readonly root: HTMLElement;
  onPlay: ((seedText: string) => void) | null = null;
  onSettings: (() => void) | null = null;
  onHowToPlay: (() => void) | null = null;
  private records: HTMLElement;
  private seedInput: HTMLInputElement;
  private arenaName: HTMLElement;

  constructor(parent: HTMLElement, isTouch: boolean) {
    this.seedInput = h('input', { class: 'seed-input', type: 'text', maxlength: 12, placeholder: 'Random', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Arena seed' });
    const play = h('button', { class: 'btn btn-primary btn-xl' }, 'PLAY');
    play.addEventListener('click', () => this.onPlay?.(this.seedInput.value));
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onPlay?.(this.seedInput.value);
    });
    const howTo = h('button', { class: 'btn' }, 'HOW TO PLAY');
    howTo.addEventListener('click', () => this.onHowToPlay?.());
    const settings = h('button', { class: 'btn' }, 'SETTINGS');
    settings.addEventListener('click', () => this.onSettings?.());
    const gear = h('button', { class: 'icon-btn menu-gear', 'aria-label': 'Settings', html: ICONS.gear });
    gear.addEventListener('click', () => this.onSettings?.());

    this.records = h('div', { class: 'records' });
    this.arenaName = h('div', { class: 'menu-arena-name' });

    const features: [string, string, string][] = [
      [ICONS.arena, 'Procedural fortresses', 'Four themes, a new layout every seed.'],
      [ICONS.waves, 'Wave survival', 'Chasers rush you, shooters pin you down.'],
      [ICONS.upgrades, 'Roguelite upgrades', 'Pick 1 of 3 after every wave and stack a build.'],
    ];

    this.root = h(
      'div',
      { class: 'screen main-menu hidden' },
      h(
        'div',
        { class: 'menu-left panel' },
        h('span', { class: 'panel-tag' }, 'MAIN MENU'),
        gear,
        createPixelLogo('large'),
        h('p', { class: 'tagline' }, 'Every arena is different. Every run is a new challenge.'),
        h('div', { class: 'menu-buttons' }, play, howTo, settings),
        h('label', { class: 'seed-row' }, h('span', null, 'Arena seed'), this.seedInput),
        isTouch ? h('div', { class: 'notice' }, 'Touch controls arrive in an upcoming update — use a keyboard & mouse for now.') : null,
        h(
          'div',
          { class: 'controls-hint' },
          ...[
            ['WASD', 'move'],
            ['MOUSE', 'aim'],
            ['CLICK', 'fire'],
            ['R', 'reload'],
            ['SPACE', 'jump'],
            ['SHIFT', 'sprint'],
            ['Q', 'dash'],
          ].flatMap(([k, v]) => [h('b', null, k!), ` ${v}  `]),
        ),
      ),
      h(
        'div',
        { class: 'menu-right' },
        h(
          'div',
          { class: 'panel feature-card' },
          ...features.map(([icon, t, d]) => h('div', { class: 'feature' }, h('i', { class: 'feature-icon', html: icon }), h('div', null, h('b', null, t), h('span', null, d)))),
        ),
        h('div', { class: 'panel records-card' }, h('span', { class: 'panel-tag' }, 'PERSONAL RECORDS'), this.records),
        this.arenaName,
      ),
    );
    parent.append(this.root);
  }

  show(records: PlayerRecords): void {
    this.records.replaceChildren(
      ...[
        ['Best wave', records.bestWave ? String(records.bestWave) : '—'],
        ['High score', records.highScore ? String(records.highScore) : '—'],
        ['Total kills', String(records.totalKills)],
        ['Headshots', String(records.totalHeadshots)],
        ['Longest run', records.longestRunSec ? formatTime(records.longestRunSec) : '—'],
        ['Runs played', String(records.runsPlayed)],
      ].map(([k, v]) => h('div', { class: 'record' }, h('span', null, k!), h('b', null, v!))),
    );
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setSeed(text: string): void {
    this.seedInput.value = text.slice(0, 12).toUpperCase();
  }

  setBackdropArena(name: string): void {
    setText(this.arenaName, name);
  }
}
