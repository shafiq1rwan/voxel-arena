import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Enemy, HitZone } from '../enemies/Enemy';
import type { EnemyPool } from '../enemies/EnemyPool';
import { EnemyState } from '../enemies/EnemyTypes';
import type { Effects } from '../render/Effects';
import { explosionStats } from '../upgrades/UpgradeTypes';
import { MODULE_TUNING } from './WeaponTypes';

export interface DamageInfo {
  amount: number;
  headshot: boolean;
  critical: boolean;
  /** Impact point. */
  x: number;
  y: number;
  z: number;
  /** Horizontal shot direction for knockback. */
  dirX: number;
  dirZ: number;
  knockback: number;
  weaponFamily: string;
  /** Freeze module: seconds of slow to apply. */
  slow?: number;
  /** Explosive module: kill triggers a small explosion. */
  explodeOnKill?: boolean;
  zone?: HitZone;
}

interface PendingExplosion {
  x: number;
  y: number;
  z: number;
  radius: number;
  damage: number;
}

/**
 * Applies damage to enemies and resolves hit reactions and deaths in one place, so weapons,
 * explosions, chain lightning and grenades share identical feedback and events.
 */
export class DamageSystem {
  private killsThisRun = 0;
  /** Explosive Kills level from upgrades (0 = off). */
  explosiveLevel = 0;
  /** Glass Cannon challenge: multiplies all damage dealt. */
  dealtMultiplier = 1;
  /** Explosions waiting to detonate. Processed next frame so chains resolve without recursion. */
  private pending: PendingExplosion[] = [];
  private spare: PendingExplosion[] = [];
  private lightningScratch: Enemy[] = [];

  constructor(
    private pool: EnemyPool,
    private effects: Effects,
    private audio: AudioManager,
    private bus: EventBus<GameEvents>,
  ) {}

  resetRun(): void {
    this.killsThisRun = 0;
    this.explosiveLevel = 0;
    this.dealtMultiplier = 1;
    this.spare.push(...this.pending);
    this.pending.length = 0;
  }

  queueExplosion(x: number, y: number, z: number, radius: number, damage: number): void {
    const ex = this.spare.pop() ?? { x: 0, y: 0, z: 0, radius: 0, damage: 0 };
    ex.x = x;
    ex.y = y;
    ex.z = z;
    ex.radius = radius;
    ex.damage = damage;
    this.pending.push(ex);
  }

  /** Detonates queued explosions. Kills caused here may queue further explosions (chains). */
  update(): void {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    for (const ex of batch) {
      this.detonate(ex.x, ex.y, ex.z, ex.radius, ex.damage);
      this.spare.push(ex);
    }
  }

  /** Immediate area damage (also used by grenades). Never hurts the player. */
  detonate(x: number, y: number, z: number, radius: number, damage: number): void {
    this.effects.sparkBurst(x, y, z, 0, 1, 0, 26, 8, 2.2);
    this.effects.debrisBurst(x, y, z, { r: 0.25, g: 0.2, b: 0.18 }, 8, 5, 0.08, 0.2);
    this.audio.play('explosion');
    this.bus.emit('explosion', { x, y, z, radius });
    for (let i = this.pool.active.length - 1; i >= 0; i--) {
      const e = this.pool.active[i]!;
      if (!e.alive) continue;
      const dx = e.body.x - x;
      const dz = e.body.z - z;
      const dy = e.centerY - y;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius + e.radius) continue;
      const falloff = 1 - 0.5 * Math.min(1, d / radius);
      const inv = 1 / (Math.hypot(dx, dz) || 1);
      this.damageEnemy(e, {
        amount: damage * falloff,
        headshot: false,
        critical: false,
        x: e.body.x,
        y: e.centerY,
        z: e.body.z,
        dirX: dx * inv,
        dirZ: dz * inv,
        knockback: 6,
        weaponFamily: 'explosion',
      });
    }
  }

  /** Energy module: arcs from the struck enemy to the nearest others. */
  chainLightning(from: Enemy, x: number, y: number, z: number, amount: number, family: string): void {
    const targets = this.lightningScratch;
    targets.length = 0;
    for (const e of this.pool.active) {
      if (e === from || !e.alive) continue;
      const d = Math.hypot(e.body.x - from.body.x, e.body.z - from.body.z);
      if (d <= MODULE_TUNING.chainRange) targets.push(e);
    }
    targets.sort((a, b) => Math.hypot(a.body.x - from.body.x, a.body.z - from.body.z) - Math.hypot(b.body.x - from.body.x, b.body.z - from.body.z));
    let hits = 0;
    let px = x;
    let py = y;
    let pz = z;
    for (const e of targets.slice(0, MODULE_TUNING.chainTargets)) {
      const ty = e.centerY;
      this.effects.lightning(px, py, pz, e.body.x, ty, e.body.z);
      this.damageEnemy(e, { amount, headshot: false, critical: false, x: e.body.x, y: ty, z: e.body.z, dirX: 0, dirZ: 0, knockback: 0, weaponFamily: family });
      px = e.body.x;
      py = ty;
      pz = e.body.z;
      hits++;
    }
    if (hits > 0) {
      this.audio.play('zap');
      this.bus.emit('weapon:lightning', { hits });
    }
  }

  /** Returns true if the enemy died from this hit. */
  damageEnemy(e: Enemy, info: DamageInfo): boolean {
    if (!e.alive) return false;
    const amount = Math.max(1, Math.round(info.amount * this.dealtMultiplier));
    e.health -= amount;
    e.rig.hitFlash();
    const kb = 1 - e.archetype.knockbackResist;
    e.kbx += info.dirX * info.knockback * kb;
    e.kbz += info.dirZ * info.knockback * kb;
    if (info.slow) e.slowTimer = Math.max(e.slowTimer, info.slow);
    const killed = e.health <= 0;

    this.bus.emit('enemy:damaged', {
      id: e.id,
      amount,
      headshot: info.headshot,
      critical: info.critical,
      killed,
      point: { x: info.x, y: info.y, z: info.z },
    });

    if (killed) {
      this.kill(e, info);
      return true;
    }

    // Headshots, weak-point hits and heavy single hits interrupt wind-ups (rewarding accuracy).
    const a = e.archetype;
    const canStagger = a.staggerTime > 0 && e.state !== EnemyState.Spawning && e.state !== EnemyState.Roar && e.state !== EnemyState.Leap;
    const heavy = info.headshot || info.zone === 'core' || amount >= e.maxHealth * 0.3;
    if (canStagger && heavy && (!a.staggerOnlyOnCore || info.zone === 'core')) e.setState(EnemyState.Stunned);
    this.effects.debrisBurst(info.x, info.y, info.z, e.rig.bodyColor, 3, 2.5, 0.04, 0.09);
    this.audio.play(info.headshot || info.zone === 'core' ? 'headshot' : 'hit');
    return false;
  }

  private kill(e: Enemy, info: DamageInfo): void {
    e.setState(EnemyState.Dead);
    this.killsThisRun++;
    const cy = e.centerY;
    const big = e.archetype.id === 'boss' ? 4 : e.archetype.id === 'tank' ? 1.8 : 1;
    this.effects.debrisBurst(e.body.x, cy, e.body.z, e.rig.bodyColor, CONFIG.enemy.corpseDebris * 0.6 * big, 4.5, 0.1 * Math.sqrt(big), 0.24 * Math.sqrt(big));
    this.effects.debrisBurst(e.body.x, cy + 0.3, e.body.z, e.rig.accentColor, CONFIG.enemy.corpseDebris * 0.4 * big, 5, 0.07, 0.18);
    this.effects.sparkBurst(e.body.x, cy, e.body.z, 0, 1, 0, 10 * big, 5);
    this.audio.play(info.headshot ? 'headshot' : 'kill');
    this.audio.play('kill');
    this.bus.emit('enemy:killed', {
      id: e.id,
      archetype: e.archetype.id,
      headshot: info.headshot,
      weaponFamily: info.weaponFamily,
      position: { x: e.body.x, y: e.body.y, z: e.body.z },
      firstOfRun: this.killsThisRun === 1,
      elite: e.elite,
      reward: e.reward,
    });
    if (this.explosiveLevel > 0) {
      const { radius, damage } = explosionStats(this.explosiveLevel);
      this.queueExplosion(e.body.x, cy, e.body.z, radius, damage);
    }
    if (info.explodeOnKill) this.queueExplosion(e.body.x, cy, e.body.z, MODULE_TUNING.explosionRadius, MODULE_TUNING.explosionDamage);
    this.pool.release(e);
  }
}
