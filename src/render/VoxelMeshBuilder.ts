import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Face directions. Order matters for FACE_AXES below. */
export const enum Face {
  PosX = 0,
  NegX = 1,
  PosY = 2,
  NegY = 3,
  PosZ = 4,
  NegZ = 5,
}

/**
 * Per face: normal, U (right) and V (up) axes chosen so that U x V = -N, which matches Babylon's
 * own CreatePlane winding (indices 0,1,2 / 0,2,3 are front-facing in the left-handed system).
 */
const FACE_AXES: readonly (readonly [readonly number[], readonly number[], readonly number[]])[] = [
  [[1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, 0, 1], [-1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
];

/** Default directional shading baked into vertex colours for a crisp voxel look. */
const FACE_SHADE = [0.86, 0.8, 1.0, 0.55, 0.92, 0.76];

export function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function scaleRgb(c: RGB, s: number): RGB {
  return { r: c.r * s, g: c.g * s, b: c.b * s };
}

/**
 * Accumulates coloured quads/boxes into a single mesh. All voxel geometry (arena, weapons,
 * pickups) is merged through this so each material costs one draw call.
 */
export class VoxelMeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /**
   * Adds one quad. `hu`/`hv` are half extents along the face's U/V axes.
   * `shade` holds per-vertex brightness for corners [-u-v, +u-v, +u+v, -u+v].
   */
  addFace(face: Face, cx: number, cy: number, cz: number, hu: number, hv: number, color: RGB, shade?: readonly number[]): void {
    const [n, u, v] = FACE_AXES[face]!;
    const base = this.vertexCount;
    const signs = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let k = 0; k < 4; k++) {
      const su = signs[k]![0]! * hu;
      const sv = signs[k]![1]! * hv;
      this.positions.push(cx + u[0]! * su + v[0]! * sv, cy + u[1]! * su + v[1]! * sv, cz + u[2]! * su + v[2]! * sv);
      this.normals.push(n[0]!, n[1]!, n[2]!);
      const s = shade ? shade[k]! : 1;
      this.colors.push(color.r * s, color.g * s, color.b * s, 1);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Adds an axis-aligned box centred on (cx, cy, cz). */
  addBox(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    color: RGB,
    opts: { faceShade?: boolean; skipBottom?: boolean; bottomShade?: number } = {},
  ): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const faceShade = opts.faceShade ?? true;
    const bs = opts.bottomShade ?? 1;
    for (let f = 0; f < 6; f++) {
      if (opts.skipBottom && f === Face.NegY) continue;
      const k = faceShade ? FACE_SHADE[f]! : 1;
      const c = scaleRgb(color, k);
      // Side faces get a slight darkening toward the bottom for a cheap ambient-occlusion feel.
      const shade = f !== Face.PosY && f !== Face.NegY && bs !== 1 ? [bs, bs, 1, 1] : undefined;
      switch (f) {
        case Face.PosX:
          this.addFace(f, cx + hx, cy, cz, hz, hy, c, shade);
          break;
        case Face.NegX:
          this.addFace(f, cx - hx, cy, cz, hz, hy, c, shade);
          break;
        case Face.PosY:
          this.addFace(f, cx, cy + hy, cz, hx, hz, c);
          break;
        case Face.NegY:
          this.addFace(f, cx, cy - hy, cz, hx, hz, c);
          break;
        case Face.PosZ:
          this.addFace(f, cx, cy, cz + hz, hx, hy, c, shade);
          break;
        case Face.NegZ:
          this.addFace(f, cx, cy, cz - hz, hx, hy, c, shade);
          break;
      }
    }
  }

  build(name: string, scene: Scene, opts: { colors?: boolean } = {}): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.normals = this.normals;
    vd.indices = this.vertexCount > 65535 ? new Uint32Array(this.indices) : this.indices;
    if (opts.colors ?? true) vd.colors = this.colors;
    vd.applyToMesh(mesh, false);
    return mesh;
  }

  clear(): void {
    this.positions.length = 0;
    this.normals.length = 0;
    this.colors.length = 0;
    this.indices.length = 0;
  }
}
