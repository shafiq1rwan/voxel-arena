import type { QualityLevel } from '../config';

export type CrosshairColor = 'white' | 'green' | 'yellow' | 'cyan' | 'magenta';

export interface Settings {
  mouseSensitivity: number;
  /** Vertical field of view, degrees. */
  fov: number;
  invertY: boolean;
  quality: QualityLevel;
  volume: number;
  showFps: boolean;
  // --- touch (Milestone 5) ---
  touchSensitivity: number;
  autoFire: boolean;
  aimAssist: boolean;
  /** Touch button size multiplier. */
  buttonScale: number;
  // --- accessibility (Milestone 5) ---
  /** 0..1 camera shake strength. */
  cameraShake: number;
  headBob: boolean;
  /** Softens muzzle flashes and hit flashes. */
  reduceFlashing: boolean;
  hudScale: number;
  crosshairColor: CrosshairColor;
}

export interface PlayerRecords {
  bestWave: number;
  totalKills: number;
  totalHeadshots: number;
  runsPlayed: number;
  longestRunSec: number;
  highScore: number;
  victories: number;
}

export type GameMode = 'standard' | 'endless';

export interface LoadoutSave {
  family: string;
  /** Seed for the starting weapon's procedural components (rerolled in the loadout screen). */
  weaponSeed: number;
  modifiers: string[];
  mode: GameMode;
}

export interface AchievementSave {
  progress: number;
  unlocked: boolean;
}

export interface SaveData {
  version: 2;
  settings: Settings;
  records: PlayerRecords;
  /** Distinct arena seeds played (Explorer achievement). */
  arenasPlayed: number[];
  scrap: number;
  /** Purchased / earned unlock ids. */
  unlocks: string[];
  achievements: Record<string, AchievementSave>;
  equippedSkin: string;
  loadout: LoadoutSave;
}

const STORAGE_KEY = 'voxel-survival-arena:save';
const CURRENT_VERSION = 2;

export function defaultSettings(): Settings {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return {
    mouseSensitivity: 1,
    fov: 70,
    invertY: false,
    quality: touch ? 'low' : 'medium',
    volume: 0.7,
    showFps: false,
    touchSensitivity: 1,
    autoFire: false,
    aimAssist: true,
    buttonScale: 1,
    cameraShake: 1,
    headBob: true,
    reduceFlashing: false,
    hudScale: 1,
    crosshairColor: 'white',
  };
}

export function defaultSave(): SaveData {
  return {
    version: 2,
    settings: defaultSettings(),
    records: { bestWave: 0, totalKills: 0, totalHeadshots: 0, runsPlayed: 0, longestRunSec: 0, highScore: 0, victories: 0 },
    arenasPlayed: [],
    scrap: 0,
    unlocks: [],
    achievements: {},
    equippedSkin: 'default',
    loadout: { family: 'rifle', weaponSeed: 1, modifiers: [], mode: 'standard' },
  };
}

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const strArr = (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);

/**
 * Validates untrusted parsed JSON field-by-field so a corrupted or older save can never crash the
 * game. Version 1 saves (Milestones 1–2) migrate by keeping settings/records and defaulting the rest.
 */
export function sanitizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData> & { version?: number };
  const s = (r.settings ?? {}) as Partial<Settings>;
  const rec = (r.records ?? {}) as Partial<PlayerRecords>;
  const d = base.settings;
  const crosshairs: CrosshairColor[] = ['white', 'green', 'yellow', 'cyan', 'magenta'];
  const achievements: Record<string, AchievementSave> = {};
  if (r.achievements && typeof r.achievements === 'object') {
    for (const [id, a] of Object.entries(r.achievements as Record<string, unknown>)) {
      if (!a || typeof a !== 'object') continue;
      const v = a as Partial<AchievementSave>;
      achievements[id] = { progress: num(v.progress, 0, 0, 1e9), unlocked: bool(v.unlocked, false) };
    }
  }
  const lo = (r.loadout ?? {}) as Partial<LoadoutSave>;
  return {
    version: 2,
    settings: {
      mouseSensitivity: num(s.mouseSensitivity, d.mouseSensitivity, 0.1, 5),
      fov: num(s.fov, d.fov, 50, 100),
      invertY: bool(s.invertY, false),
      quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : d.quality,
      volume: num(s.volume, d.volume, 0, 1),
      showFps: bool(s.showFps, false),
      touchSensitivity: num(s.touchSensitivity, d.touchSensitivity, 0.2, 3),
      autoFire: bool(s.autoFire, d.autoFire),
      aimAssist: bool(s.aimAssist, d.aimAssist),
      buttonScale: num(s.buttonScale, d.buttonScale, 0.7, 1.4),
      cameraShake: num(s.cameraShake, d.cameraShake, 0, 1),
      headBob: bool(s.headBob, d.headBob),
      reduceFlashing: bool(s.reduceFlashing, d.reduceFlashing),
      hudScale: num(s.hudScale, d.hudScale, 0.75, 1.25),
      crosshairColor: crosshairs.includes(s.crosshairColor as CrosshairColor) ? (s.crosshairColor as CrosshairColor) : 'white',
    },
    records: {
      bestWave: num(rec.bestWave, 0, 0, 1e6),
      totalKills: num(rec.totalKills, 0, 0, 1e9),
      totalHeadshots: num(rec.totalHeadshots, 0, 0, 1e9),
      runsPlayed: num(rec.runsPlayed, 0, 0, 1e9),
      longestRunSec: num(rec.longestRunSec, 0, 0, 1e9),
      highScore: num(rec.highScore, 0, 0, 1e12),
      victories: num(rec.victories, 0, 0, 1e9),
    },
    arenasPlayed: Array.isArray(r.arenasPlayed) ? r.arenasPlayed.filter((n): n is number => typeof n === 'number').slice(-200) : [],
    scrap: Math.floor(num(r.scrap, 0, 0, 1e9)),
    unlocks: strArr(r.unlocks),
    achievements,
    equippedSkin: typeof r.equippedSkin === 'string' ? r.equippedSkin : 'default',
    loadout: {
      family: typeof lo.family === 'string' ? lo.family : 'rifle',
      weaponSeed: Math.floor(num(lo.weaponSeed, 1, 0, 4294967295)),
      modifiers: strArr(lo.modifiers, 10),
      mode: lo.mode === 'endless' ? 'endless' : 'standard',
    },
  };
}

/**
 * Versioned local save with graceful degradation: if localStorage is blocked (private mode,
 * sandboxed iframe, quota) the game keeps running with in-memory data.
 */
export class SaveManager {
  data: SaveData;
  readonly storageAvailable: boolean;

  constructor() {
    this.storageAvailable = SaveManager.probe();
    this.data = this.load();
  }

  private static probe(): boolean {
    try {
      const k = '__vsa_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  private load(): SaveData {
    if (!this.storageAvailable) return defaultSave();
    try {
      const text = window.localStorage.getItem(STORAGE_KEY);
      if (!text) return defaultSave();
      const parsed: unknown = JSON.parse(text);
      const version = (parsed as { version?: number })?.version;
      if (typeof version === 'number' && version > CURRENT_VERSION) {
        console.warn('[Save] save is from a newer version; using defaults without overwriting');
        return defaultSave();
      }
      return sanitizeSave(parsed);
    } catch (err) {
      console.warn('[Save] corrupted save, resetting', err);
      return defaultSave();
    }
  }

  save(): void {
    if (!this.storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[Save] failed to write save', err);
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  recordRun(run: { wave: number; kills: number; headshots: number; timeSec: number; score: number; seed: number; victory: boolean }): { newBestWave: boolean; newHighScore: boolean } {
    const r = this.data.records;
    const newBestWave = run.wave > r.bestWave;
    const newHighScore = run.score > r.highScore;
    r.bestWave = Math.max(r.bestWave, run.wave);
    r.totalKills += run.kills;
    r.totalHeadshots += run.headshots;
    r.runsPlayed += 1;
    r.longestRunSec = Math.max(r.longestRunSec, run.timeSec);
    r.highScore = Math.max(r.highScore, run.score);
    if (run.victory) r.victories += 1;
    if (!this.data.arenasPlayed.includes(run.seed)) this.data.arenasPlayed.push(run.seed);
    this.save();
    return { newBestWave, newHighScore };
  }
}
