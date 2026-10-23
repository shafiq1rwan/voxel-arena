import type { QualityLevel } from '../config';
import type { CrosshairColor, Settings } from '../progression/SaveManager';
import { h } from './dom';

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

/** Modal settings dialog shared by the main menu and pause menu. Changes apply live and are saved. */
export class SettingsPanel {
  readonly root: HTMLElement;
  onChange: ((patch: Partial<Settings>) => void) | null = null;
  onClose: (() => void) | null = null;
  private inputs: { [K in keyof Settings]?: HTMLInputElement | HTMLSelectElement } = {};
  private labels: Partial<Record<keyof Settings, HTMLElement>> = {};
  private formatters: Partial<Record<keyof Settings, (v: number) => string>> = {};
  private touchGroup: HTMLElement;

  constructor(parent: HTMLElement) {
    const slider = (key: NumberKey, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const value = h('span', { class: 'setting-value' });
      const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        value.textContent = fmt(v);
        this.onChange?.({ [key]: v } as Partial<Settings>);
      });
      this.inputs[key] = input;
      this.labels[key] = value;
      this.formatters[key] = fmt;
      return h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, label), input, value);
    };
    const toggle = (key: BoolKey, label: string) => {
      const input = h('input', { type: 'checkbox', class: 'toggle', 'aria-label': label });
      input.addEventListener('change', () => this.onChange?.({ [key]: input.checked } as Partial<Settings>));
      this.inputs[key] = input;
      return h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, label), input);
    };
    const select = <K extends keyof Settings>(key: K, label: string, options: [string, string][]) => {
      const el = h('select', { 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v }, t)));
      el.addEventListener('change', () => this.onChange?.({ [key]: el.value } as Partial<Settings>));
      this.inputs[key] = el;
      return h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, label), el);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    const close = h('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.onClose?.());

    this.touchGroup = h(
      'div',
      { class: 'settings-group' },
      h('h3', null, 'Touch'),
      slider('touchSensitivity', 'Look sensitivity', 0.3, 2.5, 0.05, (v) => v.toFixed(2)),
      toggle('aimAssist', 'Aim assist'),
      toggle('autoFire', 'Auto-fire on target'),
      slider('buttonScale', 'Button size', 0.75, 1.35, 0.05, pct),
    );

    this.root = h(
      'div',
      { class: 'modal hidden', role: 'dialog', 'aria-label': 'Settings' },
      h(
        'div',
        { class: 'panel modal-card settings-card' },
        h('span', { class: 'panel-tag' }, 'SETTINGS'),
        h('h2', { class: 'modal-title' }, 'SETTINGS'),
        h('div', { class: 'settings-group' }, h('h3', null, 'Mouse'), slider('mouseSensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)), toggle('invertY', 'Invert Y axis')),
        this.touchGroup,
        h(
          'div',
          { class: 'settings-group' },
          h('h3', null, 'Display'),
          slider('fov', 'Field of view', 55, 90, 1, (v) => `${Math.round(v)}°`),
          select('quality', 'Graphics quality', [
            ['low', 'Low (best performance)'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ]),
          slider('hudScale', 'HUD size', 0.75, 1.25, 0.05, pct),
          select('crosshairColor', 'Crosshair colour', [
            ['white', 'White'],
            ['green', 'Green'],
            ['yellow', 'Yellow'],
            ['cyan', 'Cyan'],
            ['magenta', 'Magenta'],
          ] satisfies [CrosshairColor, string][]),
          toggle('showFps', 'Show FPS'),
        ),
        h(
          'div',
          { class: 'settings-group' },
          h('h3', null, 'Accessibility'),
          slider('cameraShake', 'Camera shake', 0, 1, 0.05, pct),
          toggle('headBob', 'Head bob'),
          toggle('reduceFlashing', 'Reduce flashing'),
        ),
        h('div', { class: 'settings-group' }, h('h3', null, 'Audio'), slider('volume', 'Master volume', 0, 1, 0.05, pct)),
        h('p', { class: 'settings-note' }, 'Changes apply immediately and are saved on this device.'),
        h('div', { class: 'modal-actions' }, close),
      ),
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose?.();
    });
    parent.append(this.root);
  }

  open(settings: Settings, isTouch: boolean): void {
    this.touchGroup.classList.toggle('hidden', !isTouch);
    for (const [k, el] of Object.entries(this.inputs) as [keyof Settings, HTMLInputElement | HTMLSelectElement][]) {
      const v = settings[k];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = String(v);
      const label = this.labels[k];
      const fmt = this.formatters[k];
      if (label && fmt) label.textContent = fmt(Number(v));
    }
    this.root.classList.remove('hidden');
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }
}

export type { QualityLevel };
