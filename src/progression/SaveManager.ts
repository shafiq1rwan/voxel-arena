import type { QualityLevel } from '../config';

export interface Settings {
  mouseSensitivity: number;
  /** Vertical field of view, degrees. */
  fov: number;
  invertY: boolean;
  quality: QualityLevel;
  volume: number;
  showFps: boolean;
}

export interface PlayerRecords {
  bestWave: number;
  totalKills: number;
  totalHeadshots: number;
  runsPlayed: number;
  longestRunSec: number;
  highScore: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  records: PlayerRecords;
  /** Distinct arena seeds played (for the Explorer achievement, Milestone 4). */
  arenasPlayed: number[];
}

const STORAGE_KEY = 'voxel-survival-arena:save';
const CURRENT_VERSION = 1;

export function defaultSettings(): Settings {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return { mouseSensitivity: 1, fov: 70, invertY: false, quality: touch ? 'low' : 'medium', volume: 0.7, showFps: false };
}

function defaultSave(): SaveData {
  return {
    version: 1,
    settings: defaultSettings(),
    records: { bestWave: 0, totalKills: 0, totalHeadshots: 0, runsPlayed: 0, longestRunSec: 0, highScore: 0 },
    arenasPlayed: [],
  };
}

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Validates untrusted parsed JSON field-by-field so a corrupted save can never crash the game. */
function sanitize(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData> & { version?: number };
  // Future migrations: switch (r.version) { case 1: ... }
  const s = (r.settings ?? {}) as Partial<Settings>;
  const rec = (r.records ?? {}) as Partial<PlayerRecords>;
  return {
    version: 1,
    settings: {
      mouseSensitivity: num(s.mouseSensitivity, base.settings.mouseSensitivity, 0.1, 5),
      fov: num(s.fov, base.settings.fov, 50, 100),
      invertY: typeof s.invertY === 'boolean' ? s.invertY : false,
      quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : base.settings.quality,
      volume: num(s.volume, base.settings.volume, 0, 1),
      showFps: typeof s.showFps === 'boolean' ? s.showFps : false,
    },
    records: {
      bestWave: num(rec.bestWave, 0, 0, 1e6),
      totalKills: num(rec.totalKills, 0, 0, 1e9),
      totalHeadshots: num(rec.totalHeadshots, 0, 0, 1e9),
      runsPlayed: num(rec.runsPlayed, 0, 0, 1e9),
      longestRunSec: num(rec.longestRunSec, 0, 0, 1e9),
      highScore: num(rec.highScore, 0, 0, 1e12),
    },
    arenasPlayed: Array.isArray(r.arenasPlayed) ? r.arenasPlayed.filter((n): n is number => typeof n === 'number').slice(-200) : [],
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
      return sanitize(parsed);
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

  recordRun(run: { wave: number; kills: number; headshots: number; timeSec: number; score: number; seed: number }): { newBestWave: boolean; newHighScore: boolean } {
    const r = this.data.records;
    const newBestWave = run.wave > r.bestWave;
    const newHighScore = run.score > r.highScore;
    r.bestWave = Math.max(r.bestWave, run.wave);
    r.totalKills += run.kills;
    r.totalHeadshots += run.headshots;
    r.runsPlayed += 1;
    r.longestRunSec = Math.max(r.longestRunSec, run.timeSec);
    r.highScore = Math.max(r.highScore, run.score);
    if (!this.data.arenasPlayed.includes(run.seed)) this.data.arenasPlayed.push(run.seed);
    this.save();
    return { newBestWave, newHighScore };
  }
}
