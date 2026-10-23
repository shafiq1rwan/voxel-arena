import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Enemy } from '../enemies/Enemy';
import type { EnemyPool } from '../enemies/EnemyPool';
import { EnemyState } from '../enemies/EnemyTypes';
import type { Effects } from '../render/Effects';
import { explosionStats } from '../upgrades/UpgradeTypes';

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
}

/**
 * Applies damage to enemies and resolves hit reactions and deaths in one place, so weapons,
 * explosions and future modules (lightning, freeze) share identical feedback and events.
 */
export class DamageSystem {
  private killsThisRun = 0;
  /** Explosive Kills level from upgrades (0 = off). */
  explosiveLevel = 0;
  /** Explosions waiting to detonate. Processed next frame so chains resolve without recursion. */
  private pendingExplosions: { x: number; y: number; z: number }[] = [];
  private explosionPool: { x: number; y: number; z: number }[] = [];

  constructor(
    private pool: EnemyPool,
    private effects: Effects,
    private audio: AudioManager,
    private bus: EventBus<GameEvents>,
  ) {}

  resetRun(): void {
    this.killsThisRun = 0;
    this.explosiveLevel = 0;
    for (const e of this.pendingExplosions) this.explosionPool.push(e);
    this.pendingExplosions.length = 0;
  }

  /** Detonates queued kill explosions. Kills caused here may queue further explosions (chains). */
  update(): void {
    if (this.pendingExplosions.length === 0 || this.explosiveLevel <= 0) return;
    const batch = this.pendingExplosions.splice(0, this.pendingExplosions.length);
    const { radius, damage } = explosionStats(this.explosiveLevel);
    for (const ex of batch) {
      this.effects.sparkBurst(ex.x, ex.y, ex.z, 0, 1, 0, 26, 8, 2.2);
      this.effects.debrisBurst(ex.x, ex.y, ex.z, { r: 0.25, g: 0.2, b: 0.18 }, 8, 5, 0.08, 0.2);
      this.audio.play('explosion');
      this.bus.emit('explosion', { x: ex.x, y: ex.y, z: ex.z, radius });
      for (let i = this.pool.active.length - 1; i >= 0; i--) {
        const e = this.pool.active[i]!;
        if (!e.alive) continue;
        const dx = e.body.x - ex.x;
        const dz = e.body.z - ex.z;
        const dy = e.centerY - ex.y;
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
      this.explosionPool.push(ex);
    }
  }

  /** Returns true if the enemy died from this hit. */
  damageEnemy(e: Enemy, info: DamageInfo): boolean {
    if (!e.alive) return false;
    const amount = Math.max(1, Math.round(info.amount));
    e.health -= amount;
    e.rig.hitFlash();
    e.kbx += info.dirX * info.knockback;
    e.kbz += info.dirZ * info.knockback;
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

    // Headshots and heavy single hits interrupt wind-ups (rewarding accuracy).
    if ((info.headshot || amount >= e.maxHealth * 0.3) && e.state !== EnemyState.Spawning) {
      e.setState(EnemyState.Stunned);
    }
    this.effects.debrisBurst(info.x, info.y, info.z, e.rig.bodyColor, 3, 2.5, 0.04, 0.09);
    this.audio.play(info.headshot ? 'headshot' : 'hit');
    return false;
  }

  private kill(e: Enemy, info: DamageInfo): void {
    e.setState(EnemyState.Dead);
    this.killsThisRun++;
    const cy = e.centerY;
    this.effects.debrisBurst(e.body.x, cy, e.body.z, e.rig.bodyColor, CONFIG.enemy.corpseDebris * 0.6, 4.5, 0.1, 0.24);
    this.effects.debrisBurst(e.body.x, cy + 0.3, e.body.z, e.rig.accentColor, CONFIG.enemy.corpseDebris * 0.4, 5, 0.07, 0.18);
    this.effects.sparkBurst(e.body.x, cy, e.body.z, 0, 1, 0, 10, 5);
    this.audio.play(info.headshot ? 'headshot' : 'kill');
    this.audio.play('kill');
    this.bus.emit('enemy:killed', {
      id: e.id,
      archetype: e.archetype.id,
      headshot: info.headshot,
      weaponFamily: info.weaponFamily,
      position: { x: e.body.x, y: e.body.y, z: e.body.z },
      firstOfRun: this.killsThisRun === 1,
    });
    if (this.explosiveLevel > 0) {
      const ex = this.explosionPool.pop() ?? { x: 0, y: 0, z: 0 };
      ex.x = e.body.x;
      ex.y = cy;
      ex.z = e.body.z;
      this.pendingExplosions.push(ex);
    }
    this.pool.release(e);
  }
}
