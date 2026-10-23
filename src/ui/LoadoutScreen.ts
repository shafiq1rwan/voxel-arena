import { BASE_STATS } from '../procedural/WeaponGenerator';
import { WEAPON_FAMILIES, type WeaponDefinition, type WeaponFamily } from '../combat/WeaponTypes';
import type { GameMode } from '../progression/SaveManager';
import { SKINS, SKIN_ORDER, type SkinDef } from '../progression/Skins';
import { MODIFIER_SCRAP_BONUS, UNLOCKS } from '../progression/UnlockManager';
import { TIER_COLORS, TIER_NAMES } from '../pickups/WeaponCrates';
import { ICONS, h, setText } from './dom';
import { drawWeaponIcon } from './weaponIcon';

export interface LoadoutView {
  family: WeaponFamily;
  weapon: WeaponDefinition;
  familyUnlocked: (f: WeaponFamily) => boolean;
  familyCost: (f: WeaponFamily) => number;
  skinId: string;
  skinUnlocked: (s: SkinDef) => boolean;
  mode: GameMode;
  endlessUnlocked: boolean;
  modifiers: string[];
  modifierUnlocked: (id: string) => boolean;
  scrap: number;
}

const FAMILY_LABEL: Record<WeaponFamily, string> = { rifle: 'Assault Rifle', shotgun: 'Shotgun', smg: 'SMG' };
const FAMILY_BLURB: Record<WeaponFamily, string> = {
  rifle: 'Balanced, accurate, medium range.',
  shotgun: 'Seven pellets. Devastating up close.',
  smg: 'Rapid fire, low damage per hit.',
};

/**
 * Loadout: pick the starting weapon family, reroll its procedural components, choose a skin,
 * game mode and challenge modifiers. The left half of the screen shows the real 3D weapon model.
 */
export class LoadoutScreen {
  readonly root: HTMLElement;
  onFamily: ((f: WeaponFamily) => void) | null = null;
  onReroll: (() => void) | null = null;
  onSkin: ((id: string) => void) | null = null;
  onMode: ((m: GameMode) => void) | null = null;
  onModifier: ((id: string, on: boolean) => void) | null = null;
  onStart: ((seedText: string) => void) | null = null;
  onBack: (() => void) | null = null;
  private body: HTMLElement;
  private seedInput: HTMLInputElement;
  private weaponName: HTMLElement;

  constructor(parent: HTMLElement) {
    this.body = h('div', { class: 'loadout-body' });
    this.seedInput = h('input', { class: 'seed-input', type: 'text', maxlength: 12, placeholder: 'Random', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Arena seed' });
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onStart?.(this.seedInput.value);
    });
    const start = h('button', { class: 'btn btn-primary btn-xl' }, 'START RUN');
    start.addEventListener('click', () => this.onStart?.(this.seedInput.value));
    const back = h('button', { class: 'btn' }, 'BACK');
    back.addEventListener('click', () => this.onBack?.());
    this.weaponName = h('div', { class: 'loadout-preview-name' });
    this.root = h(
      'div',
      { class: 'screen loadout hidden' },
      h('div', { class: 'loadout-preview' }, this.weaponName, h('div', { class: 'loadout-preview-hint' }, 'Weapon preview')),
      h(
        'div',
        { class: 'panel loadout-panel' },
        h('span', { class: 'panel-tag' }, 'LOADOUT'),
        this.body,
        h('label', { class: 'seed-row' }, h('span', null, 'Arena seed'), this.seedInput),
        h('div', { class: 'modal-actions two loadout-actions' }, back, start),
      ),
    );
    parent.append(this.root);
  }

  setSeed(text: string): void {
    this.seedInput.value = text.slice(0, 12).toUpperCase();
  }

  show(v: LoadoutView): void {
    this.render(v);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  render(v: LoadoutView): void {
    const w = v.weapon;
    setText(this.weaponName, w.name.toUpperCase());
    const tierColor = TIER_COLORS[Math.min(w.tier, 5)]!;

    // --- families ---
    const families = h(
      'div',
      { class: 'family-row' },
      ...WEAPON_FAMILIES.map((f) => {
        const unlocked = v.familyUnlocked(f);
        const card = h(
          'button',
          { class: `family-card ${f === v.family ? 'selected' : ''} ${unlocked ? '' : 'locked'}`, 'aria-pressed': String(f === v.family) },
          h('b', null, FAMILY_LABEL[f]),
          h('span', null, unlocked ? FAMILY_BLURB[f] : `Unlock in Upgrades · ${v.familyCost(f)} Scrap`),
        );
        if (unlocked) card.addEventListener('click', () => this.onFamily?.(f));
        else card.setAttribute('disabled', '');
        return card;
      }),
    );

    // --- stats (bars relative to the best family value) ---
    const s = w.stats;
    const dps = s.damage * s.pellets * s.fireRate;
    const maxDps = Math.max(...WEAPON_FAMILIES.map((f) => BASE_STATS[f].damage * BASE_STATS[f].pellets * BASE_STATS[f].fireRate)) * 1.4;
    const bars: [string, number, string][] = [
      ['Damage / sec', dps / maxDps, Math.round(dps).toString()],
      ['Fire rate', s.fireRate / 14, `${s.fireRate.toFixed(1)}/s`],
      ['Magazine', s.magazineSize / 80, String(s.magazineSize)],
      ['Reload', 1 - (s.reloadTime - 0.6) / 2.4, `${s.reloadTime.toFixed(2)} s`],
      ['Accuracy', 1 - Math.min(1, s.spreadHip / 0.09), `${Math.round((1 - Math.min(1, s.spreadHip / 0.09)) * 100)}`],
      ['Range', s.range / 160, `${Math.round(s.range)} m`],
    ];
    const icon = h('canvas', { class: 'loadout-icon', width: 240, height: 90 });
    drawWeaponIcon(icon, w, SKINS[v.skinId] ?? SKINS.default!);
    const reroll = h('button', { class: 'btn btn-small' }, 'REROLL');
    reroll.addEventListener('click', () => this.onReroll?.());

    const weaponBlock = h(
      'div',
      { class: 'loadout-weapon' },
      h('div', { class: 'loadout-weapon-head' }, h('div', null, h('b', { class: 'loadout-weapon-name' }, w.name), h('span', { class: 'tier-tag', style: `color:${tierColor};border-color:${tierColor}` }, TIER_NAMES[Math.min(w.tier, 5)]!)), reroll),
      icon,
      h('div', { class: 'stat-bars' }, ...bars.map(([k, f, val]) => h('div', { class: 'stat-bar' }, h('span', null, k), h('div', { class: 'stat-track' }, h('i', { style: `transform:scaleX(${Math.max(0.04, Math.min(1, f)).toFixed(3)})` })), h('b', null, val)))),
      h('ul', { class: 'component-list' }, ...w.componentNames.map((c) => h('li', null, c))),
    );

    // --- skins ---
    const skins = h(
      'div',
      { class: 'skin-row' },
      ...SKIN_ORDER.map((id) => {
        const skin = SKINS[id]!;
        const unlocked = v.skinUnlocked(skin);
        const b = h(
          'button',
          {
            class: `skin-swatch rarity-${skin.rarity} ${id === v.skinId ? 'selected' : ''} ${unlocked ? '' : 'locked'}`,
            title: unlocked ? skin.name : `${skin.name} — locked`,
            style: `--a:${skin.primary};--b:${skin.accent};--c:${skin.emissive}`,
          },
          unlocked ? null : h('i', { class: 'lock', html: ICONS.lock }),
        );
        if (unlocked) b.addEventListener('click', () => this.onSkin?.(id));
        return b;
      }),
    );

    // --- mode + modifiers ---
    const modeBtn = (m: GameMode, label: string, enabled: boolean) => {
      const b = h('button', { class: `chip ${v.mode === m ? 'selected' : ''} ${enabled ? '' : 'locked'}` }, label);
      if (enabled) b.addEventListener('click', () => this.onMode?.(m));
      else b.setAttribute('disabled', '');
      return b;
    };
    const mods = UNLOCKS.filter((u) => u.category === 'modifier');
    const modifiers = h(
      'div',
      { class: 'chip-row' },
      ...mods.map((m) => {
        const unlocked = v.modifierUnlocked(m.id);
        const on = v.modifiers.includes(m.id);
        const b = h('button', { class: `chip ${on ? 'selected' : ''} ${unlocked ? '' : 'locked'}`, title: m.description }, `${m.name} +${Math.round((MODIFIER_SCRAP_BONUS[m.id] ?? 0) * 100)}%`);
        if (unlocked) b.addEventListener('click', () => this.onModifier?.(m.id, !on));
        else b.setAttribute('disabled', '');
        return b;
      }),
    );

    this.body.replaceChildren(
      h('div', { class: 'loadout-scrap' }, h('span', { class: 'stat-icon coin', html: ICONS.coin }), `${v.scrap} Scrap`),
      h('h3', { class: 'section-title' }, 'Starting weapon'),
      families,
      weaponBlock,
      h('h3', { class: 'section-title' }, `Skin · ${(SKINS[v.skinId] ?? SKINS.default!).name}`),
      skins,
      h('h3', { class: 'section-title' }, 'Mode'),
      h('div', { class: 'chip-row' }, modeBtn('standard', 'Standard · 10 waves + boss', true), modeBtn('endless', v.endlessUnlocked ? 'Endless' : 'Endless (locked)', v.endlessUnlocked)),
      h('h3', { class: 'section-title' }, 'Challenges'),
      modifiers,
    );
  }
}
