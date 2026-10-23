export type ArchetypeId = 'chaser';

/** Behavioural + combat definition of an enemy archetype. Visual variation lives in EnemyGenerator. */
export interface ArchetypeDef {
  id: ArchetypeId;
  displayName: string;
  maxHealth: number;
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
  /** Score / scrap value. */
  reward: number;
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
};

export enum EnemyState {
  Inactive = 'INACTIVE',
  Spawning = 'SPAWNING',
  Idle = 'IDLE',
  Chase = 'CHASE',
  Attack = 'ATTACK',
  Recover = 'RECOVER',
  Stunned = 'STUNNED',
  Dead = 'DEAD',
}
