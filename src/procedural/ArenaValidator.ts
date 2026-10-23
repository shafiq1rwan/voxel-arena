import { CellKind, STEP_HEIGHT, cellIndex, type ArenaData, type GridPoint } from './ArenaTypes';

/**
 * Validation and repair for generated arenas. Guarantees that every floor area the player or
 * enemies can stand on is connected, and that the layout leaves enough open space for combat.
 */

export function canTraverse(data: ArenaData, ax: number, az: number, bx: number, bz: number): boolean {
  const n = data.size;
  if (bx < 0 || bz < 0 || bx >= n || bz >= n) return false;
  const kb = data.kinds[cellIndex(n, bx, bz)]!;
  if (kb === CellKind.Boundary) return false;
  const ha = data.heights[cellIndex(n, ax, az)]!;
  const hb = data.heights[cellIndex(n, bx, bz)]!;
  return Math.abs(ha - hb) <= STEP_HEIGHT;
}

const DIRS4: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Flood fill over walkable transitions (step <= STEP_HEIGHT). Returns 1 for reachable cells. */
export function computeReachable(data: ArenaData, start: GridPoint): Uint8Array {
  const n = data.size;
  const reach = new Uint8Array(n * n);
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  const s = cellIndex(n, start.x, start.z);
  reach[s] = 1;
  queue[tail++] = s;
  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % n;
    const z = (idx - x) / n;
    for (const [dx, dz] of DIRS4) {
      const nx = x + dx;
      const nz = z + dz;
      if (!canTraverse(data, x, z, nx, nz)) continue;
      const ni = cellIndex(n, nx, nz);
      if (reach[ni]) continue;
      reach[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return reach;
}

/**
 * Turns enclosed, unreachable floor pockets into solid filler blocks so enemies can never spawn
 * or path into them and the player can't see "dead" floor. Returns number of cells filled.
 */
export function fillUnreachablePockets(data: ArenaData, reach: Uint8Array): number {
  const n = data.size;
  const visited = new Uint8Array(n * n);
  let filled = 0;
  const stack: number[] = [];
  const component: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (reach[i] || visited[i] || data.kinds[i] !== CellKind.Floor) continue;
    // Gather the connected pocket of unreachable floor cells.
    component.length = 0;
    stack.push(i);
    visited[i] = 1;
    let rimHeight = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      component.push(idx);
      const x = idx % n;
      const z = (idx - x) / n;
      for (const [dx, dz] of DIRS4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = cellIndex(n, nx, nz);
        if (data.kinds[ni] === CellKind.Floor && !reach[ni]) {
          if (!visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        } else if (data.kinds[ni] !== CellKind.Boundary) {
          rimHeight = Math.max(rimHeight, data.heights[ni]!);
        }
      }
    }
    const h = Math.max(1, rimHeight);
    for (const idx of component) {
      data.heights[idx] = h;
      data.kinds[idx] = CellKind.Filler;
      filled++;
    }
  }
  return filled;
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
  reachableFloorRatio: number;
  tallCellRatio: number;
}

export function validateArena(data: ArenaData, opts: { centerClearRadius: number; minSpawnPoints: number }): ValidationResult {
  const n = data.size;
  const reasons: string[] = [];
  const reach = computeReachable(data, data.playerStart);

  let interior = 0;
  let reachableFloor = 0;
  let tall = 0;
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const i = cellIndex(n, x, z);
      interior++;
      if (reach[i] && data.heights[i] === 0) reachableFloor++;
      if (data.heights[i]! >= 2.5) tall++;
    }
  }
  const reachableFloorRatio = reachableFloor / interior;
  const tallCellRatio = tall / interior;
  if (reachableFloorRatio < 0.55) reasons.push(`too little reachable floor (${reachableFloorRatio.toFixed(2)})`);
  if (tallCellRatio > 0.22) reasons.push(`too many sight-blocking cells (${tallCellRatio.toFixed(2)})`);

  // Centre must be open.
  const c = n / 2;
  const r = opts.centerClearRadius;
  for (let z = Math.floor(c - r); z <= Math.ceil(c + r); z++) {
    for (let x = Math.floor(c - r); x <= Math.ceil(c + r); x++) {
      if (Math.hypot(x + 0.5 - c, z + 0.5 - c) > r) continue;
      if (data.heights[cellIndex(n, x, z)] !== 0) {
        reasons.push('centre not clear');
        x = Infinity;
        z = Infinity;
      }
    }
  }

  // Player start must be on open, reachable floor.
  const si = cellIndex(n, data.playerStart.x, data.playerStart.z);
  if (data.heights[si] !== 0 || data.kinds[si] !== CellKind.Floor) reasons.push('unsafe player start');

  // Every spawn must be reachable floor away from the player.
  for (const sp of data.spawnPoints) {
    const i = cellIndex(n, sp.x, sp.z);
    if (!reach[i] || data.heights[i] !== 0) reasons.push(`invalid spawn ${sp.x},${sp.z}`);
  }
  if (data.spawnPoints.length < opts.minSpawnPoints) reasons.push('not enough spawn points');

  for (const p of data.pickupPoints) {
    if (!reach[cellIndex(n, p.x, p.z)]) reasons.push(`unreachable pickup ${p.x},${p.z}`);
  }

  return { ok: reasons.length === 0, reasons, reachableFloorRatio, tallCellRatio };
}
