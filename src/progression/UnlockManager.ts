import type { ThemeId } from '../procedural/ArenaTypes';

export type UnlockCategory = 'weapon' | 'ability' | 'module' | 'theme' | 'modifier' | 'mode';

export interface UnlockDef {
  id: string;
  name: string;
  description: string;
  category: UnlockCategory;
  cost: number;
}

/**
 * Between-run unlocks bought with Scrap. These add variety rather than raw power, so a first-time
 * player gets the complete core game (rifle, energy module, two fortress themes, every upgrade).
 */
export const UNLOCKS: UnlockDef[] = [
  { id: 'weapon_shotgun', name: 'Shotgun family', description: 'Start runs with a shotgun: 7 pellets, brutal up close.', category: 'weapon', cost: 40 },
  { id: 'weapon_smg', name: 'SMG family', description: 'Start runs with an SMG: 10 shots per second.', category: 'weapon', cost: 40 },
  { id: 'ability_grenade', name: 'Frag Grenade', description: 'Throw a grenade with G (8 s cooldown).', category: 'ability', cost: 60 },
  { id: 'ability_dash', name: 'Starting Dash', description: 'Begin every run with Dash Charge already unlocked.', category: 'ability', cost: 50 },
  { id: 'module_explosive', name: 'Explosive module', description: 'Weapons may roll a module that blows up kills.', category: 'module', cost: 30 },
  { id: 'module_freeze', name: 'Freeze module', description: 'Weapons may roll a module that slows enemies.', category: 'module', cost: 30 },
  { id: 'theme_frozen', name: 'Frostspire Keep', description: 'Adds the frozen fortress to the arena rotation.', category: 'theme', cost: 25 },
  { id: 'theme_neon', name: 'Neon Citadel', description: 'Adds the neon fortress to the arena rotation.', category: 'theme', cost: 25 },
  { id: 'mod_glass', name: 'Glass Cannon', description: 'Challenge: deal and take +50% damage. +40% Scrap.', category: 'modifier', cost: 30 },
  { id: 'mod_swarm', name: 'Swarm', description: 'Challenge: +50% enemies per wave. +50% Scrap.', category: 'modifier', cost: 30 },
  { id: 'mod_ironman', name: 'Iron Man', description: 'Challenge: no health pickups or regeneration. +60% Scrap.', category: 'modifier', cost: 40 },
  { id: 'mode_endless', name: 'Endless Survival', description: 'Keep fighting after the boss. Free once you become Arena Champion.', category: 'mode', cost: 80 },
];

/** Always available without spending anything. */
export const BASE_UNLOCKS = ['weapon_rifle', 'module_energy', 'theme_ruins', 'theme_industrial'];

export const MODIFIER_SCRAP_BONUS: Record<string, number> = { mod_glass: 0.4, mod_swarm: 0.5, mod_ironman: 0.6 };

export class UnlockManager {
  constructor(
    private owned: string[],
    private getScrap: () => number,
    private spendScrap: (n: number) => void,
  ) {}

  setOwned(owned: string[]): void {
    this.owned = owned;
  }

  has(id: string): boolean {
    return BASE_UNLOCKS.includes(id) || this.owned.includes(id);
  }

  /** Grants an unlock without spending Scrap (e.g. from an achievement). */
  grant(id: string): boolean {
    if (this.has(id)) return false;
    this.owned.push(id);
    return true;
  }

  canAfford(def: UnlockDef): boolean {
    return !this.has(def.id) && this.getScrap() >= def.cost;
  }

  purchase(id: string): boolean {
    const def = UNLOCKS.find((u) => u.id === id);
    if (!def || !this.canAfford(def)) return false;
    this.spendScrap(def.cost);
    this.owned.push(id);
    return true;
  }

  themePool(): ThemeId[] {
    return (['ruins', 'industrial', 'frozen', 'neon'] as ThemeId[]).filter((t) => this.has(`theme_${t}`));
  }

  modulePool(): ('energy' | 'explosive' | 'freeze')[] {
    return (['energy', 'explosive', 'freeze'] as const).filter((m) => this.has(`module_${m}`));
  }

  familyUnlocked(family: string): boolean {
    return this.has(`weapon_${family}`);
  }
}

/** Scrap = 5 + 3·completedWaves + floor(kills / 20) + victoryBonus(15), scaled by challenge modifiers. */
export function scrapForRun(completedWaves: number, kills: number, victory: boolean, modifiers: string[] = []): number {
  const base = 5 + 3 * completedWaves + Math.floor(kills / 20) + (victory ? 15 : 0);
  const bonus = modifiers.reduce((sum, m) => sum + (MODIFIER_SCRAP_BONUS[m] ?? 0), 0);
  return Math.round(base * (1 + bonus));
}
