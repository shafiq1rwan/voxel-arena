import type { ArenaData, DecorBox, DecorSlot } from '../procedural/ArenaTypes';
import { CellKind, cellIndex } from '../procedural/ArenaTypes';
import { hash2 } from '../core/SeededRandom';

/** Fortress set dressing. Tall additions stay inside the solid perimeter or outside the map;
 * interior details stay on existing solid columns, leaving the navigation heightmap authoritative. */
export function fortressDecor(data: ArenaData): DecorBox[] {
  const out: DecorBox[] = [];
  const n = data.size;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, slot: DecorSlot) =>
    out.push({ x, y, z, sx, sy, sz, slot });

  // Transform local facade coordinates onto any of the four perimeter walls.
  const facade = (side: number, u: number, y: number, depth: number, w: number, h: number, d: number, slot: DecorSlot) => {
    // Surface relief must sit just in front of the heightmap wall, not be buried behind it.
    if (depth >= 0.8 && y < 4.9) { depth = 1.012 + (depth - 0.8) * 0.2; d = 0.012; }
    if (side === 0) box(u, y, depth, w, h, d, slot);
    if (side === 1) box(n - depth, y, u, d, h, w, slot);
    if (side === 2) box(n - u, y, n - depth, w, h, d, slot);
    if (side === 3) box(depth, y, n - u, d, h, w, slot);
  };
  for (let side = 0; side < 4; side++) {
    // Framed wall bays, inset doors and stepped arches. All below-wall geometry ends at depth 1.
    for (let u = 3; u < n - 2; u += 6) {
      facade(side, u, 2.25, 0.88, 2.6, 3.9, 0.16, 'trim');
      for (const sign of [-1, 1]) {
        facade(side, u + sign * 1.42, 2.3, 0.91, 0.38, 4.6, 0.18, 'backdrop');
        facade(side, u + sign * 1.42, 0.25, 0.91, 0.6, 0.5, 0.18, 'accent');
        facade(side, u + sign * 1.42, 4.45, 0.91, 0.65, 0.35, 0.18, 'backdropDark');
      }
      facade(side, u, 3.75, 0.94, 2.6, 0.4, 0.12, 'backdrop');
      facade(side, u, 4.15, 0.94, 1.85, 0.4, 0.12, 'backdrop');
      facade(side, u, 4.5, 0.94, 1.05, 0.3, 0.12, 'accent');
      // Metal-framed amber lantern, rather than an unframed glowing square.
      facade(side, u + 1.4, 2.7, 0.96, 0.46, 0.76, 0.08, 'trim');
      facade(side, u + 1.4, 2.7, 0.99, 0.28, 0.48, 0.02, 'glow2');
      for (const y of [2.37, 3.03]) facade(side, u + 1.4, y, 0.98, 0.52, 0.12, 0.04, 'accent');
      // Upper cornice, parapet and alternating merlons.
      facade(side, u, 5.25, 0.38, 6, 0.38, 1.12, 'backdropDark');
      facade(side, u, 5.52, 0.38, 6, 0.16, 1.2, 'accent');
      for (let a = -2; a <= 2; a += 2) facade(side, u + a, 6.1, 0.38, 0.95, 1.0, 1.1, 'backdrop');
      if ((u + side) % 3 === 0) {
        for (let k = 0; k < 6; k++) {
          facade(side, u - 1.5 + (k % 2) * 0.28, 4.9 - k * 0.4, 0.99, 0.5, 0.45, 0.02, 'detail');
        }
      }
    }

    // A landmark gatehouse per wall, with masonry courses, buttresses and glowing slit windows.
    const towerU = side % 2 === 0 ? n * 0.64 : n * 0.38;
    const height = side === 2 ? 16 : 12 + side;
    facade(side, towerU, height / 2, -2.1, 5.8, height, 5.8, 'backdropDark');
    for (let y = 0.35; y < height; y += 0.65) {
      for (let k = 0; k < 6; k++) {
        const u = towerU - 2.45 + k * 0.98;
        facade(side, u, y, 0.83, 0.95, 0.61, 0.1, (k + Math.round(y * 2)) % 4 === 0 ? 'backdropDark' : 'backdrop');
      }
    }
    for (const edge of [-2.65, 2.65]) facade(side, towerU + edge, height / 2, 0.74, 0.65, height, 0.42, 'backdropDark');
    for (const y of [6, height - 1.5]) {
      facade(side, towerU, y, -2.1, 6.4, 0.42, 6.4, 'accent');
      for (const off of [-1.1, 1.1]) {
        facade(side, towerU + off, y + 1.15, 0.9, 0.7, 1.25, 0.06, 'trim');
        facade(side, towerU + off, y + 1.15, 0.94, 0.28, 0.83, 0.04, 'glow');
      }
    }
    facade(side, towerU, height + 0.1, -2.1, 6.7, 0.5, 6.7, 'backdropDark');
    for (let a = -2.5; a <= 2.5; a += 1.25) {
      facade(side, towerU + a, height + 0.8, 0.74, 0.8, 1.2, 1.0, 'backdrop');
      if (Math.abs(a) > 2) facade(side, towerU + a, height + 1.55, 0.74, 0.2, 0.45, 0.25, 'glow');
    }
    // Small block-built clouds high beyond the parapets.
    facade(side, 7, 24 + side, -36, 11, 0.9, 4, 'cloud');
    facade(side, 10, 25 + side, -36, 5, 1.1, 3, 'cloud');
  }

  // Broken capitals and moss attach only to already solid columns. No new floor obstacles.
  for (let z = 2; z < n - 2; z++) for (let x = 2; x < n - 2; x++) {
    const i = cellIndex(n, x, z);
    const h = data.heights[i]!;
    const kind = data.kinds[i]!;
    if (h < 1 || kind === CellKind.Stair || kind === CellKind.Platform) continue;
    if (kind === CellKind.Pillar) {
      box(x + 0.5, h - 0.18, z + 0.5, 1, 0.36, 1, 'backdropDark');
      box(x + 0.5, 0.18, z + 0.5, 1, 0.36, 1, 'backdrop');
    }
    if (hash2(x, z, data.seed) < 0.25) {
      box(x + 0.5, h + 0.025, z + 0.5, 0.96, 0.05, 0.96, 'detail');
      for (let k = 0; k < 3; k++) box(x + 0.28 + k * 0.16, h - 0.16 - k * 0.2, z + 1.006, 0.2, 0.34, 0.018, 'detail');
    }
  }
  return out;
}
