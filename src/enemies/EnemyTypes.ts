export type ArchetypeId = 'chaser' | 'shooter' | 'tank' | 'boss';

/** Ranged-attack tuning for archetypes that fire projectiles. */
export interface RangedDef {
  projectileDamage: number;
  /** m/s — slow enough to read and sidestep. */
  projectileSpeed: number;
  /** Average seconds between shots (randomised ±20%). */
  fireInterval: number;
  /** Telegraphed aim time before each shot. */
  windup: number;
  /** Preferred engagement band (metres). */
  preferredMin: number;
  preferredMax: number;
  /** Will not fire beyond this range. */
  maxRange: number;
}

/** Behavioural + combat definition of an enemy archetype. Visual variation lives in EnemyGenerator. */
export interface ArchetypeDef {
  id: ArchetypeId;
  displayName: string;
  maxHealth: number;
  /** Melee damage (contact). */
  damage: number;
  /** m/s */
  speed: number;
  /** Distance at which a melee wind-up starts. */
  attackRange: number;
  /** Distance within which the swing connects at the end of the wind-up. */
  attackHitRange: number;
  attackWindup: number;
  attackRecover: number;
  /** Collision half-size. */
  radius: number;
  threatCost: number;
  /** Seconds of stagger when hit by a headshot / heavy hit. */
  staggerTime: number;
  /** Score value. */
  reward: number;
  /** Multiplier on the weapon's headshot bonus (armoured heads < 1). */
  headMultiplier: number;
  /** 0..1 resistance to knockback. */
  knockbackResist: number;
  /** Only weak-point (core) hits stagger this archetype. */
  staggerOnlyOnCore: boolean;
  /** Has a glowing chest core that takes 2.5× damage. */
  weakPoint: boolean;
  ranged?: RangedDef;
}

const base = {
  headMultiplier: 1,
  knockbackResist: 0,
  staggerOnlyOnCore: false,
  weakPoint: false,
};

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  chaser: {
    ...base,
    id: 'chaser',
    displayName: 'Chaser',
    maxHealth: 60,
    damage: 8,
    speed: 4.3,
    attackRange: 1.35,
    attackHitRange: 1.95,
    attackWindup: 0.32,
    attackRecover: 0.55,
    radius: 0.34,
    threatCost: 1,
    staggerTime: 0.18,
    reward: 10,
  },
  shooter: {
    ...base,
    id: 'shooter',
    displayName: 'Shooter',
    maxHealth: 45,
    damage: 5,
    speed: 3.3,
    attackRange: 1.2,
    attackHitRange: 1.8,
    attackWindup: 0.3,
    attackRecover: 0.6,
    radius: 0.34,
    threatCost: 2,
    staggerTime: 0.3,
    reward: 15,
    ranged: {
      projectileDamage: 7,
      projectileSpeed: 15,
      fireInterval: 2.5,
      windup: 0.6,
      preferredMin: 7,
      preferredMax: 14,
      maxRange: 26,
    },
  },
  tank: {
    ...base,
    id: 'tank',
    displayName: 'Tank',
    maxHealth: 220,
    damage: 15,
    speed: 2.4,
    attackRange: 2.1,
    attackHitRange: 2.7,
    attackWindup: 0.85,
    attackRecover: 1.0,
    radius: 0.5,
    threatCost: 5,
    staggerTime: 0.45,
    reward: 40,
    headMultiplier: 0.5,
    knockbackResist: 0.85,
    staggerOnlyOnCore: true,
    weakPoint: true,
  },
  boss: {
    ...base,
    id: 'boss',
    displayName: 'Obsidian Colossus',
    maxHealth: 2500,
    damage: 18,
    speed: 2.2,
    attackRange: 3,
    attackHitRange: 3.6,
    attackWindup: 0.6,
    attackRecover: 0.8,
    radius: 0.9,
    threatCost: 0,
    staggerTime: 0,
    reward: 500,
    headMultiplier: 0.75,
    knockbackResist: 1,
    staggerOnlyOnCore: true,
    weakPoint: true,
  },
};

/** Elite variants: one extra ability per base archetype. */
export const ELITE_INFO: Record<'chaser' | 'shooter' | 'tank', { name: string; ability: string }> = {
  chaser: { name: 'Berserker', ability: 'Leaps at you from range' },
  shooter: { name: 'Gunner', ability: 'Fires three-bolt bursts' },
  tank: { name: 'Warden', ability: 'Wide slam and regenerating armour' },
};

export const ELITE_HEALTH = 2.2;
export const ELITE_COST_BONUS = 4;

export enum EnemyState {
  Inactive = 'INACTIVE',
  Spawning = 'SPAWNING',
  Idle = 'IDLE',
  /** Pathing toward the player until in range / in sight (ranged archetypes). */
  Seek = 'SEEK',
  Chase = 'CHASE',
  /** Holding the preferred distance while circling (ranged archetypes). */
  Strafe = 'STRAFE',
  Attack = 'ATTACK',
  Recover = 'RECOVER',
  Stunned = 'STUNNED',
  /** Elite chaser airborne leap. */
  Leap = 'LEAP',
  /** Boss phase-change roar (invulnerable to stagger, brief pause). */
  Roar = 'ROAR',
  Dead = 'DEAD',
}
