import { DesktopInput } from './DesktopInput';
import { createInputState, type InputProvider, type InputState } from './InputState';

/**
 * Aggregates all input providers into one InputState per frame.
 * Touch controls (Milestone 5) plug in as another provider without touching gameplay code.
 */
export class InputManager {
  readonly state: InputState = createInputState();
  readonly desktop: DesktopInput;
  private providers: InputProvider[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.desktop = new DesktopInput(canvas);
    this.providers.push(this.desktop);
  }

  addProvider(p: InputProvider): void {
    this.providers.push(p);
  }

  /** Builds this frame's input snapshot. */
  update(): InputState {
    const s = this.state;
    s.moveX = 0;
    s.moveY = 0;
    s.lookYaw = 0;
    s.lookPitch = 0;
    s.fire = s.aim = s.sprint = s.jumpPressed = s.jumpHeld = s.reloadPressed = s.abilityPressed = s.pausePressed = false;
    s.weaponSlot = 0;
    s.weaponCycle = 0;
    s.interactPressed = s.grenadePressed = false;
    for (const p of this.providers) p.poll(s);
    // Normalise diagonal movement.
    const len = Math.hypot(s.moveX, s.moveY);
    if (len > 1) {
      s.moveX /= len;
      s.moveY /= len;
    }
    return s;
  }

  reset(): void {
    for (const p of this.providers) p.reset();
  }

  setSensitivity(mouse: number, invertY: boolean): void {
    this.desktop.sensitivity = mouse;
    this.desktop.invertY = invertY;
  }
}
