import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../config';
import type { PlayerController } from '../player/PlayerController';
import type { Effects } from '../render/Effects';
import type { MaterialLibrary } from '../render/Materials';
import { VoxelMeshBuilder } from '../render/VoxelMeshBuilder';
import type { RayHit, VoxelWorld } from '../world/VoxelWorld';

const CAPACITY = 64;
const LIFETIME = 3.2;
/** Player hit capsule radius used for projectile tests (slightly forgiving). */
const PLAYER_HIT_RADIUS = 0.42;

const tmpMatrix = new Matrix();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpPos = new Vector3();
const rayHit: RayHit = { distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };

/**
 * Pooled, simulated enemy projectiles (as opposed to the player's hitscan). Rendered as glowing
 * thin instances in a single draw call; swept against the voxel world and the player's capsule
 * each frame so fast shots never tunnel.
 */
export class ProjectileSystem {
  private mesh: Mesh;
  private matrices = new Float32Array(CAPACITY * 16);
  private px = new Float32Array(CAPACITY);
  private py = new Float32Array(CAPACITY);
  private pz = new Float32Array(CAPACITY);
  private vx = new Float32Array(CAPACITY);
  private vy = new Float32Array(CAPACITY);
  private vz = new Float32Array(CAPACITY);
  private life = new Float32Array(CAPACITY);
  private damage = new Float32Array(CAPACITY);
  private spin = new Float32Array(CAPACITY);
  private next = 0;
  private active = 0;
  private world: VoxelWorld | null = null;
  private player: PlayerController | null = null;

  constructor(
    scene: Scene,
    materials: MaterialLibrary,
    private effects: Effects,
    private audio: AudioManager,
  ) {
    const b = new VoxelMeshBuilder();
    // A chunky core plus a cross of fins reads as an energy bolt from any angle.
    b.addBox(0, 0, 0, 1, 1, 1, { r: 1, g: 1, b: 1 }, { faceShade: false });
    b.addBox(0, 0, -0.6, 0.45, 0.45, 1.4, { r: 1, g: 1, b: 1 }, { faceShade: false });
    this.mesh = b.build('enemy_projectiles', scene, { colors: false });
    this.mesh.material = materials.emissive('#3fd8ff', 1.6);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
  }

  bind(world: VoxelWorld, player: PlayerController): void {
    this.world = world;
    this.player = player;
    this.clear();
  }

  fire(x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number, speed: number, damage: number): void {
    const i = this.next;
    this.next = (this.next + 1) % CAPACITY;
    if (this.life[i]! <= 0) this.active++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = dirX * speed;
    this.vy[i] = dirY * speed;
    this.vz[i] = dirZ * speed;
    this.life[i] = LIFETIME;
    this.damage[i] = damage;
    this.spin[i] = Math.random() * Math.PI * 2;
  }

  update(dt: number): void {
    if (this.active === 0) return;
    const world = this.world;
    const player = this.player;
    let active = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.kill(i);
        continue;
      }
      const x0 = this.px[i]!;
      const y0 = this.py[i]!;
      const z0 = this.pz[i]!;
      const sx = this.vx[i]! * dt;
      const sy = this.vy[i]! * dt;
      const sz = this.vz[i]! * dt;
      const len = Math.hypot(sx, sy, sz);
      const dx = sx / len;
      const dy = sy / len;
      const dz = sz / len;

      // Player first: closest approach of this frame's segment to the player's vertical capsule.
      if (player && player.alive) {
        const t = segmentCapsuleHit(x0, y0, z0, sx, sy, sz, player.body.x, player.body.y + 0.25, player.body.y + CONFIG.player.height - 0.1, player.body.z, PLAYER_HIT_RADIUS);
        if (t >= 0) {
          const hx = x0 + sx * t;
          const hy = y0 + sy * t;
          const hz = z0 + sz * t;
          // Only count it if no wall is in between.
          if (!world || !world.raycast(x0, y0, z0, dx, dy, dz, len * t, rayHit)) {
            if (player.damage(this.damage[i]!, x0 - dx * 4, z0 - dz * 4, false)) this.audio.play('hurt');
            this.effects.sparkBurst(hx, hy, hz, -dx, -dy, -dz, 6, 3);
            this.kill(i);
            continue;
          }
        }
      }

      if (world && world.raycast(x0, y0, z0, dx, dy, dz, len, rayHit)) {
        this.effects.sparkBurst(rayHit.x, rayHit.y, rayHit.z, rayHit.nx, rayHit.ny, rayHit.nz, 6, 3.5);
        this.kill(i);
        continue;
      }

      this.px[i] = x0 + sx;
      this.py[i] = y0 + sy;
      this.pz[i] = z0 + sz;
      this.spin[i]! += dt * 14;
      active++;

      const s = 0.16;
      tmpScale.set(s, s, s);
      Quaternion.RotationYawPitchRollToRef(Math.atan2(dx, dz), -Math.asin(dy), this.spin[i]!, tmpQuat);
      tmpPos.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      Matrix.ComposeToRef(tmpScale, tmpQuat, tmpPos, tmpMatrix);
      tmpMatrix.copyToArray(this.matrices, i * 16);
    }
    this.active = active;
    this.mesh.thinInstanceBufferUpdated('matrix');
  }

  private kill(i: number): void {
    this.life[i] = 0;
    this.matrices.fill(0, i * 16, i * 16 + 16);
  }

  clear(): void {
    this.life.fill(0);
    this.matrices.fill(0);
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.active = 0;
  }

  get activeCount(): number {
    return this.active;
  }
}

/**
 * Earliest parameter t in [0,1] where segment P0 + t*S comes within `r` of the vertical capsule
 * (axis x=cx, z=cz, y in [y0,y1]); -1 if it never does. Sampled analytically on the XZ plane,
 * then validated against the capsule's vertical span.
 */
export function segmentCapsuleHit(
  x0: number,
  y0: number,
  z0: number,
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  capY0: number,
  capY1: number,
  cz: number,
  r: number,
): number {
  // Solve |(P0.xz + t*S.xz) - C.xz|^2 = r^2 for the entry time.
  const ox = x0 - cx;
  const oz = z0 - cz;
  const a = sx * sx + sz * sz;
  const b = 2 * (ox * sx + oz * sz);
  const c = ox * ox + oz * oz - r * r;
  let t: number;
  if (c <= 0) t = 0;
  else {
    if (a < 1e-9) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return -1;
  }
  const y = y0 + sy * t;
  return y >= capY0 - r && y <= capY1 + r ? t : -1;
}
