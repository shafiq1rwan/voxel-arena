import type { SeededRandom } from '../core/SeededRandom';
import { RARITY_WEIGHT, UPGRADES, baseModifiers, type UpgradeDef, type UpgradeId, type UpgradeModifiers } from './UpgradeTypes';

export interface OwnedUpgrade {
  def: UpgradeDef;
  stacks: number;
}

/**
 * Tracks the run's upgrade build: offers eligible choices with weighted, category-diverse
 * selection, applies stacking caps, and folds everything into one UpgradeModifiers object.
 * Pure logic — no scene or UI access — so offers and builds are unit-testable and seed-stable.
 */
export class UpgradeManager {
  private stacks = new Map<UpgradeId, number>();
  /** Order upgrades were first taken (for display). */
  private order: UpgradeId[] = [];
  private mods: UpgradeModifiers = baseModifiers();

  reset(): void {
    this.stacks.clear();
    this.order = [];
    this.mods = baseModifiers();
  }

  stacksOf(id: UpgradeId): number {
    return this.stacks.get(id) ?? 0;
  }

  get modifiers(): Readonly<UpgradeModifiers> {
    return this.mods;
  }

  get owned(): OwnedUpgrade[] {
    return this.order.map((id) => ({ def: UPGRADES[id], stacks: this.stacksOf(id) }));
  }

  isEligible(def: UpgradeDef): boolean {
    if (this.stacksOf(def.id) >= def.maxStacks) return false;
    for (const ex of def.excludes ?? []) if (this.stacksOf(ex) > 0) return false;
    for (const [id] of this.stacks) if (UPGRADES[id].excludes?.includes(def.id)) return false;
    return true;
  }

  /**
   * Offers up to `count` distinct eligible upgrades. Weighted by rarity; once a category has been
   * offered, the remaining cards of that category are down-weighted so offers stay varied.
   */
  offer(rng: SeededRandom, count = 3): UpgradeDef[] {
    const pool = Object.values(UPGRADES).filter((d) => this.isEligible(d));
    const offered: UpgradeDef[] = [];
    const categoryCount: Record<string, number> = {};
    while (offered.length < count && pool.length > 0) {
      const pick = rng.weighted(pool, (d) => RARITY_WEIGHT[d.rarity] / (1 + 2 * (categoryCount[d.category] ?? 0)));
      offered.push(pick);
      categoryCount[pick.category] = (categoryCount[pick.category] ?? 0) + 1;
      pool.splice(pool.indexOf(pick), 1);
    }
    return offered;
  }

  /** Takes one stack of an upgrade. Returns false if it was not eligible. */
  choose(id: UpgradeId): boolean {
    const def = UPGRADES[id];
    if (!this.isEligible(def)) return false;
    if (!this.stacks.has(id)) this.order.push(id);
    this.stacks.set(id, this.stacksOf(id) + 1);
    this.mods = this.compute();
    return true;
  }

  private compute(): UpgradeModifiers {
    const m = baseModifiers();
    const n = (id: UpgradeId) => this.stacksOf(id);
    m.damageMul = 1 + 0.15 * n('heavyRounds');
    m.fireRateMul = 1 + 0.15 * n('rapidFire');
    m.critAdd = 0.1 * n('criticalPrecision');
    m.pierce = n('piercingShots');
    m.magazineMul = 1 + 0.3 * n('expandedMagazine');
    m.reloadMul = Math.pow(0.8, n('swiftReload'));
    m.moveMul = 1 + 0.1 * n('quickFeet');
    m.dash = n('dashCharge') > 0;
    m.maxHealthAdd = 20 * n('reinforcedArmor');
    m.regenPer10s = 2 * n('regeneration');
    m.lastStandPerWave = n('lastStand');
    m.explosiveLevel = n('explosiveKills');
    return m;
  }
}
