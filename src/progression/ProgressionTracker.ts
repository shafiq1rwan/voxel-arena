import type { EventBus, GameEvents } from '../core/EventBus';
import { AchievementManager, type AchievementDef } from './Achievements';
import type { SaveManager } from './SaveManager';
import { SKINS, SKIN_ORDER, type SkinDef } from './Skins';
import { UnlockManager } from './UnlockManager';

/**
 * Glue between gameplay events and persistent progression: feeds achievement progress from real
 * events (never timers), pays Scrap rewards, unlocks skins and saves.
 */
export class ProgressionTracker {
  readonly achievements: AchievementManager;
  readonly unlocks: UnlockManager;
  /** Achievements unlocked during the current run (for the results screen). */
  readonly unlockedThisRun: AchievementDef[] = [];
  /** Set when the player used the rewarded revive this run (Golden Survivor rule). */
  revivedThisRun = false;

  constructor(
    private save: SaveManager,
    private bus: EventBus<GameEvents>,
  ) {
    this.achievements = new AchievementManager(save.data.achievements);
    this.unlocks = new UnlockManager(
      save.data.unlocks,
      () => this.save.data.scrap,
      (n) => {
        this.save.data.scrap -= n;
      },
    );

    bus.on('enemy:killed', (e) => {
      this.check(this.achievements.add('firstBlood', 1));
      this.check(this.achievements.add('exterminator', 1));
      if (e.weaponFamily === 'shotgun') this.check(this.achievements.add('shotgunMaster', 1));
      if (e.headshot) this.check(this.achievements.add('sharpshooter', 1));
      if (e.archetype === 'boss') {
        this.check(this.achievements.add('arenaChampion', 1));
        if (!this.revivedThisRun) this.check(this.achievements.add('goldenSurvivor', 1));
      }
    });
    bus.on('wave:completed', (e) => {
      this.check(this.achievements.reach('survivor', e.wave));
      this.check(this.achievements.reach('veteran', e.wave));
    });
    bus.on('weapon:lightning', (e) => this.check(this.achievements.add('electricStorm', e.hits)));
  }

  startRun(): void {
    this.unlockedThisRun.length = 0;
    this.revivedThisRun = false;
  }

  /** Explorer counts distinct arena seeds played (recorded by SaveManager.recordRun). */
  recordArenas(): void {
    this.check(this.achievements.reach('explorer', this.save.data.arenasPlayed.length));
  }

  private check(def: AchievementDef | null): void {
    if (!def) return;
    this.save.data.scrap += def.scrap;
    if (def.id === 'arenaChampion') this.unlocks.grant('mode_endless');
    this.unlockedThisRun.push(def);
    this.save.save();
    this.bus.emit('achievement:unlocked', { id: def.id, name: def.name, scrap: def.scrap });
  }

  skinUnlocked(skin: SkinDef): boolean {
    return !skin.achievement || this.achievements.isUnlocked(skin.achievement);
  }

  skinForAchievement(id: string): SkinDef | undefined {
    return SKIN_ORDER.map((k) => SKINS[k]!).find((s) => s.achievement === id);
  }

  equipSkin(id: string): boolean {
    const skin = SKINS[id];
    if (!skin || !this.skinUnlocked(skin)) return false;
    this.save.data.equippedSkin = id;
    this.save.save();
    this.bus.emit('skin:equipped', { id });
    return true;
  }

  purchase(id: string, cost: number): boolean {
    if (!this.unlocks.purchase(id)) return false;
    this.save.save();
    this.bus.emit('unlock:purchased', { id, cost });
    return true;
  }

  /** Re-binds to the save's arrays/objects after a reload or reset. */
  rebind(): void {
    this.achievements.setStore(this.save.data.achievements);
    this.unlocks.setOwned(this.save.data.unlocks);
  }
}
