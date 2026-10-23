import type { SkinPalette, WeaponDefinition } from '../combat/WeaponTypes';
import { WavePhase } from '../waves/WaveManager';
import { ICONS, h, setStyle, setText } from './dom';
import { Minimap } from './Minimap';

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
  private slotIcon: HTMLCanvasElement;
  private shieldBar: HTMLElement;
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
    this.slotIcon = h('canvas', { class: 'slot-icon', width: 128, height: 48 });
    this.shieldFill = h('div', { class: 'bar-fill shield' });
    this.shieldBar = h('div', { class: 'bar shield-bar hidden' }, this.shieldFill);
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
      h('div', { class: 'hud-tc' }, h('div', { class: 'wave-tab' }, this.waveLabel), h('div', { class: 'wave-bar' }, h('div', { class: 'wave-track' }, this.waveFill), this.waveCount)),
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
        h('div', { class: 'weapon-slots' }, h('div', { class: 'weapon-slot active' }, h('b', { class: 'slot-num' }, '1'), this.slotIcon)),
        this.reloadBar,
        h(
          'div',
          { class: 'hud-panel weapon-panel' },
          h('div', { class: 'weapon-icon-box' }, this.weaponIcon),
          h('div', { class: 'weapon-meta' }, this.weaponName, h('div', { class: 'ammo' }, this.ammoEl, this.reserveEl)),
        ),
      ),
      this.fpsEl,
      this.debugEl,
    );
    parent.append(this.root);
    drawPortrait(this.root.querySelector('.portrait') as HTMLCanvasElement);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setWeapon(def: WeaponDefinition, skin: SkinPalette): void {
    setText(this.weaponName, def.name.toUpperCase());
    drawWeaponIcon(this.weaponIcon, def, skin, '#f2f5fb');
    drawWeaponIcon(this.slotIcon, def, skin, '#9aa7bd');
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
      if (s.phase === WavePhase.Prepare) this.showBanner(`WAVE ${s.wave}`, s.wave === 1 ? 'Survive the arena' : 'Get ready', 2.2);
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

/** Side-view silhouette of the procedural weapon, drawn from its actual parts and skin. */
function drawWeaponIcon(canvas: HTMLCanvasElement, def: WeaponDefinition, skin: SkinPalette, mono?: string): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const parts = [...def.parts, ...def.magazine];
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    minZ = Math.min(minZ, p.c[2] - p.s[2] / 2);
    maxZ = Math.max(maxZ, p.c[2] + p.s[2] / 2);
    minY = Math.min(minY, p.c[1] - p.s[1] / 2);
    maxY = Math.max(maxY, p.c[1] + p.s[1] / 2);
  }
  const pad = 4;
  const scale = Math.min((canvas.width - pad * 2) / (maxZ - minZ), (canvas.height - pad * 2) / (maxY - minY));
  const offX = (canvas.width - (maxZ - minZ) * scale) / 2;
  const offY = (canvas.height - (maxY - minY) * scale) / 2;
  // Draw largest parts first so details sit on top.
  const sorted = parts.slice().sort((a, b) => b.s[0] * b.s[1] * b.s[2] - a.s[0] * a.s[1] * a.s[2]);
  for (const p of sorted) {
    ctx.fillStyle = mono ?? skin[p.slot];
    const x = offX + (p.c[2] - p.s[2] / 2 - minZ) * scale;
    const y = offY + (maxY - (p.c[1] + p.s[1] / 2)) * scale;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(p.s[2] * scale)), Math.max(1, Math.round(p.s[1] * scale)));
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
