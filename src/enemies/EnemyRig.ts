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
  /** Cyan emissive variant (ranged archetypes' eyes, cores and blaster tips). */
  readonly eyeCyan: Mesh;
  /** Gold emissive (elite and boss crowns). */
  readonly gold: Mesh;

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
    this.eyeCyan = e.build('enemy_eye_cyan_src', scene, { colors: false });
    this.eyeCyan.material = materials.emissive('#3fd8ff', 1.5);
    this.gold = e.build('enemy_gold_src', scene, { colors: false });
    this.gold.material = materials.emissive('#ffcf4a', 1.3);

    for (const src of [this.cube, this.eye, this.eyeCyan, this.gold]) {
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

/** Per-frame animation inputs. One object is reused per enemy to avoid allocations. */
export interface RigPose {
  /** Horizontal speed (m/s), drives the walk cycle. */
  speed: number;
  /** 0..1 melee wind-up (arms raised). */
  attack: number;
  /** 0..1 melee follow-through. */
  swing: number;
  /** 0..1 rising out of the ground. */
  spawn: number;
  /** 0..1 hit stagger. */
  stagger: number;
  /** 0..1 blaster arm raised to aim. */
  aim: number;
  /** 0..1 blaster charge (telegraphs an incoming shot). */
  charge: number;
  /** 0..1 frozen tint from the freeze module. */
  chill: number;
}

export function createPose(): RigPose {
  return { speed: 0, attack: 0, swing: 0, spawn: 1, stagger: 0, aim: 0, charge: 0, chill: 0 };
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
  private eyeLc: InstancedMesh;
  private eyeRc: InstancedMesh;
  private coreC: InstancedMesh;
  private gunBody: Part;
  private gunBarrel: Part;
  private gunTip: InstancedMesh;
  private hasGun = false;
  private crown: InstancedMesh[] = [];
  private tinted = false;
  private armorDetails: Part[] = [];

  /** Current dimensions (world metres, scale applied) for hitboxes. */
  coreCenterY = 0.9;
  coreHalf = 0.1;
  /** Forward offset of the core from the body centre. */
  coreForward = 0.2;
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
    this.gunBody = part('gunBody', this.shoulderR);
    this.gunBarrel = part('gunBarrel', this.shoulderR);
    const glow = (src: Mesh, name: string, parent: TransformNode) => {
      const m = src.createInstance(`${name}_${id}`);
      m.parent = parent;
      m.isPickable = false;
      return m;
    };
    this.core = glow(renderer.eye, 'core', this.torso);
    this.eyeL = glow(renderer.eye, 'eyeL', this.neck);
    this.eyeR = glow(renderer.eye, 'eyeR', this.neck);
    this.coreC = glow(renderer.eyeCyan, 'coreC', this.torso);
    this.eyeLc = glow(renderer.eyeCyan, 'eyeLc', this.neck);
    this.eyeRc = glow(renderer.eyeCyan, 'eyeRc', this.neck);
    this.gunTip = glow(renderer.eyeCyan, 'gunTip', this.shoulderR);
    for (let k = 0; k < 5; k++) this.crown.push(glow(renderer.gold, `crown${k}`, this.neck));
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
    const cyan = look.eyes === 'cyan';
    for (const [l, r, on] of [
      [this.eyeL, this.eyeR, !cyan],
      [this.eyeLc, this.eyeRc, cyan],
    ] as const) {
      l.position.set(-hs * 0.22, hs * 0.55, hs / 2 + 0.005);
      r.position.set(hs * 0.22, hs * 0.55, hs / 2 + 0.005);
      // Ranged units get a single wide visor slit instead of two eyes.
      l.scaling.set(cyan ? hs * 0.72 : 0.09, cyan ? 0.05 : 0.06, 0.02);
      r.scaling.set(0.09, 0.06, 0.02);
      if (cyan) l.position.x = 0;
      l.setEnabled(on);
      r.setEnabled(on && !cyan);
    }

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
    const cs = look.coreSize;
    for (const [c, on] of [
      [this.core, !cyan],
      [this.coreC, cyan],
    ] as const) {
      c.position.set(0, bh * 0.56, 0.225);
      c.scaling.set(bw * 0.23 * cs, bh * 0.15 * cs, 0.025 + (cs - 1) * 0.02);
      c.setEnabled(on);
    }
    // Elite / boss crown: a gold band of points above the head.
    this.crown.forEach((m, k) => {
      if (k < 4) {
        m.position.set((k - 1.5) * hs * 0.28, hs + 0.11, hs * 0.2);
        m.scaling.set(0.06, k % 3 === 0 ? 0.16 : 0.22, 0.06);
      } else {
        m.position.set(0, hs + 0.02, 0);
        m.scaling.set(hs * 1.05, 0.05, hs * 1.05);
      }
      m.setEnabled(look.elite);
    });

    // Arm-mounted blaster: hangs along the forearm, points forward when the arm is raised.
    this.hasGun = look.gun;
    // Built along the arm's local -Y axis so it points forward when the arm is raised to aim.
    const gunY = -armL + 0.02;
    set(this.gunBody, 0, gunY, 0.04, 0.17, 0.36, 0.17, look.limbs, look.gun);
    set(this.gunBarrel, 0, gunY - 0.26, 0.04, 0.08, 0.2, 0.08, look.accent, look.gun);
    this.gunTip.position.set(0, gunY - 0.37, 0.04);
    this.gunTip.scaling.set(0.06, 0.02, 0.06);
    this.gunTip.setEnabled(look.gun);

    this.legLength = legLen * s;
    this.bodyTop = (legLen + bh) * s;
    this.headHalf = (hs / 2) * s;
    this.headCenterY = (legLen + bh + hs / 2) * s;
    this.bodyHalfWidth = (Math.max(bw, 0.36) / 2 + 0.06) * s;
    this.coreCenterY = (legLen + bh * 0.56) * s;
    this.coreHalf = Math.max(0.09, bw * 0.12 * cs) * s;
    this.coreForward = 0.2 * s;
    this.tinted = false;
    this.flash = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }

  hitFlash(): void {
    this.flash = 0.09;
  }

  /** Poses the rig for this frame. */
  animate(dt: number, pose: RigPose): void {
    this.walkPhase += dt * (4 + pose.speed * 2.4);
    const amp = Math.min(1, pose.speed / 3.5) * 0.75;
    const sw = Math.sin(this.walkPhase) * amp;
    this.hipL.rotation.x = sw;
    this.hipR.rotation.x = -sw;
    const armRaise = pose.attack * -2.1 + pose.swing * 1.6;
    const aim = pose.aim;
    // Aiming raises the blaster arm level with the shoulder (-PI/2 points the arm forward).
    this.shoulderL.rotation.x = (-sw * 0.8 + armRaise) * (1 - aim) + -0.9 * aim;
    this.shoulderR.rotation.x = (sw * 0.8 + armRaise) * (1 - aim) + -1.5 * aim;
    this.shoulderL.rotation.y = 0.45 * aim;
    this.torso.rotation.x = pose.attack * -0.15 + pose.swing * 0.35 + pose.stagger * -0.4;
    this.torso.position.y = this.legLength / Math.max(0.001, this.scaleNode.scaling.y) + Math.abs(Math.cos(this.walkPhase)) * amp * 0.05;
    this.neck.rotation.x = pose.stagger * -0.3;
    this.scaleNode.position.y = (pose.spawn - 1) * 1.9;
    if (this.hasGun) {
      // Charging telegraph: the muzzle glow swells before each shot.
      const k = 1 + pose.charge * 2.2;
      this.gunTip.scaling.set(0.06 * k, 0.02 + pose.charge * 0.06, 0.06 * k);
    }

    if (this.flash > 0 || pose.chill > 0 || this.tinted) {
      this.flash = Math.max(0, this.flash - dt);
      const t = this.flash / 0.09;
      // Frozen enemies tint icy blue; hit flashes go to white on top.
      const c = pose.chill * 0.55;
      for (const p of this.parts) {
        const r = p.base.r + (0.7 - p.base.r) * c;
        const g = p.base.g + (0.9 - p.base.g) * c;
        const b = p.base.b + (1 - p.base.b) * c;
        p.color.set(r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t, 1);
      }
      this.tinted = t > 0 || c > 0;
    }
  }

  /** World-space blaster muzzle (computed on demand; only called when a shot is fired). */
  getMuzzleWorld(out: { x: number; y: number; z: number }): void {
    this.gunTip.computeWorldMatrix(true);
    const p = this.gunTip.getAbsolutePosition();
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
  }

  get bodyColor(): RGB {
    return this.body.base;
  }

  get accentColor(): RGB {
    return this.plate.base;
  }
}
