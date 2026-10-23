import { formatTime } from '../core/MathUtil';
import type { AchievementDef, AchievementStatus } from '../progression/Achievements';
import type { OwnedUpgrade } from '../upgrades/UpgradeManager';
import { ICONS, h } from './dom';
import { upgradeIcon } from './icons';

export interface RunSummary {
  victory: boolean;
  wave: number;
  wavesCompleted: number;
  kills: number;
  timeSec: number;
  score: number;
  accuracy: number;
  headshots: number;
  weaponName: string;
  seedCode: string;
  themeName: string;
  newBestWave: boolean;
  newHighScore: boolean;
  bestWave: number;
  /** Upgrades taken this run, in pick order. */
  build: OwnedUpgrade[];
  mutations: string[];
  scrapEarned: number;
  scrapBreakdown: string;
  scrapTotal: number;
  achievementsUnlocked: AchievementDef[];
  nearest: AchievementStatus[];
  /** Optional challenge suggestion for the next run. */
  challenge: string;
  endless: boolean;
}

/** Game-over / victory screen with accurate run statistics and progression rewards. */
export class ResultsScreen {
  readonly root: HTMLElement;
  onRetry: (() => void) | null = null;
  onMenu: (() => void) | null = null;
  private body: HTMLElement;
  private retry: HTMLButtonElement;

  constructor(parent: HTMLElement) {
    this.body = h('div', { class: 'results-body' });
    this.retry = h('button', { class: 'btn btn-primary btn-lg' }, 'RETRY');
    this.retry.addEventListener('click', () => this.onRetry?.());
    const menu = h('button', { class: 'btn btn-lg' }, 'MAIN MENU');
    menu.addEventListener('click', () => this.onMenu?.());
    this.root = h(
      'div',
      { class: 'screen overlay results hidden' },
      h('div', { class: 'panel modal-card results-card' }, h('span', { class: 'panel-tag' }, 'RUN SUMMARY'), this.body, h('div', { class: 'modal-actions two' }, this.retry, menu)),
    );
    parent.append(this.root);
  }

  show(r: RunSummary): void {
    const stat = (icon: string, value: string, label: string, cls = '') =>
      h('div', { class: 'result-stat' }, h('div', { class: 'result-value' }, h('span', { class: `stat-icon ${cls}`, html: icon }), value), h('div', { class: 'result-label' }, label));
    const title = r.victory ? (r.endless ? 'COLOSSUS DOWN' : 'ARENA CHAMPION') : r.endless && r.wavesCompleted >= 10 ? 'RUN COMPLETE' : 'YOU DIED';
    const good = r.victory || (r.endless && r.wavesCompleted >= 10);
    this.retry.textContent = good ? 'PLAY AGAIN' : 'RETRY';
    this.body.replaceChildren(
      h('div', { class: `results-title ${good ? 'good' : 'bad'}` }, title),
      h('div', { class: 'results-sub' }, `${r.victory && !r.endless ? 'Boss defeated' : `Reached wave ${r.wave}`} · ${r.themeName}`, r.newBestWave ? h('span', { class: 'tag' }, 'NEW BEST') : null),
      h(
        'div',
        { class: 'results-grid' },
        stat(ICONS.skull, String(r.kills), 'Enemies eliminated'),
        stat(ICONS.clock, formatTime(r.timeSec), 'Survival time'),
        stat(ICONS.coin, `+${r.scrapEarned}`, 'Scrap earned', 'coin'),
      ),
      h('div', { class: 'scrap-line' }, h('span', null, r.scrapBreakdown), h('b', null, `Total ${r.scrapTotal} Scrap`)),
      h(
        'div',
        { class: 'results-details' },
        ...[
          ['Score', `${r.score}${r.newHighScore ? ' ★' : ''}`],
          ['Accuracy', `${Math.round(r.accuracy * 100)}%`],
          ['Headshots', String(r.headshots)],
          ['Waves cleared', String(r.wavesCompleted)],
          ['Weapon', r.weaponName],
          ['Arena seed', r.seedCode],
        ].map(([k, v]) => h('div', { class: 'detail' }, h('span', null, k!), h('b', null, v!))),
      ),
      ...(r.achievementsUnlocked.length
        ? [
            h(
              'div',
              { class: 'results-unlocked' },
              h('h3', { class: 'section-title' }, 'Unlocked this run'),
              ...r.achievementsUnlocked.map((a) => h('div', { class: 'unlocked-row' }, h('i', { html: ICONS.trophy }), h('b', null, a.name), h('span', null, `+${a.scrap} Scrap`))),
            ),
          ]
        : []),
      ...(r.nearest.length
        ? [
            h(
              'div',
              { class: 'results-progress' },
              h('h3', { class: 'section-title' }, 'Achievement progress'),
              ...r.nearest.map((a) =>
                h(
                  'div',
                  { class: 'ach-row compact' },
                  h('i', { class: 'ach-icon', html: ICONS.lock }),
                  h('div', { class: 'ach-main' }, h('b', null, a.def.name), h('span', null, a.def.description), h('div', { class: 'ach-bar' }, h('i', { style: `transform:scaleX(${Math.min(1, a.progress / a.def.target).toFixed(3)})` }), h('em', null, `${Math.floor(a.progress)} / ${a.def.target}`))),
                ),
              ),
            ),
          ]
        : []),
      ...(r.build.length
        ? [
            h(
              'div',
              { class: 'upgrade-build results-build' },
              h('span', { class: 'upgrade-build-label' }, 'BUILD'),
              ...r.mutations.map((m) => h('span', { class: 'build-chip mutation' }, h('i', { html: ICONS.trophy }), m)),
              ...r.build.map((o) => h('span', { class: `build-chip cat-${o.def.category}`, title: o.def.name }, h('i', { html: upgradeIcon(o.def.id) }), `${o.def.name}${o.stacks > 1 ? ` ×${o.stacks}` : ''}`)),
            ),
          ]
        : []),
      h('div', { class: 'results-next' }, h('span', { class: 'stat-icon', html: ICONS.target }), r.challenge),
    );
    this.root.classList.remove('hidden');
    this.retry.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
