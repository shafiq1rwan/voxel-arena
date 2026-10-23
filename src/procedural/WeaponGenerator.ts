import type { SeededRandom } from '../core/SeededRandom';
import type { WeaponDefinition, WeaponFamily, WeaponPart, WeaponStats } from '../combat/WeaponTypes';

/**
 * Modular weapon assembly. A weapon = family base stats + receiver + barrel + magazine + stock +
 * sight. Each component contributes visible geometry and stat modifiers.
 *
 * Milestone 1 ships the default component set per family; Milestone 3 extends the component
 * pools (heavy/rapid/long barrels, energy/explosive/freeze modules) and seeded random selection.
 */

export const BASE_STATS: Record<WeaponFamily, WeaponStats> = {
  rifle: {
    damage: 15,
    fireRate: 6,
    magazineSize: 30,
    reloadTime: 1.6,
    pellets: 1,
    spreadHip: 0.012,
    spreadAds: 0.003,
    bloomPerShot: 0.004,
    bloomMax: 0.03,
    range: 120,
    falloffStart: 35,
    headshotMultiplier: 2,
    critChance: 0.05,
    critMultiplier: 1.5,
    recoilPitch: 0.012,
    recoilYaw: 0.006,
    reserveStart: 150,
    reserveMax: 240,
    pierce: 0,
  },
  shotgun: {
    damage: 10,
    fireRate: 1,
    magazineSize: 6,
    reloadTime: 2,
    pellets: 7,
    spreadHip: 0.075,
    spreadAds: 0.055,
    bloomPerShot: 0,
    bloomMax: 0,
    range: 40,
    falloffStart: 9,
    headshotMultiplier: 1.5,
    critChance: 0.05,
    critMultiplier: 1.5,
    recoilPitch: 0.05,
    recoilYaw: 0.015,
    reserveStart: 36,
    reserveMax: 60,
    pierce: 0,
  },
  smg: {
    damage: 9,
    fireRate: 10,
    magazineSize: 40,
    reloadTime: 1.8,
    pellets: 1,
    spreadHip: 0.022,
    spreadAds: 0.01,
    bloomPerShot: 0.003,
    bloomMax: 0.04,
    range: 70,
    falloffStart: 20,
    headshotMultiplier: 1.75,
    critChance: 0.05,
    critMultiplier: 1.5,
    recoilPitch: 0.008,
    recoilYaw: 0.008,
    reserveStart: 200,
    reserveMax: 320,
    pierce: 0,
  },
};

interface ComponentDef {
  id: string;
  /** Display word used in the generated name ('' for none). */
  label: string;
  parts: WeaponPart[];
  modify?: (s: WeaponStats) => void;
}

const box = (c: [number, number, number], s: [number, number, number], slot: WeaponPart['slot']): WeaponPart => ({ c, s, slot });

/** Yellow/black block pattern along the receiver, matching the art direction. */
function checkerStripe(z0: number, z1: number, y: number, w: number): WeaponPart[] {
  const parts: WeaponPart[] = [];
  const step = 0.06;
  let k = 0;
  for (let z = z0; z < z1 - 1e-6; z += step, k++) {
    parts.push(box([0, y, z + step / 2], [w, 0.032, step], k % 2 === 0 ? 'accent' : 'dark'));
  }
  return parts;
}

const RECEIVERS: Record<WeaponFamily, ComponentDef> = {
  rifle: {
    id: 'receiver_standard',
    label: '',
    parts: [
      box([0, 0, 0.05], [0.09, 0.11, 0.36], 'primary'),
      // Layered receiver panels, charging handle and orange armour along both sides.
      box([0, 0.045, 0.06], [0.1, 0.035, 0.32], 'secondary'),
      box([0, -0.04, 0.05], [0.095, 0.022, 0.34], 'dark'),
      box([-0.055, 0.012, -0.06], [0.022, 0.022, 0.075], 'secondary'),
      box([0.05, 0.012, -0.02], [0.014, 0.035, 0.09], 'dark'),
      box([-0.051, 0.003, 0.03], [0.01, 0.06, 0.22], 'accent'),
      box([0.051, 0.003, 0.03], [0.01, 0.06, 0.22], 'accent'),
      ...checkerStripe(-0.1, 0.2, 0.065, 0.03),
      ...[-0.05, 0.02, 0.09].flatMap(z => [
        box([-0.058, 0.018, z], [0.006, 0.025, 0.014], 'dark'),
        box([0.058, 0.018, z], [0.006, 0.025, 0.014], 'dark'),
      ]),
      box([0, 0.074, 0.05], [0.05, 0.02, 0.3], 'dark'),
      box([0.047, -0.005, 0.12], [0.006, 0.022, 0.15], 'emissive'),
      box([-0.047, -0.005, 0.12], [0.006, 0.022, 0.15], 'emissive'),
      box([0, -0.1, -0.03], [0.055, 0.12, 0.06], 'dark'),
      box([0, -0.06, 0.05], [0.02, 0.03, 0.06], 'dark'),
    ],
  },
  shotgun: {
    id: 'receiver_pump',
    label: '',
    parts: [box([0, 0, 0.02], [0.1, 0.12, 0.3], 'primary'), ...checkerStripe(-0.1, 0.14, 0.05, 0.104), box([0, -0.1, -0.05], [0.055, 0.12, 0.06], 'dark')],
  },
  smg: {
    id: 'receiver_compact',
    label: '',
    parts: [box([0, 0, 0.04], [0.08, 0.1, 0.26], 'primary'), ...checkerStripe(-0.06, 0.12, 0.04, 0.084), box([0, -0.09, -0.02], [0.05, 0.11, 0.055], 'dark')],
  },
};

const BARRELS: Record<WeaponFamily, ComponentDef> = {
  rifle: {
    id: 'barrel_standard',
    label: '',
    parts: [
      box([0, 0.012, 0.31], [0.09, 0.08, 0.18], 'secondary'),
      ...[0.245, 0.295, 0.345, 0.395].flatMap(z => [
        box([-0.049, 0.01, z], [0.014, 0.075, 0.028], 'accent'),
        box([0.049, 0.01, z], [0.014, 0.075, 0.028], 'accent'),
        box([0, 0.06, z], [0.065, 0.015, 0.022], 'dark'),
      ]),
      box([0, -0.065, 0.29], [0.04, 0.09, 0.055], 'dark'),
      box([0, 0.02, 0.48], [0.034, 0.034, 0.18], 'dark'),
      box([0, 0.02, 0.585], [0.06, 0.06, 0.05], 'secondary'),
      box([0, 0.02, 0.612], [0.038, 0.038, 0.008], 'dark'),
    ],
  },
  shotgun: {
    id: 'barrel_double',
    label: '',
    parts: [box([0, 0.02, 0.35], [0.09, 0.05, 0.36], 'dark'), box([0, -0.04, 0.3], [0.08, 0.05, 0.16], 'secondary'), box([0, 0.02, 0.54], [0.1, 0.06, 0.04], 'accent')],
  },
  smg: {
    id: 'barrel_short',
    label: '',
    parts: [box([0, 0.01, 0.24], [0.065, 0.07, 0.1], 'secondary'), box([0, 0.015, 0.34], [0.03, 0.03, 0.12], 'dark')],
  },
};

const MAGAZINES: Record<WeaponFamily, ComponentDef> = {
  rifle: { id: 'mag_standard', label: '', parts: [box([0, -0.11, 0.12], [0.05, 0.14, 0.07], 'secondary'), box([0, -0.185, 0.125], [0.054, 0.02, 0.074], 'accent')] },
  shotgun: { id: 'mag_tube', label: '', parts: [box([0, -0.035, 0.42], [0.05, 0.04, 0.2], 'secondary')] },
  smg: { id: 'mag_long', label: '', parts: [box([0, -0.13, 0.1], [0.045, 0.18, 0.055], 'secondary'), box([0, -0.225, 0.1], [0.05, 0.02, 0.06], 'accent')] },
};

const STOCKS: Record<WeaponFamily, ComponentDef> = {
  rifle: { id: 'stock_standard', label: '', parts: [box([0, -0.01, -0.22], [0.07, 0.1, 0.16], 'primary'), box([0, -0.02, -0.31], [0.076, 0.13, 0.03], 'accent')] },
  shotgun: { id: 'stock_heavy', label: '', parts: [box([0, -0.02, -0.2], [0.08, 0.12, 0.16], 'primary'), box([0, -0.03, -0.29], [0.084, 0.14, 0.03], 'dark')] },
  smg: { id: 'stock_folded', label: '', parts: [box([0.03, -0.02, -0.12], [0.015, 0.06, 0.14], 'dark')] },
};

const SIGHTS: Record<WeaponFamily, ComponentDef> = {
  rifle: {
    id: 'sight_reflex',
    label: '',
    parts: [
      box([0, 0.084, 0], [0.062, 0.02, 0.1], 'dark'),
      box([-0.025, 0.115, 0], [0.012, 0.05, 0.025], 'secondary'),
      box([0.025, 0.115, 0], [0.012, 0.05, 0.025], 'secondary'),
      box([0, 0.142, 0], [0.062, 0.012, 0.025], 'accent'),
      box([0, 0.118, 0.012], [0.004, 0.004, 0.005], 'emissive'),
      box([0, 0.054, 0.5], [0.014, 0.04, 0.018], 'secondary'),
    ],
  },
  shotgun: { id: 'sight_bead', label: '', parts: [box([0, 0.06, 0.5], [0.015, 0.015, 0.015], 'emissive')] },
  smg: { id: 'sight_holo', label: '', parts: [box([0, 0.085, 0.02], [0.045, 0.04, 0.05], 'dark'), box([0, 0.09, 0.047], [0.03, 0.022, 0.004], 'emissive')] },
};

const FAMILY_NAMES: Record<WeaponFamily, string> = { rifle: 'Rifle', shotgun: 'Shotgun', smg: 'SMG' };
const SIGHT_HEIGHT: Record<WeaponFamily, number> = { rifle: 0.118, shotgun: 0.06, smg: 0.09 };
const MUZZLE: Record<WeaponFamily, [number, number, number]> = { rifle: [0, 0.02, 0.62], shotgun: [0, 0.02, 0.57], smg: [0, 0.015, 0.41] };

/** Assembles a weapon definition. `rng` is reserved for seeded component selection (Milestone 3). */
export function createWeapon(family: WeaponFamily, _rng?: SeededRandom): WeaponDefinition {
  const comps = [RECEIVERS[family], BARRELS[family], MAGAZINES[family], STOCKS[family], SIGHTS[family]];
  const stats: WeaponStats = { ...BASE_STATS[family] };
  for (const c of comps) c.modify?.(stats);
  const labels = comps.map((c) => c.label).filter(Boolean);
  const name = [...labels, FAMILY_NAMES[family]].join(' ');
  const magazine = MAGAZINES[family];
  return {
    id: comps.map((c) => c.id).join('+'),
    name: labels.length ? name : `Standard ${FAMILY_NAMES[family]}`,
    family,
    stats,
    parts: comps.filter((c) => c !== magazine).flatMap((c) => c.parts),
    magazine: magazine.parts,
    muzzle: MUZZLE[family],
    sightHeight: SIGHT_HEIGHT[family],
    components: comps.map((c) => c.id),
  };
}
