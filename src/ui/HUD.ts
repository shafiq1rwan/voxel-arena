import type { SkinPalette, WeaponDefinition } from '../combat/WeaponTypes';
import { drawWeaponIcon } from './weaponIcon';
import { WavePhase } from '../waves/WaveManager';
import { ICONS, h, setStyle, setText } from './dom';
import { Minimap } from './Minimap';
import type { OwnedUpgrade } from '../upgrades/UpgradeManager';
import { ICONS as LIB_ICONS, upgradeIcon } from './icons';
import type { MutationDef } from '../upgrades/SynergyManager';
import { TIER_COLORS, TIER_NAMES } from '../pickups/WeaponCrates';

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  ammo: number;
  reserve: number;
  magazineSize: number;
  reloadProgress: number;
  wave: number;
  phase: WavePhase;
  phaseTimer: number;
  killedThisWave: number;
  totalThisWave: number;
  kills: number;
  score: number;
  /** Current spread half-angle (radians). */
  spread: number;
  /** Camera vertical FOV (radians). */
  fov: number;
  ads: number;
  playerX: number;
  playerZ: number;
  yaw: number;
  /** Shield points; the shield bar is only shown while maxShield > 0. */
  shield?: number;
  maxShield?: number;
  /** Short description of the wave from the wave table. */
  waveLabel?: string;
  /** Dash cooldown 0 (ready) .. 1 (just used); undefined when dash is locked. */
  dashCooldown?: number;
  /** Grenade cooldown 0..1; undefined when locked. */
  grenadeCooldown?: number;
}

interface DamageIndicator {
  el: HTMLElement;
  fromX: number;
  fromZ: number;
  life: number;
}

/**
 * Desktop HUD (DOM overlay). Layout follows the art direction: minimap top-left, wave tracker
 * top-centre, kills/score/pause top-right, health bottom-left, weapon + ammo bottom-right.
 * Per-frame updates only touch the DOM when values change.
 */
export class HUD {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  onPauseClick: (() => void) | null = null;

  private waveLabel: HTMLElement;
  private waveCount: HTMLElement;
  private waveFill: HTMLElement;
  private killsEl: HTMLElement;
  private scoreEl: HTMLElement;
  private hpFill: HTMLElement;
  private hpGhost: HTMLElement;
  private hpText: HTMLElement;
  private ammoEl: HTMLElement;
  private reserveEl: HTMLElement;
  private weaponName: HTMLElement;
  private weaponIcon: HTMLCanvasElement;
  private slotsEl: HTMLElement;
  private bossBar: HTMLElement;
  private bossFill: HTMLElement;
  private bossName: HTMLElement;
  private bossPips: HTMLElement[] = [];
  private prompt: HTMLElement;
  private grenadeSlot: HTMLElement | null = null;
  private grenadeShade: HTMLElement | null = null;
  private shieldBar: HTMLElement;
  private abilityBar: HTMLElement;
  private dashSlot: HTMLElement | null = null;
  private dashShade: HTMLElement | null = null;
  private shieldFill: HTMLElement;
  private reloadBar: HTMLElement;
  private reloadFill: HTMLElement;
  private crosshair: HTMLElement;
  private hitmarker: HTMLElement;
  private banner: HTMLElement;
  private bannerTitle: HTMLElement;
  private bannerSub: HTMLElement;
  private vignette: HTMLElement;
  private damageFlash: HTMLElement;
  private indicators: DamageIndicator[] = [];
  private fpsEl: HTMLElement;
  private debugEl: HTMLElement;
  private toastEl: HTMLElement;
  private ghostHp = 100;
  private lastPhase: WavePhase | null = null;
  private lastWave = -1;
  private bannerTimer = 0;
  private toastTimer = 0;
  private lowAmmoWarned = false;

  constructor(parent: HTMLElement) {
    this.minimap = new Minimap(118);

    this.waveLabel = h('div', { class: 'wave-label' }, 'WAVE 1');
    this.waveFill = h('div', { class: 'bar-fill wave-fill' });
    this.waveCount = h('span', { class: 'bar-text' }, '0 / 0');
    this.killsEl = h('span', { class: 'stat-value' }, '0');
    this.scoreEl = h('span', { class: 'stat-value' }, '0');
    this.hpFill = h('div', { class: 'bar-fill hp' });
    this.hpGhost = h('div', { class: 'bar-ghost' });
    this.hpText = h('span', { class: 'bar-text' }, '100 / 100');
    this.ammoEl = h('span', { class: 'ammo-mag' }, '30');
    this.reserveEl = h('span', { class: 'ammo-reserve' }, '/ 150');
    this.weaponName = h('div', { class: 'weapon-name' }, '');
    this.weaponIcon = h('canvas', { class: 'weapon-icon', width: 192, height: 72 });
    this.slotsEl = h('div', { class: 'weapon-slots' });
    this.bossFill = h('div', { class: 'bar-fill boss' });
    this.bossName = h('span', { class: 'boss-name' });
    for (let i = 0; i < 3; i++) this.bossPips.push(h('i', { class: 'boss-pip' }));
    this.bossBar = h('div', { class: 'boss-bar hidden' }, h('div', { class: 'boss-head' }, this.bossName, h('span', { class: 'boss-pips' }, ...this.bossPips)), h('div', { class: 'bar boss-track' }, this.bossFill));
    this.prompt = h('div', { class: 'interact-prompt hidden' });
    this.shieldFill = h('div', { class: 'bar-fill shield' });
    this.shieldBar = h('div', { class: 'bar shield-bar hidden' }, this.shieldFill);
    this.abilityBar = h('div', { class: 'hud-bc ability-bar' });
    this.reloadFill = h('div', { class: 'reload-fill' });
    this.reloadBar = h('div', { class: 'reload-bar' }, h('span', null, 'RELOADING'), h('div', { class: 'reload-track' }, this.reloadFill));
    this.crosshair = h('div', { class: 'crosshair' }, h('i', { class: 'ch-t' }), h('i', { class: 'ch-b' }), h('i', { class: 'ch-l' }), h('i', { class: 'ch-r' }), h('b', { class: 'ch-dot' }));
    this.hitmarker = h('div', { class: 'hitmarker' }, h('i'), h('i'), h('i'), h('i'));
    this.bannerTitle = h('div', { class: 'banner-title' });
    this.bannerSub = h('div', { class: 'banner-sub' });
    this.banner = h('div', { class: 'banner' }, this.bannerTitle, this.bannerSub);
    this.vignette = h('div', { class: 'vignette' });
    this.damageFlash = h('div', { class: 'damage-flash' });
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.debugEl = h('div', { class: 'debug-panel hidden' });
    this.toastEl = h('div', { class: 'toast' });
    const pauseBtn = h('button', { class: 'pause-btn', 'aria-label': 'Pause (Esc)', html: `${ICONS.pause}<span>ESC</span>` });
    pauseBtn.addEventListener('click', () => this.onPauseClick?.());

    const indicatorLayer = h('div', { class: 'dmg-indicators' });
    for (let i = 0; i < 4; i++) {
      const el = h('div', { class: 'dmg-indicator' }, h('i'));
      indicatorLayer.append(el);
      this.indicators.push({ el, fromX: 0, fromZ: 0, life: 0 });
    }

    this.root = h(
      'div',
      { id: 'hud', class: 'hud hidden' },
      this.vignette,
      this.damageFlash,
      indicatorLayer,
      h('div', { class: 'hud-tl' }, h('div', { class: 'minimap-frame' }, this.minimap.canvas)),
      h('div', { class: 'hud-tc' }, h('div', { class: 'wave-tab' }, this.waveLabel), h('div', { class: 'wave-bar' }, h('div', { class: 'wave-track' }, this.waveFill), this.waveCount), this.bossBar),
      h(
        'div',
        { class: 'hud-tr' },
        h(
          'div',
          { class: 'hud-panel stat-panel' },
          h('div', { class: 'stat' }, h('span', { class: 'stat-icon skull', html: ICONS.skull }), this.killsEl),
          h('div', { class: 'stat' }, h('span', { class: 'stat-icon coin', html: ICONS.coin }), this.scoreEl),
        ),
        pauseBtn,
      ),
      this.crosshair,
      this.hitmarker,
      this.banner,
      this.toastEl,
      h(
        'div',
        { class: 'hud-bl' },
        h('div', { class: 'portrait-frame' }, h('canvas', { class: 'portrait', width: 8, height: 8 })),
        h('div', { class: 'hud-panel vitals' }, h('div', { class: 'bar hp-bar', 'aria-label': 'Health' }, this.hpGhost, this.hpFill, this.hpText), this.shieldBar),
      ),
      h(
        'div',
        { class: 'hud-br' },
        this.slotsEl,
        this.reloadBar,
        h(
          'div',
          { class: 'hud-panel weapon-panel' },
          h('div', { class: 'weapon-icon-box' }, this.weaponIcon),
          h('div', { class: 'weapon-meta' }, this.weaponName, h('div', { class: 'ammo' }, this.ammoEl, this.reserveEl)),
        ),
      ),
      this.abilityBar,
      this.prompt,
      this.fpsEl,
      this.debugEl,
    );
    parent.append(this.root);
    drawPortrait(this.root.querySelector('.portrait') as HTMLCanvasElement);
  }

  /** Rebuilds the bottom-centre bar: active abilities (key + cooldown), passive upgrades, mutations. */
  setBuild(owned: OwnedUpgrade[], dashUnlocked: boolean, grenadeUnlocked = false, mutations: MutationDef[] = []): void {
    const slots: HTMLElement[] = [];
    this.dashSlot = this.dashShade = null;
    this.grenadeSlot = this.grenadeShade = null;
    if (dashUnlocked) {
      this.dashShade = h('div', { class: 'ability-cooldown' });
      this.dashSlot = h('div', { class: 'ability-slot active-ability cat-utility' }, h('div', { class: 'ability-icon', html: upgradeIcon('dashCharge') }), this.dashShade, h('kbd', { class: 'ability-key' }, 'Q'));
      slots.push(this.dashSlot);
    }
    if (grenadeUnlocked) {
      this.grenadeShade = h('div', { class: 'ability-cooldown' });
      this.grenadeSlot = h('div', { class: 'ability-slot active-ability cat-offense' }, h('div', { class: 'ability-icon', html: LIB_ICONS.grenade }), this.grenadeShade, h('kbd', { class: 'ability-key' }, 'G'));
      slots.push(this.grenadeSlot);
    }
    for (const m of mutations) {
      slots.push(h('div', { class: 'ability-slot passive mutation', title: `${m.name}: ${m.description}` }, h('div', { class: 'ability-icon', html: LIB_ICONS.trophy })));
    }
    for (const o of owned) {
      if (o.def.id === 'dashCharge') continue;
      slots.push(
        h(
          'div',
          { class: `ability-slot passive cat-${o.def.category}`, title: `${o.def.name} ×${o.stacks}` },
          h('div', { class: 'ability-icon', html: upgradeIcon(o.def.id) }),
          o.stacks > 1 ? h('b', { class: 'ability-count' }, String(o.stacks)) : null,
        ),
      );
    }
    this.abilityBar.replaceChildren(...slots);
  }

  /** Boss health bar under the wave tracker (null hides it). */
  setBoss(name: string | null, hpFraction = 1, phase = 1): void {
    this.bossBar.classList.toggle('hidden', name === null);
    if (name === null) return;
    setText(this.bossName, name.toUpperCase());
    setStyle(this.bossFill, 'transform', `scaleX(${Math.max(0, hpFraction)})`);
    this.bossPips.forEach((p, i) => p.classList.toggle('on', i < phase));
  }

  /** "[F] TAKE weapon" prompt when standing next to a crate. */
  setPrompt(def: WeaponDefinition | null, touch: boolean): void {
    this.prompt.classList.toggle('hidden', !def);
    if (!def) return;
    const tier = Math.min(def.tier, 5);
    const key = touch ? 'TAP TAKE' : 'F';
    const sig = `${key}|${def.id}`;
    if (this.prompt.dataset.sig === sig) return;
    this.prompt.dataset.sig = sig;
    this.prompt.replaceChildren(h('kbd', null, key), h('span', null, 'TAKE '), h('b', { style: `color:${TIER_COLORS[tier]}` }, def.name), h('small', null, ` · ${TIER_NAMES[tier]}`));
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Weapon inventory (up to 3 slots) plus the held weapon's name and icon. */
  setWeapons(slots: readonly { def: WeaponDefinition }[], current: number, skin: SkinPalette, displayName: string): void {
    setText(this.weaponName, displayName.toUpperCase());
    drawWeaponIcon(this.weaponIcon, slots[current]!.def, skin, '#f2f5fb');
    this.slotsEl.replaceChildren(
      ...slots.map((slot, i) => {
        const c = h('canvas', { class: 'slot-icon', width: 128, height: 48 });
        drawWeaponIcon(c, slot.def, skin, i === current ? '#e3ebf8' : '#8592a8');
        return h('div', { class: `weapon-slot ${i === current ? 'active' : ''}` }, h('b', { class: 'slot-num' }, String(i + 1)), c);
      }),
    );
  }

  setWeapon(def: WeaponDefinition, skin: SkinPalette): void {
    this.setWeapons([{ def }], 0, skin, def.name);
  }



  resetRun(maxHealth: number): void {
    this.ghostHp = maxHealth;
    this.lastPhase = null;
    this.lastWave = -1;
    this.bannerTimer = 0;
    this.banner.classList.remove('show');
    for (const ind of this.indicators) {
      ind.life = 0;
      ind.el.style.opacity = '0';
    }
    this.damageFlash.style.opacity = '0';
  }

  hit(kind: 'normal' | 'crit' | 'kill'): void {
    this.hitmarker.className = `hitmarker ${kind}`;
    this.hitmarker.getAnimations().forEach((a) => a.cancel());
    this.hitmarker.animate(
      [
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.9)' },
      ],
      { duration: kind === 'kill' ? 380 : 220, easing: 'ease-out' },
    );
  }

  damaged(fromX: number, fromZ: number, amount: number): void {
    // Reuse the oldest indicator.
    let slot = this.indicators[0]!;
    for (const ind of this.indicators) if (ind.life < slot.life) slot = ind;
    slot.fromX = fromX;
    slot.fromZ = fromZ;
    slot.life = 1;
    this.damageFlash.getAnimations().forEach((a) => a.cancel());
    this.damageFlash.animate([{ opacity: Math.min(0.85, 0.3 + amount * 0.03) }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }

  showBanner(title: string, sub: string, seconds: number, tone: 'normal' | 'good' | 'bad' = 'normal'): void {
    setText(this.bannerTitle, title);
    setText(this.bannerSub, sub);
    this.banner.className = `banner show ${tone}`;
    this.bannerTimer = seconds;
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
    this.bannerTimer = 0;
  }

  toast(text: string, seconds = 1.6): void {
    setText(this.toastEl, text);
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  setFps(visible: boolean, fps: number): void {
    this.fpsEl.classList.toggle('hidden', !visible);
    if (visible) setText(this.fpsEl, `${Math.round(fps)} FPS`);
  }

  setDebug(text: string | null): void {
    this.debugEl.classList.toggle('hidden', text === null);
    if (text !== null) setText(this.debugEl, text);
  }

  update(dt: number, s: HudSnapshot): void {
    // --- Wave tracker ---
    if (s.wave !== this.lastWave) {
      setText(this.waveLabel, `WAVE ${s.wave}`);
      this.lastWave = s.wave;
    }
    const remaining = Math.max(0, s.totalThisWave - s.killedThisWave);
    setText(this.waveCount, `${remaining} / ${s.totalThisWave}`);
    setStyle(this.waveFill, 'transform', `scaleX(${s.totalThisWave > 0 ? remaining / s.totalThisWave : 0})`);

    if (s.phase !== this.lastPhase) {
      if (s.phase === WavePhase.Prepare) this.showBanner(`WAVE ${s.wave}`, s.waveLabel ?? 'Get ready', 2.2);
      else if (s.phase === WavePhase.Reward) this.showBanner('WAVE COMPLETE', `Wave ${s.wave} cleared`, 2.6, 'good');
      this.lastPhase = s.phase;
    }

    setText(this.killsEl, String(s.kills));
    setText(this.scoreEl, String(s.score));

    // --- Health ---
    const hpFrac = Math.max(0, s.health / s.maxHealth);
    setStyle(this.hpFill, 'transform', `scaleX(${hpFrac})`);
    this.ghostHp = Math.max(s.health, this.ghostHp - dt * 40);
    setStyle(this.hpGhost, 'transform', `scaleX(${Math.max(0, this.ghostHp / s.maxHealth)})`);
    setText(this.hpText, `${Math.ceil(s.health)} / ${s.maxHealth}`);
    this.hpFill.classList.toggle('low', hpFrac < 0.3);
    const maxShield = s.maxShield ?? 0;
    this.shieldBar.classList.toggle('hidden', maxShield <= 0);
    if (maxShield > 0) setStyle(this.shieldFill, 'transform', `scaleX(${Math.max(0, (s.shield ?? 0) / maxShield)})`);
    setStyle(this.vignette, 'opacity', hpFrac < 0.35 ? String((0.35 - hpFrac) * 2.4) : '0');

    if (this.grenadeShade && s.grenadeCooldown !== undefined) {
      setStyle(this.grenadeShade, 'transform', `scaleY(${s.grenadeCooldown})`);
      this.grenadeSlot!.classList.toggle('ready', s.grenadeCooldown <= 0);
    }
    // --- Dash cooldown sweep ---
    if (this.dashShade && s.dashCooldown !== undefined) {
      setStyle(this.dashShade, 'transform', `scaleY(${s.dashCooldown})`);
      this.dashSlot!.classList.toggle('ready', s.dashCooldown <= 0);
    }

    // --- Ammo ---
    setText(this.ammoEl, String(s.ammo));
    setText(this.reserveEl, `/ ${s.reserve}`);
    const lowAmmo = s.ammo <= Math.ceil(s.magazineSize * 0.25);
    this.ammoEl.classList.toggle('low', lowAmmo);
    if (s.ammo === 0 && s.reserve === 0 && !this.lowAmmoWarned) {
      this.toast('OUT OF AMMO — find ammo crates', 2.5);
      this.lowAmmoWarned = true;
    } else if (s.reserve > 0) this.lowAmmoWarned = false;
    const reloading = s.reloadProgress >= 0;
    this.reloadBar.classList.toggle('show', reloading);
    if (reloading) setStyle(this.reloadFill, 'transform', `scaleX(${s.reloadProgress})`);

    // --- Crosshair: gap matches the real spread cone on screen ---
    const halfH = window.innerHeight / 2;
    const gap = 5 + (Math.tan(s.spread) / Math.tan(s.fov / 2)) * halfH;
    setStyle(this.crosshair, '--gap', `${gap.toFixed(1)}px`);
    setStyle(this.crosshair, 'opacity', String(1 - s.ads * 0.75));

    // --- Damage direction indicators ---
    for (const ind of this.indicators) {
      if (ind.life <= 0) continue;
      ind.life -= dt;
      const ang = Math.atan2(ind.fromX - s.playerX, ind.fromZ - s.playerZ) - s.yaw;
      ind.el.style.transform = `rotate(${ang}rad)`;
      ind.el.style.opacity = String(Math.max(0, ind.life));
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }
}

/** 8x8 voxel face portrait for the player. */
function drawPortrait(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const rows = ['HHHHHHHH', 'HHHHHHHH', 'HSSSSSSH', 'SSSSSSSS', 'SWBSSBWS', 'SSSSSSSS', 'SSSMMSSS', 'SSSSSSSS'];
  const colors: Record<string, string> = { H: '#3b2a1f', S: '#d9a77c', W: '#ffffff', B: '#2f5fd0', M: '#8a4a3a' };
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    ctx.fillStyle = colors[c]!;
    ctx.fillRect(x, y, 1, 1);
  }));
}
