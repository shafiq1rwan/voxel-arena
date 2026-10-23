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

/**
 * Spends the wave's threat budget on enemies. Milestone 1 has only Chasers; Milestone 2 adds
 * shooters/tanks/elites with per-wave composition rules (see the wave table in the design brief).
 */
export function composeWave(wave: number, rng: SeededRandom): ArchetypeId[] {
  let budget = waveBudget(wave);
  const out: ArchetypeId[] = [];
  const pool: ArchetypeId[] = ['chaser'];
  while (budget > 0) {
    const affordable = pool.filter((id) => ARCHETYPES[id].threatCost <= budget);
    if (affordable.length === 0) break;
    const id = rng.pick(affordable);
    out.push(id);
    budget -= ARCHETYPES[id].threatCost;
  }
  return rng.shuffle(out);
}
