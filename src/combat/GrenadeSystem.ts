import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { AudioManager } from '../audio/AudioManager';
import type { EnemyPool } from '../enemies/EnemyPool';
import type { MaterialLibrary } from '../render/Materials';
import { VoxelMeshBuilder, hexToRgb } from '../render/VoxelMeshBuilder';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { DamageSystem } from './DamageSystem';

const GRAVITY = 20;
const FUSE = 1.4;
export const GRENADE_COOLDOWN = 8;
const RADIUS = 3.4;
const DAMAGE = 75;

interface Grenade {
  active: boolean;
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
}

/** Frag Grenade ability (unlock): a bouncing voxel grenade on a short fuse. */
export class GrenadeSystem {
  private grenades: Grenade[] = [];
  private world: VoxelWorld | null = null;
  unlocked = false;
  cooldown = 0;

  constructor(
    scene: Scene,
    materials: MaterialLibrary,
    private camera: FreeCamera,
    private damage: DamageSystem,
    private pool: EnemyPool,
    private audio: AudioManager,
  ) {
    for (let i = 0; i < 3; i++) {
      const b = new VoxelMeshBuilder();
      b.addBox(0, 0, 0, 0.16, 0.2, 0.16, hexToRgb('#3d4a2e'));
      b.addBox(0, 0.12, 0, 0.06, 0.05, 0.06, hexToRgb('#9aa0a6'));
      b.addBox(0, 0, 0, 0.17, 0.04, 0.17, hexToRgb('#ffb347'));
      const mesh = b.build(`grenade_${i}`, scene);
      mesh.material = materials.vertexLit('grenade', 0.3);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.grenades.push({ active: false, mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0 });
    }
  }

  bind(world: VoxelWorld): void {
    this.world = world;
    this.cooldown = 0;
    for (const g of this.grenades) {
      g.active = false;
      g.mesh.setEnabled(false);
    }
  }

  /** 0 = ready, 1 = just thrown. */
  get cooldown01(): number {
    return this.cooldown / GRENADE_COOLDOWN;
  }

  tryThrow(): boolean {
    if (!this.unlocked || this.cooldown > 0) return false;
    const g = this.grenades.find((k) => !k.active);
    if (!g) return false;
    const c = this.camera;
    const yaw = c.rotation.y;
    const pitch = c.rotation.x - 0.18; // lob slightly upward
    const fx = Math.sin(yaw) * Math.cos(pitch);
    const fy = -Math.sin(pitch);
    const fz = Math.cos(yaw) * Math.cos(pitch);
    g.active = true;
    g.x = c.position.x + fx * 0.6;
    g.y = c.position.y - 0.15;
    g.z = c.position.z + fz * 0.6;
    g.vx = fx * 15;
    g.vy = fy * 15 + 2;
    g.vz = fz * 15;
    g.fuse = FUSE;
    g.mesh.setEnabled(true);
    this.cooldown = GRENADE_COOLDOWN;
    this.audio.play('throw');
    return true;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const world = this.world;
    for (const g of this.grenades) {
      if (!g.active) continue;
      g.fuse -= dt;
      g.vy -= GRAVITY * dt;
      let nx = g.x + g.vx * dt;
      let ny = g.y + g.vy * dt;
      let nz = g.z + g.vz * dt;
      if (world) {
        const h = world.heightAtWorld(nx, nz);
        if (ny - 0.1 < h) {
          if (g.y - 0.1 >= h - 0.05) {
            ny = h + 0.1;
            g.vy = -g.vy * 0.35;
            g.vx *= 0.6;
            g.vz *= 0.6;
          } else {
            nx = g.x;
            nz = g.z;
            g.vx = -g.vx * 0.4;
            g.vz = -g.vz * 0.4;
          }
        }
      }
      g.x = nx;
      g.y = ny;
      g.z = nz;
      g.mesh.position.set(nx, ny, nz);
      g.mesh.rotation.x += dt * 9;
      g.mesh.rotation.z += dt * 6;
      // Detonate on fuse or on direct contact with an enemy.
      let contact = false;
      for (const e of this.pool.active) {
        if (e.alive && Math.hypot(e.body.x - nx, e.body.z - nz) < e.radius + 0.25 && ny > e.body.y && ny < e.body.y + e.rig.headCenterY + 0.3) {
          contact = true;
          break;
        }
      }
      if (g.fuse <= 0 || contact) {
        g.active = false;
        g.mesh.setEnabled(false);
        this.damage.detonate(nx, ny + 0.2, nz, RADIUS, DAMAGE);
      }
    }
  }
}
