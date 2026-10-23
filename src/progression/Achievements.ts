import type { AchievementSave } from './SaveManager';

export type AchievementId =
  | 'firstBlood'
  | 'survivor'
  | 'veteran'
  | 'arenaChampion'
  | 'exterminator'
  | 'shotgunMaster'
  | 'electricStorm'
  | 'explorer'
  | 'sharpshooter'
  | 'goldenSurvivor';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  /** Progress needed to unlock. */
  target: number;
  /** Scrap granted on unlock. */
  scrap: number;
  /** Progress counts across runs (cumulative) rather than within one run. */
  cumulative: boolean;
}

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  firstBlood: { id: 'firstBlood', name: 'First Blood', description: 'Eliminate your first enemy.', target: 1, scrap: 5, cumulative: true },
  survivor: { id: 'survivor', name: 'Survivor', description: 'Complete wave 3.', target: 3, scrap: 10, cumulative: false },
  veteran: { id: 'veteran', name: 'Veteran', description: 'Complete wave 5.', target: 5, scrap: 15, cumulative: false },
  arenaChampion: { id: 'arenaChampion', name: 'Arena Champion', description: 'Defeat the final boss.', target: 1, scrap: 40, cumulative: true },
  exterminator: { id: 'exterminator', name: 'Exterminator', description: 'Eliminate 250 enemies in total.', target: 250, scrap: 25, cumulative: true },
  shotgunMaster: { id: 'shotgunMaster', name: 'Shotgun Master', description: 'Eliminate 500 enemies using shotguns.', target: 500, scrap: 40, cumulative: true },
  electricStorm: { id: 'electricStorm', name: 'Electric Storm', description: 'Trigger 100 chain-lightning hits.', target: 100, scrap: 30, cumulative: true },
  explorer: { id: 'explorer', name: 'Explorer', description: 'Play on three different arena layouts.', target: 3, scrap: 15, cumulative: true },
  sharpshooter: { id: 'sharpshooter', name: 'Sharpshooter', description: 'Land 100 headshots.', target: 100, scrap: 30, cumulative: true },
  goldenSurvivor: { id: 'goldenSurvivor', name: 'Golden Survivor', description: 'Defeat the final boss without being revived.', target: 1, scrap: 60, cumulative: true },
};

export const ACHIEVEMENT_ORDER: AchievementId[] = [
  'firstBlood',
  'survivor',
  'veteran',
  'exterminator',
  'sharpshooter',
  'explorer',
  'electricStorm',
  'shotgunMaster',
  'arenaChampion',
  'goldenSurvivor',
];

export interface AchievementStatus {
  def: AchievementDef;
  progress: number;
  unlocked: boolean;
}

/**
 * Tracks achievement progress from real gameplay events and persists it in the save.
 * Pure logic: callers feed events in and receive the list of newly unlocked achievements.
 */
export class AchievementManager {
  constructor(private store: Record<string, AchievementSave>) {}

  setStore(store: Record<string, AchievementSave>): void {
    this.store = store;
  }

  status(id: AchievementId): AchievementStatus {
    const s = this.store[id] ?? { progress: 0, unlocked: false };
    return { def: ACHIEVEMENTS[id], progress: s.progress, unlocked: s.unlocked };
  }

  all(): AchievementStatus[] {
    return ACHIEVEMENT_ORDER.map((id) => this.status(id));
  }

  isUnlocked(id: AchievementId): boolean {
    return this.store[id]?.unlocked === true;
  }

  /** Adds to cumulative progress. */
  add(id: AchievementId, amount: number): AchievementDef | null {
    return this.set(id, (this.store[id]?.progress ?? 0) + amount);
  }

  /** Raises progress to `value` if higher (for per-run bests like "complete wave N"). */
  reach(id: AchievementId, value: number): AchievementDef | null {
    return this.set(id, Math.max(this.store[id]?.progress ?? 0, value));
  }

  private set(id: AchievementId, value: number): AchievementDef | null {
    const def = ACHIEVEMENTS[id];
    const entry = this.store[id] ?? (this.store[id] = { progress: 0, unlocked: false });
    if (entry.unlocked) return null;
    entry.progress = Math.min(def.target, value);
    if (entry.progress >= def.target) {
      entry.unlocked = true;
      return def;
    }
    return null;
  }

  /** Locked achievements sorted by completion ratio — shown after a run as optional goals. */
  nearest(count: number): AchievementStatus[] {
    return this.all()
      .filter((a) => !a.unlocked && a.progress > 0)
      .sort((a, b) => b.progress / b.def.target - a.progress / a.def.target)
      .slice(0, count);
  }
}
