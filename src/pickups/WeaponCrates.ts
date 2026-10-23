import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { WeaponDefinition } from '../combat/WeaponTypes';
import type { PlayerController } from '../player/PlayerController';
import type { MaterialLibrary } from '../render/Materials';
import type { Effects } from '../render/Effects';
import { VoxelMeshBuilder, hexToRgb } from '../render/VoxelMeshBuilder';

/** Crate glow colour by weapon tier (number of non-standard components). */
export const TIER_COLORS = ['#cfd6e2', '#cfd6e2', '#5dff8a', '#4aa6ff', '#b07bff', '#ffcf4a'];
export const TIER_NAMES = ['Standard', 'Standard', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

interface Crate {
  active: boolean;
  node: TransformNode;
  glow: Mesh;
  def: WeaponDefinition | null;
  x: number;
  y: number;
  z: number;
  phase: number;
}

const CAPACITY = 4;
const REACH = 1.8;

/**
 * Weapon crates holding procedurally generated weapons. They appear after key waves and from
 * elites; the player walks up and presses F (or taps TAKE) to swap in the weapon.
 */
export class WeaponCrates {
  private crates: Crate[] = [];

  constructor(
    scene: Scene,
    private materials: MaterialLibrary,
    private effects: Effects,
  ) {
    for (let i = 0; i < CAPACITY; i++) {
      const node = new TransformNode(`crate_${i}`, scene);
      const b = new VoxelMeshBuilder();
      b.addBox(0, 0, 0, 1.0, 0.36, 0.48, hexToRgb('#3c4436'));
      b.addBox(0, 0.2, 0, 1.04, 0.05, 0.52, hexToRgb('#2a2f26'));
      for (const x of [-0.42, 0.42]) b.addBox(x, 0, 0, 0.08, 0.4, 0.52, hexToRgb('#6b7360'));
      const body = b.build(`crate_body_${i}`, scene);
      body.material = materials.vertexLit('crate', 0.15);
      body.parent = node;
      body.isPickable = false;
      const g = new VoxelMeshBuilder();
      g.addBox(0, 0.05, 0.245, 0.7, 0.06, 0.01, { r: 1, g: 1, b: 1 }, { faceShade: false });
      g.addBox(0, 0.05, -0.245, 0.7, 0.06, 0.01, { r: 1, g: 1, b: 1 }, { faceShade: false });
      g.addBox(0, 0.23, 0, 0.5, 0.01, 0.12, { r: 1, g: 1, b: 1 }, { faceShade: false });
      const glow = g.build(`crate_glow_${i}`, scene, { colors: false });
      glow.parent = node;
      glow.isPickable = false;
      node.setEnabled(false);
      this.crates.push({ active: false, node, glow, def: null, x: 0, y: 0, z: 0, phase: 0 });
    }
  }

  spawn(def: WeaponDefinition, x: number, y: number, z: number): void {
    const c = this.crates.find((k) => !k.active) ?? this.crates[0]!;
    c.active = true;
    c.def = def;
    c.x = x;
    c.y = y;
    c.z = z;
    c.phase = Math.random() * 6;
    c.glow.material = this.materials.emissive(TIER_COLORS[Math.min(def.tier, 5)]!, 1.3);
    c.node.position.set(x, y + 0.2, z);
    c.node.setEnabled(true);
    this.effects.sparkBurst(x, y + 0.5, z, 0, 1, 0, 14, 4);
  }

  /** Nearest crate within reach of the player, if any (drives the HUD prompt). */
  update(dt: number, player: PlayerController): WeaponDefinition | null {
    let nearest: Crate | null = null;
    let best = REACH;
    for (const c of this.crates) {
      if (!c.active) continue;
      c.phase += dt * 1.6;
      c.node.rotation.y = c.phase * 0.5;
      c.node.position.y = c.y + 0.2 + Math.sin(c.phase) * 0.05;
      const d = Math.hypot(player.body.x - c.x, player.body.z - c.z);
      if (d < best && Math.abs(player.body.y - c.y) < 1.6) {
        best = d;
        nearest = c;
      }
    }
    this.nearestCrate = nearest;
    return nearest?.def ?? null;
  }

  private nearestCrate: Crate | null = null;

  /** Takes the crate in reach; returns its weapon. */
  take(): WeaponDefinition | null {
    const c = this.nearestCrate;
    if (!c || !c.def) return null;
    const def = c.def;
    c.active = false;
    c.def = null;
    c.node.setEnabled(false);
    this.effects.sparkBurst(c.x, c.y + 0.5, c.z, 0, 1, 0, 16, 5);
    this.nearestCrate = null;
    return def;
  }

  forEachActive(fn: (x: number, z: number) => void): void {
    for (const c of this.crates) if (c.active) fn(c.x, c.z);
  }

  clear(): void {
    for (const c of this.crates) {
      c.active = false;
      c.def = null;
      c.node.setEnabled(false);
    }
    this.nearestCrate = null;
  }
}
