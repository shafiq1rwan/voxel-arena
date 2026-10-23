import type { PlatformAdapter } from './PlatformAdapter';

/**
 * Local stand-in for the Poki SDK. Logs lifecycle calls, flags protocol mistakes (duplicate
 * gameplayStart/Stop) and can simulate ad breaks with `?mockads=1` so pause/resume paths are testable.
 */
export class MockPokiAdapter implements PlatformAdapter {
  readonly name = 'mock';
  private playing = false;
  private simulateAds: boolean;
  private log = (...args: unknown[]) => console.info('%c[MockPoki]', 'color:#f4b81c', ...args);

  constructor() {
    this.simulateAds = new URLSearchParams(location.search).has('mockads');
  }

  async init(): Promise<void> {
    this.log('init');
  }

  gameLoadingFinished(): void {
    this.log('gameLoadingFinished');
  }

  gameplayStart(): void {
    if (this.playing) return this.log('⚠ duplicate gameplayStart ignored');
    this.playing = true;
    this.log('gameplayStart');
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.log('gameplayStop');
  }

  async commercialBreak(onStart?: () => void): Promise<void> {
    this.gameplayStop();
    if (!this.simulateAds) return;
    this.log('commercialBreak (simulated 1.5 s)');
    onStart?.();
    await showFakeAd('Commercial break (mock)', 1500);
  }

  async rewardedBreak(onStart?: () => void): Promise<boolean> {
    this.gameplayStop();
    this.log('rewardedBreak (simulated 2 s)');
    onStart?.();
    await showFakeAd('Rewarded break (mock)', 2000);
    return true;
  }
}

function showFakeAd(text: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mock-ad';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, ms);
  });
}
