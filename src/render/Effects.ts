import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { MaterialLibrary } from './Materials';
import { VoxelMeshBuilder, type RGB } from './VoxelMeshBuilder';

const tmpMatrix = new Matrix();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpPos = new Vector3();

/**
 * Fixed-capacity particle pool rendered as thin instances of a single cube: one draw call for
 * hundreds of particles and zero allocations per frame.
 */
class CubeParticlePool {
  readonly mesh: Mesh;
  private matrices: Float32Array;
  private colors: Float32Array | null;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private next = 0;
  private activeCount = 0;
  private dirty = true;

  constructor(
    scene: Scene,
    name: string,
    readonly capacity: number,
    material: Mesh['material'],
    withColors: boolean,
    private gravity: number,
    private bounce: boolean,
  ) {
    const b = new VoxelMeshBuilder();
    b.addBox(0, 0, 0, 1, 1, 1, { r: 1, g: 1, b: 1 }, { faceShade: withColors });
    this.mesh = b.build(name, scene, { colors: withColors });
    this.mesh.material = material;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.matrices = new Float32Array(capacity * 16);
    this.colors = withColors ? new Float32Array(capacity * 4).fill(1) : null;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    if (this.colors) this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    const f = () => new Float32Array(capacity);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.maxLife = f();
    this.size = f();
    this.rot = f();
    this.spin = f();
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color?: RGB): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.life[i]! <= 0) this.activeCount++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * 16;
    if (this.colors && color) {
      this.colors[i * 4] = color.r;
      this.colors[i * 4 + 1] = color.g;
      this.colors[i * 4 + 2] = color.b;
      this.colors[i * 4 + 3] = 1;
      this.colorsDirty = true;
    }
  }

  private colorsDirty = false;

  update(dt: number, world: VoxelWorld | null): void {
    if (this.activeCount === 0 && !this.dirty) return;
    this.dirty = false;
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) {
        if (this.matrices[i * 16 + 15] !== 0) {
          this.matrices.fill(0, i * 16, i * 16 + 16);
          this.dirty = true;
        }
        continue;
      }
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.matrices.fill(0, i * 16, i * 16 + 16);
        this.dirty = true;
        continue;
      }
      active++;
      this.vy[i]! -= this.gravity * dt;
      let nx = this.px[i]! + this.vx[i]! * dt;
      let ny = this.py[i]! + this.vy[i]! * dt;
      let nz = this.pz[i]! + this.vz[i]! * dt;
      if (this.bounce && world) {
        const half = this.size[i]! * 0.5;
        const h = world.heightAtWorld(nx, nz);
        if (ny - half < h) {
          if (this.py[i]! - half >= h - 0.05) {
            // Landed on a top surface.
            ny = h + half;
            this.vy[i] = -this.vy[i]! * 0.3;
            this.vx[i]! *= 0.6;
            this.vz[i]! *= 0.6;
            this.spin[i]! *= 0.5;
          } else {
            // Hit a wall side: bounce back horizontally.
            nx = this.px[i]!;
            nz = this.pz[i]!;
            this.vx[i] = -this.vx[i]! * 0.4;
            this.vz[i] = -this.vz[i]! * 0.4;
          }
        }
      }
      this.px[i] = nx;
      this.py[i] = ny;
      this.pz[i] = nz;
      this.rot[i]! += this.spin[i]! * dt;

      const t = this.life[i]! / this.maxLife[i]!;
      const s = this.size[i]! * (this.bounce ? Math.min(1, t * 4) : t);
      tmpScale.set(s, s, s);
      Quaternion.RotationYawPitchRollToRef(this.rot[i]!, this.rot[i]! * 0.7, 0, tmpQuat);
      tmpPos.set(nx, ny, nz);
      Matrix.ComposeToRef(tmpScale, tmpQuat, tmpPos, tmpMatrix);
      tmpMatrix.copyToArray(this.matrices, i * 16);
    }
    this.activeCount = active;
    this.mesh.thinInstanceBufferUpdated('matrix');
    if (this.colorsDirty) {
      this.mesh.thinInstanceBufferUpdated('color');
      this.colorsDirty = false;
    }
    this.dirty ||= active > 0;
  }

  clear(): void {
    this.life.fill(0);
    this.activeCount = 0;
    this.dirty = true;
  }
}

/** Hitscan tracer streaks, as thin instances of a unit cube stretched along their direction. */
class TracerPool {
  readonly mesh: Mesh;
  private matrices: Float32Array;
  private sx: Float32Array;
  private sy: Float32Array;
  private sz: Float32Array;
  private ex: Float32Array;
  private ey: Float32Array;
  private ez: Float32Array;
  private life: Float32Array;
  private next = 0;
  private active = 0;

  constructor(
    scene: Scene,
    readonly capacity: number,
    material: Mesh['material'],
  ) {
    const b = new VoxelMeshBuilder();
    b.addBox(0, 0, 0, 1, 1, 1, { r: 1, g: 1, b: 1 }, { faceShade: false });
    this.mesh = b.build('tracers', scene, { colors: false });
    this.mesh.material = material;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.matrices = new Float32Array(capacity * 16);
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    const f = () => new Float32Array(capacity);
    this.sx = f();
    this.sy = f();
    this.sz = f();
    this.ex = f();
    this.ey = f();
    this.ez = f();
    this.life = f();
  }

  emit(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.sx[i] = sx;
    this.sy[i] = sy;
    this.sz[i] = sz;
    this.ex[i] = ex;
    this.ey[i] = ey;
    this.ez[i] = ez;
    this.life[i] = 0.075;
    this.active = this.capacity;
  }

  update(dt: number): void {
    if (this.active === 0) return;
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) {
        if (this.matrices[i * 16 + 15] !== 0) this.matrices.fill(0, i * 16, i * 16 + 16);
        continue;
      }
      this.life[i]! -= dt;
      const t = Math.max(0, this.life[i]! / 0.075);
      if (t <= 0) {
        this.matrices.fill(0, i * 16, i * 16 + 16);
        continue;
      }
      active++;
      // The streak travels toward the target and shrinks, reading as a fast bullet.
      const k = 1 - t;
      const ax = this.sx[i]! + (this.ex[i]! - this.sx[i]!) * k * 0.6;
      const ay = this.sy[i]! + (this.ey[i]! - this.sy[i]!) * k * 0.6;
      const az = this.sz[i]! + (this.ez[i]! - this.sz[i]!) * k * 0.6;
      const dx = this.ex[i]! - ax;
      const dy = this.ey[i]! - ay;
      const dz = this.ez[i]! - az;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.01) continue;
      const w = 0.035 * (0.4 + t * 0.6);
      tmpScale.set(w, w, len);
      Quaternion.RotationYawPitchRollToRef(Math.atan2(dx, dz), -Math.asin(dy / len), 0, tmpQuat);
      tmpPos.set(ax + dx * 0.5, ay + dy * 0.5, az + dz * 0.5);
      Matrix.ComposeToRef(tmpScale, tmpQuat, tmpPos, tmpMatrix);
      tmpMatrix.copyToArray(this.matrices, i * 16);
    }
    // Expired tracers were zeroed in this same pass, so stopping at active === 0 is safe.
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.active = active;
  }

  clear(): void {
    this.life.fill(0);
    this.matrices.fill(0);
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.active = 0;
  }
}

export class Effects {
  private debris: CubeParticlePool;
  private sparks: CubeParticlePool;
  private tracers: TracerPool;
  private world: VoxelWorld | null = null;
  /** Particle density multiplier from quality settings. */
  density = 1;

  constructor(scene: Scene, materials: MaterialLibrary) {
    this.debris = new CubeParticlePool(scene, 'debris', 360, materials.vertexLit('debris'), true, 18, true);
    this.sparks = new CubeParticlePool(scene, 'sparks', 160, materials.emissive('#ffd27a', 1.4), false, 9, false);
    this.tracers = new TracerPool(scene, 32, materials.emissive('#ffe6a0', 1.6));
  }

  setWorld(world: VoxelWorld | null): void {
    this.world = world;
  }

  /** Voxel chunks bursting outward (enemy deaths, block impacts). */
  debrisBurst(x: number, y: number, z: number, color: RGB, count: number, speed: number, sizeMin = 0.08, sizeMax = 0.22): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      const shade = 0.75 + Math.random() * 0.35;
      this.debris.emit(
        x + (Math.random() - 0.5) * 0.4,
        y + (Math.random() - 0.5) * 0.6,
        z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * sp,
        2 + up * speed,
        Math.sin(a) * sp,
        1.2 + Math.random() * 0.9,
        sizeMin + Math.random() * (sizeMax - sizeMin),
        { r: color.r * shade, g: color.g * shade, b: color.b * shade },
      );
    }
  }

  /** Bright sparks spraying out along a surface normal. */
  sparkBurst(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, speed = 6, sizeScale = 1): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.sparks.emit(
        x,
        y,
        z,
        (nx + (Math.random() - 0.5) * 1.4) * sp,
        (ny + (Math.random() - 0.2) * 1.4) * sp,
        (nz + (Math.random() - 0.5) * 1.4) * sp,
        (0.12 + Math.random() * 0.15) * (sizeScale > 1 ? 1.6 : 1),
        (0.035 + Math.random() * 0.05) * sizeScale,
      );
    }
  }

  tracer(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): void {
    this.tracers.emit(sx, sy, sz, ex, ey, ez);
  }

  update(dt: number): void {
    this.debris.update(dt, this.world);
    this.sparks.update(dt, this.world);
    this.tracers.update(dt);
  }

  clear(): void {
    this.debris.clear();
    this.sparks.clear();
    this.tracers.clear();
  }
}
