import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Shared material cache. Reusing materials keeps shader variants and draw-call state changes low.
 */
export class MaterialLibrary {
  private cache = new Map<string, StandardMaterial>();

  constructor(private scene: Scene) {}

  /** Lit material that takes its colour from vertex / instance colours. */
  vertexLit(key = 'vertexLit', specular = 0.04): StandardMaterial {
    return this.get(`lit:${key}`, () => {
      const m = new StandardMaterial(`mat_${key}`, this.scene);
      m.diffuseColor = Color3.White();
      m.specularColor = new Color3(specular, specular, specular);
      m.specularPower = 32;
      // Hemisphere + sun + muzzle flash. Static lighting is baked into vertex colours.
      m.maxSimultaneousLights = 3;
      return m;
    });
  }

  /** Unlit, self-illuminated colour; also drives the glow layer through its emissive colour. */
  emissive(hex: string, intensity = 1): StandardMaterial {
    return this.get(`emi:${hex}:${intensity}`, () => {
      const m = new StandardMaterial(`emi_${hex}`, this.scene);
      const c = Color3.FromHexString(hex).scale(intensity);
      m.disableLighting = true;
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.emissiveColor = c;
      return m;
    });
  }

  /** Unlit material coloured by vertex/instance colours (white emissive multiplied by vColor). */
  unlitVertex(key = 'unlitVertex', fog = true): StandardMaterial {
    return this.get(`unlit:${key}`, () => {
      const m = new StandardMaterial(`unlit_${key}`, this.scene);
      m.disableLighting = true;
      m.diffuseColor = Color3.White();
      m.specularColor = Color3.Black();
      m.emissiveColor = Color3.White();
      m.fogEnabled = fog;
      return m;
    });
  }

  private get(key: string, create: () => StandardMaterial): StandardMaterial {
    let m = this.cache.get(key);
    if (!m) {
      m = create();
      this.cache.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
