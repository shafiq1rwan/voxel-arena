import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import { damp, wrapAngle } from '../core/MathUtil';
import type { PlayerController } from '../player/PlayerController';
import type { NavGrid } from '../world/NavGrid';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { Enemy } from './Enemy';
import type { EnemyPool } from './EnemyPool';
import { EnemyState } from './EnemyTypes';

const SPAWN_DURATION = 0.7;
const GRAVITY = 22;
const tmpDir = { x: 0, z: 0 };

export interface AIContext {
  world: VoxelWorld;
  nav: NavGrid;
  player: PlayerController;
  audio: AudioManager;
}

/**
 * Finite-state-machine AI for melee archetypes:
 *   SPAWNING -> CHASE -> ATTACK (wind-up) -> RECOVER -> CHASE, with STUNNED on heavy hits.
 * Movement follows the shared flow field, switching to direct pursuit when the player is close
 * and visible. Separation keeps groups from stacking into a single blob.
 */
export class EnemyAI {
  private navTargetX = -1;
  private navTargetZ = -1;
  private navTimer = 0;

  constructor(
    private pool: EnemyPool,
    private ctx: AIContext,
  ) {}

  setContext(ctx: AIContext): void {
    this.ctx = ctx;
    this.navTargetX = this.navTargetZ = -1;
  }

  update(dt: number): void {
    const { player, nav } = this.ctx;
    // Recompute the flow field when the player changes cell (throttled).
    this.navTimer -= dt;
    const pcx = Math.floor(player.body.x);
    const pcz = Math.floor(player.body.z);
    if ((pcx !== this.navTargetX || pcz !== this.navTargetZ) && this.navTimer <= 0) {
      nav.compute(pcx, pcz);
      this.navTargetX = pcx;
      this.navTargetZ = pcz;
      this.navTimer = 0.15;
    }

    const enemies = this.pool.active;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (!e.alive) continue;
      this.updateEnemy(e, dt, enemies);
    }
  }

  private updateEnemy(e: Enemy, dt: number, all: Enemy[]): void {
    const { player, world, nav, audio } = this.ctx;
    const a = e.archetype;
    e.stateTime += dt;

    const dx = player.body.x - e.body.x;
    const dz = player.body.z - e.body.z;
    const dy = player.body.y - e.body.y;
    const dist = Math.hypot(dx, dz);

    let desiredX = 0;
    let desiredZ = 0;
    let speedMul = 0;
    let faceX = dx;
    let faceZ = dz;
    let attackPose = 0;
    let swingPose = 0;
    let spawnPose = 1;
    let staggerPose = 0;

    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.25 + Math.random() * 0.1;
      e.hasLos = dist < 14 && world.hasLineOfSight(e.body.x, e.body.y + 1.2, e.body.z, player.body.x, player.eyeY - 0.2, player.body.z);
    }

    switch (e.state) {
      case EnemyState.Spawning: {
        spawnPose = Math.min(1, e.stateTime / SPAWN_DURATION);
        if (e.stateTime >= SPAWN_DURATION) e.setState(EnemyState.Chase);
        break;
      }
      case EnemyState.Idle:
      case EnemyState.Chase: {
        speedMul = 1;
        if (e.hasLos && dist < 5 && Math.abs(dy) < 0.6) {
          desiredX = dx / (dist || 1);
          desiredZ = dz / (dist || 1);
        } else if (nav.direction(e.body.x, e.body.z, tmpDir)) {
          desiredX = tmpDir.x;
          desiredZ = tmpDir.z;
        } else if (dist > 0.01) {
          desiredX = dx / dist;
          desiredZ = dz / dist;
        }
        if (!e.hasLos) {
          faceX = desiredX;
          faceZ = desiredZ;
        }
        if (dist < a.attackRange && Math.abs(dy) < 1.2 && player.alive) {
          e.setState(EnemyState.Attack);
          e.attackLanded = false;
        }
        break;
      }
      case EnemyState.Attack: {
        const t = e.stateTime / a.attackWindup;
        attackPose = Math.min(1, t * 1.4);
        speedMul = 0.15;
        if (dist > 0.01) {
          desiredX = dx / dist;
          desiredZ = dz / dist;
        }
        if (t >= 1 && !e.attackLanded) {
          e.attackLanded = true;
          if (dist < a.attackHitRange && Math.abs(dy) < 1.3 && player.alive) {
            if (player.damage(a.damage, e.body.x, e.body.z, true)) audio.play('hurt');
          }
          audio.play('enemyAttack', 0.7);
          e.setState(EnemyState.Recover);
        }
        break;
      }
      case EnemyState.Recover: {
        const t = e.stateTime / a.attackRecover;
        swingPose = Math.max(0, 1 - t * 1.5);
        speedMul = 0.35;
        if (dist > 0.01) {
          desiredX = dx / dist;
          desiredZ = dz / dist;
        }
        if (t >= 1) e.setState(EnemyState.Chase);
        break;
      }
      case EnemyState.Stunned: {
        staggerPose = Math.max(0, 1 - e.stateTime / a.staggerTime);
        if (e.stateTime >= a.staggerTime) e.setState(EnemyState.Chase);
        break;
      }
      default:
        break;
    }

    // --- Steering ---
    const targetVx = desiredX * e.speed * speedMul;
    const targetVz = desiredZ * e.speed * speedMul;
    const k = damp(10, dt);
    e.vx += (targetVx - e.vx) * k;
    e.vz += (targetVz - e.vz) * k;

    // Separation from nearby enemies.
    let sx = 0;
    let sz = 0;
    const sepR = CONFIG.enemy.separationRadius;
    for (let j = 0; j < all.length; j++) {
      const o = all[j]!;
      if (o === e || !o.alive) continue;
      const ox = e.body.x - o.body.x;
      const oz = e.body.z - o.body.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > sepR * sepR || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (sepR - d) / sepR;
      sx += (ox / d) * push;
      sz += (oz / d) * push;
    }
    // Keep a minimum distance from the player's body.
    const minPlayerDist = e.radius + CONFIG.player.radius + 0.45;
    if (dist < minPlayerDist && dist > 1e-4) {
      const push = (minPlayerDist - dist) * 8;
      sx -= (dx / dist) * push;
      sz -= (dz / dist) * push;
    }
    const sepStrength = CONFIG.enemy.separationStrength;

    e.kbx *= 1 - damp(8, dt);
    e.kbz *= 1 - damp(8, dt);
    if (e.state !== EnemyState.Spawning) {
      const mx = (e.vx + sx * sepStrength * 0.5 + e.kbx) * dt;
      const mz = (e.vz + sz * sepStrength * 0.5 + e.kbz) * dt;
      world.moveHorizontal(e.body, mx, mz, e.radius, 0.55);
    }

    // --- Vertical: follow terrain, fall off ledges ---
    const ground = world.groundHeight(e.body, e.radius);
    if (ground > e.body.y && ground - e.body.y <= 0.56) {
      e.body.y = ground;
      e.vy = 0;
    } else if (e.body.y > ground + 1e-3) {
      e.vy -= GRAVITY * dt;
      e.body.y = Math.max(ground, e.body.y + e.vy * dt);
      if (e.body.y <= ground) e.vy = 0;
    }

    // --- Facing ---
    if (Math.abs(faceX) + Math.abs(faceZ) > 1e-3) {
      const targetYaw = Math.atan2(faceX, faceZ);
      e.yaw += wrapAngle(targetYaw - e.yaw) * damp(e.state === EnemyState.Attack ? 14 : 8, dt);
    }

    const moveSpeed = Math.hypot(e.vx, e.vz);
    e.rig.animate(dt, moveSpeed, attackPose, swingPose, spawnPose, staggerPose);
    e.syncRig();
  }
}
