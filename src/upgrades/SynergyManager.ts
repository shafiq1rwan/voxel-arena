import type { UpgradeId } from './UpgradeTypes';

export type MutationId = 'volatileRounds' | 'deadeye' | 'phantomStep' | 'juggernaut';

export interface MutationDef {
  id: MutationId;
  name: string;
  description: string;
  /** Required upgrade stacks. */
  requires: Partial<Record<UpgradeId, number>>;
  /** Changes the weapon itself (visible glow + name prefix). */
  weapon: boolean;
}

/**
 * Upgrade synergies ("mutations"). When the build contains the required upgrades, the mutation
 * activates automatically. Weapon mutations visibly change the gun (glow colour, energy fins and
 * a name prefix) and add a new gameplay rule rather than another flat stat bonus.
 */
export const MUTATIONS: Record<MutationId, MutationDef> = {
  volatileRounds: {
    id: 'volatileRounds',
    name: 'Volatile Rounds',
    description: 'Every 8th consecutive hit detonates on the target.',
    requires: { rapidFire: 1, explosiveKills: 1 },
    weapon: true,
  },
  deadeye: {
    id: 'deadeye',
    name: 'Deadeye',
    description: 'Critical hits deal +50% more and punch through an extra enemy.',
    requires: { criticalPrecision: 2, piercingShots: 1 },
    weapon: true,
  },
  phantomStep: {
    id: 'phantomStep',
    name: 'Phantom Step',
    description: 'Dash recharges 40% faster and reloads a quarter of your magazine.',
    requires: { dashCharge: 1, quickFeet: 1 },
    weapon: false,
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    description: 'Regeneration doubled and 15% less damage taken.',
    requires: { reinforcedArmor: 2, regeneration: 1 },
    weapon: false,
  },
};

export class SynergyManager {
  private active = new Set<MutationId>();

  reset(): void {
    this.active.clear();
  }

  has(id: MutationId): boolean {
    return this.active.has(id);
  }

  get list(): MutationDef[] {
    return [...this.active].map((id) => MUTATIONS[id]);
  }

  /** Re-evaluates against current stacks; returns mutations that just activated. */
  evaluate(stacksOf: (id: UpgradeId) => number): MutationDef[] {
    const fresh: MutationDef[] = [];
    for (const m of Object.values(MUTATIONS)) {
      if (this.active.has(m.id)) continue;
      const ok = (Object.entries(m.requires) as [UpgradeId, number][]).every(([u, n]) => stacksOf(u) >= n);
      if (ok) {
        this.active.add(m.id);
        fresh.push(m);
      }
    }
    return fresh;
  }

  /**
   * Weight bonus for an upgrade that would move the build toward an unfinished mutation, so
   * offers "support upgrade synergies" without forcing them.
   */
  synergyWeight(id: UpgradeId, stacksOf: (id: UpgradeId) => number): number {
    let bonus = 1;
    for (const m of Object.values(MUTATIONS)) {
      if (this.active.has(m.id)) continue;
      const need = m.requires[id];
      if (need === undefined || stacksOf(id) >= need) continue;
      // Partially built mutation: favour its missing pieces more strongly.
      const owned = (Object.entries(m.requires) as [UpgradeId, number][]).some(([u]) => u !== id && stacksOf(u) > 0);
      bonus *= owned ? 1.8 : 1.15;
    }
    return bonus;
  }
}
