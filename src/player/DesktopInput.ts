import type { InputProvider, InputState } from './InputState';

export interface DesktopInputOptions {
  /** Radians per pixel at sensitivity 1. */
  baseSensitivity: number;
}

/**
 * Keyboard + mouse with pointer lock. Uses KeyboardEvent.code so WASD maps to physical keys on
 * any keyboard layout (AZERTY players get ZQSD automatically).
 */
export class DesktopInput implements InputProvider {
  sensitivity = 1;
  invertY = false;
  /** When false (automated test mode), mouse input is accepted without pointer lock. */
  requireLock = true;
  /** Called when the pointer lock is lost unexpectedly (e.g. Escape pressed). */
  onLockLost: (() => void) | null = null;

  private keys = new Set<string>();
  private mouseButtons = 0;
  private lookX = 0;
  private lookY = 0;
  private jumpEdge = false;
  private reloadEdge = false;
  private abilityEdge = false;
  private pauseEdge = false;
  private slotEdge = 0;
  private enabled = false;
  private wasLocked = false;
  private disposers: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: DesktopInputOptions = { baseSensitivity: 0.0022 },
  ) {
    type Events = WindowEventMap & DocumentEventMap;
    const on = <K extends keyof Events>(target: Window | Document, type: K, fn: (e: Events[K]) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, options);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => this.reset());
    on(document, 'mousemove', (e) => {
      if (!this.capturing) return;
      // Some browsers emit huge spikes right after locking; ignore them.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    // Pointer events (not mouse events): Babylon and browsers may preventDefault pointerdown, which
    // suppresses legacy mousedown. `buttons` also tracks chorded presses (fire while aiming).
    on(document, 'pointerdown', (e) => {
      if (!this.capturing || e.pointerType !== 'mouse') return;
      this.mouseButtons = e.buttons;
    });
    on(document, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.capturing) this.mouseButtons = e.buttons;
    });
    on(window, 'pointerup', (e) => {
      if (e.pointerType === 'mouse') this.mouseButtons = e.buttons;
    });
    on(document, 'contextmenu', (e) => {
      if (this.isLocked || e.target === this.canvas) e.preventDefault();
    });
    on(document, 'pointerlockchange', () => {
      const locked = this.isLocked;
      if (this.wasLocked && !locked) {
        this.reset();
        if (this.enabled) this.onLockLost?.();
      }
      this.wasLocked = locked;
    });
  }

  private get capturing(): boolean {
    return this.isLocked || (!this.requireLock && this.enabled);
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Enables gameplay input; lock loss will then be reported via onLockLost. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  /**
   * Requests pointer lock. Must be called from a user gesture. Resolves true when locked.
   * Browsers refuse re-locking for ~1 s after the user pressed Escape, so callers must handle false.
   */
  requestLock(): Promise<boolean> {
    if (this.isLocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        clearTimeout(timer);
        resolve(ok);
      };
      const onChange = () => done(this.isLocked);
      const onError = () => done(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      const timer = window.setTimeout(() => done(this.isLocked), 1200);
      try {
        // Raw (unaccelerated) mouse input where supported; fall back to the plain request.
        const req = (this.canvas.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void).call(this.canvas, {
          unadjustedMovement: true,
        });
        if (req && typeof req.catch === 'function') {
          req.catch(() => {
            try {
              const plain = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
              plain?.catch?.(() => done(false));
            } catch {
              done(false);
            }
          });
        }
      } catch {
        done(false);
      }
    });
  }

  exitLock(): void {
    if (this.isLocked) document.exitPointerLock();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const code = e.code;
    if (down) {
      if (!this.keys.has(code)) {
        if (code === 'Space') this.jumpEdge = true;
        if (code === 'KeyR') this.reloadEdge = true;
        if (code === 'KeyQ') this.abilityEdge = true;
        if (code === 'KeyP' || code === 'Escape') this.pauseEdge = true;
        if (code.startsWith('Digit')) {
          const n = parseInt(code.slice(5), 10);
          if (n >= 1 && n <= 9) this.slotEdge = n;
        }
      }
      this.keys.add(code);
      // Prevent page scrolling / browser shortcuts from game keys while playing.
      if (this.enabled && (code === 'Space' || code.startsWith('Arrow') || code === 'Tab')) e.preventDefault();
    } else {
      this.keys.delete(code);
    }
  }

  poll(state: InputState): void {
    const k = this.keys;
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    state.moveX += right;
    state.moveY += fwd;
    const s = this.opts.baseSensitivity * this.sensitivity;
    state.lookYaw += this.lookX * s;
    state.lookPitch += this.lookY * s * (this.invertY ? -1 : 1);
    state.fire ||= (this.mouseButtons & 1) !== 0;
    state.aim ||= (this.mouseButtons & 2) !== 0;
    state.sprint ||= k.has('ShiftLeft') || k.has('ShiftRight');
    state.jumpHeld ||= k.has('Space');
    state.jumpPressed ||= this.jumpEdge;
    state.reloadPressed ||= this.reloadEdge;
    state.abilityPressed ||= this.abilityEdge;
    state.pausePressed ||= this.pauseEdge;
    if (this.slotEdge) state.weaponSlot = this.slotEdge;

    this.lookX = 0;
    this.lookY = 0;
    this.jumpEdge = false;
    this.reloadEdge = false;
    this.abilityEdge = false;
    this.pauseEdge = false;
    this.slotEdge = 0;
  }

  reset(): void {
    this.keys.clear();
    this.mouseButtons = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.jumpEdge = this.reloadEdge = this.abilityEdge = this.pauseEdge = false;
    this.slotEdge = 0;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
