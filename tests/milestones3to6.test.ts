import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/core/SeededRandom';
import { BASE_STATS, createWeapon } from '../src/procedural/WeaponGenerator';
import { generateEnemyLook } from '../src/procedural/EnemyGenerator';
import { AchievementManager } from '../src/progression/Achievements';
import { defaultSave, sanitizeSave } from '../src/progression/SaveManager';
import { SKINS } from '../src/progression/Skins';
import { UnlockManager, scrapForRun } from '../src/progression/UnlockManager';
import { SynergyManager } from '../src/upgrades/SynergyManager';
import type { UpgradeId } from '../src/upgrades/UpgradeTypes';
import { FINAL_WAVE, composeWave, spentThreat, waveBudget } from '../src/waves/ThreatBudget';

describe('Procedural weapons (Milestone 3)', () => {
  it('is deterministic per seed', () => {
    const a = createWeapon('rifle', new SeededRandom(42), { modules: ['energy', 'explosive', 'freeze'] });
    const b = createWeapon('rifle', new SeededRandom(42), { modules: ['energy', 'explosive', 'freeze'] });
    expect(a.id).toBe(b.id);
    expect(a.stats).toEqual(b.stats);
    expect(a.parts).toEqual(b.parts);
  });

  it('produces visibly different weapons with derived names', () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const partCounts = new Set<number>();
    for (let s = 0; s < 80; s++) {
      const w = createWeapon('rifle', new SeededRandom(s), { modules: ['energy', 'explosive', 'freeze'] });
      ids.add(w.id);
      names.add(w.name);
      partCounts.add(w.parts.length + w.magazine.length);
      if (w.module === 'explosive') expect(w.name.startsWith('Volatile')).toBe(true);
      if (w.module === 'energy') expect(w.name.startsWith('Arc')).toBe(true);
    }
    expect(ids.size).toBeGreaterThan(20);
    expect(names.size).toBeGreaterThan(6);
    expect(partCounts.size).toBeGreaterThan(4);
  });

  it('respects compatibility rules and stat caps', () => {
    for (let s = 0; s < 200; s++) {
      const w = createWeapon('shotgun', new SeededRandom(s), { modules: ['energy'] });
      expect(w.components).not.toContain('mag_drum');
      expect(w.components).not.toContain('sight_scope');
      for (const f of ['rifle', 'shotgun', 'smg'] as const) {
        const x = createWeapon(f, new SeededRandom(s), { modules: ['energy', 'explosive', 'freeze'] });
        expect(x.stats.fireRate).toBeLessThanOrEqual(16);
        expect(x.stats.reloadTime).toBeGreaterThanOrEqual(0.6);
        expect(x.stats.magazineSize).toBeLessThanOrEqual(90);
      }
    }
  });

  it('never rolls a locked module and keeps the standard baseline stats', () => {
    for (let s = 0; s < 100; s++) expect(createWeapon('smg', new SeededRandom(s), { modules: [] }).module).toBeNull();
    expect(createWeapon('rifle').stats).toEqual(BASE_STATS.rifle);
  });

  it('skins are purely cosmetic (no stat fields)', () => {
    const statKeys = Object.keys(BASE_STATS.rifle);
    for (const skin of Object.values(SKINS)) for (const k of Object.keys(skin)) expect(statKeys).not.toContain(k);
  });
});

describe('Enemies & waves (Milestone 4)', () => {
  it('follows the 10-wave table', () => {
    const rng = (w: number) => new SeededRandom(w * 7);
    expect(composeWave(5, rng(5)).some((e) => e.elite)).toBe(true);
    expect(composeWave(6, rng(6)).some((e) => e.id === 'tank')).toBe(true);
    expect(composeWave(9, rng(9)).filter((e) => e.elite).length).toBeGreaterThanOrEqual(2);
    const boss = composeWave(FINAL_WAVE, rng(10));
    expect(boss[0]).toEqual({ id: 'boss', elite: false });
    expect(boss.filter((e) => e.id === 'boss')).toHaveLength(1);
  });

  it('spends the threat budget exactly, including elite surcharges', () => {
    for (let w = 1; w <= 9; w++) for (let s = 0; s < 10; s++) expect(spentThreat(composeWave(w, new SeededRandom(s)))).toBe(waveBudget(w));
  });

  it('gives tanks, elites and the boss distinct silhouettes', () => {
    const rng = new SeededRandom(3);
    const chaser = generateEnemyLook('chaser', rng);
    const tank = generateEnemyLook('tank', rng);
    const elite = generateEnemyLook('chaser', rng, true);
    const boss = generateEnemyLook('boss', rng);
    expect(tank.scale).toBeGreaterThan(chaser.scale * 1.25);
    expect(tank.coreSize).toBeGreaterThan(2);
    expect(elite.elite && elite.horns && elite.armor).toBe(true);
    expect(boss.scale).toBeGreaterThan(2);
  });
});

describe('Progression (Milestone 4)', () => {
  it('unlocks achievements from progress and only once', () => {
    const store = {};
    const m = new AchievementManager(store);
    expect(m.add('firstBlood', 1)?.id).toBe('firstBlood');
    expect(m.add('firstBlood', 1)).toBeNull();
    expect(m.reach('survivor', 2)).toBeNull();
    expect(m.reach('survivor', 3)?.id).toBe('survivor');
    for (let i = 0; i < 249; i++) m.add('exterminator', 1);
    expect(m.status('exterminator').unlocked).toBe(false);
    expect(m.nearest(1)[0]?.def.id).toBe('exterminator');
    expect(m.add('exterminator', 1)?.id).toBe('exterminator');
  });

  it('buys unlocks with Scrap and computes run rewards', () => {
    let scrap = 50;
    const owned: string[] = [];
    const u = new UnlockManager(owned, () => scrap, (n) => (scrap -= n));
    expect(u.has('weapon_rifle')).toBe(true);
    expect(u.purchase('weapon_shotgun')).toBe(true);
    expect(scrap).toBe(10);
    expect(u.purchase('weapon_smg')).toBe(false);
    expect(u.themePool()).toEqual(['ruins', 'industrial']);
    expect(scrapForRun(10, 100, true)).toBe(5 + 30 + 5 + 15);
    expect(scrapForRun(4, 40, false)).toBe(5 + 12 + 2);
    expect(scrapForRun(4, 40, false, ['mod_swarm'])).toBe(Math.round(19 * 1.5));
  });

  it('migrates version-1 saves and survives corrupted data', () => {
    const v1 = { version: 1, settings: { mouseSensitivity: 2, fov: 80, quality: 'high' }, records: { bestWave: 7, totalKills: 300 }, arenasPlayed: [1, 2] };
    const s = sanitizeSave(v1);
    expect(s.version).toBe(2);
    expect(s.settings.mouseSensitivity).toBe(2);
    expect(s.settings.cameraShake).toBe(1);
    expect(s.records.bestWave).toBe(7);
    expect(s.scrap).toBe(0);
    expect(s.loadout.family).toBe('rifle');
    expect(sanitizeSave('garbage')).toEqual(defaultSave());
    expect(sanitizeSave({ scrap: -5, settings: { fov: 9999 } }).settings.fov).toBe(100);
  });
});

describe('Synergies (Milestone 4)', () => {
  it('activates mutations when the build qualifies and favours missing pieces', () => {
    const stacks: Partial<Record<UpgradeId, number>> = { rapidFire: 1 };
    const of = (id: UpgradeId) => stacks[id] ?? 0;
    const s = new SynergyManager();
    expect(s.evaluate(of)).toHaveLength(0);
    expect(s.synergyWeight('explosiveKills', of)).toBeGreaterThan(1.5);
    stacks.explosiveKills = 1;
    expect(s.evaluate(of).map((m) => m.id)).toEqual(['volatileRounds']);
    expect(s.evaluate(of)).toHaveLength(0);
    expect(s.has('volatileRounds')).toBe(true);
  });
});
