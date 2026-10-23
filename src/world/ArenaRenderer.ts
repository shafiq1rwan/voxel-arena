import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { SUN_DIRECTION } from '../config';
import { hash2 } from '../core/SeededRandom';
import { CellKind, cellIndex, type ArenaData, type DecorSlot } from '../procedural/ArenaTypes';
import type { ThemePalette } from '../procedural/Themes';
import type { MaterialLibrary } from '../render/Materials';
import { Face, VoxelMeshBuilder, hexToRgb, mixRgb, scaleRgb, type RGB, type VertexLighter } from '../render/VoxelMeshBuilder';
import { VoxelWorld, type RayHit } from './VoxelWorld';

const AO_LEVELS = [0.52, 0.68, 0.84, 1];
const SIDE_SHADE: Record<number, number> = { [Face.PosX]: 0.84, [Face.NegX]: 0.78, [Face.PosZ]: 0.9, [Face.NegZ]: 0.72 };
/** Brightness multiplier for surfaces the sun can't see. */
const SUN_SHADOW = 0.58;
/** Strength of baked lantern pools (vertex colours may exceed 1; the shader clamps). */
const LANTERN_GAIN = 0.95;

interface BakedLight {
  x: number;
  y: number;
  z: number;
  r: number;
  color: RGB;
}

/**
 * Bakes sun shadows (a ray toward the sun through the voxel heightmap) and lantern light pools
 * into vertex colours. Static lighting then costs nothing per frame: no shadow maps, no extra
 * dynamic lights, and the arena shader keeps a constant, small light count.
 */
function createLighter(data: ArenaData, lights: BakedLight[]): VertexLighter {
  const world = new VoxelWorld(data);
  const n = data.size;
  let maxH = 0;
  for (let i = 0; i < data.heights.length; i++) maxH = Math.max(maxH, data.heights[i]!);
  const len = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  const sx = -SUN_DIRECTION.x / len;
  const sy = -SUN_DIRECTION.y / len;
  const sz = -SUN_DIRECTION.z / len;
  const hit: RayHit = { distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  return (px, py, pz, nx, ny, nz, out) => {
    let k = 1;
    const facing = nx * sx + ny * sy + nz * sz;
    // Only test surfaces that face the sun (the rest are already dark from real-time lambert),
    // and only inside the grid where the heightmap is defined.
    if (facing > 0.02 && px > 0 && pz > 0 && px < n && pz < n && py < maxH) {
      const tMax = (maxH + 0.1 - py) / sy;
      if (tMax > 0 && world.raycast(px, py, pz, sx, sy, sz, tMax, hit)) k = SUN_SHADOW;
    }
    out.r = out.g = out.b = k;
    for (const L of lights) {
      const dx = L.x - px;
      const dy = L.y - py;
      const dz = L.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= L.r * L.r) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const fall = 1 - d / L.r;
      const lambert = 0.3 + 0.7 * Math.max(0, (dx * nx + dy * ny + dz * nz) / d);
      const a = LANTERN_GAIN * fall * fall * lambert;
      out.r += L.color.r * a;
      out.g += L.color.g * a;
      out.b += L.color.b * a;
    }
  };
}

/**
 * Converts ArenaData into a handful of merged meshes:
 *  - one lit, vertex-coloured mesh for all terrain + decoration (baked AO & face shading)
 *  - one unlit emissive mesh per glow colour (windows, neon strips) that feeds the glow layer
 */
export class ArenaRenderer {
  readonly meshes: Mesh[] = [];

  constructor(
    private scene: Scene,
    private materials: MaterialLibrary,
  ) {}

  build(data: ArenaData, theme: ThemePalette): void {
    this.dispose();
    const n = data.size;
    const lit = new VoxelMeshBuilder();
    const glowBuilders: Record<'glow' | 'glow2', VoxelMeshBuilder> = { glow: new VoxelMeshBuilder(), glow2: new VoxelMeshBuilder() };
    const glowColor = { glow: hexToRgb(theme.glow), glow2: hexToRgb(theme.glow2) };
    const lights: BakedLight[] = [];
    for (const d of data.decorations) {
      if (!d.light || (d.slot !== 'glow' && d.slot !== 'glow2')) continue;
      lights.push({ x: d.x, y: d.y, z: d.z, r: d.light, color: glowColor[d.slot] });
    }
    lit.lighter = createLighter(data, lights);

    const kindColor: Record<number, RGB> = {
      [CellKind.Floor]: hexToRgb(theme.floorA),
      [CellKind.Wall]: hexToRgb(theme.wall),
      [CellKind.Cover]: hexToRgb(theme.cover),
      [CellKind.Pillar]: hexToRgb(theme.pillar),
      [CellKind.Platform]: hexToRgb(theme.platform),
      [CellKind.Stair]: hexToRgb(theme.stair),
      [CellKind.Boundary]: hexToRgb(theme.boundary),
      [CellKind.Filler]: hexToRgb(theme.filler),
    };
    const floorB = hexToRgb(theme.floorB);
    const topTint = hexToRgb(theme.topTint);
    const trim = hexToRgb(theme.trim);

    const heightAt = (x: number, z: number): number => {
      if (x < 0 || z < 0 || x >= n || z >= n) return -1;
      return data.heights[cellIndex(n, x, z)]!;
    };

    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = cellIndex(n, x, z);
        const h = data.heights[i]!;
        const kind = data.kinds[i]!;
        const jitter = 0.94 + hash2(x, z, 11) * 0.12;

        // --- Top face with per-corner voxel ambient occlusion ---
        let top: RGB;
        if (kind === CellKind.Floor) {
          top = mixRgb(kindColor[CellKind.Floor]!, floorB, hash2(x, z, data.seed));
          // Occasional darker worn tiles add texture without textures.
          if (hash2(x, z, 3) < 0.07) top = mixRgb(top, trim, 0.25);
        } else {
          top = mixRgb(kindColor[kind]!, topTint, kind === CellKind.Stair ? 0.2 : 0.35);
        }
        top = scaleRgb(top, jitter);
        const occ = (dx: number, dz: number) => (heightAt(x + dx, z + dz) > h + 0.25 ? 1 : 0);
        const ao = (sx: number, sz: number) => {
          const s1 = occ(sx, 0);
          const s2 = occ(0, sz);
          const c = occ(sx, sz);
          return AO_LEVELS[s1 && s2 ? 0 : 3 - (s1 + s2 + c)]!;
        };
        // Corner order matches addFace: [-u-v, +u-v, +u+v, -u+v] with U=+x, V=+z on the top face.
        const corners = [ao(-1, -1), ao(1, -1), ao(1, 1), ao(-1, 1)];
        // Recessed mortar bed and individually shaded, tightly spaced paving slabs.
        lit.addFace(Face.PosY, x + 0.5, h, z + 0.5, 0.5, 0.5, scaleRgb(top, 0.82), corners);
        lit.addFace(Face.PosY, x + 0.5, h + 0.006, z + 0.5, 0.492, 0.492, top, corners);
        if (kind === CellKind.Floor && hash2(x, z, 33) < 0.09) {
          lit.addFace(Face.PosY, x + 0.32, h + 0.008, z + 0.3, 0.15, 0.018, scaleRgb(top, 0.6));
          lit.addFace(Face.PosY, x + 0.46, h + 0.008, z + 0.36, 0.02, 0.075, scaleRgb(top, 0.6));
        }

        if (h <= 0) continue;

        // --- Side faces where this column is taller than its neighbour ---
        const sides: [Face, number, number][] = [
          [Face.PosX, 1, 0],
          [Face.NegX, -1, 0],
          [Face.PosZ, 0, 1],
          [Face.NegZ, 0, -1],
        ];
        for (const [face, dx, dz] of sides) {
          const nh = heightAt(x + dx, z + dz);
          if (nh < 0 || nh >= h) continue;
          const base = kindColor[kind]!;
          const shade = SIDE_SHADE[face]!;
          const cx = x + 0.5 + dx * 0.5;
          const cz = z + 0.5 + dz * 0.5;
          // Half-metre, staggered masonry with recessed mortar. Visual-only relief stays within 1 cm.
          lit.addFace(face, cx, (nh + h) / 2, cz, 0.5, (h - nh) / 2, scaleRgb(base, shade * 0.74));
          for (let y0 = nh, row = 0; y0 < h - 0.001; y0 += 0.5, row++) {
            const sy = Math.min(0.5, h - y0);
            const cuts = row % 2 ? [-0.5, -0.25, 0.25, 0.5] : [-0.5, 0, 0.5];
            for (let k = 0; k < cuts.length - 1; k++) {
              const a = cuts[k]!, b = cuts[k + 1]!;
              const offset = (a + b) / 2;
              let c = scaleRgb(base, shade * (0.84 + hash2(x * 13 + k, z * 17 + row, 51) * 0.29));
              if (y0 + sy >= h - 0.001) c = mixRgb(c, topTint, 0.15);
              const alongX = dz !== 0;
              lit.addFace(face, cx + (alongX ? offset : 0) + dx * 0.006, y0 + sy / 2,
                cz + (alongX ? 0 : offset) + dz * 0.006,
                (b - a) / 2 - 0.006, sy / 2 - 0.006, c, [0.84, 0.84, 1, 1]);
            }
          }
        }
      }
    }

    // --- Decorations and backdrop ---
    const slotColor: Record<DecorSlot, RGB> = {
      trim,
      detail: hexToRgb(theme.detail),
      accent: hexToRgb(theme.accent),
      glow: hexToRgb(theme.glow),
      glow2: hexToRgb(theme.glow2),
      backdrop: hexToRgb(theme.backdrop),
      backdropDark: hexToRgb(theme.backdropDark),
      cloud: hexToRgb(theme.cloud),
    };
    for (const d of data.decorations) {
      if (d.slot === 'cloud') {
        // Clouds/smoke are far away and shouldn't pick up shadows or lantern light.
        const saved: VertexLighter | null = lit.lighter;
        lit.lighter = null;
        lit.addBox(d.x, d.y, d.z, d.sx, d.sy, d.sz, slotColor.cloud, { skipBottom: false, faceShade: true });
        lit.lighter = saved;
      } else if (d.slot === 'glow' || d.slot === 'glow2') {
        glowBuilders[d.slot].addBox(d.x, d.y, d.z, d.sx, d.sy, d.sz, { r: 1, g: 1, b: 1 }, { faceShade: false, skipBottom: true });
      } else {
        lit.addBox(d.x, d.y, d.z, d.sx, d.sy, d.sz, slotColor[d.slot], { skipBottom: true, bottomShade: d.slot.startsWith('backdrop') ? 0.7 : 1 });
      }
    }

    const terrain = lit.build('arena_terrain', this.scene);
    terrain.material = this.materials.vertexLit('arena');
    this.finalizeStatic(terrain);

    for (const slot of ['glow', 'glow2'] as const) {
      const b = glowBuilders[slot];
      if (b.vertexCount === 0) continue;
      const mesh = b.build(`arena_${slot}`, this.scene, { colors: false });
      mesh.material = this.materials.emissive(theme[slot]);
      this.finalizeStatic(mesh);
    }
  }

  private finalizeStatic(mesh: Mesh): void {
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    this.meshes.push(mesh);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    this.meshes.length = 0;
  }
}
