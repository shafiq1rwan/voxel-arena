import type { PlatformAdapter } from './PlatformAdapter';

/** Subset of the official Poki HTML5 SDK (https://developers.poki.com/guide/sdk-html5). */
interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
  setDebug?(debug: boolean): void;
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
  }
}

const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/**
 * Wraps the Poki SDK and guards its lifecycle:
 *  - gameplayStart/Stop are de-duplicated (Poki expects strictly alternating calls)
 *  - ad promises always resolve, even if the SDK is blocked by an ad blocker
 *  - gameplay is stopped before any break, as required by Poki
 */
export class PokiAdapter implements PlatformAdapter {
  readonly name = 'poki';
  private sdk: PokiSDKApi | null = null;
  private playing = false;
  private loadingFinished = false;
  private adInProgress = false;

  async init(): Promise<void> {
    try {
      if (!window.PokiSDK) await loadScript(SDK_URL);
      this.sdk = window.PokiSDK ?? null;
      if (!this.sdk) return;
      await this.sdk.init();
      if (import.meta.env.DEV) this.sdk.setDebug?.(true);
    } catch (err) {
      // Per Poki guidance: if init fails (e.g. ad blocker), load the game anyway.
      console.warn('[Poki] SDK init failed, continuing without ads', err);
    }
  }

  gameLoadingFinished(): void {
    if (this.loadingFinished) return;
    this.loadingFinished = true;
    this.safe(() => this.sdk?.gameLoadingFinished());
  }

  gameplayStart(): void {
    if (this.playing || this.adInProgress) return;
    this.playing = true;
    this.safe(() => this.sdk?.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.safe(() => this.sdk?.gameplayStop());
  }

  async commercialBreak(onStart?: () => void): Promise<void> {
    if (!this.sdk || this.adInProgress) return;
    this.gameplayStop();
    this.adInProgress = true;
    try {
      await this.sdk.commercialBreak(() => onStart?.());
    } catch (err) {
      console.warn('[Poki] commercialBreak failed', err);
    } finally {
      this.adInProgress = false;
    }
  }

  async rewardedBreak(onStart?: () => void): Promise<boolean> {
    if (!this.sdk || this.adInProgress) return false;
    this.gameplayStop();
    this.adInProgress = true;
    try {
      const success = await this.sdk.rewardedBreak(() => onStart?.());
      return success === true;
    } catch (err) {
      console.warn('[Poki] rewardedBreak failed', err);
      return false;
    } finally {
      this.adInProgress = false;
    }
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.warn('[Poki] SDK call failed', err);
    }
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}
