export type WeaponFamily = 'rifle' | 'shotgun' | 'smg';
export const WEAPON_FAMILIES: readonly WeaponFamily[] = ['rifle', 'shotgun', 'smg'];

/** Special modules that add a gameplay effect (Milestone 3). */
export type ModuleId = 'energy' | 'explosive' | 'freeze';

/**
 * Palette slots used by weapon parts. Skins only recolour skin slots — they never touch stats.
 * `module` is coloured by the weapon's special module (gameplay information, not cosmetic).
 */
export type PaletteSlot = 'primary' | 'secondary' | 'accent' | 'dark' | 'emissive' | 'module';

export interface SkinPalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  emissive: string;
}

export interface WeaponStats {
  damage: number;
  /** Shots per second. */
  fireRate: number;
  magazineSize: number;
  /** Seconds. */
  reloadTime: number;
  pellets: number;
  /** Cone half-angle (radians) when firing from the hip. */
  spreadHip: number;
  spreadAds: number;
  bloomPerShot: number;
  bloomMax: number;
  range: number;
  /** Damage starts falling off beyond this distance (to 60% at `range`). */
  falloffStart: number;
  headshotMultiplier: number;
  critChance: number;
  critMultiplier: number;
  /** Radians of upward kick per shot. */
  recoilPitch: number;
  recoilYaw: number;
  reserveStart: number;
  reserveMax: number;
  /** Additional enemies a bullet passes through. */
  pierce: number;
  /** Fractional FOV reduction when aiming down sights. */
  adsZoom: number;
}

/** One axis-aligned box of the weapon model in viewmodel space (metres; +z = forward). */
export interface WeaponPart {
  c: readonly [number, number, number];
  s: readonly [number, number, number];
  slot: PaletteSlot;
}

export interface WeaponDefinition {
  id: string;
  name: string;
  family: WeaponFamily;
  stats: WeaponStats;
  /** Static body parts. */
  parts: WeaponPart[];
  /** Magazine parts, animated separately during reload. */
  magazine: WeaponPart[];
  muzzle: readonly [number, number, number];
  /** Height of the sight line above the model origin (used to centre ADS). */
  sightHeight: number;
  /** Component ids, for analytics and display. */
  components: string[];
  /** Human-readable component names for the loadout / crate UI. */
  componentNames: string[];
  module: ModuleId | null;
  /** Number of non-standard components (0–5): drives crate rarity colour. */
  tier: number;
}

export const MODULE_INFO: Record<ModuleId, { name: string; prefix: string; color: string; description: string }> = {
  energy: { name: 'Energy module', prefix: 'Arc', color: '#4fe3ff', description: '22% chance per hit to chain lightning to 2 nearby enemies.' },
  explosive: { name: 'Explosive module', prefix: 'Volatile', color: '#ff8a2a', description: 'Kills with this weapon trigger a small explosion.' },
  freeze: { name: 'Freeze module', prefix: 'Cryo', color: '#9fe8ff', description: 'Hits chill enemies, slowing them by 45% for 1.5 s.' },
};

/** Module tuning. */
export const MODULE_TUNING = {
  chainChance: 0.22,
  chainTargets: 2,
  chainRange: 6,
  chainDamage: 0.5,
  explosionRadius: 2.2,
  explosionDamage: 24,
  slowDuration: 1.5,
  slowFactor: 0.55,
} as const;
