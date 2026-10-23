import type { Enemy, EnemyRayHit } from '../enemies/Enemy';
import { EnemyState } from '../enemies/EnemyTypes';
import type { RayHit, VoxelWorld } from '../world/VoxelWorld';

export interface ShotHit {
  enemy: Enemy;
  distance: number;
  headshot: boolean;
}

export interface ShotResult {
  /** Enemies hit in order of distance (length <= pierce + 1). */
  enemies: ShotHit[];
  /** World surface hit, if any, before range ran out. */
  worldHit: boolean;
  /** Final impact point (first non-pierced hit or end of range). */
  endX: number;
  endY: number;
  endZ: number;
  nx: number;
  ny: number;
  nz: number;
}

const enemyHit: EnemyRayHit = { t: 0, headshot: false };
const worldHit: RayHit = { distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
const candidates: ShotHit[] = [];

/**
 * Hitscan resolution: ray vs voxel heightmap (DDA) and ray vs enemy head/body boxes.
 * Allocation-free except for the returned enemy list entries (reused).
 */
export class HitDetection {
  private result: ShotResult = { enemies: [], worldHit: false, endX: 0, endY: 0, endZ: 0, nx: 0, ny: 0, nz: 0 };
  private hitPool: ShotHit[] = [];

  constructor(private getWorld: () => VoxelWorld | null) {}

  cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, enemies: readonly Enemy[], pierce: number): ShotResult {
    const r = this.result;
    r.enemies.length = 0;
    const world = this.getWorld();
    const wh = world?.raycast(ox, oy, oz, dx, dy, dz, range, worldHit) ?? null;
    const maxT = wh ? wh.distance : range;

    candidates.length = 0;
    let poolIdx = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (!e.alive) continue;
      // Enemies still rising out of the ground can't be hit yet.
      if (e.state === EnemyState.Spawning && e.stateTime < 0.35) continue;
      const hit = e.rayTest(ox, oy, oz, dx, dy, dz, enemyHit);
      if (!hit || hit.t > maxT) continue;
      const entry = this.hitPool[poolIdx] ?? (this.hitPool[poolIdx] = { enemy: e, distance: 0, headshot: false });
      poolIdx++;
      entry.enemy = e;
      entry.distance = hit.t;
      entry.headshot = hit.headshot;
      candidates.push(entry);
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const count = Math.min(candidates.length, pierce + 1);
    for (let i = 0; i < count; i++) r.enemies.push(candidates[i]!);

    if (count > 0 && count === pierce + 1) {
      const last = r.enemies[count - 1]!;
      r.worldHit = false;
      r.endX = ox + dx * last.distance;
      r.endY = oy + dy * last.distance;
      r.endZ = oz + dz * last.distance;
      r.nx = -dx;
      r.ny = -dy;
      r.nz = -dz;
    } else if (wh) {
      r.worldHit = true;
      r.endX = wh.x;
      r.endY = wh.y;
      r.endZ = wh.z;
      r.nx = wh.nx;
      r.ny = wh.ny;
      r.nz = wh.nz;
    } else {
      r.worldHit = false;
      r.endX = ox + dx * range;
      r.endY = oy + dy * range;
      r.endZ = oz + dz * range;
      r.nx = r.ny = r.nz = 0;
    }
    return r;
  }
}
