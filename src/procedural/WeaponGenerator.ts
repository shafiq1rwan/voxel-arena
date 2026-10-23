import type { SeededRandom } from '../core/SeededRandom';
import { MODULE_INFO, type ModuleId, type WeaponDefinition, type WeaponFamily, type WeaponPart, type WeaponStats } from '../combat/WeaponTypes';

/**
 * Modular weapon assembly. A weapon = family base stats + receiver + barrel + magazine + stock +
 * sight + optional special module. Component pools are picked with a seeded RNG under family
 * compatibility rules; each component contributes visible geometry and stat modifiers.
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
    adsZoom: 0.2,
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
    adsZoom: 0.2,
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
    adsZoom: 0.2,
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
/** Barrel bore thickness per family, used to size procedural barrel attachments. */
const BORE: Record<WeaponFamily, number> = { rifle: 0.034, shotgun: 0.05, smg: 0.03 };

// ------------------------------------------------------------------ component variants

interface Variant {
  id: string;
  /** Word used in the generated name ('' = standard). */
  label: string;
  /** Display name for UI lists. */
  name: string;
  weight: number;
  /** Families this variant is compatible with (default: all). */
  families?: WeaponFamily[];
  modify?: (s: WeaponStats, family: WeaponFamily) => void;
  /** Extra / replacement geometry built from the family's standard parts. */
  parts: (family: WeaponFamily, standard: WeaponPart[]) => WeaponPart[];
  /** Forward shift of the muzzle point (metres). */
  muzzleShift?: number;
  /** Sight-line height override (for sights). */
  sightHeight?: (family: WeaponFamily) => number;
}

const keep = (_f: WeaponFamily, standard: WeaponPart[]) => standard;

const BARREL_VARIANTS: Variant[] = [
  { id: 'barrel_standard', label: '', name: 'Standard barrel', weight: 3, parts: keep },
  {
    id: 'barrel_long',
    label: 'Marksman',
    name: 'Long barrel (accuracy, range)',
    weight: 2,
    modify: (s) => {
      s.spreadHip *= 0.75;
      s.spreadAds *= 0.6;
      s.range += 30;
      s.falloffStart *= 1.4;
      s.recoilPitch *= 0.9;
    },
    parts: (f, std) => {
      const [, y, z] = MUZZLE[f];
      const b = BORE[f];
      return [...std, box([0, y, z + 0.07], [b, b, 0.14], 'dark'), box([0, y, z + 0.15], [b * 1.5, b * 1.5, 0.03], 'accent')];
    },
    muzzleShift: 0.16,
  },
  {
    id: 'barrel_heavy',
    label: 'Heavy',
    name: 'Heavy barrel (+25% damage, slower)',
    weight: 2,
    modify: (s, f) => {
      if (f === 'shotgun') {
        // Slug barrel: fewer, heavier, tighter pellets.
        s.pellets = 4;
        s.damage *= 1.6;
        s.spreadHip *= 0.6;
        s.spreadAds *= 0.6;
      } else {
        s.damage *= 1.25;
        s.fireRate *= 0.85;
      }
      s.recoilPitch *= 1.3;
    },
    parts: (f, std) => {
      const [, y, z] = MUZZLE[f];
      const b = BORE[f];
      return [...std, box([0, y, z - 0.08], [b * 2.3, b * 2.3, 0.14], 'secondary'), box([0, y, z + 0.03], [b * 2.7, b * 1.8, 0.06], 'accent'), box([0, y, z + 0.03], [b * 1.2, b * 2.4, 0.02], 'dark')];
    },
    muzzleShift: 0.05,
  },
  {
    id: 'barrel_rapid',
    label: 'Rapid',
    name: 'Rapid barrel (+20% fire rate)',
    weight: 2,
    modify: (s) => {
      s.fireRate *= 1.2;
      s.damage *= 0.88;
      s.bloomPerShot *= 1.25;
    },
    parts: (f, std) => {
      const [, y, z] = MUZZLE[f];
      const b = BORE[f];
      const fins: WeaponPart[] = [];
      for (let k = 0; k < 4; k++) fins.push(box([0, y, z - 0.16 + k * 0.045], [b * 2.6, b * 2.6, 0.012], 'accent'));
      return [...std, ...fins];
    },
  },
];

/** Stretches magazine parts downward (taller magazine). */
const stretchDown = (parts: WeaponPart[], k: number): WeaponPart[] =>
  parts.map((p) => box([p.c[0], p.c[1] - (p.s[1] * (k - 1)) / 2 - (p.c[1] < -0.1 ? p.s[1] * (k - 1) * 0.3 : 0), p.c[2]], [p.s[0], p.s[1] * k, p.s[2]], p.slot));

const MAG_VARIANTS: Variant[] = [
  { id: 'mag_standard', label: '', name: 'Standard magazine', weight: 3, parts: keep },
  {
    id: 'mag_extended',
    label: 'Extended',
    name: 'Extended magazine (+40% capacity)',
    weight: 2,
    modify: (s) => {
      s.magazineSize = Math.ceil(s.magazineSize * 1.4);
      s.reloadTime *= 1.1;
    },
    parts: (f, std) => (f === 'shotgun' ? std.map((p) => box([p.c[0], p.c[1], p.c[2] + 0.04], [p.s[0], p.s[1], p.s[2] * 1.45], p.slot)) : stretchDown(std, 1.4)),
  },
  {
    id: 'mag_drum',
    label: 'Drum',
    name: 'Drum magazine (+80% capacity, slow reload)',
    weight: 1,
    families: ['rifle', 'smg'],
    modify: (s) => {
      s.magazineSize = Math.ceil(s.magazineSize * 1.8);
      s.reloadTime *= 1.35;
    },
    parts: (_f, std) => {
      const first = std[0]!;
      const y = first.c[1] - 0.02;
      const z = first.c[2];
      return [box([0, y, z], [0.1, 0.13, 0.12], 'secondary'), box([0, y, z], [0.104, 0.05, 0.124], 'accent'), box([0, y + 0.07, z], [0.05, 0.03, 0.06], 'dark')];
    },
  },
  {
    id: 'mag_quick',
    label: 'Quickload',
    name: 'Quick magazine (−28% reload, smaller)',
    weight: 2,
    modify: (s) => {
      s.magazineSize = Math.max(2, Math.floor(s.magazineSize * 0.85));
      s.reloadTime *= 0.72;
    },
    parts: (_f, std) => {
      const first = std[0]!;
      return [...std, box([0, first.c[1], first.c[2]], [first.s[0] + 0.008, 0.02, first.s[2] + 0.008], 'accent')];
    },
  },
];

const STOCK_VARIANTS: Variant[] = [
  { id: 'stock_standard', label: '', name: 'Standard stock', weight: 3, parts: keep },
  {
    id: 'stock_steady',
    label: 'Steady',
    name: 'Steady stock (−30% recoil)',
    weight: 2,
    modify: (s) => {
      s.recoilPitch *= 0.7;
      s.recoilYaw *= 0.7;
    },
    parts: (_f, std) => [...std.map((p) => box([p.c[0], p.c[1] - 0.005, p.c[2] - 0.02], [p.s[0] * 1.15, p.s[1] * 1.2, p.s[2] * 1.15], p.slot)), box([0, -0.07, -0.24], [0.05, 0.05, 0.08], 'dark')],
  },
  {
    id: 'stock_light',
    label: 'Light',
    name: 'Light stock (faster reload, more recoil)',
    weight: 2,
    modify: (s) => {
      s.reloadTime *= 0.9;
      s.recoilPitch *= 1.15;
    },
    parts: () => [box([0, 0.02, -0.18], [0.02, 0.02, 0.2], 'dark'), box([0, -0.05, -0.18], [0.02, 0.02, 0.2], 'dark'), box([0, -0.015, -0.28], [0.03, 0.1, 0.025], 'accent')],
  },
];

const SIGHT_VARIANTS: Variant[] = [
  { id: 'sight_standard', label: '', name: 'Standard sight', weight: 3, parts: keep },
  {
    id: 'sight_scope',
    label: 'Scoped',
    name: 'Scope (tight aim, more zoom)',
    weight: 1,
    families: ['rifle'],
    modify: (s) => {
      s.spreadAds *= 0.5;
      s.adsZoom = 0.42;
    },
    parts: () => [
      box([0, 0.084, 0], [0.062, 0.02, 0.1], 'dark'),
      box([0, 0.128, 0.01], [0.05, 0.05, 0.22], 'dark'),
      box([0, 0.128, 0.125], [0.058, 0.058, 0.02], 'accent'),
      box([0, 0.128, -0.105], [0.056, 0.056, 0.02], 'accent'),
      box([0, 0.128, 0.137], [0.03, 0.03, 0.004], 'emissive'),
    ],
    sightHeight: () => 0.128,
  },
  {
    id: 'sight_holo',
    label: '',
    name: 'Holo sight (steadier aim)',
    weight: 2,
    families: ['rifle', 'smg'],
    modify: (s) => {
      s.spreadAds *= 0.85;
    },
    parts: (f) => {
      const y = SIGHT_HEIGHT[f] - 0.03;
      return [box([0, y, 0.01], [0.06, 0.02, 0.09], 'dark'), box([-0.028, y + 0.035, 0.03], [0.008, 0.05, 0.01], 'secondary'), box([0.028, y + 0.035, 0.03], [0.008, 0.05, 0.01], 'secondary'), box([0, y + 0.06, 0.03], [0.064, 0.008, 0.01], 'secondary'), box([0, y + 0.03, 0.03], [0.006, 0.006, 0.004], 'emissive')];
    },
    sightHeight: (f) => SIGHT_HEIGHT[f] + 0.01,
  },
];

/** Side-mounted module canister with a glowing coil (coloured by the module, not the skin). */
function moduleParts(f: WeaponFamily): WeaponPart[] {
  const z = f === 'smg' ? 0.14 : 0.2;
  return [
    box([0.065, -0.005, z], [0.03, 0.055, 0.13], 'dark'),
    box([0.075, -0.005, z], [0.012, 0.04, 0.1], 'module'),
    box([0.065, 0.028, z + 0.05], [0.026, 0.012, 0.012], 'module'),
    box([0, 0.02, MUZZLE[f][2] - 0.01], [BORE[f] * 1.4, BORE[f] * 1.4, 0.015], 'module'),
  ];
}

export interface WeaponOptions {
  /** Modules that may roll (from unlocks). Empty = never. */
  modules?: ModuleId[];
  /** Force the plain standard configuration (deterministic baseline). */
  standard?: boolean;
  /** Force a specific module (crates from elites, tests). */
  module?: ModuleId | null;
}

function pickVariant(list: Variant[], family: WeaponFamily, rng: SeededRandom): Variant {
  return rng.weighted(
    list.filter((v) => !v.families || v.families.includes(family)),
    (v) => v.weight,
  );
}

/** Stat caps so stacked components stay sensible. */
function capStats(s: WeaponStats): void {
  s.fireRate = Math.min(s.fireRate, 16);
  s.reloadTime = Math.max(0.6, s.reloadTime);
  s.magazineSize = Math.min(Math.round(s.magazineSize), 90);
  s.spreadAds = Math.max(0.0015, s.spreadAds);
  s.reserveStart = Math.round(Math.max(s.reserveStart, s.magazineSize * 4));
  s.reserveMax = Math.round(Math.max(s.reserveMax, s.magazineSize * 6));
}

/**
 * Assembles a weapon from family base stats and seeded component picks. Every component changes
 * both the model and the stats; the name is derived from the components, e.g. "Volatile Heavy Rifle".
 */
export function createWeapon(family: WeaponFamily, rng?: SeededRandom, opts: WeaponOptions = {}): WeaponDefinition {
  const plain = opts.standard || !rng;
  const barrel = plain ? BARREL_VARIANTS[0]! : pickVariant(BARREL_VARIANTS, family, rng);
  const mag = plain ? MAG_VARIANTS[0]! : pickVariant(MAG_VARIANTS, family, rng);
  const stock = plain ? STOCK_VARIANTS[0]! : pickVariant(STOCK_VARIANTS, family, rng);
  const sight = plain ? SIGHT_VARIANTS[0]! : pickVariant(SIGHT_VARIANTS, family, rng);
  let module: ModuleId | null = null;
  if (opts.module !== undefined) module = opts.module;
  else if (!plain && opts.modules?.length && rng.chance(0.45)) module = rng.pick(opts.modules);

  const stats: WeaponStats = { ...BASE_STATS[family] };
  for (const v of [barrel, mag, stock, sight]) v.modify?.(stats, family);
  capStats(stats);

  const parts = [
    ...RECEIVERS[family].parts,
    ...barrel.parts(family, BARRELS[family].parts),
    ...stock.parts(family, STOCKS[family].parts),
    ...sight.parts(family, SIGHTS[family].parts),
    ...(module ? moduleParts(family) : []),
  ];
  const magazine = mag.parts(family, MAGAZINES[family].parts);
  const muzzle = MUZZLE[family];
  const shift = barrel.muzzleShift ?? 0;

  const descriptor = [barrel, mag, sight, stock].map((v) => v.label).find(Boolean) ?? '';
  const prefix = module ? MODULE_INFO[module].prefix : '';
  const words = [prefix, descriptor, FAMILY_NAMES[family]].filter(Boolean);
  const tier = [barrel, mag, stock, sight].filter((v) => !v.id.endsWith('_standard')).length + (module ? 1 : 0);

  return {
    id: [RECEIVERS[family].id, barrel.id, mag.id, stock.id, sight.id, module ?? 'none'].join('+'),
    name: words.length > 1 ? words.join(' ') : `Standard ${FAMILY_NAMES[family]}`,
    family,
    stats,
    parts,
    magazine,
    muzzle: [muzzle[0], muzzle[1], muzzle[2] + shift],
    sightHeight: sight.sightHeight?.(family) ?? SIGHT_HEIGHT[family],
    components: [barrel.id, mag.id, stock.id, sight.id, module ? `module_${module}` : 'module_none'],
    componentNames: [barrel.name, mag.name, stock.name, sight.name, module ? MODULE_INFO[module].name : 'No module'],
    module,
    tier,
  };
}
