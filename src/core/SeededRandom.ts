/**
 * Deterministic pseudo-random number generator (mulberry32).
 * Every procedural system (arena, weapons, enemies) draws from a SeededRandom
 * so a run can be reproduced exactly from its seed.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SeededRandom.pick on empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks an item using relative weights. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(0, weight(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1]!;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** Derives an independent child stream so sub-systems don't perturb each other. */
  fork(label: string): SeededRandom {
    return new SeededRandom(hashString(label) ^ Math.floor(this.next() * 4294967296));
  }
}

/** FNV-1a 32-bit string hash. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Cheap deterministic hash for integer coordinates -> [0, 1). Used for per-block color jitter. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function randomSeed(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! >>> 0;
  } catch {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}

/** Human-friendly seed code (base36, upper-case). */
export function seedToCode(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

/** Parses a seed code or arbitrary text into a numeric seed. */
export function codeToSeed(code: string): number {
  const trimmed = code.trim().toUpperCase();
  if (/^[0-9A-Z]{1,7}$/.test(trimmed)) {
    const parsed = parseInt(trimmed, 36);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return hashString(trimmed);
}
