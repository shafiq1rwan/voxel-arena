import type { Scene } from '@babylonjs/core/scene';
import type { MaterialLibrary } from '../render/Materials';
import { Enemy } from './Enemy';
import { EnemyRenderer, EnemyRig } from './EnemyRig';

/**
 * Pre-allocated enemy entities with their rigs. Acquiring/releasing never creates or disposes
 * Babylon objects mid-combat, which avoids GC spikes and shader/material churn.
 */
export class EnemyPool {
  readonly renderer: EnemyRenderer;
  readonly all: Enemy[] = [];
  /** Active enemies (dense list, iteration order stable between frames). */
  readonly active: Enemy[] = [];
  private free: Enemy[] = [];

  constructor(
    private scene: Scene,
    materials: MaterialLibrary,
    initialCapacity: number,
  ) {
    this.renderer = new EnemyRenderer(scene, materials);
    for (let i = 0; i < initialCapacity; i++) this.grow();
  }

  private grow(): Enemy {
    const id = this.all.length;
    const enemy = new Enemy(id, new EnemyRig(this.scene, this.renderer, id));
    this.all.push(enemy);
    this.free.push(enemy);
    return enemy;
  }

  acquire(): Enemy {
    const e = this.free.pop() ?? (this.grow(), this.free.pop()!);
    this.active.push(e);
    return e;
  }

  release(e: Enemy): void {
    const i = this.active.indexOf(e);
    if (i >= 0) {
      this.active[i] = this.active[this.active.length - 1]!;
      this.active.pop();
    }
    e.deactivate();
    this.free.push(e);
  }

  releaseAll(): void {
    while (this.active.length) this.release(this.active[this.active.length - 1]!);
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.active) if (e.alive) n++;
    return n;
  }
}
