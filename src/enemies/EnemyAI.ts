import type { AudioManager } from '../audio/AudioManager';
import type { ProjectileSystem } from '../combat/ProjectileSystem';
import { CONFIG } from '../config';
import { damp, wrapAngle } from '../core/MathUtil';
import type { PlayerController } from '../player/PlayerController';
import type { Effects } from '../render/Effects';
import type { NavGrid } from '../world/NavGrid';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { Enemy } from './Enemy';
import type { EnemyPool } from './EnemyPool';
import { EnemyState } from './EnemyTypes';

const SPAWN_DURATION = 0.7;
const GRAVITY = 22;
const tmpDir = { x: 0, z: 0 };
const muzzle = { x: 0, y: 0, z: 0 };

export interface AIContext {
  world: VoxelWorld;
  nav: NavGrid;
  player: PlayerController;
  audio: AudioManager;
  projectiles: ProjectileSystem;
  effects: Effects;
}

/** Steering intent written by the archetype behaviours and consumed by shared movement code. */
interface Intent {
  dirX: number;
  dirZ: number;
  speedMul: number;
  faceX: number;
  faceZ: number;
}

/**
 * Finite-state-machine AI.
 *
 * Chaser (melee):   SPAWNING -> CHASE -> ATTACK (wind-up) -> RECOVER -> CHASE
 * Shooter (ranged): SPAWNING -> SEEK -> STRAFE -> ATTACK (telegraphed aim) -> RECOVER -> STRAFE
 * Both:             any -> STUNNED on headshots / heavy hits -> back to their main state
 *
 * Movement follows the shared flow field, switching to direct steering when the player is visible.
 * Separation keeps groups from stacking into a single blob.
 */
export class EnemyAI {
  private navTargetX = -1;
  private navTargetZ = -1;
  private navTimer = 0;
  private intent: Intent = { dirX: 0, dirZ: 0, speedMul: 0, faceX: 0, faceZ: 0 };

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
    const { player, world } = this.ctx;
    e.stateTime += dt;

    const dx = player.body.x - e.body.x;
    const dz = player.body.z - e.body.z;
    const dy = player.body.y - e.body.y;
    const dist = Math.hypot(dx, dz);

    const pose = e.pose;
    pose.attack = pose.swing = pose.stagger = pose.charge = 0;
    pose.spawn = 1;
    const it = this.intent;
    it.dirX = it.dirZ = it.speedMul = 0;
    it.faceX = dx;
    it.faceZ = dz;

    e.losTimer -= dt;
    if (e.losTimer <= 0) {
      e.losTimer = 0.25 + Math.random() * 0.1;
      const range = e.archetype.ranged ? e.archetype.ranged.maxRange + 4 : 14;
      e.hasLos = dist < range && world.hasLineOfSight(e.body.x, e.body.y + 1.2, e.body.z, player.body.x, player.eyeY - 0.2, player.body.z);
    }

    if (e.state === EnemyState.Spawning) {
      pose.spawn = Math.min(1, e.stateTime / SPAWN_DURATION);
      pose.aim *= 0.9;
      if (e.stateTime >= SPAWN_DURATION) e.setState(e.archetype.ranged ? EnemyState.Seek : EnemyState.Chase);
    } else if (e.state === EnemyState.Stunned) {
      pose.stagger = Math.max(0, 1 - e.stateTime / e.archetype.staggerTime);
      pose.aim = Math.max(0, pose.aim - dt * 4);
      if (e.stateTime >= e.archetype.staggerTime) {
        e.setState(e.archetype.ranged ? EnemyState.Strafe : EnemyState.Chase);
        // Being staggered resets a ranged enemy's aim, rewarding precise shots.
        if (e.archetype.ranged) e.fireCooldown = Math.max(e.fireCooldown, 0.8);
      }
    } else if (e.archetype.ranged) {
      this.updateShooter(e, dt, dx, dz, dy, dist);
    } else {
      this.updateChaser(e, dx, dz, dy, dist);
    }

    this.move(e, dt, all, dx, dz, dist);
    e.rig.animate(dt, pose);
    e.syncRig();
  }

  /** Melee pursuit: close in, telegraph, swing. */
  private updateChaser(e: Enemy, dx: number, dz: number, dy: number, dist: number): void {
    const { player, audio } = this.ctx;
    const a = e.archetype;
    const it = this.intent;
    const pose = e.pose;
    switch (e.state) {
      case EnemyState.Attack: {
        const t = e.stateTime / a.attackWindup;
        pose.attack = Math.min(1, t * 1.4);
        it.speedMul = 0.15;
        this.toward(dx, dz, dist);
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
        pose.swing = Math.max(0, 1 - t * 1.5);
        it.speedMul = 0.35;
        this.toward(dx, dz, dist);
        if (t >= 1) e.setState(EnemyState.Chase);
        break;
      }
      default: {
        it.speedMul = 1;
        this.pursue(e, dx, dz, dy, dist);
        if (dist < a.attackRange && Math.abs(dy) < 1.2 && player.alive) {
          e.setState(EnemyState.Attack);
          e.attackLanded = false;
        }
        break;
      }
    }
  }

  /** Ranged: find a firing position, hold the preferred band while circling, telegraph, shoot. */
  private updateShooter(e: Enemy, dt: number, dx: number, dz: number, dy: number, dist: number): void {
    const { player, audio, effects } = this.ctx;
    const r = e.archetype.ranged!;
    const it = this.intent;
    const pose = e.pose;
    const canShoot = e.hasLos && dist <= r.maxRange && player.alive;

    switch (e.state) {
      case EnemyState.Attack: {
        // Telegraph: plant feet, raise the blaster and charge it up.
        const t = e.stateTime / r.windup;
        it.speedMul = 0.1;
        this.toward(dx, dz, dist);
        pose.aim = Math.min(1, pose.aim + dt * 6);
        pose.charge = Math.min(1, t);
        if (!e.hasLos) {
          // Lost the shot: abort and reposition quickly.
          e.setState(EnemyState.Strafe);
          e.fireCooldown = 0.6;
          break;
        }
        if (t >= 1) {
          this.fireAt(e, r.projectileSpeed, r.projectileDamage);
          audio.play('enemyShoot', Math.max(0.35, 1 - dist / 30));
          e.fireCooldown = r.fireInterval * (0.8 + Math.random() * 0.4);
          e.setState(EnemyState.Recover);
        } else if (Math.random() < dt * 10) {
          e.rig.getMuzzleWorld(muzzle);
          effects.sparkBurst(muzzle.x, muzzle.y, muzzle.z, 0, 1, 0, 1, 1.2);
        }
        break;
      }
      case EnemyState.Recover: {
        it.speedMul = 0.3;
        pose.aim = Math.max(0.5, pose.aim - dt * 2);
        this.toward(dx, dz, dist);
        if (e.stateTime >= 0.35) e.setState(EnemyState.Strafe);
        break;
      }
      case EnemyState.Strafe: {
        e.fireCooldown -= dt;
        e.losLostTime = e.hasLos ? 0 : e.losLostTime + dt;
        if (e.losLostTime > 1.2 || dist > r.preferredMax + 5) {
          e.setState(EnemyState.Seek);
          break;
        }
        pose.aim += (0.55 - pose.aim) * Math.min(1, dt * 5);
        // Circle the player, correcting radially to stay inside the preferred band.
        const inv = 1 / (dist || 1);
        const radial = dist < r.preferredMin ? -1 : dist > r.preferredMax ? 1 : 0;
        e.strafeTimer -= dt;
        if (e.strafeTimer <= 0 || e.blocked) {
          e.strafeSign = -e.strafeSign;
          e.strafeTimer = 1.2 + Math.random() * 1.4;
          e.blocked = false;
        }
        let sx = -dz * inv * e.strafeSign * 0.85 + dx * inv * radial;
        let sz = dx * inv * e.strafeSign * 0.85 + dz * inv * radial;
        const sl = Math.hypot(sx, sz) || 1;
        sx /= sl;
        sz /= sl;
        it.dirX = sx;
        it.dirZ = sz;
        it.speedMul = radial < 0 ? 0.95 : 0.7;
        if (canShoot && e.fireCooldown <= 0) {
          e.setState(EnemyState.Attack);
          audio.play('enemyCharge', Math.max(0.3, 1 - dist / 30));
        }
        break;
      }
      default: {
        // SEEK / CHASE / IDLE: path toward the player until a clear shot inside the band opens up.
        e.fireCooldown -= dt;
        pose.aim = Math.max(0, pose.aim - dt * 2);
        it.speedMul = 0.9;
        this.pursue(e, dx, dz, dy, dist);
        if (e.hasLos && dist <= r.preferredMax) {
          e.setState(EnemyState.Strafe);
          e.losLostTime = 0;
        }
        break;
      }
    }
  }

  /** Fires a bolt at the player's chest, leading them partially so strafing can still dodge it. */
  private fireAt(e: Enemy, speed: number, damage: number): void {
    const { player, projectiles } = this.ctx;
    e.rig.getMuzzleWorld(muzzle);
    const tx0 = player.body.x;
    const ty0 = player.body.y + 1.15;
    const tz0 = player.body.z;
    const travel = Math.hypot(tx0 - muzzle.x, ty0 - muzzle.y, tz0 - muzzle.z) / speed;
    const lead = 0.55;
    const tx = tx0 + player.vx * travel * lead;
    const tz = tz0 + player.vz * travel * lead;
    let dx = tx - muzzle.x;
    let dy = ty0 - muzzle.y;
    let dz = tz - muzzle.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // Small random error so shots aren't laser-perfect.
    const err = 0.025;
    dx = dx / len + (Math.random() - 0.5) * err;
    dy = dy / len + (Math.random() - 0.5) * err;
    dz = dz / len + (Math.random() - 0.5) * err;
    const l2 = Math.hypot(dx, dy, dz) || 1;
    projectiles.fire(muzzle.x, muzzle.y, muzzle.z, dx / l2, dy / l2, dz / l2, speed, damage);
  }

  /** Steer toward the player: direct when visible and close, otherwise along the flow field. */
  private pursue(e: Enemy, dx: number, dz: number, dy: number, dist: number): void {
    const it = this.intent;
    if (e.hasLos && dist < 5 && Math.abs(dy) < 0.6) {
      this.toward(dx, dz, dist);
    } else if (this.ctx.nav.direction(e.body.x, e.body.z, tmpDir)) {
      it.dirX = tmpDir.x;
      it.dirZ = tmpDir.z;
    } else {
      this.toward(dx, dz, dist);
    }
    if (!e.hasLos) {
      it.faceX = it.dirX;
      it.faceZ = it.dirZ;
    }
  }

  private toward(dx: number, dz: number, dist: number): void {
    if (dist < 0.01) return;
    this.intent.dirX = dx / dist;
    this.intent.dirZ = dz / dist;
  }

  /** Shared steering, separation, collision, gravity and facing. */
  private move(e: Enemy, dt: number, all: Enemy[], dx: number, dz: number, dist: number): void {
    const { world } = this.ctx;
    const it = this.intent;
    const targetVx = it.dirX * e.speed * it.speedMul;
    const targetVz = it.dirZ * e.speed * it.speedMul;
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
      const flags = world.moveHorizontal(e.body, mx, mz, e.radius, 0.55);
      if (flags) e.blocked = true;
    }

    // Vertical: follow terrain, fall off ledges.
    const ground = world.groundHeight(e.body, e.radius);
    if (ground > e.body.y && ground - e.body.y <= 0.56) {
      e.body.y = ground;
      e.vy = 0;
    } else if (e.body.y > ground + 1e-3) {
      e.vy -= GRAVITY * dt;
      e.body.y = Math.max(ground, e.body.y + e.vy * dt);
      if (e.body.y <= ground) e.vy = 0;
    }

    if (Math.abs(it.faceX) + Math.abs(it.faceZ) > 1e-3) {
      const targetYaw = Math.atan2(it.faceX, it.faceZ);
      e.yaw += wrapAngle(targetYaw - e.yaw) * damp(e.state === EnemyState.Attack ? 14 : 8, dt);
    }
    e.pose.speed = Math.hypot(e.vx, e.vz);
  }
}
