import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { damp, lerp } from '../core/MathUtil';
import { VIEWMODEL_GROUP } from '../core/SceneManager';
import type { MaterialLibrary } from '../render/Materials';
import { hash2 } from '../core/SeededRandom';
import { VoxelMeshBuilder, hexToRgb, mixRgb, type RGB } from '../render/VoxelMeshBuilder';
import type { SkinDef } from '../progression/Skins';
import { MODULE_INFO, type WeaponDefinition, type WeaponPart } from './WeaponTypes';

type SkinSlot = 'primary' | 'secondary' | 'accent' | 'dark' | 'emissive';
const box = (c: [number, number, number], s: [number, number, number], slot: WeaponPart['slot']): WeaponPart => ({ c, s, slot });

/** Pattern colour for one part. Skins vary colour across parts; they never change geometry or stats. */
function partColor(skin: SkinDef, part: WeaponPart, index: number): RGB {
  // Module parts are coloured by their material (module colour), not by the skin.
  if (part.slot === 'module') return { r: 1, g: 1, b: 1 };
  const slot = part.slot as SkinSlot;
  const base = hexToRgb(skin[slot]);
  const body = slot === 'primary' || slot === 'secondary';
  switch (skin.pattern) {
    case 'camo': {
      if (!body) return base;
      const r = hash2(index, 7, 31);
      return r < 0.34 ? hexToRgb(skin.alt) : r < 0.6 ? hexToRgb(skin.secondary) : base;
    }
    case 'digital':
      return body && index % 2 === 0 ? hexToRgb(skin.alt) : base;
    case 'gold':
      return slot === 'dark' ? mixRgb(base, hexToRgb(skin.secondary), 0.35) : base;
    default:
      return base;
  }
}

/** Pattern decals (emissive cracks, lightning, pixels) placed on the receiver sides. */
function skinDecals(skin: SkinDef): WeaponPart[] {
  const out: WeaponPart[] = [];
  const sides = [-0.054, 0.054];
  switch (skin.pattern) {
    case 'molten':
      for (const x of sides) for (let k = 0; k < 5; k++) out.push(box([x, k % 2 ? 0.014 : -0.012, -0.06 + k * 0.05], [0.004, 0.006, 0.045], 'emissive'));
      break;
    case 'thunder':
      for (const x of sides) {
        out.push(box([x, 0.02, -0.04], [0.004, 0.006, 0.06], 'emissive'));
        out.push(box([x, 0.005, 0.0], [0.004, 0.03, 0.006], 'emissive'));
        out.push(box([x, -0.01, 0.05], [0.004, 0.006, 0.09], 'emissive'));
      }
      break;
    case 'void':
      for (const x of sides) out.push(box([x, 0.028, 0.05], [0.004, 0.005, 0.3], 'emissive'));
      break;
    case 'digital':
      for (const x of sides) for (let k = 0; k < 4; k++) out.push(box([x, (k % 2) * 0.02 - 0.01, -0.04 + k * 0.045], [0.004, 0.012, 0.012], 'accent'));
      break;
    default:
      break;
  }
  return out;
}

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
  /** Loadout preview: show the gun centred and slowly rotating instead of the first-person pose. */
  private inspect = false;
  private inspectSpin = 0;
  /** Accessibility: smaller, shorter muzzle flashes. */
  reduceFlashing = false;

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

  /**
   * Rebuilds the model for a weapon + skin. A weapon mutation (upgrade synergy) recolours the
   * glow parts and adds energy fins so the change is visible on the gun itself.
   */
  build(def: WeaponDefinition, skin: SkinDef, mutationColor: string | null = null): void {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.def = def;

    const body = new VoxelMeshBuilder();
    const glow = new VoxelMeshBuilder();
    const moduleGlow = new VoxelMeshBuilder();
    const mag = new VoxelMeshBuilder();
    let index = 0;
    const add = (b: VoxelMeshBuilder, p: WeaponPart) => b.addBox(p.c[0], p.c[1], p.c[2], p.s[0], p.s[1], p.s[2], partColor(skin, p, index++));
    const route = (p: WeaponPart, other: VoxelMeshBuilder) => (p.slot === 'emissive' ? glow : p.slot === 'module' ? moduleGlow : other);
    for (const p of [...def.parts, ...skinDecals(skin)]) add(route(p, body), p);
    for (const p of def.magazine) add(route(p, mag), p);
    if (mutationColor) {
      // Mutation fins along the barrel shroud.
      for (const x of [-0.05, 0.05]) glow.addBox(x, 0.035, 0.32, 0.006, 0.012, 0.2, { r: 1, g: 1, b: 1 }, { faceShade: false });
    }

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
    handMesh.setEnabled(!this.inspect);
    this.handMesh = handMesh;
    const bodyMesh = finish(body.build('vm_body', this.scene));
    bodyMesh.material = this.materials.vertexLit('weapon', 0.25);
    if (glow.vertexCount > 0) {
      const g = finish(glow.build('vm_glow', this.scene, { colors: false }));
      g.material = this.materials.emissive(mutationColor ?? skin.emissive, 1.2);
    }
    if (moduleGlow.vertexCount > 0 && def.module) {
      const g = finish(moduleGlow.build('vm_module', this.scene, { colors: false }));
      g.material = this.materials.emissive(MODULE_INFO[def.module].color, 1.4);
    }
    this.magazine = mag.vertexCount > 0 ? finish(mag.build('vm_mag', this.scene)) : null;
    if (this.magazine) this.magazine.material = this.materials.vertexLit('weapon', 0.25);

    this.muzzleNode.position.set(def.muzzle[0], def.muzzle[1], def.muzzle[2]);
    this.equip = 1;
  }

  private handMesh: Mesh | null = null;

  /** Loadout preview mode (menu camera): centred, hands hidden, slowly turning. */
  setInspect(on: boolean): void {
    this.inspect = on;
    this.handMesh?.setEnabled(!on);
    this.inspectSpin = 0;
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
    this.flashTime = this.reduceFlashing ? 0.03 : 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = (0.8 + Math.random() * 0.6) * (this.reduceFlashing ? 0.55 : 1);
    this.flash.scaling.set(s, s, s * (0.8 + Math.random() * 0.5));
  }

  update(st: ViewModelState): void {
    const dt = st.dt;
    if (!this.def) return;
    if (this.inspect) {
      // Inspect pose: weapon floats centre-right of the menu camera and turns slowly.
      this.inspectSpin += dt * 0.6;
      // Left of centre so the loadout panel on the right never covers it.
      this.root.position.set(-0.36, -0.02, 1.55);
      this.pivot.rotation.set(0.12, Math.PI / 2 + Math.sin(this.inspectSpin) * 0.9, 0);
      this.flash.setEnabled(false);
      return;
    }

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
