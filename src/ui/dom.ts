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

export const ICONS = {
  skull:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 1.5C6.6 1.5 2.5 5.4 2.5 10.6c0 3 1.4 5.5 3.6 7V21a1.5 1.5 0 0 0 1.5 1.5h1.6v-2.2h1.8v2.2h2v-2.2h1.8v2.2h1.6a1.5 1.5 0 0 0 1.5-1.5v-3.4c2.2-1.5 3.6-4 3.6-7 0-5.2-4.1-9.1-9.5-9.1zM8.3 9.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zm7.4 0a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM12 14.6l1.4 2.4h-2.8z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#b9810c"/><circle cx="12" cy="11.3" r="10" fill="#f6bd23"/><circle cx="12" cy="11.3" r="6.6" fill="none" stroke="#ffdd70" stroke-width="1.6"/><path fill="#fff3c2" d="M7.4 7.5a6.5 6.5 0 0 1 4-2.4l.3 1.4a5 5 0 0 0-3.1 1.9z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>',
  gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 1h2v2h2V2h1v1h1v1h-1v2h2v2h-2v2h1v1h-1v1h-1v-1H9v2H7v-2H5v1H4v-1H3v-1h1V9H2V7h2V5H3V4h1V3h1v1h2zm0 5v4h2V6z"/></svg>',
  heart: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3h4v1h1v1h2V4h1V3h4v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2V4h1z"/></svg>',
};
