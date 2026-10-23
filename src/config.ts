/** Central gameplay tuning. Keep balance numbers here rather than scattered across systems. */
export const CONFIG = {
  arena: {
    /** Playable interior size in metres (cells are 1 m). */
    size: 40,
    boundaryHeight: 5,
    centerClearRadius: 6,
    perimeterMargin: 2,
    minSpawnDistance: 13,
  },
  player: {
    maxHealth: 100,
    radius: 0.32,
    height: 1.75,
    eyeHeight: 1.6,
    stepHeight: 0.55,
    walkSpeed: 5,
    sprintSpeed: 7.5,
    groundAccel: 60,
    groundDecel: 40,
    airAccel: 14,
    gravity: 22,
    jumpVelocity: 7.6,
    coyoteTime: 0.1,
    jumpBuffer: 0.12,
    contactInvulnerability: 0.5,
  },
  enemy: {
    separationRadius: 0.9,
    separationStrength: 6,
    corpseDebris: 26,
  },
  pickups: {
    healthAmount: 25,
    ammoMagazines: 1,
    lifetime: 22,
    healthDropChance: 0.07,
    ammoDropChance: 0.14,
    collectRadius: 1.3,
  },
  waves: {
    intermission: 4,
    prepareTime: 2.5,
    spawnBatchInterval: 1.4,
  },
} as const;

export type QualityLevel = 'low' | 'medium' | 'high';

export const QUALITY_PRESETS: Record<QualityLevel, { maxPixelRatio: number; glow: boolean; particleScale: number; fogEnd: number }> = {
  low: { maxPixelRatio: 1, glow: false, particleScale: 0.5, fogEnd: 70 },
  medium: { maxPixelRatio: 1.25, glow: true, particleScale: 0.8, fogEnd: 90 },
  high: { maxPixelRatio: 2, glow: true, particleScale: 1, fogEnd: 110 },
};
