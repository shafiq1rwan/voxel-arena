import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { QUALITY_PRESETS, type QualityLevel } from '../config';
import type { ThemePalette } from '../procedural/Themes';
import { MaterialLibrary } from '../render/Materials';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';

/** Rendering group for the first-person weapon so it never clips into world geometry. */
export const VIEWMODEL_GROUP = 1;

/**
 * Owns the Babylon engine, scene, camera, lights, sky, fog and post effects.
 * Gameplay systems receive the scene from here but never create engines themselves.
 */
export class SceneManager {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly materials: MaterialLibrary;
  readonly hemi: HemisphericLight;
  readonly sun: DirectionalLight;
  /** Always-enabled muzzle light; intensity animates. Keeping the light count constant avoids shader recompiles. */
  readonly muzzleLight: PointLight;
  private glow: GlowLayer | null = null;
  private sky: Mesh;
  private quality: QualityLevel = 'medium';
  private shadows: ShadowGenerator | null = null;
  private arenaMeshes: Mesh[] = [];
  private lanternLights: PointLight[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(
      canvas,
      true,
      { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance', disableWebGL2Support: false, antialias: true },
      false,
    );
    this.engine.disableManifestCheck = true;
    this.engine.enableOfflineSupport = false;

    const scene = new Scene(this.engine);
    this.scene = scene;
    // Gameplay input is handled by InputManager; Babylon's pointer handling would only add picking cost.
    scene.detachControl();
    scene.skipPointerMovePicking = true;
    scene.skipPointerDownPicking = true;
    scene.skipPointerUpPicking = true;
    scene.autoClear = true;
    scene.clearColor = new Color4(0.1, 0.08, 0.2, 1);
    scene.ambientColor = new Color3(0, 0, 0);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 28;
    scene.fogEnd = 90;
    // The viewmodel group clears depth so the gun always draws on top of the world.
    scene.setRenderingAutoClearDepthStencil(VIEWMODEL_GROUP, true, true, true);

    this.materials = new MaterialLibrary(scene);

    this.camera = new FreeCamera('playerCam', new Vector3(20, 1.6, 20), scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 400;
    this.camera.inputs.clear();
    this.camera.rotationQuaternion = null!;

    this.hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
    this.sun = new DirectionalLight('sun', new Vector3(-0.45, -0.85, -0.3).normalize(), scene);
    this.muzzleLight = new PointLight('muzzle', Vector3.Zero(), scene);
    this.muzzleLight.diffuse = new Color3(1, 0.75, 0.35);
    this.muzzleLight.specular = Color3.Black();
    this.muzzleLight.range = 9;
    this.muzzleLight.intensity = 0;
    for (let i = 0; i < 3; i++) {
      const light = new PointLight(`lantern_${i}`, Vector3.Zero(), scene);
      light.diffuse = new Color3(1, 0.39, 0.08);
      light.specular = Color3.Black();
      light.range = 12;
      light.intensity = 0;
      this.lanternLights.push(light);
    }

    this.sky = this.createSky();

    window.addEventListener('resize', () => this.engine.resize());
  }

  private createSky(): Mesh {
    const sky = CreateSphere('sky', { diameter: 700, segments: 16, sideOrientation: 1 }, this.scene);
    sky.infiniteDistance = true;
    sky.isPickable = false;
    sky.material = this.materials.unlitVertex('sky', false);
    sky.applyFog = false;
    return sky;
  }

  /** Applies a theme's lighting, fog and sky gradient. */
  applyTheme(theme: ThemePalette): void {
    const top = Color3.FromHexString(theme.skyTop);
    const horizon = Color3.FromHexString(theme.skyHorizon);
    const fog = Color3.FromHexString(theme.fog);
    this.scene.fogColor = fog;
    this.scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);

    this.hemi.diffuse = Color3.FromHexString(theme.hemiSky);
    this.hemi.groundColor = Color3.FromHexString(theme.hemiGround);
    this.hemi.specular = Color3.Black();
    this.hemi.intensity = theme.hemiIntensity;
    this.sun.diffuse = Color3.FromHexString(theme.sunColor);
    this.sun.specular = Color3.FromHexString(theme.sunColor).scale(0.3);
    this.sun.intensity = theme.sunIntensity;
    this.lanternLights.forEach((light, i) => {
      light.position.set([10.4, 31.6, 21][i]!, 3.1, [1.5, 40.5, 40.5][i]!);
      light.intensity = theme.id === 'ruins' ? 1.5 : 0;
    });

    // Vertical gradient baked into sky vertex colours.
    const positions = this.sky.getVerticesData(VertexBuffer.PositionKind)!;
    const colors = new Float32Array((positions.length / 3) * 4);
    for (let i = 0; i < positions.length / 3; i++) {
      const y = positions[i * 3 + 1]! / 350;
      const t = Math.min(1, Math.max(0, y * 1.6));
      const c = y < 0 ? fog.scale(0.85) : Color3.Lerp(horizon, top, Math.pow(t, 0.7));
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1;
    }
    this.sky.setVerticesData(VertexBuffer.ColorKind, colors, false);
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    const preset = QUALITY_PRESETS[q];
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / dpr);
    this.scene.fogEnd = preset.fogEnd;
    this.scene.fogStart = preset.fogEnd * 0.3;
    if (preset.glow && !this.glow) {
      this.glow = new GlowLayer('glow', this.scene, { mainTextureRatio: 0.5, blurKernelSize: 32 });
      this.glow.intensity = 0.45;
      // The sky uses an unlit (white emissive) material and must not bloom.
      this.glow.addExcludedMesh(this.sky);
      // Meshes flagged `metadata.noGlow` use emissive only as a readability lift; render them as
      // black occluders in the glow pass instead of excluding them (so they still block halos).
      this.glow.customEmissiveColorSelector = (mesh, _subMesh, material, result) => {
        const m = material as StandardMaterial;
        if ((mesh.metadata as { noGlow?: boolean } | null)?.noGlow || !m.emissiveColor) result.set(0, 0, 0, 1);
        else result.set(m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b, m.alpha);
      };
    } else if (!preset.glow && this.glow) {
      this.glow.dispose();
      this.glow = null;
    }
    this.engine.resize();
    this.updateShadows();
  }

  setArenaMeshes(meshes: Mesh[]): void {
    this.arenaMeshes = [...meshes];
    this.updateShadows();
  }

  private updateShadows(): void {
    this.shadows?.dispose();
    this.shadows = null;
    if (this.quality === 'low' || !this.arenaMeshes.length) return;
    this.sun.position.set(40, 55, 25);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 130;
    const shadows = new ShadowGenerator(this.quality === 'high' ? 2048 : 1024, this.sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.001;
    shadows.normalBias = 0.035;
    shadows.setDarkness(0.28);
    for (const mesh of this.arenaMeshes) if (mesh.name === 'arena_terrain') shadows.addShadowCaster(mesh);
    const enemies = this.scene.getMeshByName('enemy_cube_src');
    if (enemies) shadows.addShadowCaster(enemies);
    this.shadows = shadows;
  }

  get qualityLevel(): QualityLevel {
    return this.quality;
  }

  /** Vertical field of view in degrees. */
  setFov(deg: number): void {
    this.camera.fov = (deg * Math.PI) / 180;
  }
}
