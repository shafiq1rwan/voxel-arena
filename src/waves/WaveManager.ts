import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/EventBus';
import { SeededRandom } from '../core/SeededRandom';
import type { EnemyPool } from '../enemies/EnemyPool';
import type { EnemySpawner } from '../enemies/EnemySpawner';
import type { ArchetypeId } from '../enemies/EnemyTypes';
import type { PlayerController } from '../player/PlayerController';
import { activeEnemyCap, composeWave, waveDef } from './ThreatBudget';

export enum WavePhase {
  Prepare = 'PREPARE',
  Spawning = 'SPAWNING',
  Combat = 'COMBAT',
  Reward = 'REWARD',
  NextWave = 'NEXT_WAVE',
  Idle = 'IDLE',
}

/**
 * Wave state machine: PREPARE -> SPAWNING -> COMBAT -> REWARD -> NEXT_WAVE -> PREPARE ...
 * A wave only completes once every allocated enemy has spawned and been eliminated.
 * (Application-level VICTORY / DEFEAT / PAUSED / AD_BREAK live in GameState.)
 */
export class WaveManager {
  phase: WavePhase = WavePhase.Idle;
  wave = 0;
  phaseTimer = 0;
  totalThisWave = 0;
  killedThisWave = 0;
  waveTime = 0;
  /** Set by the game when the REWARD phase needs to wait on a UI choice (Milestone 2 upgrades). */
  onRewardPhase: ((wave: number) => void) | null = null;

  /** Spawn queue, stored reversed so pop() yields the next enemy in order. */
  private queue: ArchetypeId[] = [];
  /** Composition counts for the HUD / analytics. */
  shootersThisWave = 0;
  private spawnTimer = 0;
  private rng = new SeededRandom(1);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private spawner: EnemySpawner,
    private pool: EnemyPool,
    private bus: EventBus<GameEvents>,
  ) {}

  start(runSeed: number): void {
    this.rng = new SeededRandom(runSeed).fork('waves');
    this.wave = 0;
    this.unsubscribe?.();
    this.unsubscribe = this.bus.on('enemy:killed', () => {
      if (this.phase === WavePhase.Spawning || this.phase === WavePhase.Combat) this.killedThisWave++;
    });
    this.beginPrepare();
  }

  stop(): void {
    this.phase = WavePhase.Idle;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Short description of the current wave's threat, from the wave table. */
  get label(): string {
    return waveDef(Math.max(1, this.wave)).label;
  }

  get remaining(): number {
    return this.totalThisWave - this.killedThisWave;
  }

  private beginPrepare(): void {
    this.wave++;
    this.queue = composeWave(this.wave, this.rng).reverse();
    this.totalThisWave = this.queue.length;
    this.shootersThisWave = this.queue.filter((id) => id === 'shooter').length;
    this.killedThisWave = 0;
    this.waveTime = 0;
    this.phase = WavePhase.Prepare;
    this.phaseTimer = this.wave === 1 ? CONFIG.waves.prepareTime : CONFIG.waves.prepareTime * 0.8;
  }

  /** Called by the game after the reward (upgrade choice) has been resolved. */
  completeReward(): void {
    if (this.phase !== WavePhase.Reward) return;
    this.phase = WavePhase.NextWave;
  }

  update(dt: number, player: PlayerController): void {
    switch (this.phase) {
      case WavePhase.Idle:
        return;
      case WavePhase.Prepare:
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = WavePhase.Spawning;
          this.spawnTimer = 0;
          this.bus.emit('wave:started', { wave: this.wave, totalEnemies: this.totalThisWave });
        }
        return;
      case WavePhase.Spawning:
      case WavePhase.Combat: {
        this.waveTime += dt;
        if (this.phase === WavePhase.Spawning) {
          this.spawnTimer -= dt;
          if (this.spawnTimer <= 0) {
            this.spawnBatch(player);
            this.spawnTimer = CONFIG.waves.spawnBatchInterval * waveDef(this.wave).spawnInterval;
          }
          if (this.queue.length === 0) this.phase = WavePhase.Combat;
        }
        if (this.phase === WavePhase.Combat && this.pool.aliveCount === 0) {
          this.phase = WavePhase.Reward;
          this.phaseTimer = CONFIG.waves.intermission;
          this.bus.emit('wave:completed', { wave: this.wave, timeSec: this.waveTime });
          this.onRewardPhase?.(this.wave);
        }
        return;
      }
      case WavePhase.Reward:
        // Without a reward UI hook, the intermission simply times out.
        if (!this.onRewardPhase) {
          this.phaseTimer -= dt;
          if (this.phaseTimer <= 0) this.phase = WavePhase.NextWave;
        }
        return;
      case WavePhase.NextWave:
        this.beginPrepare();
        return;
    }
  }

  private spawnBatch(player: PlayerController): void {
    const cap = activeEnemyCap(this.wave);
    const room = cap - this.pool.aliveCount;
    const batch = Math.min(room, 2 + waveDef(this.wave).batchBonus, this.queue.length);
    const mods = {
      healthScale: 1 + 0.05 * (this.wave - 1),
      speedScale: Math.min(1.25, 1 + 0.025 * (this.wave - 1)),
    };
    for (let i = 0; i < batch; i++) {
      const id = this.queue.pop()!;
      if (!this.spawner.spawn(id, player.body.x, player.body.z, player.eyeY, mods)) {
        this.queue.push(id);
        break;
      }
    }
  }
}
