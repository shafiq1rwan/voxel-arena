import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { AudioManager, SfxName } from '../audio/AudioManager';
import type { EventBus, GameEvents } from '../core/EventBus';
import { damp } from '../core/MathUtil';
import type { EnemyPool } from '../enemies/EnemyPool';
import type { PlayerController } from '../player/PlayerController';
import type { InputState } from '../player/InputState';
import type { SkinDef } from '../progression/Skins';
import type { Effects } from '../render/Effects';
import { MODIFIER_CAPS, baseModifiers, type UpgradeModifiers } from '../upgrades/UpgradeTypes';
import type { DamageSystem } from './DamageSystem';
import type { HitDetection } from './HitDetection';
import type { WeaponViewModel } from './WeaponViewModel';
import { MODULE_TUNING, type WeaponDefinition, type WeaponStats } from './WeaponTypes';

const muzzle = new Vector3();
const SFX: Record<string, SfxName> = { rifle: 'rifle', shotgun: 'shotgun', smg: 'smg' };
export const MAX_WEAPON_SLOTS = 3;
const SWITCH_TIME = 0.35;
/** Volatile Rounds mutation: every Nth consecutive hit detonates. */
const VOLATILE_EVERY = 8;

export interface WeaponRunStats {
  shotsFired: number;
  shotsHit: number;
  headshots: number;
}

export interface WeaponSlot {
  def: WeaponDefinition;
  ammo: number;
  reserve: number;
}

/** Weapon-facing upgrade synergies (see SynergyManager). */
export interface WeaponMutations {
  volatile: boolean;
  deadeye: boolean;
}

/**
 * Firing cadence, spread/bloom, ammo, reloading and a 3-slot inventory. Turns hitscan results into
 * damage plus module effects (chain lightning, chill, kill explosions) and mutation effects.
 * Live stats are recomputed from the weapon's base stats and the run's upgrade modifiers.
 */
export class WeaponSystem {
  slots: WeaponSlot[] = [];
  current = 0;
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
  mutations: WeaponMutations = { volatile: false, deadeye: false };
  private mods: UpgradeModifiers = baseModifiers();
  private skin!: SkinDef;
  private cooldown = 0;
  private lightTimer = 0;
  private switchTimer = 0;
  private consecutiveHits = 0;

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

  /** Starts a run with a single weapon. */
  equip(def: WeaponDefinition, skin: SkinDef): void {
    this.skin = skin;
    this.mods = baseModifiers();
    this.mutations = { volatile: false, deadeye: false };
    this.slots = [{ def, ammo: def.stats.magazineSize, reserve: def.stats.reserveStart }];
    this.current = -1;
    this.runStats.shotsFired = this.runStats.shotsHit = this.runStats.headshots = 0;
    this.switchTo(0, true);
  }

  /** Previews a weapon in the loadout (no run state). */
  preview(def: WeaponDefinition, skin: SkinDef): void {
    this.skin = skin;
    this.def = def;
    this.stats = { ...def.stats };
    this.viewModel.build(def, skin);
  }

  /** Adds a weapon from a crate: new slot if free, otherwise replaces the held weapon. Returns the dropped weapon, if any. */
  addWeapon(def: WeaponDefinition): WeaponDefinition | null {
    if (this.slots.length < MAX_WEAPON_SLOTS) {
      this.slots.push({ def, ammo: def.stats.magazineSize, reserve: def.stats.reserveStart });
      this.switchTo(this.slots.length - 1);
      return null;
    }
    const dropped = this.slots[this.current]!.def;
    this.slots[this.current] = { def, ammo: def.stats.magazineSize, reserve: def.stats.reserveStart };
    this.current = -1;
    this.switchTo(this.slots.indexOf(this.slots.find((s) => s.def === def)!), true);
    return dropped;
  }

  switchTo(index: number, force = false): void {
    if (index < 0 || index >= this.slots.length || (index === this.current && !force)) return;
    // Bank the current weapon's ammo.
    const prev = this.slots[this.current];
    if (prev) {
      prev.ammo = this.ammo;
      prev.reserve = this.reserve;
    }
    this.current = index;
    const slot = this.slots[index]!;
    this.def = slot.def;
    this.stats = { ...slot.def.stats };
    this.ammo = slot.ammo;
    this.reserve = slot.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.consecutiveHits = 0;
    this.applyModifiers(this.mods);
    this.rebuildModel();
    if (!force) {
      this.switchTimer = SWITCH_TIME;
      this.audio.play('reload');
    }
  }

  cycle(dir: number): void {
    if (this.slots.length < 2) return;
    this.switchTo((this.current + dir + this.slots.length) % this.slots.length);
  }

  setSkin(skin: SkinDef): void {
    this.skin = skin;
    this.rebuildModel();
  }

  setMutations(m: WeaponMutations): void {
    const changed = m.volatile !== this.mutations.volatile || m.deadeye !== this.mutations.deadeye;
    this.mutations = { ...m };
    if (changed) this.rebuildModel();
  }

  /** Name including the mutation prefix, for the HUD. */
  get displayName(): string {
    const prefix = this.mutations.volatile ? 'Volatile ' : this.mutations.deadeye ? 'Deadeye ' : '';
    return prefix && !this.def.name.startsWith(prefix.trim()) ? prefix + this.def.name : this.def.name;
  }

  private rebuildModel(): void {
    const glow = this.mutations.volatile ? '#ff5a1a' : this.mutations.deadeye ? '#ffd45a' : null;
    this.viewModel.build(this.def, this.skin, glow);
  }

  /**
   * Recomputes live stats from the weapon's base stats and the run's upgrade modifiers (with caps).
   * A larger magazine is topped up immediately so the upgrade is felt right away.
   */
  applyModifiers(m: Readonly<UpgradeModifiers>): void {
    this.mods = { ...m };
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
    if (s.magazineSize > prevMag && prevMag > 0) this.ammo = Math.min(s.magazineSize, this.ammo + (s.magazineSize - prevMag));
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

  /** Adds magazines of reserve to the held weapon and half as much to the others. */
  addAmmo(magazines: number): number {
    let gained = 0;
    this.slots.forEach((slot, i) => {
      if (i === this.current) {
        const amount = Math.round(this.stats.magazineSize * magazines);
        const before = this.reserve;
        this.reserve = Math.min(this.stats.reserveMax, this.reserve + amount);
        gained = this.reserve - before;
      } else {
        slot.reserve = Math.min(slot.def.stats.reserveMax, slot.reserve + Math.round(slot.def.stats.magazineSize * magazines * 0.5));
      }
    });
    return gained;
  }

  /** Refills part of the magazine instantly (Phantom Step mutation). */
  refillMagazine(fraction: number): void {
    const add = Math.min(this.reserve, Math.ceil(this.stats.magazineSize * fraction), this.stats.magazineSize - this.ammo);
    this.ammo += add;
    this.reserve -= add;
  }

  get reserveIsFull(): boolean {
    return this.reserve >= this.stats.reserveMax;
  }

  startReload(): void {
    if (this.reloading || this.ammo >= this.stats.magazineSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.stats.reloadTime;
    this.audio.play('reload');
    this.bus.emit('weapon:reloadStart', { duration: this.stats.reloadTime });
  }

  update(dt: number, input: InputState, player: PlayerController, canFire: boolean): void {
    if (input.weaponSlot > 0) this.switchTo(input.weaponSlot - 1);
    if (input.weaponCycle !== 0) this.cycle(input.weaponCycle);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    const ready = canFire && this.switchTimer <= 0;

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

    if (ready && input.fire && !this.reloading) {
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
    const def = this.def;
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
    const critMul = s.critMultiplier + (this.mutations.deadeye ? 0.5 : 0);
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

      const crit = Math.random() < s.critChance;
      // Deadeye mutation: critical shots punch through one extra enemy.
      const pierce = s.pierce + (this.mutations.deadeye && crit ? 1 : 0);
      const res = this.hits.cast(ox, oy, oz, dx, dy, dz, s.range, this.pool.active, pierce);
      for (const h of res.enemies) {
        const e = h.enemy;
        if (!e.alive) continue;
        const falloff = h.distance <= s.falloffStart ? 1 : Math.max(0.6, 1 - ((h.distance - s.falloffStart) / Math.max(1, s.range - s.falloffStart)) * 0.4);
        const zoneMul = h.zone === 'head' ? s.headshotMultiplier * e.archetype.headMultiplier : h.zone === 'core' ? 2.5 : 1;
        const amount = s.damage * falloff * zoneMul * (crit ? critMul : 1);
        const hx = ox + dx * h.distance;
        const hy = oy + dy * h.distance;
        const hz = oz + dz * h.distance;
        const killed = this.damage.damageEnemy(e, {
          amount,
          headshot: h.zone === 'head' && e.archetype.headMultiplier > 1,
          critical: crit || h.zone !== 'body',
          x: hx,
          y: hy,
          z: hz,
          dirX: dx,
          dirZ: dz,
          knockback: s.pellets > 1 ? 1.2 : 1.6,
          weaponFamily: def.family,
          slow: def.module === 'freeze' ? MODULE_TUNING.slowDuration : 0,
          explodeOnKill: def.module === 'explosive',
          zone: h.zone,
        });
        if (def.module === 'energy' && Math.random() < MODULE_TUNING.chainChance) {
          this.damage.chainLightning(e, hx, hy, hz, amount * MODULE_TUNING.chainDamage, def.family);
        }
        if (this.mutations.volatile && !killed) {
          this.consecutiveHits++;
          if (this.consecutiveHits % VOLATILE_EVERY === 0) this.damage.queueExplosion(hx, hy, hz, 2.1, 22);
        }
        anyHit = true;
        anyHead ||= h.zone === 'head';
      }
      if (res.worldHit) this.effects.sparkBurst(res.endX, res.endY, res.endZ, res.nx, res.ny, res.nz, s.pellets > 1 ? 2 : 4, 4);
      // Show every shotgun pellet only occasionally to limit tracer spam.
      if (p === 0 || Math.random() < 0.4) this.effects.tracer(muzzle.x, muzzle.y, muzzle.z, res.endX, res.endY, res.endZ);
    }
    if (anyHit) this.runStats.shotsHit++;
    else this.consecutiveHits = 0;
    if (anyHead) this.runStats.headshots++;

    this.bloom = Math.min(s.bloomMax, this.bloom + s.bloomPerShot);
    const adsK = 1 - this.ads * 0.45;
    player.kick(s.recoilPitch * adsK, (Math.random() - 0.5) * s.recoilYaw * adsK);
    player.addTrauma(s.pellets > 1 ? 0.22 : 0.04);
    this.viewModel.onFire(s.pellets > 1 ? 2 : 1);
    this.muzzleLight.position.copyFrom(muzzle);
    this.lightTimer = 0.06;
    this.audio.play(SFX[def.family] ?? 'rifle');
    this.bus.emit('weapon:fired', { family: def.family });
  }
}
