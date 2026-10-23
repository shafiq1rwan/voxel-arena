export type WeaponFamily = 'rifle' | 'shotgun' | 'smg';

/** Palette slots used by weapon parts. Skins only recolour slots — they never touch stats. */
export type PaletteSlot = 'primary' | 'secondary' | 'accent' | 'dark' | 'emissive';

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
}
