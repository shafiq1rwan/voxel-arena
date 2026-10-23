import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/core/SeededRandom';
import { activeEnemyCap, composeWave, spentThreat, waveBudget } from '../src/waves/ThreatBudget';
import { BASE_STATS, createWeapon } from '../src/procedural/WeaponGenerator';

describe('ThreatBudget', () => {
  it('matches the design formulas', () => {
    expect(waveBudget(1)).toBe(9);
    expect(waveBudget(5)).toBe(31);
    expect(waveBudget(10)).toBe(76);
    expect(activeEnemyCap(1)).toBe(7);
    expect(activeEnemyCap(10)).toBe(24);
    expect(activeEnemyCap(50)).toBe(24);
  });

  it('spends exactly the wave budget', () => {
    for (let w = 1; w <= 9; w++) {
      const enemies = composeWave(w, new SeededRandom(w));
      expect(spentThreat(enemies)).toBe(waveBudget(w));
    }
  });
});

describe('WeaponGenerator', () => {
  it('assembles weapons with the specified base stats and visible parts', () => {
    const rifle = createWeapon('rifle');
    expect(rifle.stats).toEqual(BASE_STATS.rifle);
    expect(rifle.stats.damage).toBe(15);
    expect(rifle.stats.fireRate).toBe(6);
    expect(rifle.stats.magazineSize).toBe(30);
    expect(rifle.stats.reloadTime).toBe(1.6);
    expect(rifle.parts.length).toBeGreaterThan(5);
    expect(rifle.magazine.length).toBeGreaterThan(0);
    expect(createWeapon('shotgun').stats.pellets).toBe(7);
    expect(createWeapon('smg').stats.fireRate).toBe(10);
  });
});
