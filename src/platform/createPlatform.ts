import { MockPokiAdapter } from './MockPokiAdapter';
import type { PlatformAdapter } from './PlatformAdapter';
import { PokiAdapter } from './PokiAdapter';

/**
 * Uses the real Poki SDK when running on Poki (or the Poki Inspector) or when forced with
 * `?poki=1`; otherwise the mock adapter, so local development never loads remote scripts.
 */
export function createPlatform(): PlatformAdapter {
  const params = new URLSearchParams(location.search);
  if (params.has('mock')) return new MockPokiAdapter();
  const host = location.hostname;
  let onPoki = /(^|\.)poki\.(com|io|dev)$/.test(host) || /poki-gdn\.com$/.test(host);
  try {
    // Poki serves games inside an iframe; the referrer identifies the parent page.
    onPoki ||= /poki/.test(document.referrer);
  } catch {
    /* ignore */
  }
  return onPoki || params.has('poki') ? new PokiAdapter() : new MockPokiAdapter();
}
