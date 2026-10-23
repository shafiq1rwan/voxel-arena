import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/core/SeededRandom';
import { segmentCapsuleHit } from '../src/combat/ProjectileSystem';
import { ARCHETYPES } from '../src/enemies/EnemyTypes';
import { UpgradeManager } from '../src/upgrades/UpgradeManager';
import { UPGRADES, type UpgradeId } from '../src/upgrades/UpgradeTypes';
import { composeWave, waveBudget } from '../src/waves/ThreatBudget';

describe('Wave composition table', () => {
  it('waves 1-2 are chasers only', () => {
    for (const w of [1, 2]) for (let s = 0; s < 20; s++) expect(composeWave(w, new SeededRandom(s)).every((id) => id === 'chaser')).toBe(true);
  });

  it('wave 3 introduces shooters and wave 4 mixes them in', () => {
    for (let s = 0; s < 20; s++) {
      expect(composeWave(3, new SeededRandom(s)).filter((id) => id === 'shooter').length).toBeGreaterThanOrEqual(2);
      expect(composeWave(4, new SeededRandom(s)).filter((id) => id === 'shooter').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('opens every wave with melee spawns and spends exactly the budget', () => {
    for (let w = 1; w <= 12; w++) {
      const list = composeWave(w, new SeededRandom(w * 31));
      expect(list.slice(0, 3).every((id) => id === 'chaser')).toBe(true);
      expect(list.reduce((sum, id) => sum + ARCHETYPES[id].threatCost, 0)).toBe(waveBudget(w));
    }
  });

  it('is deterministic per seed', () => {
    expect(composeWave(5, new SeededRandom(9))).toEqual(composeWave(5, new SeededRandom(9)));
  });
});

describe('UpgradeManager', () => {
  it('offers three distinct eligible upgrades', () => {
    const m = new UpgradeManager();
    for (let s = 0; s < 50; s++) {
      const offer = m.offer(new SeededRandom(s));
      expect(offer).toHaveLength(3);
      expect(new Set(offer.map((d) => d.id)).size).toBe(3);
    }
  });

  it('respects stacking caps and never offers a maxed upgrade', () => {
    const m = new UpgradeManager();
    expect(m.choose('lastStand')).toBe(true);
    expect(m.choose('lastStand')).toBe(false);
    for (let s = 0; s < 100; s++) expect(m.offer(new SeededRandom(s)).some((d) => d.id === 'lastStand')).toBe(false);
  });

  it('runs out of offers only when everything is maxed', () => {
    const m = new UpgradeManager();
    for (const def of Object.values(UPGRADES)) for (let i = 0; i < def.maxStacks; i++) m.choose(def.id);
    expect(m.offer(new SeededRandom(1))).toHaveLength(0);
  });

  it('turns stacks into the specified gameplay modifiers', () => {
    const m = new UpgradeManager();
    const take = (id: UpgradeId, n = 1) => {
      for (let i = 0; i < n; i++) m.choose(id);
    };
    take('heavyRounds', 2);
    take('rapidFire');
    take('criticalPrecision');
    take('piercingShots');
    take('expandedMagazine');
    take('swiftReload');
    take('quickFeet');
    take('dashCharge');
    take('reinforcedArmor');
    take('regeneration');
    take('lastStand');
    take('explosiveKills');
    const mod = m.modifiers;
    expect(mod.damageMul).toBeCloseTo(1.3);
    expect(mod.fireRateMul).toBeCloseTo(1.15);
    expect(mod.critAdd).toBeCloseTo(0.1);
    expect(mod.pierce).toBe(1);
    expect(mod.magazineMul).toBeCloseTo(1.3);
    expect(mod.reloadMul).toBeCloseTo(0.8);
    expect(mod.moveMul).toBeCloseTo(1.1);
    expect(mod.dash).toBe(true);
    expect(mod.maxHealthAdd).toBe(20);
    expect(mod.regenPer10s).toBe(2);
    expect(mod.lastStandPerWave).toBe(1);
    expect(mod.explosiveLevel).toBe(1);
    expect(m.owned.map((o) => o.def.id)[0]).toBe('heavyRounds');
  });

  it('produces the same offers for the same seed', () => {
    const a = new UpgradeManager().offer(new SeededRandom(77)).map((d) => d.id);
    const b = new UpgradeManager().offer(new SeededRandom(77)).map((d) => d.id);
    expect(a).toEqual(b);
  });
});

describe('Projectile vs player capsule', () => {
  it('hits a bolt passing through the capsule and misses one passing beside it', () => {
    // Player axis at x=0,z=0 from y=0.25 to 1.65, radius 0.42; bolt travels along +x at chest height.
    expect(segmentCapsuleHit(-1, 1.1, 0, 2, 0, 0, 0, 0.25, 1.65, 0, 0.42)).toBeGreaterThan(0);
    expect(segmentCapsuleHit(-1, 1.1, 1, 2, 0, 0, 0, 0.25, 1.65, 0, 0.42)).toBe(-1);
    // Over the player's head.
    expect(segmentCapsuleHit(-1, 2.6, 0, 2, 0, 0, 0, 0.25, 1.65, 0, 0.42)).toBe(-1);
    // Segment that stops short.
    expect(segmentCapsuleHit(-3, 1.1, 0, 1, 0, 0, 0, 0.25, 1.65, 0, 0.42)).toBe(-1);
  });
});
