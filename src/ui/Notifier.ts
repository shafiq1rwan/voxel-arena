import { h } from './dom';
import { ICONS } from './icons';

/** Non-blocking toast stack (achievements, mutations, unlocks). Visible over gameplay and menus. */
export class Notifier {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'notifier', 'aria-live': 'polite' });
    parent.append(this.root);
  }

  show(title: string, line: string, kind: 'achievement' | 'mutation' | 'unlock' = 'achievement', seconds = 4.5): void {
    const icon = kind === 'achievement' ? ICONS.trophy : kind === 'mutation' ? ICONS.upgrades : ICONS.lock;
    const card = h('div', { class: `notice-card ${kind}` }, h('i', { html: icon }), h('div', null, h('small', null, title), h('b', null, line)));
    this.root.append(card);
    requestAnimationFrame(() => card.classList.add('in'));
    window.setTimeout(() => {
      card.classList.remove('in');
      window.setTimeout(() => card.remove(), 400);
    }, seconds * 1000);
    // Never stack more than three.
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
  }
}
