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
  /** Carries an arm-mounted blaster (ranged archetypes). */
  gun: boolean;
  /** Emissive eye/core colour family; also tells players which archetype they face. */
  eyes: 'red' | 'cyan';
  /** Relative size of the glowing chest core (weak point on tanks and the boss). */
  coreSize: number;
  /** Elite: gold trim and crown. */
  elite: boolean;
}

/** [body, accent, limbs]. Saturated reds/oranges so chasers read instantly against any theme. */
const CHASER_PALETTES: readonly [string, string, string][] = [
  ['#b8352e', '#ffcf3a', '#3a2024'],
  ['#c4462a', '#ffe066', '#3b2420'],
  ['#a82e4a', '#ff9a3c', '#2e1a26'],
  ['#d0502c', '#fff1a8', '#40261d'],
  ['#9c2f2f', '#ff6a3c', '#2a1c1e'],
];

/** Cool blues/teals so shooters are distinguishable from chasers at a glance. */
const SHOOTER_PALETTES: readonly [string, string, string][] = [
  ['#2f6fd0', '#7fe3ff', '#1c2433'],
  ['#2a5cb8', '#a8f0ff', '#1a2030'],
  ['#3b7ee0', '#5fd4ff', '#202838'],
  ['#2d86b8', '#c4f6ff', '#18232e'],
];

/** Heavy browns/bronzes with orange accents: tanks read as armoured and slow. */
const TANK_PALETTES: readonly [string, string, string][] = [
  ['#7a5a3a', '#ff8a2a', '#2e2620'],
  ['#6b6258', '#ffa040', '#26221e'],
  ['#80603a', '#ffb347', '#30261a'],
];

const GOLD = hexToRgb('#f2c94c');

export function generateEnemyLook(archetype: ArchetypeId, rng: SeededRandom, elite = false): EnemyLook {
  const jitter = (c: RGB) => {
    const k = rng.range(0.88, 1.12);
    return { r: c.r * k, g: c.g * k, b: c.b * k };
  };
  let look: EnemyLook;
  switch (archetype) {
    case 'shooter': {
      const [body, accent, limbs] = rng.pick(SHOOTER_PALETTES);
      const bodyRgb = jitter(hexToRgb(body));
      look = {
        body: bodyRgb,
        limbs: jitter(hexToRgb(limbs)),
        head: mixRgb(bodyRgb, hexToRgb(limbs), rng.range(0.15, 0.4)),
        accent: hexToRgb(accent),
        // Slimmer and a touch shorter than chasers: a different silhouette, not just a recolour.
        scale: rng.range(0.9, 1.0),
        bodyWidth: rng.range(0.46, 0.54),
        bodyHeight: rng.range(0.58, 0.68),
        headSize: rng.range(0.34, 0.4),
        armLength: rng.range(0.5, 0.58),
        horns: false,
        armor: rng.chance(0.6),
        backpack: rng.chance(0.7),
        gun: true,
        eyes: 'cyan',
        coreSize: 1,
        elite,
      };
      break;
    }
    case 'tank': {
      const [body, accent, limbs] = rng.pick(TANK_PALETTES);
      const bodyRgb = jitter(hexToRgb(body));
      look = {
        body: bodyRgb,
        limbs: jitter(hexToRgb(limbs)),
        head: mixRgb(bodyRgb, hexToRgb(limbs), 0.4),
        accent: hexToRgb(accent),
        // Big, broad, small-headed: an unmistakable heavy silhouette.
        scale: rng.range(1.38, 1.5),
        bodyWidth: rng.range(0.78, 0.86),
        bodyHeight: rng.range(0.66, 0.74),
        headSize: rng.range(0.3, 0.34),
        armLength: rng.range(0.66, 0.74),
        horns: rng.chance(0.4),
        armor: true,
        backpack: true,
        gun: false,
        eyes: 'red',
        coreSize: 2.4,
        elite,
      };
      break;
    }
    case 'boss': {
      look = {
        body: hexToRgb('#2a2230'),
        limbs: hexToRgb('#17121c'),
        head: hexToRgb('#3a2a3a'),
        accent: hexToRgb('#ff3a3a'),
        scale: 2.5,
        bodyWidth: 0.86,
        bodyHeight: 0.72,
        headSize: 0.42,
        armLength: 0.74,
        horns: true,
        armor: true,
        backpack: true,
        gun: false,
        eyes: 'red',
        coreSize: 2.8,
        elite: true,
      };
      break;
    }
    case 'chaser':
    default: {
      const [body, accent, limbs] = rng.pick(CHASER_PALETTES);
      const bodyRgb = jitter(hexToRgb(body));
      look = {
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
        gun: false,
        eyes: 'red',
        coreSize: 1,
        elite,
      };
    }
  }
  if (elite && archetype !== 'boss') {
    // Elites: larger, gold-trimmed, always armoured and horned.
    look.scale *= 1.15;
    look.accent = GOLD;
    look.armor = true;
    look.horns = true;
  }
  return look;
}
