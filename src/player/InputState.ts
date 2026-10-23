/**
 * Device-agnostic per-frame input snapshot. Desktop and touch providers both write into this,
 * so gameplay code never needs to know which device is active.
 */
export interface InputState {
  /** Strafe axis, -1 (left) .. 1 (right). */
  moveX: number;
  /** Forward axis, -1 (back) .. 1 (forward). */
  moveY: number;
  /** Accumulated look delta this frame, in radians. */
  lookYaw: number;
  lookPitch: number;
  fire: boolean;
  aim: boolean;
  sprint: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  reloadPressed: boolean;
  abilityPressed: boolean;
  pausePressed: boolean;
  /** 1-based weapon slot requested this frame, or 0. */
  weaponSlot: number;
}

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    lookYaw: 0,
    lookPitch: 0,
    fire: false,
    aim: false,
    sprint: false,
    jumpPressed: false,
    jumpHeld: false,
    reloadPressed: false,
    abilityPressed: false,
    pausePressed: false,
    weaponSlot: 0,
  };
}

/** An input device that contributes to the shared InputState each frame. */
export interface InputProvider {
  /** Writes held states and accumulated deltas into `state`, then clears its own edge triggers. */
  poll(state: InputState): void;
  /** Releases all held inputs (e.g. on blur or pause). */
  reset(): void;
  dispose(): void;
}
