import { hash2, type SeededRandom } from '../core/SeededRandom';
import { CellKind, cellIndex, type ArenaData, type DecorBox, type DecorSlot, type ThemeId } from './ArenaTypes';

/**
 * Fortress set dressing for every theme. A shared skeleton (wall bays, cornice, merlons, one
 * gatehouse per wall, pillar capitals) is dressed by a per-theme kit:
 *
 *  - ruins      Emberwatch Ruins   amber lanterns, moss and vines, puffy clouds
 *  - industrial Foundry Citadel    caged sodium lamps, shutter doors, hazard stripes, pipes, rust, smokestacks
 *  - frozen     Frostspire Keep    frost braziers, snow caps, icicles, stepped ice spires
 *  - neon       Neon Citadel       neon-outlined bays, holo signs, glowing edge trims, antenna towers
 *
 * Collision rule: decoration never changes the heightmap. Anything in the player's reach is either
 * pressed flat against a wall (relief ≤ ~1 cm) or sits on top of an existing solid column; only
 * geometry above the perimeter's reachable height may protrude.
 */

/** Perimeter geometry with its bottom above this height is out of the player's reach. */
const SAFE_PERIMETER_Y = 3.4;

type Light = number | undefined;

interface Kit {
  bay(f: Facade, side: number, u: number): void;
  lantern(f: Facade, side: number, u: number): void;
  growth(f: Facade, side: number, u: number, rng: SeededRandom): void;
  merlon(f: Facade, side: number, u: number): void;
  gatehouseRoof(f: Facade, side: number, u: number, height: number, rng: SeededRandom): void;
  column(c: ColumnCtx): void;
  sky(f: Facade, rng: SeededRandom): void;
}

interface Facade {
  n: number;
  /** Relief on the inner wall face (flattened below the cornice). */
  face(side: number, u: number, y: number, depth: number, w: number, h: number, d: number, slot: DecorSlot, light?: Light): void;
  /** Raw placement in wall space, no flattening (only for out-of-reach geometry). */
  place(side: number, u: number, y: number, depth: number, w: number, h: number, d: number, slot: DecorSlot, light?: Light): void;
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, slot: DecorSlot, light?: Light): void;
}

interface ColumnCtx {
  f: Facade;
  data: ArenaData;
  x: number;
  z: number;
  h: number;
  kind: CellKind;
  /** Height of the neighbour in each direction (+x, -x, +z, -z). */
  nb: [number, number, number, number];
}

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function fortressDecor(data: ArenaData, rng: SeededRandom): DecorBox[] {
  const out: DecorBox[] = [];
  const n = data.size;
  const box: Facade['box'] = (x, y, z, sx, sy, sz, slot, light) => {
    const b: DecorBox = { x, y, z, sx, sy, sz, slot };
    if (light) b.light = light;
    out.push(b);
  };
  // Wall space: `u` runs along the wall, `depth` is measured inward from the outer edge (inner face at 1).
  const place: Facade['place'] = (side, u, y, depth, w, h, d, slot, light) => {
    if (side === 0) box(u, y, depth, w, h, d, slot, light);
    if (side === 1) box(n - depth, y, u, d, h, w, slot, light);
    if (side === 2) box(n - u, y, n - depth, w, h, d, slot, light);
    if (side === 3) box(depth, y, n - u, d, h, w, slot, light);
  };
  const face: Facade['face'] = (side, u, y, depth, w, h, d, slot, light) => {
    // Surface relief sits just in front of the heightmap wall instead of being buried behind it.
    if (depth >= 0.8 && y < 4.9) {
      depth = 1.012 + (depth - 0.8) * 0.2;
      d = 0.012;
    }
    place(side, u, y, depth, w, h, d, slot, light);
  };
  const f: Facade = { n, face, place, box };
  const kit = KITS[data.themeId];

  for (let side = 0; side < 4; side++) {
    // --- Wall bays: framed recesses with pilasters, a stepped lintel and a light source ---
    for (let u = 3; u < n - 2; u += 6) {
      kit.bay(f, side, u);
      for (const sign of [-1, 1]) {
        face(side, u + sign * 1.42, 2.3, 0.91, 0.38, 4.6, 0.18, 'backdrop');
        face(side, u + sign * 1.42, 0.25, 0.91, 0.6, 0.5, 0.18, 'accent');
        face(side, u + sign * 1.42, 4.45, 0.91, 0.65, 0.35, 0.18, 'backdropDark');
      }
      face(side, u, 3.75, 0.94, 2.6, 0.4, 0.12, 'backdrop');
      face(side, u, 4.15, 0.94, 1.85, 0.4, 0.12, 'backdrop');
      face(side, u, 4.5, 0.94, 1.05, 0.3, 0.12, 'accent');
      kit.lantern(f, side, u);
      // Cornice and parapet.
      face(side, u, 5.25, 0.38, 6, 0.38, 1.12, 'backdropDark');
      face(side, u, 5.52, 0.38, 6, 0.16, 1.2, 'accent');
      kit.merlon(f, side, u);
      if ((u + side) % 3 === 0) kit.growth(f, side, u, rng);
    }

    // --- Gatehouse: a landmark tower per wall with masonry courses, buttresses and lit windows ---
    const towerU = side % 2 === 0 ? n * 0.64 : n * 0.38;
    const height = side === 2 ? 16 : 12 + side;
    face(side, towerU, height / 2, -2.1, 5.8, height, 5.8, 'backdropDark');
    for (let y = 0.35; y < height; y += 0.65) {
      for (let k = 0; k < 6; k++) {
        const uu = towerU - 2.45 + k * 0.98;
        face(side, uu, y, 0.83, 0.95, 0.61, 0.1, (k + Math.round(y * 2)) % 4 === 0 ? 'backdropDark' : 'backdrop');
      }
    }
    for (const edge of [-2.65, 2.65]) face(side, towerU + edge, height / 2, 0.74, 0.65, height, 0.42, 'backdropDark');
    for (const y of [6, height - 1.5]) {
      face(side, towerU, y, -2.1, 6.4, 0.42, 6.4, 'accent');
      for (const off of [-1.1, 1.1]) {
        face(side, towerU + off, y + 1.15, 0.9, 0.7, 1.25, 0.06, 'trim');
        face(side, towerU + off, y + 1.15, 0.94, 0.28, 0.83, 0.04, 'glow');
      }
    }
    face(side, towerU, height + 0.1, -2.1, 6.7, 0.5, 6.7, 'backdropDark');
    kit.gatehouseRoof(f, side, towerU, height, rng);
  }

  kit.sky(f, rng);

  // --- Interior: dress existing solid columns only (no new obstacles on the floor) ---
  const heightAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 99 : data.heights[cellIndex(n, x, z)]!);
  for (let z = 2; z < n - 2; z++) {
    for (let x = 2; x < n - 2; x++) {
      const i = cellIndex(n, x, z);
      const h = data.heights[i]!;
      const kind = data.kinds[i] as CellKind;
      if (h < 1 || kind === CellKind.Stair || kind === CellKind.Platform) continue;
      if (kind === CellKind.Pillar) {
        // Capital and base, 2 cm proud of the column so they don't z-fight with its faces.
        box(x + 0.5, h - 0.18, z + 0.5, 1.04, 0.36, 1.04, 'backdropDark');
        box(x + 0.5, 0.18, z + 0.5, 1.04, 0.36, 1.04, 'backdrop');
      }
      const nb = DIRS.map(([dx, dz]) => heightAt(x + dx, z + dz)) as [number, number, number, number];
      kit.column({ f, data, x, z, h, kind, nb });
    }
  }
  return out;
}

// ------------------------------------------------------------------ shared pieces

function standardMerlons(f: Facade, side: number, u: number, slot: DecorSlot = 'backdrop'): void {
  for (let a = -2; a <= 2; a += 2) f.face(side, u + a, 6.1, 0.38, 0.95, 1.0, 1.1, slot);
}

/** Domed voxel cloud: a flat base with stacked, offset lumps so it reads as a puff from any angle. */
function cloud(f: Facade, x: number, y: number, z: number, s: number, rng: SeededRandom, slot: DecorSlot = 'cloud'): void {
  f.box(x, y, z, 10 * s, 2.2 * s, 6 * s, slot);
  f.box(x + rng.range(-1.5, 1.5) * s, y + 2 * s, z + rng.range(-0.6, 0.6) * s, 6.5 * s, 2.4 * s, 4.6 * s, slot);
  f.box(x + rng.range(-1, 1) * s, y + 3.8 * s, z, 3.4 * s, 1.8 * s, 3 * s, slot);
  f.box(x + rng.range(3, 4.5) * s, y + 1 * s, z + rng.range(-1, 1) * s, 4.2 * s, 2.6 * s, 4 * s, slot);
  f.box(x - rng.range(3, 4.5) * s, y + 0.8 * s, z + rng.range(-1, 1) * s, 3.8 * s, 2.2 * s, 3.6 * s, slot);
}

function cloudRing(f: Facade, rng: SeededRandom, count: number, slot: DecorSlot = 'cloud'): void {
  const c = f.n / 2;
  for (let k = 0; k < count; k++) {
    const ang = (k / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = c + rng.range(18, 40);
    cloud(f, c + Math.cos(ang) * dist, rng.range(24, 34), c + Math.sin(ang) * dist, rng.range(0.8, 1.5), rng, slot);
  }
}

/** Faces of a column that look down onto lower ground: callback gets wall-face centre and outward normal. */
function exposedFaces(c: ColumnCtx, minDrop: number, fn: (fx: number, fz: number, dx: number, dz: number, drop: number) => void): void {
  DIRS.forEach(([dx, dz], k) => {
    const drop = c.h - c.nb[k]!;
    if (drop < minDrop) return;
    fn(c.x + 0.5 + dx * 0.5, c.z + 0.5 + dz * 0.5, dx, dz, drop);
  });
}

// ------------------------------------------------------------------ theme kits

const ruins: Kit = {
  bay(f, side, u) {
    f.face(side, u, 2.25, 0.88, 2.6, 3.9, 0.16, 'trim');
  },
  lantern(f, side, u) {
    // Metal-framed amber lantern.
    f.face(side, u + 1.4, 2.7, 0.96, 0.46, 0.76, 0.08, 'trim');
    f.face(side, u + 1.4, 2.7, 0.99, 0.28, 0.48, 0.02, 'glow2', 5.5);
    for (const y of [2.37, 3.03]) f.face(side, u + 1.4, y, 0.98, 0.52, 0.12, 0.04, 'accent');
  },
  growth(f, side, u) {
    // Hanging vines.
    for (let k = 0; k < 6; k++) f.face(side, u - 1.5 + (k % 2) * 0.28, 4.9 - k * 0.4, 0.99, 0.5, 0.45, 0.02, 'detail');
  },
  merlon: (f, side, u) => standardMerlons(f, side, u),
  gatehouseRoof(f, side, u, height) {
    for (let a = -2.5; a <= 2.5; a += 1.25) {
      f.face(side, u + a, height + 0.8, 0.74, 0.8, 1.2, 1.0, 'backdrop');
      if (Math.abs(a) > 2) f.face(side, u + a, height + 1.55, 0.74, 0.2, 0.45, 0.25, 'glow');
    }
  },
  column({ f, data, x, z, h }) {
    // Moss on a quarter of the tops, trailing down one face.
    if (hash2(x, z, data.seed) >= 0.25) return;
    f.box(x + 0.5, h + 0.025, z + 0.5, 0.96, 0.05, 0.96, 'detail');
    for (let k = 0; k < 3; k++) f.box(x + 0.28 + k * 0.16, h - 0.16 - k * 0.2, z + 1.006, 0.2, 0.34, 0.018, 'detail');
  },
  sky: (f, rng) => cloudRing(f, rng, 7),
};

const industrial: Kit = {
  bay(f, side, u) {
    // Roller shutter: dark recess with horizontal slats and a hazard-striped sill.
    f.face(side, u, 2.25, 0.88, 2.6, 3.9, 0.16, 'trim');
    for (let y = 0.7; y < 4; y += 0.42) f.face(side, u, y, 0.9, 2.3, 0.07, 0.04, 'backdropDark');
    for (let k = 0; k < 6; k++) f.face(side, u - 1.1 + k * 0.44, 0.16, 0.95, 0.44, 0.32, 0.04, k % 2 ? 'accent' : 'trim');
  },
  lantern(f, side, u) {
    // Caged sodium lamp.
    f.face(side, u + 1.4, 2.75, 0.96, 0.5, 0.62, 0.08, 'trim');
    f.face(side, u + 1.4, 2.75, 0.99, 0.34, 0.44, 0.02, 'glow', 5.5);
    for (const o of [-0.09, 0.09]) f.face(side, u + 1.4 + o, 2.75, 1.0, 0.04, 0.5, 0.02, 'accent');
  },
  growth(f, side, u, rng) {
    // Rust streaks running down from the cornice.
    for (let k = 0; k < 3; k++) {
      const len = rng.range(0.8, 2.2);
      f.face(side, u - 2 + k * 1.9 + rng.range(-0.3, 0.3), 4.95 - len / 2, 0.99, rng.range(0.12, 0.22), len, 0.02, 'detail');
    }
  },
  merlon(f, side, u) {
    for (let a = -2; a <= 2; a += 2) {
      f.face(side, u + a, 6.05, 0.38, 1.0, 0.9, 1.1, 'backdrop');
      f.face(side, u + a, 6.55, 0.38, 1.04, 0.1, 1.14, 'accent');
    }
    // Pipe run along the top of the wall, above anything the player can reach.
    f.place(side, u, 4.62, 1.17, 6.02, 0.3, 0.34, 'trim');
    f.place(side, u - 2, 4.62, 1.2, 0.12, 0.42, 0.42, 'accent');
    f.place(side, u + 1, 4.62, 1.2, 0.12, 0.42, 0.42, 'accent');
  },
  gatehouseRoof(f, side, u, height, rng) {
    // Twin smokestacks with glowing furnace bands, venting smoke.
    for (const off of [-1.6, 1.6]) {
      f.face(side, u + off, height + 3.2, -2.1, 1.3, 6, 1.3, 'backdropDark');
      f.face(side, u + off, height + 5.4, -2.1, 1.45, 0.3, 1.45, 'accent');
      f.face(side, u + off, height + 1.2, -2.1, 1.36, 0.25, 1.36, 'glow');
      // Rising smoke plume: puffs grow and drift with height.
      for (let k = 0; k < 4; k++) {
        const s = 1.2 + k * 0.55;
        f.place(side, u + off + k * 0.7 + rng.range(-0.3, 0.3), height + 7 + k * 1.9, -2.1 - k * 0.6, 1.5 * s, 1.4 * s, 1.5 * s, 'cloud');
      }
    }
  },
  column({ f, data, x, z, h }) {
    if (hash2(x, z, data.seed + 7) < 0.35) f.box(x + 0.5, h + 0.025, z + 0.5, 1.02, 0.05, 1.02, 'trim');
  },
  sky: (f, rng) => cloudRing(f, rng, 5),
};

const frozen: Kit = {
  bay(f, side, u) {
    f.face(side, u, 2.25, 0.88, 2.6, 3.9, 0.16, 'trim');
    // Frost rime along the bay sill.
    f.face(side, u, 0.08, 0.95, 2.4, 0.16, 0.04, 'cloud');
  },
  lantern(f, side, u) {
    // Frost brazier: iron bowl with a cold blue flame.
    f.face(side, u + 1.4, 2.45, 0.96, 0.56, 0.22, 0.08, 'trim');
    f.face(side, u + 1.4, 2.82, 0.99, 0.3, 0.52, 0.02, 'glow2', 5.5);
    f.face(side, u + 1.4, 2.2, 0.97, 0.12, 0.3, 0.04, 'trim');
  },
  growth(f, side, u, rng) {
    // Icicles hanging from the cornice: real 3D geometry, but only above the reachable height.
    for (let k = 0; k < 9; k++) {
      const len = rng.range(0.25, 1.0);
      const top = 5.0;
      if (top - len < SAFE_PERIMETER_Y) continue;
      f.place(side, u - 2.6 + k * 0.65 + rng.range(-0.1, 0.1), top - len / 2, 1.08, 0.09, len, 0.09, 'detail');
    }
  },
  merlon(f, side, u) {
    standardMerlons(f, side, u);
    // Snow on the parapet and merlon tops.
    f.face(side, u, 5.64, 0.38, 6.02, 0.08, 1.22, 'cloud');
    for (let a = -2; a <= 2; a += 2) f.face(side, u + a, 6.64, 0.38, 1.0, 0.08, 1.14, 'cloud');
  },
  gatehouseRoof(f, side, u, height) {
    // Stepped ice spire with a crystal finial.
    f.face(side, u, height + 1.6, -2.1, 4.6, 2.6, 4.6, 'backdrop');
    f.face(side, u, height + 2.95, -2.1, 4.7, 0.1, 4.7, 'cloud');
    f.face(side, u, height + 4.2, -2.1, 3.0, 2.4, 3.0, 'backdropDark');
    f.face(side, u, height + 5.45, -2.1, 3.1, 0.1, 3.1, 'cloud');
    f.face(side, u, height + 6.5, -2.1, 1.4, 2.1, 1.4, 'backdrop');
    f.face(side, u, height + 8.1, -2.1, 0.5, 1.2, 0.5, 'glow2');
  },
  column(c) {
    const { f, x, z, h } = c;
    // Snow cap on every solid top.
    f.box(x + 0.5, h + 0.03, z + 0.5, 1.02, 0.06, 1.02, 'cloud');
    // Small icicles on tall walls, barely proud of the face so collision stays honest.
    if (h >= 2.5 && hash2(x, z, c.data.seed + 3) < 0.35) {
      exposedFaces(c, 1.5, (fx, fz, dx, dz) => {
        for (let k = 0; k < 3; k++) {
          const along = -0.3 + k * 0.3;
          const len = 0.25 + hash2(x * 3 + k, z, 5) * 0.4;
          f.box(fx + dx * 0.025 + (dz !== 0 ? along : 0), h - len / 2, fz + dz * 0.025 + (dx !== 0 ? along : 0), dz !== 0 ? 0.07 : 0.05, len, dx !== 0 ? 0.07 : 0.05, 'detail');
        }
      });
    }
  },
  sky: (f, rng) => cloudRing(f, rng, 9),
};

const neon: Kit = {
  bay(f, side, u) {
    // Dark recess outlined in neon.
    f.face(side, u, 2.25, 0.88, 2.6, 3.9, 0.16, 'trim');
    for (const s of [-1, 1]) f.face(side, u + s * 1.27, 2.2, 0.97, 0.07, 3.8, 0.02, 'glow');
    f.face(side, u, 4.16, 0.97, 2.6, 0.07, 0.02, 'glow');
    // Floor-level light strip.
    f.face(side, u, 0.35, 0.97, 6, 0.06, 0.02, 'glow2');
  },
  lantern(f, side, u) {
    // Holo sign panel.
    f.face(side, u + 1.4, 2.95, 0.96, 0.9, 0.62, 0.08, 'trim');
    f.face(side, u + 1.4, 2.95, 0.99, 0.76, 0.48, 0.02, 'glow2', 5);
    f.face(side, u + 1.4, 2.95, 1.0, 0.5, 0.06, 0.02, 'trim');
  },
  growth(f, side, u, rng) {
    // Cable runs dropping from the cornice.
    for (let k = 0; k < 3; k++) {
      const len = rng.range(1.5, 3.2);
      f.face(side, u - 2.2 + k * 0.22, 4.95 - len / 2, 0.99, 0.08, len, 0.02, 'detail');
    }
  },
  merlon(f, side, u) {
    standardMerlons(f, side, u);
    for (let a = -2; a <= 2; a += 2) f.face(side, u + a, 6.62, 0.38, 0.97, 0.05, 1.12, 'glow');
  },
  gatehouseRoof(f, side, u, height) {
    // Neon bands up the tower face, a holo screen and a radio mast.
    for (let k = 0, y = 2.5; y < height - 2; k++, y += 3) f.face(side, u, y, 0.86, 5.9, 0.1, 0.06, k % 2 ? 'glow' : 'glow2');
    f.face(side, u, height - 4, 0.88, 3.4, 2.0, 0.05, 'glow2');
    f.face(side, u, height + 4, -2.1, 0.22, 8, 0.22, 'trim');
    f.face(side, u, height + 8.1, -2.1, 0.4, 0.4, 0.4, 'glow');
    for (let a = -2.5; a <= 2.5; a += 1.25) f.face(side, u + a, height + 0.8, 0.74, 0.8, 1.2, 1.0, 'backdrop');
  },
  column(c) {
    const { f, x, z, h } = c;
    // Glowing trim along top edges that overlook lower ground.
    const slot: DecorSlot = hash2(x, z, c.data.seed + 11) < 0.5 ? 'glow' : 'glow2';
    exposedFaces(c, 0.9, (fx, fz, dx, dz) => {
      const along = dz !== 0;
      f.box(fx + dx * 0.02, h - 0.05, fz + dz * 0.02, along ? 1.0 : 0.04, 0.06, along ? 0.04 : 1.0, slot);
    });
  },
  sky(f, rng) {
    // Distant dark towers with lit window grids instead of clouds.
    const c = f.n / 2;
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const dist = c + rng.range(14, 26);
      const x = c + Math.cos(ang) * dist;
      const z = c + Math.sin(ang) * dist;
      const w = rng.range(4, 7);
      const h = rng.range(14, 28);
      f.box(x, h / 2 - 2, z, w, h + 4, w, rng.chance(0.5) ? 'backdrop' : 'backdropDark');
      const fx = -Math.cos(ang);
      const fz = -Math.sin(ang);
      const faceX = Math.abs(fx) > Math.abs(fz);
      for (let r = 2; r < h / 1.6; r++) {
        if (!rng.chance(0.55)) continue;
        const off = rng.range(-0.3, 0.3);
        f.box(
          x + (faceX ? Math.sign(fx) * (w / 2 + 0.03) : off * w),
          r * 1.6,
          z + (faceX ? off * w : Math.sign(fz) * (w / 2 + 0.03)),
          faceX ? 0.06 : 0.8,
          0.5,
          faceX ? 0.8 : 0.06,
          rng.chance(0.5) ? 'glow' : 'glow2',
        );
      }
    }
  },
};

const KITS: Record<ThemeId, Kit> = { ruins, industrial, frozen, neon };
