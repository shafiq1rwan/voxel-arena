import type { PlayerRecords } from '../progression/SaveManager';
import { formatTime } from '../core/MathUtil';
import { ICONS, h, setText } from './dom';
import { createPixelLogo } from './PixelLogo';

export class MainMenu {
  readonly root: HTMLElement;
  onPlay: ((seedText: string) => void) | null = null;
  onSettings: (() => void) | null = null;
  private records: HTMLElement;
  private seedInput: HTMLInputElement;
  private arenaName: HTMLElement;

  constructor(parent: HTMLElement, isTouch: boolean) {
    this.seedInput = h('input', { class: 'seed-input', type: 'text', maxlength: 12, placeholder: 'Random', spellcheck: 'false', autocomplete: 'off' });
    const play = h('button', { class: 'btn btn-primary btn-xl' }, 'PLAY');
    play.addEventListener('click', () => this.onPlay?.(this.seedInput.value));
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onPlay?.(this.seedInput.value);
    });
    const settings = h('button', { class: 'btn' }, 'SETTINGS');
    settings.addEventListener('click', () => this.onSettings?.());
    const gear = h('button', { class: 'icon-btn menu-gear', 'aria-label': 'Settings', html: ICONS.gear });
    gear.addEventListener('click', () => this.onSettings?.());

    this.records = h('div', { class: 'records' });
    this.arenaName = h('div', { class: 'menu-arena-name' });

    const features: [string, string][] = [
      ['Procedural arenas', 'New layout, theme and strategy every run.'],
      ['Fast-paced wave survival', 'Hold the arena against endless chaser hordes.'],
      ['Voxel carnage', 'Headshots stagger, kills shatter into blocks.'],
    ];

    this.root = h(
      'div',
      { class: 'screen main-menu hidden' },
      h(
        'div',
        { class: 'menu-left panel' },
        gear,
        createPixelLogo('large'),
        h('p', { class: 'tagline' }, 'Every arena is different. Every run is a new challenge.'),
        h('div', { class: 'menu-buttons' }, play, settings),
        h('label', { class: 'seed-row' }, h('span', null, 'Arena seed'), this.seedInput),
        isTouch ? h('div', { class: 'notice' }, 'Touch controls arrive in an upcoming milestone — use a keyboard & mouse for now.') : null,
        h('div', { class: 'controls-hint' }, h('b', null, 'WASD'), ' move  ', h('b', null, 'MOUSE'), ' aim  ', h('b', null, 'CLICK'), ' fire  ', h('b', null, 'R'), ' reload  ', h('b', null, 'SPACE'), ' jump  ', h('b', null, 'SHIFT'), ' sprint'),
      ),
      h(
        'div',
        { class: 'menu-right' },
        h('div', { class: 'panel feature-card' }, ...features.map(([t, d]) => h('div', { class: 'feature' }, h('i', { class: 'feature-dot' }), h('div', null, h('b', null, t), h('span', null, d))))),
        h('div', { class: 'panel records-card' }, h('h3', null, 'PERSONAL RECORDS'), this.records),
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
        ['Longest run', records.longestRunSec ? formatTime(records.longestRunSec) : '—'],
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
