import type { QualityLevel } from '../config';
import type { Settings } from '../progression/SaveManager';
import { h } from './dom';

/** Modal settings dialog shared by the main menu and pause menu. Changes apply live. */
export class SettingsPanel {
  readonly root: HTMLElement;
  onChange: ((patch: Partial<Settings>) => void) | null = null;
  onClose: (() => void) | null = null;
  private inputs: { [K in keyof Settings]?: HTMLInputElement | HTMLSelectElement } = {};
  private labels: Partial<Record<keyof Settings, HTMLElement>> = {};

  constructor(parent: HTMLElement) {
    const slider = (key: 'mouseSensitivity' | 'fov' | 'volume', label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const value = h('span', { class: 'setting-value' });
      const input = h('input', { type: 'range', min, max, step });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        value.textContent = fmt(v);
        this.onChange?.({ [key]: v } as Partial<Settings>);
      });
      this.inputs[key] = input;
      this.labels[key] = value;
      (input as HTMLInputElement & { fmt?: (v: number) => string }).fmt = fmt;
      return h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, label), input, value);
    };
    const toggle = (key: 'invertY' | 'showFps', label: string) => {
      const input = h('input', { type: 'checkbox', class: 'toggle' });
      input.addEventListener('change', () => this.onChange?.({ [key]: input.checked } as Partial<Settings>));
      this.inputs[key] = input;
      return h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, label), input);
    };
    const quality = h('select', null, h('option', { value: 'low' }, 'Low (best performance)'), h('option', { value: 'medium' }, 'Medium'), h('option', { value: 'high' }, 'High'));
    quality.addEventListener('change', () => this.onChange?.({ quality: quality.value as QualityLevel }));
    this.inputs.quality = quality;

    const close = h('button', { class: 'btn btn-primary' }, 'DONE');
    close.addEventListener('click', () => this.onClose?.());

    this.root = h(
      'div',
      { class: 'modal hidden', role: 'dialog', 'aria-label': 'Settings' },
      h(
        'div',
        { class: 'panel modal-card' },
        h('h2', { class: 'modal-title' }, 'SETTINGS'),
        h('div', { class: 'settings-group' }, h('h3', null, 'Controls'), slider('mouseSensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)), toggle('invertY', 'Invert Y axis')),
        h(
          'div',
          { class: 'settings-group' },
          h('h3', null, 'Display'),
          slider('fov', 'Field of view', 55, 90, 1, (v) => `${Math.round(v)}°`),
          h('label', { class: 'setting' }, h('span', { class: 'setting-name' }, 'Graphics quality'), quality),
          toggle('showFps', 'Show FPS'),
        ),
        h('div', { class: 'settings-group' }, h('h3', null, 'Audio'), slider('volume', 'Master volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)),
        h('div', { class: 'modal-actions' }, close),
      ),
    );
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose?.();
    });
    parent.append(this.root);
  }

  open(settings: Settings): void {
    for (const [k, el] of Object.entries(this.inputs) as [keyof Settings, HTMLInputElement | HTMLSelectElement][]) {
      const v = settings[k];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = String(v);
      const label = this.labels[k];
      const fmt = (el as HTMLInputElement & { fmt?: (v: number) => string }).fmt;
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
