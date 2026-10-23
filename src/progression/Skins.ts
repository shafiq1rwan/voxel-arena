import type { SkinPalette } from '../combat/WeaponTypes';
import type { AchievementId } from './Achievements';

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** How a skin varies colour across parts and which decals it adds. Never touches stats. */
export type SkinPattern = 'solid' | 'camo' | 'digital' | 'molten' | 'thunder' | 'void' | 'gold';

export interface SkinDef extends SkinPalette {
  rarity: SkinRarity;
  pattern: SkinPattern;
  /** Achievement that unlocks it; undefined = always available. */
  achievement?: AchievementId;
  /** Extra colour used by patterns (camo blotches, digital pixels). */
  alt: string;
}

/**
 * Cosmetic weapon skins. A skin is a palette + pattern applied to the weapon's part slots, so it
 * works on every procedurally assembled weapon and can never affect gameplay stats.
 */
export const SKINS: Record<string, SkinDef> = {
  default: { id: 'default', name: 'Default', rarity: 'common', pattern: 'solid', primary: '#2b2e35', secondary: '#3a3e47', accent: '#efaa28', dark: '#16181c', emissive: '#ff9a2a', alt: '#3a3e47' },
  desertCamo: {
    id: 'desertCamo',
    name: 'Desert Camo',
    rarity: 'common',
    pattern: 'camo',
    achievement: 'survivor',
    primary: '#b89768',
    secondary: '#8f7148',
    accent: '#d9c08f',
    dark: '#4a3b28',
    emissive: '#ffcf6a',
    alt: '#6b5536',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    rarity: 'rare',
    pattern: 'solid',
    achievement: 'veteran',
    primary: '#8c1d26',
    secondary: '#5c121a',
    accent: '#ff4b4b',
    dark: '#1f0d10',
    emissive: '#ff3344',
    alt: '#b32432',
  },
  digitalBlue: {
    id: 'digitalBlue',
    name: 'Digital Blue',
    rarity: 'rare',
    pattern: 'digital',
    achievement: 'exterminator',
    primary: '#1f4fa8',
    secondary: '#163a7d',
    accent: '#59b4ff',
    dark: '#0c1830',
    emissive: '#3fd8ff',
    alt: '#2f6fd8',
  },
  moltenCore: {
    id: 'moltenCore',
    name: 'Molten Core',
    rarity: 'rare',
    pattern: 'molten',
    achievement: 'shotgunMaster',
    primary: '#2a1d1a',
    secondary: '#3a2520',
    accent: '#ff7a1a',
    dark: '#120c0a',
    emissive: '#ff5a10',
    alt: '#ff9a3c',
  },
  thunderstrike: {
    id: 'thunderstrike',
    name: 'Thunderstrike',
    rarity: 'epic',
    pattern: 'thunder',
    achievement: 'electricStorm',
    primary: '#2a3550',
    secondary: '#1d2740',
    accent: '#7fe3ff',
    dark: '#0e1424',
    emissive: '#5fe8ff',
    alt: '#b8f4ff',
  },
  void: {
    id: 'void',
    name: 'Void',
    rarity: 'epic',
    pattern: 'void',
    achievement: 'sharpshooter',
    primary: '#1a1226',
    secondary: '#24183a',
    accent: '#9a5bff',
    dark: '#0a0610',
    emissive: '#b26bff',
    alt: '#3a2560',
  },
  goldenSurvivor: {
    id: 'goldenSurvivor',
    name: 'Golden Survivor',
    rarity: 'legendary',
    pattern: 'gold',
    achievement: 'goldenSurvivor',
    primary: '#d9a521',
    secondary: '#a87a12',
    accent: '#fff1b8',
    dark: '#3a2a08',
    emissive: '#ffd45a',
    alt: '#f2c94c',
  },
};

export const SKIN_ORDER = ['default', 'desertCamo', 'crimson', 'digitalBlue', 'moltenCore', 'thunderstrike', 'void', 'goldenSurvivor'];
export const DEFAULT_SKIN_ID = 'default';

export function skinFor(id: string): SkinDef {
  return SKINS[id] ?? SKINS.default!;
}
