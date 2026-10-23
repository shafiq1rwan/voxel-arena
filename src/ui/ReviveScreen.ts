import { h, setText } from './dom';
import { ICONS } from './icons';

/**
 * Opt-in rewarded revive (Milestone 6). Shown once per run on death; the player must explicitly
 * choose to watch an ad. The reward is only granted if the platform reports the ad completed.
 */
export class ReviveScreen {
  readonly root: HTMLElement;
  onRevive: (() => void) | null = null;
  onDecline: (() => void) | null = null;
  private timer = 0;
  private fill: HTMLElement;
  private status: HTMLElement;
  private reviveBtn: HTMLButtonElement;
  private declineBtn: HTMLButtonElement;
  private busy = false;

  constructor(parent: HTMLElement) {
    this.fill = h('i');
    this.status = h('div', { class: 'revive-status' });
    this.reviveBtn = h('button', { class: 'btn btn-primary btn-lg' }, h('span', { class: 'stat-icon', html: ICONS.upgrades }), ' REVIVE — WATCH AD');
    this.declineBtn = h('button', { class: 'btn' }, 'NO THANKS');
    this.reviveBtn.addEventListener('click', () => {
      if (this.busy) return;
      this.busy = true;
      this.onRevive?.();
    });
    this.declineBtn.addEventListener('click', () => {
      if (this.busy) return;
      this.onDecline?.();
    });
    this.root = h(
      'div',
      { class: 'screen overlay revive hidden', role: 'dialog', 'aria-label': 'Revive' },
      h(
        'div',
        { class: 'panel modal-card revive-card' },
        h('span', { class: 'panel-tag' }, 'SECOND CHANCE'),
        h('h2', { class: 'modal-title' }, 'TAKEN DOWN'),
        h('p', { class: 'menu-modal-lead' }, 'Watch a short ad to get back up with half your health and a moment of invulnerability. One revive per run.'),
        h('div', { class: 'revive-timer' }, this.fill),
        this.status,
        h('div', { class: 'modal-actions' }, this.reviveBtn, this.declineBtn),
      ),
    );
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(seconds = 7): void {
    this.timer = seconds;
    this.busy = false;
    setText(this.status, '');
    this.root.dataset.total = String(seconds);
    this.root.classList.remove('hidden');
  }

  setStatus(text: string): void {
    setText(this.status, text);
    this.busy = false;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Counts down; auto-declines when time runs out (unless an ad is in progress). */
  update(dt: number): void {
    if (!this.isOpen || this.busy) return;
    this.timer -= dt;
    const total = Number(this.root.dataset.total) || 1;
    this.fill.style.transform = `scaleX(${Math.max(0, this.timer / total)})`;
    if (this.timer <= 0) this.onDecline?.();
  }
}
