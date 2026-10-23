import type { SeededRandom } from '../core/SeededRandom';
import { ARCHETYPES, type ArchetypeId } from '../enemies/EnemyTypes';

/** Threat budget for standard waves: 6 + 3w + floor(0.4 w²). */
export function waveBudget(wave: number): number {
  return 6 + 3 * wave + Math.floor(0.4 * wave * wave);
}

/** Maximum simultaneously alive enemies: min(24, 5 + 2w). */
export function activeEnemyCap(wave: number): number {
  return Math.min(24, 5 + 2 * wave);
}

/** Composition rules for one wave. */
export interface WaveDef {
  /** Relative pick weights for spending the budget. */
  weights: Partial<Record<ArchetypeId, number>>;
  /** Guaranteed minimum counts (bought first). */
  minimum?: Partial<Record<ArchetypeId, number>>;
  /** Multiplier on the batch spawn interval (lower = more pressure). */
  spawnInterval: number;
  /** Extra enemies per spawn batch. */
  batchBonus: number;
  /** Short label shown when the wave starts. */
  label: string;
}

/**
 * Wave progression table (design brief §9). Waves 5+ will gain Elites, Tanks and the Boss in
 * Milestone 4; until then they escalate with denser chaser/shooter mixes and faster spawning.
 */
const WAVE_TABLE: readonly WaveDef[] = [
  { weights: { chaser: 1 }, spawnInterval: 1, batchBonus: 0, label: 'Chasers inbound' },
  { weights: { chaser: 1 }, spawnInterval: 0.75, batchBonus: 1, label: 'The horde grows' },
  { weights: { chaser: 4, shooter: 1 }, minimum: { shooter: 2 }, spawnInterval: 0.9, batchBonus: 1, label: 'Shooters spotted — keep moving' },
  { weights: { chaser: 2, shooter: 1 }, minimum: { shooter: 3 }, spawnInterval: 0.85, batchBonus: 1, label: 'Mixed assault' },
  { weights: { chaser: 3, shooter: 2 }, minimum: { shooter: 4 }, spawnInterval: 0.8, batchBonus: 2, label: 'Crossfire' },
];
const LATE_WAVE: WaveDef = { weights: { chaser: 3, shooter: 2 }, minimum: { shooter: 5 }, spawnInterval: 0.65, batchBonus: 2, label: 'No retreat' };

export function waveDef(wave: number): WaveDef {
  return WAVE_TABLE[wave - 1] ?? LATE_WAVE;
}

/** Spends the wave's threat budget according to its WaveDef. Deterministic for a given rng. */
export function composeWave(wave: number, rng: SeededRandom): ArchetypeId[] {
  const def = waveDef(wave);
  let budget = waveBudget(wave);
  const out: ArchetypeId[] = [];

  for (const [id, count] of Object.entries(def.minimum ?? {}) as [ArchetypeId, number][]) {
    for (let i = 0; i < count && ARCHETYPES[id].threatCost <= budget; i++) {
      out.push(id);
      budget -= ARCHETYPES[id].threatCost;
    }
  }

  const pool = Object.keys(def.weights) as ArchetypeId[];
  while (budget > 0) {
    const affordable = pool.filter((id) => ARCHETYPES[id].threatCost <= budget);
    if (affordable.length === 0) break;
    const id = rng.weighted(affordable, (a) => def.weights[a] ?? 0);
    out.push(id);
    budget -= ARCHETYPES[id].threatCost;
  }
  return interleave(out, rng);
}

/**
 * Returns the spawn order: the first few spawns are melee so each wave opens readable, then
 * ranged units are spread randomly through the rest instead of arriving as one volley.
 */
function interleave(list: ArchetypeId[], rng: SeededRandom): ArchetypeId[] {
  const melee = list.filter((id) => id === 'chaser');
  const ranged = list.filter((id) => id !== 'chaser');
  const result: ArchetypeId[] = melee.splice(0, Math.min(3, melee.length));
  while (melee.length || ranged.length) {
    if (ranged.length && (!melee.length || rng.chance(ranged.length / (ranged.length + melee.length)))) result.push(ranged.shift()!);
    else result.push(melee.shift()!);
  }
  return result;
}
