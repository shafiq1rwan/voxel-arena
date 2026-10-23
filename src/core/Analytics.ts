import type { EventBus, GameEvents } from './EventBus';

export type AnalyticsEvent =
  | 'game_loaded'
  | 'game_started'
  | 'first_enemy_killed'
  | 'wave_started'
  | 'wave_completed'
  | 'upgrade_selected'
  | 'player_died'
  | 'run_completed'
  | 'retry_clicked'
  | 'achievement_unlocked'
  | 'skin_equipped'
  | 'unlock_purchased';

type Props = Record<string, string | number | boolean>;

/**
 * Privacy-friendly gameplay analytics: only game-state properties (wave, seed, weapon, time),
 * never personal data. Events go to pluggable sinks; in development they are logged to the console.
 */
export class Analytics {
  private sinks: ((event: AnalyticsEvent, props: Props) => void)[] = [];
  private sessionStart = performance.now();
  private runSeed = 0;

  constructor(bus: EventBus<GameEvents>) {
    if (import.meta.env.DEV) this.sinks.push((e, p) => console.debug('[analytics]', e, p));

    bus.on('game:loaded', (e) => this.track('game_loaded', { loadMs: Math.round(e.loadMs) }));
    bus.on('run:started', (e) => {
      this.runSeed = e.seed;
      this.track('game_started', { seed: e.seed, theme: e.theme, weapon: e.weapon });
    });
    bus.on('enemy:killed', (e) => {
      if (e.firstOfRun) this.track('first_enemy_killed', { seed: this.runSeed });
    });
    bus.on('wave:started', (e) => this.track('wave_started', { wave: e.wave, seed: this.runSeed }));
    bus.on('wave:completed', (e) => this.track('wave_completed', { wave: e.wave, timeSec: Math.round(e.timeSec), seed: this.runSeed }));
    bus.on('player:died', (e) => this.track('player_died', { wave: e.wave, seed: this.runSeed }));
    bus.on('run:ended', (e) =>
      this.track('run_completed', { victory: e.victory, wave: e.wave, kills: e.kills, timeSec: Math.round(e.timeSec), seed: e.seed }),
    );
    bus.on('run:retry', (e) => this.track('retry_clicked', { seed: e.seed }));
    bus.on('upgrade:selected', (e) => this.track('upgrade_selected', { upgrade: e.id, wave: e.wave, stacks: e.stacks, build: e.build, seed: this.runSeed }));
  }

  addSink(sink: (event: AnalyticsEvent, props: Props) => void): void {
    this.sinks.push(sink);
  }

  track(event: AnalyticsEvent, props: Props = {}): void {
    const payload = { ...props, sessionSec: Math.round((performance.now() - this.sessionStart) / 1000) };
    for (const s of this.sinks) {
      try {
        s(event, payload);
      } catch {
        /* never let analytics break the game */
      }
    }
  }
}
