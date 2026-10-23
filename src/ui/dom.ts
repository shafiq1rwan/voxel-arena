type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper for building DOM without a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void)> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (typeof v === 'boolean') {
        if (v) el.setAttribute(k, '');
      } else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Sets textContent only when it changed (avoids layout thrash in per-frame HUD updates). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setStyle(el: HTMLElement, prop: string, value: string): void {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

export { ICONS } from './icons';
