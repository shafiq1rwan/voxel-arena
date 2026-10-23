import type { AudioManager } from '../audio/AudioManager';
import { SeededRandom } from '../core/SeededRandom';
import type { ArenaData } from '../procedural/ArenaTypes';
import { generateEnemyLook } from '../procedural/EnemyGenerator';
import type { Effects } from '../render/Effects';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { Enemy } from './Enemy';
import type { EnemyPool } from './EnemyPool';
import { ARCHETYPES, type ArchetypeId } from './EnemyTypes';

export interface SpawnModifiers {
  healthScale: number;
  speedScale: number;
}

/**
 * Places enemies at validated spawn points (generated + verified reachable by ArenaGenerator).
 * Prefers points far from and out of sight of the player so enemies never pop in at point blank.
 */
export class EnemySpawner {
  private data: ArenaData | null = null;
  private world: VoxelWorld | null = null;
  private lookRng = new SeededRandom(1);
  private spawnRng = new SeededRandom(2);

  constructor(
    private pool: EnemyPool,
    private effects: Effects,
    private audio: AudioManager,
  ) {}

  setArena(data: ArenaData, world: VoxelWorld, runSeed: number): void {
    this.data = data;
    this.world = world;
    const rng = new SeededRandom(runSeed);
    this.lookRng = rng.fork('enemy-looks');
    this.spawnRng = rng.fork('enemy-spawns');
  }

  spawn(archetype: ArchetypeId, px: number, pz: number, eyeY: number, mods: SpawnModifiers): Enemy | null {
    const data = this.data;
    const world = this.world;
    if (!data || !world || data.spawnPoints.length === 0) return null;

    let best = data.spawnPoints[0]!;
    let bestScore = -Infinity;
    for (const sp of data.spawnPoints) {
      const cx = sp.x + 0.5;
      const cz = sp.z + 0.5;
      const dist = Math.hypot(cx - px, cz - pz);
      if (dist < 7) continue;
      let crowd = 0;
      for (const e of this.pool.active) {
        if (Math.hypot(e.body.x - cx, e.body.z - cz) < 1.4) crowd++;
      }
      const visible = world.hasLineOfSight(px, eyeY, pz, cx, 1.2, cz);
      const score = Math.min(dist, 22) * 0.6 - crowd * 6 - (visible ? 5 : 0) + this.spawnRng.next() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }

    const def = ARCHETYPES[archetype];
    const look = generateEnemyLook(archetype, this.lookRng);
    const x = best.x + 0.5 + this.spawnRng.range(-0.25, 0.25);
    const z = best.z + 0.5 + this.spawnRng.range(-0.25, 0.25);
    const enemy = this.pool.acquire();
    enemy.activate(def, look, x, 0, z, mods.healthScale, mods.speedScale);
    enemy.yaw = Math.atan2(px - x, pz - z);
    enemy.syncRig();

    this.effects.debrisBurst(x, 0.2, z, look.accent, 10, 3, 0.06, 0.16);
    this.audio.play('enemySpawn', Math.max(0.2, 1 - Math.hypot(px - x, pz - z) / 30));
    return enemy;
  }
}
