import { CellKind, cellIndex, type ArenaData } from '../procedural/ArenaTypes';

export interface RayHit {
  distance: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Mutable position used by the kinematic movement solver. */
export interface Body {
  x: number;
  y: number; // feet
  z: number;
}

const EPS = 1e-3;

/**
 * Collision and ray queries against the arena's column heightmap. Custom grid queries are far
 * cheaper than generic mesh collision and give us exact, deterministic voxel-aligned behaviour.
 */
export class VoxelWorld {
  readonly size: number;
  private heights: Float32Array;

  constructor(readonly data: ArenaData) {
    this.size = data.size;
    this.heights = data.heights;
  }

  /** Column height; outside the grid counts as an infinitely tall wall. */
  heightAt(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return Infinity;
    return this.heights[z * this.size + x]!;
  }

  heightAtWorld(wx: number, wz: number): number {
    return this.heightAt(Math.floor(wx), Math.floor(wz));
  }

  kindAt(x: number, z: number): CellKind {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return CellKind.Boundary;
    return this.data.kinds[cellIndex(this.size, x, z)] as CellKind;
  }

  /** Highest column under an axis-aligned footprint. */
  maxHeightUnder(minX: number, minZ: number, maxX: number, maxZ: number): number {
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX - EPS);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ - EPS);
    let h = 0;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const v = this.heightAt(x, z);
        if (v > h) h = v;
      }
    }
    return h;
  }

  /**
   * Moves a cylinder-ish body (square footprint of half-size `r`) horizontally with axis-separated
   * collision. Columns no higher than feet + stepHeight are walkable (auto step-up).
   * Returns flags: bit 0 = blocked on X, bit 1 = blocked on Z.
   */
  moveHorizontal(body: Body, dx: number, dz: number, r: number, stepHeight: number): number {
    let flags = 0;
    const limit = body.y + stepHeight;
    // Sub-step so a single move never crosses more than half a cell.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.45));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let s = 0; s < steps; s++) {
      if (sx !== 0 && !(flags & 1)) {
        const nx = body.x + sx;
        if (this.maxHeightUnder(nx - r, body.z - r, nx + r, body.z + r) > limit) {
          flags |= 1;
          // Snap flush against the blocking cell edge.
          body.x = sx > 0 ? Math.floor(nx + r) - r - EPS : Math.floor(nx - r) + 1 + r + EPS;
          if (this.maxHeightUnder(body.x - r, body.z - r, body.x + r, body.z + r) > limit) body.x -= sx; // safety
        } else body.x = nx;
      }
      if (sz !== 0 && !(flags & 2)) {
        const nz = body.z + sz;
        if (this.maxHeightUnder(body.x - r, nz - r, body.x + r, nz + r) > limit) {
          flags |= 2;
          body.z = sz > 0 ? Math.floor(nz + r) - r - EPS : Math.floor(nz - r) + 1 + r + EPS;
          if (this.maxHeightUnder(body.x - r, body.z - r, body.x + r, body.z + r) > limit) body.z -= sz;
        } else body.z = nz;
      }
    }
    return flags;
  }

  groundHeight(body: Body, r: number): number {
    return this.maxHeightUnder(body.x - r, body.z - r, body.x + r, body.z + r);
  }

  /**
   * Ray vs. heightmap using a 2D DDA over columns. Returns the first solid surface hit.
   * Direction must be normalised.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, out?: RayHit): RayHit | null {
    let cx = Math.floor(ox);
    let cz = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? cx + 1 - ox : ox - cx) * tDeltaX : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? cz + 1 - oz : oz - cz) * tDeltaZ : Infinity;
    let tEnter = 0;
    let enterFace = -1; // 0 = crossed an X boundary, 1 = crossed a Z boundary

    for (let iter = 0; iter < 256; iter++) {
      const tExit = Math.min(tMaxX, tMaxZ, maxDist);
      const h = this.heightAt(cx, cz);
      const yEnter = oy + dy * tEnter;
      if (yEnter < h - 1e-6 && enterFace >= 0) {
        // Hit the side wall of this column on entry.
        return this.fill(out, tEnter, ox, oy, oz, dx, dy, dz, enterFace === 0 ? -stepX : 0, 0, enterFace === 1 ? -stepZ : 0);
      }
      if (dy < 0 && Number.isFinite(h)) {
        const tTop = (h - oy) / dy;
        if (tTop >= tEnter - 1e-6 && tTop <= tExit) {
          return this.fill(out, Math.max(tTop, 0), ox, oy, oz, dx, dy, dz, 0, 1, 0);
        }
      }
      if (tExit >= maxDist) return null;
      if (tMaxX < tMaxZ) {
        tEnter = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
        enterFace = 0;
      } else {
        tEnter = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
        enterFace = 1;
      }
    }
    return null;
  }

  /** Cheap line-of-sight test between two points. */
  hasLineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) === null;
  }

  private fill(
    out: RayHit | undefined,
    t: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    nx: number,
    ny: number,
    nz: number,
  ): RayHit {
    const hit = out ?? { distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
    hit.distance = t;
    hit.x = ox + dx * t;
    hit.y = oy + dy * t;
    hit.z = oz + dz * t;
    hit.nx = nx;
    hit.ny = ny;
    hit.nz = nz;
    return hit;
  }
}
