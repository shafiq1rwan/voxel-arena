import { formatTime } from '../core/MathUtil';
import { ICONS, h } from './dom';
import type { OwnedUpgrade } from '../upgrades/UpgradeManager';
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
}

/** Game-over / victory screen with accurate run statistics. */
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
    const clock = ICONS.clock;
    const target = ICONS.target;
    this.body.replaceChildren(
      h('div', { class: `results-title ${r.victory ? 'good' : 'bad'}` }, r.victory ? 'ARENA CHAMPION' : 'YOU DIED'),
      h('div', { class: 'results-sub' }, `Reached wave ${r.wave} · ${r.themeName}`, r.newBestWave ? h('span', { class: 'tag' }, 'NEW BEST') : null),
      h(
        'div',
        { class: 'results-grid' },
        stat(ICONS.skull, String(r.kills), 'Enemies eliminated'),
        stat(clock, formatTime(r.timeSec), 'Survival time'),
        stat(ICONS.coin, String(r.score), r.newHighScore ? 'Score — new high!' : 'Score', 'coin'),
      ),
      h(
        'div',
        { class: 'results-details' },
        ...[
          ['Waves cleared', String(r.wavesCompleted)],
          ['Accuracy', `${Math.round(r.accuracy * 100)}%`],
          ['Headshots', String(r.headshots)],
          ['Weapon', r.weaponName],
          ['Arena seed', r.seedCode],
          ['Best wave', String(r.bestWave)],
        ].map(([k, v]) => h('div', { class: 'detail' }, h('span', null, k!), h('b', null, v!))),
      ),
      ...(r.build.length
        ? [h(
            'div',
            { class: 'upgrade-build results-build' },
            h('span', { class: 'upgrade-build-label' }, 'BUILD'),
            ...r.build.map((o) => h('span', { class: `build-chip cat-${o.def.category}`, title: o.def.name }, h('i', { html: upgradeIcon(o.def.id) }), `${o.def.name}${o.stacks > 1 ? ` ×${o.stacks}` : ''}`)),
          )]
        : []),
      h('div', { class: 'results-next' }, h('span', { class: 'stat-icon', html: target }), r.wave < r.bestWave ? `Next goal: beat your best of wave ${r.bestWave}.` : `Next goal: reach wave ${r.wave + 1}.`),
    );
    this.root.classList.remove('hidden');
    this.retry.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
