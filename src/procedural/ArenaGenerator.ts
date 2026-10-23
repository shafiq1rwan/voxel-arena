import { SeededRandom } from '../core/SeededRandom';
import {
  CellKind,
  THEME_IDS,
  cellIndex,
  type ArenaData,
  type ArenaOptions,
  type DecorBox,
  type GridPoint,
  type SymmetryMode,
  type ThemeId,
} from './ArenaTypes';
import { computeReachable, fillUnreachablePockets, validateArena } from './ArenaValidator';

/**
 * Seeded arena generator.
 *
 * Pipeline: boundary ring -> symmetric structure stamping (walls, cover, pillars, platforms with
 * stairs) -> pocket repair -> spawn/pickup selection -> validation. If validation fails, the
 * generator retries with a deterministic derived seed, so identical seeds always give identical maps.
 */

const MAX_ATTEMPTS = 12;
const PLATFORM_HEIGHT = 2;

type StructureType = 'wall' | 'lwall' | 'cover' | 'crates' | 'pillar' | 'platform';

interface Rect {
  x0: number;
  z0: number;
  x1: number; // exclusive
  z1: number; // exclusive
}

class ArenaBuilder {
  readonly n: number;
  readonly heights: Float32Array;
  readonly kinds: Uint8Array;
  /** Cells claimed by structures (in the source region) incl. reserved landings. */
  readonly occupied: Uint8Array;
  readonly region: Rect;

  constructor(
    readonly opts: ArenaOptions,
    readonly symmetry: SymmetryMode,
  ) {
    this.n = opts.interiorSize + 2;
    const n = this.n;
    this.heights = new Float32Array(n * n);
    this.kinds = new Uint8Array(n * n);
    this.occupied = new Uint8Array(n * n);

    const m = opts.perimeterMargin;
    const lo = 1 + m;
    const hi = n - 1 - m; // exclusive
    const half = Math.floor(n / 2) - 1; // leave a 2-cell corridor along mirror axes
    switch (symmetry) {
      case 'none':
        this.region = { x0: lo, z0: lo, x1: hi, z1: hi };
        break;
      case 'mirrorX':
      case 'rot2':
        this.region = { x0: lo, z0: lo, x1: half, z1: hi };
        break;
      case 'mirrorXZ':
        this.region = { x0: lo, z0: lo, x1: half, z1: half };
        break;
    }
  }

  images(x: number, z: number): GridPoint[] {
    const m = this.n - 1;
    switch (this.symmetry) {
      case 'none':
        return [{ x, z }];
      case 'mirrorX':
        return [
          { x, z },
          { x: m - x, z },
        ];
      case 'rot2':
        return [
          { x, z },
          { x: m - x, z: m - z },
        ];
      case 'mirrorXZ':
        return [
          { x, z },
          { x: m - x, z },
          { x, z: m - z },
          { x: m - x, z: m - z },
        ];
    }
  }

  set(x: number, z: number, h: number, kind: CellKind): void {
    for (const p of this.images(x, z)) {
      const i = cellIndex(this.n, p.x, p.z);
      this.heights[i] = h;
      this.kinds[i] = kind;
    }
  }

  /** True if rect (+1 padding) is inside the region, outside the centre circle, and unoccupied. */
  canPlace(r: Rect): boolean {
    const g = this.region;
    if (r.x0 < g.x0 || r.z0 < g.z0 || r.x1 > g.x1 || r.z1 > g.z1) return false;
    const c = this.n / 2;
    const clear = this.opts.centerClearRadius;
    for (let z = r.z0 - 1; z < r.z1 + 1; z++) {
      for (let x = r.x0 - 1; x < r.x1 + 1; x++) {
        if (this.occupied[cellIndex(this.n, x, z)]) return false;
      }
    }
    for (let z = r.z0; z < r.z1; z++) {
      for (let x = r.x0; x < r.x1; x++) {
        if (Math.hypot(x + 0.5 - c, z + 0.5 - c) < clear + 0.75) return false;
      }
    }
    return true;
  }

  claim(r: Rect): void {
    for (let z = r.z0; z < r.z1; z++) {
      for (let x = r.x0; x < r.x1; x++) this.occupied[cellIndex(this.n, x, z)] = 1;
    }
  }

  fill(r: Rect, h: number, kind: CellKind): void {
    for (let z = r.z0; z < r.z1; z++) {
      for (let x = r.x0; x < r.x1; x++) this.set(x, z, h, kind);
    }
  }
}

function buildBoundary(b: ArenaBuilder): void {
  const n = b.n;
  const base = b.opts.boundaryHeight;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (x !== 0 && z !== 0 && x !== n - 1 && z !== n - 1) continue;
      const i = cellIndex(n, x, z);
      // Crenellations: alternate merlons along the wall top.
      const along = x === 0 || x === n - 1 ? z : x;
      const corner = (x === 0 || x === n - 1) && (z === 0 || z === n - 1);
      b.heights[i] = corner ? base + 1.5 : base + (along % 4 < 2 ? 0.5 : 0);
      b.kinds[i] = CellKind.Boundary;
    }
  }
}

function tryPlaceStructure(b: ArenaBuilder, rng: SeededRandom, type: StructureType): boolean {
  const g = b.region;
  const rx = (w: number) => rng.int(g.x0, Math.max(g.x0, g.x1 - w));
  const rz = (d: number) => rng.int(g.z0, Math.max(g.z0, g.z1 - d));

  switch (type) {
    case 'wall': {
      const len = rng.int(3, 6);
      const horizontal = rng.chance(0.5);
      const w = horizontal ? len : 1;
      const d = horizontal ? 1 : len;
      const r = { x0: rx(w), z0: rz(d), x1: 0, z1: 0 };
      r.x1 = r.x0 + w;
      r.z1 = r.z0 + d;
      if (!b.canPlace(r)) return false;
      b.claim(r);
      const h = rng.pick([2.5, 3, 3, 3.5]);
      b.fill(r, h, CellKind.Wall);
      // Broken ruin: knock a gap or lower section into longer walls for peeking.
      if (len >= 5 && rng.chance(0.6)) {
        const k = rng.int(1, len - 2);
        const gx = horizontal ? r.x0 + k : r.x0;
        const gz = horizontal ? r.z0 : r.z0 + k;
        b.set(gx, gz, rng.chance(0.5) ? 1 : 1.5, CellKind.Cover);
      }
      return true;
    }
    case 'lwall': {
      const a = rng.int(3, 5);
      const c = rng.int(3, 5);
      const r = { x0: rx(a), z0: rz(c), x1: 0, z1: 0 };
      r.x1 = r.x0 + a;
      r.z1 = r.z0 + c;
      if (!b.canPlace(r)) return false;
      b.claim(r);
      const h = rng.pick([2.5, 3, 3.5]);
      const flipX = rng.chance(0.5);
      const flipZ = rng.chance(0.5);
      const row = flipZ ? r.z1 - 1 : r.z0;
      const col = flipX ? r.x1 - 1 : r.x0;
      for (let x = r.x0; x < r.x1; x++) b.set(x, row, h, CellKind.Wall);
      for (let z = r.z0; z < r.z1; z++) b.set(col, z, h, CellKind.Wall);
      return true;
    }
    case 'cover': {
      const horizontal = rng.chance(0.5);
      const len = rng.int(1, 3);
      const thick = rng.int(1, 2);
      const w = horizontal ? len : thick;
      const d = horizontal ? thick : len;
      const r = { x0: rx(w), z0: rz(d), x1: 0, z1: 0 };
      r.x1 = r.x0 + w;
      r.z1 = r.z0 + d;
      if (!b.canPlace(r)) return false;
      b.claim(r);
      b.fill(r, rng.pick([1, 1, 1.5]), CellKind.Cover);
      return true;
    }
    case 'crates': {
      const r = { x0: rx(2), z0: rz(2), x1: 0, z1: 0 };
      r.x1 = r.x0 + 2;
      r.z1 = r.z0 + 2;
      if (!b.canPlace(r)) return false;
      b.claim(r);
      for (let z = r.z0; z < r.z1; z++) {
        for (let x = r.x0; x < r.x1; x++) {
          if (rng.chance(0.2)) continue;
          b.set(x, z, rng.pick([1, 1, 1.5, 2]), CellKind.Cover);
        }
      }
      return true;
    }
    case 'pillar': {
      const s = rng.chance(0.65) ? 1 : 2;
      const r = { x0: rx(s), z0: rz(s), x1: 0, z1: 0 };
      r.x1 = r.x0 + s;
      r.z1 = r.z0 + s;
      if (!b.canPlace(r)) return false;
      b.claim(r);
      b.fill(r, rng.pick([3, 3.5, 4, 4.5, 5]), CellKind.Pillar);
      return true;
    }
    case 'platform': {
      const w = rng.int(3, 5);
      const d = rng.int(3, 5);
      const dir = rng.int(0, 3); // 0:+x 1:-x 2:+z 3:-z
      const stairLen = 4; // 3 steps + landing
      const px = rx(w + (dir < 2 ? stairLen : 0));
      const pz = rz(d + (dir >= 2 ? stairLen : 0));
      const plat: Rect = {
        x0: dir === 1 ? px + stairLen : px,
        z0: dir === 3 ? pz + stairLen : pz,
        x1: 0,
        z1: 0,
      };
      plat.x1 = plat.x0 + w;
      plat.z1 = plat.z0 + d;
      const bounds: Rect = {
        x0: Math.min(plat.x0, dir === 1 ? plat.x0 - stairLen : plat.x0),
        z0: Math.min(plat.z0, dir === 3 ? plat.z0 - stairLen : plat.z0),
        x1: Math.max(plat.x1, dir === 0 ? plat.x1 + stairLen : plat.x1),
        z1: Math.max(plat.z1, dir === 2 ? plat.z1 + stairLen : plat.z1),
      };
      if (!b.canPlace(bounds)) return false;
      b.claim(bounds);
      b.fill(plat, PLATFORM_HEIGHT, CellKind.Platform);
      const sideLen = dir < 2 ? d : w;
      const sw = Math.min(2, sideLen);
      const offset = Math.floor((sideLen - sw) / 2);
      for (let k = 1; k <= 3; k++) {
        const h = PLATFORM_HEIGHT - 0.5 * k;
        for (let s = 0; s < sw; s++) {
          let x = 0;
          let z = 0;
          if (dir === 0) [x, z] = [plat.x1 - 1 + k, plat.z0 + offset + s];
          else if (dir === 1) [x, z] = [plat.x0 - k, plat.z0 + offset + s];
          else if (dir === 2) [x, z] = [plat.x0 + offset + s, plat.z1 - 1 + k];
          else [x, z] = [plat.x0 + offset + s, plat.z0 - k];
          b.set(x, z, h, CellKind.Stair);
        }
      }
      return true;
    }
  }
}

function placeStructures(b: ArenaBuilder, rng: SeededRandom): void {
  const g = b.region;
  const regionArea = (g.x1 - g.x0) * (g.z1 - g.z0);
  const targetCells = regionArea * rng.range(0.2, 0.28);
  const maxPlatforms = b.symmetry === 'mirrorXZ' ? 1 : b.symmetry === 'none' ? 3 : 2;
  let platforms = 0;

  // Always try to place at least one platform first so the arena has verticality.
  for (let i = 0; i < 30 && platforms === 0; i++) {
    if (tryPlaceStructure(b, rng, 'platform')) platforms++;
  }

  const weights: [StructureType, number][] = [
    ['wall', 3],
    ['lwall', 2],
    ['cover', 4],
    ['crates', 2],
    ['pillar', 2],
    ['platform', 1.2],
  ];
  for (let attempt = 0; attempt < 260; attempt++) {
    let claimed = 0;
    for (let z = g.z0; z < g.z1; z++) for (let x = g.x0; x < g.x1; x++) claimed += b.occupied[cellIndex(b.n, x, z)]!;
    if (claimed >= targetCells) break;
    const [type] = rng.weighted(weights, ([t, w]) => (t === 'platform' && platforms >= maxPlatforms ? 0 : w));
    if (tryPlaceStructure(b, rng, type) && type === 'platform') platforms++;
  }
}

/** Farthest-point sampling for well-spread points. */
function spreadPick(candidates: GridPoint[], count: number, rng: SeededRandom): GridPoint[] {
  if (candidates.length === 0) return [];
  const picked: GridPoint[] = [rng.pick(candidates)];
  const minD = candidates.map((c) => Math.hypot(c.x - picked[0]!.x, c.z - picked[0]!.z));
  while (picked.length < count && picked.length < candidates.length) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (minD[i]! > bestD) {
        bestD = minD[i]!;
        best = i;
      }
    }
    if (bestD <= 0) break;
    const p = candidates[best]!;
    picked.push(p);
    for (let i = 0; i < candidates.length; i++) {
      minD[i] = Math.min(minD[i]!, Math.hypot(candidates[i]!.x - p.x, candidates[i]!.z - p.z));
    }
  }
  return picked;
}

function chooseSpawnsAndPickups(data: ArenaData, opts: ArenaOptions, rng: SeededRandom): void {
  const n = data.size;
  const reach = computeReachable(data, data.playerStart);
  const c = n / 2;
  const spawnCandidates: GridPoint[] = [];
  const pickupCandidates: GridPoint[] = [];
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const i = cellIndex(n, x, z);
      if (!reach[i]) continue;
      const dist = Math.hypot(x + 0.5 - c, z + 0.5 - c);
      const h = data.heights[i]!;
      if (h === 0 && dist >= opts.minSpawnDistance) {
        // Require a fully open 3x3 neighbourhood so enemies never spawn clipped into walls.
        let open = true;
        for (let dz = -1; dz <= 1 && open; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (data.heights[cellIndex(n, x + dx, z + dz)] !== 0) {
              open = false;
              break;
            }
          }
        }
        if (open) spawnCandidates.push({ x, z });
      }
      // Pickups: on reachable floor or platform tops, moderately far from centre.
      if ((h === 0 || data.kinds[i] === CellKind.Platform) && dist > 4 && dist < 17) pickupCandidates.push({ x, z });
    }
  }
  data.spawnPoints = spreadPick(spawnCandidates, 10, rng);
  data.pickupPoints = spreadPick(pickupCandidates, 6, rng);
}

function buildDecorations(data: ArenaData, rng: SeededRandom): void {
  const n = data.size;
  const deco: DecorBox[] = [];
  const theme = data.themeId;

  // Inner faces of the boundary wall: glowing windows / strips.
  const faces: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let k = 2; k < n - 2; k++) {
    faces.push({ x: 1, z: k + 0.5, nx: 1, nz: 0 });
    faces.push({ x: n - 1, z: k + 0.5, nx: -1, nz: 0 });
    faces.push({ x: k + 0.5, z: 1, nx: 0, nz: 1 });
    faces.push({ x: k + 0.5, z: n - 1, nx: 0, nz: -1 });
  }
  const t = 0.06;
  const flush = (f: (typeof faces)[number], y: number, along: number, height: number, depth: number, slot: DecorBox['slot']) => {
    const alongX = f.nx === 0;
    deco.push({
      x: f.x + f.nx * depth * 0.5,
      y,
      z: f.z + f.nz * depth * 0.5,
      sx: alongX ? along : depth,
      sy: height,
      sz: alongX ? depth : along,
      slot,
    });
  };

  for (const f of faces) {
    const k = Math.floor(f.nx === 0 ? f.x : f.z);
    if (theme === 'neon') {
      flush(f, 1.25, 1.001, 0.12, t, 'glow2');
      flush(f, 4.2, 1.001, 0.1, t, 'glow');
      if (k % 6 === 0) flush(f, 2.6, 0.18, 2.4, t, 'glow');
    } else if (theme === 'industrial') {
      flush(f, 3.9, 1.001, 0.32, 0.36, 'trim'); // pipe run
      if (k % 2 === 0) flush(f, 0.18, 1.001, 0.36, t, 'accent'); // hazard stripe
      if (k % 7 === 3) flush(f, 2.8, 0.7, 0.45, t, 'glow');
    } else if (theme === 'frozen') {
      if (k % 5 === 2) flush(f, 2.9, 0.6, 0.9, t, 'glow');
      if (rng.chance(0.25)) flush(f, 4.8, 0.3, rng.range(0.4, 1), 0.3, 'glow2');
    } else {
      if (k % 5 === 2) flush(f, 2.9, 0.5, 0.8, t, 'glow'); // lit window
      if (k % 9 === 6) flush(f, 2.4, 0.8, 1.8, t, 'accent'); // banner
      if (k % 9 === 6) flush(f, 3.5, 0.18, 0.3, 0.25, 'glow2'); // torch
    }
  }

  // Lit windows on tall interior walls (flush, so they never interfere with collision).
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const i = cellIndex(n, x, z);
      const h = data.heights[i]!;
      if (h < 3 || data.kinds[i] === CellKind.Boundary) continue;
      if (!rng.chance(0.18)) continue;
      const sides: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dz] of sides) {
        if (data.heights[cellIndex(n, x + dx, z + dz)]! > 0.5) continue;
        const fx = dx === 0 ? x + 0.5 : dx > 0 ? x + 1 : x;
        const fz = dz === 0 ? z + 0.5 : dz > 0 ? z + 1 : z;
        const alongX = dx === 0;
        deco.push({
          x: fx + dx * t * 0.5,
          y: h - 0.8,
          z: fz + dz * t * 0.5,
          sx: alongX ? 0.45 : t,
          sy: 0.6,
          sz: alongX ? t : 0.45,
          slot: theme === 'neon' && rng.chance(0.5) ? 'glow2' : 'glow',
        });
        break;
      }
    }
  }

  // Backdrop skyline outside the walls (unreachable, purely atmospheric).
  const c = n / 2;
  const towers = 26;
  for (let k = 0; k < towers; k++) {
    const ang = (k / towers) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const dist = c + rng.range(4, 22);
    const w = rng.range(3, 7);
    const d = rng.range(3, 7);
    const h = rng.range(6, theme === 'neon' ? 26 : 18);
    const x = c + Math.cos(ang) * dist;
    const z = c + Math.sin(ang) * dist;
    deco.push({ x, y: h / 2 - 2, z, sx: w, sy: h + 4, sz: d, slot: rng.chance(0.5) ? 'backdrop' : 'backdropDark' });
    // Spire / battlement cap.
    if (rng.chance(0.6)) deco.push({ x, y: h + 0.6, z, sx: w * 0.5, sy: 1.2 + rng.range(0, 3), sz: d * 0.5, slot: 'backdropDark' });
    // Windows facing the arena centre.
    const fx = -Math.cos(ang);
    const fz = -Math.sin(ang);
    const faceX = Math.abs(fx) > Math.abs(fz);
    const rows = Math.floor(h / 2.2);
    for (let r = 1; r < rows; r++) {
      if (!rng.chance(0.45)) continue;
      const off = rng.range(-0.3, 0.3);
      deco.push({
        x: x + (faceX ? Math.sign(fx) * (w / 2 + 0.03) : off * w),
        y: r * 2.2,
        z: z + (faceX ? off * d : Math.sign(fz) * (d / 2 + 0.03)),
        sx: faceX ? 0.06 : 0.7,
        sy: 0.9,
        sz: faceX ? 0.7 : 0.06,
        slot: theme === 'neon' && rng.chance(0.5) ? 'glow2' : 'glow',
      });
    }
  }
  data.decorations = deco;
}

function generateOnce(seed: number, attempt: number, opts: ArenaOptions): ArenaData {
  const rng = new SeededRandom((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0);
  const layoutRng = rng.fork('layout');
  const decoRng = rng.fork('decor');
  const pointRng = rng.fork('points');
  const themeId: ThemeId = opts.themeId ?? rng.pick(THEME_IDS);
  const symmetry = layoutRng.weighted<SymmetryMode>(['none', 'mirrorX', 'mirrorXZ', 'rot2'], (s) =>
    s === 'none' ? 2 : s === 'mirrorXZ' ? 2 : 1.5,
  );

  const b = new ArenaBuilder(opts, symmetry);
  buildBoundary(b);
  placeStructures(b, layoutRng);

  const c = Math.floor(b.n / 2);
  const data: ArenaData = {
    seed,
    themeId,
    symmetry,
    size: b.n,
    heights: b.heights,
    kinds: b.kinds,
    playerStart: { x: c, z: c },
    spawnPoints: [],
    pickupPoints: [],
    decorations: [],
    attempts: attempt + 1,
  };

  fillUnreachablePockets(data, computeReachable(data, data.playerStart));
  chooseSpawnsAndPickups(data, opts, pointRng);
  buildDecorations(data, decoRng);
  return data;
}

/** Generates a validated arena. Deterministic for a given seed + options. */
export function generateArena(seed: number, opts: ArenaOptions): ArenaData {
  let last: ArenaData | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const data = generateOnce(seed, attempt, opts);
    const result = validateArena(data, { centerClearRadius: opts.centerClearRadius, minSpawnPoints: 6 });
    if (result.ok) return data;
    last = data;
  }
  // Extremely unlikely; fall back to the last attempt with structures cleared so the run can start.
  const data = last!;
  for (let i = 0; i < data.kinds.length; i++) {
    if (data.kinds[i] !== CellKind.Boundary) {
      data.kinds[i] = CellKind.Floor;
      data.heights[i] = 0;
    }
  }
  chooseSpawnsAndPickups(data, opts, new SeededRandom(seed));
  return data;
}
