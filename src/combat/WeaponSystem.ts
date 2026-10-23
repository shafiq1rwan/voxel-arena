import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { AudioManager, SfxName } from '../audio/AudioManager';
import type { EventBus, GameEvents } from '../core/EventBus';
import { damp } from '../core/MathUtil';
import type { EnemyPool } from '../enemies/EnemyPool';
import type { PlayerController } from '../player/PlayerController';
import type { InputState } from '../player/InputState';
import type { Effects } from '../render/Effects';
import type { DamageSystem } from './DamageSystem';
import type { HitDetection } from './HitDetection';
import type { WeaponViewModel } from './WeaponViewModel';
import type { SkinPalette, WeaponDefinition, WeaponStats } from './WeaponTypes';
import { MODIFIER_CAPS, type UpgradeModifiers } from '../upgrades/UpgradeTypes';

const muzzle = new Vector3();
const SFX: Record<string, SfxName> = { rifle: 'rifle', shotgun: 'shotgun', smg: 'smg' };

export interface WeaponRunStats {
  shotsFired: number;
  shotsHit: number;
  headshots: number;
}

/**
 * Handles firing cadence, spread/bloom, ammo and reloading for the equipped weapon, and turns
 * hitscan results into damage + feedback. Stats are a mutable copy so upgrades can modify them.
 */
export class WeaponSystem {
  def!: WeaponDefinition;
  stats!: WeaponStats;
  ammo = 0;
  reserve = 0;
  reloading = false;
  reloadTimer = 0;
  /** 0..1 aim-down-sights blend. */
  ads = 0;
  bloom = 0;
  readonly runStats: WeaponRunStats = { shotsFired: 0, shotsHit: 0, headshots: 0 };
  private cooldown = 0;
  private lightTimer = 0;

  constructor(
    private camera: FreeCamera,
    private viewModel: WeaponViewModel,
    private hits: HitDetection,
    private damage: DamageSystem,
    private pool: EnemyPool,
    private effects: Effects,
    private audio: AudioManager,
    private bus: EventBus<GameEvents>,
    private muzzleLight: PointLight,
  ) {}

  equip(def: WeaponDefinition, skin: SkinPalette): void {
    this.def = def;
    this.stats = { ...def.stats };
    this.ammo = this.stats.magazineSize;
    this.reserve = this.stats.reserveStart;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.ads = 0;
    this.runStats.shotsFired = this.runStats.shotsHit = this.runStats.headshots = 0;
    this.viewModel.build(def, skin);
  }

  /**
   * Recomputes live stats from the weapon's base stats and the run's upgrade modifiers (with caps).
   * A larger magazine is topped up immediately so the upgrade is felt right away.
   */
  applyModifiers(m: Readonly<UpgradeModifiers>): void {
    const b = this.def.stats;
    const s = this.stats;
    const prevMag = s.magazineSize;
    const magMul = Math.min(MODIFIER_CAPS.magazineMul, m.magazineMul);
    s.damage = b.damage * Math.min(MODIFIER_CAPS.damageMul, m.damageMul);
    s.fireRate = b.fireRate * Math.min(MODIFIER_CAPS.fireRateMul, m.fireRateMul);
    s.critChance = Math.min(MODIFIER_CAPS.crit, b.critChance + m.critAdd);
    s.pierce = Math.min(MODIFIER_CAPS.pierce, b.pierce + m.pierce);
    s.magazineSize = Math.round(b.magazineSize * magMul);
    s.reserveMax = Math.round(b.reserveMax * magMul);
    s.reloadTime = b.reloadTime * Math.max(MODIFIER_CAPS.reloadMulMin, m.reloadMul);
    if (s.magazineSize > prevMag) this.ammo = Math.min(s.magazineSize, this.ammo + (s.magazineSize - prevMag));
  }

  /** Reload progress 0..1, or -1 when not reloading. */
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.stats.reloadTime : -1;
  }

  /** Current spread cone half-angle (radians) — drives the dynamic crosshair. */
  currentSpread(player: PlayerController): number {
    const s = this.stats;
    const base = s.spreadHip + (s.spreadAds - s.spreadHip) * this.ads;
    const movePenalty = Math.min(1, player.moveAmount) * s.spreadHip * 0.8 * (1 - this.ads * 0.7) + (player.grounded ? 0 : s.spreadHip * 1.5);
    return base + this.bloom + movePenalty;
  }

  addAmmo(magazines: number): number {
    const amount = Math.round(this.stats.magazineSize * magazines);
    const before = this.reserve;
    this.reserve = Math.min(this.stats.reserveMax, this.reserve + amount);
    return this.reserve - before;
  }

  startReload(): void {
    if (this.reloading || this.ammo >= this.stats.magazineSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.stats.reloadTime;
    this.audio.play('reload');
    this.bus.emit('weapon:reloadStart', { duration: this.stats.reloadTime });
  }

  update(dt: number, input: InputState, player: PlayerController, canFire: boolean): void {
    const s = this.stats;
    const wantAds = input.aim && !player.sprinting && canFire;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * damp(14, dt);
    this.bloom = Math.max(0, this.bloom - dt * (s.bloomMax * 3 + 0.02));
    this.cooldown = Math.max(-0.05, this.cooldown - dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = s.magazineSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloading = false;
        this.audio.play('reloadDone');
        this.bus.emit('weapon:reloadEnd', {});
      }
    }

    if (input.reloadPressed && canFire) this.startReload();

    if (canFire && input.fire && !this.reloading) {
      if (this.ammo <= 0) {
        if (this.cooldown <= 0) {
          if (this.reserve > 0) this.startReload();
          else {
            this.audio.play('dry');
            this.bus.emit('weapon:dryFire', {});
            this.cooldown = 0.25;
          }
        }
      } else {
        const interval = 1 / s.fireRate;
        // Accumulate so high fire rates stay accurate at low frame rates.
        while (this.cooldown <= 0 && this.ammo > 0) {
          this.fire(player);
          this.cooldown += interval;
        }
      }
    } else if (this.cooldown < 0) {
      this.cooldown = 0;
    }

    this.lightTimer -= dt;
    this.muzzleLight.intensity = this.lightTimer > 0 ? 2.2 * (this.lightTimer / 0.06) : 0;

    this.viewModel.update({
      dt,
      lookYaw: input.lookYaw,
      lookPitch: input.lookPitch,
      moveAmount: player.moveAmount,
      grounded: player.grounded,
      sprinting: player.sprinting,
      ads: this.ads,
      reload: this.reloadProgress,
    });
  }

  private fire(player: PlayerController): void {
    const s = this.stats;
    this.ammo--;
    this.runStats.shotsFired++;

    const cam = this.camera;
    const yaw = cam.rotation.y;
    const pitch = cam.rotation.x;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    // Camera basis (Babylon left-handed: +z forward at yaw 0, +pitch looks down).
    const fx = sy * cp;
    const fy = -sp;
    const fz = cy * cp;
    const rx = cy;
    const rz = -sy;
    const ux = sy * sp;
    const uy = cp;
    const uz = cy * sp;

    const ox = cam.position.x;
    const oy = cam.position.y;
    const oz = cam.position.z;
    this.viewModel.getMuzzleWorld(muzzle);

    const spread = this.currentSpread(player);
    let anyHit = false;
    let anyHead = false;
    for (let p = 0; p < s.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      let dx = fx + rx * Math.cos(a) * r + ux * Math.sin(a) * r;
      let dy = fy + uy * Math.sin(a) * r;
      let dz = fz + rz * Math.cos(a) * r + uz * Math.sin(a) * r;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;

      const res = this.hits.cast(ox, oy, oz, dx, dy, dz, s.range, this.pool.active, s.pierce);
      for (const h of res.enemies) {
        const e = h.enemy;
        if (!e.alive) continue;
        const crit = Math.random() < s.critChance;
        const falloff = h.distance <= s.falloffStart ? 1 : Math.max(0.6, 1 - ((h.distance - s.falloffStart) / Math.max(1, s.range - s.falloffStart)) * 0.4);
        const amount = s.damage * falloff * (h.headshot ? s.headshotMultiplier : 1) * (crit ? s.critMultiplier : 1);
        const hx = ox + dx * h.distance;
        const hy = oy + dy * h.distance;
        const hz = oz + dz * h.distance;
        this.damage.damageEnemy(e, {
          amount,
          headshot: h.headshot,
          critical: crit || h.headshot,
          x: hx,
          y: hy,
          z: hz,
          dirX: dx,
          dirZ: dz,
          knockback: s.pellets > 1 ? 1.2 : 1.6,
          weaponFamily: this.def.family,
        });
        anyHit = true;
        anyHead ||= h.headshot;
      }
      if (res.worldHit) this.effects.sparkBurst(res.endX, res.endY, res.endZ, res.nx, res.ny, res.nz, s.pellets > 1 ? 2 : 4, 4);
      // Show every shotgun pellet only occasionally to limit tracer spam.
      if (p === 0 || Math.random() < 0.4) this.effects.tracer(muzzle.x, muzzle.y, muzzle.z, res.endX, res.endY, res.endZ);
    }
    if (anyHit) this.runStats.shotsHit++;
    if (anyHead) this.runStats.headshots++;

    this.bloom = Math.min(s.bloomMax, this.bloom + s.bloomPerShot);
    const adsK = 1 - this.ads * 0.45;
    player.kick(s.recoilPitch * adsK, (Math.random() - 0.5) * s.recoilYaw * adsK);
    player.addTrauma(s.pellets > 1 ? 0.22 : 0.04);
    this.viewModel.onFire(s.pellets > 1 ? 2 : 1);
    this.muzzleLight.position.copyFrom(muzzle);
    this.lightTimer = 0.06;
    this.audio.play(SFX[this.def.family] ?? 'rifle');
    this.bus.emit('weapon:fired', { family: this.def.family });
  }
}
