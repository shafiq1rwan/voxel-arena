import { h } from './dom';

/** 5x6 bitmap glyphs for the blocky title. */
const GLYPHS: Record<string, string[]> = {
  V: ['1...1', '1...1', '1...1', '.1.1.', '.1.1.', '..1..'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '.111.'],
  X: ['1...1', '.1.1.', '..1..', '..1..', '.1.1.', '1...1'],
  E: ['11111', '1....', '1111.', '1....', '1....', '11111'],
  L: ['1....', '1....', '1....', '1....', '1....', '11111'],
};

/** Renders the VOXEL / SURVIVAL ARENA logo as crisp CSS voxel blocks (no image assets). */
export function createPixelLogo(size: 'large' | 'small' = 'large'): HTMLElement {
  const word = h('div', { class: 'logo-word', 'aria-hidden': 'true' });
  for (const ch of 'VOXEL') {
    const glyph = GLYPHS[ch]!;
    const g = h('div', { class: 'logo-glyph' });
    for (const row of glyph) {
      for (const cell of row) g.append(h('span', { class: cell === '1' ? 'on' : '' }));
    }
    word.append(g);
  }
  return h('div', { class: `logo logo-${size}`, role: 'img', 'aria-label': 'Voxel Survival Arena' }, word, h('div', { class: 'logo-sub' }, 'SURVIVAL ARENA'));
}
