import type { PlayerRecords } from '../progression/SaveManager';
import { formatTime } from '../core/MathUtil';
import { ICONS, h, setText } from './dom';
import { createPixelLogo } from './PixelLogo';

export class MainMenu {
  readonly root: HTMLElement;
  onPlay: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onHowToPlay: (() => void) | null = null;
  onUpgrades: (() => void) | null = null;
  onAchievements: (() => void) | null = null;
  onSkins: (() => void) | null = null;
  private records: HTMLElement;
  private arenaName: HTMLElement;
  private scrapEl: HTMLElement;

  constructor(parent: HTMLElement, isTouch: boolean) {
    const play = h('button', { class: 'btn btn-primary btn-xl' }, 'PLAY');
    play.addEventListener('click', () => this.onPlay?.());
    const btn = (label: string, fn: () => void) => {
      const b = h('button', { class: 'btn' }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const upgrades = btn('UPGRADES', () => this.onUpgrades?.());
    const achievements = btn('ACHIEVEMENTS', () => this.onAchievements?.());
    const skins = btn('WEAPON SKINS', () => this.onSkins?.());
    const howTo = btn('HOW TO PLAY', () => this.onHowToPlay?.());
    const settings = btn('SETTINGS', () => this.onSettings?.());
    this.scrapEl = h('span', { class: 'menu-scrap' });
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
        h('div', { class: 'menu-buttons' }, play, upgrades, achievements, skins, h('div', { class: 'menu-buttons-row' }, howTo, settings)),
        h('div', { class: 'loadout-scrap' }, h('span', { class: 'stat-icon coin', html: ICONS.coin }), this.scrapEl),
        isTouch ? h('div', { class: 'notice touch-notice' }, 'Touch controls: left thumb moves, drag right side to aim, FIRE also aims while held.') : null,
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
            ['G', 'grenade'],
            ['F', 'take'],
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

  show(records: PlayerRecords, scrap = 0): void {
    setText(this.scrapEl, `${scrap} Scrap`);
    this.records.replaceChildren(
      ...[
        ['Best wave', records.bestWave ? String(records.bestWave) : '—'],
        ['High score', records.highScore ? String(records.highScore) : '—'],
        ['Total kills', String(records.totalKills)],
        ['Headshots', String(records.totalHeadshots)],
        ['Longest run', records.longestRunSec ? formatTime(records.longestRunSec) : '—'],
        ['Victories', String(records.victories)],
      ].map(([k, v]) => h('div', { class: 'record' }, h('span', null, k!), h('b', null, v!))),
    );
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setBackdropArena(name: string): void {
    setText(this.arenaName, name);
  }
}
