import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

interface Ring {
  edge: Mesh;
  fill: Mesh;
  life: number;
  duration: number;
  radius: number;
  active: boolean;
}

/**
 * Ground warning rings for telegraphed area attacks (tank slam, boss slam). The ring grows to the
 * exact damage radius and pulses faster as impact approaches, so the danger zone is always readable.
 */
export class Telegraphs {
  private rings: Ring[] = [];
  private edgeMat: StandardMaterial;
  private fillMat: StandardMaterial;

  constructor(scene: Scene, capacity = 8) {
    this.edgeMat = new StandardMaterial('telegraph_edge', scene);
    this.edgeMat.disableLighting = true;
    this.edgeMat.emissiveColor = Color3.FromHexString('#ff3a2a');
    this.edgeMat.diffuseColor = Color3.Black();
    this.fillMat = new StandardMaterial('telegraph_fill', scene);
    this.fillMat.disableLighting = true;
    this.fillMat.emissiveColor = Color3.FromHexString('#ff2a1a');
    this.fillMat.diffuseColor = Color3.Black();
    this.fillMat.alpha = 0.22;
    this.fillMat.backFaceCulling = false;
    for (let i = 0; i < capacity; i++) {
      const edge = CreateTorus(`tele_edge_${i}`, { diameter: 2, thickness: 0.09, tessellation: 40 }, scene);
      edge.material = this.edgeMat;
      edge.isPickable = false;
      const fill = CreateDisc(`tele_fill_${i}`, { radius: 1, tessellation: 40 }, scene);
      fill.material = this.fillMat;
      fill.isPickable = false;
      fill.rotation.x = Math.PI / 2;
      edge.setEnabled(false);
      fill.setEnabled(false);
      this.rings.push({ edge, fill, life: 0, duration: 1, radius: 1, active: false });
    }
  }

  show(x: number, y: number, z: number, radius: number, duration: number): void {
    const r = this.rings.find((k) => !k.active) ?? this.rings[0]!;
    r.active = true;
    r.life = duration;
    r.duration = duration;
    r.radius = radius;
    r.edge.position.set(x, y + 0.06, z);
    r.fill.position.set(x, y + 0.05, z);
    r.edge.setEnabled(true);
    r.fill.setEnabled(true);
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.edge.setEnabled(false);
        r.fill.setEnabled(false);
        continue;
      }
      const t = 1 - r.life / r.duration;
      // Fill grows toward the full radius; the edge always marks the exact danger zone.
      const fillR = r.radius * (0.25 + 0.75 * t);
      r.fill.scaling.set(fillR, fillR, fillR);
      const pulse = 1 + Math.sin(t * t * 40) * 0.03;
      r.edge.scaling.set(r.radius * pulse, 1, r.radius * pulse);
    }
  }

  clear(): void {
    for (const r of this.rings) {
      r.active = false;
      r.edge.setEnabled(false);
      r.fill.setEnabled(false);
    }
  }
}
