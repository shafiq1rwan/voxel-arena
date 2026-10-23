import type { SeededRandom } from '../core/SeededRandom';
import { ARCHETYPES, ELITE_COST_BONUS, type ArchetypeId } from '../enemies/EnemyTypes';

/** Threat budget for standard waves: 6 + 3w + floor(0.4 w²). */
export function waveBudget(wave: number): number {
  return 6 + 3 * wave + Math.floor(0.4 * wave * wave);
}

/** Maximum simultaneously alive enemies: min(24, 5 + 2w). */
export function activeEnemyCap(wave: number): number {
  return Math.min(24, 5 + 2 * wave);
}

export const FINAL_WAVE = 10;
/** Controlled support budget for boss waves (separate from the standard formula). */
export const BOSS_SUPPORT_BUDGET = 12;

export interface SpawnEntry {
  id: ArchetypeId;
  elite: boolean;
}

/** Composition rules for one wave. */
export interface WaveDef {
  /** Relative pick weights for spending the budget. */
  weights: Partial<Record<ArchetypeId, number>>;
  /** Guaranteed minimum counts (bought first). */
  minimum?: Partial<Record<ArchetypeId, number>>;
  /** Number of enemies upgraded to elites (each costs +4 threat). */
  elites?: number;
  /** Boss encounter with a controlled support budget. */
  boss?: boolean;
  /** Multiplier on the batch spawn interval (lower = more pressure). */
  spawnInterval: number;
  /** Extra enemies per spawn batch. */
  batchBonus: number;
  /** Short label shown when the wave starts. */
  label: string;
}

/** Wave progression table (design brief §9). */
const WAVE_TABLE: readonly WaveDef[] = [
  { weights: { chaser: 1 }, spawnInterval: 1, batchBonus: 0, label: 'Chasers inbound' },
  { weights: { chaser: 1 }, spawnInterval: 0.75, batchBonus: 1, label: 'The horde grows' },
  { weights: { chaser: 4, shooter: 1 }, minimum: { shooter: 2 }, spawnInterval: 0.9, batchBonus: 1, label: 'Shooters spotted — keep moving' },
  { weights: { chaser: 2, shooter: 1 }, minimum: { shooter: 3 }, spawnInterval: 0.85, batchBonus: 1, label: 'Mixed assault' },
  { weights: { chaser: 3, shooter: 2 }, minimum: { shooter: 3 }, elites: 1, spawnInterval: 0.85, batchBonus: 1, label: 'Elite sighted' },
  { weights: { chaser: 3, shooter: 2, tank: 1 }, minimum: { tank: 1 }, spawnInterval: 0.85, batchBonus: 1, label: 'Heavy armour — aim for the core' },
  { weights: { chaser: 3, shooter: 2, tank: 1 }, minimum: { tank: 1, shooter: 3 }, elites: 1, spawnInterval: 0.8, batchBonus: 2, label: 'Combined arms' },
  { weights: { chaser: 4, shooter: 2, tank: 1 }, minimum: { tank: 1 }, elites: 1, spawnInterval: 0.55, batchBonus: 3, label: 'They are pouring in' },
  { weights: { chaser: 3, shooter: 2, tank: 2 }, minimum: { tank: 2 }, elites: 3, spawnInterval: 0.7, batchBonus: 2, label: 'Elite onslaught' },
  { weights: { chaser: 2, shooter: 1 }, boss: true, spawnInterval: 1.4, batchBonus: 0, label: 'The Obsidian Colossus awakens' },
];

/** Endless mode beyond the final wave: escalating mixes, a boss every 10th wave. */
export function waveDef(wave: number): WaveDef {
  const table = WAVE_TABLE[wave - 1];
  if (table) return table;
  if (wave % 10 === 0) return { ...WAVE_TABLE[FINAL_WAVE - 1]!, label: 'The Colossus returns' };
  return {
    weights: { chaser: 3, shooter: 2, tank: 1 },
    minimum: { tank: 1 + Math.floor((wave - 10) / 3), shooter: 4 },
    elites: Math.min(6, 1 + Math.floor((wave - 10) / 2)),
    spawnInterval: 0.6,
    batchBonus: 3,
    label: 'Endless survival',
  };
}

function cost(id: ArchetypeId): number {
  return ARCHETYPES[id].threatCost;
}

/**
 * Spends the wave's threat budget according to its WaveDef. Deterministic for a given rng.
 * `budgetScale` comes from the Swarm challenge modifier.
 */
export function composeWave(wave: number, rng: SeededRandom, budgetScale = 1): SpawnEntry[] {
  const def = waveDef(wave);
  let budget = Math.round((def.boss ? BOSS_SUPPORT_BUDGET : waveBudget(wave)) * budgetScale);
  const elites = def.elites ?? 0;
  budget -= elites * ELITE_COST_BONUS;
  const out: ArchetypeId[] = [];

  for (const [id, count] of Object.entries(def.minimum ?? {}) as [ArchetypeId, number][]) {
    for (let i = 0; i < count && cost(id) <= budget; i++) {
      out.push(id);
      budget -= cost(id);
    }
  }
  const pool = Object.keys(def.weights) as ArchetypeId[];
  while (budget > 0) {
    const affordable = pool.filter((id) => cost(id) <= budget);
    if (affordable.length === 0) break;
    const id = rng.weighted(affordable, (a) => def.weights[a] ?? 0);
    out.push(id);
    budget -= cost(id);
  }

  const entries: SpawnEntry[] = interleave(out, rng).map((id) => ({ id, elite: false }));
  // Upgrade some non-opening enemies to elites, preferring variety across archetypes.
  const candidates = entries.slice(3);
  rng.shuffle(candidates);
  candidates.sort((a, b) => (a.id === 'tank' ? 1 : 0) - (b.id === 'tank' ? 1 : 0));
  for (let i = 0; i < elites && i < candidates.length; i++) candidates[i]!.elite = true;
  if (def.boss) entries.unshift({ id: 'boss', elite: false });
  return entries;
}

/**
 * Spawn order: the first few spawns are melee so each wave opens readable, then ranged and heavy
 * units are spread randomly through the rest instead of arriving as one volley.
 */
function interleave(list: ArchetypeId[], rng: SeededRandom): ArchetypeId[] {
  const melee = list.filter((id) => id === 'chaser');
  const other = rng.shuffle(list.filter((id) => id !== 'chaser'));
  const result: ArchetypeId[] = melee.splice(0, Math.min(3, melee.length));
  while (melee.length || other.length) {
    if (other.length && (!melee.length || rng.chance(other.length / (other.length + melee.length)))) result.push(other.shift()!);
    else result.push(melee.shift()!);
  }
  return result;
}

/** Threat actually spent by a composed wave (elites include their surcharge). */
export function spentThreat(entries: SpawnEntry[]): number {
  return entries.reduce((sum, e) => sum + cost(e.id) + (e.elite ? ELITE_COST_BONUS : 0), 0);
}
