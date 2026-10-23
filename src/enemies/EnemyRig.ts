import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { EnemyLook } from '../procedural/EnemyGenerator';
import type { MaterialLibrary } from '../render/Materials';
import { VoxelMeshBuilder, type RGB } from '../render/VoxelMeshBuilder';

/**
 * Shared source meshes for all enemy body parts. Every visible part is an instance of one of
 * these, tinted with a per-instance colour, so all enemies render in ~2 draw calls.
 */
export class EnemyRenderer {
  readonly cube: Mesh;
  readonly eye: Mesh;

  constructor(scene: Scene, materials: MaterialLibrary) {
    const b = new VoxelMeshBuilder();
    b.addBox(0, 0, 0, 1, 1, 1, { r: 1, g: 1, b: 1 }, { bottomShade: 0.78 });
    this.cube = b.build('enemy_cube_src', scene);
    const mat = materials.vertexLit('enemy', 0.12);
    // A little self-illumination keeps enemies readable in shaded corners of the arena.
    mat.emissiveColor.set(0.14, 0.12, 0.12);
    this.cube.material = mat;
    this.cube.metadata = { noGlow: true };
    this.cube.registerInstancedBuffer('color', 4);
    this.cube.instancedBuffers.color = new Color4(1, 1, 1, 1);

    const e = new VoxelMeshBuilder();
    e.addBox(0, 0, 0, 1, 1, 1, { r: 1, g: 1, b: 1 }, { faceShade: false });
    this.eye = e.build('enemy_eye_src', scene, { colors: false });
    this.eye.material = materials.emissive('#ff3a26', 1.5);

    for (const src of [this.cube, this.eye]) {
      src.isPickable = false;
      // Sources stay enabled (instances render through them) but are hidden far below the map.
      src.position.set(0, -500, 0);
      src.scaling.set(0.001, 0.001, 0.001);
    }
  }
}

interface Part {
  mesh: InstancedMesh;
  base: RGB;
  color: Color4;
}

/** Animated voxel humanoid assembled from instanced cubes; reconfigured per spawn from an EnemyLook. */
export class EnemyRig {
  readonly root: TransformNode;
  private scaleNode: TransformNode;
  private torso: TransformNode;
  private neck: TransformNode;
  private hipL: TransformNode;
  private hipR: TransformNode;
  private shoulderL: TransformNode;
  private shoulderR: TransformNode;
  private parts: Part[] = [];
  private legL: Part;
  private legR: Part;
  private body: Part;
  private head: Part;
  private armL: Part;
  private armR: Part;
  private plate: Part;
  private hornL: Part;
  private hornR: Part;
  private pack: Part;
  private eyeL: InstancedMesh;
  private eyeR: InstancedMesh;
  private core: InstancedMesh;
  private armorDetails: Part[] = [];

  /** Current dimensions (world metres, scale applied) for hitboxes. */
  headCenterY = 1.4;
  headHalf = 0.21;
  bodyTop = 1.2;
  bodyHalfWidth = 0.32;
  legLength = 0.6;
  private walkPhase = 0;
  private flash = 0;

  constructor(
    scene: Scene,
    renderer: EnemyRenderer,
    readonly id: number,
  ) {
    const node = (name: string, parent: TransformNode) => {
      const n = new TransformNode(`${name}_${id}`, scene);
      n.parent = parent;
      return n;
    };
    this.root = new TransformNode(`enemy_${id}`, scene);
    this.scaleNode = node('scale', this.root);
    this.hipL = node('hipL', this.scaleNode);
    this.hipR = node('hipR', this.scaleNode);
    this.torso = node('torso', this.scaleNode);
    this.neck = node('neck', this.torso);
    this.shoulderL = node('shL', this.torso);
    this.shoulderR = node('shR', this.torso);

    const part = (name: string, parent: TransformNode): Part => {
      const mesh = renderer.cube.createInstance(`${name}_${id}`);
      mesh.parent = parent;
      mesh.isPickable = false;
      const color = new Color4(1, 1, 1, 1);
      mesh.instancedBuffers.color = color;
      const p = { mesh, base: { r: 1, g: 1, b: 1 }, color };
      this.parts.push(p);
      return p;
    };
    this.legL = part('legL', this.hipL);
    this.legR = part('legR', this.hipR);
    this.body = part('body', this.torso);
    this.plate = part('plate', this.torso);
    this.pack = part('pack', this.torso);
    this.head = part('head', this.neck);
    this.hornL = part('hornL', this.neck);
    this.hornR = part('hornR', this.neck);
    this.armL = part('armL', this.shoulderL);
    this.armR = part('armR', this.shoulderR);
    // Layered armour follows the animated joints; it does not alter the existing hitboxes.
    for (const [name, parent] of [
      ['bootL', this.hipL], ['bootR', this.hipR],
      ['shinL', this.hipL], ['shinR', this.hipR],
      ['pauldronL', this.shoulderL], ['pauldronR', this.shoulderR],
      ['fistL', this.shoulderL], ['fistR', this.shoulderR],
      ['helmet', this.neck], ['jaw', this.neck], ['belt', this.torso],
    ] as const) this.armorDetails.push(part(name, parent));
    this.core = renderer.eye.createInstance(`core_${id}`);
    this.core.parent = this.torso;
    this.core.isPickable = false;
    this.eyeL = renderer.eye.createInstance(`eyeL_${id}`);
    this.eyeR = renderer.eye.createInstance(`eyeR_${id}`);
    this.eyeL.parent = this.neck;
    this.eyeR.parent = this.neck;
    this.root.setEnabled(false);
  }

  configure(look: EnemyLook): void {
    const s = look.scale;
    this.scaleNode.scaling.set(s, s, s);
    const legLen = 0.58;
    const legW = 0.22;
    const bw = look.bodyWidth;
    const bh = look.bodyHeight;
    const hs = look.headSize;
    const armW = 0.18;
    const armL = look.armLength;

    const set = (p: Part, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: RGB, enabled = true) => {
      p.mesh.position.set(x, y, z);
      p.mesh.scaling.set(sx, sy, sz);
      p.base = color;
      p.color.set(color.r, color.g, color.b, 1);
      p.mesh.setEnabled(enabled);
    };

    this.hipL.position.set(-0.14, legLen, 0);
    this.hipR.position.set(0.14, legLen, 0);
    set(this.legL, 0, -legLen / 2, 0, legW, legLen, 0.24, look.limbs);
    set(this.legR, 0, -legLen / 2, 0, legW, legLen, 0.24, look.limbs);

    this.torso.position.set(0, legLen, 0);
    set(this.body, 0, bh / 2, 0, bw, bh, 0.36, look.body);
    set(this.plate, 0, bh * 0.55, 0.19, bw * 0.62, bh * 0.38, 0.05, look.accent, look.armor);
    set(this.pack, 0, bh * 0.55, -0.24, bw * 0.7, bh * 0.6, 0.14, look.limbs, look.backpack);

    this.neck.position.set(0, bh, 0);
    set(this.head, 0, hs / 2, 0, hs, hs, hs, look.head);
    set(this.hornL, -hs * 0.32, hs + 0.07, 0, 0.07, 0.16, 0.07, look.accent, look.horns);
    set(this.hornR, hs * 0.32, hs + 0.07, 0, 0.07, 0.16, 0.07, look.accent, look.horns);
    this.eyeL.position.set(-hs * 0.22, hs * 0.55, hs / 2 + 0.005);
    this.eyeR.position.set(hs * 0.22, hs * 0.55, hs / 2 + 0.005);
    this.eyeL.scaling.set(0.09, 0.06, 0.02);
    this.eyeR.scaling.set(0.09, 0.06, 0.02);

    const shoulderY = bh - 0.06;
    this.shoulderL.position.set(-(bw / 2 + armW / 2), shoulderY, 0);
    this.shoulderR.position.set(bw / 2 + armW / 2, shoulderY, 0);
    set(this.armL, 0, -armL / 2 + 0.05, 0, armW, armL, 0.2, look.limbs);
    set(this.armR, 0, -armL / 2 + 0.05, 0, armW, armL, 0.2, look.limbs);

    const steel = { r: look.limbs.r * 1.45, g: look.limbs.g * 1.45, b: look.limbs.b * 1.55 };
    const details = [
      [0, -legLen + 0.09, 0.045, 0.27, 0.18, 0.34],
      [0, -legLen + 0.09, 0.045, 0.27, 0.18, 0.34],
      [0, -0.31, 0.13, 0.24, 0.22, 0.06], [0, -0.31, 0.13, 0.24, 0.22, 0.06],
      [0, 0.0, 0, 0.27, 0.2, 0.3], [0, 0.0, 0, 0.27, 0.2, 0.3],
      [0, -armL + 0.10, 0.025, 0.24, 0.2, 0.24], [0, -armL + 0.10, 0.025, 0.24, 0.2, 0.24],
      [0, hs * 0.83, 0, hs * 1.12, hs * 0.25, hs * 1.12],
      [0, hs * 0.17, hs * 0.48, hs * 0.75, hs * 0.17, 0.06],
      [0, bh * 0.12, 0, bw * 1.06, 0.1, 0.4],
    ];
    details.forEach((d, i) => set(this.armorDetails[i]!, d[0]!, d[1]!, d[2]!, d[3]!, d[4]!, d[5]!,
      i === 4 || i === 5 ? look.body : steel));
    this.core.position.set(0, bh * 0.56, 0.225);
    this.core.scaling.set(bw * 0.23, bh * 0.15, 0.025);

    this.legLength = legLen * s;
    this.bodyTop = (legLen + bh) * s;
    this.headHalf = (hs / 2) * s;
    this.headCenterY = (legLen + bh + hs / 2) * s;
    this.bodyHalfWidth = (Math.max(bw, 0.36) / 2 + 0.06) * s;
    this.flash = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }

  hitFlash(): void {
    this.flash = 0.09;
  }

  /**
   * Poses the rig. `speed` drives the walk cycle; `attack` (0..1) raises the arms for a swing;
   * `spawn` (0..1) rises the body out of the ground.
   */
  animate(dt: number, speed: number, attack: number, swing: number, spawn: number, stagger: number): void {
    this.walkPhase += dt * (4 + speed * 2.4);
    const amp = Math.min(1, speed / 3.5) * 0.75;
    const sw = Math.sin(this.walkPhase) * amp;
    this.hipL.rotation.x = sw;
    this.hipR.rotation.x = -sw;
    const armRaise = attack * -2.1 + swing * 1.6;
    this.shoulderL.rotation.x = -sw * 0.8 + armRaise;
    this.shoulderR.rotation.x = sw * 0.8 + armRaise;
    this.torso.rotation.x = attack * -0.15 + swing * 0.35 + stagger * -0.4;
    this.torso.position.y = this.legLength / Math.max(0.001, this.scaleNode.scaling.y) + Math.abs(Math.cos(this.walkPhase)) * amp * 0.05;
    this.neck.rotation.x = stagger * -0.3;
    this.scaleNode.position.y = (spawn - 1) * 1.9;

    if (this.flash > 0) {
      this.flash -= dt;
      const t = Math.max(0, this.flash / 0.09);
      for (const p of this.parts) p.color.set(p.base.r + (1 - p.base.r) * t, p.base.g + (1 - p.base.g) * t, p.base.b + (1 - p.base.b) * t, 1);
    }
  }

  get bodyColor(): RGB {
    return this.body.base;
  }

  get accentColor(): RGB {
    return this.plate.base;
  }
}
