import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Enemy } from '../enemies/Enemy';
import type { EnemyPool } from '../enemies/EnemyPool';
import { EnemyState } from '../enemies/EnemyTypes';
import type { Effects } from '../render/Effects';

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

  constructor(
    private pool: EnemyPool,
    private effects: Effects,
    private audio: AudioManager,
    private bus: EventBus<GameEvents>,
  ) {}

  resetRun(): void {
    this.killsThisRun = 0;
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
    this.pool.release(e);
  }
}
