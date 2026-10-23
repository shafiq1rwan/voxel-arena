import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { damp, lerp } from '../core/MathUtil';
import { VIEWMODEL_GROUP } from '../core/SceneManager';
import type { MaterialLibrary } from '../render/Materials';
import { VoxelMeshBuilder, hexToRgb } from '../render/VoxelMeshBuilder';
import type { SkinPalette, WeaponDefinition, WeaponPart } from './WeaponTypes';

const HIP = new Vector3(0.22, -0.205, 0.49);

export interface ViewModelState {
  dt: number;
  lookYaw: number;
  lookPitch: number;
  moveAmount: number;
  grounded: boolean;
  sprinting: boolean;
  /** 0..1 aim-down-sights blend. */
  ads: number;
  /** 0..1 reload progress, or -1 when not reloading. */
  reload: number;
}

/**
 * Procedurally built first-person weapon model. Parts are merged per material (one lit mesh, one
 * emissive mesh, plus the magazine for reload animation) and drawn in a dedicated rendering group.
 */
export class WeaponViewModel {
  private root: TransformNode;
  private pivot: TransformNode;
  private meshes: Mesh[] = [];
  private magazine: Mesh | null = null;
  private flash: Mesh;
  private muzzleNode: TransformNode;
  private def: WeaponDefinition | null = null;

  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private kickBack = 0;
  private kickRot = 0;
  private flashTime = 0;
  private sprintBlend = 0;
  private equip = 1;

  constructor(
    private scene: Scene,
    camera: FreeCamera,
    private materials: MaterialLibrary,
  ) {
    this.root = new TransformNode('vm_root', scene);
    this.root.parent = camera;
    this.pivot = new TransformNode('vm_pivot', scene);
    this.pivot.parent = this.root;
    this.muzzleNode = new TransformNode('vm_muzzle', scene);
    this.muzzleNode.parent = this.pivot;

    // Muzzle flash: a few crossed emissive blocks.
    const fb = new VoxelMeshBuilder();
    fb.addBox(0, 0, 0.06, 0.05, 0.05, 0.16, { r: 1, g: 1, b: 1 }, { faceShade: false });
    fb.addBox(0, 0, 0.03, 0.16, 0.035, 0.035, { r: 1, g: 1, b: 1 }, { faceShade: false });
    fb.addBox(0, 0, 0.03, 0.035, 0.16, 0.035, { r: 1, g: 1, b: 1 }, { faceShade: false });
    this.flash = fb.build('vm_flash', scene, { colors: false });
    this.flash.material = materials.emissive('#ffdc7a', 1.6);
    this.flash.parent = this.muzzleNode;
    this.flash.renderingGroupId = VIEWMODEL_GROUP;
    this.flash.isPickable = false;
    this.flash.setEnabled(false);
  }

  /** Rebuilds the model for a weapon + skin. */
  build(def: WeaponDefinition, skin: SkinPalette): void {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.def = def;

    const colorOf = (slot: WeaponPart['slot']) => hexToRgb(skin[slot]);
    const body = new VoxelMeshBuilder();
    const glow = new VoxelMeshBuilder();
    const mag = new VoxelMeshBuilder();
    const add = (b: VoxelMeshBuilder, p: WeaponPart) => b.addBox(p.c[0], p.c[1], p.c[2], p.s[0], p.s[1], p.s[2], colorOf(p.slot));
    for (const p of def.parts) add(p.slot === 'emissive' ? glow : body, p);
    for (const p of def.magazine) add(p.slot === 'emissive' ? glow : mag, p);

    // Block-built gloves and sleeves, using their own fixed palette so skins only recolour the gun.
    const hands = new VoxelMeshBuilder();
    for (const [x, y, z, sx, sy, sz, color] of [
      [0.015, -0.11, -0.035, 0.077, 0.085, 0.085, '#5a493d'],
      [0.04, -0.16, -0.07, 0.085, 0.08, 0.10, '#d19642'],
      [0.065, -0.205, -0.17, 0.10, 0.1, 0.22, '#9e713e'],
      [-0.02, -0.078, 0.28, 0.09, 0.07, 0.10, '#5a493d'],
      [-0.065, -0.13, 0.22, 0.09, 0.08, 0.14, '#d19642'],
      [-0.10, -0.19, 0.08, 0.10, 0.10, 0.23, '#9e713e'],
    ] as const) hands.addBox(x, y, z, sx, sy, sz, hexToRgb(color));

    const finish = (m: Mesh) => {
      m.parent = this.pivot;
      m.renderingGroupId = VIEWMODEL_GROUP;
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
      this.meshes.push(m);
      return m;
    };
    const handMesh = finish(hands.build('vm_hands', this.scene));
    handMesh.material = this.materials.vertexLit('hands', 0.02);
    const bodyMesh = finish(body.build('vm_body', this.scene));
    bodyMesh.material = this.materials.vertexLit('weapon', 0.25);
    if (glow.vertexCount > 0) {
      const g = finish(glow.build('vm_glow', this.scene, { colors: false }));
      g.material = this.materials.emissive(skin.emissive, 1.2);
    }
    this.magazine = mag.vertexCount > 0 ? finish(mag.build('vm_mag', this.scene)) : null;
    if (this.magazine) this.magazine.material = this.materials.vertexLit('weapon', 0.25);

    this.muzzleNode.position.set(def.muzzle[0], def.muzzle[1], def.muzzle[2]);
    this.equip = 1;
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }

  /** World-space muzzle position (for tracers and the muzzle light). */
  getMuzzleWorld(out: Vector3): Vector3 {
    this.muzzleNode.computeWorldMatrix(true);
    return out.copyFrom(this.muzzleNode.getAbsolutePosition());
  }

  onFire(strength: number): void {
    this.kickBack = Math.min(0.12, this.kickBack + 0.045 * strength);
    this.kickRot = Math.min(0.35, this.kickRot + 0.07 * strength);
    this.flashTime = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.6;
    this.flash.scaling.set(s, s, s * (0.8 + Math.random() * 0.5));
  }

  update(st: ViewModelState): void {
    const dt = st.dt;
    if (!this.def) return;

    // Sway lags behind camera rotation.
    this.swayX = lerp(this.swayX, -st.lookYaw * 1.2, damp(10, dt));
    this.swayY = lerp(this.swayY, st.lookPitch * 1.2, damp(10, dt));
    this.swayX *= 1 - damp(6, dt);
    this.swayY *= 1 - damp(6, dt);

    if (st.grounded && st.moveAmount > 0.05) this.bobPhase += dt * (7 + st.moveAmount * 4);
    const adsDamp = 1 - st.ads * 0.85;
    const bobAmt = Math.min(1.2, st.moveAmount) * (st.grounded ? 1 : 0.2) * adsDamp;
    const bobX = Math.cos(this.bobPhase) * 0.012 * bobAmt;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.014 * bobAmt;

    // Recoil spring.
    this.kickBack = Math.max(0, this.kickBack - dt * 0.6) * (1 - damp(14, dt));
    this.kickRot *= 1 - damp(12, dt);

    this.sprintBlend = lerp(this.sprintBlend, st.sprinting && st.reload < 0 ? 1 : 0, damp(10, dt));
    this.equip = Math.max(0, this.equip - dt * 3.5);

    // Reload: tilt and lower, magazine drops out and back in.
    let reloadTilt = 0;
    let magDrop = 0;
    if (st.reload >= 0) {
      const r = st.reload;
      reloadTilt = Math.sin(Math.min(1, r * 1.15) * Math.PI);
      if (r < 0.45) magDrop = smooth01((r - 0.12) / 0.25);
      else magDrop = 1 - smooth01((r - 0.5) / 0.25);
    }

    const ads = st.ads;
    const adsY = -this.def.sightHeight - 0.012;
    const px = lerp(HIP.x, 0, ads) + this.swayX * adsDamp + bobX + this.sprintBlend * 0.04;
    const py = lerp(HIP.y, adsY, ads) + this.swayY * adsDamp + bobY - this.sprintBlend * 0.06 - reloadTilt * 0.06 - this.equip * 0.3;
    const pz = lerp(HIP.z, 0.3, ads) - this.kickBack * (1 - ads * 0.5);
    this.root.position.set(px, py, pz);
    this.pivot.rotation.set(
      -this.kickRot * (1 - ads * 0.6) + this.sprintBlend * 0.25 + reloadTilt * 0.35 + this.equip * 0.6,
      -this.sprintBlend * 0.6 + this.swayX * 2,
      reloadTilt * 0.45 + this.sprintBlend * 0.2,
    );

    if (this.magazine) this.magazine.position.y = -magDrop * 0.28;

    this.flashTime -= dt;
    this.flash.setEnabled(this.flashTime > 0);
  }
}

function smooth01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
