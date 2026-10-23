import type { SkinPalette } from '../combat/WeaponTypes';

/**
 * Cosmetic weapon skins. A skin is purely a palette mapping for weapon part slots, so it applies
 * to any procedurally assembled weapon and can never affect gameplay stats.
 * (Unlock rules and the gallery arrive with the achievement system in Milestone 4.)
 */
export const SKINS: Record<string, SkinPalette> = {
  default: { id: 'default', name: 'Default', primary: '#2b2e35', secondary: '#3a3e47', accent: '#efaa28', dark: '#16181c', emissive: '#ff9a2a' },
};

export const DEFAULT_SKIN_ID = 'default';
