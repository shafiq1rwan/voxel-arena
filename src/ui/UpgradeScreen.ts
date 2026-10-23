import type { OwnedUpgrade } from '../upgrades/UpgradeManager';
import type { UpgradeDef, UpgradeId } from '../upgrades/UpgradeTypes';
import { h, setText } from './dom';
import { upgradeIcon } from './icons';

/**
 * Between-wave upgrade choice (roguelite reward). Three cards; click or press 1/2/3.
 * A short input guard prevents a held fire button from picking a card by accident.
 */
export class UpgradeScreen {
  readonly root: HTMLElement;
  onChoose: ((id: UpgradeId) => void) | null = null;
  private title: HTMLElement;
  private cards: HTMLElement;
  private build: HTMLElement;
  private offered: UpgradeDef[] = [];
  private openedAt = 0;
  private chosen = false;

  constructor(parent: HTMLElement) {
    this.title = h('div', { class: 'upgrade-title' });
    this.cards = h('div', { class: 'upgrade-cards' });
    this.build = h('div', { class: 'upgrade-build' });
    this.root = h(
      'div',
      { class: 'screen overlay upgrade-screen hidden', role: 'dialog', 'aria-label': 'Choose an upgrade' },
      h('div', { class: 'upgrade-panel' }, this.title, h('div', { class: 'upgrade-sub' }, 'Choose an upgrade'), this.cards, this.build),
    );
    parent.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (n >= 0 && e.code.length > 0 && this.offered[n]) {
        e.preventDefault();
        this.pick(this.offered[n]!.id);
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(wave: number, offered: UpgradeDef[], stacksOf: (id: UpgradeId) => number, owned: OwnedUpgrade[]): void {
    this.offered = offered;
    this.chosen = false;
    this.openedAt = performance.now();
    setText(this.title, `WAVE ${wave} COMPLETE`);
    this.cards.replaceChildren(
      ...offered.map((def, i) => {
        const have = stacksOf(def.id);
        const select = h('button', { class: 'btn btn-primary upgrade-select' }, 'SELECT');
        const card = h(
          'div',
          { class: `upgrade-card cat-${def.category} rarity-${def.rarity}`, tabindex: 0, role: 'button', 'aria-label': `${def.name}: ${def.describe(have + 1)}` },
          h('div', { class: 'upgrade-key' }, String(i + 1)),
          h('div', { class: 'upgrade-name' }, def.name.toUpperCase()),
          h('div', { class: 'upgrade-meta' }, `${def.rarity} · ${def.category}`),
          h('div', { class: 'upgrade-icon', html: upgradeIcon(def.id) }),
          h('div', { class: 'upgrade-desc' }, def.describe(have + 1)),
          h('div', { class: 'upgrade-level' }, have === 0 ? (def.maxStacks > 1 ? `NEW · max ${def.maxStacks}` : 'NEW') : `LV ${have} → ${have + 1} / ${def.maxStacks}`),
          select,
        );
        card.addEventListener('click', () => this.pick(def.id));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.pick(def.id);
          }
        });
        return card;
      }),
    );
    this.build.replaceChildren(
      ...(owned.length
        ? [
            h('span', { class: 'upgrade-build-label' }, 'BUILD'),
            ...owned.map((o) => h('span', { class: `build-chip cat-${o.def.category}`, title: o.def.name }, h('i', { html: upgradeIcon(o.def.id) }), o.stacks > 1 ? `×${o.stacks}` : '')),
          ]
        : []),
    );
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private pick(id: UpgradeId): void {
    // Ignore clicks in the first moments: the player was probably still holding fire.
    if (this.chosen || performance.now() - this.openedAt < 450) return;
    this.chosen = true;
    const card = this.cards.children[this.offered.findIndex((d) => d.id === id)];
    card?.classList.add('chosen');
    this.onChoose?.(id);
  }
}
