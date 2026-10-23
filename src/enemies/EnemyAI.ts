import type { AudioManager } from '../audio/AudioManager';
import type { ProjectileSystem } from '../combat/ProjectileSystem';
import { CONFIG } from '../config';
import { damp, wrapAngle } from '../core/MathUtil';
import type { PlayerController } from '../player/PlayerController';
import type { Effects } from '../render/Effects';
import type { EventBus, GameEvents } from '../core/EventBus';
import { MODULE_TUNING } from '../combat/WeaponTypes';
import type { Telegraphs } from '../render/Telegraphs';
import type { NavGrid } from '../world/NavGrid';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { Enemy } from './Enemy';
import type { EnemyPool } from './EnemyPool';
import { EnemyState, type ArchetypeId } from './EnemyTypes';

const SPAWN_DURATION = 0.7;
const GRAVITY = 22;
/** Seconds out of sight without progress before an enemy is relocated. */
const STUCK_TIME = 5;
const tmpDir = { x: 0, z: 0 };
const muzzle = { x: 0, y: 0, z: 0 };

export interface AIContext {
  world: VoxelWorld;
  nav: NavGrid;
  player: PlayerController;
  audio: AudioManager;
  projectiles: ProjectileSystem;
  effects: Effects;
  telegraphs: Telegraphs;
  bus: EventBus<GameEvents>;
  /** Spawns a summoned minion next to (x, z) — used by the boss. */
  spawnMinion: (id: ArchetypeId, x: number, z: number) => void;
  /** Moves an enemy that has stopped making progress back to a spawn point. */
  relocate: (e: Enemy) => void;
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
 * Chaser (melee):   SPAWNING -> CHASE -> ATTACK (wind-up) -> RECOVER -> CHASE   (+ elite LEAP)
 * Shooter (ranged): SPAWNING -> SEEK -> STRAFE -> ATTACK (telegraphed aim) -> RECOVER -> STRAFE
 * Tank:             SPAWNING -> CHASE -> ATTACK (ringed ground slam) -> RECOVER   (stagger only on core)
 * Boss:             CHASE with volley / slam / melee / summon actions, ROAR between three phases
 * All:              any -> STUNNED on headshots / weak-point hits -> back to their main state
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

    e.slowTimer = Math.max(0, e.slowTimer - dt);
    pose.chill = Math.min(1, e.slowTimer / 0.6);

    const spawnTime = e.archetype.id === 'boss' ? 1.8 : SPAWN_DURATION;
    if (e.state === EnemyState.Spawning) {
      pose.spawn = Math.min(1, e.stateTime / spawnTime);
      pose.aim *= 0.9;
      if (e.stateTime >= spawnTime) e.setState(e.archetype.ranged ? EnemyState.Seek : EnemyState.Chase);
    } else if (e.archetype.id === 'boss') {
      this.updateBoss(e, dt, dx, dz, dy, dist);
    } else if (e.archetype.id === 'tank' && e.state !== EnemyState.Stunned) {
      this.updateTank(e, dt, dx, dz, dy, dist);
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
      this.updateChaser(e, dt, dx, dz, dy, dist);
    }

    this.move(e, dt, all, dx, dz, dist);
    this.watchStuck(e, dt, dist);
    e.rig.animate(dt, pose);
    e.syncRig();
  }

  /** Melee pursuit: close in, telegraph, swing. Elite Berserkers also leap in from range. */
  private updateChaser(e: Enemy, dt: number, dx: number, dz: number, dy: number, dist: number): void {
    const { player, audio, telegraphs } = this.ctx;
    const a = e.archetype;
    const it = this.intent;
    const pose = e.pose;
    e.abilityTimer -= dt;
    switch (e.state) {
      case EnemyState.Leap: {
        pose.attack = 1;
        // Landed?
        if (e.stateTime > 0.2 && e.vy === 0) {
          const d = Math.hypot(player.body.x - e.body.x, player.body.z - e.body.z);
          if (d < 2.1 && Math.abs(player.body.y - e.body.y) < 1.4 && player.alive && player.damage(14, e.body.x, e.body.z, true)) audio.play('hurt');
          this.ctx.effects.debrisBurst(e.body.x, e.body.y + 0.1, e.body.z, e.rig.bodyColor, 10, 4, 0.06, 0.14);
          audio.play('slam', 0.6);
          e.leapVX = e.leapVZ = 0;
          e.setState(EnemyState.Recover);
        }
        break;
      }
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
        } else if (e.elite && e.abilityTimer <= 0 && e.hasLos && dist > 4 && dist < 9 && Math.abs(dy) < 0.8) {
          // Berserker leap: telegraph the landing zone, then jump.
          const t = 0.75;
          e.leapVX = dx / t;
          e.leapVZ = dz / t;
          e.vy = 7.4;
          e.body.y += 0.05;
          e.abilityTimer = 5;
          telegraphs.show(player.body.x, player.body.y, player.body.z, 2.1, t);
          audio.play('enemyCharge', 0.8);
          e.setState(EnemyState.Leap);
        }
        break;
      }
    }
  }

  /** Tank: slow advance, then a ringed ground slam. Warden elites slam wider and regenerate. */
  private updateTank(e: Enemy, dt: number, dx: number, dz: number, dy: number, dist: number): void {
    const { player, audio, telegraphs, effects } = this.ctx;
    const a = e.archetype;
    const it = this.intent;
    const pose = e.pose;
    const radius = e.elite ? 3.6 : a.attackHitRange;
    if (e.elite && e.health < e.maxHealth) e.health = Math.min(e.maxHealth, e.health + e.maxHealth * 0.015 * dt);
    switch (e.state) {
      case EnemyState.Attack: {
        const t = e.stateTime / a.attackWindup;
        pose.attack = Math.min(1, t * 1.2);
        it.speedMul = 0;
        if (t >= 1 && !e.attackLanded) {
          e.attackLanded = true;
          const d = Math.hypot(player.body.x - e.body.x, player.body.z - e.body.z);
          if (d < radius && Math.abs(player.body.y - e.body.y) < 1.5 && player.alive && player.damage(a.damage, e.body.x, e.body.z, true)) audio.play('hurt');
          effects.debrisBurst(e.body.x, e.body.y + 0.1, e.body.z, e.rig.bodyColor, 18, 6, 0.08, 0.2);
          effects.sparkBurst(e.body.x, e.body.y + 0.2, e.body.z, 0, 1, 0, 12, 6);
          audio.play('slam');
          player.addTrauma(Math.max(0, 0.6 - d * 0.06));
          e.setState(EnemyState.Recover);
        }
        break;
      }
      case EnemyState.Recover: {
        pose.swing = Math.max(0, 1 - e.stateTime / a.attackRecover);
        it.speedMul = 0.2;
        this.toward(dx, dz, dist);
        if (e.stateTime >= a.attackRecover) e.setState(EnemyState.Chase);
        break;
      }
      default: {
        it.speedMul = 1;
        this.pursue(e, dx, dz, dy, dist);
        if (dist < a.attackRange + (e.elite ? 0.8 : 0) && Math.abs(dy) < 1.4 && player.alive) {
          e.setState(EnemyState.Attack);
          e.attackLanded = false;
          telegraphs.show(e.body.x, e.body.y, e.body.z, radius, a.attackWindup);
          audio.play('enemyCharge', 0.9);
        }
        break;
      }
    }
  }

  /**
   * Boss: three phases by health (P2 at 66%, P3 at 33%). Volleys of bolts throughout; P2 adds a
   * telegraphed slam at the player's position and chaser summons; P3 is faster with bigger volleys.
   */
  private updateBoss(e: Enemy, dt: number, dx: number, dz: number, dy: number, dist: number): void {
    const { player, audio, telegraphs, effects, bus } = this.ctx;
    const it = this.intent;
    const pose = e.pose;
    const ratio = e.health / e.maxHealth;
    const phase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (phase > e.phase && e.state !== EnemyState.Roar) {
      e.phase = phase;
      e.action = null;
      e.setState(EnemyState.Roar);
      telegraphs.show(e.body.x, e.body.y, e.body.z, 5, 1.4);
      audio.play('roar');
      bus.emit('boss:phase', { phase });
    }

    if (e.state === EnemyState.Roar) {
      pose.attack = 1;
      it.speedMul = 0;
      if (e.stateTime >= 1.4) {
        // Shockwave pushes the player back (no damage — the roar is a breather, not a trap).
        const d = Math.hypot(player.body.x - e.body.x, player.body.z - e.body.z);
        if (d < 5) player.addTrauma(0.6);
        effects.sparkBurst(e.body.x, e.body.y + 1, e.body.z, 0, 1, 0, 30, 9, 2);
        e.setState(EnemyState.Chase);
        e.abilityTimer = 1.5;
      }
      return;
    }

    const enraged = e.phase === 3;
    e.abilityTimer -= dt;
    e.ability2Timer -= dt;
    e.summonTimer -= dt;

    if (e.action === 'volley') {
      const windup = enraged ? 0.6 : 0.8;
      it.speedMul = 0;
      pose.attack = Math.min(1, e.stateTime / windup);
      if (e.stateTime >= windup) {
        const count = e.phase === 1 ? 5 : e.phase === 2 ? 7 : 9;
        this.fireAt(e, enraged ? 16 : 13.5, 9, count, enraged ? 1.1 : 0.9);
        audio.play('enemyShoot', 1);
        e.action = null;
        e.abilityTimer = e.phase === 1 ? 3.2 : e.phase === 2 ? 2.6 : 1.9;
        e.setState(EnemyState.Recover);
      }
      return;
    }
    if (e.action === 'slam') {
      it.speedMul = 0;
      pose.attack = 1;
      if (e.stateTime >= 1.3) {
        const d = Math.hypot(player.body.x - e.targetX, player.body.z - e.targetZ);
        if (d < 3.4 && player.alive && player.damage(22, e.targetX, e.targetZ, false)) audio.play('hurt');
        effects.debrisBurst(e.targetX, player.body.y + 0.1, e.targetZ, e.rig.bodyColor, 24, 7, 0.1, 0.25);
        effects.sparkBurst(e.targetX, player.body.y + 0.2, e.targetZ, 0, 1, 0, 18, 7, 1.6);
        audio.play('slam');
        player.addTrauma(0.5);
        e.action = null;
        e.ability2Timer = enraged ? 5 : 7;
        e.setState(EnemyState.Recover);
      }
      return;
    }
    if (e.action === 'melee') {
      it.speedMul = 0.1;
      this.toward(dx, dz, dist);
      pose.attack = Math.min(1, e.stateTime / 0.6);
      if (e.stateTime >= 0.6) {
        if (dist < e.archetype.attackHitRange && player.alive && player.damage(e.archetype.damage, e.body.x, e.body.z, true)) audio.play('hurt');
        audio.play('enemyAttack', 1);
        e.action = null;
        e.setState(EnemyState.Recover);
      }
      return;
    }
    if (e.state === EnemyState.Recover) {
      pose.swing = Math.max(0, 1 - e.stateTime / 0.6);
      it.speedMul = 0.2;
      this.toward(dx, dz, dist);
      if (e.stateTime >= 0.6) e.setState(EnemyState.Chase);
      return;
    }

    // Choose the next action.
    if (dist < 3.2 && player.alive) {
      e.action = 'melee';
      e.setState(EnemyState.Attack);
      return;
    }
    if (e.phase >= 2 && e.summonTimer <= 0) {
      e.summonTimer = enraged ? 13 : 16;
      const kinds: ArchetypeId[] = enraged ? ['chaser', 'chaser', 'shooter', 'shooter'] : ['chaser', 'chaser', 'chaser'];
      kinds.forEach((k, i) => {
        const ang = e.yaw + Math.PI + (i - (kinds.length - 1) / 2) * 0.7;
        this.ctx.spawnMinion(k, e.body.x + Math.sin(ang) * 2.5, e.body.z + Math.cos(ang) * 2.5);
      });
      audio.play('roar', 0.6);
    }
    if (e.phase >= 2 && e.ability2Timer <= 0 && player.alive) {
      e.action = 'slam';
      e.targetX = player.body.x;
      e.targetZ = player.body.z;
      telegraphs.show(e.targetX, player.body.y, e.targetZ, 3.4, 1.3);
      audio.play('enemyCharge', 1);
      e.setState(EnemyState.Attack);
      return;
    }
    if (e.abilityTimer <= 0 && e.hasLos && player.alive) {
      e.action = 'volley';
      audio.play('enemyCharge', 1);
      e.setState(EnemyState.Attack);
      return;
    }
    // Advance to mid range; strafe slowly once there.
    it.speedMul = enraged ? 1.3 : 1;
    if (dist > 9) this.pursue(e, dx, dz, dy, dist);
    else {
      const inv = 1 / (dist || 1);
      it.dirX = -dz * inv * 0.6;
      it.dirZ = dx * inv * 0.6;
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
          if (e.elite) this.fireAt(e, r.projectileSpeed, r.projectileDamage, 3, 0.18);
          else this.fireAt(e, r.projectileSpeed, r.projectileDamage);
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

  /**
   * Fires at the player's chest, leading them partially so strafing can still dodge it.
   * `count` > 1 fires a horizontal fan spanning `spread` radians.
   */
  private fireAt(e: Enemy, speed: number, damage: number, count = 1, spread = 0): void {
    const { player, projectiles } = this.ctx;
    if (e.look.gun) e.rig.getMuzzleWorld(muzzle);
    else {
      // Gunless shooters (the boss) fire from the chest.
      muzzle.x = e.body.x + Math.sin(e.yaw) * e.radius * 1.2;
      muzzle.y = e.body.y + e.rig.coreCenterY;
      muzzle.z = e.body.z + Math.cos(e.yaw) * e.radius * 1.2;
    }
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
    dx /= l2;
    dy /= l2;
    dz /= l2;
    for (let i = 0; i < count; i++) {
      const a = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      projectiles.fire(muzzle.x, muzzle.y, muzzle.z, dx * ca - dz * sa, dy, dx * sa + dz * ca, speed, damage);
    }
  }

  /**
   * Safety net so a wave can never soft-lock: an enemy that is out of sight and hasn't moved a
   * metre in STUCK_TIME seconds is sent back to a spawn point (with its spawn-in animation).
   */
  private watchStuck(e: Enemy, dt: number, dist: number): void {
    if (e.state === EnemyState.Spawning || e.hasLos || dist < 6) {
      e.stuckTimer = 0;
      e.stuckX = e.body.x;
      e.stuckZ = e.body.z;
      return;
    }
    if (Math.hypot(e.body.x - e.stuckX, e.body.z - e.stuckZ) > 1) {
      e.stuckTimer = 0;
      e.stuckX = e.body.x;
      e.stuckZ = e.body.z;
    } else if ((e.stuckTimer += dt) > STUCK_TIME) {
      this.ctx.relocate(e);
      e.stuckTimer = 0;
      e.stuckX = e.body.x;
      e.stuckZ = e.body.z;
    }
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
    const slow = e.slowTimer > 0 ? MODULE_TUNING.slowFactor : 1;
    const targetVx = it.dirX * e.speed * it.speedMul * slow;
    const targetVz = it.dirZ * e.speed * it.speedMul * slow;
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
    if (e.state === EnemyState.Leap) {
      const flags = world.moveHorizontal(e.body, e.leapVX * dt, e.leapVZ * dt, e.collisionRadius, 0.55);
      if (flags) e.blocked = true;
    } else if (e.state !== EnemyState.Spawning) {
      const mx = (e.vx + sx * sepStrength * 0.5 + e.kbx) * dt;
      const mz = (e.vz + sz * sepStrength * 0.5 + e.kbz) * dt;
      const flags = world.moveHorizontal(e.body, mx, mz, e.collisionRadius, 0.55);
      if (flags) e.blocked = true;
    }

    // Vertical: follow terrain, fall off ledges.
    const ground = world.groundHeight(e.body, e.collisionRadius);
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
