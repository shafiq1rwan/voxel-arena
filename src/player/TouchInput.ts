import { h } from '../ui/dom';
import { ICONS } from '../ui/icons';
import type { InputProvider, InputState } from './InputState';

type ButtonId = 'fire' | 'aim' | 'jump' | 'reload' | 'dash' | 'grenade' | 'swap' | 'take';

interface ButtonState {
  el: HTMLElement;
  held: boolean;
  edge: boolean;
  pointerId: number;
}

/**
 * Touch controls (Milestone 5): floating joystick on the left, drag-to-look on the right, and
 * large action buttons. Fire also acts as a look surface while held, as in most mobile shooters.
 * Uses Pointer Events so it works with touch screens and pens alike.
 */
export class TouchInput implements InputProvider {
  readonly root: HTMLElement;
  sensitivity = 1;
  private moveZone: HTMLElement;
  private lookZone: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private buttons: Record<ButtonId, ButtonState>;
  private movePointer = -1;
  private moveOrigin = { x: 0, y: 0 };
  private moveX = 0;
  private moveY = 0;
  private lookPointers = new Map<number, { x: number; y: number }>();
  private lookDX = 0;
  private lookDY = 0;
  private active = false;
  private disposers: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.stickKnob = h('div', { class: 'stick-knob' });
    this.stickBase = h('div', { class: 'stick-base' }, this.stickKnob);
    this.moveZone = h('div', { class: 'touch-move-zone' }, this.stickBase);
    this.lookZone = h('div', { class: 'touch-look-zone' });

    const btn = (id: ButtonId, label: string, icon?: string) => {
      const el = h('div', { class: `touch-btn touch-${id}`, role: 'button', 'aria-label': label }, icon ? h('i', { html: icon }) : null, h('span', null, label));
      return { el, held: false, edge: false, pointerId: -1 } satisfies ButtonState;
    };
    this.buttons = {
      fire: btn('fire', 'FIRE', ICONS.aim),
      aim: btn('aim', 'AIM'),
      jump: btn('jump', 'JUMP'),
      reload: btn('reload', 'R'),
      dash: btn('dash', 'DASH', ICONS.dash),
      grenade: btn('grenade', 'NADE', ICONS.grenade),
      swap: btn('swap', 'SWAP', ICONS.swap),
      take: btn('take', 'TAKE', ICONS.crate),
    };

    this.root = h(
      'div',
      { class: 'touch-controls hidden' },
      this.lookZone,
      this.moveZone,
      h('div', { class: 'touch-cluster' }, ...Object.values(this.buttons).map((b) => b.el)),
      h('div', { class: 'touch-rotate-hint' }, h('i', { html: ICONS.rotate }), 'Rotate to landscape for the best experience'),
    );
    parent.append(this.root);

    const on = (el: HTMLElement, type: string, fn: (e: PointerEvent) => void) => {
      el.addEventListener(type, fn as EventListener, { passive: false });
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener));
    };

    // --- joystick ---
    on(this.moveZone, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.movePointer !== -1) return;
      this.movePointer = e.pointerId;
      this.moveZone.setPointerCapture(e.pointerId);
      const r = this.moveZone.getBoundingClientRect();
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = `${e.clientX - r.left}px`;
      this.stickBase.style.top = `${e.clientY - r.top}px`;
      this.stickBase.classList.add('active');
      this.updateStick(e.clientX, e.clientY);
    });
    on(this.moveZone, 'pointermove', (e) => {
      if (e.pointerId === this.movePointer) this.updateStick(e.clientX, e.clientY);
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.movePointer) return;
      this.movePointer = -1;
      this.moveX = this.moveY = 0;
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
      this.stickBase.classList.remove('active');
    };
    on(this.moveZone, 'pointerup', endMove);
    on(this.moveZone, 'pointercancel', endMove);

    // --- look surface (also used by a held FIRE button) ---
    const startLook = (e: PointerEvent, el: HTMLElement) => {
      el.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const moveLook = (e: PointerEvent) => {
      const p = this.lookPointers.get(e.pointerId);
      if (!p) return;
      this.lookDX += e.clientX - p.x;
      this.lookDY += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    };
    const endLook = (e: PointerEvent) => this.lookPointers.delete(e.pointerId);
    on(this.lookZone, 'pointerdown', (e) => {
      e.preventDefault();
      startLook(e, this.lookZone);
    });
    on(this.lookZone, 'pointermove', moveLook);
    on(this.lookZone, 'pointerup', endLook);
    on(this.lookZone, 'pointercancel', endLook);

    // --- buttons ---
    for (const [id, b] of Object.entries(this.buttons) as [ButtonId, ButtonState][]) {
      on(b.el, 'pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.held = true;
        b.edge = true;
        b.pointerId = e.pointerId;
        b.el.classList.add('pressed');
        if (id === 'fire') startLook(e, b.el);
        else b.el.setPointerCapture(e.pointerId);
      });
      if (id === 'fire') on(b.el, 'pointermove', moveLook);
      const release = (e: PointerEvent) => {
        if (e.pointerId !== b.pointerId) return;
        b.held = false;
        b.pointerId = -1;
        b.el.classList.remove('pressed');
        if (id === 'fire') endLook(e);
      };
      on(b.el, 'pointerup', release);
      on(b.el, 'pointercancel', release);
    }
    // Block browser gestures (pinch zoom, pull-to-refresh, long-press menus) over the controls.
    const block = (e: Event) => e.preventDefault();
    this.root.addEventListener('touchstart', block, { passive: false });
    this.root.addEventListener('touchmove', block, { passive: false });
    this.root.addEventListener('contextmenu', block);
  }

  private updateStick(x: number, y: number): void {
    const max = 56;
    let dx = x - this.moveOrigin.x;
    let dy = y - this.moveOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Small dead zone, then full range.
    const k = Math.max(0, Math.min(1, (Math.hypot(dx, dy) - 6) / (max - 6)));
    const ang = Math.atan2(dy, dx);
    this.moveX = Math.cos(ang) * k;
    this.moveY = -Math.sin(ang) * k;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.root.classList.toggle('hidden', !active);
    if (!active) this.reset();
  }

  /** Shows/hides contextual buttons (dash/grenade once unlocked, take near a crate, swap with 2+ weapons). */
  setAvailable(opts: { dash: boolean; grenade: boolean; take: boolean; swap: boolean }): void {
    this.buttons.dash.el.classList.toggle('hidden', !opts.dash);
    this.buttons.grenade.el.classList.toggle('hidden', !opts.grenade);
    this.buttons.take.el.classList.toggle('hidden', !opts.take);
    this.buttons.swap.el.classList.toggle('hidden', !opts.swap);
  }

  setCooldowns(dash: number, grenade: number): void {
    this.buttons.dash.el.style.setProperty('--cd', String(dash));
    this.buttons.grenade.el.style.setProperty('--cd', String(grenade));
  }

  poll(state: InputState): void {
    if (!this.active) return;
    const b = this.buttons;
    state.moveX += this.moveX;
    state.moveY += this.moveY;
    // Pixels → radians, scaled by the touch sensitivity setting.
    const k = 0.0055 * this.sensitivity;
    state.lookYaw += this.lookDX * k;
    state.lookPitch += this.lookDY * k;
    state.fire ||= b.fire.held;
    state.aim ||= b.aim.held;
    // Push the stick fully forward to sprint.
    state.sprint ||= this.moveY > 0.92;
    state.jumpPressed ||= b.jump.edge;
    state.jumpHeld ||= b.jump.held;
    state.reloadPressed ||= b.reload.edge;
    state.abilityPressed ||= b.dash.edge;
    state.grenadePressed ||= b.grenade.edge;
    state.interactPressed ||= b.take.edge;
    if (b.swap.edge) state.weaponCycle = 1;
    this.lookDX = this.lookDY = 0;
    for (const s of Object.values(b)) s.edge = false;
  }

  reset(): void {
    this.movePointer = -1;
    this.moveX = this.moveY = 0;
    this.lookPointers.clear();
    this.lookDX = this.lookDY = 0;
    this.stickBase.classList.remove('active');
    for (const s of Object.values(this.buttons)) {
      s.held = s.edge = false;
      s.pointerId = -1;
      s.el.classList.remove('pressed');
    }
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.root.remove();
  }
}
