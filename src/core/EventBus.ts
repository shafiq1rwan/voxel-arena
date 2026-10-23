/** Minimal strongly typed publish/subscribe bus. */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as (payload: never) => void);
    return () => set!.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as (p: Events[K]) => void)(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${String(type)}" failed`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** All gameplay events. Systems communicate through these instead of direct references. */
export interface GameEvents {
  'game:loaded': { loadMs: number };
  'run:started': { seed: number; theme: string; weapon: string };
  'run:ended': { victory: boolean; wave: number; kills: number; timeSec: number; seed: number };
  'run:retry': { seed: number };
  'wave:started': { wave: number; totalEnemies: number };
  'wave:completed': { wave: number; timeSec: number };
  'enemy:spawned': { id: number; archetype: string };
  'enemy:damaged': { id: number; amount: number; headshot: boolean; critical: boolean; killed: boolean; point: Vec3Like };
  'enemy:killed': { id: number; archetype: string; headshot: boolean; weaponFamily: string; position: Vec3Like; firstOfRun: boolean };
  'player:damaged': { amount: number; fromX: number; fromZ: number; health: number };
  'player:healed': { amount: number; health: number };
  'player:died': { wave: number };
  'weapon:fired': { family: string };
  'weapon:reloadStart': { duration: number };
  'weapon:reloadEnd': Record<string, never>;
  'weapon:dryFire': Record<string, never>;
  'pickup:collected': { kind: 'health' | 'ammo'; amount: number };
  'player:dashed': Record<string, never>;
  'player:lastStand': Record<string, never>;
  'upgrade:offered': { wave: number; ids: string[] };
  'upgrade:selected': { id: string; wave: number; stacks: number; build: string };
  'explosion': { x: number; y: number; z: number; radius: number };
}
