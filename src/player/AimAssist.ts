import type { Enemy } from '../enemies/Enemy';
import { wrapAngle } from '../core/MathUtil';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { PlayerController } from './PlayerController';

/**
 * Light touch-screen aim assist: a gentle pull toward the nearest visible enemy inside a small
 * cone, and optional auto-fire when the crosshair is on target. Desktop never uses this.
 */
export class AimAssist {
  /** True when the crosshair is on an enemy this frame (drives auto-fire). */
  onTarget = false;
  private losTimer = 0;
  private target: Enemy | null = null;

  update(dt: number, player: PlayerController, enemies: readonly Enemy[], world: VoxelWorld, assist: boolean): void {
    this.onTarget = false;
    const ex = player.body.x;
    const ey = player.eyeY;
    const ez = player.body.z;
    // Pick the enemy closest to the crosshair within a 9° cone and 28 m.
    let best: Enemy | null = null;
    let bestErr = 0.16;
    let bestYaw = 0;
    let bestPitch = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.body.x - ex;
      const dz = e.body.z - ez;
      const dist = Math.hypot(dx, dz);
      if (dist > 28 || dist < 0.5) continue;
      const ty = e.body.y + e.rig.bodyTop * 0.75;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(ty - ey, dist);
      const err = Math.hypot(wrapAngle(yaw - player.yaw), pitch - player.pitch);
      if (err < bestErr) {
        bestErr = err;
        best = e;
        bestYaw = yaw;
        bestPitch = pitch;
      }
    }
    // Line-of-sight check is throttled; it only matters for the chosen candidate.
    this.losTimer -= dt;
    if (best !== this.target || this.losTimer <= 0) {
      this.target = best && world.hasLineOfSight(ex, ey, ez, best.body.x, best.body.y + best.rig.bodyTop * 0.75, best.body.z) ? best : null;
      this.losTimer = 0.15;
    }
    if (!this.target || this.target !== best) return;
    this.onTarget = bestErr < 0.045;
    if (assist) {
      // Ease a small fraction of the remaining error per second — helps, never snaps.
      const k = Math.min(1, dt * 2.2);
      player.yaw += wrapAngle(bestYaw - player.yaw) * k * 0.5;
      player.pitch += (bestPitch - player.pitch) * k * 0.35;
    }
  }
}
