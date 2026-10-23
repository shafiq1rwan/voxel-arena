/** Top-level application state. Wave-level states live in WaveManager. */
export enum AppState {
  Boot = 'BOOT',
  MainMenu = 'MAIN_MENU',
  Playing = 'PLAYING',
  Paused = 'PAUSED',
  /** Between-wave upgrade choice: combat halted, gameplay stopped for the platform. */
  Upgrade = 'UPGRADE',
  /** Loadout screen over the menu backdrop (3D weapon preview). */
  Loadout = 'LOADOUT',
  /** Death screen offering an opt-in rewarded revive. */
  Revive = 'REVIVE',
  GameOver = 'GAME_OVER',
  AdBreak = 'AD_BREAK',
}

type Listener = (next: AppState, prev: AppState) => void;

export class GameStateMachine {
  private current: AppState = AppState.Boot;
  private listeners: Listener[] = [];

  get state(): AppState {
    return this.current;
  }

  is(...states: AppState[]): boolean {
    return states.includes(this.current);
  }

  set(next: AppState): void {
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const l of this.listeners) l(next, prev);
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
  }
}
