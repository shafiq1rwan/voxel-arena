import { formatTime } from '../core/MathUtil';
import { ICONS, h } from './dom';

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
    this.root = h('div', { class: 'screen overlay results hidden' }, h('div', { class: 'panel modal-card results-card' }, this.body, h('div', { class: 'modal-actions two' }, this.retry, menu)));
    parent.append(this.root);
  }

  show(r: RunSummary): void {
    const stat = (icon: string, value: string, label: string) =>
      h('div', { class: 'result-stat' }, h('div', { class: 'result-value' }, h('span', { class: 'stat-icon', html: icon }), value), h('div', { class: 'result-label' }, label));
    const clock = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2zm0 3v1H4v6h1v1h6v-1h1V5h-1V4zm2 1h2v3h2v2H7z"/></svg>';
    const target = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M7 0h2v3h2v1h1v1h1v2h3v2h-3v2h-1v1h-1v1H9v3H7v-3H5v-1H4v-1H3V9H0V7h3V5h1V4h1V3h2zm0 5v1H6v4h1v1h2v-1h1V6H9V5z"/></svg>';
    this.body.replaceChildren(
      h('div', { class: `results-title ${r.victory ? 'good' : 'bad'}` }, r.victory ? 'ARENA CHAMPION' : 'YOU DIED'),
      h('div', { class: 'results-sub' }, `Reached wave ${r.wave}`, r.newBestWave ? h('span', { class: 'tag' }, 'NEW BEST') : null),
      h(
        'div',
        { class: 'results-grid' },
        stat(ICONS.skull, String(r.kills), 'Enemies eliminated'),
        stat(clock, formatTime(r.timeSec), 'Survival time'),
        stat(ICONS.coin, String(r.score), r.newHighScore ? 'Score — new high!' : 'Score'),
      ),
      h(
        'div',
        { class: 'results-details' },
        ...[
          ['Waves cleared', String(r.wavesCompleted)],
          ['Accuracy', `${Math.round(r.accuracy * 100)}%`],
          ['Headshots', String(r.headshots)],
          ['Weapon', r.weaponName],
          ['Arena', `${r.themeName} · ${r.seedCode}`],
          ['Best wave', String(r.bestWave)],
        ].map(([k, v]) => h('div', { class: 'detail' }, h('span', null, k!), h('b', null, v!))),
      ),
      h('div', { class: 'results-next' }, h('span', { class: 'stat-icon', html: target }), r.wave < r.bestWave ? `Next goal: beat your best of wave ${r.bestWave}.` : `Next goal: reach wave ${r.wave + 1}.`),
    );
    this.root.classList.remove('hidden');
    this.retry.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
