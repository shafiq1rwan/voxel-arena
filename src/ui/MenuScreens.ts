import { createWeapon } from '../procedural/WeaponGenerator';
import type { AchievementStatus } from '../progression/Achievements';
import { ACHIEVEMENTS } from '../progression/Achievements';
import { SKINS, SKIN_ORDER, type SkinDef } from '../progression/Skins';
import { UNLOCKS, type UnlockCategory } from '../progression/UnlockManager';
import { ICONS, h } from './dom';
import { drawWeaponIcon } from './weaponIcon';

/** Common modal shell: tag, title, scrollable body, close button. */
abstract class MenuModal {
  readonly root: HTMLElement;
  onClose: (() => void) | null = null;
  protected body: HTMLElement;
  protected header: HTMLElement;

  constructor(parent: HTMLElement, tag: string, title: string, wide = true) {
    this.body = h('div', { class: 'menu-modal-body' });
    this.header = h('div', { class: 'menu-modal-header' });
    const close = h('button', { class: 'btn btn-primary' }, 'BACK');
    close.addEventListener('click', () => this.onClose?.());
    this.root = h(
      'div',
      { class: 'modal hidden', role: 'dialog', 'aria-label': title },
      h(
        'div',
        { class: `panel modal-card menu-modal ${wide ? 'wide' : ''}` },
        h('span', { class: 'panel-tag' }, tag),
        h('h2', { class: 'modal-title' }, title),
        this.header,
        this.body,
        h('div', { class: 'modal-actions' }, close),
      ),
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose?.();
    });
    parent.append(this.root);
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  protected open(): void {
    this.root.classList.remove('hidden');
  }
}

const scrapBadge = (scrap: number) => h('div', { class: 'loadout-scrap' }, h('span', { class: 'stat-icon coin', html: ICONS.coin }), `${scrap} Scrap`);

const CATEGORY_LABEL: Record<UnlockCategory, string> = {
  weapon: 'Weapon families',
  ability: 'Abilities',
  module: 'Weapon modules',
  theme: 'Arena themes',
  modifier: 'Challenge modifiers',
  mode: 'Game modes',
};

/** "UPGRADES": spend Scrap on permanent unlocks (variety, not raw power). */
export class UnlockShop extends MenuModal {
  onBuy: ((id: string, cost: number) => void) | null = null;

  constructor(parent: HTMLElement) {
    super(parent, 'UPGRADES', 'ARMORY');
  }

  show(scrap: number, has: (id: string) => boolean): void {
    this.header.replaceChildren(scrapBadge(scrap), h('p', { class: 'menu-modal-lead' }, 'Earn Scrap from every run. Unlocks add variety — the core game is complete from your first run.'));
    const cats = [...new Set(UNLOCKS.map((u) => u.category))];
    this.body.replaceChildren(
      ...cats.map((cat) =>
        h(
          'section',
          { class: 'shop-section' },
          h('h3', { class: 'section-title' }, CATEGORY_LABEL[cat]),
          h(
            'div',
            { class: 'shop-grid' },
            ...UNLOCKS.filter((u) => u.category === cat).map((u) => {
              const owned = has(u.id);
              const afford = scrap >= u.cost;
              const btn = h('button', { class: `btn btn-small ${owned ? '' : afford ? 'btn-primary' : ''}` }, owned ? 'OWNED' : `${u.cost} SCRAP`);
              if (owned || !afford) btn.setAttribute('disabled', '');
              else btn.addEventListener('click', () => this.onBuy?.(u.id, u.cost));
              return h('div', { class: `shop-card ${owned ? 'owned' : ''}` }, h('b', null, u.name), h('span', null, u.description), btn);
            }),
          ),
        ),
      ),
    );
    this.open();
  }
}

/** Achievement list with progress bars and rewards. */
export class AchievementsScreen extends MenuModal {
  constructor(parent: HTMLElement) {
    super(parent, 'ACHIEVEMENTS', 'ACHIEVEMENTS');
  }

  show(list: AchievementStatus[], skinFor: (id: string) => SkinDef | undefined): void {
    const done = list.filter((a) => a.unlocked).length;
    this.header.replaceChildren(h('p', { class: 'menu-modal-lead' }, `${done} / ${list.length} unlocked · progress is tracked from real gameplay and saved on this device.`));
    this.body.replaceChildren(
      h(
        'div',
        { class: 'ach-list' },
        ...list.map((a) => {
          const skin = skinFor(a.def.id);
          const pct = Math.min(1, a.progress / a.def.target);
          return h(
            'div',
            { class: `ach-row ${a.unlocked ? 'unlocked' : ''}` },
            h('i', { class: 'ach-icon', html: a.unlocked ? ICONS.trophy : ICONS.lock }),
            h(
              'div',
              { class: 'ach-main' },
              h('b', null, a.def.name),
              h('span', null, a.def.description),
              h('div', { class: 'ach-bar' }, h('i', { style: `transform:scaleX(${pct.toFixed(3)})` }), h('em', null, `${Math.floor(a.progress)} / ${a.def.target}`)),
            ),
            h('div', { class: 'ach-reward' }, h('span', { class: 'stat-icon coin', html: ICONS.coin }), `+${a.def.scrap}`, skin ? h('small', null, `${skin.name} skin`) : ACHIEVEMENTS[a.def.id].id === 'arenaChampion' ? h('small', null, 'Endless mode') : null),
          );
        }),
      ),
    );
    this.open();
  }
}

/** Weapon skin gallery: preview, rarity, requirement + progress, equip. */
export class SkinsScreen extends MenuModal {
  onEquip: ((id: string) => void) | null = null;
  private previewWeapon = createWeapon('rifle');

  constructor(parent: HTMLElement) {
    super(parent, 'WEAPON SKINS', 'WEAPON SKINS');
  }

  show(equipped: string, unlocked: (s: SkinDef) => boolean, progress: (s: SkinDef) => AchievementStatus | null): void {
    this.header.replaceChildren(h('p', { class: 'menu-modal-lead' }, 'Skins are earned through achievements. They are purely cosmetic and never change weapon stats.'));
    this.body.replaceChildren(
      h(
        'div',
        { class: 'skin-grid' },
        ...SKIN_ORDER.map((id) => {
          const skin = SKINS[id]!;
          const open = unlocked(skin);
          const p = progress(skin);
          const canvas = h('canvas', { class: 'skin-preview', width: 220, height: 80 });
          drawWeaponIcon(canvas, this.previewWeapon, skin);
          const btn = h('button', { class: `btn btn-small ${id === equipped ? '' : open ? 'btn-primary' : ''}` }, id === equipped ? 'EQUIPPED' : open ? 'EQUIP' : 'LOCKED');
          if (id === equipped || !open) btn.setAttribute('disabled', '');
          else btn.addEventListener('click', () => this.onEquip?.(id));
          return h(
            'div',
            { class: `skin-card rarity-${skin.rarity} ${id === equipped ? 'equipped' : ''} ${open ? '' : 'locked'}` },
            canvas,
            h('b', null, skin.name),
            h('span', { class: 'skin-rarity' }, skin.rarity),
            p && !open ? h('div', { class: 'ach-bar small' }, h('i', { style: `transform:scaleX(${Math.min(1, p.progress / p.def.target).toFixed(3)})` }), h('em', null, `${p.def.name}: ${Math.floor(p.progress)}/${p.def.target}`)) : h('span', { class: 'skin-req' }, skin.achievement ? `Earned: ${ACHIEVEMENTS[skin.achievement].name}` : 'Always available'),
            btn,
          );
        }),
      ),
    );
    this.open();
  }
}
