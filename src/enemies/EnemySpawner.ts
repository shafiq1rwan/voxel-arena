import type { AudioManager } from '../audio/AudioManager';
import { SeededRandom } from '../core/SeededRandom';
import type { ArenaData } from '../procedural/ArenaTypes';
import { generateEnemyLook } from '../procedural/EnemyGenerator';
import type { Effects } from '../render/Effects';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { Enemy } from './Enemy';
import type { EnemyPool } from './EnemyPool';
import { ARCHETYPES, EnemyState, type ArchetypeId } from './EnemyTypes';

export interface SpawnModifiers {
  healthScale: number;
  speedScale: number;
  /** Endless mode: how many bosses have already been beaten (scales boss health). */
  bossTier?: number;
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

  /** Places a summoned minion right next to (x, z) — used by the boss. */
  spawnAt(archetype: ArchetypeId, x: number, z: number, px: number, pz: number, mods: SpawnModifiers): Enemy | null {
    const world = this.world;
    if (!world) return null;
    // Keep summons on open, walkable floor.
    if (world.heightAtWorld(x, z) > 0.55 || x < 2 || z < 2 || x > world.size - 2 || z > world.size - 2) return null;
    const look = generateEnemyLook(archetype, this.lookRng);
    const enemy = this.pool.acquire();
    enemy.activate(ARCHETYPES[archetype], look, x, world.heightAtWorld(x, z), z, mods.healthScale, mods.speedScale);
    enemy.yaw = Math.atan2(px - x, pz - z);
    enemy.syncRig();
    this.effects.debrisBurst(x, 0.2, z, look.accent, 8, 3, 0.06, 0.14);
    return enemy;
  }

  /** Sends a stuck enemy back to a fresh spawn point, replaying its spawn-in. */
  relocate(enemy: Enemy, px: number, pz: number, eyeY: number): void {
    const world = this.world;
    if (!world || !this.data || this.data.spawnPoints.length === 0) return;
    const sp = this.pickPoint(px, pz, eyeY, enemy);
    enemy.body.x = sp.x + 0.5;
    enemy.body.z = sp.z + 0.5;
    enemy.body.y = world.heightAtWorld(enemy.body.x, enemy.body.z);
    enemy.vx = enemy.vz = enemy.vy = enemy.kbx = enemy.kbz = 0;
    enemy.action = null;
    enemy.setState(EnemyState.Spawning);
    enemy.syncRig();
    this.effects.debrisBurst(enemy.body.x, 0.2, enemy.body.z, enemy.look.accent, 8, 3, 0.06, 0.14);
  }

  spawn(archetype: ArchetypeId, px: number, pz: number, eyeY: number, mods: SpawnModifiers, elite = false): Enemy | null {
    const data = this.data;
    const world = this.world;
    if (!data || !world || data.spawnPoints.length === 0) return null;

    const best = this.pickPoint(px, pz, eyeY);

    const def = ARCHETYPES[archetype];
    const look = generateEnemyLook(archetype, this.lookRng, elite);
    const x = best.x + 0.5 + this.spawnRng.range(-0.25, 0.25);
    const z = best.z + 0.5 + this.spawnRng.range(-0.25, 0.25);
    const enemy = this.pool.acquire();
    enemy.activate(def, look, x, 0, z, archetype === 'boss' ? 1 + 0.5 * Math.max(0, mods.bossTier ?? 0) : mods.healthScale, archetype === 'boss' ? 1 : mods.speedScale, elite);
    enemy.yaw = Math.atan2(px - x, pz - z);
    enemy.syncRig();

    this.effects.debrisBurst(x, 0.2, z, look.accent, 10, 3, 0.06, 0.16);
    this.audio.play('enemySpawn', Math.max(0.2, 1 - Math.hypot(px - x, pz - z) / 30));
    return enemy;
  }

  /** Prefers points far from, and out of sight of, the player and not crowded by other enemies. */
  private pickPoint(px: number, pz: number, eyeY: number, ignore: Enemy | null = null): { x: number; z: number } {
    const data = this.data!;
    const world = this.world!;
    let best = data.spawnPoints[0]!;
    let bestScore = -Infinity;
    for (const sp of data.spawnPoints) {
      const cx = sp.x + 0.5;
      const cz = sp.z + 0.5;
      const dist = Math.hypot(cx - px, cz - pz);
      if (dist < 7) continue;
      let crowd = 0;
      for (const e of this.pool.active) {
        if (e === ignore) continue;
        if (Math.hypot(e.body.x - cx, e.body.z - cz) < 1.4) crowd++;
      }
      const visible = world.hasLineOfSight(px, eyeY, pz, cx, 1.2, cz);
      const score = Math.min(dist, 22) * 0.6 - crowd * 6 - (visible ? 5 : 0) + this.spawnRng.next() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    return best;
  }
}
