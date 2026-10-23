export type ArchetypeId = 'chaser' | 'shooter';

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
  ranged?: RangedDef;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  chaser: {
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
};

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
  Dead = 'DEAD',
}
