export type UpgradeId =
  | 'heavyRounds'
  | 'rapidFire'
  | 'criticalPrecision'
  | 'piercingShots'
  | 'expandedMagazine'
  | 'swiftReload'
  | 'quickFeet'
  | 'dashCharge'
  | 'reinforcedArmor'
  | 'regeneration'
  | 'lastStand'
  | 'explosiveKills';

export type UpgradeCategory = 'offense' | 'defense' | 'utility';
export type UpgradeRarity = 'common' | 'rare' | 'epic';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  maxStacks: number;
  /** Card text for the stack the player would gain (1-based). */
  describe(nextStack: number): string;
  /** Upgrades that can never be offered together with / after this one (none in the base pool yet). */
  excludes?: UpgradeId[];
}

/** Aggregate effect of every upgrade taken this run. Systems read these; they never read stacks. */
export interface UpgradeModifiers {
  damageMul: number;
  fireRateMul: number;
  critAdd: number;
  pierce: number;
  magazineMul: number;
  reloadMul: number;
  moveMul: number;
  maxHealthAdd: number;
  /** HP restored every 10 s while a wave is in combat. */
  regenPer10s: number;
  /** Lethal hits survived per wave. */
  lastStandPerWave: number;
  /** 0 = off; higher levels widen and strengthen kill explosions. */
  explosiveLevel: number;
  dash: boolean;
}

export function baseModifiers(): UpgradeModifiers {
  return {
    damageMul: 1,
    fireRateMul: 1,
    critAdd: 0,
    pierce: 0,
    magazineMul: 1,
    reloadMul: 1,
    moveMul: 1,
    maxHealthAdd: 0,
    regenPer10s: 0,
    lastStandPerWave: 0,
    explosiveLevel: 0,
    dash: false,
  };
}

/** Hard caps so stacked builds stay fun rather than degenerate. */
export const MODIFIER_CAPS = {
  damageMul: 2.5,
  fireRateMul: 2.2,
  crit: 0.6,
  pierce: 3,
  magazineMul: 2.5,
  reloadMulMin: 0.45,
  moveMul: 1.4,
} as const;

/** Kill-explosion tuning per Explosive Kills level. */
export function explosionStats(level: number): { radius: number; damage: number } {
  return { radius: 2.4 + 0.5 * (level - 1), damage: 28 + 16 * (level - 1) };
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  heavyRounds: { id: 'heavyRounds', name: 'Heavy Rounds', category: 'offense', rarity: 'common', maxStacks: 5, describe: () => '+15% weapon damage' },
  rapidFire: { id: 'rapidFire', name: 'Rapid Fire', category: 'offense', rarity: 'common', maxStacks: 5, describe: () => '+15% fire rate' },
  criticalPrecision: {
    id: 'criticalPrecision',
    name: 'Critical Precision',
    category: 'offense',
    rarity: 'common',
    maxStacks: 4,
    describe: () => '+10% critical hit chance',
  },
  piercingShots: {
    id: 'piercingShots',
    name: 'Piercing Shots',
    category: 'offense',
    rarity: 'rare',
    maxStacks: 2,
    describe: (n) => `Bullets pass through ${n === 1 ? 'one extra enemy' : `${n} enemies`}`,
  },
  expandedMagazine: {
    id: 'expandedMagazine',
    name: 'Expanded Magazine',
    category: 'utility',
    rarity: 'common',
    maxStacks: 3,
    describe: () => '+30% magazine capacity',
  },
  swiftReload: { id: 'swiftReload', name: 'Swift Reload', category: 'utility', rarity: 'common', maxStacks: 3, describe: () => '−20% reload time' },
  quickFeet: { id: 'quickFeet', name: 'Quick Feet', category: 'utility', rarity: 'common', maxStacks: 3, describe: () => '+10% movement speed' },
  dashCharge: {
    id: 'dashCharge',
    name: 'Dash Charge',
    category: 'utility',
    rarity: 'rare',
    maxStacks: 1,
    describe: () => 'Unlock a quick dash on Q (brief invulnerability)',
  },
  reinforcedArmor: {
    id: 'reinforcedArmor',
    name: 'Reinforced Armor',
    category: 'defense',
    rarity: 'common',
    maxStacks: 5,
    describe: () => '+20 max health and restore 20 health',
  },
  regeneration: {
    id: 'regeneration',
    name: 'Regeneration',
    category: 'defense',
    rarity: 'rare',
    maxStacks: 3,
    describe: (n) => `Restore ${2 * n} health every 10 s during combat`,
  },
  lastStand: {
    id: 'lastStand',
    name: 'Last Stand',
    category: 'defense',
    rarity: 'epic',
    maxStacks: 1,
    describe: () => 'Survive one otherwise lethal hit each wave',
  },
  explosiveKills: {
    id: 'explosiveKills',
    name: 'Explosive Kills',
    category: 'offense',
    rarity: 'epic',
    maxStacks: 3,
    describe: (n) => (n === 1 ? 'Enemies explode on death, damaging nearby foes' : 'Bigger, stronger kill explosions'),
  },
};

export const RARITY_WEIGHT: Record<UpgradeRarity, number> = { common: 10, rare: 6, epic: 3 };
