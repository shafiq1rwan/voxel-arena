import type { SeededRandom } from '../core/SeededRandom';
import type { ArchetypeId } from '../enemies/EnemyTypes';
import type { RGB } from '../render/VoxelMeshBuilder';
import { hexToRgb, mixRgb } from '../render/VoxelMeshBuilder';

/**
 * Procedural enemy appearance. Silhouette proportions stay archetype-recognisable while colours,
 * head/body proportions and optional pieces (horns, armour, backpack) vary per individual.
 */
export interface EnemyLook {
  body: RGB;
  limbs: RGB;
  head: RGB;
  accent: RGB;
  /** Overall size multiplier. */
  scale: number;
  bodyWidth: number;
  bodyHeight: number;
  headSize: number;
  armLength: number;
  horns: boolean;
  armor: boolean;
  backpack: boolean;
}

/** [body, accent, limbs]. Saturated reds/oranges so chasers read instantly against any theme. */
const CHASER_PALETTES: readonly [string, string, string][] = [
  ['#b8352e', '#ffcf3a', '#3a2024'],
  ['#c4462a', '#ffe066', '#3b2420'],
  ['#a82e4a', '#ff9a3c', '#2e1a26'],
  ['#d0502c', '#fff1a8', '#40261d'],
  ['#9c2f2f', '#ff6a3c', '#2a1c1e'],
];

export function generateEnemyLook(archetype: ArchetypeId, rng: SeededRandom): EnemyLook {
  switch (archetype) {
    case 'chaser':
    default: {
      const [body, accent, limbs] = rng.pick(CHASER_PALETTES);
      const jitter = (c: RGB) => {
        const k = rng.range(0.88, 1.12);
        return { r: c.r * k, g: c.g * k, b: c.b * k };
      };
      const bodyRgb = jitter(hexToRgb(body));
      return {
        body: bodyRgb,
        limbs: jitter(hexToRgb(limbs)),
        head: mixRgb(bodyRgb, hexToRgb(accent), rng.range(0, 0.25)),
        accent: hexToRgb(accent),
        scale: rng.range(0.92, 1.08),
        bodyWidth: rng.range(0.55, 0.68),
        bodyHeight: rng.range(0.55, 0.66),
        headSize: rng.range(0.38, 0.46),
        armLength: rng.range(0.5, 0.62),
        horns: rng.chance(0.3),
        armor: rng.chance(0.45),
        backpack: rng.chance(0.25),
      };
    }
  }
}
