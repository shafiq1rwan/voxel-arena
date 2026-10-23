import type { Body } from '../world/VoxelWorld';
import type { EnemyLook } from '../procedural/EnemyGenerator';
import type { EnemyRig } from './EnemyRig';
import { EnemyState, type ArchetypeDef } from './EnemyTypes';

export interface EnemyRayHit {
  t: number;
  headshot: boolean;
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

  constructor(
    readonly id: number,
    readonly rig: EnemyRig,
  ) {}

  activate(archetype: ArchetypeDef, look: EnemyLook, x: number, y: number, z: number, healthScale: number, speedScale: number): void {
    this.active = true;
    this.archetype = archetype;
    this.look = look;
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.vx = this.vz = this.vy = 0;
    this.kbx = this.kbz = 0;
    this.maxHealth = Math.round(archetype.maxHealth * healthScale);
    this.health = this.maxHealth;
    this.speed = archetype.speed * speedScale * (0.92 + Math.random() * 0.16);
    this.state = EnemyState.Spawning;
    this.stateTime = 0;
    this.losTimer = Math.random() * 0.3;
    this.hasLos = false;
    this.attackLanded = false;
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

  /**
   * Ray test against head and body boxes. Boxes are axis-aligned and slightly generous, which
   * reads as fair in a fast arcade shooter. Returns null on miss.
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
      out.headshot = true;
    } else {
      out.t = tBody;
      out.headshot = false;
    }
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
