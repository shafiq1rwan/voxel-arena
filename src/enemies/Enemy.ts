import type { Body } from '../world/VoxelWorld';
import type { EnemyLook } from '../procedural/EnemyGenerator';
import { createPose, type EnemyRig, type RigPose } from './EnemyRig';
import { ELITE_HEALTH, EnemyState, type ArchetypeDef } from './EnemyTypes';

export type HitZone = 'head' | 'body' | 'core';

export interface EnemyRayHit {
  t: number;
  zone: HitZone;
}

/** Runtime enemy entity (pooled). Logic lives in EnemyAI; visuals in EnemyRig. */
export class Enemy {
  active = false;
  archetype!: ArchetypeDef;
  look!: EnemyLook;
  readonly body: Body = { x: 0, y: 0, z: 0 };
  vx = 0;
  vz = 0;
  vy = 0;
  yaw = 0;
  health = 0;
  maxHealth = 0;
  speed = 0;
  state: EnemyState = EnemyState.Inactive;
  stateTime = 0;
  /** Seconds until next line-of-sight re-check (staggered across enemies). */
  losTimer = 0;
  hasLos = false;
  /** Knockback impulse decaying over time. */
  kbx = 0;
  kbz = 0;
  attackLanded = false;
  elite = false;
  /** Reused animation pose (no per-frame allocation). */
  readonly pose: RigPose = createPose();
  /** Ranged: seconds until the next shot may start winding up. */
  fireCooldown = 0;
  /** Ranged: +1 / -1 circling direction, flipped periodically or when blocked. */
  strafeSign = 1;
  strafeTimer = 0;
  /** Ranged: seconds the player has been out of sight while strafing. */
  losLostTime = 0;
  /** Set by movement when a wall stopped this enemy last frame. */
  blocked = false;
  /** Freeze module: seconds of slow remaining. */
  slowTimer = 0;
  /** Elite / boss special-ability cooldown. */
  abilityTimer = 0;
  /** Secondary cooldown (boss summons, warden regen ticks). */
  ability2Timer = 0;
  /** Boss phase (1..3). */
  phase = 1;
  /** Locked target for telegraphed area attacks (boss slam, elite leap). */
  targetX = 0;
  targetZ = 0;
  /** Boss / elite action currently being performed. */
  action: 'volley' | 'slam' | 'melee' | 'leap' | null = null;
  /** Elite leap horizontal velocity. */
  leapVX = 0;
  leapVZ = 0;
  /** Boss summon cooldown. */
  summonTimer = 0;
  /** Stuck watchdog: seconds without real progress, measured from (stuckX, stuckZ). */
  stuckTimer = 0;
  stuckX = 0;
  stuckZ = 0;

  constructor(
    readonly id: number,
    readonly rig: EnemyRig,
  ) {}

  activate(archetype: ArchetypeDef, look: EnemyLook, x: number, y: number, z: number, healthScale: number, speedScale: number, elite = false): void {
    this.active = true;
    this.archetype = archetype;
    this.elite = elite;
    this.look = look;
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.vx = this.vz = this.vy = 0;
    this.kbx = this.kbz = 0;
    this.maxHealth = Math.round(archetype.maxHealth * healthScale * (elite && archetype.id !== 'boss' ? ELITE_HEALTH : 1));
    this.health = this.maxHealth;
    this.speed = archetype.speed * speedScale * (0.92 + Math.random() * 0.16);
    this.state = EnemyState.Spawning;
    this.stateTime = 0;
    this.losTimer = Math.random() * 0.3;
    this.hasLos = false;
    this.attackLanded = false;
    this.blocked = false;
    this.slowTimer = 0;
    this.abilityTimer = 2 + Math.random() * 2;
    this.ability2Timer = 6;
    this.summonTimer = 10;
    this.action = null;
    this.phase = 1;
    this.losLostTime = 0;
    this.stuckTimer = 0;
    this.stuckX = x;
    this.stuckZ = z;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 1.5;
    // Stagger the first shot so a freshly spawned group doesn't volley in sync.
    this.fireCooldown = archetype.ranged ? archetype.ranged.fireInterval * (0.4 + Math.random() * 0.6) : 0;
    this.rig.configure(look);
    this.rig.setVisible(true);
    this.syncRig();
  }

  deactivate(): void {
    this.active = false;
    this.state = EnemyState.Inactive;
    this.rig.setVisible(false);
  }

  setState(s: EnemyState): void {
    this.state = s;
    this.stateTime = 0;
  }

  get radius(): number {
    return this.archetype.radius * this.look.scale;
  }

  /**
   * Radius used against the voxel terrain. Arena corridors and doorways are one cell wide, so big
   * bodies (tanks, the boss) collide with a slimmer capsule than they draw; separation and player
   * spacing still use the full `radius`.
   */
  get collisionRadius(): number {
    return Math.min(this.radius, this.archetype.id === 'boss' ? 0.75 : 0.42);
  }

  get alive(): boolean {
    return this.active && this.state !== EnemyState.Dead;
  }

  /** Centre of mass, for tracers / effects. */
  get centerY(): number {
    return this.body.y + this.rig.bodyTop * 0.7;
  }

  syncRig(): void {
    this.rig.root.position.set(this.body.x, this.body.y, this.body.z);
    this.rig.root.rotation.y = this.yaw;
  }

  /** Score / scrap value, tripled for elites. */
  get reward(): number {
    return this.archetype.reward * (this.elite && this.archetype.id !== 'boss' ? 3 : 1);
  }

  /**
   * Ray test against head, weak-point core and body boxes. Boxes are axis-aligned and slightly
   * generous, which reads as fair in a fast arcade shooter. Returns null on miss.
   */
  rayTest(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: EnemyRayHit): EnemyRayHit | null {
    const rig = this.rig;
    const x = this.body.x;
    const y = this.body.y;
    const z = this.body.z;
    const hh = rig.headHalf * 1.15;
    const hy = y + rig.headCenterY;
    const tHead = rayAabb(ox, oy, oz, dx, dy, dz, x - hh, hy - hh, z - hh, x + hh, hy + hh, z + hh);
    const bw = rig.bodyHalfWidth;
    const tBody = rayAabb(ox, oy, oz, dx, dy, dz, x - bw, y, z - bw, x + bw, y + rig.bodyTop, z + bw);
    if (tHead < 0 && tBody < 0) return null;
    if (tHead >= 0 && (tBody < 0 || tHead <= tBody + 0.05)) {
      out.t = tHead;
      out.zone = 'head';
      return out;
    }
    if (this.archetype.weakPoint) {
      // Glowing chest core sits on the front of the torso.
      const ch = rig.coreHalf * 1.2;
      const cx = x + Math.sin(this.yaw) * rig.coreForward;
      const cz = z + Math.cos(this.yaw) * rig.coreForward;
      const cy = y + rig.coreCenterY;
      const tCore = rayAabb(ox, oy, oz, dx, dy, dz, cx - ch, cy - ch, cz - ch, cx + ch, cy + ch, cz + ch);
      if (tCore >= 0 && (tBody < 0 || tCore <= tBody + 0.25)) {
        out.t = tCore;
        out.zone = 'core';
        return out;
      }
    }
    out.t = tBody;
    out.zone = 'body';
    return out;
  }
}

/** Slab test; returns entry distance or -1. */
export function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < minY || oy > maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < Math.max(0, tmin)) return -1;
  return Math.max(0, tmin);
}
