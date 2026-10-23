/**
 * Publishing-platform abstraction. The game only talks to this interface; PokiAdapter wraps the
 * official Poki HTML5 SDK and MockPokiAdapter simulates it for local development.
 */
export interface PlatformAdapter {
  readonly name: string;
  init(): Promise<void>;
  gameLoadingFinished(): void;
  /** Player is actively playing (run start, unpause). Duplicate calls are ignored. */
  gameplayStart(): void;
  /** Player stopped playing (pause, death, menus). Duplicate calls are ignored. */
  gameplayStop(): void;
  /** Possible interstitial at a natural break. `onStart` fires if an ad actually begins. */
  commercialBreak(onStart?: () => void): Promise<void>;
  /** Opt-in rewarded ad. Resolves true only if the reward was earned. */
  rewardedBreak(onStart?: () => void): Promise<boolean>;
}
